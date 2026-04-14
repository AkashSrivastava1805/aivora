import mongoose from "mongoose";

const relationshipSchema = new mongoose.Schema(
  {
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

relationshipSchema.index({ parentId: 1, studentId: 1 }, { unique: true });

export const Relationship = mongoose.model("Relationship", relationshipSchema);
