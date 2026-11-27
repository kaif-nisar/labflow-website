import fsPromises from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { User } from "../models/user.model.js";
import { Template } from "../models/template.model.js";
import {
    storeLocalFile,
    deleteLocalFile,
    doesLocalFileExist,
    normalizeStoredUploadUrl,
    normalizeStoredUploadPublicId,
} from "../utils/localStorage.js";

const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"]);
const ALLOWED_PDF_EXTENSIONS = new Set([".pdf"]);

const cleanupTempUpload = async (filePath) => {
    if (!filePath) return;
    await fsPromises.unlink(filePath).catch(() => {});
};

const validateUploadedTemplateFile = async (uploadedFile) => {
    const ext = path.extname(String(uploadedFile?.originalname || uploadedFile?.path || "")).toLowerCase();
    const mime = String(uploadedFile?.mimetype || "").toLowerCase();
    const isPdf = ALLOWED_PDF_EXTENSIONS.has(ext) || mime === "application/pdf" || mime === "application/x-pdf";
    const isImage = ALLOWED_IMAGE_EXTENSIONS.has(ext) || mime.startsWith("image/");

    if (!isPdf && !isImage) {
        return { valid: false, status: 400, message: "Unsupported template format. Please upload PNG, JPG, WEBP, or PDF." };
    }

    if (!uploadedFile?.size || uploadedFile.size <= 0) {
        return { valid: false, status: 400, message: "Uploaded template file is empty." };
    }

    if (isPdf) {
        const buffer = await fsPromises.readFile(uploadedFile.path);
        const header = buffer.subarray(0, Math.min(buffer.length, 64)).toString("latin1").replace(/^[\s\0\xef\xbb\xbf]+/, "");
        if (!header.startsWith("%PDF-")) {
            return { valid: false, status: 400, message: "Invalid PDF file. Please upload a valid PDF document." };
        }

        let pdfDoc;
        try {
            pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        } catch {
            return { valid: false, status: 400, message: "Unable to read this PDF file. Please upload an uncorrupted PDF." };
        }

        if (pdfDoc.isEncrypted) {
            return { valid: false, status: 400, message: "Password-protected PDFs are not supported. Please upload an unlocked PDF." };
        }

        if (pdfDoc.getPageCount() < 1) {
            return { valid: false, status: 400, message: "Uploaded PDF template contains no pages." };
        }
    }

    return { valid: true, isPdf };
};

const normalizeTemplatePublicId = (value) => {
    return normalizeStoredUploadPublicId(value);
};

const normalizeTemplateRecord = async (templateDoc) => {
    const normalizedTemplateUrl =
        normalizeStoredUploadUrl(templateDoc.template) ||
        normalizeStoredUploadUrl(templateDoc.public_id);
    const normalizedPublicId =
        normalizeTemplatePublicId(templateDoc.public_id) ||
        normalizeTemplatePublicId(templateDoc.template);
    const fileExists = await doesLocalFileExist(normalizedPublicId || normalizedTemplateUrl);

    return {
        normalizedTemplateUrl,
        normalizedPublicId,
        fileExists,
    };
};

