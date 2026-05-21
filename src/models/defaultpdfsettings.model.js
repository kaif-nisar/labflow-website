import mongoose from "mongoose";

const customizationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant", // Tenant collection reference
      required: true,
    },
    headermargin: {
      type: String,
      default: "2.8",
    },
    footermargin: {
      type: String,
      default: "1",
    },
    marginRight: {
      type: String,
      default: "0",
    },
    marginLeft: {
      type: String,
      default: "0",
    },
    LeftsignPd: {
      type: String,
      default: "0",
    },
    Rightsignpd: {
      type: String,
      default: "",
    },
    investigationmargin: {
      type: Number,
      default: 40,
    },
    showInvest: {
      type: Boolean,
      default: true,
    },
    BoldRow: {
      type: Boolean,
      default: true,
    },
    HLinred: {
      type: Boolean,
      default: false,
    },
    HighLow: {
      type: Boolean,
      default: true,
    },
    RowSpacing: {
      type: Number,
      default: 7,
    },
    selectedFontSize: {
      type: Number,
      default: 12,
    },
    selectedFontFamily: {
      type: String,
      default: "Arial",
    },
    hideCategories: {
      type: Boolean,
      default: false,
    },
    hideTableHeadings: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

customizationSchema.index({ tenantId: 1 });
customizationSchema.index({ tenantId: 1, createdBy: 1 });

const defaultpdfsetting = mongoose.model("defaultSettings", customizationSchema);

export {defaultpdfsetting}
