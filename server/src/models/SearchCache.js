import mongoose from "mongoose";

const cachedResultSchema = new mongoose.Schema(
  {
    title: String,
    url: String,
    snippet: String,
    source: { type: String, default: "smart" }
  },
  { _id: false }
);

const searchCacheSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    query: { type: String, required: true, trim: true, lowercase: true },
    results: { type: [cachedResultSchema], default: [] }
  },
  { timestamps: true }
);

searchCacheSchema.index({ userId: 1, query: 1 }, { unique: true });

export const SearchCache = mongoose.model("SearchCache", searchCacheSchema);
