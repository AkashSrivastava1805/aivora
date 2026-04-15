import { analyzeTabs } from "../ai/tabOptimizer.js";
import { getSmartSearchResults } from "../ai/geminiSearch.js";
import {
  closeTab,
  getEngineRuntimeStatus,
  navigateActiveTab,
  openTab,
  reconcileUserSession,
  switchTab
} from "../browser/sessionManager.js";
import { BrowserSession } from "../models/BrowserSession.js";
import { History } from "../models/History.js";
import { SearchCache } from "../models/SearchCache.js";
import { recordStudentEvent } from "../utils/studentMonitoring.js";

async function upsertBrowserSession(userId, tabData, activeTabId) {
  return BrowserSession.findOneAndUpdate(
    { userId },
    { userId, tabs: tabData, updatedAt: new Date() },
    { upsert: true, new: true }
  ).then((session) => {
    session.activeTabId = activeTabId;
    return session;
  });
}

function mapTabsWithActive(tabs = [], activeTabId = null) {
  return tabs.map((tab) => ({
    ...tab,
    isActive: tab.tabId === activeTabId
  }));
}

function isMicrosoftBingUrl(rawUrl = "") {
  try {
    const host = new URL(String(rawUrl)).hostname.toLowerCase();
    return host.includes("bing.com") || host.includes("microsoft.com") || host.includes("msn.com");
  } catch (_error) {
    return false;
  }
}

export async function openTabController(req, res, next) {
  try {
    const { url } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ message: "URL is required to open a tab" });
    }

    const tab = await openTab(String(req.user._id), url);

    const currentSession = await BrowserSession.findOne({ userId: req.user._id });
    const newTab = {
      tabId: tab.tabId,
      url: tab.url,
      title: tab.title,
      isActive: true,
      lastInteractionAt: new Date(),
      estimatedRamMb: Math.floor(Math.random() * 100 + 80),
      estimatedCpuPct: Math.floor(Math.random() * 30 + 10)
    };
    const mergedTabs = [...(currentSession?.tabs?.map((t) => t.toObject()) || []), newTab];
    const normalizedTabs = mapTabsWithActive(mergedTabs, newTab.tabId);
    const session = await upsertBrowserSession(req.user._id, normalizedTabs, newTab.tabId);

    await History.findOneAndUpdate(
      { userId: req.user._id },
      { $push: { visitedUrls: { url, title: tab.title, blocked: false, durationSeconds: 0 } } },
      { upsert: true, new: true }
    );

    await recordStudentEvent(req, {
      type: "OPEN_TAB",
      status: "allowed",
      details: `Opened tab: ${tab.url}`
    });

    res.json({
      tab,
      tabs: session.tabs,
      activeTabId: newTab.tabId,
      aiActions: analyzeTabs(session.tabs)
    });
  } catch (error) {
    if (String(error?.message || "").includes("Executable doesn't exist")) {
      return res.status(503).json({
        message: "Cloud browser is not installed on server. Run: npx playwright install"
      });
    }
    next(error);
  }
}

