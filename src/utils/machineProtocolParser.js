/**
 * Machine Protocol Parser for Laboratory Analyzers
 * 
 * Supports:
 * - ASTM E1381 / E1394 (Sysmex, Mindray, Erba, Beckman, Horiba, etc.)
 * - HL7 v2.x (Mindray, Roche, Abbott, Siemens, Sysmex XN)
 * - CSV / Delimited data
 * - Raw JSON payload
 */

/**
 * Clean control characters from frame (STX, ETX, EOT, ENQ, ACK, NAK, CR, LF)
 */
function cleanControlChars(str) {
    if (typeof str !== "string") return "";
    return str
        .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
}

/**
 * Parse an ASTM E1394 string into a structured object:
 * {
 *   sample_id: "...",
 *   patient: { id, name, ... },
 *   results: { WBC: "7.2", HGB: "14.1", ... },
 *   units: { WBC: "10^3/uL", ... },
 *   flags: { WBC: "N", ... },
 *   rawSegments: [ ... ]
 * }
 */
export function parseASTM(rawMessage) {
    if (!rawMessage) return null;
    const cleaned = cleanControlChars(rawMessage);
    const lines = cleaned.split("\n").map(l => l.trim()).filter(Boolean);

    let sample_id = "";
    const results = {};
    const units = {};
    const flags = {};
    const patient = {};
    let currentOrder = null;

    for (const line of lines) {
        // ASTM lines start with record type indicator, e.g. H|, P|, O|, R|, C|, L|
        // Sometimes preceded by frame number e.g. "2R|1|..."
        const match = line.match(/^(?:\d+)?([HPORCLQ])\|(.*)$/);
        if (!match) continue;

        const recordType = match[1];
        const recordContent = match[2];
        const fields = recordContent.split("|");

        switch (recordType) {
            case "H": // Header: delimiters are usually defined in first field \^&
                break;

            case "P": // Patient Record: P|Seq|ID|ExtID|...|Name|...
                patient.sequence = fields[0] || "";
                patient.id = fields[1] || fields[2] || "";
                if (fields[4]) patient.name = fields[4].replace(/\^/g, " ").trim();
                break;

            case "O": // Order Record: O|Seq|SampleID|...|TestID|...
                currentOrder = fields[1] || fields[2] || "";
                // Sometimes sample ID has subfields e.g. "12345^^^"
                if (currentOrder) {
                    sample_id = currentOrder.split("^")[0].trim();
                }
                break;

            case "R": // Result Record: R|Seq|UniversalTestID|Value|Units|RefRange|AbnormalFlags|...
                {
                    const testIdentifier = fields[1] || "";
                    const value = fields[2] !== undefined ? fields[2].trim() : "";
                    const unit = fields[3] !== undefined ? fields[3].trim() : "";
                    const abnormalFlag = fields[5] !== undefined ? fields[5].trim() : "";

                    // Universal Test ID is often formatted as ^^^TEST_KEY^ or ^^TEST_KEY or just TEST_KEY
                    let testKey = testIdentifier;
                    if (testIdentifier.includes("^")) {
                        const subparts = testIdentifier.split("^").map(p => p.trim()).filter(Boolean);
                        // Usually the code is the 1st or last non-empty part
                        testKey = subparts[subparts.length - 1] || subparts[0] || testIdentifier;
                    }
                    testKey = testKey.trim();

                    if (testKey && value !== "") {
                        results[testKey] = value;
                        if (unit) units[testKey] = unit;
                        if (abnormalFlag) flags[testKey] = abnormalFlag;
                    }
                }
                break;

            case "L": // Terminator
                break;
        }
    }

    if (!sample_id && patient.id) {
        sample_id = patient.id;
    }

    return {
        protocol: "ASTM",
        sample_id,
        patient,
        results,
        units,
        flags
    };
}

/**
 * Parse an HL7 v2.x string into a structured object
 */
