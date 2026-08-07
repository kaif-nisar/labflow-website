// import { newBooking } from "../models/NewBooking.model.js";
// import { customization } from "../models/printsetting.model.js";
// import { reports } from "../models/reportData.model.js";
// import { acceptedBarcode } from "../models/samples.model.js";
// import { bookedTestsresult } from "../models/Testvalues.model.js";

// const cleanupCustomizationsOnStartup = async () => {
//     try {
//         const now = new Date();
//         const cutoffDate = new Date();
//         cutoffDate.setMonth(cutoffDate.getMonth() - 2);

//         console.log("[Cleanup] Tenant-wise cleanup started");
//         console.log(`[Cleanup] Current time: ${now.toISOString()}`);
//         console.log(`[Cleanup] Deleting records created before: ${cutoffDate.toISOString()}`);

//         const bookingTenantIds = await newBooking.distinct("tenantId", {
//             tenantId: { $exists: true, $ne: null }
//         });
//         const customizationTenantIds = await customization.distinct("tenantId", {
//             tenantId: { $exists: true, $ne: null }
//         });
//         const tenantIds = [...new Set([
//             ...bookingTenantIds.map((tenantId) => String(tenantId)),
//             ...customizationTenantIds.map((tenantId) => String(tenantId))
//         ])];

//         console.log(`[Cleanup] Total tenants found: ${tenantIds.length}`);

//         let totalCustomizationMatched = 0;
//         let totalCustomizationDeleted = 0;
//         let totalBookingsMatched = 0;
//         let totalBookingsDeleted = 0;
//         let totalReportsMatched = 0;
//         let totalReportsDeleted = 0;
//         let totalBookedValuesMatched = 0;
//         let totalBookedValuesDeleted = 0;
//         let totalAcceptedBarcodesMatched = 0;
//         let totalAcceptedBarcodesDeleted = 0;

//         for (const tenantId of tenantIds) {
//             if (!tenantId) continue;

//             const bookingFilter = {
//                 tenantId,
//                 createdAt: { $lt: cutoffDate },
//                 $or: [
//                     { isdocumented: { $exists: false } },
//                     { isdocumented: false },
//                     { isDocumented: { $exists: false } },
//                     { isDocumented: false }
//                 ]
//             };

//             const oldBookings = await newBooking.find(
//                 bookingFilter,
//                 { _id: 1, bookingId: 1 }
//             ).lean();

//             const bookingObjectIds = oldBookings.map((booking) => booking._id).filter(Boolean);
//             const bookingIds = oldBookings
//                 .map((booking) => booking.bookingId)
//                 .filter((bookingId) => typeof bookingId === "string" && bookingId.trim());

//             const oldBookingCount = oldBookings.length;
//             totalBookingsMatched += oldBookingCount;

//             let reportMatched = 0;
//             let reportDeleted = 0;
//             let bookedValuesMatched = 0;
//             let bookedValuesDeleted = 0;
//             let acceptedBarcodeMatched = 0;
//             let acceptedBarcodeDeleted = 0;
//             let bookingDeleted = 0;

//             if (oldBookingCount > 0) {
//                 const reportDeleteFilter = {
//                     tenantId,
//                     bookingId: { $in: bookingIds }
//                 };

//                 const bookedValuesDeleteFilter = {
//                     BookingId: { $in: bookingObjectIds }
//                 };

//                 const acceptedBarcodeDeleteFilter = {
//                     tenantId,
//                     bookingId: { $in: bookingIds }
//                 };

//                 reportMatched = bookingIds.length > 0
//                     ? await reports.countDocuments(reportDeleteFilter)
//                     : 0;
//                 bookedValuesMatched = bookingObjectIds.length > 0
//                     ? await bookedTestsresult.countDocuments(bookedValuesDeleteFilter)
//                     : 0;
//                 acceptedBarcodeMatched = bookingIds.length > 0
//                     ? await acceptedBarcode.countDocuments(acceptedBarcodeDeleteFilter)
//                     : 0;

//                 if (reportMatched > 0) {
//                     const reportDeleteResult = await reports.deleteMany(reportDeleteFilter);
//                     reportDeleted = reportDeleteResult.deletedCount || 0;
//                 }

//                 if (bookedValuesMatched > 0) {
//                     const bookedValuesDeleteResult = await bookedTestsresult.deleteMany(bookedValuesDeleteFilter);
//                     bookedValuesDeleted = bookedValuesDeleteResult.deletedCount || 0;
//                 }

//                 if (acceptedBarcodeMatched > 0) {
//                     const acceptedBarcodeDeleteResult = await acceptedBarcode.deleteMany(acceptedBarcodeDeleteFilter);
//                     acceptedBarcodeDeleted = acceptedBarcodeDeleteResult.deletedCount || 0;
//                 }

