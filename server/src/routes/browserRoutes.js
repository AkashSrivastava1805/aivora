import { Router } from "express";
import {
  closeTabController,
  getEngineStatusController,
  getRecentSearchesController,
  getTabsController,
  navigateActiveTabController,
  openTabController,
  reconcileTabsController,
  searchController,
  switchTabController,
  validateUrlController
} from "../controllers/browserController.js";
import { authMiddleware } from "../middleware/auth.js";
import { enforceStudentRestrictions } from "../middleware/restrictionGuard.js";

const router = Router();

router.use(authMiddleware);
router.post("/open-tab", enforceStudentRestrictions, openTabController);
router.post("/navigate-active", enforceStudentRestrictions, navigateActiveTabController);
router.post("/validate-url", enforceStudentRestrictions, validateUrlController);
router.post("/close-tab", closeTabController);
router.post("/switch-tab", switchTabController);
router.post("/search", enforceStudentRestrictions, searchController);
router.get("/recent-searches", getRecentSearchesController);
router.get("/tabs", getTabsController);
router.get("/engine-status", getEngineStatusController);
router.post("/reconcile-tabs", reconcileTabsController);

export default router;
