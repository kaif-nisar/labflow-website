import mongoose from "mongoose";
import { reports } from "../models/reportData.model.js";
import { newBooking } from "../models/NewBooking.model.js";
import { doctors } from "../models/doctor.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { Tenant } from "../models/tenant.model.js";
import { getDoctorDisplayName } from "../utils/doctorPricing.js";
import {
    isBlankOrDotOnlyValue,
    normalizeCompletionMeta,
    resolveCompletionStatus,
} from "../utils/reportCompletion.js";
import {
    buildReportActionPayload,
    buildReportActionSummary,
    normalizeReportActionCounters,
    normalizeReportActionHistory,
    getReportActionSnapshot,
    recordReportAction,
} from "../utils/reportActions.js";

const normalizeOptionalEmail = (value) => String(value || "").trim().toLowerCase();

const hasMeaningfulDoctorSnapshot = (snapshot = {}) => (
    Boolean(
        snapshot?.displayName
        || snapshot?.email
        || snapshot?.firstName
        || snapshot?.lastName
    )
);

const buildDoctorSnapshot = (doctor = {}, fallback = {}) => {
    const displayName = String(
        getDoctorDisplayName(doctor)
        || fallback.displayName
        || fallback.savedDoctor
        || fallback.doctorName
        || ""
    ).trim();

    return {
        displayName,
        email: normalizeOptionalEmail(doctor?.email || fallback.email || fallback.savedDoctorEmail),
        firstName: String(doctor?.firstName || fallback.firstName || "").trim(),
        lastName: String(doctor?.lastName || fallback.lastName || "").trim(),
        source: doctor?._id ? "doctor-ref" : (fallback.source || "snapshot"),
    };
};

const buildSavedReportData = (reportData = []) => {
    const sanitizedTables = [];
    let totalRows = 0;
    let savedRows = 0;
    let skippedRows = 0;

    for (const table of Array.isArray(reportData) ? reportData : []) {
        if (!table || typeof table !== "object") {
            continue;
        }

        const sanitizedTests = [];

        for (const test of Array.isArray(table.tests) ? table.tests : []) {
            if (!test || typeof test !== "object") {
                continue;
            }

            const hasDocumentedContent = Boolean(test.isDocumented || test.details || test.remark);
            const value = test.value ?? test.currentvalue ?? "";
            const hasTrackedValueField = test.hasValueField === true ||
                test.hasValueField === "true" ||
                Object.prototype.hasOwnProperty.call(test, "currentvalue");
            const isBlankValue = isBlankOrDotOnlyValue(value);
            const isStructuralHeadingRow = test.isMultiParameterHeading === true ||
                test.isMultiParameterHeading === "true";

            if (hasTrackedValueField) {
                totalRows += 1;
            }

            if (!hasDocumentedContent && isBlankValue && !isStructuralHeadingRow) {
                if (hasTrackedValueField) {
                    skippedRows += 1;
                }
                continue;
            }

            if (hasTrackedValueField) {
                savedRows += 1;
            }

            sanitizedTests.push({
                ...test,
                value: hasDocumentedContent ? (test.value ?? test.currentvalue ?? null) : value,
                currentvalue: hasDocumentedContent ? (test.currentvalue ?? test.value ?? null) : value,
            });
        }

        const notes = isBlankOrDotOnlyValue(table.notes) ? null : table.notes;
        const remarks = isBlankOrDotOnlyValue(table.remarks) ? null : table.remarks;
        const advice = isBlankOrDotOnlyValue(table.advice) ? null : table.advice;
        const interpretation = isBlankOrDotOnlyValue(table.interpretation) ? null : table.interpretation;

        if (sanitizedTests.length || notes || remarks || advice || interpretation) {
            sanitizedTables.push({
                ...table,
                tests: sanitizedTests,
                notes,
                remarks,
                advice,
                interpretation,
            });
        }
    }

    const completionMeta = normalizeCompletionMeta({
        totalRows,
        savedRows,
        skippedRows,
        hasIncompleteValues: skippedRows > 0,
    });

    return {
        sanitizedTables,
        completionMeta,
        completionStatus: completionMeta.hasIncompleteValues ? "Partially Completed" : "Completed",
    };
};

const loadBookingDoctorFallback = async ({ bookingId, tenantId }) => {
    if (!bookingId) {
        return null;
    }

    const filter = { bookingId };
    if (tenantId) {
        filter.tenantId = tenantId;
    }

    return newBooking.findOne(filter)
        .select("savedDoctorId savedDoctor savedDoctorEmail savedDoctorMeta doctorName patientPhone")
        .lean();
};

