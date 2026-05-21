import fs from "fs";
import path from "path";
import net from "net";
import { spawn } from "child_process";
import { MongoClient } from "mongodb";
import {
    ensureAppDirectoriesSync,
    getBundleRoot,
    getLogsPath,
    getMongoBinaryPath,
    getMongoDataPath,
    resolveReadablePath,
} from "./runtimePaths.js";

const LOCAL_MONGO_URI_PATTERN = /^mongodb:\/\/(127\.0\.0\.1|localhost)(?::(\d+))?\/([^?]+)/i;
const LEGACY_MONGO_SEED_PATH = path.join("data", "data", "db");
const PRIMARY_MONGO_SEED_PATH = path.join("data", "seed", "db");
const MONGO_DATA_FILE_PATTERNS = [/^collection-.*\.wt$/i, /^index-.*\.wt$/i];
const FALLBACK_LOCAL_MONGO_PORT = 27027;
const FALLBACK_LOCAL_MONGO_DB_NAME = "myfranchisee_super_admin";
const MONGO_STARTUP_TIMEOUT_MS = 90000;
const MONGO_HEALTHCHECK_TIMEOUT_MS = 2500;
const MONGO_PORT_CANDIDATE_COUNT = 8;
const MONGO_LOG_TAIL_BYTES = 8192;

const getDefaultLocalMongoPort = () => {
    const configuredPort = Number(String(process.env.LABFLOW_MONGO_PORT || "").trim());
    return Number.isInteger(configuredPort) && configuredPort > 0
        ? configuredPort
        : FALLBACK_LOCAL_MONGO_PORT;
};

const getDefaultLocalMongoDbName = () => {
    const configuredDbName = String(process.env.LABFLOW_MONGO_DB_NAME || "").trim();
    return configuredDbName || FALLBACK_LOCAL_MONGO_DB_NAME;
};

const buildLocalMongoUri = (config) => {
    return `mongodb://${config.host}:${config.port}/${config.dbName}`;
};

