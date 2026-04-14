import { useNavigate } from "react-router-dom";
import GlassCard from "../components/GlassCard";
import NeonButton from "../components/NeonButton";
import AppLayout from "../layouts/AppLayout";

const roles = [
  { id: "parent", label: "Parent" },
  { id: "student", label: "Student" },
  { id: "normal", label: "Normal User" }
];

export default function RoleSelectionPage() {
  const navigate = useNavigate();
  return (
    <AppLayout title="Aivora Role Gateway">
      <GlassCard className="max-w-2xl">
        <p className="mb-4 text-white/80">Select your identity to continue into your cloud browser experience.</p>
        <div className="grid gap-3 md:grid-cols-3">
          {roles.map((role) => (
            <NeonButton key={role.id} onClick={() => navigate(`/auth/${role.id}`)}>
              {role.label}
            </NeonButton>
          ))}
        </div>
      </GlassCard>
    </AppLayout>
  );
}
