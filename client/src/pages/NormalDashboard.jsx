import BrowserDashboard from "./BrowserDashboard";

export default function NormalDashboard({ session, onLogout }) {
  return <BrowserDashboard session={session} mode="normal" onLogout={onLogout} />;
}