const syncLocalMongoEnvironment = (config) => {
    const mongoUri = buildLocalMongoUri(config);
    process.env.LABFLOW_MONGO_PORT = String(config.port);
    process.env.LABFLOW_MONGO_DB_NAME = config.dbName;
    process.env.MONGODB_URI = mongoUri;
    return mongoUri;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getMongoPortCandidates = (preferredPort) => {
    const normalizedPreferredPort = Number(preferredPort);
    const startPort = Number.isInteger(normalizedPreferredPort) && normalizedPreferredPort > 0
        ? normalizedPreferredPort
        : FALLBACK_LOCAL_MONGO_PORT;

    return Array.from({ length: MONGO_PORT_CANDIDATE_COUNT }, (_value, index) => startPort + index);
};

const createHealthcheckClient = (config) => {
    return new MongoClient(buildLocalMongoUri(config), {
        directConnection: true,
        serverSelectionTimeoutMS: MONGO_HEALTHCHECK_TIMEOUT_MS,
        connectTimeoutMS: MONGO_HEALTHCHECK_TIMEOUT_MS,
        socketTimeoutMS: MONGO_HEALTHCHECK_TIMEOUT_MS,
        maxPoolSize: 1,
        minPoolSize: 0,
        retryReads: false,
        retryWrites: false,
    });
};

const readFileTail = (filePath, maxBytes = MONGO_LOG_TAIL_BYTES) => {
    if (!filePath || !fs.existsSync(filePath)) {
        return "";
    }

    const stat = fs.statSync(filePath);
    if (!stat.size) {
        return "";
    }

    const bytesToRead = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(bytesToRead);
    const fd = fs.openSync(filePath, "r");

    try {
        fs.readSync(fd, buffer, 0, bytesToRead, stat.size - bytesToRead);
    } finally {
        fs.closeSync(fd);
    }

    return buffer.toString("utf8").trim();
};

const logMongoFailureDiagnostics = ({ config, logPath, lastError, child, context }) => {
    console.error(context);

    if (child && child.exitCode !== null) {
        console.error(`Bundled MongoDB exited with code ${child.exitCode}.`);
    }

    if (lastError?.message) {
        console.error(`Last MongoDB startup error: ${lastError.message}`);
    }

    if (logPath) {
        console.error(`MongoDB log file: ${logPath}`);
    }

    const logTail = readFileTail(logPath);
    if (logTail) {
        console.error("Recent MongoDB log output:");
        console.error(logTail);
    }
};

const isPortBindingFailure = (logPath) => {
    const logTail = readFileTail(logPath).toLowerCase();
    return [
        "address already in use",
        "only one usage of each socket address",
        "forbidden by its access permissions",
        "failed to set up listener",
    ].some((pattern) => logTail.includes(pattern));
};

const stopChildProcess = async (child) => {
    if (!child || child.exitCode !== null || child.killed) {
        return;
    }

    try {
        child.kill();
    } catch {
        return;
    }

    await sleep(1000);
};

export const waitForMongoCommandReady = async (
    config,
    {
        timeoutMs = MONGO_STARTUP_TIMEOUT_MS,
        pollIntervalMs = 1000,
        throwOnFailure = true,
        child = null,
        logPath = "",
    } = {}
) => {
    const startedAt = Date.now();
    let lastError = null;

    while (Date.now() - startedAt < timeoutMs) {
        if (child && child.exitCode !== null) {
            break;
        }

        const client = createHealthcheckClient(config);

        try {
            await client.connect();
            await client.db("admin").command({ ping: 1 });
            await client.close();
            return true;
        } catch (error) {
            lastError = error;
            try {
                await client.close();
            } catch {
                // ignore close errors during startup polling
            }
        }

        await sleep(pollIntervalMs);
    }

    if (!throwOnFailure) {
        return false;
    }

    const message = `MongoDB is not responding on ${config.host}:${config.port}. Check ${logPath || "the runtime logs"} for details.`;
    logMongoFailureDiagnostics({
        config,
        logPath,
        lastError,
        child,
        context: message,
    });
    throw new Error(message);
};

const startBundledMongoProcess = (config) => {
    const mongodPath = getMongoBinaryPath();
    const dbPath = getMongoDataPath();
    const logPath = path.join(getLogsPath(), "mongodb.log");

    if (!fs.existsSync(mongodPath)) {
        throw new Error(
            `Bundled MongoDB executable was not found at ${mongodPath}. Keep mongodb\\bin\\mongod.exe inside the software folder.`
        );
    }

    console.log(`Starting bundled MongoDB on ${config.host}:${config.port}...`);
    const child = spawn(
        mongodPath,
        [
            "--dbpath",
            dbPath,
            "--bind_ip",
            config.host,
            "--port",
            String(config.port),
            "--logpath",
            logPath,
            "--logappend",
        ],
        {
            cwd: getBundleRoot(),
            stdio: "ignore",
            windowsHide: true,
        }
    );

    child.once("error", (error) => {
        console.error("MongoDB process failed to start:", error.message);
    });

    return {
        child,
        logPath,
    };
};

const hasMongoDataFiles = (targetPath) => {
    if (!fs.existsSync(targetPath)) {
        return false;
    }

    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    return entries.some((entry) => {
        if (!entry.isFile()) {
            return false;
        }

        return (
            entry.name === "WiredTiger" ||
            entry.name === "_mdb_catalog.wt" ||
            MONGO_DATA_FILE_PATTERNS.some((pattern) => pattern.test(entry.name))
        );
    });
};

const clearDirectorySync = (targetPath) => {
    if (!fs.existsSync(targetPath)) {
        return;
    }

    for (const entryName of fs.readdirSync(targetPath)) {
        fs.rmSync(path.join(targetPath, entryName), { recursive: true, force: true });
    }
};

const copyDirectoryContentsSync = (sourcePath, targetPath) => {
    fs.mkdirSync(targetPath, { recursive: true });

    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
        const sourceEntryPath = path.join(sourcePath, entry.name);
        const targetEntryPath = path.join(targetPath, entry.name);

        if (entry.isDirectory()) {
            copyDirectoryContentsSync(sourceEntryPath, targetEntryPath);
            continue;
        }

        fs.copyFileSync(sourceEntryPath, targetEntryPath);
    }
};

