import crypto from "node:crypto";
import { QrReportDevice } from "../models/qrReportDevice.model.js";
import { QrReportLink } from "../models/qrReportLink.model.js";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const tokenHash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const makeToken = () => crypto.randomBytes(32).toString("base64url");
const safeFileName = (value) => {
  const cleaned = String(value || "LabFlow-Report.pdf").replace(/[^a-zA-Z0-9._() -]/g, "_").slice(0, 175);
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
};

export const issueQrReportDevice = async (req, res) => {
  const rawToken = makeToken();
  const device = await QrReportDevice.create({
    ownerId: req.user._id,
    tenantId: req.user.tenantId || null,
    tokenHash: tokenHash(rawToken),
    label: String(req.body?.label || "LabFlow Offline").trim() || "LabFlow Offline",
  });
  return res.status(201).json({ success: true, deviceToken: rawToken, deviceId: device._id });
};

export const requireQrReportDevice = async (req, res, next) => {
  const header = String(req.header("authorization") || "");
  const rawToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!rawToken) return res.status(401).json({ success: false, message: "QR relay authorization is required." });
  const device = await QrReportDevice.findOne({ tokenHash: tokenHash(rawToken), revokedAt: null });
  if (!device) return res.status(401).json({ success: false, message: "QR relay authorization is invalid." });
  req.qrReportDevice = device;
  return next();
};

export const createQrReportLink = async (req, res) => {
  const encoded = String(req.body?.pdfBase64 || "").replace(/^data:application\/pdf;base64,/i, "");
  if (!encoded || !/^[A-Za-z0-9+/=_-]+$/.test(encoded)) {
    return res.status(400).json({ success: false, message: "A PDF is required." });
  }
  const pdf = Buffer.from(encoded, "base64");
  if (pdf.length < 5 || pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString() !== "%PDF-") {
    return res.status(400).json({ success: false, message: "PDF must be valid and no larger than 8 MB." });
  }
  const token = makeToken();
  const report = await QrReportLink.create({
    token,
    deviceId: req.qrReportDevice._id,
    ownerId: req.qrReportDevice.ownerId,
    tenantId: req.qrReportDevice.tenantId,
    fileName: safeFileName(req.body?.fileName),
    pdf,
    pdfBytes: pdf.length,
    sourceReportId: String(req.body?.sourceReportId || "").slice(0, 120),
    bookingId: String(req.body?.bookingId || "").slice(0, 120),
    expiresAt: new Date(Date.now() + MONTH_MS),
  });
  await QrReportDevice.updateOne({ _id: req.qrReportDevice._id }, { $set: { lastUsedAt: new Date() } });
  return res.status(201).json({ success: true, publicUrl: `${req.protocol}://${req.get("host")}/r/${report.token}`, expiresAt: report.expiresAt });
};

const loadReport = async (token) => QrReportLink.findOne({ token, expiresAt: { $gt: new Date() } }).select("+pdf");

export const showQrReport = async (req, res) => {
  const report = await QrReportLink.findOne({ token: req.params.token, expiresAt: { $gt: new Date() } }).select("fileName expiresAt");
  if (!report) return res.status(404).send("<h2>Report link has expired or is unavailable.</h2>");
  const downloadUrl = `/r/${encodeURIComponent(req.params.token)}/download`;
  return res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LabFlow Report</title><style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f8fb;color:#152238}.card{max-width:430px;padding:34px;border-radius:16px;background:#fff;box-shadow:0 8px 30px #1522381a;text-align:center}a{display:inline-block;background:#1266d6;color:#fff;padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:700}</style></head><body><main class="card"><h2>Your LabFlow report is ready</h2><p>The download should start automatically. If it does not, use the button below.</p><a href="${downloadUrl}">Download report</a></main><script>setTimeout(()=>location.assign(${JSON.stringify(downloadUrl)}),500)</script></body></html>`);
};

export const downloadQrReport = async (req, res) => {
  const report = await loadReport(req.params.token);
  if (!report) return res.status(404).send("Report link has expired or is unavailable.");
  await QrReportLink.updateOne({ _id: report._id }, { $inc: { downloadCount: 1 }, $set: { lastDownloadedAt: new Date() } });
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safeFileName(report.fileName)}"`, "Cache-Control": "private, no-store" });
  return res.send(report.pdf);
};
