import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import GlassCard from "../components/GlassCard";
import AppLayout from "../layouts/AppLayout";

const roles = [
  {
    id: "parent",
    label: "Parent",
    subtitle: "Control center access",
    desc: "Manage student restrictions, monitor history, and receive live activity events."
  },
  {
    id: "student",
    label: "Student",
    subtitle: "Guided browsing",
    desc: "Safe browsing mode with parent-defined keyword and domain policies."
  },
  {
    id: "normal",
    label: "Normal User",
    subtitle: "Independent cloud browser",
    desc: "Full access to smart search, apps, multitab sessions, and settings."
  }
];

export default function RoleSelectionPage() {
  const navigate = useNavigate();
  return (
    <AppLayout title="Aivora Role Gateway">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_2fr]">
        <GlassCard className="space-y-4 auth-shell glass-animated">
          <p className="text-sm uppercase tracking-[0.22em] text-cyan-200">Cloud Browser OS</p>
          <h2 className="text-2xl font-semibold text-white">Choose your role to enter the secure cloud desktop.</h2>
          <p className="text-sm text-white/70">
            Each role opens a dedicated dashboard with custom permissions, monitoring, and AI assistance.
          </p>
          <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-white/70">
            Parent/Student accounts remain role-bound by email for secure policy enforcement.
          </div>
        </GlassCard>

        <div className="grid gap-3 md:grid-cols-3">
          {roles.map((role, idx) => (
            <motion.button
              key={role.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.06 * idx }}
              onClick={() => navigate(`/auth/${role.id}`)}
              className="group auth-role-card rounded-2xl border border-white/20 bg-gradient-to-b from-white/20 to-white/5 p-4 text-left backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-300/60 hover:shadow-[0_0_24px_rgba(0,245,255,0.2)]"
            >
              <p className="text-base font-semibold text-white">{role.label}</p>
              <p className="mt-1 text-xs text-cyan-200">{role.subtitle}</p>
              <p className="mt-3 text-xs leading-relaxed text-white/70">{role.desc}</p>
              <p className="mt-4 text-xs font-semibold text-neon-cyan group-hover:text-neon-pink">Continue {"->"}</p>
            </motion.button>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
