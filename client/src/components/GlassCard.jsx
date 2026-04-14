export default function GlassCard({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-white/20 bg-white/10 p-6 shadow-[0_0_30px_rgba(0,245,255,0.12)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}
