#!/usr/bin/env node

/**
 * ============================================================================
 * LabFlowLIS — Universal Laboratory Machine Bridge (Local Middleware)
 * ============================================================================
 * 
 * This standalone script runs on the laboratory computer connected to your 
 * pathology analyzers (Sysmex, Mindray, Erba, Transasia, Horiba, etc.) via 
 * Ethernet LAN cable or RS-232 serial converter.
 * 
 * Features:
 *   - Zero external dependencies (uses standard Node.js libraries: net, http, https, fs)
 *   - Listens on TCP/IP port as a Server (handles ASTM E1381/E1394 and HL7 v2)
 *   - Automatically sends ACK (\x06) to analyzers so they confirm data transfer
 *   - Automatically parses ASTM (H, P, O, R, L) and HL7 (MSH, PID, OBR, OBX)
 *   - Posts parsed results directly to your LabFlowLIS cloud instance
 *   - Supports file-watch mode for analyzers that export text/CSV files to a folder
 * 
 * Usage:
 *   node labflow-machine-bridge.js --port 5000 --ingestUrl https://labflowlis.com/api/v1/user/machine-connectors/ingest/<YOUR_CONNECTOR_ID>
 * 
 * Or test locally:
 *   node labflow-machine-bridge.js --port 5000 --ingestUrl http://localhost:8000/api/v1/user/get-result
 * ============================================================================
 */

import net from "net";
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";

// ── Control Characters ───────────────────────────────────────────────────────
const CHARS = {
    ENQ: Buffer.from([0x05]), // Enquiry
    ACK: Buffer.from([0x06]), // Acknowledge
    NAK: Buffer.from([0x15]), // Negative Acknowledge
    STX: 0x02,                // Start of Text
    ETX: 0x03,                // End of Text
    EOT: Buffer.from([0x04]), // End of Transmission
    CR:  0x0d,
    LF:  0x0a
};

// ── CLI Arguments ────────────────────────────────────────────────────────────
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        port: 5000,
        host: "0.0.0.0",
        ingestUrl: "",
        watchDir: "",
        pollInterval: 2000
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--port" && args[i + 1]) options.port = parseInt(args[++i], 10);
        else if (arg === "--host" && args[i + 1]) options.host = args[++i];
        else if (arg === "--ingestUrl" && args[i + 1]) options.ingestUrl = args[++i];
        else if (arg === "--watchDir" && args[i + 1]) options.watchDir = args[++i];
    }

    return options;
}

const config = parseArgs();

// ── Logging helper ───────────────────────────────────────────────────────────
function log(msg, type = "info") {
    const time = new Date().toLocaleTimeString();
    const prefix = {
        info:    "\x1b[36m[INFO]\x1b[0m",
        success: "\x1b[32m[SUCCESS]\x1b[0m",
        warn:    "\x1b[33m[WARN]\x1b[0m",
        error:   "\x1b[31m[ERROR]\x1b[0m",
        data:    "\x1b[35m[MACHINE-DATA]\x1b[0m"
    }[type] || "[LOG]";

    console.log(`[${time}] ${prefix} ${msg}`);
}

// ── HTTP Post Helper ─────────────────────────────────────────────────────────
function sendToLabFlow(payload, callback) {
    if (!config.ingestUrl) {
        log("No --ingestUrl specified. Data saved locally only.", "warn");
        return;
    }

    try {
        const url = new URL(config.ingestUrl);
        const dataStr = JSON.stringify(payload);
        const isHttps = url.protocol === "https:";
        const client = isHttps ? https : http;

        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(dataStr)
            },
            timeout: 10000
        };

        const req = client.request(options, (res) => {
            let body = "";
            res.on("data", chunk => body += chunk);
            res.on("end", () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    log(`Data successfully uploaded to LabFlowLIS! (Status: ${res.statusCode})`, "success");
                    if (callback) callback(null, body);
                } else {
                    log(`LabFlowLIS server responded with status: ${res.statusCode} — ${body}`, "error");
                    if (callback) callback(new Error(`Server error: ${res.statusCode}`));
                }
            });
        });

        req.on("error", (err) => {
            log(`Failed to send data to LabFlowLIS: ${err.message}`, "error");
            if (callback) callback(err);
        });

        req.write(dataStr);
        req.end();
    } catch (err) {
        log(`Invalid ingestUrl: ${err.message}`, "error");
    }
}