export async function navigateActiveTabController(req, res, next) {
  try {
    const { url } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ message: "URL is required" });
    }

    const { tab, createdNewTab, timedOut } = await navigateActiveTab(String(req.user._id), url);

    const currentSession = await BrowserSession.findOne({ userId: req.user._id });
    const existingTabs = currentSession?.tabs?.map((t) => t.toObject()) || [];

    // If we had to create a new tab (no active existed), append it; else update active tab.
    const updatedTabs = createdNewTab
      ? [
          ...existingTabs,
          {
            tabId: tab.tabId,
            url: tab.url,
            title: tab.title,
            isActive: true,
            lastInteractionAt: new Date(),
            estimatedRamMb: Math.floor(Math.random() * 100 + 80),
            estimatedCpuPct: Math.floor(Math.random() * 30 + 10)
          }
        ]
      : existingTabs.map((t) =>
          t.tabId === (currentSession?.tabs?.find((x) => x.isActive)?.tabId || tab.tabId)
            ? { ...t, url: tab.url, title: tab.title, lastInteractionAt: new Date() }
            : t
        );

    const nextActiveTabId =
      currentSession?.tabs?.find((x) => x.isActive)?.tabId || tab.tabId || updatedTabs[0]?.tabId || null;
    const normalizedTabs = mapTabsWithActive(updatedTabs, nextActiveTabId);
    const session = await upsertBrowserSession(req.user._id, normalizedTabs, nextActiveTabId);

    await History.findOneAndUpdate(
      { userId: req.user._id },
      { $push: { visitedUrls: { url: tab.url, title: tab.title, blocked: false, durationSeconds: 0 } } },
      { upsert: true, new: true }
    );

    await recordStudentEvent(req, {
      type: "NAVIGATE_ACTIVE_TAB",
      status: "allowed",
      details: `Navigated active tab: ${tab.url}`
    });

    res.json({
      tab,
      tabs: session.tabs,
      activeTabId: nextActiveTabId,
      aiActions: analyzeTabs(session.tabs),
      navigationWarning: timedOut
        ? "Destination is slow to respond. Opened anyway; content may continue loading."
        : null
    });
  } catch (error) {
    if (String(error?.message || "").includes("Executable doesn't exist")) {
      return res.status(503).json({
        message: "Cloud browser is not installed on server. Run: npx playwright install"
      });
    }
    next(error);
  }
}

export async function closeTabController(req, res, next) {
  try {
    const { tabId } = req.body;
    if (!tabId) return res.status(400).json({ message: "tabId is required" });
    await closeTab(String(req.user._id), tabId);

    const session = await BrowserSession.findOne({ userId: req.user._id });
    if (!session) return res.json({ success: true, tabs: [], activeTabId: null, aiActions: [] });

    const remainingTabs = session.tabs.filter((entry) => entry.tabId !== tabId).map((entry) => entry.toObject());
    const nextActiveTabId = remainingTabs[0]?.tabId || null;
    const normalizedTabs = mapTabsWithActive(remainingTabs, nextActiveTabId);
    const updated = await upsertBrowserSession(req.user._id, normalizedTabs, nextActiveTabId);

    res.json({
      success: true,
      tabs: updated.tabs,
      activeTabId: nextActiveTabId,
      aiActions: analyzeTabs(updated?.tabs || [])
    });
  } catch (error) {
    next(error);
  }
}

export async function switchTabController(req, res, next) {
  try {
    const { tabId } = req.body;
    if (!tabId) return res.status(400).json({ message: "tabId is required" });
    const switchResult = await switchTab(String(req.user._id), tabId);

    const session = await BrowserSession.findOne({ userId: req.user._id });
    if (!session) {
      return res.status(404).json({ message: "No browser session found" });
    }

    const targetTab = session.tabs.find((tab) => tab.tabId === tabId);
    if (!targetTab) {
      return res.status(404).json({ message: "Tab not found. It may already be closed." });
    }

    if (session) {
      session.tabs = session.tabs.map((tab) => ({
        ...tab.toObject(),
        isActive: tab.tabId === tabId,
        lastInteractionAt: new Date()
      }));
      await upsertBrowserSession(req.user._id, session.tabs, tabId);
    }

    await recordStudentEvent(req, {
      type: "SWITCH_TAB",
      status: "allowed",
      details: `Switched to tab: ${targetTab.url}`
    });

    res.json({
      active: switchResult.tab || targetTab,
      tabs: session?.tabs || [],
      activeTabId: tabId,
      aiActions: analyzeTabs(session?.tabs || [])
    });
  } catch (error) {
    next(error);
  }
}

