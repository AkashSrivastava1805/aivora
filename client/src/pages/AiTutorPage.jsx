import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";

const NEW_TAB_URL = "https://www.bing.com/";

function toSafeHttpUrl(rawUrl = "") {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
  } catch (_) {}
  try {
    const parsed = new URL(`https://${raw}`);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
  } catch (_) {}
  return "";
}

function inferTitleFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "New Tab";
  } catch (_) {
    return "New Tab";
  }
}

function buildTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AiTutorPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const webviewRef = useRef(null);
  const activeTabIdRef = useRef(null);
  const isElectron = Boolean(window.aivora?.platform);

  const src = useMemo(() => {
    const rawParam = String(params.get("url") || "").trim();
    if (!rawParam || rawParam.toLowerCase() === "new" || rawParam.toLowerCase() === "blank") {
      return NEW_TAB_URL;
    }
    return toSafeHttpUrl(rawParam) || `https://www.bing.com/search?q=${encodeURIComponent(rawParam)}`;
  }, [params]);

  const heading = useMemo(() => params.get("title") || "In-App Browser", [params]);

  const [tabs, setTabs] = useState(() => {
    const first = { id: buildTabId(), url: src, title: heading };
    return [first];
  });
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const [loadingTabId, setLoadingTabId] = useState(null);

  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);

  // Reset when arriving with a new URL (e.g. from search results)
  useEffect(() => {
    const first = { id: buildTabId(), url: src, title: heading };
    setTabs([first]);
    setActiveTabId(first.id);
  }, [src, heading]);

  function updateActiveTab(patch) {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabIdRef.current ? { ...t, ...patch } : t))
    );
  }

  function openTabInApp(url, title = "") {
    const safeUrl = toSafeHttpUrl(url);
    if (!safeUrl) return;
    const next = { id: buildTabId(), url: safeUrl, title: title || inferTitleFromUrl(safeUrl) };
    setTabs((prev) => [...prev, next]);
    setActiveTabId(next.id);
  }

  function closeTab(tabId) {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((t) => t.id === tabId);
      if (idx === -1) return prev;
      const updated = prev.filter((t) => t.id !== tabId);
      if (tabId === activeTabIdRef.current) {
        setActiveTabId((updated[Math.max(0, idx - 1)] || updated[0])?.id || null);
      }
      return updated;
    });
  }

  // Webview events — only wire once per mount, never re-wire on state changes
  useEffect(() => {
    if (!isElectron) return;
    const node = webviewRef.current;
    if (!node) return;

    const onReady = () => setLoadingTabId(null);
    const onFail = (e) => { if (e?.errorCode !== -3) setLoadingTabId(null); };
    // Update tab metadata but do NOT call loadURL — let webview navigate freely
    const onNavigate = (e) => {
      const url = toSafeHttpUrl(e?.url || "");
      if (url) updateActiveTab({ url });
      setLoadingTabId(null);
    };
    const onTitle = (e) => {
      const title = String(e?.title || "").trim();
      if (title) updateActiveTab({ title });
    };
    const onNewWindow = (e) => {
      if (e?.preventDefault) e.preventDefault();
      const url = toSafeHttpUrl(e?.url || "");
      if (url) openTabInApp(url, inferTitleFromUrl(url));
    };

    node.addEventListener("dom-ready", onReady);
    node.addEventListener("did-fail-load", onFail);
    node.addEventListener("did-navigate", onNavigate);
    node.addEventListener("did-navigate-in-page", onNavigate);
    node.addEventListener("page-title-updated", onTitle);
    node.addEventListener("new-window", onNewWindow);

    return () => {
      node.removeEventListener("dom-ready", onReady);
      node.removeEventListener("did-fail-load", onFail);
      node.removeEventListener("did-navigate", onNavigate);
      node.removeEventListener("did-navigate-in-page", onNavigate);
      node.removeEventListener("page-title-updated", onTitle);
      node.removeEventListener("new-window", onNewWindow);
    };
  }, [isElectron]); // ← intentionally only on mount, NOT on activeTabId

  // IPC: window.open caught by main process setWindowOpenHandler
  useEffect(() => {
    if (!isElectron || !window.aivora?.onOpenTab) return;
    const handler = ({ url }) => {
      const safe = toSafeHttpUrl(url);
      if (safe) openTabInApp(safe, inferTitleFromUrl(safe));
    };
    window.aivora.onOpenTab(handler);
    return () => window.aivora.offOpenTab?.();
  }, [isElectron]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeTab = tabs.find((t) => t.id === activeTabId);

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
                <button
                  className="ai-tutor-tab-btn"
                  onClick={() => {
                    setActiveTabId(tab.id);
                    // Imperatively load the tab URL when switching tabs
                    if (isElectron && webviewRef.current?.loadURL) {
                      setLoadingTabId(tab.id);
                      webviewRef.current.loadURL(tab.url);
                    }
                  }}
                  role="tab"
                  aria-selected={tab.id === activeTabId}
                  title={tab.url}
                >
                  {tab.id === loadingTabId ? "Loading…" : (tab.title || inferTitleFromUrl(tab.url))}
                </button>
                {tabs.length > 1 && (
                  <button className="ai-tutor-tab-close" onClick={() => closeTab(tab.id)} aria-label="Close tab">
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              className="ai-tutor-tab-add"
              onClick={() => openTabInApp(NEW_TAB_URL, "New Tab")}
              aria-label="Open new tab"
              title="New tab"
            >
              +
            </button>
          </div>
          <div className="ai-tutor-spacer" />
        </div>

        {isElectron ? (
          // Single webview — never re-mount it, navigate imperatively via loadURL
          <webview
            ref={webviewRef}
            src={activeTab?.url || NEW_TAB_URL}
            allowpopups="true"
            className="ai-tutor-frame"
          />
        ) : (
          <iframe
            key={activeTab?.id}
            className="ai-tutor-frame"
            src={activeTab?.url || NEW_TAB_URL}
            title={activeTab?.title || heading}
            onLoad={() => setLoadingTabId(null)}
            allow="clipboard-read; clipboard-write; microphone; camera"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
          />
        )}
      </div>
    </AppLayout>
  );
}
