import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";

export default function AiTutorPage() {
  const BING_HOME_URL = "https://www.bing.com/";
  const BING_FALLBACK_URL = "https://www.bing.com/search?q=bing";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const webviewRef = useRef(null);
  const tabsRef = useRef([]);
  const toSafeHttpUrl = (rawUrl = "") => {
    const raw = String(rawUrl || "").trim();
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.toString();
      }
    } catch (_error) {
      // Fall through and try prepending https:// for plain domains.
    }
    try {
      const parsedWithScheme = new URL(`https://${raw}`);
      if (parsedWithScheme.protocol === "http:" || parsedWithScheme.protocol === "https:") {
        return parsedWithScheme.toString();
      }
    } catch (_error) {
      // Invalid URL, ignore.
    }
    return "";
  };

  const src = useMemo(() => {
    const rawParam = String(params.get("url") || "").trim();
    if (!rawParam || rawParam.toLowerCase() === "new" || rawParam.toLowerCase() === "blank") {
      return BING_HOME_URL;
    }
    return toSafeHttpUrl(rawParam) || `https://www.bing.com/search?q=${encodeURIComponent(rawParam)}`;
  }, [params, BING_HOME_URL]);
  const heading = useMemo(() => params.get("title") || "Ai tutor", [params]);
  const isElectron = Boolean(window.aivora?.platform);
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);

  function buildTabId() {
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function inferTitleFromUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "") || "New Tab";
    } catch (_error) {
      return "New Tab";
    }
  }

  function updateActiveTab(patch) {
    setTabs((prev) => prev.map((tab) => (tab.id === activeTabId ? { ...tab, ...patch } : tab)));
  }

  function openTabInApp(url, title = "") {
    const safeUrl = toSafeHttpUrl(url);
    if (!safeUrl) return;
    const nextTab = {
      id: buildTabId(),
      url: safeUrl,
      title: title || inferTitleFromUrl(safeUrl)
    };
    setTabs((prev) => [...prev, nextTab]);
    setActiveTabId(nextTab.id);
  }

  function openManualNewTab() {
    openTabInApp(BING_HOME_URL, "Bing");
  }

  function closeTab(tabId) {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((tab) => tab.id === tabId);
      if (idx === -1) return prev;
      const updated = prev.filter((tab) => tab.id !== tabId);
      if (tabId === activeTabId) {
        const fallback = updated[Math.max(0, idx - 1)] || updated[0] || null;
        setActiveTabId(fallback?.id || null);
      }
      return updated;
    });
  }

  function isBingHost(url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host.includes("bing.com") || host.includes("microsoft.com") || host.includes("msn.com");
    } catch (_error) {
      return false;
    }
  }

  function shouldOpenAsNewTab(currentUrl, nextUrl) {
    if (!currentUrl || !nextUrl) return false;
    // When user is on Bing results and clicks an external result, open it in a new in-app tab.
    return isBingHost(currentUrl) && !isBingHost(nextUrl);
  }

  function decodeBingRedirectUrl(url) {
    const safe = toSafeHttpUrl(url);
    if (!safe || !isBingHost(safe)) return safe;
    try {
      const parsed = new URL(safe);
      const candidate = parsed.searchParams.get("u") || parsed.searchParams.get("url") || parsed.searchParams.get("r");
      if (!candidate) return safe;
      if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
        return toSafeHttpUrl(candidate) || safe;
      }
      // Bing commonly prefixes with "a1" and base64-url payload.
      let payload = candidate;
      if (/^a[0-9]/i.test(payload)) payload = payload.slice(2);
      payload = payload.replace(/-/g, "+").replace(/_/g, "/");
      while (payload.length % 4 !== 0) payload += "=";
      const decoded = atob(payload);
      return toSafeHttpUrl(decoded) || safe;
    } catch (_error) {
      return safe;
    }
  }

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const firstTab = {
      id: buildTabId(),
      url: src,
      title: heading
    };
    setTabs([firstTab]);
    setActiveTabId(firstTab.id);
    setLoaded(false);
    setFailed(false);
  }, [src, heading]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    if (!isElectron) return;
    const node = webviewRef.current;
    if (!node) return;
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (!activeTab?.url || !node.loadURL) return;
    const current = typeof node.getURL === "function" ? node.getURL() : "";
    if (current !== activeTab.url) {
      node.loadURL(activeTab.url);
      setLoaded(false);
      setFailed(false);
    }
  }, [tabs, activeTabId, isElectron]);

  useEffect(() => {
    if (!isElectron) return undefined;
    const node = webviewRef.current;
    if (!node) return undefined;

    const onReady = () => setLoaded(true);
    const onFail = (event) => {
      const failedUrl = String(event?.validatedURL || "");
      // Some Bing home variants may be blocked by response policy in webview.
      // Fall back to a Bing search URL that reliably renders in-app.
      if (
        failedUrl &&
        failedUrl.startsWith(BING_HOME_URL) &&
        node?.loadURL
      ) {
        node.loadURL(BING_FALLBACK_URL);
        updateActiveTab({ url: BING_FALLBACK_URL, title: "Bing" });
        return;
      }
      setFailed(true);
    };
    const onNavigate = (event) => {
      setLoaded(true);
      setFailed(false);
      const nextUrl = toSafeHttpUrl(event?.url || "");
      if (nextUrl) {
        updateActiveTab({
          url: nextUrl
        });
      }
    };
    const normalizeInAppUrl = (url) => decodeBingRedirectUrl(toSafeHttpUrl(url) || src);
    const getCurrentActiveUrl = () => {
      const active = tabsRef.current.find((tab) => tab.id === activeTabId);
      return active?.url || "";
    };

    const onNewWindow = (event) => {
      if (event?.preventDefault) event.preventDefault();
      const nextUrl = event?.url;
      const normalized = normalizeInAppUrl(nextUrl);
      const currentUrl = getCurrentActiveUrl();
      if (!normalized) return;
      if (shouldOpenAsNewTab(currentUrl, normalized)) {
        openTabInApp(normalized, inferTitleFromUrl(normalized));
        return;
      }
      if (node?.loadURL) node.loadURL(normalized);
    };
    const onWillNavigate = (event) => {
      const nextUrl = event?.url;
      const normalized = normalizeInAppUrl(nextUrl);
      const currentUrl = getCurrentActiveUrl();
      if (shouldOpenAsNewTab(currentUrl, normalized)) {
        if (event?.preventDefault) event.preventDefault();
        openTabInApp(normalized, inferTitleFromUrl(normalized));
        return;
      }
      if (normalized !== nextUrl) {
        if (event?.preventDefault) event.preventDefault();
        if (node?.loadURL) node.loadURL(normalized);
      }
    };
    const onRedirect = (event) => {
      const nextUrl = event?.url;
      const normalized = normalizeInAppUrl(nextUrl);
      const currentUrl = getCurrentActiveUrl();
      if (!normalized) return;
      if (shouldOpenAsNewTab(currentUrl, normalized)) {
        if (node?.stop) node.stop();
        openTabInApp(normalized, inferTitleFromUrl(normalized));
      }
    };
    const onPageTitle = (event) => {
      const nextTitle = String(event?.title || "").trim();
      if (nextTitle) {
        updateActiveTab({ title: nextTitle });
      }
    };

    node.addEventListener("dom-ready", onReady);
    node.addEventListener("did-fail-load", onFail);
    node.addEventListener("did-navigate", onNavigate);
    node.addEventListener("did-navigate-in-page", onNavigate);
    node.addEventListener("new-window", onNewWindow);
    node.addEventListener("will-navigate", onWillNavigate);
    node.addEventListener("did-redirect-navigation", onRedirect);
    node.addEventListener("page-title-updated", onPageTitle);
    return () => {
      node.removeEventListener("dom-ready", onReady);
      node.removeEventListener("did-fail-load", onFail);
      node.removeEventListener("did-navigate", onNavigate);
      node.removeEventListener("did-navigate-in-page", onNavigate);
      node.removeEventListener("new-window", onNewWindow);
      node.removeEventListener("will-navigate", onWillNavigate);
      node.removeEventListener("did-redirect-navigation", onRedirect);
      node.removeEventListener("page-title-updated", onPageTitle);
    };
  }, [isElectron, src, activeTabId, BING_HOME_URL, BING_FALLBACK_URL]);

  return (
    <AppLayout title={heading}>
      <div className="ai-tutor-shell">
        <div className="ai-tutor-topbar">
          <button className="ai-tutor-back" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <div className="ai-tutor-tabs" role="tablist" aria-label="In-app browser tabs">
            {tabs.map((tab) => (
              <div key={tab.id} className={`ai-tutor-tab ${tab.id === activeTabId ? "active" : ""}`}>
                <button className="ai-tutor-tab-btn" onClick={() => setActiveTabId(tab.id)} role="tab" aria-selected={tab.id === activeTabId}>
                  {tab.title || inferTitleFromUrl(tab.url)}
                </button>
                {tabs.length > 1 ? (
                  <button className="ai-tutor-tab-close" onClick={() => closeTab(tab.id)} aria-label="Close tab">
                    ×
                  </button>
                ) : null}
              </div>
            ))}
            <button className="ai-tutor-tab-add" onClick={openManualNewTab} aria-label="Open new tab" title="New tab">
              +
            </button>
          </div>
          <div className="ai-tutor-spacer" />
        </div>

        {!loaded && !failed && <div className="ai-tutor-loading">Loading page…</div>}
        {failed && <div className="ai-tutor-loading">This page blocked in-app rendering by site policy.</div>}
        {isElectron ? (
          <webview
            ref={webviewRef}
            className="ai-tutor-frame"
            src={src}
            allowpopups="false"
          />
        ) : (
          <iframe
            className="ai-tutor-frame"
            src={src}
            title={heading}
            onLoad={() => setLoaded(true)}
            referrerPolicy="no-referrer"
            allow="clipboard-read; clipboard-write; microphone; camera"
          />
        )}
      </div>
    </AppLayout>
  );
}

