import mongoose from "mongoose";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const Connect_DB = async () => {
    let mongoUri = String(process.env.MONGODB_URI || "").trim();
    const isLocalMongo = /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(mongoUri);
    const isManagedLocalMongo =
        isLocalMongo && String(process.env.LABFLOW_MANAGED_MONGO || "").toLowerCase() === "true";

    if (!mongoUri) {
        throw new Error("MONGODB_URI is not configured.");
    }

    if (mongoose.connection.readyState === 1) {
        return mongoose;
    }

    const maxAttempts = isLocalMongo ? 40 : 1;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const connection = await mongoose.connect(mongoUri, {
                maxPoolSize: 10,
                minPoolSize: 1,
                socketTimeoutMS: 30000,
                serverSelectionTimeoutMS: isLocalMongo ? 2000 : 5000,
                bufferCommands: false,
            });

            console.log(`MongoDB Connected: ${connection.connection.host}`);
            return connection;
        } catch (error) {
            lastError = error;
            console.error(`MongoDB connection attempt ${attempt} failed: ${error.message}`);

            try {
                if (mongoose.connection.readyState !== 0) {
                    await mongoose.disconnect();
                }
            } catch {
                // ignore disconnect cleanup errors during recovery
            }

            if (
                isManagedLocalMongo &&
                (attempt === 1 || attempt % 5 === 0) &&
                /econnrefused|server selection|connection/i.test(String(error?.message || ""))
            ) {
                try {
                    const { ensureLocalMongoReady } = await import("../utils/localMongoRuntime.js");
                    const mongoState = await ensureLocalMongoReady();
                    mongoUri =
                        mongoState?.config?.mongoUri ||
                        `mongodb://${mongoState.config.host}:${mongoState.config.port}/${mongoState.config.dbName}`;
                    console.log(`Managed MongoDB recovery succeeded on ${mongoState.config.host}:${mongoState.config.port}.`);
                } catch (recoveryError) {
                    console.error(`Managed MongoDB recovery attempt failed: ${recoveryError.message}`);
                }
            }

            if (attempt < maxAttempts) {
                await sleep(1500);
            }
        }
    }

    if (isLocalMongo) {
        console.error(
            "Local MongoDB is not ready. Start mongodb\\bin\\mongod.exe with data stored in data\\db before launching the app."
        );
    }

    throw lastError;
};

export default Connect_DB;
