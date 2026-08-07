import { Router } from "express";
import rateLimit from "express-rate-limit";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import { createQrReportLink, downloadQrReport, issueQrReportDevice, requireQrReportDevice, showQrReport } from "../controllers/qrReport.controller.js";

const router = Router();
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 80, standardHeaders: true, legacyHeaders: false });

router.post("/devices", verifyJWT, issueQrReportDevice);
router.post("/", uploadLimiter, requireQrReportDevice, createQrReportLink);
router.get("/:token/download", downloadQrReport);
router.get("/:token", showQrReport);

export default router;
