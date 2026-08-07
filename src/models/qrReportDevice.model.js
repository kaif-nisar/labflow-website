import mongoose from "mongoose";

const qrReportDeviceSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    label: { type: String, trim: true, maxlength: 120, default: "LabFlow Offline" },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const QrReportDevice = mongoose.model("QrReportDevice", qrReportDeviceSchema);
