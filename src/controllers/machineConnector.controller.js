import { MachineConnector } from "../models/machineConnector.model.js";
import { lisdata } from "../models/lismodel.js";
import { autoParseMachineData } from "../utils/machineProtocolParser.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the tenant ID from the authenticated request.
 * LabFlowLIS uses req.user.tenantId (set by verifyJWT middleware).
 */
function resolveTenantId(req) {
    return (
        req.user?.tenantId ||
        req.user?.tenant ||
        req.tenantId ||
        req.user?._id ||
        null
    );
}

/**
 * Apply param-mapping to translate machine keys → test short-names.
 * Returns a new object with mapped keys retained alongside originals.
 */
function applyParamMapping(rawData, paramMappings = []) {
    if (!rawData || !Array.isArray(paramMappings) || paramMappings.length === 0) {
        return rawData;
    }

    const mapped = { ...rawData };

    for (const mapping of paramMappings) {
        const { machineKey, testShortName } = mapping;
        if (!machineKey || !testShortName) continue;

        // Direct key match (exact or case-insensitive)
        if (Object.prototype.hasOwnProperty.call(rawData, machineKey)) {
            mapped[testShortName] = rawData[machineKey];
        } else {
            // Case-insensitive fallback
            const lowerKey = String(machineKey).toLowerCase();
            const foundKey = Object.keys(rawData).find(
                (k) => String(k).toLowerCase() === lowerKey
            );
            if (foundKey !== undefined) {
                mapped[testShortName] = rawData[foundKey];
            }
        }
    }

    return mapped;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /machine-connectors  — Create a new machine
// ─────────────────────────────────────────────────────────────────────────────
const createMachineConnector = async (req, res) => {
    try {
        const tenantId = resolveTenantId(req);
        if (!tenantId) {
            return res.status(401).json({ success: false, message: "Unauthorised: tenant not resolved" });
        }

        const {
            machineName,
            machineType,
            manufacturer,
            modelNumber,
            connectionType,
            tcpHost,
            tcpPort,
            tcpMode,
            serialPort,
            baudRate,
            dataBits,
            stopBits,
            parity,
            watchDirectory,
            filePattern,
            protocol,
            sampleIdField,
            paramMappings,
            notes
        } = req.body;

        if (!machineName || !machineType || !connectionType || !protocol) {
            return res.status(400).json({
                success: false,
                message: "machineName, machineType, connectionType and protocol are required"
            });
        }

        // Prevent duplicate TCP port within the same tenant
        if (connectionType === "tcpip" && tcpPort && tcpMode === "server") {
            const existing = await MachineConnector.findOne({
                tenantId,
                connectionType: "tcpip",
                tcpPort: Number(tcpPort),
                tcpMode: "server",
                isActive: true
            });
            if (existing) {
                return res.status(409).json({
                    success: false,
                    message: `Port ${tcpPort} is already used by another active machine connector ("${existing.machineName}"). Please choose a different port.`
                });
            }
        }

        // Clean up paramMappings to ensure no half-empty objects fail validation
        const cleanedMappings = Array.isArray(paramMappings)
            ? paramMappings
                .filter(m => m && typeof m === "object")
                .map(m => ({
                    machineKey: String(m.machineKey || "").trim(),
                    testShortName: String(m.testShortName || "").trim(),
                    unit: String(m.unit || "").trim(),
                    notes: String(m.notes || "").trim()
                }))
                .filter(m => m.machineKey && m.testShortName)
            : [];

        const connector = await MachineConnector.create({
            tenantId,
            createdBy: req.user?._id || req.user?.id || tenantId,
            machineName: String(machineName).trim(),
            machineType,
            manufacturer: manufacturer ? String(manufacturer).trim() : "",
            modelNumber: modelNumber ? String(modelNumber).trim() : "",
            connectionType,
            tcpHost: tcpHost ? String(tcpHost).trim() : "",
            tcpPort: tcpPort ? Number(tcpPort) : null,
            tcpMode: tcpMode || "server",
            serialPort: serialPort ? String(serialPort).trim() : "",
            baudRate: baudRate ? Number(baudRate) : 9600,
            dataBits: dataBits ? Number(dataBits) : 8,
            stopBits: stopBits ? Number(stopBits) : 1,
            parity: parity || "none",
            watchDirectory: watchDirectory ? String(watchDirectory).trim() : "",
            filePattern: filePattern ? String(filePattern).trim() : "*.txt",
            protocol,
            sampleIdField: sampleIdField ? String(sampleIdField).trim() : "sample_id",
            paramMappings: cleanedMappings,
            notes: notes ? String(notes).trim() : ""
        });

        return res.status(201).json({
            success: true,
            message: "Machine connector created successfully",
            data: connector
        });
    } catch (error) {
        console.error("[MachineConnector] createMachineConnector error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /machine-connectors  — List all machines for current tenant
// ─────────────────────────────────────────────────────────────────────────────
const listMachineConnectors = async (req, res) => {
    try {
        const tenantId = resolveTenantId(req);
        if (!tenantId) {
            return res.status(401).json({ success: false, message: "Unauthorised" });
        }

        const connectors = await MachineConnector.find({ tenantId })
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Machine connectors fetched",
            data: connectors
        });
    } catch (error) {
        console.error("[MachineConnector] listMachineConnectors error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /machine-connectors/:id  — Get single machine
// ─────────────────────────────────────────────────────────────────────────────
const getMachineConnectorById = async (req, res) => {
    try {
        const tenantId = resolveTenantId(req);
        const { id } = req.params;

        const connector = await MachineConnector.findOne({ _id: id, tenantId }).lean();
        if (!connector) {
            return res.status(404).json({ success: false, message: "Machine connector not found" });
        }

        return res.status(200).json({ success: true, data: connector });
    } catch (error) {
        console.error("[MachineConnector] getMachineConnectorById error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /machine-connectors/:id  — Update machine connector
// ─────────────────────────────────────────────────────────────────────────────
const updateMachineConnector = async (req, res) => {
    try {
        const tenantId = resolveTenantId(req);
        const { id } = req.params;

        const connector = await MachineConnector.findOne({ _id: id, tenantId });
        if (!connector) {
            return res.status(404).json({ success: false, message: "Machine connector not found" });
        }

        // Check port conflict (if changing port)
        const newPort = req.body.tcpPort ? Number(req.body.tcpPort) : null;
        if (
            req.body.connectionType === "tcpip" &&
            newPort &&
            req.body.tcpMode === "server" &&
            newPort !== connector.tcpPort
        ) {
            const conflict = await MachineConnector.findOne({
                tenantId,
                _id: { $ne: id },
                connectionType: "tcpip",
                tcpPort: newPort,
                tcpMode: "server",
                isActive: true
            });
            if (conflict) {
                return res.status(409).json({
                    success: false,
                    message: `Port ${newPort} is already in use by "${conflict.machineName}"`
                });
            }
        }

        const allowedFields = [
            "machineName", "machineType", "manufacturer", "modelNumber",
            "connectionType", "tcpHost", "tcpPort", "tcpMode",
            "serialPort", "baudRate", "dataBits", "stopBits", "parity",
            "watchDirectory", "filePattern",
            "protocol", "sampleIdField", "paramMappings",
            "isActive", "notes"
        ];

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                if (field === "paramMappings") {
                    connector.paramMappings = Array.isArray(req.body.paramMappings)
                        ? req.body.paramMappings
                            .filter(m => m && typeof m === "object")
                            .map(m => ({
                                machineKey: String(m.machineKey || "").trim(),
                                testShortName: String(m.testShortName || "").trim(),
                                unit: String(m.unit || "").trim(),
                                notes: String(m.notes || "").trim()
                            }))
                            .filter(m => m.machineKey && m.testShortName)
                        : [];
                } else if (field === "tcpPort") {
                    connector.tcpPort = req.body.tcpPort ? Number(req.body.tcpPort) : null;
                } else {
                    connector[field] = req.body[field];
                }
            }
        });

        await connector.save();

        return res.status(200).json({
            success: true,
            message: "Machine connector updated successfully",
            data: connector
        });
    } catch (error) {
        console.error("[MachineConnector] updateMachineConnector error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /machine-connectors/:id  — Delete machine connector
// ─────────────────────────────────────────────────────────────────────────────
const deleteMachineConnector = async (req, res) => {
    try {
        const tenantId = resolveTenantId(req);
        const { id } = req.params;

        const deleted = await MachineConnector.findOneAndDelete({ _id: id, tenantId });
        if (!deleted) {
            return res.status(404).json({ success: false, message: "Machine connector not found" });
        }

        return res.status(200).json({ success: true, message: "Machine connector deleted successfully" });
    } catch (error) {
        console.error("[MachineConnector] deleteMachineConnector error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /machine-connectors/:id/toggle  — Toggle isActive
// ─────────────────────────────────────────────────────────────────────────────
const toggleMachineConnector = async (req, res) => {
    try {
        const tenantId = resolveTenantId(req);
        const { id } = req.params;

        const connector = await MachineConnector.findOne({ _id: id, tenantId });
        if (!connector) {
            return res.status(404).json({ success: false, message: "Machine connector not found" });
        }

        connector.isActive = !connector.isActive;
        await connector.save();

        return res.status(200).json({
            success: true,
            message: `Machine connector ${connector.isActive ? "enabled" : "disabled"} successfully`,
            data: { isActive: connector.isActive }
        });
    } catch (error) {
        console.error("[MachineConnector] toggleMachineConnector error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /machine-connectors/ingest/:connectorId
//
// Primary push endpoint for machine data. Supports JSON, raw ASTM, and HL7.
// ─────────────────────────────────────────────────────────────────────────────
const ingestMachineData = async (req, res) => {
    try {
        const { connectorId } = req.params;
        const rawPayload = req.body;

        if (!connectorId) {
            return res.status(400).json({ success: false, message: "connectorId is required in URL" });
        }

        if (!rawPayload || (typeof rawPayload === "object" && Object.keys(rawPayload).length === 0)) {
            return res.status(400).json({ success: false, message: "No data received in body" });
        }

        const connector = await MachineConnector.findById(connectorId);
        if (!connector) {
            return res.status(404).json({ success: false, message: "Machine connector not found" });
        }

        if (!connector.isActive) {
            return res.status(403).json({ success: false, message: "Machine connector is currently disabled" });
        }

        // Auto-parse if string or raw ASTM/HL7
        let normalizedPayload = rawPayload;
        if (typeof rawPayload === "string" || typeof rawPayload?.rawData === "string") {
            const parsed = autoParseMachineData(rawPayload);
            if (parsed) {
                normalizedPayload = {
                    sample_id: parsed.sample_id,
                    ...parsed.results,
                    _protocol: parsed.protocol
                };
            }
        }

        // Apply tenant-specific param mapping
        const mappedData = applyParamMapping(normalizedPayload, connector.paramMappings);

        // Ensure sample_id is present (check configured field name & common aliases)
        const sampleIdField = connector.sampleIdField || "sample_id";
        if (!mappedData.sample_id) {
            mappedData.sample_id =
                mappedData[sampleIdField] ||
                mappedData.sampleId ||
                mappedData.SampleID ||
                mappedData.Sample_ID ||
                mappedData.barcode ||
                mappedData.sid ||
                mappedData.SID ||
                "";
        }

        // Save to lisdata collection
        const doc = await lisdata.create({
            lisData: {
                ...mappedData,
                _connectorId: String(connectorId),
                _connectorName: connector.machineName,
                _tenantId: String(connector.tenantId),
                _receivedAt: new Date().toISOString()
            }
        });

        if (!doc) {
            return res.status(500).json({ success: false, message: "Data received but could not be saved" });
        }

        // Update runtime stats on the connector
        await MachineConnector.updateOne(
            { _id: connectorId },
            {
                $set: {
                    connectionStatus: "connected",
                    lastDataReceivedAt: new Date(),
                    lastError: ""
                },
                $inc: { lastDataReceivedCount: 1 }
            }
        );

        console.log(
            `[MachineConnector] Ingested data for "${connector.machineName}" (${connectorId}), sample_id: ${mappedData.sample_id}`
        );

        return res.status(200).json({
            success: true,
            message: "Machine data saved successfully",
            data: {
                savedId: doc._id,
                sample_id: mappedData.sample_id || null,
                fieldsReceived: Object.keys(rawPayload).length,
                fieldsMapped: Object.keys(mappedData).length
            }
        });
    } catch (error) {
        console.error("[MachineConnector] ingestMachineData error:", error);

        try {
            if (req.params.connectorId) {
                await MachineConnector.updateOne(
                    { _id: req.params.connectorId },
                    { $set: { connectionStatus: "error", lastError: error.message } }
                );
            }
        } catch (_) { /* swallow secondary error */ }

        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /machine-connectors/:id/test-connection
// ─────────────────────────────────────────────────────────────────────────────
const testMachineConnection = async (req, res) => {
    try {
        const tenantId = resolveTenantId(req);
        const { id } = req.params;

        const connector = await MachineConnector.findOne({ _id: id, tenantId });
        if (!connector) {
            return res.status(404).json({ success: false, message: "Machine connector not found" });
        }

        const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
        const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
        const ingestUrl = `${protocol}://${host}/api/v1/user/machine-connectors/ingest/${connector._id}`;

        return res.status(200).json({
            success: true,
            message: "Connection verified. Send test results to the ingest URL below.",
            data: {
                connectorId: connector._id,
                machineName: connector.machineName,
                connectionType: connector.connectionType,
                protocol: connector.protocol,
                ingestUrl,
                tcpPort: connector.tcpPort,
                sampleIdField: connector.sampleIdField,
                paramMappings: connector.paramMappings,
                lastDataReceivedAt: connector.lastDataReceivedAt,
                connectionStatus: connector.connectionStatus
            }
        });
    } catch (error) {
        console.error("[MachineConnector] testMachineConnection error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /machine-connectors/:id/recent-data
// ─────────────────────────────────────────────────────────────────────────────
const getRecentMachineData = async (req, res) => {
    try {
        const tenantId = resolveTenantId(req);
        const { id } = req.params;
        const limit = Math.min(Number(req.query.limit) || 10, 100);

        const connector = await MachineConnector.findOne({ _id: id, tenantId }).lean();
        if (!connector) {
            return res.status(404).json({ success: false, message: "Machine connector not found" });
        }

        const recent = await lisdata
            .find({ "lisData._connectorId": String(id) })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        return res.status(200).json({
            success: true,
            data: recent,
            total: recent.length
        });
    } catch (error) {
        console.error("[MachineConnector] getRecentMachineData error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

export {
    createMachineConnector,
    listMachineConnectors,
    getMachineConnectorById,
    updateMachineConnector,
    deleteMachineConnector,
    toggleMachineConnector,
    ingestMachineData,
    testMachineConnection,
    getRecentMachineData
};