//                 const bookingDeleteResult = await newBooking.deleteMany({
//                     tenantId,
//                     _id: { $in: bookingObjectIds }
//                 });
//                 bookingDeleted = bookingDeleteResult.deletedCount || 0;
//             }

//             totalReportsMatched += reportMatched;
//             totalReportsDeleted += reportDeleted;
//             totalBookedValuesMatched += bookedValuesMatched;
//             totalBookedValuesDeleted += bookedValuesDeleted;
//             totalAcceptedBarcodesMatched += acceptedBarcodeMatched;
//             totalAcceptedBarcodesDeleted += acceptedBarcodeDeleted;
//             totalBookingsDeleted += bookingDeleted;

//             const customizationDeleteFilter = {
//                 tenantId,
//                 createdAt: { $lt: cutoffDate }
//             };

//             const customizationMatched = await customization.countDocuments(customizationDeleteFilter);
//             totalCustomizationMatched += customizationMatched;

//             let customizationDeleted = 0;
//             if (customizationMatched > 0) {
//                 const customizationDeleteResult = await customization.deleteMany(customizationDeleteFilter);
//                 customizationDeleted = customizationDeleteResult.deletedCount || 0;
//             }
//             totalCustomizationDeleted += customizationDeleted;

//             console.log(
//                 `[Cleanup] Tenant ${tenantId}: bookings matched=${oldBookingCount}, bookings deleted=${bookingDeleted}, reports matched=${reportMatched}, reports deleted=${reportDeleted}, bookedValues matched=${bookedValuesMatched}, bookedValues deleted=${bookedValuesDeleted}, acceptedBarcodes matched=${acceptedBarcodeMatched}, acceptedBarcodes deleted=${acceptedBarcodeDeleted}, customizations matched=${customizationMatched}, customizations deleted=${customizationDeleted}`
//             );
//         }

//         console.log(`[Cleanup] Total bookings matched: ${totalBookingsMatched}`);
//         console.log(`[Cleanup] Total bookings deleted: ${totalBookingsDeleted}`);
//         console.log(`[Cleanup] Total reports matched: ${totalReportsMatched}`);
//         console.log(`[Cleanup] Total reports deleted: ${totalReportsDeleted}`);
//         console.log(`[Cleanup] Total booked values matched: ${totalBookedValuesMatched}`);
//         console.log(`[Cleanup] Total booked values deleted: ${totalBookedValuesDeleted}`);
//         console.log(`[Cleanup] Total accepted barcodes matched: ${totalAcceptedBarcodesMatched}`);
//         console.log(`[Cleanup] Total accepted barcodes deleted: ${totalAcceptedBarcodesDeleted}`);
//         console.log(`[Cleanup] Total customizations matched: ${totalCustomizationMatched}`);
//         console.log(`[Cleanup] Total customizations deleted: ${totalCustomizationDeleted}`);
//         console.log("[Cleanup] Tenant-wise cleanup completed");
//     } catch (error) {
//         console.error("[Cleanup] Cleanup failed:", error.message);
//     }
// };

// export { cleanupCustomizationsOnStartup };

import { customization } from "../models/printsetting.model.js";

const cleanupCustomizationsOnStartup = async () => {
    try {
        const now = new Date();
        const cutoffDate = new Date();
        
        // 1. अब यह 1 महीना पुराना कट-ऑफ टाइम सेट करेगा
        cutoffDate.setMonth(cutoffDate.getMonth() - 1);

        console.log("[Customization Cleanup] Tenant-wise cleanup started");
        console.log(`[Customization Cleanup] Current time: ${now.toISOString()}`);
        console.log(`[Customization Cleanup] Deleting records created before: ${cutoffDate.toISOString()}`);

        // 2. isDocumented फ़िल्टर हटा दिया गया है
        const deleteFilter = {
            tenantId: { $exists: true, $ne: null },
            createdAt: { $lt: cutoffDate }
        };

        const totalMatched = await customization.countDocuments(deleteFilter);
        const deleteResult = totalMatched > 0
            ? await customization.deleteMany(deleteFilter)
            : { deletedCount: 0 };
        const totalDeleted = deleteResult.deletedCount || 0;

        console.log(`[Customization Cleanup] Total matched count: ${totalMatched}`);
        console.log(`[Customization Cleanup] Total deleted count: ${totalDeleted}`);
        console.log("[Customization Cleanup] Tenant-wise cleanup completed");
    } catch (error) {
        console.error("[Customization Cleanup] Cleanup failed:", error.message);
    }
};

export { cleanupCustomizationsOnStartup };