const hydrateReportForResponse = async (reportDoc, { tenantId, pdfFormat, layerOne } = {}) => {
    if (!reportDoc) {
        return null;
    }

    const reportPayload = reportDoc.toObject ? reportDoc.toObject() : { ...reportDoc };
    const bookingFallback = await loadBookingDoctorFallback({
        bookingId: reportPayload.bookingId,
        tenantId,
    });

    const snapshotDoctorId = reportPayload.savedDoctorId || bookingFallback?.savedDoctorId || null;
    const snapshotDoctorMeta = hasMeaningfulDoctorSnapshot(reportPayload.savedDoctorMeta)
        ? reportPayload.savedDoctorMeta
        : (hasMeaningfulDoctorSnapshot(bookingFallback?.savedDoctorMeta) ? bookingFallback.savedDoctorMeta : null);

    const snapshotDoctorName = String(
        reportPayload.savedDoctor
        || snapshotDoctorMeta?.displayName
        || bookingFallback?.savedDoctor
        || reportPayload.doctorName
        || bookingFallback?.doctorName
        || ""
    ).trim();

    const snapshotDoctorEmail = normalizeOptionalEmail(
        reportPayload.savedDoctorEmail
        || snapshotDoctorMeta?.email
        || bookingFallback?.savedDoctorEmail
    );

    let liveDoctor = null;
    if (
        !reportPayload.signOff &&
        snapshotDoctorId &&
        mongoose.Types.ObjectId.isValid(String(snapshotDoctorId))
    ) {
        const doctorFilter = { _id: snapshotDoctorId };
        if (tenantId) {
            doctorFilter.tenantId = tenantId;
        }

        liveDoctor = await doctors.findOne(doctorFilter)
            .select("displayName firstName lastName email")
            .lean();
    }

    const latestDoctorName = String(getDoctorDisplayName(liveDoctor) || "").trim();
    const latestDoctorEmail = normalizeOptionalEmail(liveDoctor?.email);
    const doctorName = reportPayload.signOff
        ? (snapshotDoctorName || reportPayload.doctorName || "")
        : (latestDoctorName || snapshotDoctorName || reportPayload.doctorName || "");
    const doctorEmail = reportPayload.signOff
        ? snapshotDoctorEmail
        : (latestDoctorEmail || snapshotDoctorEmail);

    const resolvedDoctorSnapshot = hasMeaningfulDoctorSnapshot(snapshotDoctorMeta)
        ? snapshotDoctorMeta
        : buildDoctorSnapshot(liveDoctor || {}, {
            displayName: snapshotDoctorName,
            savedDoctorEmail: snapshotDoctorEmail,
            source: "snapshot",
        });

    const actionCounters = normalizeReportActionCounters(reportPayload.actionCounters);
    const actionHistory = normalizeReportActionHistory(reportPayload.actionHistory);

    return {
        ...reportPayload,
        savedDoctorId: snapshotDoctorId,
        savedDoctor: snapshotDoctorName || reportPayload.savedDoctor || "",
        savedDoctorEmail: doctorEmail,
        savedDoctorMeta: resolvedDoctorSnapshot,
        doctorName,
        patientPhone: reportPayload.patientPhone || bookingFallback?.patientPhone || "",
        latestDoctorName: !reportPayload.signOff ? latestDoctorName : "",
        latestDoctorEmail: !reportPayload.signOff ? latestDoctorEmail : "",
        contactDefaults: {
            email: doctorEmail,
            phone: reportPayload.patientPhone || bookingFallback?.patientPhone || "",
        },
        actionCounters,
        actionHistory,
        actionSummary: buildReportActionSummary(actionCounters),
        ...(pdfFormat ? { pdfFormat } : {}),
        ...(layerOne ? { layerOne } : {}),
    };
};

const findReportByValue = async ({ value1, tenantId }) => {
    let reportDoc = await reports.findOne({
        bookingId: value1,
        tenantId,
    });

    if (!reportDoc && mongoose.Types.ObjectId.isValid(String(value1))) {
        reportDoc = await reports.findOne({
            _id: value1,
            tenantId,
        });
    }

    return reportDoc;
};

const getReportByBookingId = async (req, res) => {
    const { bookingId } = req.params;

    try {
        const reportDoc = await reports.findOne({ bookingId });
        if (!reportDoc) {
            return res.status(404).json({ message: "Report not found" });
        }

        return res.status(200).json(reportDoc);
    } catch (error) {
        return res.status(500).json({ error: "Server error" });
    }
};

