import { Router } from "express";
import { resetDatabase } from "../utils/resetDatabase.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { SuperAdmin } from "../models/superAdmin.model.js";

const router = Router();

/**
 * @route   POST /api/maintenance/reset-admin
 * @desc    Reset default super admin (OFFLINE MODE ONLY)
 * @access  Public (Offline mode only)
 */
router.post(
    "/reset-admin",
    asyncHandler(async (req, res) => {
        // Only allow in offline mode
        if (String(process.env.OFFLINE_MODE || "").toLowerCase() !== "true") {
            return res.status(403).json({
                success: false,
                message: "This operation is only available in offline mode",
            });
        }

        const result = await resetDatabase();

        return res.status(200).json({
            success: true,
            message: "Reset complete! Refresh your browser and use the new credentials.",
            data: result,
        });
    })
);

/**
 * @route   GET /api/maintenance/status
 * @desc    Check database and admin status
 * @access  Public
 */
router.get(
    "/status",
    asyncHandler(async (req, res) => {
        try {
            const adminCount = await SuperAdmin.countDocuments();
            const admins = await SuperAdmin.find({}, { username: 1, email: 1, role: 1 }).lean();

            return res.status(200).json({
                success: true,
                database: {
                    status: "connected",
                    adminsCount: adminCount,
                    admins: admins.map((a) => ({
                        username: a.username,
                        email: a.email,
                        role: a.role,
                    })),
                },
                offlineMode: String(process.env.OFFLINE_MODE || "").toLowerCase() === "true",
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Database connection failed",
                error: error.message,
            });
        }
    })
);

export default router;
