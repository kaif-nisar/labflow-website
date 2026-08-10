import crypto from "crypto";
import { OfflineReport } from "../models/offlineReport.model.js";
import { offlinePdfGeneratorController } from "./offlinePdfGenerator.controller.js";
import { normalizeStoredUploadUrl } from "../utils/localStorage.js";

const OFFLINE_REPORT_FIELDS = [
    "tenantId", "createdBy", "bookingId", "DownloadPdf", "showInvest", "BoldRow", "HLinred", "HighLow",
    "RowSpacing", "selectedFontSize", "selectedFontFamily", "hideCategories", "hideTableHeadings", "reportId",
    "htmlContent", "cssContent", "header", "footer", "backgroundImageUrl", "backgroundImage", "bgImage",
    "backgroundImg", "imageUrl", "templateImage", "template", "background", "headermargin", "footermargin",
    "marginRight", "marginLeft", "LeftsignPd", "Rightsignpd", "investigationmargin", "showlab", "showdoctorfirst",
    "showdoctorsecond", "fileInputLab", "fileInputDoctorleft", "fileInputDoctorright", "fileInputLabtext",
    "fileInputDoctorlefttext", "fileInputDoctorrighttext", "isdocumented", "pdfFormat", "checkBox", "disableBackgroundImage"
];

const BG_CANDIDATE_FIELDS = [
    "backgroundImageUrl", "backgroundImage", "bgImage", "imageUrl", "templateImage", "template", "background",
    "fileInputLab", "fileInputDoctorleft", "fileInputDoctorright", "fileInputLabtext", "fileInputDoctorlefttext", "fileInputDoctorrighttext"
];

const getIncomingBackgroundImageUrl = (obj = {}) => {
    if (!obj || typeof obj !== "object") return "";

    for (const key of BG_CANDIDATE_FIELDS) {
        let val = obj[key];
        if (val === undefined || val === null) continue;

        if (typeof val === "object") {
            if (typeof val.url === "string" && val.url.trim()) {
                val = val.url;
            } else {
                continue;
            }
        }

        const str = String(val || "").trim();
        if (str) return str;
    }

    return "";
};

const oneMonthFromNow = () => {
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1);
    return expiry;
};

