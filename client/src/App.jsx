import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import AuthPage from "./pages/AuthPage";
import NormalDashboard from "./pages/NormalDashboard";
import ParentDashboard from "./pages/ParentDashboard";
import RoleSelectionPage from "./pages/RoleSelectionPage";
import SettingsPage from "./pages/SettingsPage";
import StudentDashboard from "./pages/StudentDashboard";
import { setAuthToken } from "./services/api";

export default function App() {
  const [session, setSession] = useState(() => {
    const raw = localStorage.getItem("aivora_session");
    return raw ? JSON.parse(raw) : null;
  });

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

  return (
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
  );
}
