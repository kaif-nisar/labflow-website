import mongoose, { Schema } from "mongoose";

const barcodeSequenceSchema = new Schema(
    {
        tenantId: {
            type: Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            unique: true,
            index: true,
        },
        seq: {
            type: Number,
            default: 100000,
        },
    },
    { timestamps: true }
);

const barcodeCalibrationSchema = new Schema(
    {
        topOffsetMm: { type: Number, default: 0, min: -15, max: 15 },
        leftOffsetMm: { type: Number, default: 0, min: -15, max: 15 },
        barWidth: { type: Number, default: 1.5, min: 1, max: 3 },
        barcodeHeightMm: { type: Number, default: 10.5, min: 6, max: 25 },
        fontScale: { type: Number, default: 1, min: 0.75, max: 1.35 },
    },
    { _id: false }
);

const barcodeSettingsSchema = new Schema(
    {
        tenantId: {
            type: Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            unique: true,
            index: true,
        },
        prefix: {
            type: String,
            default: "",
            trim: true,
            uppercase: true,
            maxlength: 6,
        },
        minDigits: {
            type: Number,
            default: 7,
            min: 5,
            max: 12,
        },
        customHeaderName: {
            type: String,
            default: "",
            trim: true,
            maxlength: 48,
        },
        defaultPaperPreset: {
            type: String,
            default: "a4_full_65",
            trim: true,
        },
        defaultCopies: {
            type: Number,
            default: 1,
            min: 1,
            max: 10,
        },
        showLabName: { type: Boolean, default: true },
        showPatientName: { type: Boolean, default: true },
        showAgeGender: { type: Boolean, default: true },
        showSampleType: { type: Boolean, default: true },
        showVacutainerGuide: { type: Boolean, default: true },
        showTests: { type: Boolean, default: true },
        showDateTime: { type: Boolean, default: true },
        showBookingId: { type: Boolean, default: false },
        autoPromptAfterBooking: { type: Boolean, default: false },
        restrictCenterOwnership: { type: Boolean, default: false },
        includeMasterBagLabel: { type: Boolean, default: false },
        calibration: {
            type: barcodeCalibrationSchema,
            default: () => ({}),
        },
    },
    { timestamps: true }
);

const barcodeBatchSchema = new Schema(
    {
        tenantId: {
            type: Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true,
        },
        batchCode: {
            type: String,
            required: true,
            trim: true,
        },
        batchType: {
            type: String,
            enum: ["preprinted", "auto_booking"],
            default: "preprinted",
        },
        prefix: {
            type: String,
            default: "",
            trim: true,
        },
        startBarcode: {
            type: String,
            required: true,
            trim: true,
        },
        endBarcode: {
            type: String,
            required: true,
            trim: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
            max: 1000,
        },
        copiesPerBarcode: {
            type: Number,
            default: 1,
            min: 1,
            max: 10,
        },
        paperPreset: {
            type: String,
            default: "thermal_50x25_1up",
            trim: true,
        },
        sampleHint: {
            type: String,
            default: "",
            trim: true,
            maxlength: 40,
        },
        assignedToUser: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        assignedToName: {
            type: String,
            default: "",
            trim: true,
        },
        assignedToRole: {
            type: String,
            default: "",
            trim: true,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        createdByName: {
            type: String,
            default: "",
            trim: true,
        },
        notes: {
            type: String,
            default: "",
            trim: true,
            maxlength: 240,
        },
        reprintCount: {
            type: Number,
            default: 0,
        },
        lastPrintedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

barcodeBatchSchema.index({ tenantId: 1, createdAt: -1 });
barcodeBatchSchema.index({ tenantId: 1, assignedToUser: 1, createdAt: -1 });
barcodeBatchSchema.index({ tenantId: 1, batchCode: 1 });

const prePrintedBarcodeSchema = new Schema(
    {
        tenantId: {
            type: Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
        },
        barcode: {
            type: String,
            required: true,
            trim: true,
        },
        sequenceNumber: {
            type: Number,
            default: null,
        },
        source: {
            type: String,
            enum: ["preprinted", "auto_booking"],
            default: "preprinted",
        },
        batchId: {
            type: Schema.Types.ObjectId,
            ref: "BarcodeBatch",
            default: null,
            index: true,
        },
        batchCode: {
            type: String,
            default: "",
            trim: true,
        },
        assignedToUser: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        assignedToName: {
            type: String,
            default: "",
            trim: true,
        },
        sampleHint: {
            type: String,
            default: "",
            trim: true,
        },
        status: {
            type: String,
            enum: ["unused", "used", "void"],
            default: "unused",
        },
        usedInBookingId: {
            type: String,
            default: "",
            trim: true,
        },
        usedInBookingRef: {
            type: Schema.Types.ObjectId,
            ref: "testBooking",
            default: null,
        },
        patientName: {
            type: String,
            default: "",
            trim: true,
        },
        patientAgeGender: {
            type: String,
            default: "",
            trim: true,
        },
        sampleType: {
            type: String,
            default: "",
            trim: true,
        },
        testSummary: {
            type: String,
            default: "",
            trim: true,
        },
        usedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        usedByName: {
            type: String,
            default: "",
            trim: true,
        },
        usedAt: {
            type: Date,
            default: null,
        },
        voidReason: {
            type: String,
            default: "",
            trim: true,
            maxlength: 160,
        },
        voidedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        voidedAt: {
            type: Date,
            default: null,
        },
        reprintCount: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

prePrintedBarcodeSchema.index({ tenantId: 1, barcode: 1 }, { unique: true });
prePrintedBarcodeSchema.index({ tenantId: 1, status: 1, source: 1, createdAt: 1 });
prePrintedBarcodeSchema.index({ tenantId: 1, assignedToUser: 1, status: 1, createdAt: 1 });
prePrintedBarcodeSchema.index({ tenantId: 1, usedInBookingId: 1 });

const BarcodeSequence = mongoose.model("BarcodeSequence", barcodeSequenceSchema);
const BarcodeSettings = mongoose.model("BarcodeSettings", barcodeSettingsSchema);
const BarcodeBatch = mongoose.model("BarcodeBatch", barcodeBatchSchema);
const PrePrintedBarcode = mongoose.model("PrePrintedBarcode", prePrintedBarcodeSchema);

export {
    BarcodeSequence,
    BarcodeSettings,
    BarcodeBatch,
    PrePrintedBarcode,
};

