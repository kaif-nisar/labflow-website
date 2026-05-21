import fs from "fs";
import multer from "multer";
import path from "path";
import { resolveRuntimePath } from "../src/utils/runtimePaths.js";

const tempDir = resolveRuntimePath("temp");

if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

const sanitizeName = (value, fallback = "file") => {
    const sanitized = String(value || "")
        .normalize("NFKD")
        .replace(/[^\w.-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    return sanitized || fallback;
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname || "");
        const baseName = path.basename(file.originalname || "upload", extension);
        const safeBaseName = sanitizeName(baseName, "upload");
        const safeExtension = extension ? `.${sanitizeName(extension.slice(1), "bin")}` : "";
        cb(null, `${Date.now()}-${safeBaseName}${safeExtension}`);
    },
});

const fileFilter = (req, file, cb) => {
    cb(null, true);
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024,
    },
});
