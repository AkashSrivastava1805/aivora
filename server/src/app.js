import cors from "cors";
import express from "express";
import morgan from "morgan";
import authRoutes from "./routes/authRoutes.js";
import browserRoutes from "./routes/browserRoutes.js";
import parentRoutes from "./routes/parentRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { env } from "./config/env.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (env.clientOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/auth", authRoutes);
  app.use("/parent", parentRoutes);
  app.use("/browser", browserRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
