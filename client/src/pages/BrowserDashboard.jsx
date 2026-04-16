import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import WarningOverlay from "../components/WarningOverlay";
import api from "../services/api";

const BING_HOME = "about:blank"; // Hide Bing homepage, use blank page

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

  const initTab = { id: buildTabId(), url: "about:blank", title: "Aivora Learn" };
  const [tabs, setTabs] = useState([initTab]);
  const [activeTabId, setActiveTabId] = useState(initTab.id);
  const activeTabIdRef = useRef(initTab.id);
  const tabsRef = useRef([initTab]);

  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  const [search, setSearch] = useState("");
  const [warning, setWarning] = useState("");
  const [recentSearches, setRecentSearches] = useState([]);
  const [iframeUrls, setIframeUrls] = useState({ [initTab.id]: "about:blank" });

  // ── Init ──────────────────────────────────────────────────
  useEffect(() => { 
    loadRecentSearches(); 
    console.log("[BrowserDashboard] Initialized, isElectron:", isElectron);
  }, []);

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
    console.log("[BrowserDashboard] handleTabNavigate:", tabId, url);
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

  function handleNewWindow(url) { 
    console.log("[BrowserDashboard] handleNewWindow:", url);
    if (openNewTabRef.current) openNewTabRef.current(url); 
  }

  // ── Tab operations ────────────────────────────────────────
  function openNewTab(url = "about:blank", title = "") {
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
      // Navigate directly to Bing search results instead of loading in webview
      const searchUrl = buildSearchUrl(trimmed);
      loadInActiveTab(searchUrl);
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
          <button onClick={() => openNewTab("about:blank", "New Tab")} title="New tab"
            style={{ width: "1.7rem", height: "1.7rem", borderRadius: "0.45rem", border: "1px solid rgba(15,23,42,0.14)", background: "#fff", fontSize: "1rem", fontWeight: 700, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
        </div>

        <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
          <button onClick={() => navigate("/settings")} style={{ border: "1px solid rgba(15,23,42,0.1)", borderRadius: "0.45rem", background: "#fff", padding: "0.28rem 0.6rem", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer", color: "#0f172a" }}>Settings</button>
          <button onClick={() => navigate(`/ai-tutor?url=${encodeURIComponent("https://aivorachatfrontend.vercel.app/")}&title=${encodeURIComponent("Ai Tutor")}`)}
            style={{ border: "none", borderRadius: "0.45rem", background: "linear-gradient(180deg,#2563eb,#1d4ed8)", padding: "0.28rem 0.6rem", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer", color: "#fff" }}>Ai Tutor</button>
          <button onClick={handleLogout} style={{ border: "1px solid rgba(239,68,68,0.2)", borderRadius: "0.45rem", background: "rgba(239,68,68,0.07)", padding: "0.28rem 0.6rem", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer", color: "#b91c1c" }}>Logout</button>
        </div>
      </div>

      {/* ── Aivora Learn Search Interface - Compact version ── */}
      <div style={{ flexShrink: 0, background: "#fff", borderBottom: "1px solid rgba(15,23,42,0.07)", padding: "0.75rem 1rem" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
          {/* Aivora Learn Logo - Compact */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#2563eb,#0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: "1rem", boxShadow: "0 2px 8px rgba(37,99,235,0.3)" }}>Ai</div>
            <div>
              <h1 style={{ fontSize: "1.25rem", fontWeight: 900, color: "#0f172a", margin: 0, lineHeight: 1 }}>Aivora Learn</h1>
              <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0.1rem 0 0 0" }}>AI-Powered Educational Search</p>
            </div>
          </div>

          {/* Search Box - Compact */}
          <div style={{ width: "100%", maxWidth: 600, display: "flex", alignItems: "center", gap: "0.5rem", border: "2px solid rgba(37,99,235,0.2)", borderRadius: "9999px", background: "#f8fafc", padding: "0.4rem 0.8rem", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <span style={{ opacity: 0.5, fontSize: "1rem" }}>🔎</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
              placeholder="Search for educational content..."
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: "0.9rem", color: "#0f172a" }}
            />
            {search && (
              <button onClick={() => setSearch("")}
                style={{ border: "none", background: "transparent", color: "rgba(15,23,42,0.35)", fontSize: "1.1rem", cursor: "pointer", padding: 0 }}>×</button>
            )}
            <button onClick={handleMicSearch} title="Voice Search"
              style={{ border: "none", background: "transparent", fontSize: "1rem", cursor: "pointer", padding: 0 }}>🎙</button>
            <button onClick={() => doSearch()}
              style={{ border: "none", borderRadius: "9999px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "#fff", padding: "0.4rem 1.2rem", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 6px rgba(37,99,235,0.3)" }}>Search</button>
          </div>

          {/* Recent Searches - Compact */}
          {recentSearches.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Recent Searches</span>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {recentSearches.slice(0, 5).map((r) => (
                  <button key={r.query} onClick={() => { setSearch(r.query); doSearch(r.query); }}
                    style={{ border: "1px solid rgba(37,99,235,0.2)", borderRadius: "9999px", background: "rgba(37,99,235,0.05)", color: "#1d4ed8", padding: "0.3rem 0.8rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {r.query}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Links - Compact */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
            <button onClick={() => { setSearch("mathematics"); doSearch("mathematics"); }}
              style={{ border: "1px solid rgba(15,23,42,0.1)", borderRadius: "0.4rem", background: "#fff", padding: "0.4rem 0.8rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", color: "#0f172a", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: "0.3rem" }}><span>📐</span> Mathematics</button>
            <button onClick={() => { setSearch("science"); doSearch("science"); }}
              style={{ border: "1px solid rgba(15,23,42,0.1)", borderRadius: "0.4rem", background: "#fff", padding: "0.4rem 0.8rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", color: "#0f172a", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: "0.3rem" }}><span>🔬</span> Science</button>
            <button onClick={() => { setSearch("history"); doSearch("history"); }}
              style={{ border: "1px solid rgba(15,23,42,0.1)", borderRadius: "0.4rem", background: "#fff", padding: "0.4rem 0.8rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", color: "#0f172a", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: "0.3rem" }}><span>📚</span> History</button>
            <button onClick={() => { setSearch("programming"); doSearch("programming"); }}
              style={{ border: "1px solid rgba(15,23,42,0.1)", borderRadius: "0.4rem", background: "#fff", padding: "0.4rem 0.8rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", color: "#0f172a", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: "0.3rem" }}><span>💻</span> Programming</button>
          </div>
        </div>
      </div>

      {/* ── Browser viewport ── */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: "#f8fafc" }}>
        {/* Show Aivora Learn interface when on blank page */}
        {activeTab?.url === "about:blank" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)" }}>
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <div style={{ width: 120, height: 120, margin: "0 auto 2rem", borderRadius: 30, background: "linear-gradient(135deg,#2563eb,#0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: "3rem", boxShadow: "0 8px 24px rgba(37,99,235,0.3)" }}>Ai</div>
              <h2 style={{ fontSize: "2.5rem", fontWeight: 900, color: "#0f172a", margin: "0 0 0.5rem 0" }}>Welcome to Aivora Learn</h2>
              <p style={{ fontSize: "1.1rem", color: "#64748b", margin: "0 0 2rem 0" }}>Start your educational journey by searching above</p>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
                <div style={{ padding: "1rem 1.5rem", background: "white", borderRadius: "0.75rem", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎯</div>
                  <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0f172a" }}>Safe Browsing</div>
                </div>
                <div style={{ padding: "1rem 1.5rem", background: "white", borderRadius: "0.75rem", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🧠</div>
                  <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0f172a" }}>AI-Powered</div>
                </div>
                <div style={{ padding: "1rem 1.5rem", background: "white", borderRadius: "0.75rem", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📚</div>
                  <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0f172a" }}>Educational</div>
                </div>
              </div>
            </div>
          </div>
        )}
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
                
                console.log("[Webview] Attaching event listeners for tab:", tab.id);
                
                node.addEventListener("did-navigate", (ev) => { 
                  console.log("[Webview] did-navigate:", ev?.url);
                  if (ev?.url) handleTabNavigate(tab.id, ev.url); 
                });
                node.addEventListener("did-navigate-in-page", (ev) => { 
                  console.log("[Webview] did-navigate-in-page:", ev?.url);
                  if (ev?.url) handleTabNavigate(tab.id, ev.url); 
                });
                node.addEventListener("page-title-updated", (ev) => { 
                  const t = String(ev?.title || "").trim(); 
                  if (t) handleTabTitle(tab.id, t); 
                });
                node.addEventListener("new-window", (ev) => { 
                  console.log("[Webview] new-window event:", ev?.url);
                  if (ev?.preventDefault) ev.preventDefault(); 
                  if (ev?.url) handleNewWindow(ev.url); 
                });
                node.addEventListener("will-navigate", (ev) => {
                  console.log("[Webview] will-navigate event:", ev?.url);
                });
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
