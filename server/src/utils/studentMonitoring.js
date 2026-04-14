import { History } from "../models/History.js";
import { Relationship } from "../models/Relationship.js";

export async function recordStudentEvent(req, { type, status = "info", details = "" }) {
  if (!req.user || req.user.role !== "student") return;

  const relationship = req.relationship || (await Relationship.findOne({ studentId: req.user._id }));
  if (!relationship) return;

  const event = {
    type,
    status,
    details,
    createdAt: new Date()
  };

  await History.findOneAndUpdate(
    { userId: req.user._id },
    { $push: { liveEvents: event } },
    { upsert: true, new: true }
  );

  const io = req.app.get("io");
  if (io) {
    io.to(`parent:${relationship.parentId}`).emit("student-live-event", {
      parentId: String(relationship.parentId),
      studentId: String(req.user._id),
      studentEmail: req.user.email,
      ...event
    });
  }
}
