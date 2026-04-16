import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import WarningOverlay from "../components/WarningOverlay";
import api from "../services/api";

const BING_HOME = "https://www.bing.com/";

function buildTabId() {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildSearchUrl(q) {
  const s = q.trim();
  if (!s) return BING_HOME;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(s)) return `https://${s}`;
  return `https://www.bing.com/search?q=${encodeURIComponent(s)}`;
}

function inferTitle(url) {
  try { return new URL(url).hostname.replace(/^www\./, "") || "New Tab"; }
  catch (_) { return "New Tab"; }
}

export default function BrowserDashboard({ session, mode = "normal", onLogout }) {
  const navigate = useNavigate();
  const isElectron = Boolean(window.aivora?.platform);
  const isStudent = mode === "student";

  const initTab = { id: buildTabId(), url: BING_HOME, title: "New Tab" };
  const [tabs, setTabs] = useState([initTab]);
  const [activeTabId, setActiveTabId] = useState(initTab.id);
  const activeTabIdRef = useRef(initTab.id);
  const tabsRef = useRef([initTab]);

  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  const [search, setSearch] = useState("");
  const [warning, setWarning] = useState("");
  const [recentSearches, setRecentSearches] = useState([]);
  const [iframeUrls, setIframeUrls] = useState({ [initTab.id]: BING_HOME });

  // ── Init ──────────────────────────────────────────────────
  useEffect(() => { loadRecentSearches(); }, []);

  // Client-side restrictions ref (synced from API, used for both search bars)
  const restrictionsRef = useRef({ blockedKeywords: [], blockedDomains: [] });

  // ── Student restrictions ──────────────────────────────────
  useEffect(() => {
    if (!isStudent) return;
    async function sync() {
      try {
        const { data } = await api.get("/parent/restrictions");
        const r = { blockedKeywords: data.blockedKeywords || [], blockedDomains: data.blockedDomains || [] };
        restrictionsRef.current = r;
        if (isElectron) window.aivora.setStudentSession({ token: session?.token || "", ...r });
      } catch (_) {}
    }
    sync();
    const t = setInterval(sync, 60000);
    return () => { clearInterval(t); if (isElectron) window.aivora.clearStudentSession(); };
  }, [isElectron, isStudent, session?.token]);

  function isBlockedClient(text) {
    if (!isStudent) return null; // null = not blocked
    const { blockedKeywords, blockedDomains } = restrictionsRef.current;
    const lower = (text || "").toLowerCase();
    const kw = blockedKeywords.find((k) => k && lower.includes(k.toLowerCase()));
    if (kw) return `Keyword "${kw}" is blocked by parental policy`;
    const dm = blockedDomains.find((d) => d && lower.includes(d.toLowerCase()));
    if (dm) return `Domain "${dm}" is blocked by parental policy`;
    return null;
  }

  // ── Blocked event ─────────────────────────────────────────
  useEffect(() => {
    if (!isElectron || !window.aivora?.onBlocked) return;
    const handler = ({ url, query, reason }) => {
      if (query && reason) {
        setWarning(`Search blocked: ${reason}`);
      } else {
        setWarning(`Blocked by parental policy: ${url}`);
      }
    };
    window.aivora.onBlocked(handler);
    return () => window.aivora.offBlocked?.();
  }, [isElectron]);

  const openNewTabRef = useRef(null);

  // ── IPC: window.open / will-navigate external from main ──
  useEffect(() => {
    if (!isElectron || !window.aivora?.onOpenTab) return;
    window.aivora.onOpenTab(({ url }) => {
      if (url && openNewTabRef.current) openNewTabRef.current(url);
    });
    return () => window.aivora.offOpenTab?.();
  }, [isElectron]);

  // ── IPC: validate-and-open (server-side validation before opening) ──
  useEffect(() => {
    if (!isElectron || !window.aivora?.onValidateAndOpen) return;
    const handler = async ({ url }) => {
      if (!url) return;
      // Validate URL with server
      try {
        await api.post("/browser/validate-url", { url }, { timeout: 5000 });
        // Server approved → open the tab
        if (openNewTabRef.current) openNewTabRef.current(url);
      } catch (err) {
        if (err?.response?.status === 403) {
          setWarning(err.response.data?.message || "Blocked by parental control policy");
        }
      }
    };
    window.aivora.onValidateAndOpen(handler);
    return () => window.aivora.offValidateAndOpen?.();
  }, [isElectron]);

  // ── Sync search bar from active tab URL (extract q= from Bing URLs) ─
  useEffect(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab?.url) return;
    try {
      const parsed = new URL(tab.url);
      if (parsed.hostname.includes("bing.com")) {
        const q = parsed.searchParams.get("q") || "";
        if (q && q !== search) setSearch(q);
      }
    } catch (_) {}
  }, [activeTabId, tabs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Poll active Bing webview for live typing (before search submit) ──
  useEffect(() => {
    if (!isElectron) return;
    const interval = setInterval(() => {
      const tabId = activeTabIdRef.current;
      const node = document.querySelector(`webview[data-tabid="${tabId}"]`);
      if (!node || typeof node.executeJavaScript !== "function") return;
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab?.url?.includes("bing.com")) return;
      node.executeJavaScript(
        `(function(){
          var el = document.querySelector('#sb_form_q') ||
                   document.querySelector('input[name="q"]') ||
                   document.querySelector('.b_searchbox');
          return el ? el.value : '';
        })()`
      ).then((val) => {
        if (typeof val === "string" && val.trim() && val !== search) {
          setSearch(val);
        }
      }).catch(() => {});
    }, 400);
    return () => clearInterval(interval);
  }, [isElectron, search]);

  const webviewListenersAttached = useRef({});

  // ── Tab callbacks ─────────────────────────────────────────
  function handleTabNavigate(tabId, url) {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, url } : t)));
    if (tabId === activeTabIdRef.current) {
      try {
        const parsed = new URL(url);
        if (parsed.hostname.includes("bing.com")) {
          const q = parsed.searchParams.get("q") || "";
          if (q) {
            // Check if the Bing search query is blocked
            const blockMsg = isBlockedClient(q);
            if (blockMsg) {
              setWarning(blockMsg);
              // Validate with server and block if necessary
              api.post("/browser/search", { query: q, page: 1, limit: 1 }, { timeout: 5000 })
                .catch((err) => {
                  if (err?.response?.status === 403) {
                    // Navigate back to Bing home
                    const node = document.querySelector(`webview[data-tabid="${tabId}"]`);
                    if (node?.loadURL) node.loadURL(BING_HOME);
                  }
                });
              // Immediately navigate back to Bing home
              const node = document.querySelector(`webview[data-tabid="${tabId}"]`);
              if (node?.loadURL) node.loadURL(BING_HOME);
              return;
            }
            setSearch(q);
          }
        }
      } catch (_) {}
    }
  }

  function handleTabTitle(tabId, title) {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, title } : t)));
  }

  function handleNewWindow(url) { if (openNewTabRef.current) openNewTabRef.current(url); }

  // ── Tab operations ────────────────────────────────────────
  function openNewTab(url = BING_HOME, title = "") {
    const newTab = { id: buildTabId(), url, title: title || inferTitle(url) };
    setTabs((prev) => [...prev, newTab]);
    setIframeUrls((prev) => ({ ...prev, [newTab.id]: url }));
    setActiveTabId(newTab.id);
    activeTabIdRef.current = newTab.id;
  }
  openNewTabRef.current = openNewTab;

  function switchToTab(tabId) {
    setActiveTabId(tabId);
    activeTabIdRef.current = tabId;
  }

  function closeTab(tabId) {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((t) => t.id === tabId);
      const updated = prev.filter((t) => t.id !== tabId);
      if (tabId === activeTabIdRef.current) {
        const next = updated[Math.max(0, idx - 1)] || updated[0];
        if (next) { setActiveTabId(next.id); activeTabIdRef.current = next.id; }
      }
      return updated;
    });
  }

  function loadInActiveTab(url) {
    const tabId = activeTabIdRef.current;
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, url, title: inferTitle(url) } : t)));
    if (isElectron) {
      const node = document.querySelector(`webview[data-tabid="${tabId}"]`);
      if (node?.loadURL) node.loadURL(url);
    } else {
      setIframeUrls((prev) => ({ ...prev, [tabId]: url }));
    }
  }

  async function loadRecentSearches() {
    try { const { data } = await api.get("/browser/recent-searches?limit=5"); setRecentSearches(data.searches || []); }
    catch (_) {}
  }

  async function doSearch(query = search) {
    const trimmed = String(query || "").trim();
    if (!trimmed) return;

    // Client-side block check (instant, no API round-trip needed)
    const blockMsg = isBlockedClient(trimmed);
    if (blockMsg) { setWarning(blockMsg); return; }

    // Validate with server BEFORE loading URL (enforces parental controls)
    try {
      await api.post("/browser/search", { query: trimmed, page: 1, limit: 1 }, { timeout: 10000 });
      loadInActiveTab(buildSearchUrl(trimmed));
      await loadRecentSearches();
    } catch (err) {
      if (err?.response?.status === 403) {
        setWarning(err.response.data?.message || "Blocked by parental control policy");
      }
    }
  }

  function handleMicSearch() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR(); r.lang = "en-US";
    r.onresult = (e) => { const t = e.results?.[0]?.[0]?.transcript || ""; if (t) { setSearch(t); doSearch(t); } };
    r.start();
  }

  function handleLogout() { if (onLogout) onLogout(); navigate("/"); }

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#f3f6fb", color: "#0f172a", overflow: "hidden" }}>
      <WarningOverlay message={warning} onClose={() => setWarning("")} />

      {/* ── Top chrome: brand + tabs + nav ── */}
      <div style={{ flexShrink: 0, background: "#eef3f9", borderBottom: "1px solid rgba(15,23,42,0.08)", padding: "0.45rem 0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#2563eb,#0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: "0.75rem" }}>Ai</div>
          <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "#0f172a" }}>{isStudent ? "Student" : "Normal"}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flex: 1, minWidth: 0, overflowX: "auto" }}>
          {tabs.map((tab) => (
            <div key={tab.id} style={{
              display: "flex", alignItems: "center", minWidth: 100, maxWidth: 180, flexShrink: 0,
              borderRadius: "0.5rem",
              border: tab.id === activeTabId ? "1.5px solid #2563eb" : "1px solid rgba(15,23,42,0.12)",
              background: tab.id === activeTabId ? "rgba(37,99,235,0.1)" : "#fff",
            }}>
              <button onClick={() => switchToTab(tab.id)} title={tab.url}
                style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", textAlign: "left", fontSize: "0.74rem", fontWeight: 700, padding: "0.32rem 0.5rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#0f172a", cursor: "pointer" }}>
                {tab.title || inferTitle(tab.url)}
              </button>
              {tabs.length > 1 && (
                <button onClick={() => closeTab(tab.id)} aria-label="Close tab"
                  style={{ border: "none", background: "transparent", color: "rgba(15,23,42,0.4)", fontSize: "0.9rem", padding: "0.15rem 0.38rem", cursor: "pointer", flexShrink: 0 }}>×</button>
              )}
            </div>
          ))}
          <button onClick={() => openNewTab(BING_HOME, "New Tab")} title="New tab"
            style={{ width: "1.7rem", height: "1.7rem", borderRadius: "0.45rem", border: "1px solid rgba(15,23,42,0.14)", background: "#fff", fontSize: "1rem", fontWeight: 700, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
        </div>

        <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
          <button onClick={() => navigate("/settings")} style={{ border: "1px solid rgba(15,23,42,0.1)", borderRadius: "0.45rem", background: "#fff", padding: "0.28rem 0.6rem", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer", color: "#0f172a" }}>Settings</button>
          <button onClick={() => navigate(`/ai-tutor?url=${encodeURIComponent("https://aivorachatfrontend.vercel.app/")}&title=${encodeURIComponent("Ai Tutor")}`)}
            style={{ border: "none", borderRadius: "0.45rem", background: "linear-gradient(180deg,#2563eb,#1d4ed8)", padding: "0.28rem 0.6rem", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer", color: "#fff" }}>Ai Tutor</button>
          <button onClick={handleLogout} style={{ border: "1px solid rgba(239,68,68,0.2)", borderRadius: "0.45rem", background: "rgba(239,68,68,0.07)", padding: "0.28rem 0.6rem", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer", color: "#b91c1c" }}>Logout</button>
        </div>
      </div>

      {/* ── Address / search bar — mirrors Bing input in real time ── */}
      <div style={{ flexShrink: 0, background: "#fff", borderBottom: "1px solid rgba(15,23,42,0.07)", padding: "0.38rem 0.75rem", display: "flex", alignItems: "center", gap: "0.45rem" }}>
        <button onClick={() => loadInActiveTab(BING_HOME)} title="Home"
          style={{ border: "1px solid rgba(15,23,42,0.1)", borderRadius: "0.45rem", background: "#f1f5f9", width: 30, height: 30, fontSize: "0.95rem", cursor: "pointer", flexShrink: 0 }}>⌂</button>

        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "0.45rem", border: "1px solid rgba(15,23,42,0.12)", borderRadius: "0.55rem", background: "#f8fafc", padding: "0.28rem 0.6rem" }}>
          <span style={{ opacity: 0.4, fontSize: "0.8rem" }}>🔎</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
            placeholder="Search or enter URL… (mirrors Bing)"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: "0.84rem", color: "#0f172a" }}
          />
          {search && (
            <button onClick={() => setSearch("")}
              style={{ border: "none", background: "transparent", color: "rgba(15,23,42,0.35)", fontSize: "0.9rem", cursor: "pointer", padding: 0 }}>×</button>
          )}
        </div>

        <button onClick={handleMicSearch} title="Voice"
          style={{ border: "1px solid rgba(15,23,42,0.1)", borderRadius: "0.45rem", background: "#f1f5f9", width: 30, height: 30, fontSize: "0.85rem", cursor: "pointer", flexShrink: 0 }}>🎙</button>
        <button onClick={() => doSearch()}
          style={{ border: "none", borderRadius: "0.45rem", background: "linear-gradient(180deg,#2563eb,#1d4ed8)", color: "#fff", padding: "0 0.8rem", height: 30, fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Search</button>

        {recentSearches.length > 0 && (
          <div style={{ display: "flex", gap: "0.28rem", overflowX: "auto", flexShrink: 0, maxWidth: 260 }}>
            {recentSearches.slice(0, 4).map((r) => (
              <button key={r.query} onClick={() => { setSearch(r.query); doSearch(r.query); }}
                style={{ border: "1px solid rgba(37,99,235,0.18)", borderRadius: "9999px", background: "rgba(37,99,235,0.07)", color: "#1d4ed8", padding: "0.18rem 0.5rem", fontSize: "0.7rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                {r.query}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Browser viewport ── */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
        {isElectron ? (
          tabs.map((tab) => (
            <webview
              key={tab.id}
              data-tabid={tab.id}
              src={tab.url}
              allowpopups="true"
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                display: tab.id === activeTabId ? "flex" : "none"
              }}
              onDomReady={(e) => {
                const node = e.target;
                if (!node) return;
                // Only attach listeners once per webview element
                if (webviewListenersAttached.current[tab.id]) return;
                webviewListenersAttached.current[tab.id] = true;
                node.addEventListener("did-navigate", (ev) => { if (ev?.url) handleTabNavigate(tab.id, ev.url); });
                node.addEventListener("did-navigate-in-page", (ev) => { if (ev?.url) handleTabNavigate(tab.id, ev.url); });
                node.addEventListener("page-title-updated", (ev) => { const t = String(ev?.title || "").trim(); if (t) handleTabTitle(tab.id, t); });
                node.addEventListener("new-window", (ev) => { if (ev?.preventDefault) ev.preventDefault(); if (ev?.url) handleNewWindow(ev.url); });
              }}
            />
          ))
        ) : (
          tabs.map((tab) => (
            <iframe
              key={`${tab.id}-${iframeUrls[tab.id]}`}
              src={iframeUrls[tab.id] || tab.url}
              title={tab.title}
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                border: "none", display: tab.id === activeTabId ? "block" : "none"
              }}
              allow="clipboard-read; clipboard-write; microphone; camera"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
            />
          ))
        )}
      </div>
    </div>
  );
}
