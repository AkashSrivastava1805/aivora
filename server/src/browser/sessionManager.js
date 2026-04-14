import { chromium } from "playwright";

const browserState = {
  browser: null,
  userContexts: new Map(),
  runtimeMode: "playwright"
};

function isPlaywrightExecutableMissing(error) {
  return String(error?.message || "").includes("Executable doesn't exist");
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
      pages: [{ tabId: crypto.randomUUID(), page: null, url: fallbackUrl, title: inferTitleFromUrl(fallbackUrl) }],
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
    pages: [{ tabId: crypto.randomUUID(), page, url: page.url(), title: "Start Page" }],
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
      tabId: crypto.randomUUID(),
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
    tabId: crypto.randomUUID(),
    page,
    url: page.url(),
    title: await page.title()
  };
  session.pages.push(tab);
  session.activeTabId = tab.tabId;
  return tab;
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
        tabId: tab.tabId || crypto.randomUUID(),
        page: null,
        url: resolved,
        title: tab.title || inferTitleFromUrl(resolved)
      };
    });

    if (rebuiltPages.length === 0) {
      const fallbackUrl = "https://www.bing.com";
      rebuiltPages.push({
        tabId: crypto.randomUUID(),
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
      tabId: crypto.randomUUID(),
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
  await getBrowser();
  return {
    mode: browserState.runtimeMode,
    isPlaywright: browserState.runtimeMode === "playwright"
  };
}
