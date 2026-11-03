import mongoose, { Schema } from "mongoose";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-schema: Per-parameter alias mapping (machine's internal key → test name)
// ─────────────────────────────────────────────────────────────────────────────
const paramMappingSchema = new Schema(
    {
        machineKey: {
            type: String,
            required: true,
            trim: true,
            description: "The exact key/field name the machine sends (e.g. 'WBC', 'HGB', 'GLU')"
        },
        testShortName: {
            type: String,
            required: true,
            trim: true,
            description: "The short-name used in LabFlowLIS test master (data-Shortname attribute)"
        },
        unit: {
            type: String,
            trim: true,
            default: ""
        },
        notes: {
            type: String,
            trim: true,
            default: ""
        }
    },
    { _id: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Machine Connector Schema
// ─────────────────────────────────────────────────────────────────────────────
const machineConnectorSchema = new Schema(
    {
        // ── Tenant isolation ─────────────────────────────────────────────────
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tenant",
            required: true,
            index: true
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        // ── Machine identification ────────────────────────────────────────────
        machineName: {
            type: String,
            required: true,
            trim: true,
            description: "Friendly name e.g. 'Sysmex XP-100 (Main Lab)'"
        },
        machineType: {
            type: String,
            required: true,
            enum: [
                "hematology",       // CBC analyzers: Sysmex, Mindray BC, Horiba
                "biochemistry",     // Chemistry: Erba, Transasia, Mindray BS
                "urine_analyzer",   // Urine: Dirui, Mejer, Siemens Clinitek
                "immunoassay",      // ELISA / CLIA: Mindray CL, DiaSorin
                "coagulation",      // Coagulation: Stago, Sysmex CA
                "microbiology",     // ID/AST: BioMérieux VITEK
                "thyroid",          // TSH/FT3/FT4 analyzers
                "electrolyte",      // ISE analyzers: Roche, Medica
                "blood_gas",        // ABG: Radiometer, IL GEM
                "other"             // Custom / unknown
            ]
        },
        manufacturer: {
            type: String,
            trim: true,
            default: "",
            description: "e.g. 'Sysmex', 'Mindray', 'Erba', 'Transasia'"
        },
        modelNumber: {
            type: String,
            trim: true,
            default: "",
            description: "e.g. 'XP-100', 'BC-5150', 'Chem 5'"
        },

        // ── Communication settings ────────────────────────────────────────────
        connectionType: {
            type: String,
            required: true,
            enum: ["tcpip", "serial_rs232", "file_watch"],
            default: "tcpip"
        },

        // TCP/IP settings (used when connectionType === 'tcpip')
        tcpHost: {
            type: String,
            trim: true,
            default: "",
            description: "IP address of the analyzer machine on LAN"
        },
        tcpPort: {
            type: Number,
            min: 1,
            max: 65535,
            default: null,
            description: "TCP port the machine listens on (or that our server listens on)"
        },
        tcpMode: {
            type: String,
            enum: ["server", "client"],
            default: "server",
            description: "server = LabFlowLIS listens; client = LabFlowLIS connects TO machine"
        },

        // Serial / RS-232 settings (used when connectionType === 'serial_rs232')
        serialPort: {
            type: String,
            trim: true,
            default: "",
            description: "e.g. 'COM3' or '/dev/ttyUSB0'"
        },
        baudRate: {
            type: Number,
            enum: [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200],
            default: 9600
        },
        dataBits: {
            type: Number,
            enum: [5, 6, 7, 8],
            default: 8
        },
        stopBits: {
            type: Number,
            enum: [1, 1.5, 2],
            default: 1
        },
        parity: {
            type: String,
            enum: ["none", "even", "odd", "mark", "space"],
            default: "none"
        },

        // File-watch settings (CSV / flat-file output from machine)
        watchDirectory: {
            type: String,
            trim: true,
            default: "",
            description: "Directory path to watch for machine-output files"
        },
        filePattern: {
            type: String,
            trim: true,
            default: "*.txt",
            description: "Glob pattern for files to pick up"
        },

        // ── Data protocol ─────────────────────────────────────────────────────
        protocol: {
            type: String,
            required: true,
            enum: ["astm_e1394", "hl7_v2", "json_rest", "csv_flat", "custom"],
            default: "astm_e1394",
            description: "Wire protocol spoken by this machine"
        },
        sampleIdField: {
            type: String,
            trim: true,
            default: "sample_id",
            description: "Key in the parsed packet that carries the barcode/sample ID"
        },

        // ── Param mapping (machine key → test short-name) ─────────────────────
        paramMappings: {
            type: [paramMappingSchema],
            default: []
        },

        // ── Status & runtime ──────────────────────────────────────────────────
        isActive: {
            type: Boolean,
            default: true,
            description: "Whether this machine connection is enabled"
        },
        connectionStatus: {
            type: String,
            enum: ["connected", "disconnected", "error", "unknown"],
            default: "unknown"
        },
        lastDataReceivedAt: {
            type: Date,
            default: null
        },
        lastDataReceivedCount: {
            type: Number,
            default: 0
        },
        lastError: {
            type: String,
            default: ""
        },

        // ── Notes ─────────────────────────────────────────────────────────────
        notes: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

machineConnectorSchema.index({ tenantId: 1, isActive: 1 });
machineConnectorSchema.index({ tenantId: 1, tcpPort: 1 });

const MachineConnector = mongoose.model("MachineConnector", machineConnectorSchema);

export { MachineConnector };

