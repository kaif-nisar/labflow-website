import crypto from "crypto";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { v2 as cloudinary } from "cloudinary";
import {
    DEFAULT_UPLOAD_SUBDIRECTORIES,
    resolveRuntimePath,
} from "./runtimePaths.js";

export const UPLOAD_ROOT = resolveRuntimePath("uploads");
export const UPLOAD_SUBDIRECTORIES = [...DEFAULT_UPLOAD_SUBDIRECTORIES];

const isWithinDirectory = (targetPath, directoryPath) => {
    const relativePath = path.relative(directoryPath, targetPath);
    return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
};

const sanitizeSegment = (value, fallback = "file") => {
    const sanitized = String(value || "")
        .normalize("NFKD")
        .replace(/[^\w.-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    return sanitized || fallback;
};

const CLOUDINARY_CONFIG = Object.freeze({
    cloud_name: String(process.env.CLOUDINARY_NAME || "").trim(),
    api_key: String(process.env.CLOUD_API_KEY || process.env.CLOUDINARY_API_KEY || "").trim(),
    api_secret: String(process.env.CLOUD_API_SECRET || process.env.CLOUDINARY_API_SECRET || "").trim(),
});

const CLOUDINARY_ENABLED = Boolean(
    CLOUDINARY_CONFIG.cloud_name
    && CLOUDINARY_CONFIG.api_key
    && CLOUDINARY_CONFIG.api_secret
);

const CLOUDINARY_ROOT_FOLDER = sanitizeSegment(
    process.env.CLOUDINARY_ROOT_FOLDER || "labflow",
    "labflow"
);

if (CLOUDINARY_ENABLED) {
    cloudinary.config({
        cloud_name: CLOUDINARY_CONFIG.cloud_name,
        api_key: CLOUDINARY_CONFIG.api_key,
        api_secret: CLOUDINARY_CONFIG.api_secret,
        secure: true,
    });
}

const normalizeCategory = (category = "documents") => {
    return UPLOAD_SUBDIRECTORIES.includes(category) ? category : "documents";
};

const buildStoredFileMetadata = (category, fileName) => {
    const publicId = `${category}/${fileName}`;
    const publicUrl = `/uploads/${category}/${fileName}`;

    return {
        url: publicUrl,
        secure_url: publicUrl,
        public_id: publicId,
        path: path.join(UPLOAD_ROOT, category, fileName),
    };
};

const moveFile = async (sourcePath, destinationPath) => {
    try {
        await fsPromises.rename(sourcePath, destinationPath);
    } catch (error) {
        if (error?.code !== "EXDEV") {
            throw error;
        }

        await fsPromises.copyFile(sourcePath, destinationPath);
        await fsPromises.unlink(sourcePath);
    }
};

const unlinkIfExists = async (filePath) => {
    if (!filePath) return;

    try {
        await fsPromises.unlink(filePath);
    } catch (error) {
        if (error?.code !== "ENOENT") {
            throw error;
        }
    }
};

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());

const isCloudinaryPublicId = (value) => {
    const normalizedValue = String(value || "").trim().replace(/\\/g, "/");
    return Boolean(normalizedValue && normalizedValue.startsWith(`${CLOUDINARY_ROOT_FOLDER}/`));
};

const stripCloudinaryFileExtension = (value) => String(value || "").replace(/\.[a-z0-9]{1,8}$/i, "");

const inferCloudinaryResourceType = (value) => {
    const normalizedValue = String(value || "").trim();

    if (isHttpUrl(normalizedValue)) {
        if (normalizedValue.includes("/image/upload/")) return "image";
        if (normalizedValue.includes("/video/upload/")) return "video";
        if (normalizedValue.includes("/raw/upload/")) return "raw";
    }

    const extension = path.extname(normalizedValue).toLowerCase();
    const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".tif", ".tiff"]);
    const videoExtensions = new Set([".mp4", ".mov", ".avi", ".webm", ".mkv", ".m4v"]);

    if (imageExtensions.has(extension)) return "image";
    if (videoExtensions.has(extension)) return "video";
    return "raw";
};

