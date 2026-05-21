import fs from "fs";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import readline from "readline";
import { once } from "events";
import { MongoClient } from "mongodb";
import { EJSON } from "bson";
import { getMongoDataPath, resolveRuntimePath } from "./runtimePaths.js";

const SYSTEM_DATABASE_NAMES = new Set(["admin", "config", "local"]);
const SNAPSHOT_FORMAT = "ejsonl-gzip";
const SNAPSHOT_VERSION = "2.0";
const DEFAULT_BATCH_SIZE = 250;
const DEFAULT_CONNECT_TIMEOUT_MS = 15000;
const DEFAULT_LOCAL_MONGO_PORT = 27027;
const BACKUP_STATE_FILE_NAME = ".labflow-backup-state.json";
const REQUIRED_DESKTOP_COLLECTIONS = ["superadmins", "users", "tenants", "testschemas"];

const getDefaultLocalMongoServerUri = () => {
    const configuredPort = Number(String(process.env.LABFLOW_MONGO_PORT || "").trim());
    const mongoPort = Number.isInteger(configuredPort) && configuredPort > 0
        ? configuredPort
        : DEFAULT_LOCAL_MONGO_PORT;
    return `mongodb://127.0.0.1:${mongoPort}`;
};

const ensureDirectorySync = (targetPath) => {
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }
};

const sanitizePathSegment = (value) => {
    return String(value || "")
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
};

const redactMongoUri = (value) => {
    return String(value || "").replace(/\/\/([^/@]+)@/u, "//***:***@");
};

const parseDatabaseNames = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item || "").trim())
            .filter(Boolean);
    }

    return String(value || "")
        .split(/[;,]/u)
        .map((item) => item.trim())
        .filter(Boolean);
};

const getBackupManifestPath = (backupDir) => {
    return path.join(backupDir, ".manifest.json");
};

const getBackupStatePath = () => {
    return resolveRuntimePath("data", BACKUP_STATE_FILE_NAME);
};

const loadBackupManifest = (backupDir) => {
    const manifestPath = getBackupManifestPath(backupDir);

    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Backup manifest was not found at ${manifestPath}`);
    }

    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
};

const buildBackupFingerprint = (manifest) => {
    const normalizedManifest = {
        version: manifest?.version || "",
        format: manifest?.format || "",
        createdAt: manifest?.createdAt || "",
        databases: Array.isArray(manifest?.databases)
            ? manifest.databases.map((databaseInfo) => ({
                name: databaseInfo?.name || "",
                collections: Array.isArray(databaseInfo?.collections)
                    ? databaseInfo.collections.map((collectionInfo) => ({
                        name: collectionInfo?.name || "",
                        count: Number(collectionInfo?.count || 0),
                        dataFile: collectionInfo?.dataFile || "",
                        indexCount: Array.isArray(collectionInfo?.indexes)
                            ? collectionInfo.indexes.length
                            : 0,
                    }))
                    : [],
            }))
            : [],
    };

    return crypto
        .createHash("sha1")
        .update(JSON.stringify(normalizedManifest))
        .digest("hex");
};

const readBackupStateSync = () => {
    const statePath = getBackupStatePath();
    if (!fs.existsSync(statePath)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch (error) {
        console.warn(`Backup state file is unreadable at ${statePath}, it will be recreated.`);
        return null;
    }
};

const writeBackupStateSync = (payload) => {
    const statePath = getBackupStatePath();
    ensureDirectorySync(path.dirname(statePath));
    fs.writeFileSync(statePath, JSON.stringify(payload, null, 2));
};

const listSnapshotDatabaseNames = async (client, preferredDatabaseNames) => {
    const explicitNames = parseDatabaseNames(preferredDatabaseNames).filter(
        (databaseName) => !SYSTEM_DATABASE_NAMES.has(databaseName)
    );

    if (explicitNames.length > 0) {
        return explicitNames;
    }

    const admin = client.db().admin();
    const databaseList = await admin.listDatabases();

    return databaseList.databases
        .map((database) => database.name)
        .filter((databaseName) => !SYSTEM_DATABASE_NAMES.has(databaseName));
};

const normalizeIndexDefinition = (index) => {
    const allowedOptionNames = [
        "name",
        "unique",
        "sparse",
        "expireAfterSeconds",
        "partialFilterExpression",
        "weights",
        "default_language",
        "language_override",
        "textIndexVersion",
        "2dsphereIndexVersion",
        "bits",
        "min",
        "max",
        "bucketSize",
        "collation",
        "wildcardProjection",
        "hidden",
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

const waitForWritableStream = async (stream) => {
    if (stream.writableNeedDrain) {
        await once(stream, "drain");
    }
};

const writeCollectionSnapshot = async (collection, targetPath) => {
    ensureDirectorySync(path.dirname(targetPath));

    const gzip = zlib.createGzip({ level: zlib.constants.Z_BEST_SPEED });
    const output = fs.createWriteStream(targetPath);
    gzip.pipe(output);

    const cursor = collection.find({}, { batchSize: DEFAULT_BATCH_SIZE });
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

const flushImportBatch = async (collection, documents) => {
    if (documents.length === 0) {
        return 0;
    }

    const batch = documents.splice(0, documents.length);
    await collection.insertMany(batch, { ordered: true });
    return batch.length;
};

const importCollectionSnapshot = async (collection, sourcePath) => {
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Collection snapshot file was not found at ${sourcePath}`);
    }

    const input = fs.createReadStream(sourcePath).pipe(zlib.createGunzip());
    const lines = readline.createInterface({
        input,
        crlfDelay: Infinity,
    });

    const pendingDocuments = [];
    let importedCount = 0;

    for await (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
            continue;
        }

        pendingDocuments.push(EJSON.parse(trimmedLine, { relaxed: false }));

        if (pendingDocuments.length >= DEFAULT_BATCH_SIZE) {
            importedCount += await flushImportBatch(collection, pendingDocuments);
        }
    }

    importedCount += await flushImportBatch(collection, pendingDocuments);
    return importedCount;
};