// ── ASTM E1394 Parser ────────────────────────────────────────────────────────
function parseASTM(rawText) {
    const cleanText = rawText
        .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    const lines = cleanText.split("\n").map(l => l.trim()).filter(Boolean);
    let sample_id = "";
    const results = {};

    for (const line of lines) {
        const match = line.match(/^(?:\d+)?([HPORCLQ])\|(.*)$/);
        if (!match) continue;

        const recType = match[1];
        const fields = match[2].split("|");

        if (recType === "P") {
            if (!sample_id) sample_id = fields[1] || fields[2] || "";
        } else if (recType === "O") {
            const rawSample = fields[1] || fields[2] || "";
            if (rawSample) {
                sample_id = rawSample.split("^")[0].trim();
            }
        } else if (recType === "R") {
            const testIdRaw = fields[1] || "";
            const value = fields[2] !== undefined ? fields[2].trim() : "";

            let testKey = testIdRaw;
            if (testIdRaw.includes("^")) {
                const parts = testIdRaw.split("^").map(p => p.trim()).filter(Boolean);
                testKey = parts[parts.length - 1] || parts[0] || testIdRaw;
            }
            testKey = testKey.trim();

            if (testKey && value !== "") {
                results[testKey] = value;
            }
        }
    }

    return {
        sample_id: sample_id.trim(),
        results
    };
}

// ── HL7 Parser ───────────────────────────────────────────────────────────────
function parseHL7(rawText) {
    const segments = rawText.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
    let sample_id = "";
    const results = {};

    for (const seg of segments) {
        const fields = seg.split("|");
        const name = fields[0];

        if (name === "PID") {
            if (!sample_id) sample_id = (fields[2] || fields[3] || "").trim();
        } else if (name === "OBR") {
            const sample = (fields[3] || fields[2] || "").trim();
            if (sample) sample_id = sample.split("^")[0].trim();
        } else if (name === "OBX") {
            const testIdentifier = fields[3] || "";
            const value = (fields[5] || "").trim();

            let testKey = testIdentifier;
            if (testIdentifier.includes("^")) {
                const parts = testIdentifier.split("^").map(p => p.trim()).filter(Boolean);
                testKey = parts[0] || parts[1] || testIdentifier;
            }
            testKey = testKey.trim();

            if (testKey && value !== "") {
                results[testKey] = value;
            }
        }
    }

    return {
        sample_id: sample_id.trim(),
        results
    };
}

// ── Process Complete Message ─────────────────────────────────────────────────
function processIncomingData(buffer) {
    const raw = buffer.toString("utf8");
    log(`Raw data received (${buffer.length} bytes)`, "data");

    let parsed = null;

    if (raw.includes("MSH|")) {
        log("Detected HL7 protocol format", "info");
        parsed = parseHL7(raw);
    } else if (/(?:^|\n)(?:\d+)?[HPORCLQ]\|/.test(raw) || raw.includes("H|")) {
        log("Detected ASTM E1394 protocol format", "info");
        parsed = parseASTM(raw);
    } else if (raw.trim().startsWith("{") && raw.trim().endsWith("}")) {
        log("Detected JSON format", "info");
        try {
            const jsonObj = JSON.parse(raw);
            parsed = {
                sample_id: jsonObj.sample_id || jsonObj.sampleId || jsonObj.SampleID || jsonObj.barcode || "",
                results: jsonObj
            };
        } catch (_) {}
    }

    if (!parsed || Object.keys(parsed.results || {}).length === 0) {
        log("Could not extract test parameters from message.", "warn");
        return;
    }

    const payload = {
        sample_id: parsed.sample_id || "UNKNOWN_SAMPLE",
        ...parsed.results
    };

    log(`Parsed Sample ID: [${payload.sample_id}], Parameters: ${Object.keys(parsed.results).length}`, "success");
    log(`Results summary: ${JSON.stringify(parsed.results)}`, "info");

    sendToLabFlow(payload);
}