const buildCloudinaryUrl = (publicId, resourceType = inferCloudinaryResourceType(publicId)) => {
    if (!CLOUDINARY_ENABLED || !publicId) {
        return "";
    }

    return cloudinary.url(publicId, {
        secure: true,
        resource_type: resourceType,
        type: "upload",
    });
};

export const ensureUploadDirectoriesSync = () => {
    if (!fs.existsSync(UPLOAD_ROOT)) {
        fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
    }

    for (const directoryName of UPLOAD_SUBDIRECTORIES) {
        const directoryPath = path.join(UPLOAD_ROOT, directoryName);
        if (!fs.existsSync(directoryPath)) {
            fs.mkdirSync(directoryPath, { recursive: true });
        }
    }
};

export const ensureUploadDirectories = async () => {
    await fsPromises.mkdir(UPLOAD_ROOT, { recursive: true });

    await Promise.all(
        UPLOAD_SUBDIRECTORIES.map((directoryName) =>
            fsPromises.mkdir(path.join(UPLOAD_ROOT, directoryName), { recursive: true })
        )
    );
};

const resolveStoredFilePath = (identifier) => {
    if (!identifier) {
        return null;
    }

    let normalizedIdentifier = String(identifier).trim();

    if (!normalizedIdentifier) {
        return null;
    }

    if (/^https?:\/\//i.test(normalizedIdentifier)) {
        try {
            const parsedUrl = new URL(normalizedIdentifier);
            normalizedIdentifier = parsedUrl.pathname;
        } catch (error) {
            return null;
        }
    }

    if (normalizedIdentifier.startsWith("/uploads/")) {
        normalizedIdentifier = normalizedIdentifier.slice("/uploads/".length);
    } else if (normalizedIdentifier.startsWith("uploads/")) {
        normalizedIdentifier = normalizedIdentifier.slice("uploads/".length);
    }

    if (path.isAbsolute(normalizedIdentifier)) {
        const absolutePath = path.normalize(normalizedIdentifier);
        return isWithinDirectory(absolutePath, UPLOAD_ROOT) ? absolutePath : null;
    }

    const candidatePath = path.normalize(path.join(UPLOAD_ROOT, normalizedIdentifier.replace(/\\/g, "/")));
    return isWithinDirectory(candidatePath, UPLOAD_ROOT) ? candidatePath : null;
};

export const resolveLocalStoredFilePath = (identifier) => {
    return resolveStoredFilePath(identifier);
};

export const normalizeStoredUploadPublicId = (identifier) => {
    if (!identifier) {
        return "";
    }

    let normalizedIdentifier = String(identifier).trim().replace(/\\/g, "/");
    if (!normalizedIdentifier) {
        return "";
    }

    if (isHttpUrl(normalizedIdentifier)) {
        try {
            const parsedUrl = new URL(normalizedIdentifier);
            const match = parsedUrl.pathname.match(/\/(?:image|video|raw)\/upload\/(?:v\d+\/)?(.+)$/i);
            if (!match?.[1]) {
                return "";
            }

            return stripCloudinaryFileExtension(match[1]);
        } catch {
            return "";
        }
    }

    if (normalizedIdentifier.startsWith("/uploads/")) {
        normalizedIdentifier = normalizedIdentifier.slice("/uploads/".length);
    } else if (normalizedIdentifier.startsWith("uploads/")) {
        normalizedIdentifier = normalizedIdentifier.slice("uploads/".length);
    }

    if (path.isAbsolute(normalizedIdentifier)) {
        const resolvedPath = resolveStoredFilePath(normalizedIdentifier);
        if (!resolvedPath) {
            return "";
        }

        return path.relative(UPLOAD_ROOT, resolvedPath).replace(/\\/g, "/");
    }

    if (isCloudinaryPublicId(normalizedIdentifier)) {
        return stripCloudinaryFileExtension(normalizedIdentifier);
    }

    return normalizedIdentifier;
};

