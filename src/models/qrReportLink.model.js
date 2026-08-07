import mongoose from "mongoose";

const qrReportLinkSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: "QrReportDevice", required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    fileName: { type: String, required: true, maxlength: 180 },
    pdf: { type: Buffer, required: true, select: false },
    pdfBytes: { type: Number, required: true },
    sourceReportId: { type: String, trim: true, maxlength: 120 },
    bookingId: { type: String, trim: true, maxlength: 120 },
    expiresAt: { type: Date, required: true },
    downloadCount: { type: Number, default: 0 },
    lastDownloadedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Every report owns its expiry date. MongoDB removes it automatically after that date.
qrReportLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const QrReportLink = mongoose.model("QrReportLink", qrReportLinkSchema);
