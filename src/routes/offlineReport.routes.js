import { Router } from "express";
import { downloadOfflineReportPdf, getOfflineReportSummary, saveOfflineReport } from "../controllers/offlineReport.controller.js";

const router = Router();

// No authentication: the desktop application needs to sync directly after it
// comes online. QR retrieval is protected by a high-entropy, one-month token.
router.post("/", saveOfflineReport);
router.get("/:token", getOfflineReportSummary);
router.get("/:token/pdf", downloadOfflineReportPdf);

export default router;
