import mongoose from "mongoose";

const tabSchema = new mongoose.Schema(
  {
    tabId: { type: String, required: true },
    url: { type: String, required: true },
    title: { type: String, default: "New Tab" },
    isActive: { type: Boolean, default: false },
    isSuspended: { type: Boolean, default: false },
    lastInteractionAt: { type: Date, default: Date.now },
    estimatedRamMb: { type: Number, default: 0 },
    estimatedCpuPct: { type: Number, default: 0 }
  },
  { _id: false }
);

const browserSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    tabs: { type: [tabSchema], default: [] }
  },
  { timestamps: true }
);

export const BrowserSession = mongoose.model("BrowserSession", browserSessionSchema);
