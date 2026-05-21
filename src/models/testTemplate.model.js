import mongoose, { Schema } from "mongoose";

const TemplateArraySchema = new Schema({
    templateName: String,
    content: String,
})
const testTemplateSchema = new Schema({
    testId: {
        type: mongoose.Types.ObjectId,
    },
    templates: [TemplateArraySchema],
    tenantId: {
        type: mongoose.Types.ObjectId,
        ref: "Tenant",
    },
    createdBy: {
        type: mongoose.Types.ObjectId,
        ref: "User",
    },
})

const testTemplate = mongoose.model("test-template", testTemplateSchema);

export { testTemplate };