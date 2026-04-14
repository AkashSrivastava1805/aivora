import BrowserDashboard from "./BrowserDashboard";

export default function StudentDashboard({ session, onLogout }) {
  return <BrowserDashboard session={session} mode="student" onLogout={onLogout} />;
}
