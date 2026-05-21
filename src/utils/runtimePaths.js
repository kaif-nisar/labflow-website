import fs from "fs";
import path from "path";

const sourceRoot = path.resolve(process.cwd());

export const DEFAULT_UPLOAD_SUBDIRECTORIES = [
    "profiles",
    "signatures",
    "logos",
    "reports",
    "documents",
];

export const getSourceRoot = () => {
    return sourceRoot;
};

const resolveConfiguredPath = (value) => {
    const trimmedValue = String(value || "").trim();
    return trimmedValue ? path.resolve(trimmedValue) : "";
};

export const getRuntimeRoot = () => {
    const configuredRoot = resolveConfiguredPath(
        process.env.LABFLOW_RUNTIME_ROOT || process.env.LABFLOW_ROOT_DIR
    );

    if (configuredRoot) {
        return configuredRoot;
    }

    if (process.pkg) {
        return path.dirname(process.execPath);
    }

    return path.resolve(process.cwd() || sourceRoot);
};

export const getBundleRoot = () => {
    const configuredBundleRoot = resolveConfiguredPath(process.env.LABFLOW_BUNDLE_DIR);
    if (configuredBundleRoot) {
        return configuredBundleRoot;
    }

    const configuredRuntimeRoot = resolveConfiguredPath(
        process.env.LABFLOW_RUNTIME_ROOT || process.env.LABFLOW_ROOT_DIR
    );

    if (configuredRuntimeRoot) {
        return configuredRuntimeRoot;
    }

    if (process.pkg) {
        return path.dirname(process.execPath);
    }

    return path.resolve(process.cwd() || sourceRoot);
};

export const resolveRuntimePath = (...segments) => {
    return path.join(getRuntimeRoot(), ...segments);
};

export const resolveBundlePath = (...segments) => {
    return path.join(getBundleRoot(), ...segments);
};

export const resolveSourcePath = (...segments) => {
    return path.join(sourceRoot, ...segments);
};

export const resolveReadablePath = (...segments) => {
    const candidatePaths = [
        resolveRuntimePath(...segments),
        resolveBundlePath(...segments),
        resolveSourcePath(...segments),
    ];

    for (const candidatePath of candidatePaths) {
        if (fs.existsSync(candidatePath)) {
            return candidatePath;
        }
    }

    return candidatePaths[candidatePaths.length - 1];
};

export const ensureDirectorySync = (targetPath) => {
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }
};

export const getMongoBinaryPath = () => {
    return resolveBundlePath("mongodb", "bin", "mongod.exe");
};

export const getMongoDataPath = () => {
    return resolveRuntimePath("data", "db");
};

export const getLogsPath = () => {
    return resolveRuntimePath("logs");
};

export const getTempPath = () => {
    return resolveRuntimePath("temp");
};

export const getUploadsPath = () => {
    return resolveRuntimePath("uploads");
};

export const ensureAppDirectoriesSync = () => {
    ensureDirectorySync(getMongoDataPath());
    ensureDirectorySync(getLogsPath());
    ensureDirectorySync(getTempPath());
    ensureDirectorySync(getUploadsPath());

    for (const directoryName of DEFAULT_UPLOAD_SUBDIRECTORIES) {
        ensureDirectorySync(path.join(getUploadsPath(), directoryName));
    }
};