export async function searchController(req, res, next) {
  try {
    const { query, page = 1, limit = 6 } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ message: "Search query is required" });
    }

    const cleanedQuery = query.trim();
    const pageNum = Math.max(1, Number(page) || 1);
    const perPage = Math.max(1, Math.min(10, Number(limit) || 6));
    const start = (pageNum - 1) * perPage;
    const end = start + perPage;

    const normalizedQuery = cleanedQuery.toLowerCase();
    const cacheWindowMs = 15 * 60 * 1000;
    const existingCache = await SearchCache.findOne({
      userId: req.user._id,
      query: normalizedQuery
    });

    let allResults = existingCache?.results || [];
    let fromCache = false;

    if (existingCache && Date.now() - new Date(existingCache.updatedAt).getTime() <= cacheWindowMs) {
      fromCache = true;
    } else {
      allResults = await getSmartSearchResults(cleanedQuery);
      await SearchCache.findOneAndUpdate(
        { userId: req.user._id, query: normalizedQuery },
        { $set: { results: allResults } },
        { upsert: true, new: true }
      );
    }

    // User requirement: show only Microsoft/Bing website results.
    const bingOnlyResults = allResults.filter((item) => isMicrosoftBingUrl(item?.url));
    const pagedResults = bingOnlyResults.slice(start, end);
    const hasMore = end < bingOnlyResults.length;
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(cleanedQuery)}`;

    if (pageNum === 1) {
      await History.findOneAndUpdate(
        { userId: req.user._id },
        { $push: { searches: { query: cleanedQuery, blocked: false } } },
        { upsert: true, new: true }
      );

      await recordStudentEvent(req, {
        type: "SEARCH",
        status: "allowed",
        details: `Searched query: ${cleanedQuery}`
      });
    }

    res.json({
      query: cleanedQuery,
      searchUrl,
      suggestions: pagedResults.map((item) => item.title),
      results: pagedResults,
      page: pageNum,
      limit: perPage,
      hasMore,
      fromCache,
      provider: "bing-only"
    });
  } catch (error) {
    next(error);
  }
}

export async function getRecentSearchesController(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 6));
    const history = await History.findOne({ userId: req.user._id });
    const searches = (history?.searches || [])
      .slice()
      .reverse()
      .filter((entry) => !entry.blocked)
      .slice(0, limit)
      .map((entry) => ({
        query: entry.query,
        createdAt: entry.createdAt
      }));

    res.json({ searches });
  } catch (error) {
    next(error);
  }
}

export async function getTabsController(req, res, next) {
  try {
    const session = await BrowserSession.findOne({ userId: req.user._id });
    const tabs = session?.tabs || [];
    const active = tabs.find((tab) => tab.isActive) || null;
    res.json({
      tabs,
      activeTabId: active?.tabId || null
    });
  } catch (error) {
    next(error);
  }
}

export async function reconcileTabsController(req, res, next) {
  try {
    const session = await BrowserSession.findOne({ userId: req.user._id });
    const persistedTabs = (session?.tabs || []).map((tab) => tab.toObject());
    const persistedActiveTabId = persistedTabs.find((tab) => tab.isActive)?.tabId || null;

    const rebuilt = await reconcileUserSession(String(req.user._id), persistedTabs, persistedActiveTabId);
    const rebuiltTabs = rebuilt.pages.map((tab) => ({
      tabId: tab.tabId,
      url: tab.url,
      title: tab.title,
      isActive: tab.tabId === rebuilt.activeTabId,
      isSuspended: false,
      lastInteractionAt: new Date(),
      estimatedRamMb: 0,
      estimatedCpuPct: 0
    }));

    const updated = await upsertBrowserSession(req.user._id, rebuiltTabs, rebuilt.activeTabId);

    res.json({
      message: "Tab session reconciled from persisted state",
      tabs: updated.tabs,
      activeTabId: rebuilt.activeTabId
    });
  } catch (error) {
    next(error);
  }
}

export async function getEngineStatusController(req, res, next) {
  try {
    const status = await getEngineRuntimeStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
}

export async function validateUrlController(req, res) {
  // If this controller executes, restriction middleware allowed the request.
  return res.json({ allowed: true });
}
