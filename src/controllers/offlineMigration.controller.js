import fs from "fs";
import path from "path";
import zlib from "zlib";
import { once } from "events";
import { exec } from "child_process";
import { promisify } from "util";
import mongoose from "mongoose";
import { EJSON } from "bson";
import { Tenant } from "../models/tenant.model.js";
import { User } from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/apiError.js";

const execAsync = promisify(exec);

export const DEFAULT_OFFLINE_BACKUP_PATH = "C:\\Users\\kaifx\\Desktop\\labflowlis.com\\LabflowOfflineexe\\labflow-database-backup";
export const DEFAULT_DB_NAME = "myfranchisee_super_admin";
const DEFAULT_BATCH_SIZE = 250;
const SNAPSHOT_VERSION = "2.0";
const SNAPSHOT_FORMAT = "ejsonl-gzip";

// Essential Master Collections recommended for a clean client installer
export const MASTER_COLLECTIONS = new Set([
    "testschemas",
    "categorydbs",
    "unitdbs",
    "sampletypes",
    "pannels",
    "packages",
    "formulas",
    "templates",
    "test-templates",
    "testreferencevalues",
    "defaultsettings",
    "printsetting",
    "defaultpdfsettings",
    "doctorratecards",
    "superadmins",
    "tenants",
    "users"
]);

// Collections with sensitive/transactional/junk data that shouldn't be in a fresh client installer
export const TRANSACTIONAL_COLLECTIONS = new Set([
    "testbookings",
    "reports",
    "bookedtestsvalues",
    "customizations",
    "invoices",
    "ledgers",
    "acceptedbarcodes",
    "offline_reports",
    "payments",
    "subscribers",
    "expenses",
    "budgetcategories",
    "booking-time-add-labs",
    "bookingquickgroups",
    "doctors",
    "doctorsigns",
    "targets",
    "requests",
    "conversations",
    "addresses",
    "otps",
    "notifications",
    "orders",
    "videos",
    "products",
    "certificateschemas",
    "counters",
    "pannelcounters",
    "testcounters",
    "lisdatas",
    "qrreportdevices",
    "qrreportlinks"
]);

const resolveTargetDir = (customDir) => {
    const rawPath = String(customDir || "").trim();
    if (rawPath) {
        return path.resolve(rawPath);
    }
    return path.resolve(DEFAULT_OFFLINE_BACKUP_PATH);
};

const ensureDirectorySync = (targetPath) => {
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }
};

const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const normalizeIndexDefinition = (index) => {
    const allowedOptionNames = [
        "name", "unique", "sparse", "expireAfterSeconds",
        "partialFilterExpression", "weights", "default_language",
        "language_override", "textIndexVersion", "2dsphereIndexVersion",
        "bits", "min", "max", "bucketSize", "collation",
        "wildcardProjection", "hidden"
    ];

    const options = {};
    for (const optionName of allowedOptionNames) {
        if (index[optionName] !== undefined) {
            options[optionName] = index[optionName];
        }
    }

    return {
        key: index.key,
        options,
    };
};

