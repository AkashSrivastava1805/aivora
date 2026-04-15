import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const browserState = {
  browser: null,
  userContexts: new Map(),
  runtimeMode: "playwright"
};

function isPlaywrightExecutableMissing(error) {
  const msg = String(error?.message || "");
  // Playwright not installed / binary missing
  if (msg.includes("Executable doesn't exist")) return true;
  // Linux deps missing (common on fresh Ubuntu servers/containers)
  if (msg.includes("error while loading shared libraries")) return true;
  if (msg.includes("libatk-1.0.so.0")) return true;
  if (msg.includes("libatk-bridge-2.0.so.0")) return true;
  if (msg.includes("libgbm.so.1")) return true;
  if (msg.includes("libnss3.so")) return true;
  if (msg.includes("libxkbcommon.so")) return true;
  return false;
}

function normalizeUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "https://www.bing.com";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}

function inferTitleFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || "New Tab";
  } catch (_error) {
    return "New Tab";
  }
}

async function getBrowser() {
  if (!browserState.browser) {
    try {
      browserState.browser = await chromium.launch({
        headless: true,
        args: ["--disable-dev-shm-usage", "--no-sandbox"]
      });
      browserState.runtimeMode = "playwright";
    } catch (error) {
      if (isPlaywrightExecutableMissing(error)) {
        browserState.runtimeMode = "virtual";
        return null;
      }
      throw error;
    }
  }
  return browserState.browser;
}

async function disposeUserSession(userId) {
  const existing = browserState.userContexts.get(userId);
  if (!existing) return;
  try {
    await existing.context.close();
  } catch (_error) {
    // Ignore close errors during reconciliation cleanup.
  }
  browserState.userContexts.delete(userId);
}

export async function getOrCreateUserSession(userId) {
  const existing = browserState.userContexts.get(userId);
  if (existing) return existing;

  const browser = await getBrowser();
  if (!browser) {
    const fallbackUrl = "https://www.bing.com";
    const session = {
      context: null,
      pages: [{ tabId: randomUUID(), page: null, url: fallbackUrl, title: inferTitleFromUrl(fallbackUrl) }],
      activeTabId: null,
      mode: "virtual"
    };
    session.activeTabId = session.pages[0].tabId;
    browserState.userContexts.set(userId, session);
    return session;
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://www.bing.com");

  const session = {
    context,
    pages: [{ tabId: randomUUID(), page, url: page.url(), title: "Start Page" }],
    activeTabId: null,
    mode: "playwright"
  };

  session.activeTabId = session.pages[0].tabId;
  browserState.userContexts.set(userId, session);
  return session;
}

export async function openTab(userId, url) {
  const session = await getOrCreateUserSession(userId);
  if (!session.context) {
    const resolved = normalizeUrl(url);
    const tab = {
      tabId: randomUUID(),
      page: null,
      url: resolved,
      title: inferTitleFromUrl(resolved)
    };
    session.pages.push(tab);
    session.activeTabId = tab.tabId;
    return tab;
  }

  const page = await session.context.newPage();
  await page.goto(normalizeUrl(url));

  const tab = {
    tabId: randomUUID(),
    page,
    url: page.url(),
    title: await page.title()
  };
  session.pages.push(tab);
  session.activeTabId = tab.tabId;
  return tab;
}

export async function navigateActiveTab(userId, url) {
  const session = await getOrCreateUserSession(userId);
  const resolved = normalizeUrl(url);
  const active = session.pages.find((tab) => tab.tabId === session.activeTabId) || null;
  if (!active) {
    // No active tab exists yet; fall back to opening one.
    const tab = await openTab(userId, resolved);
    return { tab, session, createdNewTab: true };
  }

  // Virtual mode: update metadata only.
  if (!active.page) {
    active.url = resolved;
    active.title = inferTitleFromUrl(resolved);
    return { tab: active, session, createdNewTab: false };
  }

  await active.page.goto(resolved, { waitUntil: "domcontentloaded", timeout: 20000 });
  active.url = active.page.url();
  active.title = await active.page.title();
  return { tab: active, session, createdNewTab: false };
}

export async function closeTab(userId, tabId) {
  const session = await getOrCreateUserSession(userId);
  const index = session.pages.findIndex((tab) => tab.tabId === tabId);
  if (index === -1) {
    return { session, found: false };
  }

  if (session.pages[index].page) {
    await session.pages[index].page.close();
  }
  session.pages.splice(index, 1);
  if (session.activeTabId === tabId && session.pages.length > 0) {
    session.activeTabId = session.pages[0].tabId;
  }
  return { session, found: true };
}

export async function switchTab(userId, tabId) {
  const session = await getOrCreateUserSession(userId);
  const tab = session.pages.find((entry) => entry.tabId === tabId);
  if (!tab) {
    return { tab: null, found: false };
  }
  session.activeTabId = tabId;
  return { tab, found: true };
}

export async function reconcileUserSession(userId, persistedTabs = [], persistedActiveTabId = null) {
  await disposeUserSession(userId);

  const browser = await getBrowser();
  if (!browser) {
    const rebuiltPages = (persistedTabs || []).map((tab) => {
      const resolved = normalizeUrl(tab.url);
      return {
        tabId: tab.tabId || randomUUID(),
        page: null,
        url: resolved,
        title: tab.title || inferTitleFromUrl(resolved)
      };
    });

    if (rebuiltPages.length === 0) {
      const fallbackUrl = "https://www.bing.com";
      rebuiltPages.push({
        tabId: randomUUID(),
        page: null,
        url: fallbackUrl,
        title: inferTitleFromUrl(fallbackUrl)
      });
    }

    const activeTabId =
      rebuiltPages.find((tab) => tab.tabId === persistedActiveTabId)?.tabId || rebuiltPages[0].tabId;

    const session = {
      context: null,
      pages: rebuiltPages,
      activeTabId,
      mode: "virtual"
    };
    browserState.userContexts.set(userId, session);
    return session;
  }

  const context = await browser.newContext();
  const rebuiltPages = [];

  for (const persistedTab of persistedTabs) {
    const page = await context.newPage();
    try {
      await page.goto(persistedTab.url, { waitUntil: "domcontentloaded", timeout: 15000 });
    } catch (_error) {
      await page.goto("about:blank");
    }

    rebuiltPages.push({
      tabId: persistedTab.tabId,
      page,
      url: page.url() || persistedTab.url,
      title: (await page.title()) || persistedTab.title || "Recovered Tab"
    });
  }

  if (rebuiltPages.length === 0) {
    const page = await context.newPage();
    await page.goto("https://www.bing.com");
    rebuiltPages.push({
      tabId: randomUUID(),
      page,
      url: page.url(),
      title: await page.title()
    });
  }

  const activeTabId =
    rebuiltPages.find((tab) => tab.tabId === persistedActiveTabId)?.tabId || rebuiltPages[0].tabId;

  const session = {
    context,
    pages: rebuiltPages,
    activeTabId,
    mode: "playwright"
  };

  browserState.userContexts.set(userId, session);
  return session;
}

export async function getEngineRuntimeStatus() {
  try {
    await getBrowser();
  } catch (error) {
    if (isPlaywrightExecutableMissing(error)) {
      browserState.runtimeMode = "virtual";
    } else {
      throw error;
    }
  }
  return {
    mode: browserState.runtimeMode,
    isPlaywright: browserState.runtimeMode === "playwright"
  };
}
