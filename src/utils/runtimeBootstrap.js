import fs from "fs";
import path from "path";
import {
    ensureAppDirectoriesSync,
    getBundleRoot,
    getRuntimeRoot,
    resolveBundlePath,
    resolveRuntimePath,
} from "./runtimePaths.js";

const hasFilesRecursivelySync = (targetPath) => {
    if (!fs.existsSync(targetPath)) {
        return false;
    }

    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
        const entryPath = path.join(targetPath, entry.name);

        if (entry.isFile()) {
            return true;
        }

        if (entry.isDirectory() && hasFilesRecursivelySync(entryPath)) {
            return true;
        }
    }

    return false;
};

const copyDirectoryContentsSync = (sourcePath, destinationPath) => {
    fs.mkdirSync(destinationPath, { recursive: true });

    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
        const sourceEntryPath = path.join(sourcePath, entry.name);
        const destinationEntryPath = path.join(destinationPath, entry.name);

        if (entry.isDirectory()) {
            copyDirectoryContentsSync(sourceEntryPath, destinationEntryPath);
            continue;
        }

        fs.copyFileSync(sourceEntryPath, destinationEntryPath);
    }
};

export const prepareBundledRuntimeDataSync = () => {
    ensureAppDirectoriesSync();

    const runtimeRoot = getRuntimeRoot();
    const bundleRoot = getBundleRoot();
    const normalizedRuntimeRoot = path.resolve(runtimeRoot);
    const normalizedBundleRoot = path.resolve(bundleRoot);

    if (normalizedRuntimeRoot === normalizedBundleRoot) {
        return {
            runtimeRoot,
            bundleRoot,
            copiedEntries: [],
            mode: "self-contained",
        };
    }

    const copiedEntries = [];

    const bundledEnvPath = resolveBundlePath(".env");
    const runtimeEnvPath = resolveRuntimePath(".env");
    if (fs.existsSync(bundledEnvPath) && !fs.existsSync(runtimeEnvPath)) {
        fs.mkdirSync(path.dirname(runtimeEnvPath), { recursive: true });
        fs.copyFileSync(bundledEnvPath, runtimeEnvPath);
        copiedEntries.push(".env");
    }

    const bundledUploadsPath = resolveBundlePath("uploads");
    const runtimeUploadsPath = resolveRuntimePath("uploads");
    if (hasFilesRecursivelySync(bundledUploadsPath) && !hasFilesRecursivelySync(runtimeUploadsPath)) {
        copyDirectoryContentsSync(bundledUploadsPath, runtimeUploadsPath);
        copiedEntries.push("uploads");
    }

    return {
        runtimeRoot,
        bundleRoot,
        copiedEntries,
        mode: "split-runtime",
    };
};
