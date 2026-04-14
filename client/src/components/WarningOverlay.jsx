import { motion } from "framer-motion";

export default function WarningOverlay({ message, onClose }) {
  if (!message) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
    >
      <div className="max-w-md rounded-2xl border border-red-400/40 bg-red-900/20 p-6 text-center text-red-100 backdrop-blur">
        <h3 className="mb-2 text-2xl font-bold">Blocked by Parent Policy</h3>
        <p className="mb-4">{message}</p>
        <button onClick={onClose} className="rounded-lg bg-red-500 px-4 py-2 font-semibold text-white">
          Close
        </button>
      </div>
    </motion.div>
  );
}
