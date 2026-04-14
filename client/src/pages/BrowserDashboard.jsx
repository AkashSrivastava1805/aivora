import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import MiniAnalyticsChart from "../components/MiniAnalyticsChart";
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
  const [analytics, setAnalytics] = useState([1, 2, 1, 3, 2, 4, 3]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [spotifyStatus, setSpotifyStatus] = useState({ connected: false, displayName: "" });
  const [actionStatus, setActionStatus] = useState("");
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [engineMode, setEngineMode] = useState("unknown");

  const isStudent = mode === "student";
  const shellToneClass = isStudent
    ? "from-indigo-200/25 to-violet-200/20"
    : "from-cyan-200/25 to-sky-200/20";

  useEffect(() => {
    socket.connect();
    socket.on("platform-heartbeat", ({ at }) => setHeartbeat(at));
    return () => {
      socket.off("platform-heartbeat");
      socket.disconnect();
    };
  }, []);

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

  async function runSearch() {
    try {
      setWarning("");
      setIsSearching(true);
      const trimmed = search.trim();
      if (!trimmed) return;
      const { data } = await api.post("/browser/search", { query: trimmed, page: 1, limit: 6 });
      setResultItems(data.results || []);
      setAnalytics((prev) => [...prev.slice(1), Math.min(9, (data.results?.length || 0) + 2)]);
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
      setAnalytics((prev) => [...prev.slice(1), Math.min(9, prev[prev.length - 1] + 1)]);
      setActionStatus(`Opened: ${resolvedUrl}`);
      setTabs(data.tabs || []);
      setActiveTabId(data.activeTabId || null);
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

  async function openResultTab(item) {
    try {
      setWarning("");
      const { data } = await api.post("/browser/open-tab", { url: item.url });
      setActionStatus(`Opened result: ${item.title}`);
      setAnalytics((prev) => [...prev.slice(1), Math.min(9, prev[prev.length - 1] + 1)]);
      setTabs(data.tabs || []);
      setActiveTabId(data.activeTabId || null);
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

      <div className={`glass-animated rounded-3xl border border-white/30 bg-gradient-to-br ${shellToneClass} p-5 backdrop-blur-2xl`}>
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <aside className="space-y-4 rounded-2xl border border-white/25 bg-white/35 p-4 text-slate-900">
            <div className="flex items-center gap-3">
              {session?.user?.avatarUrl ? (
                <img
                  src={session.user.avatarUrl}
                  alt="avatar"
                  className="h-14 w-14 rounded-full border border-white/70 object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-200 text-xl font-bold">
                  {session?.user?.name?.[0] || "U"}
                </div>
              )}
              <div>
                <p className="font-semibold">{session?.user?.name || "User"}</p>
                <p className="text-xs uppercase tracking-wider text-slate-700">{session?.user?.role || "normal"}</p>
              </div>
            </div>
            <div className="rounded-xl bg-white/60 p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">Cloud Engine</p>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                    engineMode === "playwright"
                      ? "bg-emerald-100 text-emerald-700"
                      : engineMode === "virtual"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {engineMode === "playwright"
                    ? "Playwright Mode"
                    : engineMode === "virtual"
                      ? "Virtual Mode"
                      : "Checking..."}
                </span>
              </div>
              <p className="text-xs text-slate-700">Live heartbeat</p>
              <p className="mt-1 text-xs font-semibold text-cyan-700">{heartbeat || "Waiting..."}</p>
            </div>
            <div className="rounded-xl bg-white/60 p-3 text-sm">
              <p className="font-medium">Weather / Location</p>
              <p className="text-xs text-slate-700">{weather.label}</p>
              <p className="mt-1 text-xs text-slate-800">
                {weather.temp} | Wind {weather.wind}
              </p>
            </div>
            <button
              onClick={() => navigate("/settings")}
              className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Open Settings
            </button>
            <button
              onClick={handleLogout}
              className="w-full rounded-xl bg-red-500/80 px-4 py-2 text-sm font-semibold text-white"
            >
              Logout
            </button>
          </aside>

          <section className="space-y-4">
            <div className="rounded-2xl border border-white/30 bg-white/50 p-4 shadow-[0_8px_28px_rgba(2,6,23,0.18)]">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Multi-Tab Cloud Session</p>
                <button className="soft-chip" onClick={loadTabs}>
                  Refresh Tabs
                </button>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {tabs.length === 0 && <p className="text-xs text-slate-600">No tabs opened yet.</p>}
                {tabs.map((tab) => (
                  <div
                    key={tab.tabId}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                      tab.tabId === activeTabId ? "border-cyan-500 bg-cyan-100" : "border-slate-300 bg-white/80"
                    }`}
                  >
                    <button onClick={() => switchTab(tab.tabId)} className="max-w-[180px] truncate">
                      {tab.title || tab.url}
                    </button>
                    <button onClick={() => closeTab(tab.tabId)} className="rounded bg-red-500/80 px-1 text-white">
                      x
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  className="soft-field flex-1"
                  placeholder="Type to search or enter a URL"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button className="soft-chip" onClick={runSearch}>
                  {isSearching ? "Searching..." : "Smart Search"}
                </button>
                <button className="soft-chip" onClick={openTabFromInput}>
                  Open Tab
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {isStudent ? "Student restrictions enabled for blocked keywords/domains." : "Normal mode enabled."}
              </p>
              <p className="mt-1 text-xs text-cyan-700">{actionStatus}</p>
              {activeTabId && (
                <p className="mt-1 text-xs text-slate-700">
                  Active tab: {tabs.find((tab) => tab.tabId === activeTabId)?.url || "Current tab"}
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="soft-panel">
                <p className="soft-title">Recently</p>
                <div className="rounded-xl bg-white p-3 text-slate-900">
                  {recentSearches.length === 0 ? (
                    <>
                      <p className="font-semibold">{topSuggestion}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {resultItems[0]?.snippet || "Your recent searches will appear here."}
                      </p>
                    </>
                  ) : (
                    <div className="space-y-2">
                      {recentSearches.map((entry, idx) => (
                        <button
                          key={`${entry.query}-${idx}`}
                          className="w-full rounded-lg bg-slate-100 px-2 py-2 text-left text-xs"
                          onClick={() => {
                            setSearch(entry.query);
                            setActionStatus(`Loaded recent query: "${entry.query}"`);
                          }}
                        >
                          <p className="font-semibold">{entry.query}</p>
                          <p className="text-[10px] text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="soft-panel">
                <p className="soft-title">Apps</p>
                <div className="grid grid-cols-4 gap-2">
                  {appItems.map((app) => (
                    <button
                      key={app.label}
                      className="rounded-lg bg-white/75 px-2 py-3 text-[11px] text-slate-800"
                      onClick={() => openAppTab(app.url, app.label)}
                    >
                      {app.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="soft-panel">
                <p className="soft-title">Music</p>
                <div className="rounded-xl bg-gradient-to-br from-slate-800 to-blue-900 p-4 text-sm">
                  <p className="font-semibold">
                    {spotifyStatus.connected
                      ? `Spotify Connected${spotifyStatus.displayName ? ` as ${spotifyStatus.displayName}` : ""}`
                      : "Connect Spotify"}
                  </p>
                  <p className="text-xs text-white/70">
                    {spotifyStatus.connected
                      ? "Open Spotify app or reconnect if needed."
                      : "Connect your Spotify account for personalized music access."}
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-xs text-white/80">
                    {!spotifyStatus.connected ? (
                      <button className="rounded-full bg-emerald-500 px-3 py-1 font-semibold text-black" onClick={connectSpotify}>
                        Connect
                      </button>
                    ) : (
                      <button
                        className="rounded-full bg-white/20 px-2 py-1"
                        onClick={() => openAppTab("https://open.spotify.com", "Spotify")}
                      >
                        Open Spotify
                      </button>
                    )}
                    <button className="rounded-full bg-white/20 px-2 py-1" onClick={loadSpotifyStatus}>
                      Refresh Status
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="soft-panel">
              <p className="soft-title">Smart Search Results</p>
              <p className="mb-2 text-[11px] text-slate-600">
                {searchMeta.fromCache ? "Loaded from your cached results." : "Live smart results for current query."}
              </p>
              <div className="space-y-2">
                {resultItems.length === 0 && (
                  <p className="text-xs text-slate-600">Search results will appear here after you click Smart Search.</p>
                )}
                {resultItems.map((item) => (
                  <div key={`${item.url}-${item.title}`} className="rounded-xl border border-slate-300/60 bg-white/80 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <button className="flex-1 text-left" onClick={() => openResultTab(item)}>
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      </button>
                      <div className="flex items-center gap-1">
                        <span className="rounded-full bg-cyan-100 px-2 py-1 text-[10px] font-semibold text-cyan-800">
                          {item.source || "Smart"}
                        </span>
                        <button
                          onClick={() => openResultTab(item)}
                          className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          title="Open in cloud browser"
                        >
                          ↗
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{item.snippet}</p>
                    <p className="mt-1 text-[11px] text-cyan-700">{item.url}</p>
                  </div>
                ))}
              </div>
              {hasMoreResults && (
                <div className="mt-3">
                  <button
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                    onClick={loadMoreResults}
                    disabled={isSearching}
                  >
                    {isSearching ? "Loading..." : "More Results"}
                  </button>
                </div>
              )}
            </div>

            <div className="soft-panel">
              <p className="soft-title">Mini Analytics</p>
              <MiniAnalyticsChart values={analytics} />
              <p className="text-xs text-slate-600">
                {isStudent ? "Student activity trend with parental controls." : "Weekly search and tab activity trend."}
              </p>
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