export const normalizeStoredUploadUrl = (identifier) => {
    if (!identifier) {
        return "";
    }

    const rawValue = String(identifier).trim();
    if (!rawValue) {
        return "";
    }

    if (rawValue.startsWith("data:") || isHttpUrl(rawValue)) {
        return rawValue;
    }

    if (isCloudinaryPublicId(rawValue)) {
        return buildCloudinaryUrl(normalizeStoredUploadPublicId(rawValue));
    }

    const resolvedPath = resolveStoredFilePath(identifier);
    if (!resolvedPath) {
        return "";
    }

    const relativePath = path.relative(UPLOAD_ROOT, resolvedPath).replace(/\\/g, "/");
    if (!relativePath || relativePath.startsWith("..")) {
        return "";
    }

    return `/uploads/${relativePath}`;
};

export const doesLocalFileExist = async (identifier) => {
    if (!identifier) {
        return false;
    }

    const rawValue = String(identifier).trim();
    if (!rawValue) {
        return false;
    }

    if (rawValue.startsWith("data:") || isHttpUrl(rawValue) || isCloudinaryPublicId(rawValue)) {
        return true;
    }

    const filePath = resolveStoredFilePath(identifier);
    if (!filePath) {
        return false;
    }

    try {
        await fsPromises.access(filePath);
        return true;
    } catch {
        return false;
    }
};

export const storeLocalFile = async (localFilePath, options = {}) => {
    if (!localFilePath) {
        throw new Error("Local file path is required for storage.");
    }

    const sourcePath = path.resolve(localFilePath);
    const category = normalizeCategory(options.category);
    const parsedName = path.parse(options.fileName || path.basename(sourcePath));
    const safeBaseName = sanitizeSegment(parsedName.name, "upload");
    const safeExtension = parsedName.ext
        ? `.${sanitizeSegment(parsedName.ext.slice(1), "bin")}`
        : path.extname(sourcePath);
    const generatedBaseName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeBaseName}`;

    if (CLOUDINARY_ENABLED) {
        try {
            const uploadResult = await cloudinary.uploader.upload(sourcePath, {
                folder: `${CLOUDINARY_ROOT_FOLDER}/${category}`,
                public_id: generatedBaseName,
                resource_type: "auto",
                use_filename: false,
                unique_filename: false,
                overwrite: false,
                invalidate: true,
            });

            return {
                url: uploadResult.secure_url,
                secure_url: uploadResult.secure_url,
                public_id: uploadResult.public_id,
                path: uploadResult.secure_url,
                resource_type: uploadResult.resource_type,
                format: uploadResult.format,
            };
        } finally {
            await unlinkIfExists(sourcePath);
        }
    }

    await ensureUploadDirectories();

    const finalFileName = `${generatedBaseName}${safeExtension}`;
    const destinationPath = path.join(UPLOAD_ROOT, category, finalFileName);

    await moveFile(sourcePath, destinationPath);

    return buildStoredFileMetadata(category, finalFileName);
};

export const deleteLocalFile = async (identifier) => {
    const normalizedPublicId = normalizeStoredUploadPublicId(identifier);

    if (CLOUDINARY_ENABLED && isCloudinaryPublicId(normalizedPublicId)) {
        const preferredResourceType = inferCloudinaryResourceType(identifier || normalizedPublicId);
        const resourceTypes = [preferredResourceType, "image", "raw", "video"]
            .filter((value, index, array) => value && array.indexOf(value) === index);

        for (const resourceType of resourceTypes) {
            const result = await cloudinary.uploader.destroy(normalizedPublicId, {
                resource_type: resourceType,
                invalidate: true,
            });

            if (result?.result === "ok" || result?.result === "not found") {
                return result;
            }
        }
    }

    const filePath = resolveStoredFilePath(identifier);

    if (!filePath) {
        return { result: "not found" };
    }

    try {
        await fsPromises.unlink(filePath);
        return { result: "ok" };
    } catch (error) {
        if (error?.code === "ENOENT") {
            return { result: "not found" };
        }

        throw error;
    }
};

ensureUploadDirectoriesSync();
