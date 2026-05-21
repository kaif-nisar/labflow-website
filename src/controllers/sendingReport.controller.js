import fs from "fs/promises";
import nodemailer from "nodemailer";
import { Request } from "../models/request.model.js";
import { superadminnotification } from "../models/superadminnotification.model.js";
import {
    buildReportActionPayload,
    findRecordedReportAction,
    recordReportAction,
} from "../utils/reportActions.js";

const isOfflineMode = String(process.env.OFFLINE_MODE || "").toLowerCase() === "true";
const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const emailErrorCodesTreatedAsWeakNetwork = new Set([
    "ENOTFOUND",
    "EAI_AGAIN",
    "ETIMEDOUT",
    "ESOCKET",
    "ECONNECTION",
    "ECONNRESET",
    "ECONNREFUSED",
]);

const toBoolean = (value) => ["true", "1", "yes", "on"].includes(String(value || "").trim().toLowerCase());

const buildTransporter = () => {
    const smtpHost = String(process.env.SMTP_HOST || "").trim();
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = String(process.env.SMTP_USER || "").trim();
    const smtpPass = String(process.env.SMTP_PASS || "").trim();

    if (smtpHost && smtpUser && smtpPass) {
        return nodemailer.createTransport({
            host: smtpHost,
            port: Number.isFinite(smtpPort) ? smtpPort : 587,
            secure: toBoolean(process.env.SMTP_SECURE) || smtpPort === 465,
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
            tls: {
                rejectUnauthorized: false,
            },
        });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return null;
    }

    return nodemailer.createTransport({
        service: String(process.env.EMAIL_SERVICE || "gmail").trim() || "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
};

const resolveFromAddress = () => (
    String(
        process.env.SMTP_FROM
        || process.env.EMAIL_FROM
        || process.env.SMTP_USER
        || process.env.EMAIL_USER
        || ""
    ).trim()
);

const removeTempFile = async (filePath) => {
    if (!filePath) {
        return;
    }

    await fs.unlink(filePath).catch(() => {});
};

const normalizeOptionalEmail = (value) => String(value || "").trim().toLowerCase();

const sanitizeFileSegment = (value, fallback) => {
    const cleaned = String(value || "")
        .replace(/[^\w\u0900-\u097F -]/g, "")
        .trim()
        .replace(/\s+/g, "_");

    return cleaned || fallback;
};

const buildFriendlyReportFilename = ({ patientName, bookingId, fallbackName }) => {
    const safePatientName = sanitizeFileSegment(patientName, "Patient");
    const safeBookingId = sanitizeFileSegment(bookingId, "Report");

    if (safePatientName && safeBookingId) {
        return `${safePatientName}-${safeBookingId}.pdf`;
    }

    return fallbackName || "report.pdf";
};

const normalizeLineBreaks = (value) => String(value || "").replace(/\r\n/g, "\n").trim();

const buildReportEmailSubject = ({ bookingId } = {}) => {
    const normalizedBookingId = String(bookingId || "").trim();
    return normalizedBookingId
        ? `Report shared from LabFlow | Booking ID ${normalizedBookingId}`
        : "Report shared from LabFlow";
};

const buildReportEmailBody = ({ bookingId } = {}) => {
    const lines = [
        "Hello,",
        "",
        "Please find the attached report shared from LabFlow.",
    ];

    if (bookingId) {
        lines.push(`Booking ID: ${String(bookingId).trim()}`);
    }

    lines.push(
        "",
        "If you were not expecting this email, you may ignore it.",
        "",
        "Regards,",
        "LabFlow Team"
    );

    return lines.join("\n");
};

const isLegacyReportSubject = (value) => /^LabFlow Report(\s*-\s*.+)?$/i.test(String(value || "").trim());

const isLegacyReportBody = (value) => (
    normalizeLineBreaks(value)
        .replace(/\s+/g, " ")
        .toLowerCase()
        === "dear patient, please find your report attached. regards, labflow"
);

const normalizeEmailSubject = (value, fallbackContext = {}) => {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue || isLegacyReportSubject(normalizedValue)) {
        return buildReportEmailSubject(fallbackContext);
    }

    return normalizedValue;
};

const normalizeEmailBody = (value, fallbackContext = {}) => {
    const normalizedValue = normalizeLineBreaks(value);
    if (!normalizedValue || isLegacyReportBody(normalizedValue)) {
        return buildReportEmailBody(fallbackContext);
    }

    return normalizedValue;
};

const escapeHtml = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildBodyMarkup = (body) => normalizeLineBreaks(body)
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((block) => (
        `<p style="margin: 0 0 14px; font-size: 15px; line-height: 1.7; color: #334155;">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`
    ))
    .join("");

const buildReportEmailHtml = ({ subject, body, bookingId }) => {
    const subjectText = escapeHtml(subject);
    const bodyMarkup = buildBodyMarkup(body);
    const bookingIdMarkup = bookingId
        ? `
            <div style="margin-top: 18px; padding: 12px 14px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0;">
                <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em;">Booking ID</div>
                <div style="margin-top: 4px; font-size: 15px; font-weight: 700; color: #0f172a;">${escapeHtml(bookingId)}</div>
            </div>
        `
        : "";

    return `
        <div style="margin: 0; padding: 24px; background: #f1f5f9; font-family: Arial, sans-serif; color: #0f172a;">
            <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #dbe3ee; border-radius: 16px; overflow: hidden;">
                <div style="padding: 24px 24px 20px;">
                    <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #2563eb;">LabFlow</div>
                    <h1 style="margin: 12px 0 14px; font-size: 22px; line-height: 1.3; color: #0f172a;">${subjectText}</h1>
                    ${bodyMarkup}
                    ${bookingIdMarkup}
                </div>
                <div style="padding: 14px 24px; border-top: 1px solid #e2e8f0; background: #f8fafc; font-size: 12px; line-height: 1.6; color: #64748b;">
                    This email was sent from LabFlow with the report attached as a PDF.
                </div>
            </div>
        </div>
    `;
};

const resolveEmailFailureMessage = (error) => {
    if (emailErrorCodesTreatedAsWeakNetwork.has(error?.code)) {
        return "Internet weak hai, email send nahi hua. Please try again.";
    }

    if (error?.code === "EAUTH" || /invalid login|auth/i.test(String(error?.message || ""))) {
        return "Email authentication failed. Please verify EMAIL_USER/EMAIL_PASS or SMTP settings.";
    }

    return "Email send nahi ho paaya. Please try again.";
};

async function sendSMS(req, res) {
    const uploadedPdf = req.files?.pdf?.[0];
    await removeTempFile(uploadedPdf?.path);

    return res.status(503).json({
        success: false,
        message: "SMS sharing is not available in the offline desktop package. Please share the saved PDF manually.",
    });
}

async function sendEmail(req, res) {
    const { email, subject, body, reportId, bookingId, patientName, clientActionId } = req.body;
    const file = req.files?.pdf?.[0];
    const transporter = buildTransporter();
    const normalizedEmail = normalizeOptionalEmail(email);
    const normalizedActionId = String(clientActionId || "").trim();
    const normalizedSubject = normalizeEmailSubject(subject, { bookingId });
    const normalizedBody = normalizeEmailBody(body, { bookingId });

    if (!file) {
        return res.status(400).json({ success: false, error: "Please attach a PDF file." });
    }

    if (!normalizedEmail) {
        await removeTempFile(file.path);
        return res.status(400).json({ success: false, error: "Email address is required." });
    }

    if (!SIMPLE_EMAIL_REGEX.test(normalizedEmail)) {
        await removeTempFile(file.path);
        return res.status(400).json({ success: false, error: "Please enter a valid email address." });
    }

    if (!transporter) {
        await removeTempFile(file.path);
        return res.status(503).json({
            success: false,
            error: "Email service is not configured on this system. Please set EMAIL_USER and EMAIL_PASS.",
        });
    }

    try {
        if (normalizedActionId) {
            const existingAction = await findRecordedReportAction({
                reportId,
                bookingId,
                action: "email",
                clientActionId: normalizedActionId,
            });

            if (existingAction) {
                const existingPayload = buildReportActionPayload(existingAction);
                return res.status(200).json({
                    success: true,
                    message: "Email sent successfully.",
                    ...existingPayload,
                    emailSentCount: existingPayload.actionCounters.email,
                    alreadyRecorded: true,
                    clientActionId: normalizedActionId,
                });
            }
        }

        const attachmentFileName = buildFriendlyReportFilename({
            patientName,
            bookingId,
            fallbackName: file.originalname || "report.pdf",
        });
        const fromAddress = resolveFromAddress();

        await transporter.sendMail({
            from: fromAddress ? `"LabFlow" <${fromAddress}>` : undefined,
            replyTo: fromAddress || undefined,
            to: normalizedEmail,
            subject: normalizedSubject,
            text: normalizedBody,
            html: buildReportEmailHtml({
                subject: normalizedSubject,
                body: normalizedBody,
                bookingId,
            }),
            attachments: [
                {
                    filename: attachmentFileName,
                    path: file.path,
                    contentType: "application/pdf",
                },
            ],
        });

        let trackedEmail = null;
        try {
            trackedEmail = await recordReportAction({
                reportId,
                bookingId,
                action: "email",
                clientActionId: normalizedActionId,
                extraSet: {
                    lastEmailedAt: new Date(),
                    lastEmailedTo: normalizedEmail,
                },
            });
        } catch (error) {
            console.warn("Email count update skipped:", error.message);
        }

        const actionPayload = buildReportActionPayload(trackedEmail?.report);

        return res.status(200).json({
            success: true,
            message: "Email sent successfully.",
            ...actionPayload,
            emailSentCount: actionPayload.actionCounters.email,
            alreadyRecorded: trackedEmail?.alreadyRecorded || false,
            clientActionId: normalizedActionId,
        });
    } catch (error) {
        console.error("Error sending email:", error);
        return res.status(503).json({
            success: false,
            error: resolveEmailFailureMessage(error),
        });
    } finally {
        await removeTempFile(file.path);
    }
}

const handleRequest = async (req, res) => {
    try {
        const { name, email, phone, city, plan } = req.body;

        if (!name || !email || !phone || !city || !plan) {
            return res.status(400).json({ message: "Missing required fields." });
        }

        const requestDoc = await Request.create({
            name,
            email,
            phone,
            city,
            plan,
            createdAt: new Date(),
        });

        if (!requestDoc) {
            return res.status(400).json({ message: "Something went wrong. Please try again." });
        }

        await superadminnotification.create({
            userEmail: email,
            message: `Request submitted successfully for plan: ${plan}`,
            relatedPlan: plan,
            type: "success",
            deliveryStatus: isOfflineMode ? "stored-offline" : "sent",
        });

        const transporter = buildTransporter();
        if (transporter) {
            await transporter.sendMail({
                from: `"LabFlow" <${process.env.EMAIL_USER}>`,
                to: process.env.EMAIL_USER,
                subject: `New Request from ${name}, ${plan} plan`,
                html: `
                    <h2>New Request Details</h2>
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Phone:</strong> ${phone}</p>
                    <p><strong>City:</strong> ${city}</p>
                    <p><strong>Plan:</strong> ${plan}</p>
                `,
            });
        }

        return res.status(200).json({
            message: isOfflineMode
                ? "Request saved locally. Internet-based notifications are disabled in offline mode."
                : "Request processed successfully.",
        });
    } catch (error) {
        console.error("Error handling request:", error.message);
        return res.status(500).json({ message: "Internal server error." });
    }
};

export {
    sendSMS,
    sendEmail,
    handleRequest,
};
