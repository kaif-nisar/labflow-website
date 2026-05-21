import {
    storeLocalFile,
    deleteLocalFile,
    doesLocalFileExist,
    normalizeStoredUploadUrl,
    normalizeStoredUploadPublicId,
} from "../utils/localStorage.js";
import { doctorsign } from "../models/labinchargesign.model.js";

const SIGNATURE_FIELD_MAP = Object.freeze({
    labinchargesignpublicid: "labinchargesign",
    firstdoctorsignpublicid: "firstdoctorsign",
    seconddoctorsignpublicid: "seconddoctorsign",
});

const normalizeSignatureAsset = async (urlValue, publicIdValue) => {
    const normalizedUrl =
        normalizeStoredUploadUrl(urlValue) ||
        normalizeStoredUploadUrl(publicIdValue);
    const normalizedPublicId =
        normalizeStoredUploadPublicId(publicIdValue) ||
        normalizeStoredUploadPublicId(urlValue);
    const fileExists = await doesLocalFileExist(normalizedPublicId || normalizedUrl);

    if (!normalizedUrl || !fileExists) {
        return {
            url: "",
            publicId: "",
            isValid: false,
        };
    }

    return {
        url: normalizedUrl,
        publicId: normalizedPublicId,
        isValid: true,
    };
};

const resolveExistingSignatureAsset = (record, publicIdFieldName) => {
    const urlFieldName = SIGNATURE_FIELD_MAP[publicIdFieldName];
    if (!record || !urlFieldName) {
        return "";
    }

    return (
        normalizeStoredUploadPublicId(record?.[publicIdFieldName]) ||
        record?.[urlFieldName] ||
        ""
    );
};

const uploadDoctorsSign = async (req, res) => {
    const {
        showlab,
        showdoctorfirst,
        showdoctorsecond,
        labinchargeinfo,
        leftdoctorinfo,
        rightdoctorinfo,
    } = req.body;
    const files = req.files || {};
    const { labsign, firstdoctorsign, seconddoctorsign } = files;
    const userId = req.user._id;
    const tenantId = req.user.tenantId;

    try {
        const existingRecord = await doctorsign.findOne({
            tenantId: tenantId._id,
            createdBy: userId,
        });

        const labsignresult = labsign
            ? await storeLocalFile(labsign?.[0]?.path, {
                category: "signatures",
                fileName: labsign?.[0]?.originalname,
            })
            : null;
        const firstdoctorsignresult = firstdoctorsign
            ? await storeLocalFile(firstdoctorsign?.[0]?.path, {
                category: "signatures",
                fileName: firstdoctorsign?.[0]?.originalname,
            })
            : null;
        const seconddoctorsignresult = seconddoctorsign
            ? await storeLocalFile(seconddoctorsign?.[0]?.path, {
                category: "signatures",
                fileName: seconddoctorsign?.[0]?.originalname,
            })
            : null;

        const updatedata = {
            tenantId: tenantId._id,
            createdBy: userId,
            showlabinchargesign: showlab,
            labinchargeinfo,
            showfirstdoctorsign: showdoctorfirst,
            firstdoctorsigninfo: leftdoctorinfo,
            showseconddoctorsign: showdoctorsecond,
            seconddoctorsigninfo: rightdoctorinfo,
        };

        if (labsignresult) {
            updatedata.labinchargesign = labsignresult.secure_url;
            updatedata.labinchargesignpublicid = labsignresult.public_id;
        }

        if (firstdoctorsignresult) {
            updatedata.firstdoctorsign = firstdoctorsignresult.secure_url;
            updatedata.firstdoctorsignpublicid = firstdoctorsignresult.public_id;
        }

        if (seconddoctorsignresult) {
            updatedata.seconddoctorsign = seconddoctorsignresult.secure_url;
            updatedata.seconddoctorsignpublicid = seconddoctorsignresult.public_id;
        }

        const templateData = await doctorsign.findOneAndUpdate(
            {
                tenantId: tenantId._id,
                createdBy: userId,
            },
            {
                $set: updatedata,
            },
            {
                returnDocument: "after",
                upsert: true,
            }
        );

        if (!templateData) {
            return res.status(500).json({ message: "Failed to save in database" });
        }

        const staleAssets = [
            labsignresult
                ? resolveExistingSignatureAsset(existingRecord, "labinchargesignpublicid")
                : "",
            firstdoctorsignresult
                ? resolveExistingSignatureAsset(existingRecord, "firstdoctorsignpublicid")
                : "",
            seconddoctorsignresult
                ? resolveExistingSignatureAsset(existingRecord, "seconddoctorsignpublicid")
                : "",
        ];

        await Promise.all(
            staleAssets
                .filter(Boolean)
                .map(async (assetId) => {
                    try {
                        await deleteLocalFile(assetId);
                    } catch (cleanupError) {
                        console.warn("Failed to delete old signature asset:", cleanupError?.message || cleanupError);
                    }
                })
        );

        return res.status(201).json({
            message: "changed saved successfully",
            data: templateData,
        });
    } catch (error) {
        console.error("Error uploading image:", error.message);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            message: "Server error during file upload",
            error: error.message,
            details: process.env.NODE_ENV === "development" ? error.stack : undefined,
        });
    }
};

