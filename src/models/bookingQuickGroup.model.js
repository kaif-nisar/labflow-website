import mongoose, { Schema } from "mongoose";

const bookingQuickGroupItemSchema = new Schema(
  {
    itemType: {
      type: String,
      enum: ["test", "panel", "package"],
      required: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    itemName: {
      type: String,
      trim: true,
      required: true,
    },
    sampleTypes: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const bookingQuickGroupSchema = new Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    scope: {
      type: String,
      enum: ["common", "doctor"],
      default: "common",
      required: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "doctor",
      default: null,
    },
    items: {
      type: [bookingQuickGroupItemSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
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

bookingQuickGroupSchema.index(
  { tenantId: 1, scope: 1, doctorId: 1, name: 1 },
  { unique: true }
);

const BookingQuickGroup =
  mongoose.models.BookingQuickGroup ||
  mongoose.model("BookingQuickGroup", bookingQuickGroupSchema);

export { BookingQuickGroup };
