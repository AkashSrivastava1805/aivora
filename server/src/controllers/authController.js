import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { Relationship } from "../models/Relationship.js";
import { Restriction } from "../models/Restriction.js";
import { User } from "../models/User.js";

function buildToken(user) {
  return jwt.sign({ userId: user._id, role: user.role }, env.jwtSecret, { expiresIn: "7d" });
}

function buildSpotifyState(user) {
  return Buffer.from(`${user._id}:${Date.now()}`).toString("base64url");
}

export async function signup(req, res) {
  const { name, email, password, role, parentEmail } = req.body;
  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({
      message: `This email is already registered as ${existing.role}. Use the same role to login.`
    });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role,
    linkedParentEmail: role === "student" ? parentEmail || null : null
  });

  if (role === "parent") {
    await Restriction.create({ parentId: user._id, blockedKeywords: [], blockedDomains: [] });
  }

  if (role === "student" && parentEmail) {
    const parent = await User.findOne({ email: parentEmail, role: "parent" });
    if (parent) {
      await Relationship.create({ parentId: parent._id, studentId: user._id });
      user.linkedParentId = parent._id;
      await user.save();
    }
  }

  res.status(201).json({
    token: buildToken(user),
    user: { id: user._id, name: user.name, email: user.email, role: user.role }
  });
}

export async function login(req, res) {
  const { email, password, role } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  if (user.role !== role) {
    return res.status(403).json({
      message: `Role mismatch: this email is registered as ${user.role}. Login with the correct role.`
    });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) return res.status(401).json({ message: "Invalid credentials" });

  res.json({
    token: buildToken(user),
    user: { id: user._id, name: user.name, email: user.email, role: user.role }
  });
}

export async function getMe(req, res) {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      avatarUrl: req.user.avatarUrl,
      locationLabel: req.user.locationLabel,
      integrations: req.user.integrations,
      preferences: req.user.preferences
    }
  });
}

export async function updateMe(req, res) {
  const { name, email, avatarUrl, locationLabel } = req.body;
  const existing = await User.findOne({
    email,
    _id: { $ne: req.user._id }
  });
  if (existing) return res.status(409).json({ message: "Email already in use" });

  req.user.name = name?.trim() || req.user.name;
  req.user.email = email?.trim().toLowerCase() || req.user.email;
  if (typeof avatarUrl === "string") req.user.avatarUrl = avatarUrl;
  if (typeof locationLabel === "string") req.user.locationLabel = locationLabel;
  await req.user.save();

  res.json({
    message: "Profile updated",
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      avatarUrl: req.user.avatarUrl,
      locationLabel: req.user.locationLabel
    }
  });
}

export async function updatePreferences(req, res) {
  const { theme, smartSuggestions } = req.body;
  req.user.preferences = {
    ...req.user.preferences,
    ...(theme ? { theme } : {}),
    ...(typeof smartSuggestions === "boolean" ? { smartSuggestions } : {})
  };
  await req.user.save();
  res.json({ message: "Preferences updated", preferences: req.user.preferences });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) return res.status(401).json({ message: "Current password is incorrect" });

  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();
  res.json({ message: "Password updated successfully" });
}

export async function updateAdvancedSettings(req, res) {
  const { notifications, privacy, devices } = req.body;

  req.user.preferences = {
    ...req.user.preferences,
    ...(notifications
      ? {
          notifications: {
            ...req.user.preferences?.notifications,
            ...notifications
          }
        }
      : {}),
    ...(privacy
      ? {
          privacy: {
            ...req.user.preferences?.privacy,
            ...privacy
          }
        }
      : {}),
    ...(devices
      ? {
          devices: {
            ...req.user.preferences?.devices,
            ...devices
          }
        }
      : {})
  };

  await req.user.save();
  res.json({ message: "Advanced settings updated", preferences: req.user.preferences });
}

export async function getSpotifyConnectUrl(req, res) {
  if (!env.spotifyClientId) {
    return res.status(400).json({ message: "Spotify is not configured on server" });
  }

  const state = buildSpotifyState(req.user);
  const scope = encodeURIComponent("user-read-email user-read-private");
  const authUrl =
    "https://accounts.spotify.com/authorize" +
    `?response_type=code&client_id=${encodeURIComponent(env.spotifyClientId)}` +
    `&scope=${scope}` +
    `&redirect_uri=${encodeURIComponent(env.spotifyRedirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  res.json({ authUrl });
}

export async function spotifyCallback(req, res) {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.status(400).send("Missing code/state");
  }
  if (!env.spotifyClientId || !env.spotifyClientSecret) {
    return res.status(400).send("Spotify is not configured on server");
  }

  const decoded = Buffer.from(String(state), "base64url").toString("utf8");
  const userId = decoded.split(":")[0];
  if (!userId) return res.status(400).send("Invalid state");

  const tokenResp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${env.spotifyClientId}:${env.spotifyClientSecret}`).toString("base64")}`
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: env.spotifyRedirectUri
    })
  });

  if (!tokenResp.ok) {
    const errText = await tokenResp.text();
    return res.status(400).send(`Spotify token exchange failed: ${errText}`);
  }

  const tokenData = await tokenResp.json();
  const profileResp = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const profile = profileResp.ok ? await profileResp.json() : null;

  await User.findByIdAndUpdate(userId, {
    $set: {
      "integrations.spotify.connected": true,
      "integrations.spotify.displayName": profile?.display_name || "",
      "integrations.spotify.accessToken": tokenData.access_token || "",
      "integrations.spotify.refreshToken": tokenData.refresh_token || "",
      "integrations.spotify.tokenExpiresAt": new Date(Date.now() + (tokenData.expires_in || 3600) * 1000)
    }
  });

  res.send(`
<!doctype html>
<html>
  <body style="font-family:Arial;padding:24px;background:#0b1220;color:#fff;">
    <h2>Spotify connected successfully</h2>
    <p>You can close this window and return to Aivora.</p>
    <script>window.close && window.close();</script>
  </body>
</html>
  `);
}

export async function getSpotifyStatus(req, res) {
  const spotify = req.user.integrations?.spotify || {};
  res.json({
    connected: Boolean(spotify.connected),
    displayName: spotify.displayName || "",
    expiresAt: spotify.tokenExpiresAt || null
  });
}
