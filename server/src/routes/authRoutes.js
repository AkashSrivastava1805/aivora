import { Router } from "express";
import {
  changePassword,
  getMe,
  getSpotifyConnectUrl,
  getSpotifyStatus,
  login,
  refreshSession,
  signup,
  spotifyCallback,
  updateAdvancedSettings,
  updateMe,
  updatePreferences
} from "../controllers/authController.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/refresh", authMiddleware, refreshSession);
router.get("/me", authMiddleware, getMe);
router.patch("/me", authMiddleware, updateMe);
router.patch("/me/preferences", authMiddleware, updatePreferences);
router.patch("/me/password", authMiddleware, changePassword);
router.patch("/me/settings", authMiddleware, updateAdvancedSettings);
router.get("/spotify/connect", authMiddleware, getSpotifyConnectUrl);
router.get("/spotify/status", authMiddleware, getSpotifyStatus);
router.get("/spotify/callback", spotifyCallback);

export default router;