const findBundledMongoSeedPath = () => {
    const bundleRoot = getBundleRoot();
    const candidates = [
        path.join(bundleRoot, PRIMARY_MONGO_SEED_PATH),
        path.join(bundleRoot, LEGACY_MONGO_SEED_PATH),
    ];

    return candidates.find((candidatePath) => hasMongoDataFiles(candidatePath)) || null;
};

const prepareLocalMongoDataDirectory = () => {
    const dbPath = getMongoDataPath();

    if (hasMongoDataFiles(dbPath)) {
        return {
            hadUsableData: true,
            seeded: false,
            source: null,
            reason: "existing-runtime-data",
        };
    }

    const seedPath = findBundledMongoSeedPath();
    if (!seedPath) {
        return {
            hadUsableData: false,
            seeded: false,
            source: null,
            reason: "no-seed-found",
        };
    }

    clearDirectorySync(dbPath);
    copyDirectoryContentsSync(seedPath, dbPath);

    const sourceLabel = path.relative(getBundleRoot(), seedPath) || seedPath;
    console.log(`Prepared local MongoDB data from ${sourceLabel}.`);

    return {
        hadUsableData: true,
        seeded: true,
        source: seedPath,
        reason: seedPath.endsWith(LEGACY_MONGO_SEED_PATH)
            ? "legacy-seed-migrated"
            : "packaged-seed-copied",
    };
};

export const getLocalMongoConfig = () => {
    const mongoUri = String(process.env.MONGODB_URI || "").trim();
    const match = mongoUri.match(LOCAL_MONGO_URI_PATTERN);

    if (!match) {
        return {
            isLocal: false,
            host: "127.0.0.1",
            port: getDefaultLocalMongoPort(),
            dbName: getDefaultLocalMongoDbName(),
            mongoUri,
        };
    }

    return {
        isLocal: true,
        host: match[1] === "localhost" ? "127.0.0.1" : match[1],
        port: Number(match[2] || getDefaultLocalMongoPort()),
        dbName: match[3] || getDefaultLocalMongoDbName(),
        mongoUri,
    };
};

export const isTcpPortOpen = (host, port, timeoutMs = 1000) => {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;

        const finish = (result) => {
            if (settled) {
                return;
            }

            settled = true;
            socket.destroy();
            resolve(result);
        };

        socket.setTimeout(timeoutMs);
        socket.once("connect", () => finish(true));
        socket.once("timeout", () => finish(false));
        socket.once("error", () => finish(false));
        socket.connect(port, host);
    });
};

export const waitForTcpPort = async (
    host,
    port,
    timeoutMs = 30000,
    pollIntervalMs = 750
) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        if (await isTcpPortOpen(host, port, Math.min(1000, pollIntervalMs))) {
            return true;
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return false;
};

