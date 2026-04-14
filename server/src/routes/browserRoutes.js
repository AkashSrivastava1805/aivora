import { Router } from "express";
import {
  closeTabController,
  getRecentSearchesController,
  getTabsController,
  openTabController,
  reconcileTabsController,
  searchController,
  switchTabController
} from "../controllers/browserController.js";
import { authMiddleware } from "../middleware/auth.js";
import { enforceStudentRestrictions } from "../middleware/restrictionGuard.js";

const router = Router();

router.use(authMiddleware);
router.post("/open-tab", enforceStudentRestrictions, openTabController);
router.post("/close-tab", closeTabController);
router.post("/switch-tab", switchTabController);
router.post("/search", enforceStudentRestrictions, searchController);
router.get("/recent-searches", getRecentSearchesController);
router.get("/tabs", getTabsController);
router.post("/reconcile-tabs", reconcileTabsController);

export default router;
