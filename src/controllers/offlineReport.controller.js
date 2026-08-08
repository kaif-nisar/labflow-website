import crypto from "crypto";
import { OfflineReport } from "../models/offlineReport.model.js";
import { offlinePdfGeneratorController } from "./offlinePdfGenerator.controller.js";
import { normalizeStoredUploadUrl } from "../utils/localStorage.js";

const OFFLINE_REPORT_FIELDS = [
    "tenantId", "createdBy", "bookingId", "DownloadPdf", "showInvest", "BoldRow", "HLinred", "HighLow",
    "RowSpacing", "selectedFontSize", "selectedFontFamily", "hideCategories", "hideTableHeadings", "reportId",
    "htmlContent", "cssContent", "header", "footer", "backgroundImageUrl", "headermargin", "footermargin",
    "marginRight", "marginLeft", "LeftsignPd", "Rightsignpd", "investigationmargin", "showlab", "showdoctorfirst",
    "showdoctorsecond", "fileInputLab", "fileInputDoctorleft", "fileInputDoctorright", "fileInputLabtext",
    "fileInputDoctorlefttext", "fileInputDoctorrighttext", "isdocumented", "pdfFormat"
];

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
        const offlineReportId = String(req.body?.offlineReportId || "").trim();
        if (!offlineReportId || offlineReportId.length > 200) {
            return res.status(400).json({ message: "offlineReportId is required (max 200 characters)." });
        }
        if (!req.body?.htmlContent || !req.body?.cssContent) {
            return res.status(400).json({ message: "htmlContent and cssContent are required." });
        }

        const data = Object.fromEntries(
            OFFLINE_REPORT_FIELDS
                .filter((field) => req.body[field] !== undefined)
                .map((field) => [field, req.body[field]])
        );
        if (data.backgroundImageUrl) {
            data.backgroundImageUrl = normalizeStoredUploadUrl(data.backgroundImageUrl) || data.backgroundImageUrl;
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

        return offlinePdfGeneratorController({
            ...report,
            pdfformat: report.pdfFormat || "reportFormat1",
            layerone: false,
            res,
        });
    } catch (error) {
        console.error("Unable to generate offline report PDF:", error);
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
