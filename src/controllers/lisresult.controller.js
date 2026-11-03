import { lisdata } from "../models/lismodel.js";
import { autoParseMachineData } from "../utils/machineProtocolParser.js";

/**
 * Standardize an incoming machine data payload into a clean object with sample_id.
 */
function standardizeMachinePayload(data) {
    if (!data) return null;

    // If it's a string or has rawData, parse ASTM/HL7/JSON
    if (typeof data === "string" || typeof data.rawData === "string") {
        const parsed = autoParseMachineData(data);
        if (parsed) {
            return {
                sample_id: parsed.sample_id || "",
                ...parsed.results,
                _protocol: parsed.protocol
            };
        }
    }

    if (typeof data === "object") {
        const sample_id = String(
            data.sample_id ??
            data.sampleId ??
            data.SampleID ??
            data.Sample_ID ??
            data.barcode ??
            data.sid ??
            data.SID ??
            ""
        ).trim();

        return {
            ...data,
            sample_id: sample_id || data.sample_id
        };
    }

    return null;
}

const getresult = async (req, res) => {
    try {
        const rawBody = req.body;

        console.log("LIS Data Received:", typeof rawBody === "object" ? JSON.stringify(rawBody, null, 2) : rawBody);

        if (!rawBody || (typeof rawBody === "object" && Object.keys(rawBody).length === 0)) {
            return res.status(400).json({
                data: null,
                message: "No data received in body",
                status: "Error",
                success: false
            });
        }

        // Handle array of results from batch machines
        if (Array.isArray(rawBody)) {
            const docsToInsert = rawBody
                .map(standardizeMachinePayload)
                .filter(Boolean)
                .map(item => ({ lisData: item }));

            if (docsToInsert.length === 0) {
                return res.status(400).json({
                    data: null,
                    message: "Array contained no valid machine data",
                    status: "Error",
                    success: false
                });
            }

            const docs = await lisdata.insertMany(docsToInsert);
            return res.status(200).json({
                data: docs,
                message: `${docs.length} machine data records saved successfully`,
                status: "success",
                success: true
            });
        }

        // Single object or string payload
        const dataObject = standardizeMachinePayload(rawBody);

        if (!dataObject) {
            return res.status(400).json({
                data: null,
                message: "Could not parse machine data format",
                status: "Error",
                success: false
            });
        }

        const doc = await lisdata.create({
            lisData: dataObject
        });

        if (!doc) {
            return res.status(500).json({
                data: req.body,
                message: "data received but still not saved. please try again",
                status: "error",
                success: false
            });
        }

        return res.status(200).json({
            data: dataObject,
            message: "data saved successfully",
            status: "success",
            success: true
        });
    } catch (error) {
        console.error("[LIS Result Controller] getresult error:", error.message);
        return res.status(500).json({
            data: null,
            message: "Internal server error: " + error.message,
            status: "Error",
            success: false
        });
    }
};

const getbarcoderesult = async (req, res) => {
    try {
        const { barcodeIds } = req.body;

        if (!Array.isArray(barcodeIds) || barcodeIds.length === 0) {
            return res.status(400).json({
                data: null,
                message: "barcodeIds should be a non-empty array",
                status: "Error",
                success: false
            });
        }

        // Build flexible query matching string, number, and trimmed versions
        const querySet = new Set();
        barcodeIds.forEach(id => {
            if (id !== undefined && id !== null) {
                const s = String(id).trim();
                if (s) {
                    querySet.add(s);
                    querySet.add(id);
                    if (!isNaN(Number(s))) querySet.add(Number(s));
                }
            }
        });
        const queryList = Array.from(querySet);

        const docs = await lisdata.find({
            $or: [
                { "lisData.sample_id": { $in: queryList } },
                { "lisData.sampleId": { $in: queryList } },
                { "lisData.SampleID": { $in: queryList } },
                { "lisData.Sample_ID": { $in: queryList } },
                { "lisData.barcode": { $in: queryList } },
                { "lisData.sid": { $in: queryList } },
                { "lisData.SID": { $in: queryList } }
            ]
        }).sort({ createdAt: 1 }).lean();

        const groupedResults = {};

        for (const rawBarcodeId of barcodeIds) {
            const targetStr = String(rawBarcodeId).trim().toLowerCase();

            const matchedDocs = docs.filter(doc => {
                if (!doc || !doc.lisData) return false;
                const d = doc.lisData;
                const candidates = [
                    d.sample_id,
                    d.sampleId,
                    d.SampleID,
                    d.Sample_ID,
                    d.barcode,
                    d.sid,
                    d.SID
                ].filter(v => v !== undefined && v !== null);

                return candidates.some(c => String(c).trim().toLowerCase() === targetStr);
            }).map(doc => {
                // Ensure sample_id is normalized to the queried barcode
                const normalizedLis = { ...doc.lisData };
                if (!normalizedLis.sample_id) {
                    normalizedLis.sample_id = rawBarcodeId;
                }
                return {
                    ...doc,
                    lisData: normalizedLis
                };
            });

            groupedResults[rawBarcodeId] = matchedDocs;
        }

        const hasMatches = Object.values(groupedResults).some(arr => Array.isArray(arr) && arr.length > 0);

        if (!hasMatches) {
            const anyLisDoc = await lisdata.findOne({}).lean();

            if (!anyLisDoc) {
                return res.status(200).json({
                    data: null,
                    message: "The LIS (Laboratory Information System) setup for your machines has not yet been completed. Please configure your analyzer in the Machine Connector page.",
                    status: "success",
                    success: true
                });
            } else {
                return res.status(200).json({
                    data: null,
                    message: `No analyzer data found for barcode(s): ${barcodeIds.join(", ")}. Ensure the machine has sent the sample test run.`,
                    status: "success",
                    success: true
                });
            }
        }

        return res.status(200).json({
            data: groupedResults,
            message: "fetch complete",
            status: "success",
            success: true
        });

    } catch (error) {
        console.error("[LIS Result Controller] getbarcoderesult error:", error);
        return res.status(500).json({
            data: null,
            message: error.message || "Internal Server Error",
            status: "Error",
            success: false
        });
    }
};

export {
    getresult,
    getbarcoderesult
};
