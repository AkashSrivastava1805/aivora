import { useState } from "react";
import api from "../services/api";
import NeonButton from "./NeonButton";

export default function AccountSettingsPanel({ user, onClose, onProfileUpdate }) {
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [theme, setTheme] = useState(user?.preferences?.theme || "dark");
  const [smartSuggestions, setSmartSuggestions] = useState(Boolean(user?.preferences?.smartSuggestions));
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState("");

  async function saveProfile() {
    const { data } = await api.patch("/auth/me", { name, email });
    onProfileUpdate((prev) => ({ ...prev, user: { ...prev.user, ...data.user } }));
    setStatus("Profile updated");
  }

  async function savePreferences() {
    const { data } = await api.patch("/auth/me/preferences", { theme, smartSuggestions });
    onProfileUpdate((prev) => ({
      ...prev,
      user: { ...prev.user, preferences: data.preferences }
    }));
    setStatus("Preferences updated");
  }

  async function savePassword() {
    if (!currentPassword || !newPassword) return;
    await api.patch("/auth/me/password", { currentPassword, newPassword });
    setCurrentPassword("");
    setNewPassword("");
    setStatus("Password changed");
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6">
      <div className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-auto rounded-2xl border border-white/20 bg-[#0f1830]/80 p-6 backdrop-blur-xl">
        <h3 className="text-2xl font-semibold">Account Settings</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          <input className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        </div>
        <NeonButton onClick={saveProfile}>Save Profile</NeonButton>

        <div className="rounded-xl border border-white/10 p-4">
          <p className="mb-2 text-sm text-white/80">Preferences</p>
          <div className="mb-3 flex gap-3">
            <button
              className={`rounded-lg px-3 py-2 ${theme === "dark" ? "bg-neon-cyan text-black" : "bg-white/10"}`}
              onClick={() => setTheme("dark")}
            >
              Dark
            </button>
            <button
              className={`rounded-lg px-3 py-2 ${theme === "light" ? "bg-neon-cyan text-black" : "bg-white/10"}`}
              onClick={() => setTheme("light")}
            >
              Light
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={smartSuggestions}
              onChange={(e) => setSmartSuggestions(e.target.checked)}
            />
            Enable smart suggestions
          </label>
          <div className="mt-3">
            <NeonButton onClick={savePreferences}>Save Preferences</NeonButton>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 p-4">
          <p className="mb-2 text-sm text-white/80">Security</p>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="field"
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <input
              className="field"
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="mt-3">
            <NeonButton onClick={savePassword}>Update Password</NeonButton>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-neon-cyan">{status}</p>
          <button className="rounded-lg bg-white/10 px-4 py-2" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
