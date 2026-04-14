import mongoose from "mongoose";

const restrictionSchema = new mongoose.Schema(
  {
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    blockedKeywords: { type: [String], default: [] },
    blockedDomains: { type: [String], default: [] }
  },
  { timestamps: true }
);

export const Restriction = mongoose.model("Restriction", restrictionSchema);