const createCollectionIfNeeded = async (db, collectionName) => {
    const existingCollection = await db
        .listCollections({ name: collectionName }, { nameOnly: true })
        .toArray();

    if (existingCollection.length === 0) {
        await db.createCollection(collectionName);
    }
};

const recreateIndexes = async (collection, indexes) => {
    for (const index of Array.isArray(indexes) ? indexes : []) {
        await collection.createIndex(index.key, index.options || {});
    }
};

const isNamespaceMissingError = (error) => {
    return error?.codeName === "NamespaceNotFound" || error?.code === 26;
};

const isDatabaseEffectivelyEmpty = async (db) => {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const collectionNames = collections.map((collection) => collection.name).sort();

    if (collectionNames.length === 0) {
        return true;
    }

    if (collectionNames.length === 1 && collectionNames[0] === "superadmins") {
        const superAdminCount = await db.collection("superadmins").countDocuments();
        return superAdminCount <= 1;
    }

    return false;
};

const countDocumentsSafely = async (db, collectionName) => {
    const collectionExists = await db
        .listCollections({ name: collectionName }, { nameOnly: true })
        .toArray();

    if (collectionExists.length === 0) {
        return 0;
    }

    return db.collection(collectionName).countDocuments();
};

const shouldBootstrapDatabase = async (db, databaseInfo) => {
    if (await isDatabaseEffectivelyEmpty(db)) {
        return true;
    }

    const collectionNames = new Set(
        (
            await db.listCollections({}, { nameOnly: true }).toArray()
        ).map((collection) => collection.name)
    );

    const manifestCollectionMap = new Map(
        (databaseInfo?.collections || []).map((collectionInfo) => [
            collectionInfo.name,
            Number(collectionInfo.count || 0),
        ])
    );

    const missingRequiredCollections = REQUIRED_DESKTOP_COLLECTIONS.some((collectionName) => {
        const expectedCount = manifestCollectionMap.get(collectionName) || 0;
        return expectedCount > 0 && !collectionNames.has(collectionName);
    });

    if (missingRequiredCollections) {
        return true;
    }

    const collectionCounts = Object.fromEntries(
        await Promise.all(
            REQUIRED_DESKTOP_COLLECTIONS.map(async (collectionName) => [
                collectionName,
                await countDocumentsSafely(db, collectionName),
            ])
        )
    );

    const hasOnlyBootstrapAdmin =
        collectionCounts.superadmins <= 1 &&
        collectionCounts.users === 0 &&
        collectionCounts.tenants === 0 &&
        collectionCounts.testschemas === 0;

    if (hasOnlyBootstrapAdmin) {
        return true;
    }

    const hasIncompleteCoreCollections = REQUIRED_DESKTOP_COLLECTIONS.some((collectionName) => {
        const expectedCount = manifestCollectionMap.get(collectionName) || 0;
        if (expectedCount <= 0) {
            return false;
        }

        return collectionCounts[collectionName] === 0;
    });

    return hasIncompleteCoreCollections;
};

