import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import api from "../services/api";
import NeonButton from "../components/NeonButton";

const tabs = ["Profile", "Privacy", "Devices", "Notifications"];

export default function SettingsPage({ session, setSession }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Profile");
  const [status, setStatus] = useState("");
  const [profile, setProfile] = useState({
    name: session?.user?.name || "",
    email: session?.user?.email || "",
    avatarUrl: session?.user?.avatarUrl || "",
    locationLabel: session?.user?.locationLabel || ""
  });
  const [privacy, setPrivacy] = useState({
    shareActivity: false,
    searchHistoryVisible: true
  });
  const [devices, setDevices] = useState({
    rememberDeviceDays: 30,
    trustedDevices: []
  });
  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    pushAlerts: true,
    weeklySummary: true
  });

  useEffect(() => {
    async function loadMe() {
      const { data } = await api.get("/auth/me");
      setProfile((prev) => ({
        ...prev,
        name: data.user.name || "",
        email: data.user.email || "",
        avatarUrl: data.user.avatarUrl || "",
        locationLabel: data.user.locationLabel || ""
      }));
      setPrivacy(data.user.preferences?.privacy || privacy);
      setDevices(data.user.preferences?.devices || devices);
      setNotifications(data.user.preferences?.notifications || notifications);
    }
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trustedDevicesPreview = useMemo(() => (devices.trustedDevices || []).join(", ") || "No trusted devices", [devices]);

  function goBackToDashboard() {
    if (session?.user?.role === "student") {
      navigate("/student-dashboard");
      return;
    }
    if (session?.user?.role === "normal") {
      navigate("/normal-dashboard");
      return;
    }
    if (session?.user?.role === "parent") {
      navigate("/parent");
      return;
    }
    navigate("/");
  }

  function handleAvatarUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfile((prev) => ({ ...prev, avatarUrl: reader.result }));
      }
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    const { data } = await api.patch("/auth/me", profile);
    setSession((prev) => ({ ...prev, user: { ...prev.user, ...data.user } }));
    setStatus("Profile updated");
  }

  async function saveAdvancedSettings() {
    const { data } = await api.patch("/auth/me/settings", { privacy, devices, notifications });
    setSession((prev) => ({
      ...prev,
      user: { ...prev.user, preferences: data.preferences }
    }));
    setStatus("Settings updated");
  }

  return (
    <AppLayout title="Account Settings">
      <div className="glass-animated rounded-3xl border border-white/25 bg-white/10 p-5 backdrop-blur-2xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <button className="soft-chip" onClick={goBackToDashboard}>
            Go Back
          </button>
          <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                activeTab === tab ? "bg-neon-cyan text-black" : "bg-white/15"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
          </div>
        </div>

        {activeTab === "Profile" && (
          <div className="space-y-4 rounded-2xl border border-white/15 bg-white/10 p-4">
            <h3 className="text-xl font-semibold">Profile Setup</h3>
            <div className="flex items-center gap-4">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="avatar" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-2xl">
                  {profile.name?.[0] || "U"}
                </div>
              )}
              <label className="soft-chip cursor-pointer">
                Upload Avatar
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="field"
                value={profile.name}
                onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Name"
              />
              <input
                className="field"
                value={profile.email}
                onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email"
              />
              <input
                className="field md:col-span-2"
                value={profile.locationLabel}
                onChange={(e) => setProfile((prev) => ({ ...prev, locationLabel: e.target.value }))}
                placeholder="Location label (e.g., New York, US)"
              />
            </div>
            <NeonButton onClick={saveProfile}>Save Profile</NeonButton>
          </div>
        )}

        {activeTab === "Privacy" && (
          <div className="space-y-3 rounded-2xl border border-white/15 bg-white/10 p-4">
            <h3 className="text-xl font-semibold">Privacy Controls</h3>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={privacy.shareActivity}
                onChange={(e) => setPrivacy((prev) => ({ ...prev, shareActivity: e.target.checked }))}
              />
              Share activity insights with personalization engine
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={privacy.searchHistoryVisible}
                onChange={(e) => setPrivacy((prev) => ({ ...prev, searchHistoryVisible: e.target.checked }))}
              />
              Keep search history visible in dashboard
            </label>
            <NeonButton onClick={saveAdvancedSettings}>Save Privacy</NeonButton>
          </div>
        )}

        {activeTab === "Devices" && (
          <div className="space-y-3 rounded-2xl border border-white/15 bg-white/10 p-4">
            <h3 className="text-xl font-semibold">Devices</h3>
            <label className="text-sm">Remember device for (days)</label>
            <input
              className="field max-w-xs"
              type="number"
              value={devices.rememberDeviceDays}
              onChange={(e) =>
                setDevices((prev) => ({ ...prev, rememberDeviceDays: Number(e.target.value) || 30 }))
              }
            />
            <p className="text-sm text-white/70">Trusted devices: {trustedDevicesPreview}</p>
            <NeonButton onClick={saveAdvancedSettings}>Save Device Settings</NeonButton>
          </div>
        )}

        {activeTab === "Notifications" && (
          <div className="space-y-3 rounded-2xl border border-white/15 bg-white/10 p-4">
            <h3 className="text-xl font-semibold">Notifications</h3>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={notifications.emailAlerts}
                onChange={(e) => setNotifications((prev) => ({ ...prev, emailAlerts: e.target.checked }))}
              />
              Email alerts
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={notifications.pushAlerts}
                onChange={(e) => setNotifications((prev) => ({ ...prev, pushAlerts: e.target.checked }))}
              />
              Push alerts
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={notifications.weeklySummary}
                onChange={(e) => setNotifications((prev) => ({ ...prev, weeklySummary: e.target.checked }))}
              />
              Weekly summary
            </label>
            <NeonButton onClick={saveAdvancedSettings}>Save Notifications</NeonButton>
          </div>
        )}
      </div>
      <p className="mt-4 text-sm text-neon-cyan">{status}</p>
    </AppLayout>
  );
}
