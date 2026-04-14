import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["parent", "student", "normal"], required: true },
    avatarUrl: { type: String, default: "" },
    locationLabel: { type: String, default: "" },
    linkedParentEmail: { type: String, default: null },
    linkedParentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    integrations: {
      spotify: {
        connected: { type: Boolean, default: false },
        displayName: { type: String, default: "" },
        accessToken: { type: String, default: "" },
        refreshToken: { type: String, default: "" },
        tokenExpiresAt: { type: Date, default: null }
      }
    },
    preferences: {
      theme: { type: String, default: "dark" },
      smartSuggestions: { type: Boolean, default: true },
      notifications: {
        emailAlerts: { type: Boolean, default: true },
        pushAlerts: { type: Boolean, default: true },
        weeklySummary: { type: Boolean, default: true }
      },
      privacy: {
        shareActivity: { type: Boolean, default: false },
        searchHistoryVisible: { type: Boolean, default: true }
      },
      devices: {
        rememberDeviceDays: { type: Number, default: 30 },
        trustedDevices: { type: [String], default: [] }
      }
    }
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
