import http from "http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { emitActiveTabFrame } from "./browser/streamGateway.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { getConnectedUserIds, setupSocket } from "./socket/index.js";

async function bootstrap() {
  await connectDatabase();
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: env.clientOrigins, credentials: true }
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
    const userIds = getConnectedUserIds();
    for (const userId of userIds) {
      try {
        await emitActiveTabFrame(io, userId);
      } catch (_error) {
        // Ignore per-user frame failures to keep stream loop healthy.
      }
    }
  }, 800);

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\nPort ${env.port} is already in use (EADDRINUSE).`);
      console.error("Stop the other process using this port, or use a different port in .env:");
      console.error(`  PORT=4001 npm run dev`);
      console.error("On Linux, find the process:");
      console.error(`  ss -tlnp | grep :${env.port}   OR   sudo lsof -i :${env.port}`);
      console.error("Then: kill <PID>  (or kill -9 <PID> if it does not exit)\n");
      process.exit(1);
    }
    throw err;
  });

  server.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Boot failure", error);
  process.exit(1);
});
