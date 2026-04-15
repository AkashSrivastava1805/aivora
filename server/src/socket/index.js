import { applyRemoteBrowserInput, emitActiveTabFrame } from "../browser/streamGateway.js";

const connectedUserIds = new Set();

export function getConnectedUserIds() {
  return [...connectedUserIds];
}

export function setupSocket(io) {
  io.on("connection", (socket) => {
    socket.on("join-user-room", ({ userId }) => {
      socket.join(`user:${userId}`);
      if (userId) {
        socket.data.userId = String(userId);
        connectedUserIds.add(String(userId));
      }
    });

    socket.on("request-tab-frame", async () => {
      const uid = socket.data.userId;
      if (!uid) return;
      try {
        await emitActiveTabFrame(io, uid);
      } catch (_error) {
        // ignore
      }
    });

    socket.on("browser-input", async (payload) => {
      const uid = socket.data.userId;
      if (!uid || String(payload?.userId) !== uid) return;
      try {
        await applyRemoteBrowserInput(uid, payload.input);
        await emitActiveTabFrame(io, uid);
      } catch (_error) {
        // ignore
      }
    });

    socket.on("student-live-event", ({ parentId, payload }) => {
      io.to(`parent:${parentId}`).emit("student-live-event", payload);
    });

    socket.on("join-parent-room", ({ parentId }) => {
      socket.join(`parent:${parentId}`);
    });

    socket.on("disconnect", () => {
      if (socket.data.userId) {
        connectedUserIds.delete(socket.data.userId);
      }
    });
  });
}
