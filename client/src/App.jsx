import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import AuthPage from "./pages/AuthPage";
import NormalDashboard from "./pages/NormalDashboard";
import ParentDashboard from "./pages/ParentDashboard";
import RoleSelectionPage from "./pages/RoleSelectionPage";
import SettingsPage from "./pages/SettingsPage";
import StudentDashboard from "./pages/StudentDashboard";
import api, { bindApiAuth, setAuthToken } from "./services/api";
import { socket } from "./services/socket";

export default function App() {
  const [session, setSession] = useState(() => {
    const raw = localStorage.getItem("aivora_session");
    return raw ? JSON.parse(raw) : null;
  });

  const [networkBanner, setNetworkBanner] = useState({
    type: "ok",
    message: ""
  });
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncAgeSec, setSyncAgeSec] = useState(null);

  useEffect(() => {
    setAuthToken(session?.token || "");
  }, [session]);

  const setSessionSafe = useMemo(
    () => (nextSessionOrUpdater) => {
      setSession((prev) => {
        const nextSession =
          typeof nextSessionOrUpdater === "function" ? nextSessionOrUpdater(prev) : nextSessionOrUpdater;
        localStorage.setItem("aivora_session", JSON.stringify(nextSession));
        return nextSession;
      });
    },
    []
  );

  const logout = useMemo(
    () => () => {
      localStorage.removeItem("aivora_session");
      setAuthToken("");
      setSession(null);
    },
    []
  );

  useEffect(() => {
    bindApiAuth({
      getSession: () => session,
      onSessionUpdate: (nextSession) => {
        localStorage.setItem("aivora_session", JSON.stringify(nextSession));
        setSession(nextSession);
      },
      onLogout: () => {
        localStorage.removeItem("aivora_session");
        setAuthToken("");
        setSession(null);
      }
    });
  }, [session]);

  useEffect(() => {
    function markOffline() {
      setNetworkBanner({
        type: "offline",
        message: "You are offline. Trying to reconnect to cloud services..."
      });
    }

    function markOnline() {
      setNetworkBanner({
        type: "reconnecting",
        message: "Network restored. Reconnecting to cloud services..."
      });
    }

    window.addEventListener("offline", markOffline);
    window.addEventListener("online", markOnline);

    let cloudTimer = null;
    async function monitorCloud() {
      try {
        await api.get("/health");
        const now = Date.now();
        setLastSyncedAt(now);
        setNetworkBanner((prev) =>
          prev.type === "offline" || prev.type === "reconnecting"
            ? { type: "online", message: "Connected to cloud services." }
            : prev
        );
      } catch (_error) {
        setNetworkBanner({
          type: "offline",
          message: "Cloud backend is unreachable. Retrying..."
        });
      }
    }
    monitorCloud();
    cloudTimer = setInterval(monitorCloud, 12000);

    socket.on("connect", () => {
      const now = Date.now();
      setLastSyncedAt(now);
      setNetworkBanner({ type: "online", message: "Realtime connection restored." });
    });
    socket.on("disconnect", () => {
      setNetworkBanner({ type: "reconnecting", message: "Realtime channel disconnected. Reconnecting..." });
    });

    const clearTimer = setTimeout(() => {
      setNetworkBanner((prev) => (prev.type === "online" ? { type: "ok", message: "" } : prev));
    }, 3500);

    return () => {
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("online", markOnline);
      if (cloudTimer) clearInterval(cloudTimer);
      clearTimeout(clearTimer);
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

  useEffect(() => {
    if (!lastSyncedAt) {
      setSyncAgeSec(null);
      return;
    }

    function updateSyncAge() {
      setSyncAgeSec(Math.max(0, Math.floor((Date.now() - lastSyncedAt) / 1000)));
    }

    updateSyncAge();
    const timer = setInterval(updateSyncAge, 1000);
    return () => clearInterval(timer);
  }, [lastSyncedAt]);

  return (
    <>
      {networkBanner.message && (
        <div
          className={`fixed left-1/2 top-3 z-[100] -translate-x-1/2 rounded-full px-4 py-2 text-xs font-semibold ${
            networkBanner.type === "offline"
              ? "bg-red-600 text-white"
              : networkBanner.type === "reconnecting"
                ? "bg-amber-500 text-black"
                : "bg-emerald-500 text-black"
          }`}
        >
          <span>{networkBanner.message}</span>
          {syncAgeSec !== null && (
            <span className="ml-2 opacity-90">Last synced {syncAgeSec}s ago</span>
          )}
        </div>
      )}
      <Routes>
        <Route path="/" element={<RoleSelectionPage />} />
        <Route path="/auth/:role" element={<AuthPage setSession={setSessionSafe} />} />
        <Route
          path="/browser"
          element={
            session?.user?.role === "student" ? (
              <Navigate to="/student-dashboard" replace />
            ) : session?.user?.role === "normal" ? (
              <Navigate to="/normal-dashboard" replace />
            ) : session?.user?.role === "parent" ? (
              <Navigate to="/parent" replace />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/student-dashboard"
          element={
            session?.user?.role === "student" ? (
              <StudentDashboard session={session} onLogout={logout} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/normal-dashboard"
          element={
            session?.user?.role === "normal" ? (
              <NormalDashboard session={session} onLogout={logout} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/settings"
          element={
            session?.user?.role ? (
              <SettingsPage session={session} setSession={setSessionSafe} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/parent"
          element={
            session?.user?.role === "parent" ? (
              <ParentDashboard session={session} onLogout={logout} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
