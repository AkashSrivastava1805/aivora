import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import GlassCard from "../components/GlassCard";
import NeonButton from "../components/NeonButton";
import AppLayout from "../layouts/AppLayout";
import api, { setAuthToken } from "../services/api";

function FieldWithIcon({ icon, children }) {
  return (
    <div className="auth-input-wrap">
      <span className="auth-input-icon">{icon}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export default function AuthPage({ setSession }) {
  const { role } = useParams();
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", parentEmail: "", studentEmail: "" });

  const roleLabel = useMemo(() => {
    if (role === "parent") return "Parent";
    if (role === "student") return "Student";
    return "Normal User";
  }, [role]);

  const title = useMemo(() => `${isSignup ? "Create Account" : "Welcome Back"} - ${roleLabel}`, [isSignup, roleLabel]);

  async function submit() {
    try {
      setError("");
      setLoading(true);
      const endpoint = isSignup ? "/auth/signup" : "/auth/login";
      const payload = { ...form, role };
      const { data } = await api.post(endpoint, payload);
      setAuthToken(data.token);
      setSession(data);
      if (data.user.role === "parent") navigate("/parent");
      else if (data.user.role === "student") navigate("/student-dashboard");
      else navigate("/normal-dashboard");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout title={title}>
      <div className="mb-3">
        <button
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1.6fr]">
        <GlassCard className="space-y-4 auth-shell glass-animated">
          <p className="text-xs uppercase tracking-[0.22em] text-neon-cyan">Role Session</p>
          <div className="flex items-center gap-2">
            <span className="auth-icon-wrap text-lg">{role === "parent" ? "🛡️" : role === "student" ? "🎓" : "🌐"}</span>
            <h2 className="text-2xl font-semibold text-white">{roleLabel}</h2>
          </div>
          <p className="text-sm text-white/70">
            {role === "parent" && "Manage students, enforce restrictions, and monitor activity in real time."}
            {role === "student" && "Access guided browser mode with parental policy controls."}
            {role === "normal" && "Use your independent cloud browser with full smart features."}
          </p>
          <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-white/70">
            Role is permanently linked with email identity for secure login.
          </div>
        </GlassCard>

        <GlassCard className="auth-card max-w-2xl glass-animated">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            {isSignup && (
              <FieldWithIcon icon="👤">
                <input
                  className="field auth-field"
                  placeholder="Full name"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </FieldWithIcon>
            )}
            <FieldWithIcon icon="✉️">
              <input
                className="field auth-field"
                placeholder="Email address"
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </FieldWithIcon>
            <FieldWithIcon icon="🔒">
              <input
                className="field auth-field"
                type="password"
                placeholder="Password"
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </FieldWithIcon>
            {role === "student" && isSignup && (
              <FieldWithIcon icon="👨‍👩‍👧">
                <input
                  className="field auth-field"
                  placeholder="Parent email or invite code"
                  onChange={(e) => setForm({ ...form, parentEmail: e.target.value })}
                />
              </FieldWithIcon>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <NeonButton onClick={submit} disabled={loading}>
                {loading ? "Processing..." : isSignup ? "Create Account" : "Login"}
              </NeonButton>
              <button className="text-sm font-semibold text-cyan-200 hover:text-white" onClick={() => setIsSignup((v) => !v)}>
                {isSignup ? "Have an account?" : "Need to sign up?"}
              </button>
            </div>
            {error && <p className="rounded-lg border border-red-400/30 bg-red-500/10 p-2 text-sm text-red-300">{error}</p>}
          </motion.div>
        </GlassCard>
      </div>
    </AppLayout>
  );
}