const createMongoClient = (uri) => {
    return new MongoClient(uri, {
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 0,
        maxPoolSize: 4,
        minPoolSize: 0,
        retryReads: true,
        retryWrites: true,
    });
};

export const exportDatabaseBackup = async (outputDir, options = {}) => {
    const sourceUri = String(
        options.sourceUri ||
            process.env.ATLAS_MONGODB_URI ||
            process.env.MONGODB_URI ||
            ""
    ).trim();

    if (!sourceUri) {
        throw new Error("No MongoDB source URI was provided for backup export.");
    }

    const databaseNames = options.databaseNames || process.env.ATLAS_DATABASES || "";
    const sourceType = String(options.sourceType || "").trim() || "snapshot";

    console.log("Starting database snapshot export...");
    ensureDirectorySync(outputDir);

    const client = createMongoClient(sourceUri);

    try {
        await client.connect();

        const targetDatabaseNames = await listSnapshotDatabaseNames(client, databaseNames);
        if (targetDatabaseNames.length === 0) {
            throw new Error("No application databases were found to export.");
        }

        const manifest = {
            version: SNAPSHOT_VERSION,
            format: SNAPSHOT_FORMAT,
            createdAt: new Date().toISOString(),
            source: {
                type: sourceType,
                uri: redactMongoUri(sourceUri),
            },
            databases: [],
        };

        for (const databaseName of targetDatabaseNames) {
            const db = client.db(databaseName);
            const collections = await db.listCollections({}, { nameOnly: false }).toArray();
            const snapshotCollections = [];

            console.log(`  Exporting database: ${databaseName}`);

            for (const collectionInfo of collections) {
                if (collectionInfo.type && collectionInfo.type !== "collection") {
                    continue;
                }

                const collectionName = collectionInfo.name;
                const relativeDataFile = path
                    .join(
                        sanitizePathSegment(databaseName),
                        `${sanitizePathSegment(collectionName)}.ejsonl.gz`
                    )
                    .replace(/\\/gu, "/");
                const absoluteDataFile = path.join(outputDir, relativeDataFile);
                const collectionClient = createMongoClient(sourceUri);
                let indexes = [];
                let documentCount = 0;

                try {
                    await collectionClient.connect();
                    const collection = collectionClient.db(databaseName).collection(collectionName);
                    indexes = (await collection.indexes())
                        .filter((index) => index.name !== "_id_")
                        .map(normalizeIndexDefinition);
                    documentCount = await writeCollectionSnapshot(collection, absoluteDataFile);
                } finally {
                    await collectionClient.close();
                }

                console.log(`    ${collectionName}: ${documentCount} document(s)`);

                snapshotCollections.push({
                    name: collectionName,
                    count: documentCount,
                    dataFile: relativeDataFile,
                    indexes,
                });
            }

            manifest.databases.push({
                name: databaseName,
                collections: snapshotCollections,
            });
        }

        fs.writeFileSync(
            getBackupManifestPath(outputDir),
            JSON.stringify(manifest, null, 2)
        );

        console.log("Database snapshot export completed successfully.");
        return manifest;
    } catch (error) {
        console.error("Error exporting database snapshot:", error.message);
        throw error;
    } finally {
        await client.close();
    }
};

