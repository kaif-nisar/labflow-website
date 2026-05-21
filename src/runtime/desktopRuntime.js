import { configDotenv } from "dotenv";
import { Blob } from "buffer";
import { prepareBundledRuntimeDataSync } from "../utils/runtimeBootstrap.js";
import { ensureAppDirectoriesSync, resolveReadablePath } from "../utils/runtimePaths.js";

if (typeof globalThis.Blob === "undefined") {
    globalThis.Blob = Blob;
}

if (typeof globalThis.File === "undefined") {
    globalThis.File = class File extends Blob {
        constructor(parts, fileName, options = {}) {
            super(parts, options);
            this.name = String(fileName || "");
            this.lastModified = Number(options.lastModified || Date.now());
        }
    };
}

let activeRuntimePromise = null;
let activeRuntimeState = null;

const applyRuntimeDefaults = () => {
    if (!String(process.env.LABFLOW_RUNTIME || "").trim()) {
        process.env.LABFLOW_RUNTIME = "desktop";
    }

    if (!String(process.env.OFFLINE_MODE || "").trim()) {
        process.env.OFFLINE_MODE = "true";
    }
};

export const startDesktopRuntime = async () => {
    if (activeRuntimeState) {
        return activeRuntimeState;
    }

    if (activeRuntimePromise) {
        return activeRuntimePromise;
    }

    activeRuntimePromise = (async () => {
        configDotenv({ path: resolveReadablePath(".env") });
        applyRuntimeDefaults();
        ensureAppDirectoriesSync();

        const bootstrapState = prepareBundledRuntimeDataSync();
        const {
            ensureLocalMongoReady,
            attachMongoShutdownHandler,
            restoreDatabaseBackupIfNeeded,
        } = await import("../utils/localMongoRuntime.js");

        const mongoState = await ensureLocalMongoReady();
        attachMongoShutdownHandler(mongoState);
        await restoreDatabaseBackupIfNeeded(mongoState);

        const appModule = await import("../../app.js");
        if (typeof appModule.startApplication !== "function") {
            throw new Error("The application entry does not export startApplication().");
        }

        const appState = await appModule.startApplication();
        activeRuntimeState = {
            ...appState,
            bootstrapState,
            mongoState,
        };

        console.log("LabFlow offline desktop runtime is ready.");
        return activeRuntimeState;
    })().catch((error) => {
        activeRuntimePromise = null;
        activeRuntimeState = null;
        throw error;
    });

    return activeRuntimePromise;
};

export const stopDesktopRuntime = async () => {
    const runtimeState = activeRuntimeState;
    const startupPromise = activeRuntimePromise;

    if (!runtimeState && !startupPromise) {
        return;
    }

    let resolvedRuntimeState = runtimeState;
    if (!resolvedRuntimeState && startupPromise) {
        try {
            resolvedRuntimeState = await startupPromise;
        } catch {
            activeRuntimePromise = null;
            activeRuntimeState = null;
            return;
        }
    }

    try {
        const appModule = await import("../../app.js");
        if (typeof appModule.stopApplication === "function") {
            await appModule.stopApplication();
        }
    } finally {
        const mongoChild = resolvedRuntimeState?.mongoState?.child;
        if (
            resolvedRuntimeState?.mongoState?.startedByApp &&
            mongoChild &&
            mongoChild.exitCode === null &&
            !mongoChild.killed
        ) {
            try {
                mongoChild.kill();
            } catch (error) {
                console.error("Failed to stop bundled MongoDB cleanly:", error?.message || error);
            }
        }

        activeRuntimePromise = null;
        activeRuntimeState = null;
    }
};
