import bwipjs from "bwip-js";
import mongoose from "mongoose";
import {
    BarcodeSequence,
    BarcodeSettings,
    BarcodeBatch,
    PrePrintedBarcode,
} from "../models/prePrintedBarcode.model.js";
import { newBooking } from "../models/NewBooking.model.js";
import { acceptedBarcode } from "../models/samples.model.js";
import { User } from "../models/user.model.js";
import { Tenant } from "../models/tenant.model.js";
import { testSchema } from "../models/newTest.model.js";
import { addPannel } from "../models/AddPannel.model.js";

const CANCELLED_STATUSES = ["cancelled", "canceled"];

const VALID_PAPER_PRESETS = new Set([
    "a4_full_65",
    "a4_full_84",
    "a4_full_100",
    "a4_full_120",
    "a4_full_80",
    "a4_full_56",
    "a4_full_48",
    "a4_40",
    "a4_24",
    "a4_65",
    "a4_84",
    "thermal_50x25_2up",
    "thermal_50x25_1up",
    "thermal_38x25_2up",
    "thermal_38x25_1up",
    "thermal_50x38_1up",
]);

/* ============================================================================
 * LEGACY BARCODE IMAGE ENDPOINT (100% BACKWARD COMPATIBLE)
 * ========================================================================== */
const barcodegeneratecontroller = async (req, res) => {
    const { number } = req.body;
    const { nonumber } = req.query;

    if (!number) {
        return res.status(400).json({ success: false, message: "Number is required to generate barcode." });
    }

    try {
        const barcodeBuffer = await bwipjs.toBuffer({
            bcid: "code128",
            text: String(number),
            scale: 3,
            height: 18,
            includetext: !nonumber,
            textxalign: "center",
            backgroundcolor: "FFFFFF",
        });

        const barcodeImage = `data:image/png;base64,${barcodeBuffer.toString("base64")}`;

        return res.status(200).json({
            success: true,
            barcode: barcodeImage,
        });
    } catch (error) {
        console.error("Error generating barcode:", error);
        return res.status(500).json({ success: false, message: "Failed to generate barcode." });
    }
};

/* ============================================================================
 * INTERNAL CONTEXT & PERMISSION HELPERS
 * ========================================================================== */
function resolveTenantObjectId(userOrTenant) {
    if (!userOrTenant) return null;
    const raw = userOrTenant?.tenantId?._id
        || userOrTenant?.tenantId
        || userOrTenant?._id
        || userOrTenant;
    if (!raw) return null;
    if (raw instanceof mongoose.Types.ObjectId) return raw;
    return mongoose.Types.ObjectId.isValid(String(raw))
        ? new mongoose.Types.ObjectId(String(raw))
        : null;
}

function resolveUserContext(user = {}) {
    const isStaff = user?.role === "staff";
    const effectiveUserId = isStaff ? (user?.parentUser || user?._id) : user?._id;
    const effectiveRole = isStaff ? (user?.parentRole || "admin") : (user?.role || "");
    const isTenantAdmin = effectiveRole === "admin";
    const actorName = String(
        user?.fullName || user?.username || "User"
    ).trim();

    return {
        isStaff,
        actorId: user?._id || effectiveUserId,
        actorName,
        effectiveUserId,
        effectiveRole,
        isTenantAdmin,
    };
}

function checkBarcodeAccess(req, mode = "read") {
    if (!req.user) {
        return { allowed: false, statusCode: 401, message: "Unauthorized request" };
    }
    if (req.user.role !== "staff") {
        if (mode === "settings") {
            const { isTenantAdmin } = resolveUserContext(req.user);
            if (!isTenantAdmin) {
                return {
                    allowed: false,
                    statusCode: 403,
                    message: "Only lab admin can update global barcode configuration.",
                };
            }
        }
        return { allowed: true };
    }

    const perms = req.user.permissions || {};
    if (mode === "read" || mode === "print") {
        if (perms.canManageBookings || perms.canViewReports) {
            return { allowed: true };
        }
        return {
            allowed: false,
            statusCode: 403,
            message: "Staff permission required (Manage Bookings or View Reports).",
        };
    }

    if (mode === "settings") {
        const { isTenantAdmin } = resolveUserContext(req.user);
        if (isTenantAdmin && perms.canManageBookings) {
            return { allowed: true };
        }
        return {
            allowed: false,
            statusCode: 403,
            message: "Only authorized admin staff can update barcode settings.",
        };
    }

    // mode === "manage"
    if (perms.canManageBookings) {
        return { allowed: true };
    }
    return {
        allowed: false,
        statusCode: 403,
        message: "You need 'Manage Bookings' permission to perform this barcode action.",
    };
}

async function resolveAccessibleCenterIds(tenantId, effectiveUserId, isTenantAdmin) {
    if (isTenantAdmin || !effectiveUserId) {
        return null; // null means full tenant visibility
    }
    const rootId = new mongoose.Types.ObjectId(String(effectiveUserId));
    const accessible = new Set([String(rootId)]);

    // Traverse up to 2 levels down (superFranchisee -> franchisee -> subFranchisee)
    const level1 = await User.find({
        tenantId,
        createdBy: rootId,
        role: { $in: ["franchisee", "subFranchisee"] },
    })
        .select("_id")
        .lean();

    const level1Ids = level1.map((u) => u._id);
    level1Ids.forEach((id) => accessible.add(String(id)));

    if (level1Ids.length > 0) {
        const level2 = await User.find({
            tenantId,
            createdBy: { $in: level1Ids },
            role: { $in: ["subFranchisee"] },
        })
            .select("_id")
            .lean();
        level2.forEach((u) => accessible.add(String(u._id)));
    }

    return Array.from(accessible).map((id) => new mongoose.Types.ObjectId(id));
}

function normalizeBarcodeString(value) {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, "");
}

function sanitizePrefix(prefix) {
    return String(prefix ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, "")
        .slice(0, 6);
}