const getDoctorsSign = async (req, res) => {
    const tenantId = req.user.tenantId._id;

    try {
        const labsigndata = await doctorsign.findOne({
            tenantId,
        });

        if (!labsigndata) {
            return res.status(404).json({ message: "No doctor signature found" });
        }

        const labSignature = await normalizeSignatureAsset(
            labsigndata.labinchargesign,
            labsigndata.labinchargesignpublicid
        );
        const firstDoctorSignature = await normalizeSignatureAsset(
            labsigndata.firstdoctorsign,
            labsigndata.firstdoctorsignpublicid
        );
        const secondDoctorSignature = await normalizeSignatureAsset(
            labsigndata.seconddoctorsign,
            labsigndata.seconddoctorsignpublicid
        );

        const responsePayload = labsigndata.toObject();
        responsePayload.labinchargesign = labSignature.url;
        responsePayload.labinchargesignpublicid = labSignature.publicId;
        responsePayload.firstdoctorsign = firstDoctorSignature.url;
        responsePayload.firstdoctorsignpublicid = firstDoctorSignature.publicId;
        responsePayload.seconddoctorsign = secondDoctorSignature.url;
        responsePayload.seconddoctorsignpublicid = secondDoctorSignature.publicId;

        return res.status(200).json(responsePayload);
    } catch (error) {
        console.error("Error fetching doctor signature:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

const editdoctorsvisibility = async (req, res) => {
    try {
        const { showlab, showfirstdoctor, showseconddoctor } = req.body;
        const tenantId = req.user?.tenantId?._id;
        const userId = req.user?._id;

        if (
            typeof showlab !== "boolean" ||
            typeof showfirstdoctor !== "boolean" ||
            typeof showseconddoctor !== "boolean"
        ) {
            return res.status(400).json({ message: "Invalid input types. All fields must be boolean." });
        }

        if (!tenantId || !userId) {
            return res.status(401).json({ message: "Unauthorized or missing user info" });
        }

        const editeddoc = await doctorsign.findOneAndUpdate(
            { tenantId, createdBy: userId },
            {
                $set: {
                    showlabinchargesign: showlab,
                    showfirstdoctorsign: showfirstdoctor,
                    showseconddoctorsign: showseconddoctor,
                },
            },
            { returnDocument: "after" }
        );

        if (!editeddoc) {
            return res.status(404).json({ message: "Signature record not found or not updated." });
        }

        return res.status(200).json({ message: "Signature updated successfully" });
    } catch (error) {
        console.error("Error updating signature visibility:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const deleteLabInchargeSign = async (req, res) => {
    try {
        const { publicId, publicIdfield, urlfield } = req.body;
        const tenantId = req.user.tenantId._id;
        const userId = req.user._id;

        if (!SIGNATURE_FIELD_MAP[publicIdfield] || SIGNATURE_FIELD_MAP[publicIdfield] !== urlfield) {
            return res.status(400).json({ message: "Invalid signature fields" });
        }

        const existingRecord = await doctorsign.findOne({
            tenantId,
            createdBy: userId,
        });

        if (!existingRecord) {
            return res.status(404).json({ message: "Signature record not found" });
        }

        const assetIdentifier =
            normalizeStoredUploadPublicId(publicId) ||
            normalizeStoredUploadPublicId(existingRecord?.[publicIdfield]) ||
            existingRecord?.[urlfield] ||
            publicId;

        const deleteResponse = await deleteLocalFile(assetIdentifier);

        if (!deleteResponse || !["ok", "not found"].includes(deleteResponse.result)) {
            return res.status(500).json({ message: "Failed to delete stored signature" });
        }

        const templateData = await doctorsign.findOneAndUpdate(
            {
                tenantId,
                createdBy: userId,
            },
            {
                $set: {
                    [publicIdfield]: "",
                    [urlfield]: "",
                },
            },
            {
                returnDocument: "after",
                upsert: true,
            }
        );

        if (!templateData) {
            return res.status(500).json({ message: "Failed to delete image from database" });
        }

        return res.status(200).json({ message: "Image deleted successfully" });
    } catch (error) {
        console.error("Error deleting image:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

export {
    uploadDoctorsSign,
    getDoctorsSign,
    deleteLabInchargeSign,
    editdoctorsvisibility,
};
