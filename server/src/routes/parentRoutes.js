import { Router } from "express";
import {
  addKeyword,
  blockDomain,
  getRestrictions,
  getStudentHistory,
  linkStudent,
  removeDomain,
  removeKeyword,
  updateDomain,
  updateKeyword
} from "../controllers/parentController.js";
import { authMiddleware, roleGuard } from "../middleware/auth.js";

const router = Router();

router.use(authMiddleware, roleGuard("parent"));
router.post("/link-student", linkStudent);
router.get("/restrictions", getRestrictions);
router.post("/add-keyword", addKeyword);
router.post("/remove-keyword", removeKeyword);
router.patch("/update-keyword", updateKeyword);
router.post("/block-domain", blockDomain);
router.post("/remove-domain", removeDomain);
router.patch("/update-domain", updateDomain);
router.get("/get-student-history", getStudentHistory);

export default router;
