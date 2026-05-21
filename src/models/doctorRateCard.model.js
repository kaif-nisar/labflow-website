import mongoose, { Schema } from "mongoose";

const doctorRateCardSchema = new Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "doctor",
      required: true,
      index: true,
    },
    itemType: {
      type: String,
      enum: ["test", "panel", "package"],
      required: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

doctorRateCardSchema.index(
  { tenantId: 1, doctorId: 1, itemType: 1, itemId: 1 },
  { unique: true }
);

const DoctorRateCard =
  mongoose.models.DoctorRateCard ||
  mongoose.model("DoctorRateCard", doctorRateCardSchema);

export { DoctorRateCard };
