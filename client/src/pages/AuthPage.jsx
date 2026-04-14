import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import GlassCard from "../components/GlassCard";
import NeonButton from "../components/NeonButton";
import AppLayout from "../layouts/AppLayout";
import api, { setAuthToken } from "../services/api";

export default function AuthPage({ setSession }) {
  const { role } = useParams();
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", parentEmail: "", studentEmail: "" });

  const title = useMemo(() => `${isSignup ? "Sign Up" : "Login"} as ${role}`, [isSignup, role]);

  async function submit() {
    try {
      setError("");
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
    }
  }

  return (
    <AppLayout title={title}>
      <GlassCard className="max-w-xl">
        <div className="space-y-3">
          {isSignup && (
            <input className="field" placeholder="Name" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          )}
          <input className="field" placeholder="Email" onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input
            className="field"
            type="password"
            placeholder="Password"
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {role === "student" && isSignup && (
            <input
              className="field"
              placeholder="Parent email or invite code"
              onChange={(e) => setForm({ ...form, parentEmail: e.target.value })}
            />
          )}
          <div className="flex items-center gap-3">
            <NeonButton onClick={submit}>{isSignup ? "Create Account" : "Login"}</NeonButton>
            <button className="text-sm text-white/80" onClick={() => setIsSignup((v) => !v)}>
              {isSignup ? "Have an account?" : "Need to sign up?"}
            </button>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
      </GlassCard>
    </AppLayout>
  );
}