export const ensureLocalMongoReady = async () => {
    ensureAppDirectoriesSync();
    const dataPreparation = prepareLocalMongoDataDirectory();

    const baseConfig = getLocalMongoConfig();
    if (!baseConfig.isLocal) {
        return {
            managed: false,
            alreadyRunning: false,
            startedByApp: false,
            child: null,
            config: baseConfig,
            dataPreparation,
        };
    }

    const portCandidates = getMongoPortCandidates(baseConfig.port);
    let lastStartupError = null;

    for (const candidatePort of portCandidates) {
        const config = {
            ...baseConfig,
            port: candidatePort,
        };

        config.mongoUri = syncLocalMongoEnvironment(config);

        const isAlreadyRunning = await isTcpPortOpen(config.host, config.port, 1200);
        if (isAlreadyRunning) {
            const readyExistingMongo = await waitForMongoCommandReady(config, {
                timeoutMs: 15000,
                throwOnFailure: false,
            });

            if (readyExistingMongo) {
                console.log(`Local MongoDB is already running on ${config.host}:${config.port}.`);
                return {
                    managed: true,
                    alreadyRunning: true,
                    startedByApp: false,
                    child: null,
                    config,
                    dataPreparation,
                };
            }

            console.warn(
                `Port ${config.port} is already in use but is not responding as MongoDB. Trying another local port.`
            );
            continue;
        }

        const { child, logPath } = startBundledMongoProcess(config);
        const mongoReady = await waitForMongoCommandReady(config, {
            timeoutMs: MONGO_STARTUP_TIMEOUT_MS,
            throwOnFailure: false,
            child,
            logPath,
        });

        if (mongoReady) {
            console.log(`MongoDB is ready on ${config.host}:${config.port}.`);
            return {
                managed: true,
                alreadyRunning: false,
                startedByApp: true,
                child,
                config,
                logPath,
                dataPreparation,
            };
        }

        await stopChildProcess(child);

        const failureMessage = `MongoDB did not become healthy on ${config.host}:${config.port}.`;
        logMongoFailureDiagnostics({
            config,
            logPath,
            child,
            context: failureMessage,
        });

        if (!isPortBindingFailure(logPath)) {
            throw new Error(`${failureMessage} Check ${logPath} for details.`);
        }

        lastStartupError = new Error(`${failureMessage} Retrying on another local port.`);
    }

    throw lastStartupError || new Error("MongoDB could not be started on any supported local port.");
};

export const restoreDatabaseBackupIfNeeded = async (mongoState) => {
    if (!mongoState?.managed) {
        return;
    }

    try {
        const backupManifest = resolveReadablePath("labflow-database-backup", ".manifest.json");

        if (!fs.existsSync(backupManifest)) {
            return;
        }

        const backupDir = path.dirname(backupManifest);
        const restoreTargetUri = `mongodb://${mongoState.config.host}:${mongoState.config.port}`;
        const { importDatabaseBackup, shouldRestoreDatabaseBackup } = await import("./databaseBackup.js");
        const needsRestore = await shouldRestoreDatabaseBackup(backupDir, {
            targetUri: restoreTargetUri,
        });

        if (!needsRestore) {
            console.log("Skipping packaged database restore because local MongoDB already contains application data.");
            return;
        }

        console.log("Restoring packaged database backup...");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await importDatabaseBackup(backupDir, {
            targetUri: restoreTargetUri,
            dropExisting: true,
        });
        console.log("Database backup restored successfully.");
    } catch (error) {
        console.warn(`Database backup restore failed: ${error.message}`);
        const mongoStillHealthy = await waitForMongoCommandReady(mongoState.config, {
            timeoutMs: 15000,
            throwOnFailure: false,
            child: mongoState.child,
            logPath: mongoState.logPath,
        });

        if (!mongoStillHealthy) {
            throw new Error(
                `MongoDB stopped responding during database restore on ${mongoState.config.host}:${mongoState.config.port}. Check ${mongoState.logPath || "the runtime logs"} for details.`
            );
        }
    }
};

export const attachMongoShutdownHandler = (mongoState) => {
    if (!mongoState?.startedByApp || !mongoState.child) {
        return;
    }

    const stopMongo = () => {
        if (mongoState.child.exitCode === null && !mongoState.child.killed) {
            try {
                mongoState.child.kill();
            } catch (error) {
                console.error("Failed to stop bundled MongoDB cleanly:", error.message);
            }
        }
    };

    process.once("SIGINT", stopMongo);
    process.once("SIGTERM", stopMongo);
    process.once("exit", stopMongo);
};
