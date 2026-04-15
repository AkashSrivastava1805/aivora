import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import WarningOverlay from "../components/WarningOverlay";
import AppLayout from "../layouts/AppLayout";
import api from "../services/api";

export default function BrowserDashboard({ session, mode = "normal", onLogout }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [warning, setWarning] = useState("");
  const [resultItems, setResultItems] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [activeQuery, setActiveQuery] = useState("");
  const [searchMeta, setSearchMeta] = useState({ fromCache: false });
  const [heartbeat, setHeartbeat] = useState("");
  const [weather, setWeather] = useState({ label: "Locating...", temp: "--", wind: "--" });
  const [recentSearches, setRecentSearches] = useState([]);
  const [recentOpen, setRecentOpen] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [engineMode, setEngineMode] = useState("unknown");

  const isStudent = mode === "student";
  const shellToneClass = isStudent
    ? "from-indigo-200/25 to-violet-200/20"
    : "from-cyan-200/25 to-sky-200/20";
  useEffect(() => {
    const tick = setInterval(() => setHeartbeat(new Date().toISOString()), 20000);
    setHeartbeat(new Date().toISOString());
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    loadRecentSearches();
    loadTabs();
    loadEngineStatus();

    const timer = setInterval(loadEngineStatus, 45000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function loadWeather() {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            const weatherResp = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m`
            );
            const weatherData = await weatherResp.json();
            setWeather({
              label: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
              temp: `${weatherData?.current?.temperature_2m ?? "--"} C`,
              wind: `${weatherData?.current?.wind_speed_10m ?? "--"} km/h`
            });
          } catch (_error) {
            setWeather({ label: "Weather unavailable", temp: "--", wind: "--" });
          }
        },
        () => setWeather({ label: "Location blocked", temp: "--", wind: "--" })
      );
    }

    loadWeather();
  }, []);

  function looksLikeDomainOrUrl(value) {
    const input = value.trim().toLowerCase();
    if (!input) return false;
    if (input.startsWith("http://") || input.startsWith("https://")) return true;
    // Basic domain check (example.com, docs.example.ai/path)
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/.test(input);
  }

  function buildOpenUrlFromInput(rawInput) {
    const input = rawInput.trim();
    if (!input) return "";
    if (input.startsWith("http://") || input.startsWith("https://")) return input;
    if (looksLikeDomainOrUrl(input)) return `https://${input}`;
    return `https://www.bing.com/search?q=${encodeURIComponent(input)}`;
  }

  function buildResultTargetUrl(item) {
    const raw = String(item?.url || "").trim();
    if (!raw) return "";
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    return `https://${raw}`;
  }

  async function navigateFromInput(rawInput = search) {
    try {
      setWarning("");
      const trimmed = String(rawInput || "").trim();
      if (!trimmed) return;
      const resolvedUrl = buildOpenUrlFromInput(trimmed);
      let data;
      try {
        const resp = await api.post("/browser/navigate-active", { url: resolvedUrl });
        data = resp.data;
      } catch (error) {
        if (error.response?.status === 404) {
          // Fallback for older backend versions that don't expose /navigate-active yet.
          const fallbackResp = await api.post("/browser/open-tab", { url: resolvedUrl });
          data = fallbackResp.data;
        } else {
          throw error;
        }
      }
      setTabs(data.tabs || []);
      setActiveTabId(data.activeTabId || null);
      setActionStatus(data.navigationWarning || `Opened in app: ${resolvedUrl}`);
    } catch (error) {
      if (error.response?.status === 403) setWarning(error.response?.data?.message || "Website blocked");
      else setActionStatus("Unable to open website in app.");
    }
  }

  async function runSearch() {
    try {
      setWarning("");
      setIsSearching(true);
      const trimmed = search.trim();
      if (!trimmed) return;
      const { data } = await api.post("/browser/search", { query: trimmed, page: 1, limit: 6 }, { timeout: 15000 });
      setResultItems(data.results || []);
      setHasMoreResults(Boolean(data.hasMore));
      setSearchPage(1);
      setActiveQuery(trimmed);
      setSearchMeta({ fromCache: Boolean(data.fromCache) });
      setActionStatus(`Smart search completed for "${trimmed}"`);
      await loadRecentSearches();
    } catch (error) {
      if (error.response?.status === 403) {
        setWarning(error.response?.data?.message || "Search blocked");
      }
    } finally {
      setIsSearching(false);
    }
  }

  async function loadMoreResults() {
    if (!activeQuery || isSearching || !hasMoreResults) return;
    try {
      setIsSearching(true);
      const nextPage = searchPage + 1;
      const { data } = await api.post("/browser/search", {
        query: activeQuery,
        page: nextPage,
        limit: 6
      });
      setResultItems((prev) => [...prev, ...(data.results || [])]);
      setHasMoreResults(Boolean(data.hasMore));
      setSearchPage(nextPage);
      setSearchMeta({ fromCache: Boolean(data.fromCache) });
    } finally {
      setIsSearching(false);
    }
  }

  async function openTabFromInput() {
    try {
      setWarning("");
      const trimmed = search.trim();
      if (!trimmed) {
        setActionStatus("Please enter a URL or domain before opening a tab.");
        return;
      }
      const resolvedUrl = buildOpenUrlFromInput(trimmed);
      const { data } = await api.post("/browser/open-tab", { url: resolvedUrl });
      setActionStatus(`Opened: ${resolvedUrl}`);
      setTabs(data.tabs || []);
      setActiveTabId(data.activeTabId || null);
    } catch (error) {
      if (error.response?.status === 403) setWarning(error.response?.data?.message || "Website blocked");
      else setActionStatus("Unable to open tab. Please verify URL.");
    }
  }

  async function loadRecentSearches() {
    const { data } = await api.get("/browser/recent-searches?limit=6");
    setRecentSearches(data.searches || []);
  }

  async function openResultTab(item) {
    try {
      setWarning("");
      const targetUrl = buildResultTargetUrl(item);
      if (!targetUrl) {
        setActionStatus("Unable to open result (missing URL).");
        return;
      }
      await api.post("/browser/validate-url", {
        url: targetUrl,
        query: item?.title || ""
      });
      navigate(`/in-app-page?title=${encodeURIComponent(item?.title || "Redirect")}&url=${encodeURIComponent(targetUrl)}`);
    } catch (error) {
      if (error.response?.status === 403) {
        setWarning(error.response?.data?.message || "This result is blocked by policy.");
      } else {
        setActionStatus("Failed to open selected search result.");
      }
    }
  }

  function handleLogout() {
    if (onLogout) onLogout();
    navigate("/");
  }

  function handleHome() {
    setSearch("bing.com");
    openTabFromInput();
  }

  function handleMicSearch() {
    const speech =
      window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition || window.msSpeechRecognition;
    if (!speech) {
      setActionStatus("Voice search is not supported in this environment.");
      return;
    }
    const recognition = new speech();
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript) {
        setSearch(transcript);
        setActionStatus(`Voice captured: "${transcript}"`);
      }
    };
    recognition.start();
  }

  async function loadTabs() {
    try {
      const { data } = await api.get("/browser/tabs");
      const loadedTabs = data.tabs || [];
      if (loadedTabs.length === 0) {
        // Auto-reconcile after restart so users never do this manually.
        const reconcile = await api.post("/browser/reconcile-tabs");
        const reconciledTabs = reconcile.data?.tabs || [];
        setTabs(reconciledTabs);
        setActiveTabId(reconcile.data?.activeTabId || null);
        if (reconciledTabs.length > 0) {
          setActionStatus("Recovered previous cloud tabs after reconnect.");
          return;
        }
      }
      setTabs(loadedTabs);
      setActiveTabId(data.activeTabId || null);
    } catch (_error) {
      setTabs([]);
      setActiveTabId(null);
    }
  }

  async function loadEngineStatus() {
    try {
      const { data } = await api.get("/browser/engine-status");
      setEngineMode(data.mode || "unknown");
    } catch (_error) {
      setEngineMode("unknown");
    }
  }

  async function switchTab(tabId) {
    try {
      const { data } = await api.post("/browser/switch-tab", { tabId });
      setTabs(data.tabs || []);
      setActiveTabId(data.activeTabId || tabId);
      setActionStatus("Switched active tab.");
    } catch (_error) {
      setActionStatus("Unable to switch tab.");
    }
  }

  async function closeTab(tabId) {
    try {
      const { data } = await api.post("/browser/close-tab", { tabId });
      setTabs(data.tabs || []);
      setActiveTabId(data.activeTabId || null);
      setActionStatus("Tab closed.");
    } catch (_error) {
      setActionStatus("Unable to close tab.");
    }
  }

  return (
    <AppLayout title={`${isStudent ? "Student" : "Normal User"} Cloud Browser`}>
      <WarningOverlay message={warning} onClose={() => setWarning("")} />

      <div className="edu-shell">
        <div className="edu-grid">
          <aside className="edu-sidebar">
            <div className="edu-profile">
              <div className="edu-avatar">
                {session?.user?.avatarUrl ? (
                  <img src={session.user.avatarUrl} alt="avatar" />
                ) : (
                  <div className="edu-avatar-fallback">{session?.user?.name?.[0] || "U"}</div>
                )}
              </div>
              <div className="min-w-0">
                <p className="edu-name truncate">{session?.user?.name || "User"}</p>
                <p className="edu-sub truncate">{isStudent ? "Student" : "Normal User"}</p>
                <p className="edu-sub truncate">{weather.label}</p>
              </div>
            </div>

            <div className="edu-nav">
              <button className="edu-nav-btn" onClick={() => setActionStatus("Profile panel is coming soon.")}>
                Profile
              </button>
              <button className="edu-nav-btn" onClick={() => setActionStatus(`Location: ${weather.label}`)}>
                Location
              </button>
              <button className="edu-nav-btn" onClick={() => navigate("/settings")}>
                Settings
              </button>
              <button className="edu-nav-btn danger" onClick={handleLogout}>
                Log Out
              </button>
            </div>

            <div className="edu-mini">
              <div className="edu-pill">
                <span>Cloud Engine</span>
                <strong>{engineMode === "playwright" ? "Chromium" : engineMode === "virtual" ? "Virtual" : "..."}</strong>
              </div>
              <div className="edu-pill">
                <span>Heartbeat</span>
                <strong className="mono">{heartbeat ? new Date(heartbeat).toLocaleTimeString() : "--"}</strong>
              </div>
            </div>
          </aside>

          <main className="edu-main">
            <header className="edu-header">
              <div className="edu-brand">
                <div className="edu-logo">Ai</div>
                <div>
                  <p className="edu-brand-title">AiVoraLearn</p>
                  <p className="edu-brand-sub">Empowering Your Learning Journey</p>
                </div>
              </div>
              <button
                className="edu-primary"
                onClick={() => {
                  navigate("/ai-tutor");
                }}
              >
                Ai tutor
              </button>
            </header>

            <section className="edu-search-card">
              <div className="edu-searchbar">
                <span className="edu-search-icon">🔎</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") runSearch();
                  }}
                  placeholder="Search for courses, topics, or questions..."
                />
                <div className="edu-search-actions">
                  <button className="edu-icon" onClick={loadTabs} title="Refresh cloud tabs" aria-label="Refresh cloud tabs">
                    ↻
                  </button>
                  <button className="edu-icon" onClick={handleHome} title="Home" aria-label="Home">
                    ⌂
                  </button>
                  <button className="edu-icon" onClick={handleMicSearch} title="Voice search" aria-label="Voice search">
                    🎙
                  </button>
                  <button className="edu-primary" onClick={runSearch} disabled={isSearching}>
                    {isSearching ? "Searching..." : "Search"}
                  </button>
                </div>
              </div>

              <div className="edu-chips">
                <p className="edu-chips-label">Popular Searches:</p>
                {(recentSearches.length > 0
                  ? recentSearches.slice(0, 4).map((r) => r.query)
                  : ["Python Programming", "World History", "Data Science", "English Grammar"]
                ).map((q) => (
                  <button
                    key={q}
                    className="edu-chip"
                    onClick={() => {
                      setSearch(q);
                      runSearch();
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </section>

            <section className="edu-section">
              <div className="edu-collapse">
                <button
                  className="edu-collapse-head"
                  onClick={() => setRecentOpen((v) => !v)}
                  aria-expanded={recentOpen}
                >
                  <h3>Recent Search Results</h3>
                  <span className={`edu-collapse-arrow ${recentOpen ? "open" : ""}`}>▾</span>
                </button>

                {recentOpen && (
                  <div className="edu-recent edu-collapse-body">
                    {(resultItems.length > 0
                      ? resultItems
                      : recentSearches.map((r) => ({
                          title: r.query,
                          url: buildOpenUrlFromInput(r.query),
                          source: "Recent",
                          snippet: "Recent search"
                        }))
                    )
                      .slice(0, 4)
                      .map((item) => (
                        <button key={`${item.url}-${item.title}`} className="edu-recent-item" onClick={() => openResultTab(item)}>
                          <div className="min-w-0">
                            <p className="edu-recent-title truncate">{item.title}</p>
                            <p className="edu-recent-sub truncate">{item.snippet || item.source || "Smart"}</p>
                          </div>
                          <span className="edu-badge">{item.source || "Smart"}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </section>

            <section className="edu-section">
              <div className="edu-card">
                <div className="edu-card-head">
                  <p>Smart Search Results</p>
                  {hasMoreResults ? (
                    <button className="edu-link" onClick={loadMoreResults} disabled={isSearching}>
                      {isSearching ? "Loading..." : "More Results"}
                    </button>
                  ) : (
                    <span className="edu-muted">{searchMeta.fromCache ? "Cached" : "Live"}</span>
                  )}
                </div>
                <div className="edu-results">
                  {resultItems.length === 0 ? <p className="edu-muted">Results will appear here after you search.</p> : null}
                  {resultItems.map((item) => (
                    <div
                      key={`${item.url}-${item.title}`}
                      className="edu-result"
                      onClick={() => openResultTab(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openResultTab(item);
                        }
                      }}
                    >
                      <div className="min-w-0">
                        <p className="edu-result-title truncate">{item.title}</p>
                        <p className="edu-result-sub line-clamp-2">{item.snippet}</p>
                        <p className="edu-result-url truncate">{item.url}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="edu-badge">{item.source || "Smart"}</span>
                        <button
                          type="button"
                          className="edu-redirect-btn"
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const targetUrl = buildResultTargetUrl(item);
                            if (targetUrl) {
                              try {
                                await api.post("/browser/validate-url", {
                                  url: targetUrl,
                                  query: item?.title || ""
                                });
                              } catch (error) {
                                if (error.response?.status === 403) {
                                  setWarning(error.response?.data?.message || "This result is blocked by policy.");
                                  return;
                                }
                              }
                              navigate(
                                `/in-app-page?title=${encodeURIComponent(item?.title || "Redirect")}&url=${encodeURIComponent(
                                  targetUrl
                                )}`
                              );
                            }
                          }}
                        >
                          Redirect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="edu-section">
              <div className="edu-section-head">
                <h3>Cloud Browser</h3>
                <p className="edu-note">
                  {searchMeta.fromCache ? "Loaded from your cached results." : "Live smart results for current query."}{" "}
                  {isStudent ? "Student restrictions are enforced." : "Normal mode enabled."}
                </p>
              </div>

              <div className="edu-card">
                  <div className="edu-card-head">
                    <p>Tabs</p>
                    <button className="edu-link" onClick={openTabFromInput} title="Open current input as tab">
                      Open Tab
                    </button>
                  </div>
                  <div className="edu-tabs">
                    {tabs.length === 0 ? <p className="edu-muted">No tabs opened yet.</p> : null}
                    {tabs.slice(0, 8).map((tab) => (
                      <div key={tab.tabId} className={`edu-tab ${tab.tabId === activeTabId ? "active" : ""}`}>
                        <button className="edu-tab-btn" onClick={() => switchTab(tab.tabId)} title={tab.url}>
                          {tab.title || tab.url}
                        </button>
                        <button className="edu-x" onClick={() => closeTab(tab.tabId)} aria-label="Close tab" title="Close tab">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="edu-note">{actionStatus}</p>
                </div>

            </section>
          </main>
        </div>
      </div>
    </AppLayout>
  );
}
