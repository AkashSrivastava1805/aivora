import { motion } from "framer-motion";

export default function AppLayout({ title, children }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1a1040,#070913_45%)] text-white">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <motion.h1
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-gradient-to-r from-neon-cyan to-neon-pink bg-clip-text text-3xl font-bold text-transparent"
        >
          {title}
        </motion.h1>
        {children}
      </div>
    </div>
  );
}
