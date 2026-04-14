export function setupSocket(io) {
  io.on("connection", (socket) => {
    socket.on("join-user-room", ({ userId }) => {
      socket.join(`user:${userId}`);
    });

    socket.on("student-live-event", ({ parentId, payload }) => {
      io.to(`parent:${parentId}`).emit("student-live-event", payload);
    });

    socket.on("join-parent-room", ({ parentId }) => {
      socket.join(`parent:${parentId}`);
    });

    socket.on("disconnect", () => {
      // Socket cleanup can be extended with session tracking.
    });
  });
}
