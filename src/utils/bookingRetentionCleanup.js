import { newBooking } from "../models/NewBooking.model.js";

const BOOKING_RETENTION_RULES = [
    {
        label: "onHold",
        statuses: ["On Hold"],
        monthsOld: 3
    },
    {
        label: "pending",
        statuses: ["pending"],
        monthsOld: 2
    },
    {
        label: "cancelled",
        statuses: ["cancelled", "canceled"],
        monthsOld: 1
    }
];

const getCutoffDate = (monthsOld) => {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld);
    return cutoffDate;
};

const cleanupExpiredBookingsByTenant = async () => {
    try {
        console.log("[Booking Retention] Tenant-wise booking cleanup started");

        const tenantIds = await newBooking.distinct("tenantId", {
            tenantId: { $exists: true, $ne: null }
        });

        console.log(`[Booking Retention] Total tenants found: ${tenantIds.length}`);

        const totals = {
            matched: 0,
            deleted: 0
        };

        for (const tenantId of tenantIds) {
            const tenantSummary = [];

            for (const rule of BOOKING_RETENTION_RULES) {
                const cutoffDate = getCutoffDate(rule.monthsOld);
                const deleteFilter = {
                    tenantId,
                    status: rule.statuses.length === 1 ? rule.statuses[0] : { $in: rule.statuses },
                    createdAt: { $lt: cutoffDate }
                };

                const matchedCount = await newBooking.countDocuments(deleteFilter);
                let deletedCount = 0;

                if (matchedCount > 0) {
                    const deleteResult = await newBooking.deleteMany(deleteFilter);
                    deletedCount = deleteResult.deletedCount || 0;
                }

                totals.matched += matchedCount;
                totals.deleted += deletedCount;

                tenantSummary.push(
                    `${rule.label}: matched=${matchedCount}, deleted=${deletedCount}, cutoff=${cutoffDate.toISOString()}`
                );
            }

            console.log(`[Booking Retention] Tenant ${tenantId}: ${tenantSummary.join(" | ")}`);
        }

        console.log(`[Booking Retention] Total matched bookings: ${totals.matched}`);
        console.log(`[Booking Retention] Total deleted bookings: ${totals.deleted}`);
        console.log("[Booking Retention] Tenant-wise booking cleanup completed");
    } catch (error) {
        console.error("[Booking Retention] Cleanup failed:", error.message);
    }
};

export { cleanupExpiredBookingsByTenant };
