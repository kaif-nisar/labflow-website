import mongoose, { Schema } from "mongoose";

const formulaDependencySchema = new Schema(
  {
    parameterMasterKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    testId: {
      type: Schema.Types.ObjectId,
      ref: "testSchema",
      default: null,
    },
    parameterId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    label: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const formulaSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetTestId: {
      type: Schema.Types.ObjectId,
      ref: "testSchema",
      default: null,
      index: true,
    },
    targetParameterId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    targetMasterKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    targetLabel: {
      type: String,
      required: true,
      trim: true,
    },
    expression: {
      type: String,
      required: true,
      trim: true,
    },
    displayExpression: {
      type: String,
      required: true,
      trim: true,
    },
    dependencies: {
      type: [formulaDependencySchema],
      default: [],
    },
    precision: {
      type: Number,
      default: 2,
      min: 0,
      max: 6,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    allowManualOverride: {
      type: Boolean,
      default: false,
    },
    lastValidatedAt: {
      type: Date,
      default: null,
    },
    validationStatus: {
      type: String,
      enum: ["valid", "invalid"],
      default: "valid",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

formulaSchema.index(
  { tenantId: 1, targetMasterKey: 1 },
  { unique: true, partialFilterExpression: { targetMasterKey: { $exists: true } } }
);

formulaSchema.index({ tenantId: 1, isActive: 1, updatedAt: -1 });
formulaSchema.index({ tenantId: 1, "dependencies.parameterMasterKey": 1 });

const Formula =
  mongoose.models.Formula || mongoose.model("Formula", formulaSchema);

export { Formula };