export const shouldRestoreDatabaseBackup = async (backupDir, options = {}) => {
    const manifest = loadBackupManifest(backupDir);
    const backupFingerprint = buildBackupFingerprint(manifest);
    const existingBackupState = readBackupStateSync();
    if (
        existingBackupState?.backupFingerprint === backupFingerprint &&
        ["restored", "adopted"].includes(String(existingBackupState.status || "").trim())
    ) {
        return false;
    }

    const targetUri = String(
        options.targetUri || process.env.MONGODB_URI || getDefaultLocalMongoServerUri()
    ).trim();

    const client = createMongoClient(targetUri);

    try {
        await client.connect();

        let shouldRestore = false;
        for (const databaseInfo of manifest.databases || []) {
            const db = client.db(databaseInfo.name);
            if (await shouldBootstrapDatabase(db, databaseInfo)) {
                shouldRestore = true;
                break;
            }
        }

        if (!shouldRestore) {
            writeBackupStateSync({
                status: "adopted",
                backupFingerprint,
                manifestCreatedAt: manifest.createdAt || null,
                updatedAt: new Date().toISOString(),
                databases: (manifest.databases || []).map((databaseInfo) => databaseInfo.name),
            });
        }

        return shouldRestore;
    } finally {
        await client.close();
    }
};

export const importDatabaseBackup = async (backupDir, options = {}) => {
    if (!fs.existsSync(backupDir)) {
        console.warn(`Backup directory not found: ${backupDir}`);
        return false;
    }

    const manifest = loadBackupManifest(backupDir);
    const backupFingerprint = buildBackupFingerprint(manifest);
    const targetUri = String(
        options.targetUri || process.env.MONGODB_URI || getDefaultLocalMongoServerUri()
    ).trim();
    const dropExisting = options.dropExisting !== false;

    console.log("Starting database snapshot restore...");

    const client = createMongoClient(targetUri);

    try {
        await client.connect();

        for (const databaseInfo of manifest.databases || []) {
            const db = client.db(databaseInfo.name);

            if (dropExisting) {
                try {
                    await db.dropDatabase();
                } catch (error) {
                    if (!isNamespaceMissingError(error)) {
                        throw error;
                    }
                }
            }

            console.log(`  Restoring database: ${databaseInfo.name}`);

            for (const collectionInfo of databaseInfo.collections || []) {
                const sourcePath = path.join(backupDir, collectionInfo.dataFile);

                await createCollectionIfNeeded(db, collectionInfo.name);

                const collection = db.collection(collectionInfo.name);
                const importedCount = await importCollectionSnapshot(collection, sourcePath);

                if (Number(collectionInfo.count) !== importedCount) {
                    throw new Error(
                        `Collection '${databaseInfo.name}.${collectionInfo.name}' restored ${importedCount} document(s), expected ${collectionInfo.count}.`
                    );
                }

                await recreateIndexes(collection, collectionInfo.indexes);
                console.log(`    ${collectionInfo.name}: ${importedCount} document(s)`);
            }
        }

        console.log("Database snapshot restore completed successfully.");
        writeBackupStateSync({
            status: "restored",
            backupFingerprint,
            manifestCreatedAt: manifest.createdAt || null,
            updatedAt: new Date().toISOString(),
            databases: (manifest.databases || []).map((databaseInfo) => databaseInfo.name),
        });
        return true;
    } catch (error) {
        console.error("Error importing database snapshot:", error.message);
        throw error;
    } finally {
        await client.close();
    }
};

export const hasDatabaseContent = async () => {
    try {
        const mongoDataPath = getMongoDataPath();
        const wiredTigerFile = path.join(mongoDataPath, "WiredTiger");
        return fs.existsSync(wiredTigerFile);
    } catch (error) {
        return false;
    }
};

export const initializeDatabaseFromEmbedded = async (sourceBackupDir, targetDataDir) => {
    try {
        if (!fs.existsSync(sourceBackupDir)) {
            console.warn(`Embedded backup not found at ${sourceBackupDir}`);
            return false;
        }

        console.log("Initializing database files from embedded backup...");

        const copyDir = (sourceDir, destinationDir) => {
            ensureDirectorySync(destinationDir);

            for (const fileName of fs.readdirSync(sourceDir)) {
                const sourcePath = path.join(sourceDir, fileName);
                const destinationPath = path.join(destinationDir, fileName);

                if (fs.statSync(sourcePath).isDirectory()) {
                    copyDir(sourcePath, destinationPath);
                    continue;
                }

                fs.copyFileSync(sourcePath, destinationPath);
            }
        };

        copyDir(sourceBackupDir, targetDataDir);
        console.log("Database files initialized from embedded backup.");
        return true;
    } catch (error) {
        console.error("Error initializing database files:", error.message);
        return false;
    }
};
