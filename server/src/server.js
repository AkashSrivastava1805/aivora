import http from "http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { emitActiveTabFrame } from "./browser/streamGateway.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { setupSocket } from "./socket/index.js";

async function bootstrap() {
  await connectDatabase();
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: env.clientOrigin, credentials: true }
  });

  app.set("io", io);
  setupSocket(io);

  // Lightweight frame pump for active cloud tabs.
  setInterval(async () => {
    // In production this should iterate only active sessions.
    // Placeholder event to demonstrate real-time cloud browser stream.
    io.emit("platform-heartbeat", { at: new Date().toISOString() });
  }, 5000);

  setInterval(async () => {
    // Example: emit frames to demo room; replace with active user IDs from cache.
    if (env.nodeEnv === "development") return;
    await emitActiveTabFrame(io, "demo");
  }, 2000);

  server.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Boot failure", error);
  process.exit(1);
});