const getPublicBaseUrl = (req) => {
    const configured = String(process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");
    return configured || `${req.protocol}://${req.get("host")}`;
};

// This deliberately has no JWT requirement: Electron installs can upload once
// they regain connectivity. The opaque QR token is required for later access.
const saveOfflineReport = async (req, res) => {
    try {
        // Diagnostic: log incoming background-related fields to help trace empty-save bugs
        try {
            const incomingSummary = {};
            for (const key of BG_CANDIDATE_FIELDS) {
                const v = req.body?.[key];
                if (v === undefined) {
                    incomingSummary[key] = "(absent)";
                } else if (v === null) {
                    incomingSummary[key] = "(null)";
                } else if (typeof v === "string") {
                    incomingSummary[key] = `string(len=${v.length})`;
                } else if (typeof v === "object") {
                    incomingSummary[key] = `object(keys=${Object.keys(v || {}).length})`;
                } else {
                    incomingSummary[key] = typeof v;
                }
            }

            console.log('[offline-report] Incoming background fields:', incomingSummary, {
                contentType: req.get('content-type'),
                contentLength: req.get('content-length') || '(unknown)'
            });
        } catch (e) {
            console.warn('[offline-report] Failed to compute incoming summary', e);
        }
        // Diagnostic: summary for all expected offline report fields (type + length)
        try {
            const fieldSummary = {};
            for (const key of OFFLINE_REPORT_FIELDS) {
                const v = req.body?.[key];
                if (v === undefined) {
                    fieldSummary[key] = "(absent)";
                    continue;
                }
                if (v === null) {
                    fieldSummary[key] = "(null)";
                    continue;
                }

                const t = typeof v;
                if (t === "string") {
                    const len = v.length;
                    const startsData = v.startsWith && v.startsWith("data:") ? true : false;
                    fieldSummary[key] = `string(len=${len}, data=${startsData})`;
                    continue;
                }

                if (Array.isArray(v)) {
                    fieldSummary[key] = `array(len=${v.length})`;
                    continue;
                }

                if (t === "object") {
                    fieldSummary[key] = `object(keys=${Object.keys(v || {}).length})`;
                    continue;
                }

                fieldSummary[key] = t;
            }

            console.log('[offline-report] Incoming fields summary:', fieldSummary);
        } catch (e) {
            console.warn('[offline-report] Failed to compute fields summary', e);
        }
        const offlineReportId = String(
            req.body?.offlineReportId || req.body?.bookingId || req.body?.reportId || crypto.randomUUID()
        ).trim();
        if (!offlineReportId || offlineReportId.length > 200) {
            return res.status(400).json({ message: "offlineReportId is required (max 200 characters)." });
        }
        if (!req.body?.htmlContent || !req.body?.cssContent) {
            return res.status(400).json({ message: "htmlContent and cssContent are required." });
        }

        const data = Object.fromEntries(
            OFFLINE_REPORT_FIELDS
                .filter((field) => {
                    const v = req.body[field];
                    if (v === undefined || v === null) return false;
                    if (typeof v === "string") {
                        return v.trim() !== "";
                    }
                    return true;
                })
                .map((field) => [field, req.body[field]])
        );

        const rawBgUrl = getIncomingBackgroundImageUrl(req.body);
        if (rawBgUrl) {
            data.backgroundImageUrl = normalizeStoredUploadUrl(rawBgUrl) || rawBgUrl;
        }

        data.expiresAt = oneMonthFromNow();

        let document = await OfflineReport.findOne({ offlineReportId }).select("+downloadToken");
        if (document) {
            Object.assign(document, data);
            await document.save();
        } else {
            document = await OfflineReport.create({
                ...data,
                offlineReportId,
                downloadToken: crypto.randomBytes(32).toString("base64url"),
            });
        }

        const downloadUrl = `${getPublicBaseUrl(req)}/offline-report-download.html?token=${encodeURIComponent(document.downloadToken)}`;
        return res.status(201).json({
            success: true,
            offlineReportId: document.offlineReportId,
            downloadToken: document.downloadToken,
            downloadUrl,
            expiresAt: document.expiresAt,
        });
    } catch (error) {
        console.error("Unable to save offline report:", error);
        return res.status(500).json({ message: "Unable to save offline report." });
    }
};

const downloadOfflineReportPdf = async (req, res) => {
    try {
        const token = String(req.params.token || "").trim();
        if (!token) return res.status(400).json({ message: "QR report token is required." });

        const report = await OfflineReport.findOne({ downloadToken: token }).select("+downloadToken").lean();
        if (!report || report.expiresAt <= new Date()) {
            return res.status(404).json({ message: "This offline report is unavailable or has expired." });
        }

        const shouldDisable = Boolean(report.disableBackgroundImage || report.checkBox);
        const resolvedBgUrl = getIncomingBackgroundImageUrl(report);

        // Diagnostic log: always print background details so failures are traceable.
        console.log('[offline-report] Preparing PDF download', {
            bookingId: report.bookingId,
            pdfFormat: report.pdfFormat,
            shouldDisable,
            checkBox: Boolean(report.checkBox),
            disableBackgroundImage: Boolean(report.disableBackgroundImage),
            resolvedBgUrlType: !resolvedBgUrl ? 'none'
                : resolvedBgUrl.startsWith('data:') ? `data-url(len=${resolvedBgUrl.length}, prefix=${resolvedBgUrl.slice(0, 40)})`
                : resolvedBgUrl.startsWith('http') ? `remote-url(${resolvedBgUrl.slice(0, 100)})`
                : `path-or-other(${resolvedBgUrl.slice(0, 100)})`,
            // Log each individual background field so we know which one resolved
            backgroundImageUrl: report.backgroundImageUrl ? `set(len=${String(report.backgroundImageUrl).length})` : 'empty',
            backgroundImage: report.backgroundImage ? `set(len=${String(report.backgroundImage).length})` : 'empty',
            bgImage: report.bgImage ? `set(len=${String(report.bgImage).length})` : 'empty',
            imageUrl: report.imageUrl ? `set(len=${String(report.imageUrl).length})` : 'empty',
            fileInputLab: report.fileInputLab ? `set(len=${String(report.fileInputLab).length})` : 'empty',
        });

        return offlinePdfGeneratorController({
            ...report,
            backgroundImageUrl: shouldDisable ? "" : resolvedBgUrl,
            disableBackgroundImage: shouldDisable,
            checkBox: Boolean(report.checkBox),
            pdfformat: report.pdfFormat || "reportFormat1",
            layerone: false,
            res,
        });
    } catch (error) {
        console.error("[offline-report] Unable to generate offline report PDF:", error);
        return res.status(500).json({ message: "Unable to generate the report PDF." });
    }
};

const getOfflineReportSummary = async (req, res) => {
    try {
        const report = await OfflineReport.findOne({ downloadToken: String(req.params.token || "") })
            .select("bookingId expiresAt createdAt")
            .lean();
        if (!report || report.expiresAt <= new Date()) {
            return res.status(404).json({ message: "This offline report is unavailable or has expired." });
        }
        return res.json({ bookingId: report.bookingId, expiresAt: report.expiresAt, createdAt: report.createdAt });
    } catch {
        return res.status(500).json({ message: "Unable to load report details." });
    }
};

export { saveOfflineReport, downloadOfflineReportPdf, getOfflineReportSummary };
