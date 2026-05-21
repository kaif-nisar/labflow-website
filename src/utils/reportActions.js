import mongoose from "mongoose";
import { reports } from "../models/reportData.model.js";

const REPORT_ACTION_KEYS = Object.freeze([
    "viewPdf",
    "downloadPdf",
    "email",
    "sms",
    "whatsappOpen",
    "printDialog",
]);

const REPORT_ACTION_FIELD_MAP = {
    viewPdf: "actionCounters.viewPdf",
    downloadPdf: "actionCounters.downloadPdf",
    email: "actionCounters.email",
    sms: "actionCounters.sms",
    whatsappOpen: "actionCounters.whatsappOpen",
    printDialog: "actionCounters.printDialog",
};

const DEFAULT_REPORT_ACTION_COUNTERS = Object.freeze({
    viewPdf: 0,
    downloadPdf: 0,
    email: 0,
    sms: 0,
    whatsappOpen: 0,
    printDialog: 0,
});

const DEFAULT_REPORT_ACTION_HISTORY = Object.freeze(
    Object.fromEntries(REPORT_ACTION_KEYS.map((key) => [key, []]))
);

const toSafeCounter = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const toIsoDateOrNull = (value) => {
    if (!value) {
        return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const normalizeReportActionCounters = (counters = {}) => ({
    ...DEFAULT_REPORT_ACTION_COUNTERS,
    ...Object.fromEntries(
        Object.keys(DEFAULT_REPORT_ACTION_COUNTERS).map((key) => [
            key,
            toSafeCounter(counters?.[key]),
        ])
    ),
});

const normalizeReportActionHistoryEntries = (entries = []) => {
    if (!Array.isArray(entries)) {
        return [];
    }

    return entries
        .map((entry) => {
            const clickedAt = toIsoDateOrNull(entry?.clickedAt || entry);
            if (!clickedAt) {
                return null;
            }

            return {
                actionId: String(entry?.actionId || "").trim(),
                clickedAt,
            };
        })
        .filter(Boolean)
        .sort((left, right) => new Date(right.clickedAt) - new Date(left.clickedAt));
};

const normalizeReportActionHistory = (history = {}) => ({
    ...DEFAULT_REPORT_ACTION_HISTORY,
    ...Object.fromEntries(
        REPORT_ACTION_KEYS.map((key) => [
            key,
            normalizeReportActionHistoryEntries(history?.[key]),
        ])
    ),
});

const buildReportActionSummary = (counters = {}) => {
    const normalizedCounters = normalizeReportActionCounters(counters);

    return {
        viewPdf: normalizedCounters.viewPdf,
        downloadPdf: normalizedCounters.downloadPdf,
        email: normalizedCounters.email,
        sms: normalizedCounters.sms,
        whatsappOpen: normalizedCounters.whatsappOpen,
        printDialog: normalizedCounters.printDialog,
    };
};

const resolveReportLookupFilter = ({ reportId, bookingId } = {}) => {
    if (reportId && mongoose.Types.ObjectId.isValid(String(reportId))) {
        return { _id: reportId };
    }

    if (bookingId) {
        return { bookingId };
    }

    return null;
};

const buildReportActionProjection = () => ({
    actionCounters: 1,
    actionHistory: 1,
    bookingId: 1,
    lastEmailedAt: 1,
    lastEmailedTo: 1,
});

const buildReportActionPayload = (reportDoc) => {
    const actionCounters = normalizeReportActionCounters(reportDoc?.actionCounters);
    const actionHistory = normalizeReportActionHistory(reportDoc?.actionHistory);

    return {
        actionCounters,
        actionHistory,
        actionSummary: buildReportActionSummary(actionCounters),
        bookingId: reportDoc?.bookingId || "",
        lastEmailedAt: toIsoDateOrNull(reportDoc?.lastEmailedAt),
        lastEmailedTo: String(reportDoc?.lastEmailedTo || "").trim(),
    };
};

const getReportActionSnapshot = async ({ reportId, bookingId }) => {
    const filter = resolveReportLookupFilter({ reportId, bookingId });
    if (!filter) {
        throw new Error("reportId or bookingId is required");
    }

    return reports.findOne(filter, buildReportActionProjection());
};

const findRecordedReportAction = async ({ reportId, bookingId, action, clientActionId }) => {
    if (!clientActionId) {
        return null;
    }

    const actionFieldPath = REPORT_ACTION_FIELD_MAP[action];
    if (!actionFieldPath) {
        throw new Error("Unsupported report action");
    }

    const filter = resolveReportLookupFilter({ reportId, bookingId });
    if (!filter) {
        throw new Error("reportId or bookingId is required");
    }

    const actionHistoryFieldPath = `actionHistory.${action}`;

    return reports.findOne(
        {
            ...filter,
            [actionHistoryFieldPath]: {
                $elemMatch: { actionId: clientActionId },
            },
        },
        buildReportActionProjection()
    );
};

const recordReportAction = async ({
    reportId,
    bookingId,
    action,
    clientActionId,
    clickedAt = new Date(),
    extraSet = {},
} = {}) => {
    const actionFieldPath = REPORT_ACTION_FIELD_MAP[action];
    if (!actionFieldPath) {
        throw new Error("Unsupported report action");
    }

    const filter = resolveReportLookupFilter({ reportId, bookingId });
    if (!filter) {
        throw new Error("reportId or bookingId is required");
    }

    const actionHistoryFieldPath = `actionHistory.${action}`;
    const normalizedActionId = String(clientActionId || "").trim();
    const actionEntry = {
        actionId: normalizedActionId,
        clickedAt: clickedAt instanceof Date ? clickedAt : new Date(clickedAt),
    };

    const guardedFilter = normalizedActionId
        ? {
            ...filter,
            [actionHistoryFieldPath]: {
                $not: {
                    $elemMatch: { actionId: normalizedActionId },
                },
            },
        }
        : filter;

    const updatedReport = await reports.findOneAndUpdate(
        guardedFilter,
        {
            $inc: { [actionFieldPath]: 1 },
            $push: { [actionHistoryFieldPath]: actionEntry },
            $set: {
                updatedAt: new Date(),
                ...extraSet,
            },
        },
        {
            returnDocument: "after",
            projection: buildReportActionProjection(),
        }
    );

    if (updatedReport) {
        return {
            report: updatedReport,
            alreadyRecorded: false,
        };
    }

    if (!normalizedActionId) {
        return {
            report: null,
            alreadyRecorded: false,
        };
    }

    const existingReport = await findRecordedReportAction({
        reportId,
        bookingId,
        action,
        clientActionId: normalizedActionId,
    });

    return {
        report: existingReport,
        alreadyRecorded: Boolean(existingReport),
    };
};

export {
    REPORT_ACTION_KEYS,
    REPORT_ACTION_FIELD_MAP,
    DEFAULT_REPORT_ACTION_COUNTERS,
    DEFAULT_REPORT_ACTION_HISTORY,
    normalizeReportActionCounters,
    normalizeReportActionHistory,
    buildReportActionSummary,
    buildReportActionPayload,
    getReportActionSnapshot,
    findRecordedReportAction,
    recordReportAction,
};