function normalizeSampleKey(sampleType) {
    return String(sampleType || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

export function resolveVacutainerMeta(sampleType = "") {
    const raw = String(sampleType || "").trim();
    const lower = raw.toLowerCase();

    if (!raw) {
        return { code: "SAMPLE", cap: "TUBE", shortCap: "TUB", tone: "slate" };
    }
    if (lower.includes("edta") || lower.includes("whole blood") || lower === "wb" || lower.includes("lavender") || lower.includes("purple")) {
        return { code: "EDTA", cap: "LAVENDER", shortCap: "LAV", tone: "purple" };
    }
    if (lower.includes("fluoride") || lower.includes("sugar") || lower.includes("grey") || lower.includes("gray")) {
        return { code: "FLUORIDE", cap: "GREY", shortCap: "GRY", tone: "slate" };
    }
    if (lower.includes("citrate") || lower.includes("coag") || lower.includes("pt/") || lower.includes("blue")) {
        return { code: "CITRATE", cap: "BLUE", shortCap: "BLU", tone: "blue" };
    }
    if (lower.includes("heparin") || lower.includes("green")) {
        return { code: "HEPARIN", cap: "GREEN", shortCap: "GRN", tone: "emerald" };
    }
    if (lower.includes("serum") || lower.includes("plain") || lower.includes("clot") || lower.includes("sst") || lower.includes("gel")) {
        return { code: "SERUM", cap: "RED/SST", shortCap: "RED", tone: "rose" };
    }
    if (lower.includes("urine")) {
        return { code: "URINE", cap: "CONTAINER", shortCap: "URN", tone: "amber" };
    }
    if (lower.includes("stool") || lower.includes("faeces") || lower.includes("feces")) {
        return { code: "STOOL", cap: "CONTAINER", shortCap: "STL", tone: "amber" };
    }
    if (lower.includes("swab") || lower.includes("sputum") || lower.includes("pus") || lower.includes("fluid") || lower.includes("csf") || lower.includes("semen")) {
        return {
            code: raw.toUpperCase().slice(0, 12),
            cap: "STERILE",
            shortCap: "STR",
            tone: "teal",
        };
    }
    return {
        code: raw.toUpperCase().slice(0, 12),
        cap: "TUBE",
        shortCap: "TUB",
        tone: "slate",
    };
}

async function getOrCreateTenantBarcodeSettings(tenantId) {
    let settings = await BarcodeSettings.findOne({ tenantId }).lean();
    if (!settings) {
        const created = await BarcodeSettings.findOneAndUpdate(
            { tenantId },
            { $setOnInsert: { tenantId, defaultPaperPreset: "a4_full_65" } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
        settings = created;
    } else if (
        settings.defaultPaperPreset === "thermal_50x25_1up" &&
        settings.createdAt &&
        settings.updatedAt &&
        Math.abs(new Date(settings.updatedAt).getTime() - new Date(settings.createdAt).getTime()) < 2000
    ) {
        // Auto-upgrade untouched initial default from 1-up thermal to Zero-Waste A4 Full Sheet (65-up)
        settings = await BarcodeSettings.findOneAndUpdate(
            { tenantId },
            { $set: { defaultPaperPreset: "a4_full_65" } },
            { new: true }
        ).lean();
    }
    return settings;
}

async function resolveHeaderLabelName(req, settings = {}) {
    if (settings?.customHeaderName && String(settings.customHeaderName).trim()) {
        return String(settings.customHeaderName).trim();
    }

    const userHeading = req.user?.branding?.labHeading;
    if (userHeading && String(userHeading).trim()) {
        return String(userHeading).trim();
    }

    const tenantObj = req.user?.tenantId;
    if (tenantObj && typeof tenantObj === "object") {
        if (tenantObj?.branding?.labHeading) return String(tenantObj.branding.labHeading).trim();
        if (tenantObj?.name) return String(tenantObj.name).trim();
    }

    const tenantId = resolveTenantObjectId(req.user);
    if (tenantId) {
        const tenantDoc = await Tenant.findById(tenantId).select("name branding.labHeading").lean();
        if (tenantDoc?.branding?.labHeading) return String(tenantDoc.branding.labHeading).trim();
        if (tenantDoc?.name) return String(tenantDoc.name).trim();
    }

    return String(req.user?.fullName || req.user?.username || "Pathology Lab").trim();
}

/* ============================================================================
 * COMPREHENSIVE TENANT DATABASE BARCODE VERIFICATION
 * Checks newBooking (all statuses, tableData & bookingId), acceptedBarcode,
 * and PrePrintedBarcode to ensure zero collisions or duplicate printouts.
 * ========================================================================== */
export async function findExistingBarcodesInTenantDb(tenantId, candidateCodes = [], options = {}) {
    const cleanCodes = Array.from(
        new Set(
            (candidateCodes || [])
                .map((c) => normalizeBarcodeString(c))
                .filter(Boolean)
        )
    );
    if (cleanCodes.length === 0) return { busySet: new Set(), details: new Map() };

    const tenantObjId = resolveTenantObjectId(tenantId);
    if (!tenantObjId) return { busySet: new Set(), details: new Map() };

    const tenantQuery = { $in: [tenantObjId, String(tenantObjId)] };

    // Query 1: Any booking in newBooking (any status: active, completed, cancelled, pending)
    const bookingQuery = {
        tenantId: tenantQuery,
        $or: [
            { "tableData.barcodeId": { $in: cleanCodes } },
            { "tableData.confirmBarcodeId": { $in: cleanCodes } },
            { bookingId: { $in: cleanCodes } },
        ],
    };
    if (options.excludeBookingDocId && mongoose.Types.ObjectId.isValid(String(options.excludeBookingDocId))) {
        bookingQuery._id = { $ne: new mongoose.Types.ObjectId(String(options.excludeBookingDocId)) };
    }
    if (Array.isArray(options.excludeBookingIds) && options.excludeBookingIds.length > 0) {
        bookingQuery.bookingId = { $nin: options.excludeBookingIds };
    }

    // Query 2: Any acceptedBarcode in the tenant
    const acceptedQuery = {
        tenantId: tenantQuery,
        $or: [
            { "barcodes.barcode": { $in: cleanCodes } },
            { bookingId: { $in: cleanCodes } },
        ],
    };

    // Query 3: PrePrintedBarcode pool
    const poolQuery = options.skipPreprintedPool
        ? null
        : {
            tenantId: tenantQuery,
            barcode: { $in: cleanCodes },
        };

    const promises = [
        newBooking
            .find(bookingQuery)
            .select("bookingId patientName status tableData")
            .lean(),
        acceptedBarcode
            .find(acceptedQuery)
            .select("bookingId barcodes")
            .lean(),
    ];
    if (poolQuery) {
        promises.push(
            PrePrintedBarcode
                .find(poolQuery)
                .select("barcode status batchCode usedInBookingId assignedToName")
                .lean()
        );
    }

    const [existingBookings, existingAccepted, existingPool = []] = await Promise.all(promises);

    const busySet = new Set();
    const details = new Map();

    // 1. Index newBooking matches
    existingBookings.forEach((b) => {
        const bId = String(b.bookingId || "").trim();
        if (cleanCodes.includes(bId)) {
            busySet.add(bId);
            details.set(bId, {
                source: "booking_id",
                bookingId: bId,
                patientName: b.patientName || "Patient",
                status: b.status || "active",
            });
        }
        (b.tableData || []).forEach((row) => {
            const rowBarcode = normalizeBarcodeString(row?.barcodeId);
            const rowConfirm = normalizeBarcodeString(row?.confirmBarcodeId);
            if (rowBarcode && cleanCodes.includes(rowBarcode)) {
                busySet.add(rowBarcode);
                details.set(rowBarcode, {
                    source: "booking_table_data",
                    bookingId: bId,
                    patientName: b.patientName || "Patient",
                    sampleType: row?.typeOfSample || "",
                    status: b.status || "active",
                });
            }
            if (rowConfirm && cleanCodes.includes(rowConfirm)) {
                busySet.add(rowConfirm);
                details.set(rowConfirm, {
                    source: "booking_table_data",
                    bookingId: bId,
                    patientName: b.patientName || "Patient",
                    sampleType: row?.typeOfSample || "",
                    status: b.status || "active",
                });
            }
        });
    });

    // 2. Index acceptedBarcode matches
    existingAccepted.forEach((acc) => {
        const bId = String(acc.bookingId || "").trim();
        if (cleanCodes.includes(bId)) {
            busySet.add(bId);
            if (!details.has(bId)) {
                details.set(bId, {
                    source: "accepted_booking",
                    bookingId: bId,
                });
            }
        }
        (acc.barcodes || []).forEach((entry) => {
            const code = normalizeBarcodeString(entry?.barcode);
            if (code && cleanCodes.includes(code)) {
                busySet.add(code);
                if (!details.has(code)) {
                    details.set(code, {
                        source: "accepted_barcode",
                        bookingId: bId,
                        sampleType: entry?.sampleType || "",
                    });
                }
            }
        });
    });

    // 3. Index PrePrintedBarcode pool matches
    existingPool.forEach((p) => {
        const code = normalizeBarcodeString(p.barcode);
        if (code && cleanCodes.includes(code)) {
            busySet.add(code);
            if (!details.has(code)) {
                details.set(code, {
                    source: "preprinted_pool",
                    status: p.status,
                    batchCode: p.batchCode,
                    usedInBookingId: p.usedInBookingId,
                    assignedToName: p.assignedToName,
                });
            }
        }
    });

    return { busySet, details };
}

/* ============================================================================
 * ATOMIC SEQUENTIAL BARCODE ALLOCATION (COLLISION-FREE)
 * Ensures every single barcode allocated for a sheet is 100% verified against
 * the client/tenant's database. Any matching/used barcode is skipped and replaced.
 * ========================================================================== */
export async function allocateUniqueBarcodes({
    tenantId,
    quantity,
    prefix = "",
    minDigits = 7,
}) {
    const tenantObjId = resolveTenantObjectId(tenantId);
    if (!tenantObjId) {
        throw new Error("Invalid tenant context for barcode allocation.");
    }

    const cleanPrefix = sanitizePrefix(prefix);
    const digits = Math.min(12, Math.max(5, Number.parseInt(minDigits, 10) || 7));
    const targetCount = Math.min(500, Math.max(1, Number.parseInt(quantity, 10) || 1));

    // Step 1: Ensure sequence doc exists without conflicting $setOnInsert + $inc on `seq`
    await BarcodeSequence.updateOne(
        { tenantId: tenantObjId },
        { $setOnInsert: { tenantId: tenantObjId, seq: 100000 } },
        { upsert: true }
    ).catch(() => {});

    const collected = [];
    const collectedCodes = new Set();
    let collisionsSkipped = 0;
    let rounds = 0;
    const maxRounds = 60;

    while (collected.length < targetCount && rounds < maxRounds) {
        rounds += 1;
        const remainingNeeded = targetCount - collected.length;
        // Dynamically request in chunks: at least remainingNeeded, or larger if collisions occurred
        const chunk = Math.max(remainingNeeded, 30);

        const seqDoc = await BarcodeSequence.findOneAndUpdate(
            { tenantId: tenantObjId },
            { $inc: { seq: chunk } },
            { new: true }
        ).lean();

        const endSeq = Number(seqDoc?.seq || 100000 + chunk);
        const startSeq = endSeq - chunk + 1;

        const candidateItems = [];
        for (let num = startSeq; num <= endSeq; num += 1) {
            const code = `${cleanPrefix}${String(num).padStart(digits, "0")}`;
            if (!collectedCodes.has(code)) {
                candidateItems.push({ code, seq: num });
            }
        }

        if (candidateItems.length === 0) continue;

        const candidateStrings = candidateItems.map((c) => c.code);

        // Thoroughly test all candidate barcodes across all tenant collections in MongoDB
        const { busySet } = await findExistingBarcodesInTenantDb(tenantObjId, candidateStrings);

        for (const item of candidateItems) {
            if (busySet.has(item.code)) {
                // COLLISION DETECTED: Barcode already present/booked in this client's database!
                // Discard it so it is never printed on the sheet; the next sequence candidate takes its place.
                collisionsSkipped += 1;
                continue;
            }

            if (!collectedCodes.has(item.code)) {
                collectedCodes.add(item.code);
                collected.push(item);
                if (collected.length >= targetCount) break;
            }
        }
    }

    if (collected.length < targetCount) {
        throw new Error(
            `Unable to allocate ${targetCount} unique barcodes after ${rounds} rounds (${collisionsSkipped} busy barcodes safely bypassed).`
        );
    }

    // Attach metadata properties onto the returned array for complete backward compatibility
    collected.collisionsSkipped = collisionsSkipped;
    collected.totalChecked = collected.length + collisionsSkipped;
    collected.dbVerified = true;

    return collected;
}

/* ============================================================================
 * BOOKING LIFECYCLE HELPERS (EXPORTED FOR NewBooking.controller.js)
 * ========================================================================== */
export async function validateBarcodesForBooking({
    tenantId: rawTenantId,
    rows = [],
    currentUser = null,
    excludeBookingDocId = null,
    excludeBookingIds = [],
}) {
    const tenantId = resolveTenantObjectId(rawTenantId || currentUser);
    if (!tenantId) {
        return { valid: false, statusCode: 400, message: "Invalid tenant context for barcode validation." };
    }

    if (!Array.isArray(rows) || rows.length === 0) {
        return { valid: false, statusCode: 400, message: "At least one sample barcode is required." };
    }

    const normalizedExcludeIds = Array.from(
        new Set(
            (excludeBookingIds || [])
                .map((id) => String(id || "").trim())
                .filter(Boolean)
        )
    );

    const seenInBooking = new Map();
    const uniqueBarcodes = [];

    for (let idx = 0; idx < rows.length; idx += 1) {
        const row = rows[idx] || {};
        const code = normalizeBarcodeString(row.confirmBarcodeId || row.barcodeId);
        const sampleType = String(row.typeOfSample || row.sampleType || "").trim();
        const sampleKey = normalizeSampleKey(sampleType);

        if (!code) {
            return {
                valid: false,
                statusCode: 400,
                message: `Barcode ID is missing for sample "${sampleType || `Row ${idx + 1}`}".`,
            };
        }

        if (seenInBooking.has(code)) {
            const prevSampleKey = seenInBooking.get(code);
            if (prevSampleKey !== sampleKey) {
                return {
                    valid: false,
                    statusCode: 400,
                    message: `Same barcode "${code}" cannot be assigned to two different sample tubes.`,
                };
            }
        } else {
            seenInBooking.set(code, sampleKey);
            uniqueBarcodes.push(code);
        }
    }

    // 1. Check active bookings in same tenant (excluding cancelled & current booking being edited)
    const bookingConflictQuery = {
        tenantId,
        status: { $nin: CANCELLED_STATUSES },
        $or: [
            { "tableData.barcodeId": { $in: uniqueBarcodes } },
            { "tableData.confirmBarcodeId": { $in: uniqueBarcodes } },
            { bookingId: { $in: uniqueBarcodes } },
        ],
    };
    if (excludeBookingDocId && mongoose.Types.ObjectId.isValid(String(excludeBookingDocId))) {
        bookingConflictQuery._id = { $ne: new mongoose.Types.ObjectId(String(excludeBookingDocId)) };
    }
    if (normalizedExcludeIds.length > 0) {
        bookingConflictQuery.bookingId = { $nin: normalizedExcludeIds };
    }

    const conflictingBooking = await newBooking
        .findOne(bookingConflictQuery)
        .select("bookingId patientName status tableData")
        .lean();

    if (conflictingBooking) {
        let badCode = uniqueBarcodes.find((c) => c === String(conflictingBooking.bookingId));
        if (!badCode) {
            const matchedRow = (conflictingBooking.tableData || []).find((r) =>
                uniqueBarcodes.includes(normalizeBarcodeString(r?.barcodeId)) ||
                uniqueBarcodes.includes(normalizeBarcodeString(r?.confirmBarcodeId))
            );
            badCode = matchedRow?.barcodeId || matchedRow?.confirmBarcodeId || uniqueBarcodes[0];
        }
        return {
            valid: false,
            statusCode: 400,
            barcode: badCode,
            message: `${badCode} barcode already used in active Booking #${conflictingBooking.bookingId} (${conflictingBooking.patientName || "Patient"})`,
        };
    }

    // 2. Check acceptedBarcode in same tenant (verify linked booking is not cancelled)
    const acceptedConflictQuery = {
        tenantId,
        "barcodes.barcode": { $in: uniqueBarcodes },
    };
    if (normalizedExcludeIds.length > 0) {
        acceptedConflictQuery.bookingId = { $nin: normalizedExcludeIds };
    }

    const acceptedConflicts = await acceptedBarcode
        .find(acceptedConflictQuery)
        .select("bookingId barcodes")
        .lean();

    if (acceptedConflicts.length > 0) {
        const candidateBookingIds = acceptedConflicts
            .map((a) => a.bookingId)
            .filter(Boolean);
        const activeParentBookings = await newBooking
            .find({
                tenantId,
                bookingId: { $in: candidateBookingIds },
                status: { $nin: CANCELLED_STATUSES },
                ...(excludeBookingDocId && mongoose.Types.ObjectId.isValid(String(excludeBookingDocId))
                    ? { _id: { $ne: new mongoose.Types.ObjectId(String(excludeBookingDocId)) } }
                    : {}),
            })
            .select("bookingId patientName")
            .lean();

        if (activeParentBookings.length > 0) {
            const activeIds = new Set(activeParentBookings.map((b) => b.bookingId));
            const realConflict = acceptedConflicts.find((a) => activeIds.has(a.bookingId));
            const badEntry = (realConflict?.barcodes || []).find((b) =>
                uniqueBarcodes.includes(normalizeBarcodeString(b?.barcode))
            );
            const badCode = badEntry?.barcode || uniqueBarcodes[0];
            return {
                valid: false,
                statusCode: 400,
                barcode: badCode,
                message: `${badCode} barcode is already accepted in Lab (#${realConflict?.bookingId || ""}).`,
            };
        }
    }

    // 3. Check PrePrintedBarcode pool rules (Void block, Used check, Optional center ownership)
    const [poolDocs, settings] = await Promise.all([
        PrePrintedBarcode.find({
            tenantId,
            barcode: { $in: uniqueBarcodes },
        }).lean(),
        getOrCreateTenantBarcodeSettings(tenantId),
    ]);

    if (poolDocs.length > 0) {
        const userCtx = currentUser ? resolveUserContext(currentUser) : null;
        let allowedCenterSet = null;

        if (settings?.restrictCenterOwnership && userCtx && !userCtx.isTenantAdmin) {
            const centerIds = await resolveAccessibleCenterIds(
                tenantId,
                userCtx.effectiveUserId,
                false
            );
            allowedCenterSet = new Set((centerIds || []).map((id) => String(id)));
        }

        for (const poolDoc of poolDocs) {
            if (poolDoc.status === "void") {
                return {
                    valid: false,
                    statusCode: 400,
                    barcode: poolDoc.barcode,
                    message: `Barcode ${poolDoc.barcode} is marked VOID/Damaged${poolDoc.voidReason ? ` (${poolDoc.voidReason})` : ""} and cannot be used.`,
                };
            }

            if (poolDoc.status === "used") {
                const sameBookingId =
                    poolDoc.usedInBookingId &&
                    normalizedExcludeIds.includes(String(poolDoc.usedInBookingId).trim());
                const sameDocId =
                    excludeBookingDocId &&
                    poolDoc.usedInBookingRef &&
                    String(poolDoc.usedInBookingRef) === String(excludeBookingDocId);

                if (!sameBookingId && !sameDocId) {
                    // Verify that the old booking is still active (in case it was cancelled earlier)
                    const stillActive = poolDoc.usedInBookingId
                        ? await newBooking
                              .findOne({
                                  tenantId,
                                  bookingId: poolDoc.usedInBookingId,
                                  status: { $nin: CANCELLED_STATUSES },
                              })
                              .select("_id bookingId patientName")
                              .lean()
                        : null;

                    if (stillActive) {
                        return {
                            valid: false,
                            statusCode: 400,
                            barcode: poolDoc.barcode,
                            message: `Pre-printed barcode ${poolDoc.barcode} is already mapped to Booking #${stillActive.bookingId} (${stillActive.patientName || "Patient"}).`,
                        };
                    }
                }
            }

            if (
                allowedCenterSet &&
                poolDoc.assignedToUser &&
                !allowedCenterSet.has(String(poolDoc.assignedToUser))
            ) {
                return {
                    valid: false,
                    statusCode: 403,
                    barcode: poolDoc.barcode,
                    message: `Barcode ${poolDoc.barcode} is assigned to collection center "${poolDoc.assignedToName || "another center"}".`,
                };
            }
        }
    }

    return { valid: true, barcodes: uniqueBarcodes };
}

export async function syncPrePrintedBarcodesForBooking({
    tenantId: rawTenantId,
    bookingDoc,
    tableData = [],
    previousBarcodes = [],
    actorUser = null,
}) {
    try {
        const tenantId = resolveTenantObjectId(rawTenantId || bookingDoc || actorUser);
        if (!tenantId || !bookingDoc) return;

        const rows = Array.isArray(tableData) && tableData.length > 0
            ? tableData
            : Array.isArray(bookingDoc.tableData)
              ? bookingDoc.tableData
              : [];

        const userCtx = actorUser ? resolveUserContext(actorUser) : null;
        const patientAgeGender = [bookingDoc.year, bookingDoc.gender]
            .map((v) => String(v || "").trim())
            .filter(Boolean)
            .join(" / ");

        const rowByBarcode = new Map();
        for (const row of rows) {
            const code = normalizeBarcodeString(row?.confirmBarcodeId || row?.barcodeId);
            if (!code) continue;
            if (!rowByBarcode.has(code)) {
                rowByBarcode.set(code, {
                    sampleTypes: new Set(),
                    tests: new Set(),
                });
            }
            const bucket = rowByBarcode.get(code);
            if (row?.typeOfSample) bucket.sampleTypes.add(String(row.typeOfSample).trim());
            if (row?.sampleType) bucket.sampleTypes.add(String(row.sampleType).trim());
            if (row?.testName) {
                String(row.testName)
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .forEach((t) => bucket.tests.add(t));
            }
        }

        const nextBarcodes = Array.from(rowByBarcode.keys());
        const removedBarcodes = (previousBarcodes || [])
            .map((c) => normalizeBarcodeString(c))
            .filter((c) => c && !rowByBarcode.has(c));

        // Release any pre-printed barcodes that were removed during booking edit
        if (removedBarcodes.length > 0) {
            await PrePrintedBarcode.updateMany(
                {
                    tenantId,
                    barcode: { $in: removedBarcodes },
                    status: "used",
                    $or: [
                        { usedInBookingRef: bookingDoc._id },
                        { usedInBookingId: bookingDoc.bookingId },
                    ],
                },
                {
                    $set: {
                        status: "unused",
                        usedInBookingId: "",
                        usedInBookingRef: null,
                        patientName: "",
                        patientAgeGender: "",
                        sampleType: "",
                        testSummary: "",
                        usedBy: null,
                        usedByName: "",
                        usedAt: null,
                    },
                }
            );
        }

        if (nextBarcodes.length === 0) return;

        // Mark matching PrePrintedBarcode pool entries as "used"
        const bulkOps = nextBarcodes.map((code) => {
            const meta = rowByBarcode.get(code);
            return {
                updateOne: {
                    filter: {
                        tenantId,
                        barcode: code,
                        status: { $ne: "void" },
                    },
                    update: {
                        $set: {
                            status: "used",
                            usedInBookingId: String(bookingDoc.bookingId || ""),
                            usedInBookingRef: bookingDoc._id || null,
                            patientName: String(bookingDoc.patientName || ""),
                            patientAgeGender,
                            sampleType: Array.from(meta.sampleTypes).join(", "),
                            testSummary: Array.from(meta.tests).join(", ").slice(0, 240),
                            usedBy: userCtx?.actorId || bookingDoc.createdBy || null,
                            usedByName: userCtx?.actorName || bookingDoc.createdbyuser || "",
                            usedAt: new Date(),
                        },
                    },
                },
            };
        });

        await PrePrintedBarcode.bulkWrite(bulkOps, { ordered: false });
    } catch (err) {
        console.error("syncPrePrintedBarcodesForBooking warning:", err);
    }
}

export async function releasePrePrintedBarcodesForBooking({
    tenantId: rawTenantId,
    bookingDoc = null,
    bookingId = "",
    barcodes = [],
    cleanupAcceptedBarcodes = false,
}) {
    try {
        const tenantId = resolveTenantObjectId(rawTenantId || bookingDoc);
        if (!tenantId) return;

        const targetBookingId = String(bookingId || bookingDoc?.bookingId || "").trim();
        const extractedCodes = new Set(
            (barcodes || []).map((c) => normalizeBarcodeString(c)).filter(Boolean)
        );
        if (bookingDoc?.tableData && Array.isArray(bookingDoc.tableData)) {
            bookingDoc.tableData.forEach((row) => {
                const code = normalizeBarcodeString(row?.barcodeId || row?.confirmBarcodeId);
                if (code) extractedCodes.add(code);
            });
        }

        const orConditions = [];
        if (bookingDoc?._id) {
            orConditions.push({ usedInBookingRef: bookingDoc._id });
        }
        if (targetBookingId) {
            orConditions.push({ usedInBookingId: targetBookingId });
        }
        if (extractedCodes.size > 0) {
            orConditions.push({ barcode: { $in: Array.from(extractedCodes) } });
        }

        if (orConditions.length > 0) {
            await PrePrintedBarcode.updateMany(
                {
                    tenantId,
                    status: "used",
                    $or: orConditions,
                },
                {
                    $set: {
                        status: "unused",
                        usedInBookingId: "",
                        usedInBookingRef: null,
                        patientName: "",
                        patientAgeGender: "",
                        sampleType: "",
                        testSummary: "",
                        usedBy: null,
                        usedByName: "",
                        usedAt: null,
                    },
                }
            );
        }

        if (cleanupAcceptedBarcodes && targetBookingId) {
            await acceptedBarcode.deleteMany({
                tenantId,
                bookingId: targetBookingId,
            });
        }
    } catch (err) {
        console.error("releasePrePrintedBarcodesForBooking warning:", err);
    }
}

/* ============================================================================
 * 1. GET & UPDATE BARCODE SETTINGS
 * ========================================================================== */
const getBarcodeSettingsController = async (req, res) => {
    try {
        const access = checkBarcodeAccess(req, "read");
        if (!access.allowed) {
            return res.status(access.statusCode).json({ success: false, message: access.message });
        }

        const tenantId = resolveTenantObjectId(req.user);
        if (!tenantId) {
            return res.status(400).json({ success: false, message: "Tenant context missing." });
        }

        const userCtx = resolveUserContext(req.user);
        const [settings, headerName] = await Promise.all([
            getOrCreateTenantBarcodeSettings(tenantId),
            resolveHeaderLabelName(req),
        ]);

        // Fetch assignable collection centers for dropdowns (Admin sees all; SuperFranchisee/Franchisee sees downstream)
        let assignableCenters = [];
        if (userCtx.isTenantAdmin) {
            assignableCenters = await User.find({
                tenantId,
                role: { $in: ["superFranchisee", "franchisee", "subFranchisee"] },
            })
                .select("_id fullName username role")
                .sort({ role: 1, fullName: 1 })
                .lean();
        } else if (["superFranchisee", "franchisee"].includes(userCtx.effectiveRole)) {
            const centerIds = await resolveAccessibleCenterIds(tenantId, userCtx.effectiveUserId, false);
            assignableCenters = await User.find({
                _id: { $in: centerIds },
                role: { $in: ["superFranchisee", "franchisee", "subFranchisee"] },
            })
                .select("_id fullName username role")
                .sort({ role: 1, fullName: 1 })
                .lean();
        }

        const resolvedHeader = settings?.customHeaderName || headerName;

        return res.status(200).json({
            success: true,
            settings,
            resolvedHeaderName: resolvedHeader,
            canEditGlobalSettings:
                userCtx.isTenantAdmin &&
                (req.user.role === "admin" || Boolean(req.user.permissions?.canManageBookings)),
            userContext: {
                effectiveUserId: userCtx.effectiveUserId,
                effectiveRole: userCtx.effectiveRole,
                isTenantAdmin: userCtx.isTenantAdmin,
                actorName: userCtx.actorName,
            },
            assignableCenters: assignableCenters.map((c) => ({
                _id: c._id,
                name: c.fullName || c.username,
                username: c.username,
                role: c.role,
            })),
        });
    } catch (error) {
        console.error("getBarcodeSettingsController error:", error);
        return res.status(500).json({ success: false, message: "Failed to load barcode settings." });
    }
};

const updateBarcodeSettingsController = async (req, res) => {
    try {
        const access = checkBarcodeAccess(req, "settings");
        if (!access.allowed) {
            return res.status(access.statusCode).json({ success: false, message: access.message });
        }

        const tenantId = resolveTenantObjectId(req.user);
        if (!tenantId) {
            return res.status(400).json({ success: false, message: "Tenant context missing." });
        }

        const body = req.body || {};
        const updateFields = {};

        if (body.prefix !== undefined) {
            updateFields.prefix = sanitizePrefix(body.prefix);
        }
        if (body.minDigits !== undefined) {
            updateFields.minDigits = Math.min(12, Math.max(5, Number.parseInt(body.minDigits, 10) || 7));
        }
        if (body.customHeaderName !== undefined) {
            updateFields.customHeaderName = String(body.customHeaderName || "").trim().slice(0, 48);
        }
        if (body.defaultPaperPreset !== undefined && VALID_PAPER_PRESETS.has(String(body.defaultPaperPreset))) {
            updateFields.defaultPaperPreset = String(body.defaultPaperPreset);
        }
        if (body.defaultCopies !== undefined) {
            updateFields.defaultCopies = Math.min(10, Math.max(1, Number.parseInt(body.defaultCopies, 10) || 1));
        }

        const booleanKeys = [
            "showLabName",
            "showPatientName",
            "showAgeGender",
            "showSampleType",
            "showVacutainerGuide",
            "showTests",
            "showDateTime",
            "showBookingId",
            "autoPromptAfterBooking",
            "restrictCenterOwnership",
            "includeMasterBagLabel",
        ];

        for (const key of booleanKeys) {
            if (typeof body[key] === "boolean") {
                updateFields[key] = body[key];
            }
        }

        if (body.calibration && typeof body.calibration === "object") {
            const cal = body.calibration;
            updateFields.calibration = {
                topOffsetMm: Math.min(15, Math.max(-15, Number(cal.topOffsetMm) || 0)),
                leftOffsetMm: Math.min(15, Math.max(-15, Number(cal.leftOffsetMm) || 0)),
                barWidth: Math.min(3, Math.max(1, Number(cal.barWidth) || 1.5)),
                barcodeHeightMm: Math.min(25, Math.max(6, Number(cal.barcodeHeightMm) || 10.5)),
                fontScale: Math.min(1.35, Math.max(0.75, Number(cal.fontScale) || 1)),
            };
        }

        const updated = await BarcodeSettings.findOneAndUpdate(
            { tenantId },
            { $set: updateFields, $setOnInsert: { tenantId } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();

        const resolvedHeaderName = await resolveHeaderLabelName(req, updated);

        return res.status(200).json({
            success: true,
            message: "Barcode settings saved successfully.",
            settings: updated,
            resolvedHeaderName,
        });
    } catch (error) {
        console.error("updateBarcodeSettingsController error:", error);
        return res.status(500).json({ success: false, message: "Failed to save barcode settings." });
    }
};

/* ============================================================================
 * 2. GENERATE PRE-PRINTED BARCODE BATCH (BULK STUDIO)
 * ========================================================================== */
const generatePrePrintedBatchController = async (req, res) => {
    try {
        const access = checkBarcodeAccess(req, "manage");
        if (!access.allowed) {
            return res.status(access.statusCode).json({ success: false, message: access.message });
        }

        const tenantId = resolveTenantObjectId(req.user);
        if (!tenantId) {
            return res.status(400).json({ success: false, message: "Tenant context missing." });
        }

        const userCtx = resolveUserContext(req.user);
        const settings = await getOrCreateTenantBarcodeSettings(tenantId);

        const quantity = Math.min(500, Math.max(1, Number.parseInt(req.body?.quantity, 10) || 65));
        const copiesPerBarcode = Math.min(10, Math.max(1, Number.parseInt(req.body?.copiesPerBarcode, 10) || settings.defaultCopies || 1));
        const prefix = req.body?.prefix !== undefined
            ? sanitizePrefix(req.body.prefix)
            : sanitizePrefix(settings.prefix);
        const minDigits = req.body?.minDigits !== undefined
            ? Math.min(12, Math.max(5, Number.parseInt(req.body.minDigits, 10) || settings.minDigits || 7))
            : (settings.minDigits || 7);
        const paperPreset = VALID_PAPER_PRESETS.has(String(req.body?.paperPreset || ""))
            ? String(req.body.paperPreset)
            : (settings.defaultPaperPreset || "a4_full_65");
        const sampleHint = String(req.body?.sampleHint || "").trim().slice(0, 40);
        const notes = String(req.body?.notes || "").trim().slice(0, 240);

        // Determine assigned center
        let assignedToUser = null;
        let assignedToName = "";
        let assignedToRole = "";

        const requestedCenterId = String(req.body?.assignedToUserId || "").trim();
        if (requestedCenterId && mongoose.Types.ObjectId.isValid(requestedCenterId)) {
            const targetCenter = await User.findOne({
                _id: new mongoose.Types.ObjectId(requestedCenterId),
                tenantId,
            })
                .select("_id fullName username role")
                .lean();

            if (targetCenter) {
                assignedToUser = targetCenter._id;
                assignedToName = targetCenter.fullName || targetCenter.username;
                assignedToRole = targetCenter.role;
            }
        } else if (!userCtx.isTenantAdmin && userCtx.effectiveUserId) {
            // Franchisee / Sub-Franchisee generating for themselves defaults to their center
            const selfCenter = await User.findById(userCtx.effectiveUserId)
                .select("_id fullName username role")
                .lean();
            if (selfCenter) {
                assignedToUser = selfCenter._id;
                assignedToName = selfCenter.fullName || selfCenter.username;
                assignedToRole = selfCenter.role;
            }
        }

        const allocated = await allocateUniqueBarcodes({
            tenantId,
            quantity,
            prefix,
            minDigits,
        });

        const now = new Date();
        const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
        const randSuffix = String(Math.floor(100 + Math.random() * 900));
        const batchCode = `BCH-${ymd}-${randSuffix}`;

        const batchDoc = await BarcodeBatch.create({
            tenantId,
            batchCode,
            batchType: "preprinted",
            prefix,
            startBarcode: allocated[0].code,
            endBarcode: allocated[allocated.length - 1].code,
            quantity: allocated.length,
            copiesPerBarcode,
            paperPreset,
            sampleHint,
            assignedToUser,
            assignedToName,
            assignedToRole,
            createdBy: userCtx.actorId,
            createdByName: userCtx.actorName,
            notes,
            lastPrintedAt: now,
        });

        const poolPayload = allocated.map((item) => ({
            tenantId,
            barcode: item.code,
            sequenceNumber: item.seq,
            source: "preprinted",
            batchId: batchDoc._id,
            batchCode,
            assignedToUser,
            assignedToName,
            sampleHint,
            status: "unused",
        }));

        await PrePrintedBarcode.insertMany(poolPayload, { ordered: true });

        const headerName = await resolveHeaderLabelName(req, settings);
        const collisionsSkipped = allocated.collisionsSkipped || 0;
        const msg = collisionsSkipped > 0
            ? `${allocated.length} unique barcodes generated in batch ${batchCode} (100% collision-free; ${collisionsSkipped} busy numbers safely bypassed & replaced).`
            : `${allocated.length} unique barcodes generated in batch ${batchCode} (100% database collision-free).`;

        return res.status(201).json({
            success: true,
            message: msg,
            batch: batchDoc,
            headerName,
            settings,
            dbVerified: true,
            collisionsSkipped,
            totalChecked: allocated.totalChecked || allocated.length,
            barcodes: allocated.map((item) => ({
                barcode: item.code,
                sampleHint,
                vacutainer: sampleHint ? resolveVacutainerMeta(sampleHint) : null,
                assignedToName,
                batchCode,
                status: "unused",
            })),
        });
    } catch (error) {
        console.error("generatePrePrintedBatchController error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to generate pre-printed barcode batch.",
        });
    }
};

/* ============================================================================
 * 3. AUTO-GENERATE SEQUENTIAL BARCODES FOR BOOKING FORM (ON-DEMAND)
 * ========================================================================== */
const generateAutoBookingBarcodesController = async (req, res) => {
    try {
        const access = checkBarcodeAccess(req, "manage");
        if (!access.allowed) {
            return res.status(access.statusCode).json({ success: false, message: access.message });
        }

        const tenantId = resolveTenantObjectId(req.user);
        if (!tenantId) {
            return res.status(400).json({ success: false, message: "Tenant context missing." });
        }

        const count = Math.min(25, Math.max(1, Number.parseInt(req.body?.count, 10) || 1));
        const settings = await getOrCreateTenantBarcodeSettings(tenantId);

        const allocated = await allocateUniqueBarcodes({
            tenantId,
            quantity: count,
            prefix: settings.prefix || "",
            minDigits: settings.minDigits || 7,
        });

        return res.status(200).json({
            success: true,
            barcodes: allocated.map((a) => a.code),
        });
    } catch (error) {
        console.error("generateAutoBookingBarcodesController error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to allocate sequential barcode.",
        });
    }
};

/* ============================================================================
 * 4. PICK UNUSED PRE-PRINTED BARCODES FROM POOL (FOR BOOKING FORM)
 * ========================================================================== */
const pickUnusedPreBarcodesController = async (req, res) => {
    try {
        const access = checkBarcodeAccess(req, "manage");
        if (!access.allowed) {
            return res.status(access.statusCode).json({ success: false, message: access.message });
        }

        const tenantId = resolveTenantObjectId(req.user);
        if (!tenantId) {
            return res.status(400).json({ success: false, message: "Tenant context missing." });
        }

        const count = Math.min(25, Math.max(1, Number.parseInt(req.body?.count, 10) || 1));
        const excludeBarcodes = Array.isArray(req.body?.excludeBarcodes)
            ? req.body.excludeBarcodes.map((b) => normalizeBarcodeString(b)).filter(Boolean)
            : [];
        const batchId = req.body?.batchId;
        const userCtx = resolveUserContext(req.user);

        const query = {
            tenantId,
            status: "unused",
            source: "preprinted",
        };

        if (excludeBarcodes.length > 0) {
            query.barcode = { $nin: excludeBarcodes };
        }
        if (batchId && mongoose.Types.ObjectId.isValid(String(batchId))) {
            query.batchId = new mongoose.Types.ObjectId(String(batchId));
        }

        if (!userCtx.isTenantAdmin && userCtx.effectiveUserId) {
            const centerIds = await resolveAccessibleCenterIds(tenantId, userCtx.effectiveUserId, false);
            query.$or = [
                { assignedToUser: { $in: centerIds } },
                { assignedToUser: null },
            ];
        }

        const candidates = await PrePrintedBarcode.find(query)
            .sort({ sequenceNumber: 1, createdAt: 1 })
            .limit(count * 3)
            .select("barcode batchCode sampleHint assignedToName")
            .lean();

        if (candidates.length === 0) {
            return res.status(200).json({
                success: true,
                barcodes: [],
                items: [],
                message: "No unused pre-printed barcodes available in pool. Generate a batch in Barcode Studio first.",
            });
        }

        // Verify none of the picked candidates were used ad-hoc in an active booking
        const codes = candidates.map((c) => c.barcode);
        const busyBookings = await newBooking
            .find({
                tenantId,
                status: { $nin: CANCELLED_STATUSES },
                "tableData.barcodeId": { $in: codes },
            })
            .select("tableData.barcodeId")
            .lean();

        const busySet = new Set();
        busyBookings.forEach((b) => {
            (b.tableData || []).forEach((r) => {
                if (r?.barcodeId) busySet.add(String(r.barcodeId));
            });
        });

        const picked = candidates.filter((c) => !busySet.has(c.barcode)).slice(0, count);

        return res.status(200).json({
            success: true,
            barcodes: picked.map((p) => p.barcode),
            items: picked,
        });
    } catch (error) {
        console.error("pickUnusedPreBarcodesController error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to pick unused pre-printed barcodes.",
        });
    }
};

/* ============================================================================
 * 5. LIVE BARCODE VALIDATION (SCANNER / INPUT FEEDBACK IN BOOKING FORM)
 * ========================================================================== */
const validateBarcodeLiveController = async (req, res) => {
    try {
        const access = checkBarcodeAccess(req, "read");
        if (!access.allowed) {
            return res.status(access.statusCode).json({ success: false, message: access.message });
        }

        const tenantId = resolveTenantObjectId(req.user);
        if (!tenantId) {
            return res.status(400).json({ success: false, message: "Tenant context missing." });
        }

        const rawList = Array.isArray(req.body?.barcodes)
            ? req.body.barcodes
            : req.body?.barcode
              ? [req.body.barcode]
              : [];

        const barcodes = Array.from(
            new Set(rawList.map((b) => normalizeBarcodeString(b)).filter(Boolean))
        ).slice(0, 30);

        if (barcodes.length === 0) {
            return res.status(200).json({ success: true, results: {} });
        }

        const excludeBookingDocId = req.body?.excludeBookingDocId || null;
        const excludeBookingIds = Array.isArray(req.body?.excludeBookingIds)
            ? req.body.excludeBookingIds.map((id) => String(id || "").trim()).filter(Boolean)
            : [];

        const [poolDocs, dbCheckResult, settings] = await Promise.all([
            PrePrintedBarcode.find({ tenantId, barcode: { $in: barcodes } }).lean(),
            findExistingBarcodesInTenantDb(tenantId, barcodes, {
                excludeBookingDocId,
                excludeBookingIds,
                skipPreprintedPool: true,
            }),
            getOrCreateTenantBarcodeSettings(tenantId),
        ]);

        const poolMap = new Map(poolDocs.map((d) => [d.barcode, d]));
        const conflictDetails = dbCheckResult.details || new Map();

        const userCtx = resolveUserContext(req.user);
        let allowedCenterSet = null;
        if (settings?.restrictCenterOwnership && !userCtx.isTenantAdmin) {
            const centerIds = await resolveAccessibleCenterIds(tenantId, userCtx.effectiveUserId, false);
            allowedCenterSet = new Set((centerIds || []).map((id) => String(id)));
        }

        const results = {};
        for (const code of barcodes) {
            const conflict = conflictDetails.get(code);
            const pool = poolMap.get(code);

            if (pool?.status === "void") {
                results[code] = {
                    valid: false,
                    state: "void_blocked",
                    label: "VOID / Damaged",
                    message: `Voided${pool.voidReason ? `: ${pool.voidReason}` : ""}`,
                };
                continue;
            }

            if (conflict && (conflict.source === "booking_id" || conflict.source === "booking_table_data" || conflict.source === "accepted_barcode")) {
                results[code] = {
                    valid: false,
                    state: "used_conflict",
                    label: `Used in #${conflict.bookingId || "Booking"}`,
                    message: `Already booked for ${conflict.patientName || "patient"} (#${conflict.bookingId || ""})`,
                    conflict,
                };
                continue;
            }

            if (
                pool &&
                allowedCenterSet &&
                pool.assignedToUser &&
                !allowedCenterSet.has(String(pool.assignedToUser))
            ) {
                results[code] = {
                    valid: false,
                    state: "wrong_center",
                    label: `Assigned: ${pool.assignedToName || "Other Center"}`,
                    message: `Assigned to ${pool.assignedToName || "another center"}`,
                };
                continue;
            }

            if (pool) {
                results[code] = {
                    valid: true,
                    state: "unused_pool",
                    label: `Pre-Printed (${pool.batchCode || "Pool"})`,
                    sampleHint: pool.sampleHint || "",
                    batchCode: pool.batchCode || "",
                    assignedToName: pool.assignedToName || "",
                };
            } else {
                results[code] = {
                    valid: true,
                    state: "available_custom",
                    label: "Available",
                };
            }
        }

        return res.status(200).json({ success: true, results });
    } catch (error) {
        console.error("validateBarcodeLiveController error:", error);
        return res.status(500).json({ success: false, message: "Barcode validation failed." });
    }
};

/* ============================================================================
 * 6. BATCH HISTORY & KPI SUMMARY
 * ========================================================================== */
const getBarcodeBatchesController = async (req, res) => {
    try {
        const access = checkBarcodeAccess(req, "read");
        if (!access.allowed) {
            return res.status(access.statusCode).json({ success: false, message: access.message });
        }

        const tenantId = resolveTenantObjectId(req.user);
        if (!tenantId) {
            return res.status(400).json({ success: false, message: "Tenant context missing." });
        }

        const page = Math.max(1, Number.parseInt(req.query?.page, 10) || 1);
        const limit = Math.min(100, Math.max(5, Number.parseInt(req.query?.limit, 10) || 20));
        const skip = (page - 1) * limit;
        const search = String(req.query?.search || "").trim();
        const assignedToUser = String(req.query?.assignedToUser || "").trim();

        const userCtx = resolveUserContext(req.user);
        const batchMatch = { tenantId, batchType: "preprinted" };
        const poolSummaryMatch = { tenantId, source: "preprinted" };

        if (!userCtx.isTenantAdmin && userCtx.effectiveUserId) {
            const centerIds = await resolveAccessibleCenterIds(tenantId, userCtx.effectiveUserId, false);
            batchMatch.$or = [
                { assignedToUser: { $in: centerIds } },
                { createdBy: { $in: [...centerIds, userCtx.actorId] } },
            ];
            poolSummaryMatch.$or = [
                { assignedToUser: { $in: centerIds } },
                { assignedToUser: null },
            ];
        } else if (assignedToUser && mongoose.Types.ObjectId.isValid(assignedToUser)) {
            const targetId = new mongoose.Types.ObjectId(assignedToUser);
            batchMatch.assignedToUser = targetId;
            poolSummaryMatch.assignedToUser = targetId;
        }

        if (search) {
            const safeRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            batchMatch.$and = [
                ...(batchMatch.$and || []),
                {
                    $or: [
                        { batchCode: safeRegex },
                        { startBarcode: safeRegex },
                        { endBarcode: safeRegex },
                        { assignedToName: safeRegex },
                        { sampleHint: safeRegex },
                        { notes: safeRegex },
                    ],
                },
            ];
        }

        const [totalBatches, batches, statusAgg] = await Promise.all([
            BarcodeBatch.countDocuments(batchMatch),
            BarcodeBatch.find(batchMatch)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            PrePrintedBarcode.aggregate([
                { $match: poolSummaryMatch },
                { $group: { _id: "$status", count: { $sum: 1 } } },
            ]),
        ]);

        const batchIds = batches.map((b) => b._id);
        const perBatchAgg = batchIds.length
            ? await PrePrintedBarcode.aggregate([
                  { $match: { tenantId, batchId: { $in: batchIds } } },
                  {
                      $group: {
                          _id: { batchId: "$batchId", status: "$status" },
                          count: { $sum: 1 },
                      },
                  },
              ])
            : [];

        const batchStatsMap = new Map();
        perBatchAgg.forEach((row) => {
            const key = String(row._id.batchId);
            if (!batchStatsMap.has(key)) {
                batchStatsMap.set(key, { unused: 0, used: 0, void: 0 });
            }
            batchStatsMap.get(key)[row._id.status] = row.count;
        });

        const kpi = { total: 0, unused: 0, used: 0, void: 0, batchesCount: totalBatches };
        statusAgg.forEach((row) => {
            kpi[row._id] = row.count;
            kpi.total += row.count;
        });

        const enrichedBatches = batches.map((b) => {
            const counts = batchStatsMap.get(String(b._id)) || {
                unused: b.quantity,
                used: 0,
                void: 0,
            };
            return {
                ...b,
                counts,
            };
        });

        return res.status(200).json({
            success: true,
            kpi,
            batches: enrichedBatches,
            page,
            limit,
            total: totalBatches,
        });
    } catch (error) {
        console.error("getBarcodeBatchesController error:", error);
        return res.status(500).json({ success: false, message: "Failed to load barcode batches." });
    }
};

/* ============================================================================
 * 7. FETCH BARCODES OF A SPECIFIC BATCH (FULL REPRINT OR UNUSED-ONLY REPRINT)
 * ========================================================================== */
const getBatchBarcodesController = async (req, res) => {
    try {
        const access = checkBarcodeAccess(req, "print");
        if (!access.allowed) {
            return res.status(access.statusCode).json({ success: false, message: access.message });
        }

        const tenantId = resolveTenantObjectId(req.user);
        const { batchId } = req.params;
        if (!tenantId || !mongoose.Types.ObjectId.isValid(String(batchId))) {
            return res.status(400).json({ success: false, message: "Invalid batch ID." });
        }

        const batch = await BarcodeBatch.findOne({
            _id: new mongoose.Types.ObjectId(String(batchId)),
            tenantId,
        }).lean();

        if (!batch) {
            return res.status(404).json({ success: false, message: "Barcode batch not found." });
        }

        const onlyUnused = String(req.query?.onlyUnused || "").toLowerCase() === "true";
        const markReprinted = String(req.query?.markReprinted || "").toLowerCase() === "true";

        const itemQuery = { tenantId, batchId: batch._id };
        if (onlyUnused) {
            itemQuery.status = "unused";
        } else {
            itemQuery.status = { $ne: "void" };
        }

        const items = await PrePrintedBarcode.find(itemQuery)
            .sort({ sequenceNumber: 1, createdAt: 1 })
            .lean();

        // Cross-verify all candidate batch barcodes against active newBooking & acceptedBarcode
        const candidateCodes = items.map((i) => i.barcode);
        const { busySet, details } = await findExistingBarcodesInTenantDb(tenantId, candidateCodes, {
            skipPreprintedPool: true,
        });

        // Automatically sync any barcodes discovered to be used in bookings
        const newlyUsedOps = [];
        for (const item of items) {
            if (busySet.has(item.barcode) && item.status === "unused") {
                const det = details.get(item.barcode) || {};
                newlyUsedOps.push({
                    updateOne: {
                        filter: { tenantId, barcode: item.barcode, status: "unused" },
                        update: {
                            $set: {
                                status: "used",
                                usedInBookingId: det.bookingId || "BOOKED",
                                patientName: det.patientName || "Patient",
                                sampleType: det.sampleType || item.sampleHint || "",
                                usedAt: new Date(),
                            },
                        },
                    },
                });
            }
        }
        if (newlyUsedOps.length > 0) {
            await PrePrintedBarcode.bulkWrite(newlyUsedOps).catch(() => {});
        }

        // When printing unused stickers for tubes, exclude any barcode already present in patient bookings
        let printableItems = items;
        let omittedBookedCount = 0;
        if (onlyUnused) {
            printableItems = items.filter((i) => !busySet.has(i.barcode) && i.status === "unused");
            omittedBookedCount = items.length - printableItems.length;
        }

        if (markReprinted && printableItems.length > 0) {
            await Promise.all([
                BarcodeBatch.updateOne(
                    { _id: batch._id },
                    { $inc: { reprintCount: 1 }, $set: { lastPrintedAt: new Date() } }
                ),
                PrePrintedBarcode.updateMany(
                    { _id: { $in: printableItems.map((i) => i._id) } },
                    { $inc: { reprintCount: 1 } }
                ),
            ]);
        }

        const settings = await getOrCreateTenantBarcodeSettings(tenantId);
        const headerName = await resolveHeaderLabelName(req, settings);

        return res.status(200).json({
            success: true,
            batch,
            headerName,
            settings,
            dbVerified: true,
            omittedBookedCount,
            barcodes: printableItems.map((item) => ({
                _id: item._id,
                barcode: item.barcode,
                status: busySet.has(item.barcode) ? "used" : item.status,
                sampleHint: item.sampleHint || batch.sampleHint || "",
                vacutainer: (item.sampleHint || batch.sampleHint)
                    ? resolveVacutainerMeta(item.sampleHint || batch.sampleHint)
                    : null,
                assignedToName: item.assignedToName || batch.assignedToName || "",
                batchCode: batch.batchCode,
                usedInBookingId: item.usedInBookingId || details.get(item.barcode)?.bookingId || "",
                patientName: item.patientName || details.get(item.barcode)?.patientName || "",
            })),
        });
    } catch (error) {
        console.error("getBatchBarcodesController error:", error);
        return res.status(500).json({ success: false, message: "Failed to load batch barcodes." });
    }
};

/* ============================================================================
 * 8. BARCODE POOL & LIVE SCANNER CHAIN-OF-CUSTODY TRACKER
 * ========================================================================== */
const getBarcodePoolController = async (req, res) => {
    try {
        const access = checkBarcodeAccess(req, "read");
        if (!access.allowed) {
            return res.status(access.statusCode).json({ success: false, message: access.message });
        }

        const tenantId = resolveTenantObjectId(req.user);
        if (!tenantId) {
            return res.status(400).json({ success: false, message: "Tenant context missing." });
        }

        const page = Math.max(1, Number.parseInt(req.query?.page, 10) || 1);
        const limit = Math.min(200, Math.max(10, Number.parseInt(req.query?.limit, 10) || 50));
        const skip = (page - 1) * limit;
        const status = String(req.query?.status || "").trim();
        const search = String(req.query?.search || "").trim();
        const batchId = String(req.query?.batchId || "").trim();
        const assignedToUser = String(req.query?.assignedToUser || "").trim();

        const userCtx = resolveUserContext(req.user);
        const query = { tenantId };

        if (["unused", "used", "void"].includes(status)) {
            query.status = status;
        }
        if (batchId && mongoose.Types.ObjectId.isValid(batchId)) {
            query.batchId = new mongoose.Types.ObjectId(batchId);
        }
        if (!userCtx.isTenantAdmin && userCtx.effectiveUserId) {
            const centerIds = await resolveAccessibleCenterIds(tenantId, userCtx.effectiveUserId, false);
            query.$or = [
                { assignedToUser: { $in: centerIds } },
                { assignedToUser: null },
            ];
        } else if (assignedToUser && mongoose.Types.ObjectId.isValid(assignedToUser)) {
            query.assignedToUser = new mongoose.Types.ObjectId(assignedToUser);
        }

        if (search) {
            const safeRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            query.$and = [
                ...(query.$and || []),
                {
                    $or: [
                        { barcode: safeRegex },
                        { batchCode: safeRegex },
                        { patientName: safeRegex },
                        { usedInBookingId: safeRegex },
                        { assignedToName: safeRegex },
                    ],
                },
            ];
        }

        const [total, items] = await Promise.all([
            PrePrintedBarcode.countDocuments(query),
            PrePrintedBarcode.find(query)
                .sort({ updatedAt: -1, sequenceNumber: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
        ]);

        // Scanner Custody Lookup: If searching exact barcode, also enrich from newBooking even for non-preprinted codes!
        let exactScanMatch = null;
        if (search) {
            const cleanScan = normalizeBarcodeString(search);
            const [exactPool, exactBooking] = await Promise.all([
                PrePrintedBarcode.findOne({ tenantId, barcode: cleanScan }).lean(),
                newBooking
                    .findOne({
                        tenantId,
                        "tableData.barcodeId": cleanScan,
                    })
                    .sort({ createdAt: -1 })
                    .select("bookingId patientName year gender patientPhone status date time createdAt createdbyuser franchisee tableData isreportready")
                    .lean(),
            ]);

            if (exactPool || exactBooking) {
                const matchedRows = (exactBooking?.tableData || []).filter(
                    (r) => normalizeBarcodeString(r?.barcodeId) === cleanScan
                );
                exactScanMatch = {
                    barcode: cleanScan,
                    inPrePrintedPool: Boolean(exactPool),
                    poolStatus: exactPool?.status || (exactBooking ? "used_on_demand" : "unknown"),
                    batchCode: exactPool?.batchCode || "",
                    assignedToName: exactPool?.assignedToName || "",
                    sampleHint: exactPool?.sampleHint || "",
                    voidReason: exactPool?.voidReason || "",
                    reprintCount: exactPool?.reprintCount || 0,
                    createdAt: exactPool?.createdAt || exactBooking?.createdAt || null,
                    usedAt: exactPool?.usedAt || exactBooking?.createdAt || null,
                    booking: exactBooking
                        ? {
                              _id: exactBooking._id,
                              bookingId: exactBooking.bookingId,
                              patientName: exactBooking.patientName,
                              ageGender: [exactBooking.year, exactBooking.gender].filter(Boolean).join(" / "),
                              patientPhone: exactBooking.patientPhone || "",
                              status: exactBooking.status,
                              isreportready: Boolean(exactBooking.isreportready),
                              centerName: exactBooking.franchisee || exactBooking.createdbyuser || "Main Lab",
                              sampleTypes: matchedRows.map((r) => r.typeOfSample).filter(Boolean).join(", "),
                              tests: matchedRows.map((r) => r.testName).filter(Boolean).join(", "),
                              createdAt: exactBooking.createdAt,
                          }
                        : null,
                };
            }
        }

        return res.status(200).json({
            success: true,
            items,
            exactScanMatch,
            total,
            page,
            limit,
        });
    } catch (error) {
        console.error("getBarcodePoolController error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch barcode pool." });
    }
};

/* ============================================================================
 * 9. VOID / RESTORE DAMAGED PRE-PRINTED BARCODES
 * ========================================================================== */
const toggleVoidBarcodesController = async (req, res) => {
    try {
        const access = checkBarcodeAccess(req, "manage");
        if (!access.allowed) {
            return res.status(access.statusCode).json({ success: false, message: access.message });
        }

        const tenantId = resolveTenantObjectId(req.user);
        if (!tenantId) {
            return res.status(400).json({ success: false, message: "Tenant context missing." });
        }

        const action = String(req.body?.action || "void").toLowerCase(); // "void" | "restore"
        const reason = String(req.body?.reason || "Damaged / Misprinted sticker").trim().slice(0, 160);
        const barcodes = Array.isArray(req.body?.barcodes)
            ? req.body.barcodes.map((b) => normalizeBarcodeString(b)).filter(Boolean)
            : req.body?.barcode
              ? [normalizeBarcodeString(req.body.barcode)]
              : [];

        if (barcodes.length === 0) {
            return res.status(400).json({ success: false, message: "Provide at least one barcode." });
        }

        const userCtx = resolveUserContext(req.user);

        if (action === "restore") {
            const result = await PrePrintedBarcode.updateMany(
                {
                    tenantId,
                    barcode: { $in: barcodes },
                    status: "void",
                },
                {
                    $set: {
                        status: "unused",
                        voidReason: "",
                        voidedBy: null,
                        voidedAt: null,
                    },
                }
            );
            return res.status(200).json({
                success: true,
                modifiedCount: result.modifiedCount || 0,
                message: `${result.modifiedCount || 0} barcode(s) restored to Unused status.`,
            });
        }

        const result = await PrePrintedBarcode.updateMany(
            {
                tenantId,
                barcode: { $in: barcodes },
                status: "unused",
            },
            {
                $set: {
                    status: "void",
                    voidReason: reason,
                    voidedBy: userCtx.actorId,
                    voidedAt: new Date(),
                },
            }
        );

        return res.status(200).json({
            success: true,
            modifiedCount: result.modifiedCount || 0,
            message: `${result.modifiedCount || 0} unused barcode(s) marked VOID.`,
        });
    } catch (error) {
        console.error("toggleVoidBarcodesController error:", error);
        return res.status(500).json({ success: false, message: "Failed to update barcode void status." });
    }
};

/* ============================================================================
 * 10. FETCH PATIENT TUBE LABELS FOR SINGLE OR BULK BOOKINGS (ON-DEMAND PRINT)
 * ========================================================================== */
const getBookingLabelsDataController = async (req, res) => {
    try {
        const access = checkBarcodeAccess(req, "print");
        if (!access.allowed) {
            return res.status(access.statusCode).json({ success: false, message: access.message });
        }

        const tenantId = resolveTenantObjectId(req.user);
        if (!tenantId) {
            return res.status(400).json({ success: false, message: "Tenant context missing." });
        }

        const rawBookingIds = Array.isArray(req.body?.bookingIds)
            ? req.body.bookingIds
            : req.body?.bookingId
              ? [req.body.bookingId]
              : [];
        const rawDocIds = Array.isArray(req.body?.bookingDocIds)
            ? req.body.bookingDocIds
            : [];

        const bookingIds = Array.from(
            new Set(rawBookingIds.map((id) => String(id || "").trim()).filter(Boolean))
        ).slice(0, 100);
        const docIds = rawDocIds
            .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
            .map((id) => new mongoose.Types.ObjectId(String(id)))
            .slice(0, 100);

        if (bookingIds.length === 0 && docIds.length === 0) {
            return res.status(400).json({ success: false, message: "No booking IDs supplied for barcode printing." });
        }

        const userCtx = resolveUserContext(req.user);
        const matchQuery = { tenantId };
        const idOr = [];
        if (bookingIds.length > 0) idOr.push({ bookingId: { $in: bookingIds } });
        if (docIds.length > 0) idOr.push({ _id: { $in: docIds } });
        matchQuery.$or = idOr;

        if (!userCtx.isTenantAdmin && userCtx.effectiveUserId) {
            const centerIds = await resolveAccessibleCenterIds(tenantId, userCtx.effectiveUserId, false);
            matchQuery.$and = [
                {
                    $or: [
                        { createdBy: { $in: centerIds } },
                        { subFranchiseeId: { $in: centerIds } },
                    ],
                },
            ];
        }

        const [bookings, settings] = await Promise.all([
            newBooking
                .find(matchQuery)
                .select(
                    "bookingId date time createdAt patientName year gender patientPhone doctorName savedDoctor labName franchisee subFranchisee createdbyuser status tableData selectedItems"
                )
                .lean(),
            getOrCreateTenantBarcodeSettings(tenantId),
        ]);

        if (!bookings || bookings.length === 0) {
            return res.status(404).json({ success: false, message: "No matching bookings found for barcode labels." });
        }

        const foundBookingIds = bookings.map((b) => b.bookingId).filter(Boolean);
        const acceptedDocs = await acceptedBarcode
            .find({ tenantId, bookingId: { $in: foundBookingIds } })
            .lean();
        const acceptedMap = new Map(acceptedDocs.map((doc) => [doc.bookingId, doc]));

        // Collect referenced test/panel IDs so we can show crisp Short_name on small stickers!
        const testObjIds = new Set();
        const panelObjIds = new Set();
        bookings.forEach((b) => {
            (b.tableData || []).forEach((row) => {
                (row.ids || []).forEach((ref) => {
                    if (!ref?.id || !mongoose.Types.ObjectId.isValid(String(ref.id))) return;
                    if (ref.collectionName === "testSchema") testObjIds.add(String(ref.id));
                    if (ref.collectionName === "addPannel") panelObjIds.add(String(ref.id));
                });
            });
        });

        const [testDocs, panelDocs, headerName] = await Promise.all([
            testObjIds.size > 0
                ? testSchema
                      .find({ _id: { $in: Array.from(testObjIds) } })
                      .select("Name Short_name")
                      .lean()
                : [],
            panelObjIds.size > 0
                ? addPannel
                      .find({ _id: { $in: Array.from(panelObjIds) } })
                      .select("name shortName")
                      .lean()
                : [],
            resolveHeaderLabelName(req, settings),
        ]);

        const shortNameById = new Map();
        testDocs.forEach((t) => {
            shortNameById.set(String(t._id), String(t.Short_name || t.Name || "").trim());
        });
        panelDocs.forEach((p) => {
            shortNameById.set(String(p._id), String(p.shortName || p.name || "").trim());
        });

        // Preserve requested booking order
        const orderIndex = new Map();
        bookingIds.forEach((id, i) => orderIndex.set(id, i));
        bookings.sort((a, b) => {
            const ia = orderIndex.has(a.bookingId) ? orderIndex.get(a.bookingId) : 9999;
            const ib = orderIndex.has(b.bookingId) ? orderIndex.get(b.bookingId) : 9999;
            return ia - ib;
        });

        const labels = [];
        const bookingsSummary = [];

        for (const b of bookings) {
            const shortByFullName = new Map();
            (b.selectedItems || []).forEach((item) => {
                if (item?.itemName && item?.shortName) {
                    shortByFullName.set(String(item.itemName).trim().toLowerCase(), String(item.shortName).trim());
                }
            });

            const tubeMap = new Map();
            const sourceRows = Array.isArray(b.tableData) && b.tableData.length > 0
                ? b.tableData
                : (acceptedMap.get(b.bookingId)?.barcodes || []).map((acc) => ({
                      barcodeId: acc.barcode,
                      typeOfSample: acc.sampleType,
                      testName: Array.isArray(acc.testandpannelArray) ? acc.testandpannelArray.join(", ") : "",
                      ids: acc.testIds || [],
                  }));

            for (const row of sourceRows) {
                const code = normalizeBarcodeString(row?.barcodeId || row?.confirmBarcodeId || row?.barcode);
                if (!code) continue;

                const sampleType = String(row?.typeOfSample || row?.sampleType || "Sample").trim();
                const mapKey = `${code}__${normalizeSampleKey(sampleType)}`;

                if (!tubeMap.has(mapKey)) {
                    tubeMap.set(mapKey, {
                        barcode: code,
                        sampleType,
                        shortTests: new Set(),
                        fullTests: new Set(),
                    });
                }

                const tube = tubeMap.get(mapKey);

                // Resolve short test labels from IDs first, then fallback to row.testName
                const rowIds = Array.isArray(row?.ids) ? row.ids : [];
                let addedFromIds = false;
                for (const ref of rowIds) {
                    const sn = shortNameById.get(String(ref?.id || ""));
                    if (sn) {
                        tube.shortTests.add(sn);
                        addedFromIds = true;
                    }
                }

                const rawNames = String(row?.testName || "")
                    .split(",")
                    .map((n) => n.trim())
                    .filter(Boolean);

                for (const full of rawNames) {
                    tube.fullTests.add(full);
                    if (!addedFromIds) {
                        const mappedShort = shortByFullName.get(full.toLowerCase());
                        tube.shortTests.add(mappedShort || (full.length > 14 ? full.slice(0, 12) : full));
                    }
                }
            }

            const genderShort = String(b.gender || "").trim()
                ? String(b.gender).trim().charAt(0).toUpperCase()
                : "";
            const agePart = String(b.year || "").trim();
            const ageGender = [agePart, genderShort].filter(Boolean).join("/");

            const bookingDateObj = b.date ? new Date(b.date) : b.createdAt ? new Date(b.createdAt) : new Date();
            const formattedDate = !Number.isNaN(bookingDateObj.getTime())
                ? bookingDateObj.toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                  })
                : "";
            const dateTimeText = [formattedDate, String(b.time || "").trim()].filter(Boolean).join(" ");
            const centerOrLab = String(
                b.subFranchisee || b.franchisee || b.labName || headerName
            ).trim();

            const bookingTubes = Array.from(tubeMap.values()).map((tube, idx) => {
                const vacutainer = resolveVacutainerMeta(tube.sampleType);
                const shortList = Array.from(tube.shortTests);
                const fullList = Array.from(tube.fullTests);
                const testsText = (shortList.length > 0 ? shortList : fullList).join(", ");

                const labelItem = {
                    id: `${b.bookingId}_${tube.barcode}_${idx}`,
                    labelType: "patient_tube",
                    bookingId: b.bookingId,
                    bookingDocId: b._id,
                    barcode: tube.barcode,
                    patientName: String(b.patientName || "").trim(),
                    ageGender,
                    gender: b.gender || "",
                    age: agePart,
                    sampleType: tube.sampleType,
                    vacutainer,
                    testsText,
                    fullTestsText: fullList.join(", "),
                    dateTimeText,
                    headerName: headerName || centerOrLab,
                    centerName: centerOrLab,
                    doctorName: String(b.savedDoctor || b.doctorName || "").trim(),
                };
                labels.push(labelItem);
                return labelItem;
            });

            bookingsSummary.push({
                bookingId: b.bookingId,
                patientName: b.patientName,
                ageGender,
                tubesCount: bookingTubes.length,
            });
        }

        return res.status(200).json({
            success: true,
            headerName,
            settings,
            bookingsSummary,
            labels,
        });
    } catch (error) {
        console.error("getBookingLabelsDataController error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to prepare patient barcode labels.",
        });
    }
};

export {
    barcodegeneratecontroller,
    getBarcodeSettingsController,
    updateBarcodeSettingsController,
    generatePrePrintedBatchController,
    generateAutoBookingBarcodesController,
    pickUnusedPreBarcodesController,
    validateBarcodeLiveController,
    getBarcodeBatchesController,
    getBatchBarcodesController,
    getBarcodePoolController,
    toggleVoidBarcodesController,
    getBookingLabelsDataController,
};
