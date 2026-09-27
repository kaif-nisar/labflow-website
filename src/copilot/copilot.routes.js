import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import {
  chatWithCopilot,
  executeCopilotAction,
  getCopilotStatus,
  searchCatalog
} from "./copilot.controller.js";

const router = Router();

// All copilot routes are protected by verifyJWT
router.use(verifyJWT);

router.post("/chat", chatWithCopilot);
router.post("/execute-action", executeCopilotAction);
router.get("/status", getCopilotStatus);
router.get("/search", searchCatalog);

export default router;
