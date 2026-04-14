import { chromium } from "playwright";

const browserState = {
  browser: null,
  userContexts: new Map()
};

async function getBrowser() {
  if (!browserState.browser) {
    browserState.browser = await chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-sandbox"]
    });
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
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://www.bing.com");

  const session = {
    context,
    pages: [{ tabId: crypto.randomUUID(), page, url: page.url(), title: "Start Page" }],
    activeTabId: null
  };

  session.activeTabId = session.pages[0].tabId;
  browserState.userContexts.set(userId, session);
  return session;
}

export async function openTab(userId, url) {
  const session = await getOrCreateUserSession(userId);
  const page = await session.context.newPage();
  await page.goto(url);

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

  await session.pages[index].page.close();
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
    activeTabId
  };

  browserState.userContexts.set(userId, session);
  return session;
}
