import mongoose from "mongoose";

const historySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    searches: [
      {
        query: String,
        blocked: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    visitedUrls: [
      {
        url: String,
        title: String,
        blocked: { type: Boolean, default: false },
        durationSeconds: { type: Number, default: 0 },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    liveEvents: [
      {
        type: { type: String, required: true },
        status: { type: String, enum: ["allowed", "blocked", "info"], default: "info" },
        details: { type: String, default: "" },
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

export const History = mongoose.model("History", historySchema);
