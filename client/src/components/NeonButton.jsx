export default function NeonButton({ children, className = "", ...props }) {
  return (
    <button
      className={`rounded-xl bg-gradient-to-r from-neon-cyan/80 to-neon-purple/80 px-4 py-2 font-semibold text-black transition hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(0,245,255,0.4)] ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