export function parseHL7(rawMessage) {
    if (!rawMessage) return null;
    const cleaned = cleanControlChars(rawMessage);
    const segments = cleaned.split("\n").map(s => s.trim()).filter(Boolean);

    let sample_id = "";
    const results = {};
    const units = {};
    const flags = {};
    const patient = {};

    for (const segment of segments) {
        if (!segment) continue;
        const fields = segment.split("|");
        const segName = fields[0];

        if (segName === "PID") {
            // Patient ID in PID-2, PID-3, or PID-4
            patient.id = fields[2] || fields[3] || "";
            if (fields[5]) patient.name = fields[5].replace(/\^/g, " ").trim();
        } else if (segName === "OBR") {
            // Order details: OBR-2 Placer Order Number, OBR-3 Filler Order Number (Sample ID)
            const obrSample = fields[3] || fields[2] || "";
            if (obrSample) {
                sample_id = obrSample.split("^")[0].trim();
            }
        } else if (segName === "OBX") {
            // OBX-3: Identifier (e.g., ^^^WBC or WBC^White Blood Count)
            // OBX-5: Value
            // OBX-6: Units
            // OBX-8: Abnormal Flag
            const testIdentifier = fields[3] || "";
            const value = fields[5] !== undefined ? fields[5].trim() : "";
            const unit = fields[6] !== undefined ? fields[6].trim() : "";
            const abnormalFlag = fields[8] !== undefined ? fields[8].trim() : "";

            let testKey = testIdentifier;
            if (testIdentifier.includes("^")) {
                const subparts = testIdentifier.split("^").map(p => p.trim()).filter(Boolean);
                testKey = subparts[0] || subparts[1] || testIdentifier;
            }
            testKey = testKey.trim();

            if (testKey && value !== "") {
                results[testKey] = value;
                if (unit) units[testKey] = unit;
                if (abnormalFlag) flags[testKey] = abnormalFlag;
            }
        }
    }

    if (!sample_id && patient.id) {
        sample_id = patient.id;
    }

    return {
        protocol: "HL7",
        sample_id,
        patient,
        results,
        units,
        flags
    };
}

/**
 * Auto-detect protocol and parse message
 */
export function autoParseMachineData(rawInput) {
    if (!rawInput) return null;

    // If it's already an object (and not a buffer or string)
    if (typeof rawInput === "object" && !Buffer.isBuffer(rawInput)) {
        // If it's a wrapper like { rawData: "..." }
        if (typeof rawInput.rawData === "string") {
            return autoParseMachineData(rawInput.rawData);
        }
        return {
            protocol: "JSON",
            sample_id: rawInput.sample_id || rawInput.sampleId || rawInput.SampleID || rawInput.Sample_ID || rawInput.barcode || rawInput.sid || "",
            results: rawInput
        };
    }

    const str = String(rawInput).trim();

    // Check if JSON string
    if (str.startsWith("{") && str.endsWith("}")) {
        try {
            const parsed = JSON.parse(str);
            return autoParseMachineData(parsed);
        } catch (_) {
            // Not JSON, continue to other protocols
        }
    }

    // Check for ASTM: contains H| or starts with H| or \x02H|
    if (/(?:^|\n)(?:\d+)?H\|/.test(str) || str.startsWith("H|")) {
        return parseASTM(str);
    }

    // Check for HL7: starts with MSH|
    if (str.startsWith("MSH|") || str.includes("\nMSH|")) {
        return parseHL7(str);
    }

    // CSV format fallback (SampleID,Param1,Param2...)
    if (str.includes(",") && str.includes("\n")) {
        const lines = str.split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length >= 2) {
            const headers = lines[0].split(",").map(h => h.trim());
            const values = lines[1].split(",").map(v => v.trim());
            const results = {};
            let sample_id = "";

            headers.forEach((h, idx) => {
                const val = values[idx] || "";
                if (/^(sample_?id|barcode|sid)$/i.test(h)) {
                    sample_id = val;
                } else {
                    results[h] = val;
                }
            });

            return {
                protocol: "CSV",
                sample_id,
                results
            };
        }
    }

    return null;
}

