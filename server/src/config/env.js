import dotenv from "dotenv";

dotenv.config();

/** Comma-separated list, e.g. https://api.example.com,http://localhost:5173 */
function parseClientOrigins(raw) {
  const value = raw && String(raw).trim() ? String(raw).trim() : "http://localhost:5173";
  const list = value.split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set(list)];
}

export const env = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/aivora",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-production",
  nodeEnv: process.env.NODE_ENV || "development",
  /** Allowed browser origins for CORS + Socket.IO (local Vite + deployed app, etc.) */
  clientOrigins: parseClientOrigins(process.env.CLIENT_ORIGIN),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || "",
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
  spotifyRedirectUri: process.env.SPOTIFY_REDIRECT_URI || "http://localhost:4000/auth/spotify/callback"
};