const SaveReportController = asyncHandler(async (req, res) => {
    const {
        reportData,
        reg_id,
        booking,
        collectedOn,
        receivedOn,
        reportedOn,
        categorized,
        moredetails,
        uniquetestArray,
        isdocumented,
        reportCompletionMeta,
        completionMeta,
        reportCompletionStatus,
        completionStatus,
    } = req.body;

    const tenantId = req.user.tenantId._id;

    if (!reportData || !reg_id || !booking) {
        throw new ApiError(500, "please try again after sometime, and fill all test values");
    }

    const savedReportData = buildSavedReportData(reportData);
    const resolvedCompletionMeta = normalizeCompletionMeta(
        reportCompletionMeta || completionMeta || savedReportData.completionMeta
    );
    const resolvedCompletionStatus = resolveCompletionStatus(
        reportCompletionStatus || completionStatus || savedReportData.completionStatus,
        resolvedCompletionMeta
    );

    const savedREport = await reports.findOneAndUpdate(
        {
            bookingId: booking.bookingId,
            tenantId,
        },
        {
            reg_id,
            ...booking,
            collectedOn,
            receivedOn,
            reportedOn,
            categorizedPDF: categorized,
            MoreDetails: moredetails,
            uniquetestArray,
            isdocumented,
            status: resolvedCompletionStatus,
            completionMeta: resolvedCompletionMeta,
            CategoryAndTest: savedReportData.sanitizedTables,
        },
        {
            upsert: true,
            returnDocument: "after",
        }
    );

    if (!savedREport) {
        throw new ApiError(400, "please try again after sometime, report not saved");
    }

    if (req.user.role === "staff") {
        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "other",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: `${req.user.fullName} has updated a report.`,
                        reports: savedREport.bookingId,
                        patientName: savedREport.patientName,
                    },
                    reference: {
                        model: "Report",
                        id: savedREport._id,
                    },
                    timestamp: new Date(),
                },
            },
        });
    }

    return res.status(200).json(savedREport);
});

const editReportController = asyncHandler(async (req, res) => {
    const { reportData, reg_id, booking, signedBy, collectedOn, receivedOn, reportedOn } = req.body;

    if (!reportData || !reg_id || !booking || !signedBy) {
        throw new ApiError(500, "please try again after sometime, and fill all test values");
    }

    const savedREport = await reports.findOneAndUpdate(
        { bookingId: booking.bookingId },
        {
            CategoryAndTest: reportData,
            reg_id,
            ...booking,
            signedBy,
            collectedOn,
            receivedOn,
            reportedOn,
        },
        { returnDocument: "after" }
    );

    if (!savedREport) {
        throw new ApiError(400, "please try again after sometime, report not saved");
    }

    return res.status(200).json(savedREport);
});

const editReportsignofffieldController = asyncHandler(async (req, res) => {
    const { value1, signoff } = req.body;

    if (!value1) {
        throw new ApiError(500, "value1 is not recieved for edit report sign off field");
    }

    const filter = mongoose.Types.ObjectId.isValid(String(value1))
        ? { _id: value1 }
        : { bookingId: value1 };

    const savedREport = await reports.findOneAndUpdate(
        filter,
        { signOff: signoff },
        { returnDocument: "after" }
    );

    if (!savedREport) {
        throw new ApiError(400, "please try again after sometime, report not saved");
    }

    return res.status(200).json(savedREport);
});

const getReportController = asyncHandler(async (req, res) => {
    const { value1 } = req.body;
    const tenantId = req.user.tenantId._id;

    const reportDoc = await findReportByValue({ value1, tenantId });
    if (!reportDoc) {
        throw new ApiError(400, "Please try again after sometime, report not found");
    }

    const hydratedReport = await hydrateReportForResponse(reportDoc, { tenantId });
    return res.status(200).json(hydratedReport);
});

const getReportControlleruser = asyncHandler(async (req, res) => {
    const { value1, tenantId } = req.body;

    const reportDoc = await findReportByValue({ value1, tenantId });
    if (!reportDoc) {
        throw new ApiError(400, "Please try again after sometime, report not found");
    }

    const user = await User.findOne({ tenantId }).select("pdfFormat").lean();
    const usertenant = await Tenant.findById(tenantId).select("modelType").lean();
    const hydratedReport = await hydrateReportForResponse(reportDoc, {
        tenantId,
        pdfFormat: user?.pdfFormat,
        layerOne: usertenant?.modelType,
    });

    return res.status(200).json(hydratedReport);
});

const trackReportActionController = asyncHandler(async (req, res) => {
    const { reportId, bookingId, action, clientActionId } = req.body;

    if (!action) {
        throw new ApiError(400, "action is required");
    }

    const trackedAction = await recordReportAction({
        reportId,
        bookingId,
        action,
        clientActionId,
    });

    if (!trackedAction?.report) {
        throw new ApiError(404, "Report not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                ...buildReportActionPayload(trackedAction.report),
                alreadyRecorded: trackedAction.alreadyRecorded,
                clientActionId: String(clientActionId || "").trim(),
                syncedAt: new Date().toISOString(),
            },
            "Report action tracked successfully"
        )
    );
});

const getReportActionStatsController = asyncHandler(async (req, res) => {
    const { reportId, bookingId } = req.body;
    const reportSnapshot = await getReportActionSnapshot({ reportId, bookingId });

    if (!reportSnapshot) {
        throw new ApiError(404, "Report not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                ...buildReportActionPayload(reportSnapshot),
                syncedAt: new Date().toISOString(),
            },
            "Report action stats fetched successfully"
        )
    );
});

export {
    SaveReportController,
    editReportController,
    editReportsignofffieldController,
    getReportByBookingId,
    getReportController,
    getReportControlleruser,
    trackReportActionController,
    getReportActionStatsController,
};