// ── TCP Server (Listens for Analyzer Connections) ────────────────────────────
function startTcpServer() {
    const server = net.createServer((socket) => {
        const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;
        log(`Analyzer machine connected: ${clientAddr}`, "info");

        let buffer = Buffer.alloc(0);

        socket.on("data", (chunk) => {
            // ASTM Handshake: If analyzer sends ENQ (0x05), reply with ACK (0x06)
            if (chunk.length === 1 && chunk[0] === 0x05) {
                log(`[${clientAddr}] Analyzer sent ENQ. Responding with ACK...`, "info");
                socket.write(CHARS.ACK);
                return;
            }

            // ASTM EOT: Transmission finished
            if (chunk.length === 1 && chunk[0] === 0x04) {
                log(`[${clientAddr}] Analyzer sent EOT (End of Transmission). Processing buffer...`, "info");
                if (buffer.length > 0) {
                    processIncomingData(buffer);
                    buffer = Buffer.alloc(0);
                }
                socket.write(CHARS.ACK);
                return;
            }

            buffer = Buffer.concat([buffer, chunk]);

            // For framed ASTM records, send ACK after each frame
            if (chunk.includes(CHARS.ETX) || chunk.includes(CHARS.LF)) {
                socket.write(CHARS.ACK);
            }

            // If HL7 or newline-terminated message, process if delimiter reached
            if (chunk.includes(0x1c) || (buffer.toString().includes("L|") && buffer.toString().endsWith("\n"))) {
                processIncomingData(buffer);
                buffer = Buffer.alloc(0);
            }
        });

        socket.on("end", () => {
            log(`Analyzer disconnected: ${clientAddr}`, "warn");
            if (buffer.length > 0) {
                processIncomingData(buffer);
                buffer = Buffer.alloc(0);
            }
        });

        socket.on("error", (err) => {
            log(`Socket error (${clientAddr}): ${err.message}`, "error");
        });
    });

    server.listen(config.port, config.host, () => {
        log(`===========================================================`, "info");
        log(`LabFlowLIS Universal Machine Bridge is RUNNING!`, "success");
        log(`Listening for Analyzers on: ${config.host}:${config.port}`, "info");
        if (config.ingestUrl) {
            log(`Forwarding results to: ${config.ingestUrl}`, "info");
        } else {
            log(`No --ingestUrl specified. Showing live data on console only.`, "warn");
        }
        log(`===========================================================`, "info");
    });

    server.on("error", (err) => {
        log(`TCP Server error: ${err.message}`, "error");
        if (err.code === "EADDRINUSE") {
            log(`Port ${config.port} is already in use. Please run with a different port, e.g.: --port 5001`, "error");
        }
    });
}

// ── File Watcher Mode (for machines exporting CSV/TXT) ────────────────────────
function startFileWatcher() {
    if (!config.watchDir) return;

    if (!fs.existsSync(config.watchDir)) {
        log(`Watch directory does not exist: ${config.watchDir}`, "error");
        return;
    }

    log(`Watching directory for machine result files: ${config.watchDir}`, "info");

    const processedFiles = new Set();

    setInterval(() => {
        try {
            const files = fs.readdirSync(config.watchDir);
            for (const file of files) {
                if (processedFiles.has(file)) continue;
                if (!file.endsWith(".txt") && !file.endsWith(".csv") && !file.endsWith(".hl7")) continue;

                const fullPath = path.join(config.watchDir, file);
                try {
                    const content = fs.readFileSync(fullPath, "utf8");
                    if (content.trim()) {
                        log(`New file detected from analyzer: ${file}`, "info");
                        processIncomingData(Buffer.from(content, "utf8"));
                        processedFiles.add(file);
                    }
                } catch (readErr) {
                    // File might still be being written by machine
                }
            }
        } catch (err) {
            log(`File watch scan error: ${err.message}`, "error");
        }
    }, config.pollInterval);
}

// ── Startup ──────────────────────────────────────────────────────────────────
startTcpServer();
startFileWatcher();

