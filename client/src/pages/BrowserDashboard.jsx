import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import WarningOverlay from "../components/WarningOverlay";
import AppLayout from "../layouts/AppLayout";
import api from "../services/api";
import { socket } from "../services/socket";

const appItems = [
  { label: "News", url: "https://news.google.com" },
  { label: "Spotify", url: "https://open.spotify.com" },
  { label: "Twitch", url: "https://www.twitch.tv" },
  { label: "Skype", url: "https://web.skype.com" },
  { label: "Flickr", url: "https://www.flickr.com" },
  { label: "Vimeo", url: "https://vimeo.com" },
  { label: "Tumblr", url: "https://www.tumblr.com" },
  { label: "Drive", url: "https://drive.google.com" }
];

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
  const [isFullScreenView, setIsFullScreenView] = useState(false);
  const [spotifyStatus, setSpotifyStatus] = useState({ connected: false, displayName: "" });
  const [actionStatus, setActionStatus] = useState("");
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [engineMode, setEngineMode] = useState("unknown");
  const [liveFrame, setLiveFrame] = useState({
    imageBase64: null,
    url: "",
    title: "",
    viewportWidth: null,
    viewportHeight: null,
    tabId: null
  });
  const liveViewRef = useRef(null);
  const viewportSizeRef = useRef({ w: 1280, h: 720 });

  const isStudent = mode === "student";
  const shellToneClass = isStudent
    ? "from-indigo-200/25 to-violet-200/20"
    : "from-cyan-200/25 to-sky-200/20";
  const featuredItems = (resultItems.length > 0 ? resultItems : recentSearches.map((r) => ({ title: r.query, snippet: "Recent search" })))
    .slice(0, 4)
    .map((item, idx) => ({
      id: `${item.title}-${idx}`,
      title: item.title,
      subtitle: item.snippet || "Interactive content",
      tag: idx % 2 === 0 ? "Interactive" : "360 Content"
    }));

  function joinUserSocketRoom() {
    const uid = session?.user?.id;
    if (!uid) return;
    socket.emit("join-user-room", { userId: String(uid) });
  }

  function bumpLiveFrame() {
    if (!socket.connected) {
      socket.connect();
      return;
    }
    socket.emit("request-tab-frame");
  }

  function sendBrowserInput(input) {
    const uid = session?.user?.id;
    if (!uid || !socket.connected) return;
    socket.emit("browser-input", { userId: String(uid), input });
  }

  function mapPointerToViewport(e, imgEl) {
    if (!imgEl) return null;
    const rect = imgEl.getBoundingClientRect();
    const nw = imgEl.naturalWidth || viewportSizeRef.current.w;
    const nh = imgEl.naturalHeight || viewportSizeRef.current.h;
    if (!nw || !nh) return null;
    const rw = rect.width;
    const rh = rect.height;
    const scale = Math.min(rw / nw, rh / nh);
    const dispW = nw * scale;
    const dispH = nh * scale;
    const ox = (rw - dispW) / 2;
    const oy = (rh - dispH) / 2;
    const lx = e.clientX - rect.left - ox;
    const ly = e.clientY - rect.top - oy;
    if (lx < 0 || ly < 0 || lx > dispW || ly > dispH) return null;
    return { x: (lx / dispW) * nw, y: (ly / dispH) * nh };
  }

  useEffect(() => {
    socket.connect();
    const onHeartbeat = ({ at }) => setHeartbeat(at);
    const onTabFrame = (frame) => {
      const vw = frame?.viewportWidth;
      const vh = frame?.viewportHeight;
      if (vw && vh) viewportSizeRef.current = { w: vw, h: vh };
      setLiveFrame({
        imageBase64: frame?.imageBase64 || null,
        url: frame?.url || "",
        title: frame?.title || "",
        viewportWidth: vw ?? null,
        viewportHeight: vh ?? null,
        tabId: frame?.tabId ?? null
      });
    };
    const onConnect = () => {
      joinUserSocketRoom();
      bumpLiveFrame();
    };

    socket.on("platform-heartbeat", onHeartbeat);
    socket.on("tab-frame", onTabFrame);
    socket.on("connect", onConnect);

    if (socket.connected) onConnect();

    return () => {
      socket.off("platform-heartbeat", onHeartbeat);
      socket.off("tab-frame", onTabFrame);
      socket.off("connect", onConnect);
      socket.disconnect();
    };
  }, [session?.user?.id]);

  useEffect(() => {
    loadRecentSearches();
    loadSpotifyStatus();
    loadTabs();
    loadEngineStatus();

    const timer = setInterval(loadEngineStatus, 10000);
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

  const topSuggestion = useMemo(() => resultItems[0]?.title || "Google News - Daily Headlines", [resultItems]);
  const activeTabUrl = useMemo(() => tabs.find((tab) => tab.tabId === activeTabId)?.url || "", [tabs, activeTabId]);
  const addressValue = search || liveFrame.url || activeTabUrl || "Search in cloud browser";
  const addressHost = useMemo(() => {
    try {
      const parsed = new URL(addressValue.startsWith("http") ? addressValue : `https://${addressValue}`);
      return parsed.hostname.replace(/^www\./, "");
    } catch (_error) {
      return addressValue;
    }
  }, [addressValue]);

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
      setActionStatus(`Opened in app: ${resolvedUrl}`);
      bumpLiveFrame();
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

      // If user typed a domain/URL, open it directly inside the app (cloud tab).
      if (looksLikeDomainOrUrl(trimmed)) {
        setActionStatus(`Opening website in app: ${buildOpenUrlFromInput(trimmed)}`);
        await navigateFromInput(trimmed);
        setResultItems([]);
        setHasMoreResults(false);
        setSearchPage(1);
        setActiveQuery("");
        setSearchMeta({ fromCache: false });
        return;
      }

      // Perceived speed: open search engine results in cloud view immediately.
      await navigateFromInput(trimmed);
      setActionStatus(`Searching smart results for "${trimmed}"...`);

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
      bumpLiveFrame();
    } catch (error) {
      if (error.response?.status === 403) setWarning(error.response?.data?.message || "Website blocked");
      else setActionStatus("Unable to open tab. Please verify URL.");
    }
  }

  async function openAppTab(url, label) {
    try {
      setWarning("");
      const { data } = await api.post("/browser/open-tab", { url });
      setActionStatus(`${label} opened in cloud browser.`);
      setTabs(data.tabs || []);
      setActiveTabId(data.activeTabId || null);
      bumpLiveFrame();
    } catch (error) {
      if (error.response?.status === 403) setWarning(error.response?.data?.message || "App blocked by parent policy");
      else setActionStatus(`Failed to open ${label}.`);
    }
  }

  async function loadRecentSearches() {
    const { data } = await api.get("/browser/recent-searches?limit=6");
    setRecentSearches(data.searches || []);
  }

  async function loadSpotifyStatus() {
    try {
      const { data } = await api.get("/auth/spotify/status");
      setSpotifyStatus({
        connected: Boolean(data.connected),
        displayName: data.displayName || ""
      });
    } catch (_error) {
      setSpotifyStatus({ connected: false, displayName: "" });
    }
  }

  async function connectSpotify() {
    try {
      const { data } = await api.get("/auth/spotify/connect");
      window.open(data.authUrl, "_blank", "width=540,height=720");
      setActionStatus("Spotify connect window opened. Complete login there.");
    } catch (error) {
      setActionStatus(error.response?.data?.message || "Spotify connect is not configured.");
    }
  }

  async function openResultTab(item, options = {}) {
    try {
      setWarning("");
      const targetUrl = item?.url || buildOpenUrlFromInput(item?.title || "");
      if (!targetUrl) {
        setActionStatus("Unable to open result (missing URL).");
        return;
      }
      let data;
      try {
        const resp = await api.post("/browser/navigate-active", { url: targetUrl });
        data = resp.data;
      } catch (error) {
        if (error.response?.status === 404) {
          // Fallback for older backend versions that don't expose /navigate-active yet.
          const fallbackResp = await api.post("/browser/open-tab", { url: targetUrl });
          data = fallbackResp.data;
        } else {
          throw error;
        }
      }
      setActionStatus(`Opened in app: ${item?.title || targetUrl}`);
      setTabs(data.tabs || []);
      setActiveTabId(data.activeTabId || null);
      if (options.fullScreen) {
        setIsFullScreenView(true);
      }
      bumpLiveFrame();
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
          bumpLiveFrame();
          return;
        }
      }
      setTabs(loadedTabs);
      setActiveTabId(data.activeTabId || null);
      bumpLiveFrame();
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
      bumpLiveFrame();
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
      bumpLiveFrame();
    } catch (_error) {
      setActionStatus("Unable to close tab.");
    }
  }

  const canInteractLive = Boolean(liveFrame.imageBase64 && liveFrame.viewportWidth);

  return (
    <AppLayout title={`${isStudent ? "Student" : "Normal User"} Cloud Browser`}>
      <WarningOverlay message={warning} onClose={() => setWarning("")} />

      {isFullScreenView && (
        <div className="edu-fullscreen">
          <div className="edu-fullscreen-topbar">
            <button className="edu-fullscreen-back" onClick={() => setIsFullScreenView(false)}>
              ← Back
            </button>
            <p className="edu-fullscreen-url">{liveFrame.url || tabs.find((t) => t.tabId === activeTabId)?.url || "-"}</p>
            <div />
          </div>

          <div
            className={`edu-fullscreen-stage ${canInteractLive ? "edu-live-wrap--active" : ""}`}
            tabIndex={canInteractLive ? 0 : -1}
            onKeyDown={(e) => {
              if (!canInteractLive) return;
              if (e.ctrlKey || e.metaKey || e.altKey) return;
              if (e.key === "Tab") return;
              e.preventDefault();
              sendBrowserInput({ kind: "keydown", key: e.key });
            }}
          >
            {liveFrame.imageBase64 ? (
              <img
                ref={liveViewRef}
                src={`data:image/jpeg;base64,${liveFrame.imageBase64}`}
                alt="Cloud tab frame fullscreen"
                className="edu-fullscreen-frame"
                onClick={(e) => {
                  if (!canInteractLive) return;
                  const img = liveViewRef.current;
                  const pt = mapPointerToViewport(e, img);
                  if (!pt) return;
                  sendBrowserInput({ kind: "click", x: pt.x, y: pt.y });
                }}
                onWheel={(e) => {
                  if (!canInteractLive) return;
                  e.preventDefault();
                  e.stopPropagation();
                  sendBrowserInput({ kind: "wheel", deltaX: e.deltaX, deltaY: e.deltaY });
                }}
              />
            ) : (
              <div className="edu-fullscreen-empty">Loading cloud page...</div>
            )}
          </div>
        </div>
      )}

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
                      onClick={() => openResultTab(item, { fullScreen: true })}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openResultTab(item, { fullScreen: true });
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
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const targetUrl = item?.url || buildOpenUrlFromInput(item?.title || "");
                            if (targetUrl) {
                              window.open(targetUrl, "_blank", "noopener,noreferrer");
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

              <div className="edu-cloud-grid">
                <div className="edu-card">
                  <div className="edu-card-head">
                    <p>Cloud Live View</p>
                    <p className="edu-muted truncate">{liveFrame.url || tabs.find((t) => t.tabId === activeTabId)?.url || "-"}</p>
                  </div>
                  <p className="edu-live-hint">
                    {canInteractLive
                      ? "Click to interact · scroll wheel · click the stream then type (cloud Chromium)."
                      : engineMode === "virtual"
                        ? "Live view needs Playwright Chromium on the server (run: npx playwright install chromium)."
                        : "Open a tab and wait for the stream…"}
                  </p>
                  {liveFrame.imageBase64 ? (
                    <div
                      className={`edu-live-wrap ${canInteractLive ? "edu-live-wrap--active" : ""}`}
                      tabIndex={canInteractLive ? 0 : -1}
                      onKeyDown={(e) => {
                        if (!canInteractLive) return;
                        if (e.ctrlKey || e.metaKey || e.altKey) return;
                        if (e.key === "Tab") return;
                        e.preventDefault();
                        sendBrowserInput({ kind: "keydown", key: e.key });
                      }}
                    >
                      <img
                        ref={liveViewRef}
                        src={`data:image/jpeg;base64,${liveFrame.imageBase64}`}
                        alt="Cloud tab frame"
                        className="edu-frame edu-frame-interactive"
                        onClick={(e) => {
                          if (!canInteractLive) return;
                          const img = liveViewRef.current;
                          const pt = mapPointerToViewport(e, img);
                          if (!pt) return;
                          sendBrowserInput({ kind: "click", x: pt.x, y: pt.y });
                        }}
                        onWheel={(e) => {
                          if (!canInteractLive) return;
                          e.preventDefault();
                          e.stopPropagation();
                          sendBrowserInput({ kind: "wheel", deltaX: e.deltaX, deltaY: e.deltaY });
                        }}
                      />
                    </div>
                  ) : (
                    <div className="edu-frame-empty">Waiting for cloud frame...</div>
                  )}
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
              </div>

              <div className="edu-cloud-grid">
                <div className="edu-card">
                  <div className="edu-card-head">
                    <p>Apps</p>
                  </div>
                  <div className="edu-apps">
                    {appItems.map((app) => (
                      <button key={app.label} className="edu-app" onClick={() => openAppTab(app.url, app.label)}>
                        {app.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="edu-card">
                  <div className="edu-card-head">
                    <p>Music</p>
                    <button className="edu-link" onClick={loadSpotifyStatus}>
                      Refresh
                    </button>
                  </div>
                  <p className="edu-muted">
                    {spotifyStatus.connected
                      ? `Spotify Connected${spotifyStatus.displayName ? ` as ${spotifyStatus.displayName}` : ""}`
                      : "Connect your Spotify account for personalized music access."}
                  </p>
                  <div className="edu-row">
                    {!spotifyStatus.connected ? (
                      <button className="edu-primary small" onClick={connectSpotify}>
                        Connect
                      </button>
                    ) : (
                      <button className="edu-btn" onClick={() => openAppTab("https://open.spotify.com", "Spotify")}>
                        Open Spotify
                      </button>
                    )}
                    <button className="edu-btn" onClick={openTabFromInput}>
                      Open Tab
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </AppLayout>
  );
}