const readManifestSync = (backupDir) => {
    const manifestPath = path.join(backupDir, ".manifest.json");
    if (!fs.existsSync(manifestPath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (e) {
        console.warn(`Failed to read manifest at ${manifestPath}: ${e.message}`);
        return null;
    }
};

const writeManifestSync = (backupDir, manifest) => {
    const manifestPath = path.join(backupDir, ".manifest.json");
    ensureDirectorySync(backupDir);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
};

const waitForWritableStream = async (stream) => {
    if (stream.writableNeedDrain) {
        await once(stream, "drain");
    }
};

const streamCollectionToGzip = async (cursor, targetPath) => {
    ensureDirectorySync(path.dirname(targetPath));

    const gzip = zlib.createGzip({ level: zlib.constants.Z_BEST_SPEED });
    const output = fs.createWriteStream(targetPath);
    gzip.pipe(output);

    let documentCount = 0;

    for await (const document of cursor) {
        if (!gzip.write(`${EJSON.stringify(document, { relaxed: false })}\n`)) {
            await waitForWritableStream(gzip);
        }
        documentCount += 1;
    }

    gzip.end();
    await once(output, "close");

    return documentCount;
};

/**
 * GET /api/v1/offline-migration/status
 * Fetches online collections, document counts, offline seed status, file sizes, and tenants.
 */
export const getMigrationStatus = asyncHandler(async (req, res) => {
    const targetDir = resolveTargetDir(req.query.targetDir);
    const db = mongoose.connection.db;

    if (!db) {
        throw new ApiError(500, "Online MongoDB connection not ready");
    }

    // 1. Fetch all online collections and their counts
    const onlineCollectionsList = await db.listCollections().toArray();
    const onlineCollectionsMap = new Map();

    for (const col of onlineCollectionsList) {
        if (col.type && col.type !== "collection") continue;
        const count = await db.collection(col.name).countDocuments();
        onlineCollectionsMap.set(col.name, count);
    }

    // 2. Fetch offline backup state from target directory
    const manifest = readManifestSync(targetDir);
    const offlineDatabase = manifest?.databases?.find((d) => d.name === DEFAULT_DB_NAME) || manifest?.databases?.[0];
    const offlineCollectionsMap = new Map();

    if (offlineDatabase && Array.isArray(offlineDatabase.collections)) {
        for (const col of offlineDatabase.collections) {
            offlineCollectionsMap.set(col.name, {
                count: Number(col.count || 0),
                dataFile: col.dataFile,
                indexes: col.indexes || []
            });
        }
    }

    // Check files on disk
    const dbDir = path.join(targetDir, DEFAULT_DB_NAME);
    const diskFiles = new Map();
    let totalOfflineSize = 0;

    if (fs.existsSync(dbDir)) {
        const files = fs.readdirSync(dbDir);
        for (const file of files) {
            if (file.endsWith(".ejsonl.gz")) {
                const colName = file.replace(/\.ejsonl\.gz$/i, "");
                const filePath = path.join(dbDir, file);
                const stat = fs.statSync(filePath);
                diskFiles.set(colName, {
                    sizeBytes: stat.size,
                    sizeFormatted: formatBytes(stat.size),
                    updatedAt: stat.mtime
                });
                totalOfflineSize += stat.size;
            }
        }
    }

    // 3. Combine collection information
    const allCollectionNames = new Set([
        ...onlineCollectionsMap.keys(),
        ...offlineCollectionsMap.keys(),
        ...diskFiles.keys()
    ]);

    const collections = [];
    let totalOnlineDocs = 0;
    let totalOfflineDocs = 0;
    let junkCollectionsCount = 0;

    for (const name of Array.from(allCollectionNames).sort()) {
        const onlineCount = onlineCollectionsMap.get(name) ?? null;
        const offlineInfo = offlineCollectionsMap.get(name);
        const diskInfo = diskFiles.get(name);
        const isMaster = MASTER_COLLECTIONS.has(name);
        const isTransactional = TRANSACTIONAL_COLLECTIONS.has(name);

        const offlineCount = offlineInfo ? offlineInfo.count : (diskInfo ? 0 : null);
        if (onlineCount !== null) totalOnlineDocs += onlineCount;
        if (offlineCount !== null) totalOfflineDocs += offlineCount;

        let status = "missing_offline";
        if (onlineCount !== null && offlineCount !== null) {
            if (onlineCount === offlineCount) {
                status = "synced";
            } else {
                status = "different";
            }
        } else if (onlineCount === null && offlineCount !== null) {
            status = "offline_only";
        }

        if (isTransactional && offlineCount && offlineCount > 0) {
            junkCollectionsCount += 1;
        }

        collections.push({
            name,
            isMaster,
            isTransactional,
            category: isMaster ? "master" : (isTransactional ? "transactional" : "other"),
            onlineCount,
            offlineCount,
            fileSize: diskInfo ? diskInfo.sizeFormatted : "0 Bytes",
            fileSizeBytes: diskInfo ? diskInfo.sizeBytes : 0,
            fileUpdatedAt: diskInfo ? diskInfo.updatedAt : null,
            status,
            existsOffline: !!diskInfo,
            existsOnline: onlineCount !== null
        });
    }

    // 4. Fetch Tenants list
    const tenants = await Tenant.find({}, { name: 1, code: 1, adminDetails: 1, status: 1 }).lean();
    const formattedTenants = tenants.map((t) => ({
        tenantId: String(t._id),
        name: t.name,
        code: t.code,
        email: t.adminDetails?.email || "",
        username: t.adminDetails?.username || "",
        status: t.status || "active"
    }));

    return res.status(200).json(
        new ApiResponse(200, {
            targetDir,
            dbName: DEFAULT_DB_NAME,
            exists: fs.existsSync(targetDir),
            manifestCreatedAt: manifest?.createdAt || null,
            totalOnlineDocs,
            totalOfflineDocs,
            totalOfflineSize: formatBytes(totalOfflineSize),
            totalOfflineSizeBytes: totalOfflineSize,
            collectionsCount: collections.length,
            junkCollectionsCount,
            isClean: junkCollectionsCount === 0,
            tenants: formattedTenants,
            collections
        }, "Offline migration status fetched successfully")
    );
});

/**
 * POST /api/v1/offline-migration/export
 * Exports selected collections (with optional tenant filtering) into the offline backup directory.
 */
export const exportCollections = asyncHandler(async (req, res) => {
    const {
        collections: requestedCollections,
        tenantId,
        includeBaseMaster = true,
        targetDir: customDir
    } = req.body;

    if (!Array.isArray(requestedCollections) || requestedCollections.length === 0) {
        throw new ApiError(400, "Please provide an array of collection names to export.");
    }

    const targetDir = resolveTargetDir(customDir);
    const db = mongoose.connection.db;

    if (!db) {
        throw new ApiError(500, "Online MongoDB connection not ready");
    }

    ensureDirectorySync(targetDir);
    const dbDir = path.join(targetDir, DEFAULT_DB_NAME);
    ensureDirectorySync(dbDir);

    let manifest = readManifestSync(targetDir);
    if (!manifest) {
        manifest = {
            version: SNAPSHOT_VERSION,
            format: SNAPSHOT_FORMAT,
            createdAt: new Date().toISOString(),
            source: {
                type: "atlas",
                uri: "mongodb://***:***@cluster0/?appName=Cluster0"
            },
            databases: [
                {
                    name: DEFAULT_DB_NAME,
                    collections: []
                }
            ]
        };
    }

    let databaseObj = manifest.databases.find((d) => d.name === DEFAULT_DB_NAME);
    if (!databaseObj) {
        databaseObj = { name: DEFAULT_DB_NAME, collections: [] };
        manifest.databases.push(databaseObj);
    }

    const results = [];
    let tenantObjectId = null;
    if (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) {
        tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    }

    for (const colName of requestedCollections) {
        const col = db.collection(colName);
        let filter = {};

        // Apply tenant-specific filtering if tenant is selected
        if (tenantId) {
            if (colName === "testschemas") {
                if (includeBaseMaster) {
                    filter = {
                        $or: [
                            { tenantId: tenantObjectId },
                            { tenantId: tenantId },
                            { tenantId: null },
                            { isBaseTest: true }
                        ]
                    };
                } else {
                    filter = {
                        $or: [
                            { tenantId: tenantObjectId },
                            { tenantId: tenantId }
                        ]
                    };
                }
            } else if (colName === "customizations") {
                filter = {
                    $or: [
                        { tenantId: tenantObjectId },
                        { tenantId: tenantId }
                    ]
                };
            } else if (colName === "tenants") {
                filter = { _id: tenantObjectId };
            } else if (colName === "users") {
                filter = {
                    $or: [
                        { tenantId: tenantObjectId },
                        { tenantId: tenantId },
                        { role: "superAdmin" }
                    ]
                };
            } else if (colName === "doctors" || colName === "doctorratecards") {
                filter = {
                    $or: [
                        { tenantId: tenantObjectId },
                        { tenantId: tenantId }
                    ]
                };
            }
            // Other collections like unitdbs, sampletypes, categorydbs, formulas, superadmins
            // remain global or export as-is unless they contain specific tenant fields.
        }

        const relativeDataFile = `${DEFAULT_DB_NAME}/${colName}.ejsonl.gz`;
        const absoluteDataFile = path.join(targetDir, relativeDataFile);

        console.log(`[OfflineMigration] Exporting collection: ${colName} with filter:`, filter);

        let indexes = [];
        try {
            indexes = (await col.indexes())
                .filter((index) => index.name !== "_id_")
                .map(normalizeIndexDefinition);
        } catch (e) {
            console.warn(`Could not read indexes for ${colName}:`, e.message);
        }

        const cursor = col.find(filter, { batchSize: DEFAULT_BATCH_SIZE });
        const documentCount = await streamCollectionToGzip(cursor, absoluteDataFile);
        const stat = fs.statSync(absoluteDataFile);

        // Update or insert collection entry in manifest
        const existingIndex = databaseObj.collections.findIndex((c) => c.name === colName);
        const colMeta = {
            name: colName,
            count: documentCount,
            dataFile: relativeDataFile,
            indexes
        };

        if (existingIndex >= 0) {
            databaseObj.collections[existingIndex] = colMeta;
        } else {
            databaseObj.collections.push(colMeta);
        }

        results.push({
            name: colName,
            count: documentCount,
            fileSize: formatBytes(stat.size),
            fileSizeBytes: stat.size,
            filterApplied: Object.keys(filter).length > 0
        });
    }

    manifest.createdAt = new Date().toISOString();
    writeManifestSync(targetDir, manifest);

    return res.status(200).json(
        new ApiResponse(200, {
            exportedCount: results.length,
            collections: results,
            targetDir,
            manifestCreatedAt: manifest.createdAt
        }, `Successfully exported ${results.length} collection(s) to offline seed package.`)
    );
});

/**
 * DELETE /api/v1/offline-migration/collection/:name
 * Deletes a single collection file from offline seed directory and updates the manifest.
 */
export const deleteOfflineCollection = asyncHandler(async (req, res) => {
    const colName = req.params.name;
    const targetDir = resolveTargetDir(req.query.targetDir || req.body.targetDir);

    const relativeDataFile = `${DEFAULT_DB_NAME}/${colName}.ejsonl.gz`;
    const absoluteDataFile = path.join(targetDir, relativeDataFile);

    let deletedFile = false;
    let freedBytes = 0;

    if (fs.existsSync(absoluteDataFile)) {
        const stat = fs.statSync(absoluteDataFile);
        freedBytes = stat.size;
        fs.unlinkSync(absoluteDataFile);
        deletedFile = true;
    }

    const manifest = readManifestSync(targetDir);
    if (manifest) {
        const dbObj = manifest.databases?.find((d) => d.name === DEFAULT_DB_NAME);
        if (dbObj && Array.isArray(dbObj.collections)) {
            dbObj.collections = dbObj.collections.filter((c) => c.name !== colName);
            manifest.createdAt = new Date().toISOString();
            writeManifestSync(targetDir, manifest);
        }
    }

    return res.status(200).json(
        new ApiResponse(200, {
            name: colName,
            deletedFile,
            freedBytes: formatBytes(freedBytes)
        }, `Collection '${colName}' removed from offline backup.`)
    );
});

/**
 * DELETE /api/v1/offline-migration/wipe-junk
 * Removes all transactional and sensitive junk collections from offline seed backup.
 */
export const wipeOfflineJunk = asyncHandler(async (req, res) => {
    const targetDir = resolveTargetDir(req.query.targetDir || req.body.targetDir);
    const dbDir = path.join(targetDir, DEFAULT_DB_NAME);

    if (!fs.existsSync(dbDir)) {
        return res.status(200).json(
            new ApiResponse(200, { deletedCollections: [], totalFreed: "0 Bytes" }, "No offline database files found to clean.")
        );
    }

    const manifest = readManifestSync(targetDir);
    const deletedCollections = [];
    let totalFreedBytes = 0;

    for (const junkCol of TRANSACTIONAL_COLLECTIONS) {
        const filePath = path.join(dbDir, `${junkCol}.ejsonl.gz`);
        if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            totalFreedBytes += stat.size;
            fs.unlinkSync(filePath);
            deletedCollections.push({
                name: junkCol,
                size: formatBytes(stat.size)
            });
        }
    }

    if (manifest) {
        const dbObj = manifest.databases?.find((d) => d.name === DEFAULT_DB_NAME);
        if (dbObj && Array.isArray(dbObj.collections)) {
            dbObj.collections = dbObj.collections.filter((c) => !TRANSACTIONAL_COLLECTIONS.has(c.name));
            manifest.createdAt = new Date().toISOString();
            writeManifestSync(targetDir, manifest);
        }
    }

    return res.status(200).json(
        new ApiResponse(200, {
            deletedCollections,
            count: deletedCollections.length,
            totalFreed: formatBytes(totalFreedBytes),
            totalFreedBytes
        }, `Successfully cleaned ${deletedCollections.length} junk collection(s), freeing ${formatBytes(totalFreedBytes)} of space.`)
    );
});

/**
 * DELETE /api/v1/offline-migration/full-reset
 * Resets the entire offline backup folder.
 */
export const fullResetOfflineBackup = asyncHandler(async (req, res) => {
    const targetDir = resolveTargetDir(req.query.targetDir || req.body.targetDir);

    if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const emptyManifest = {
        version: SNAPSHOT_VERSION,
        format: SNAPSHOT_FORMAT,
        createdAt: new Date().toISOString(),
        databases: [
            {
                name: DEFAULT_DB_NAME,
                collections: []
            }
        ]
    };
    writeManifestSync(targetDir, emptyManifest);

    return res.status(200).json(
        new ApiResponse(200, { targetDir }, "Offline seed folder has been completely reset.")
    );
});

/**
 * GET /api/v1/offline-migration/download-zip
 * Creates a zip of the offline backup directory and sends it as a download.
 */
export const downloadOfflineBackupZip = asyncHandler(async (req, res) => {
    const targetDir = resolveTargetDir(req.query.targetDir);

    if (!fs.existsSync(targetDir)) {
        throw new ApiError(404, "Offline backup directory not found.");
    }

    const tempZipPath = path.join(targetDir, "..", `labflow-backup-${Date.now()}.zip`);
    const cmd = `powershell -NoProfile -Command "Compress-Archive -Path '${targetDir}\\*' -DestinationPath '${tempZipPath}' -Force"`;

    try {
        await execAsync(cmd);
        res.download(tempZipPath, "labflow-database-backup.zip", (err) => {
            try {
                if (fs.existsSync(tempZipPath)) {
                    fs.unlinkSync(tempZipPath);
                }
            } catch (e) {
                console.error("Cleanup temp zip error:", e);
            }
        });
    } catch (e) {
        throw new ApiError(500, `Failed to generate zip: ${e.message}`);
    }
});