const uploadImage = async (req, res) => {
    const uploadedTemplate = req.files?.template?.[0];
    try {
        let userId;
        if (req.user.role === "staff") {
            userId = req.user.parentUser;
        } else {
            userId = req.user._id;
        }

        if (!req.files || !uploadedTemplate) {
            return res.status(400).json({ message: "Template file is required" });
        }

        const validation = await validateUploadedTemplateFile(uploadedTemplate);
        if (!validation.valid) {
            await cleanupTempUpload(uploadedTemplate.path);
            return res.status(validation.status || 400).json({ message: validation.message });
        }

        const result = await storeLocalFile(uploadedTemplate.path, {
            category: "reports",
            fileName: uploadedTemplate.originalname,
        });

        if (!result) {
            await cleanupTempUpload(uploadedTemplate.path);
            return res.status(500).json({ message: "Failed to store template" });
        }

        const newTemplate = new Template({
            tenantId: req.user.tenantId._id,
            createdBy: userId,
            template: result.secure_url,
            public_id: result.public_id,
        });
        await newTemplate.save();

        if (req.user.role === "staff") {
            await User.findByIdAndUpdate(req.user._id, {
                $push: {
                    activities: {
                        activityType: "other",
                        details: {
                            staffId: req.user._id,
                            staffName: req.user.fullName,
                            action: `${req.user.fullName} uploaded a new template.`,
                            template: newTemplate._id,
                        },
                        reference: {
                            model: "Template",
                            id: newTemplate._id,
                        },
                        timestamp: new Date(),
                    },
                },
            });
        }

        return res.status(201).json({
            message: "File uploaded successfully",
            url: result.secure_url,
            public_id: result.public_id,
            templateId: newTemplate._id,
            fileType: validation.isPdf ? "pdf" : "image",
        });
    } catch (error) {
        await cleanupTempUpload(uploadedTemplate?.path);
        console.error("Error uploading template:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

const getAllTemplates = async (req, res) => {
    try {
        const templates = await Template.find({
            tenantId: req.user.tenantId._id,
        }).sort({ _id: -1 });

        const validTemplates = [];
        const staleTemplateIds = [];

        for (const templateDoc of templates) {
            const {
                normalizedTemplateUrl,
                normalizedPublicId,
                fileExists,
            } = await normalizeTemplateRecord(templateDoc);

            if (!normalizedTemplateUrl || !fileExists) {
                staleTemplateIds.push(templateDoc._id);
                continue;
            }

            if (
                templateDoc.template !== normalizedTemplateUrl ||
                (normalizedPublicId && templateDoc.public_id !== normalizedPublicId)
            ) {
                templateDoc.template = normalizedTemplateUrl;
                templateDoc.public_id = normalizedPublicId;
                await templateDoc.save();
            }

            validTemplates.push(templateDoc);
        }

        if (staleTemplateIds.length > 0) {
            await Template.deleteMany({ _id: { $in: staleTemplateIds } });
        }

        if (validTemplates.length === 0) {
            return res.status(404).json({ message: "No templates found" });
        }

        return res.status(200).json({ urls: validTemplates });
    } catch (error) {
        console.error("Error fetching templates:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

const deleteImage = async (req, res) => {
    try {
        const { url, public_id, templateId } = req.body;

        if (!url && !public_id && !templateId) {
            return res.status(400).json({ message: "Image URL, template id, or file id is required" });
        }

        const tenantFilter = {
            tenantId: req.user.tenantId._id,
        };

        let deletedTemplate = null;

        if (templateId) {
            deletedTemplate = await Template.findOne({
                ...tenantFilter,
                _id: templateId,
            });
        } else {
            const normalizedUrl = normalizeStoredUploadUrl(url);
            const normalizedPublicId =
                normalizeTemplatePublicId(public_id) ||
                normalizeTemplatePublicId(url);
            const urlCandidates = [url, normalizedUrl].filter(Boolean);
            const publicIdCandidates = [public_id, normalizedPublicId].filter(Boolean);

            deletedTemplate = await Template.findOne({
                ...tenantFilter,
                $or: [
                    ...(urlCandidates.length > 0 ? [{ template: { $in: urlCandidates } }] : []),
                    ...(publicIdCandidates.length > 0 ? [{ public_id: { $in: publicIdCandidates } }] : []),
                ],
            });
        }

        if (!deletedTemplate) {
            return res.status(404).json({ message: "Image not found in database" });
        }

        const deleteResponse = await deleteLocalFile(
            deletedTemplate.public_id || public_id || deletedTemplate.template || url
        );

        if (!deleteResponse || !["ok", "not found"].includes(deleteResponse.result)) {
            return res.status(500).json({ message: "Failed to delete stored file" });
        }

        await Template.deleteOne({ _id: deletedTemplate._id });

        if (req.user.role === "staff") {
            await User.findByIdAndUpdate(req.user._id, {
                $push: {
                    activities: {
                        activityType: "other",
                        details: {
                            staffId: req.user._id,
                            staffName: req.user.fullName,
                            action: `${req.user.fullName} deleted a template.`,
                            template: deletedTemplate._id,
                        },
                        reference: {
                            model: "Template",
                            id: deletedTemplate._id,
                        },
                        timestamp: new Date(),
                    },
                },
            });
        }

        return res.status(200).json({ message: "Image deleted successfully" });
    } catch (error) {
        console.error("Error deleting image:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

export {
    uploadImage,
    getAllTemplates,
    deleteImage,
};
