/* ============================================================
   machineConnector.js — LabFlowLIS Machine Connector Page
   ============================================================ */

(function () {
    "use strict";

    // ── Config ───────────────────────────────────────────────────────────────
    const BASE_URL = window.BASE_URL || "";
    const API      = `${BASE_URL}/api/v1/user/machine-connectors`;

    // ── Presets for instant configuration ─────────────────────────────────────
    const PRESETS = {
        sysmex_cbc: [
            { machineKey: "WBC", testShortName: "TLC", unit: "10^3/uL" },
            { machineKey: "RBC", testShortName: "RBC", unit: "10^6/uL" },
            { machineKey: "HGB", testShortName: "Hb", unit: "g/dL" },
            { machineKey: "HCT", testShortName: "HCT", unit: "%" },
            { machineKey: "MCV", testShortName: "MCV", unit: "fL" },
            { machineKey: "MCH", testShortName: "MCH", unit: "pg" },
            { machineKey: "MCHC", testShortName: "MCHC", unit: "g/dL" },
            { machineKey: "PLT", testShortName: "Platelet Count", unit: "10^3/uL" },
            { machineKey: "NEUT%", testShortName: "Neutrophils", unit: "%" },
            { machineKey: "LYMPH%", testShortName: "Lymphocytes", unit: "%" },
            { machineKey: "MONO%", testShortName: "Monocytes", unit: "%" },
            { machineKey: "EO%", testShortName: "Eosinophils", unit: "%" },
            { machineKey: "BASO%", testShortName: "Basophils", unit: "%" },
            { machineKey: "RDW-CV", testShortName: "RDW-CV", unit: "%" },
            { machineKey: "RDW-SD", testShortName: "RDW-SD", unit: "fL" },
            { machineKey: "PDW", testShortName: "PDW", unit: "fL" },
            { machineKey: "MPV", testShortName: "MPV", unit: "fL" },
            { machineKey: "P-LCR", testShortName: "P-LCR", unit: "%" }
        ],
        mindray_cbc: [
            { machineKey: "WBC", testShortName: "TLC", unit: "10^9/L" },
            { machineKey: "Neu%", testShortName: "Neutrophils", unit: "%" },
            { machineKey: "Lym%", testShortName: "Lymphocytes", unit: "%" },
            { machineKey: "Mon%", testShortName: "Monocytes", unit: "%" },
            { machineKey: "Eos%", testShortName: "Eosinophils", unit: "%" },
            { machineKey: "Bas%", testShortName: "Basophils", unit: "%" },
            { machineKey: "RBC", testShortName: "RBC", unit: "10^12/L" },
            { machineKey: "HGB", testShortName: "Hb", unit: "g/dL" },
            { machineKey: "HCT", testShortName: "HCT", unit: "%" },
            { machineKey: "MCV", testShortName: "MCV", unit: "fL" },
            { machineKey: "MCH", testShortName: "MCH", unit: "pg" },
            { machineKey: "MCHC", testShortName: "MCHC", unit: "g/dL" },
            { machineKey: "PLT", testShortName: "Platelet Count", unit: "10^9/L" }
        ],
        erba_biochem: [
            { machineKey: "GLU", testShortName: "Glucose Fasting", unit: "mg/dL" },
            { machineKey: "UREA", testShortName: "Serum Urea", unit: "mg/dL" },
            { machineKey: "CREA", testShortName: "Serum Creatinine", unit: "mg/dL" },
            { machineKey: "URIC", testShortName: "Uric Acid", unit: "mg/dL" },
            { machineKey: "CHOL", testShortName: "Total Cholesterol", unit: "mg/dL" },
            { machineKey: "TRIG", testShortName: "Triglycerides", unit: "mg/dL" },
            { machineKey: "HDL", testShortName: "HDL Cholesterol", unit: "mg/dL" },
            { machineKey: "SGOT", testShortName: "SGOT (AST)", unit: "U/L" },
            { machineKey: "SGPT", testShortName: "SGPT (ALT)", unit: "U/L" },
            { machineKey: "BILT", testShortName: "Serum Bilirubin (Total)", unit: "mg/dL" },
            { machineKey: "BILD", testShortName: "Serum Bilirubin (Direct)", unit: "mg/dL" },
            { machineKey: "PROT", testShortName: "Serum Protein", unit: "g/dL" },
            { machineKey: "ALB", testShortName: "Serum Albumin", unit: "g/dL" }
        ],
        urine_routine: [
            { machineKey: "GLU", testShortName: "Urine Glucose", unit: "" },
            { machineKey: "PRO", testShortName: "Urine Protein", unit: "" },
            { machineKey: "BIL", testShortName: "Urine Bilirubin", unit: "" },
            { machineKey: "URO", testShortName: "Urobilinogen", unit: "" },
            { machineKey: "PH", testShortName: "Urine pH", unit: "" },
            { machineKey: "SG", testShortName: "Specific Gravity", unit: "" },
            { machineKey: "BLD", testShortName: "Blood in Urine", unit: "" },
            { machineKey: "KET", testShortName: "Ketone", unit: "" },
            { machineKey: "NIT", testShortName: "Nitrite", unit: "" },
            { machineKey: "LEU", testShortName: "Leukocytes", unit: "" }
        ],
        electrolytes: [
            { machineKey: "NA", testShortName: "Sodium (Na+)", unit: "mmol/L" },
            { machineKey: "K", testShortName: "Potassium (K+)", unit: "mmol/L" },
            { machineKey: "CL", testShortName: "Chloride (Cl-)", unit: "mmol/L" },
            { machineKey: "CA", testShortName: "Ionized Calcium (Ca++)", unit: "mmol/L" }
        ]
    };

    // ── Simulation Payloads ──────────────────────────────────────────────────
    const SIM_TEMPLATES = {
        cbc: {
            WBC: "7.4",
            RBC: "4.8",
            HGB: "14.2",
            HCT: "42.5",
            MCV: "88.5",
            MCH: "29.6",
            MCHC: "33.4",
            PLT: "235",
            "NEUT%": "62",
            "LYMPH%": "28",
            "MONO%": "6",
            "EO%": "3",
            "BASO%": "1"
        },
        biochem: {
            GLU: "104",
            UREA: "28",
            CREA: "0.9",
            URIC: "5.2",
            CHOL: "185",
            TRIG: "140",
            HDL: "48",
            SGOT: "24",
            SGPT: "28",
            BILT: "0.8",
            BILD: "0.2",
            PROT: "7.2",
            ALB: "4.3"
        },
        urine: {
            GLU: "Negative",
            PRO: "Nil",
            PH: "6.5",
            SG: "1.020",
            BLD: "Negative",
            KET: "Negative",
            LEU: "Negative"
        },
        custom: {
            Hb: "13.8",
            TLC: "6800",
            Platelet: "210000"
        }
    };

    // ── Utility helpers ──────────────────────────────────────────────────────
    function toast(msg, type = "success", ms = 3200) {
        const host = document.getElementById("toastHost");
        if (!host) return;
        const el = document.createElement("div");
        el.className = `toast toast-${type}`;
        el.textContent = msg;
        host.appendChild(el);
        setTimeout(() => el.remove(), ms);
    }

    function fmt(d) {
        if (!d) return "—";
        return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    // ── Machine type config ──────────────────────────────────────────────────
    const MACHINE_TYPE_META = {
        hematology:    { label: "Hematology",    icon: "fa-droplet",        color: "#e53935", bg: "#ffebee" },
        biochemistry:  { label: "Biochemistry",  icon: "fa-flask",          color: "#1565c0", bg: "#e3f2fd" },
        urine_analyzer:{ label: "Urine Analyzer",icon: "fa-vial",           color: "#6a1b9a", bg: "#f3e5f5" },
        immunoassay:   { label: "Immunoassay",   icon: "fa-syringe",        color: "#00838f", bg: "#e0f7fa" },
        coagulation:   { label: "Coagulation",   icon: "fa-heart-pulse",    color: "#ad1457", bg: "#fce4ec" },
        microbiology:  { label: "Microbiology",  icon: "fa-bacterium",      color: "#558b2f", bg: "#f1f8e9" },
        thyroid:       { label: "Thyroid",       icon: "fa-person-circle-check", color: "#ef6c00", bg: "#fff3e0" },
        electrolyte:   { label: "Electrolyte",   icon: "fa-bolt",           color: "#1976d2", bg: "#e3f2fd" },
        blood_gas:     { label: "Blood Gas",     icon: "fa-lungs",          color: "#b71c1c", bg: "#ffebee" },
        other:         { label: "Other",         icon: "fa-microchip",      color: "#546e7a", bg: "#eceff1" }
    };

    const STATUS_META = {
        connected:    { label: "Connected",    dotColor: "#2e9b57", cls: "badge-success" },
        disconnected: { label: "Disconnected", dotColor: "#9e9e9e", cls: "badge-muted"   },
        error:        { label: "Error",        dotColor: "#c62828", cls: "badge-danger"  },
        unknown:      { label: "Unknown",      dotColor: "#f39c12", cls: "badge-warn"    }
    };

    // ── Machine instruction cards ────────────────────────────────────────────
    const INSTRUCTIONS = [
        {
            title: "🔬 Sysmex XP-100 / XN-Series (Hematology)",
            color: "#1565c0", bg: "#e3f2fd",
            steps: [
                "On the analyzer, go to <strong>[Setting] → [Output Setting] → [Host Computer]</strong>.",
                "Enable <strong>[Connect to Host Computer]</strong> and select <strong>[TCP/IP Connection]</strong>.",
                "Enter the <strong>LabFlowLIS server IP address</strong> and the <strong>port number</strong> you configured (e.g. 5000).",
                "Set <strong>Communication Format</strong> to <strong>ASTM</strong> and <strong>ASTM Rev</strong> to <code>1381-02</code>.",
                "Click Save. The machine will push results to LabFlowLIS automatically after each run.",
                "In LabFlowLIS, select Quick Preset: <strong>Sysmex XP / XN</strong> to automatically populate all 18 parameter mappings."
            ]
        },
        {
            title: "🧬 Mindray BC-5150 / BC-5380 (Hematology)",
            color: "#1b5e20", bg: "#e8f5e9",
            steps: [
                "On the BC-5150 touchscreen, go to <strong>Settings → LIS Communication</strong>.",
                "Assign a <strong>static IP</strong> to the analyzer (e.g. <code>192.168.1.50</code>) matching your network.",
                "Set <strong>Server Port</strong> to <code>5100</code> (or matching port configured in LabFlowLIS).",
                "Set <strong>Protocol</strong> to <strong>ASTM</strong>.",
                "In LabFlowLIS Machine Connector: Connection Type = TCP/IP, Mode = Server, Port = 5100.",
                "Select Quick Preset: <strong>Mindray BC-5150</strong> to map WBC, Neu%, Lym%, RBC, Hb, Platelets, etc."
            ]
        },
        {
            title: "⚗️ Erba Chem 5 / Mannheim XL (Biochemistry)",
            color: "#4a148c", bg: "#f3e5f5",
            steps: [
                "Older Erba Chem analyzers use <strong>RS-232 Serial (DB9 cable)</strong>. Connect via USB-to-Serial adapter or RS-232 to Ethernet converter.",
                "If using an <strong>Ethernet converter</strong> (Moxa NPort / USR-TCP232): Set converter to TCP Server mode on a free port (e.g. <code>4001</code>).",
                "In LabFlowLIS: Connection Type = Serial/RS-232. Baud Rate = <code>9600</code>, Data Bits = <code>8</code>, Parity = <code>None</code>, Stop Bits = <code>1</code>.",
                "Or use File Watch: Erba Chem can export results as text files to a directory; configure Watch Directory in LabFlowLIS.",
                "Select Quick Preset: <strong>Erba Chem (Biochemistry)</strong> to map Sugar, Urea, Creatinine, LFT, and Lipids."
            ]
        },
        {
            title: "🔬 Transasia EM-200 / XL-300 (Biochemistry)",
            color: "#e65100", bg: "#fff3e0",
            steps: [
                "In the analyzer's <strong>LIS Setup</strong> menu, enable network output.",
                "Enter the <strong>Host IP</strong> (LabFlowLIS server IP) and <strong>Port</strong> (e.g. <code>5001</code>).",
                "Select Protocol: <strong>ASTM</strong> or <strong>HL7</strong> depending on your model.",
                "In LabFlowLIS Machine Connector: set TCP Mode = Server, add matching port.",
                "Select Quick Preset: <strong>Erba Chem / Biochemistry</strong> for standard clinical chemistry mappings."
            ]
        },
        {
            title: "🩺 Siemens Clinitek Advantus / Dirui (Urine)",
            color: "#006064", bg: "#e0f7fa",
            steps: [
                "Connect the analyzer to the same LAN network as the LabFlowLIS server.",
                "In analyzer settings, enable <strong>Host Interface</strong> and set <strong>IP + Port</strong>.",
                "For Dirui CS-T240/CS-600: Go to <strong>System Settings → Communication → TCP/IP</strong>.",
                "In LabFlowLIS: Protocol = ASTM or CSV. Select Quick Preset: <strong>Urine Routine (10 Tests)</strong>.",
                "Ensure Windows Firewall allows the configured port through."
            ]
        },
        {
            title: "🌐 General TCP/IP & Local Bridge Setup",
            color: "#37474f", bg: "#eceff1",
            steps: [
                "<strong>Local Bridge:</strong> If LabFlowLIS is cloud-hosted and your machine is on a private local LAN, download our <strong>Local Bridge Agent</strong> using the button at the top.",
                "Run the bridge on your lab PC: <code>node labflow-machine-bridge.js --port 5000 --ingestUrl [YOUR_INGEST_URL]</code>.",
                "The bridge listens to the machine on LAN and automatically forwards parsed results to your LabFlowLIS cloud instance!",
                "<strong>Verification:</strong> Click <em>Send Mock Test Data</em> at the top to simulate a sample test run and verify it on the Lab Report page in 10 seconds."
            ]
        }
    ];

    // ── State ────────────────────────────────────────────────────────────────
    let connectors = [];
    let editingId = null;

    // ── DOM refs ─────────────────────────────────────────────────────────────
    const machineModal     = document.getElementById("machineModal");
    const detailModal      = document.getElementById("detailModal");
    const simulatorModal   = document.getElementById("simulatorModal");
    const machineForm      = document.getElementById("machineForm");
    const connectorsList   = document.getElementById("connectorsList");
    const presetSelect     = document.getElementById("fPresetSelect");

    // ── Fetch all connectors ─────────────────────────────────────────────────
    async function loadConnectors() {
        try {
            const res  = await fetch(API, { credentials: "include" });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            connectors = Array.isArray(data.data) ? data.data : [];
            renderConnectors();
            renderStats();
            populateSimulatorConnectors();
        } catch (err) {
            toast("Failed to load machine connectors: " + err.message, "error");
        }
    }

    // ── Render stats bar ─────────────────────────────────────────────────────
    function renderStats() {
        document.getElementById("statTotal").textContent    = connectors.length;
        document.getElementById("statActive").textContent   = connectors.filter(c => c.isActive).length;
        document.getElementById("statDisabled").textContent = connectors.filter(c => !c.isActive).length;
        const total = connectors.reduce((s, c) => s + (c.lastDataReceivedCount || 0), 0);
        document.getElementById("statDataCount").textContent = total.toLocaleString("en-IN");
    }

    // ── Render connector cards ───────────────────────────────────────────────
    function renderConnectors() {
        if (connectors.length === 0) {
            connectorsList.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1">
                    <i class="fa-solid fa-microscope"></i>
                    <h3>No machines added yet</h3>
                    <p>Click <strong>"Add Machine"</strong> to connect your first lab analyzer.</p>
                </div>`;
            return;
        }

        connectorsList.innerHTML = connectors.map(c => renderCard(c)).join("");

        // Attach card-level button listeners
        connectors.forEach(c => {
            const id = String(c._id);
            document.getElementById(`btn-edit-${id}`)?.addEventListener("click", () => openEdit(c));
            document.getElementById(`btn-toggle-${id}`)?.addEventListener("click", () => toggleConnector(id, c.isActive));
            document.getElementById(`btn-delete-${id}`)?.addEventListener("click", () => deleteConnector(id, c.machineName));
            document.getElementById(`btn-detail-${id}`)?.addEventListener("click", () => openDetail(id));
        });
    }

    function renderCard(c) {
        const id     = String(c._id);
        const type   = MACHINE_TYPE_META[c.machineType] || MACHINE_TYPE_META.other;
        const status = STATUS_META[c.connectionStatus || "unknown"];
        const connTag = c.connectionType === "tcpip" ? "TCP/IP" : c.connectionType === "serial_rs232" ? "RS-232" : "File Watch";
        const proto   = { astm_e1394: "ASTM", hl7_v2: "HL7 v2", json_rest: "JSON", csv_flat: "CSV", custom: "Custom" }[c.protocol] || c.protocol;
        const lastData = c.lastDataReceivedAt ? fmt(c.lastDataReceivedAt) : "No data yet";

        return `
        <div class="connector-card ${c.isActive ? "active" : "inactive"}">
            <div class="connector-card-top">
                <div class="machine-icon" style="background:${type.bg};color:${type.color}">
                    <i class="fa-solid ${type.icon}"></i>
                </div>
                <div class="connector-meta" style="flex:1;min-width:0">
                    <h3>${escHtml(c.machineName)}</h3>
                    <div class="meta-row"><i class="fa-solid fa-tag"></i> ${type.label} · ${escHtml(c.manufacturer || "")} ${escHtml(c.modelNumber || "")}</div>
                    <div class="meta-row"><i class="fa-solid fa-network-wired"></i> ${connTag} · ${proto}</div>
                    ${c.connectionType === "tcpip" && c.tcpPort ? `<div class="meta-row"><i class="fa-solid fa-ethernet"></i> Port: <strong>${c.tcpPort}</strong> (${c.tcpMode})</div>` : ""}
                    ${c.connectionType === "serial_rs232" && c.serialPort ? `<div class="meta-row"><i class="fa-solid fa-plug"></i> ${escHtml(c.serialPort)} @ ${c.baudRate} baud</div>` : ""}
                    <div class="meta-row"><i class="fa-solid fa-clock-rotate-left"></i> Last data: ${lastData}</div>
                    <div class="meta-row"><i class="fa-solid fa-database"></i> Records: ${(c.lastDataReceivedCount || 0).toLocaleString("en-IN")}</div>
                </div>
            </div>
            <div class="connector-status-strip" style="background:${c.isActive ? "#f0fdf4" : "#fef2f2"}">
                <span class="status-dot" style="background:${status.dotColor}"></span>
                <span class="badge ${status.cls}">${status.label}</span>
                ${!c.isActive ? '<span style="margin-left:6px;color:#c62828;font-size:11px;">— DISABLED</span>' : ""}
                ${c.paramMappings?.length ? `<span style="margin-left:auto" class="badge badge-info"><i class="fa-solid fa-arrows-turn-to-dots"></i> ${c.paramMappings.length} mappings</span>` : ""}
            </div>
            <div class="connector-card-actions">
                <button class="btn btn-primary btn-sm" id="btn-detail-${id}">
                    <i class="fa-solid fa-circle-info"></i> Details & URL
                </button>
                <button class="btn btn-ghost btn-sm" id="btn-edit-${id}">
                    <i class="fa-solid fa-pen"></i> Edit
                </button>
                <button class="btn btn-sm ${c.isActive ? "btn-warn" : "btn-success"}" id="btn-toggle-${id}">
                    <i class="fa-solid ${c.isActive ? "fa-toggle-off" : "fa-toggle-on"}"></i>
                    ${c.isActive ? "Disable" : "Enable"}
                </button>
                <button class="btn btn-danger btn-sm" id="btn-delete-${id}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>`;
    }

    function escHtml(s) {
        return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    // ── Render instructions ──────────────────────────────────────────────────
    function renderInstructions() {
        const grid = document.getElementById("instructionsGrid");
        if (!grid) return;
        grid.innerHTML = INSTRUCTIONS.map(instr => `
            <div class="instr-card">
                <div class="instr-card-head" style="background:${instr.bg};color:${instr.color}">${instr.title}</div>
                <div class="instr-card-body">
                    ${instr.steps.map((s, i) => `
                        <div class="instr-step">
                            <span class="step-num">${i + 1}</span>
                            <span>${s}</span>
                        </div>`).join("")}
                </div>
            </div>`).join("");
    }

    // ── Presets Handler ──────────────────────────────────────────────────────
    presetSelect.addEventListener("change", () => {
        const key = presetSelect.value;
        if (!key || !PRESETS[key]) return;
        const presetMappings = PRESETS[key];
        renderParamMappingRows(presetMappings);
        toast(`Loaded ${presetMappings.length} preset mappings!`, "info");
    });

    // ── Open Add modal ───────────────────────────────────────────────────────
    document.getElementById("openAddModal").addEventListener("click", () => {
        editingId = null;
        document.getElementById("modalTitle").innerHTML = '<i class="fa-solid fa-plug"></i> Add Machine Connector';
        resetForm();
        machineModal.classList.add("open");
    });

    function closeModal() { machineModal.classList.remove("open"); }
    document.getElementById("closeModal").addEventListener("click", closeModal);
    document.getElementById("cancelModal").addEventListener("click", closeModal);
    machineModal.addEventListener("click", e => { if (e.target === machineModal) closeModal(); });

    // ── Open Edit modal ──────────────────────────────────────────────────────
    function openEdit(c) {
        editingId = String(c._id);
        document.getElementById("modalTitle").innerHTML = '<i class="fa-solid fa-pen"></i> Edit Machine Connector';
        document.getElementById("fMachineName").value    = c.machineName || "";
        document.getElementById("fMachineType").value    = c.machineType || "";
        document.getElementById("fManufacturer").value   = c.manufacturer || "";
        document.getElementById("fModelNumber").value    = c.modelNumber || "";
        document.getElementById("fConnectionType").value = c.connectionType || "tcpip";
        document.getElementById("fProtocol").value       = c.protocol || "astm_e1394";
        document.getElementById("fSampleIdField").value  = c.sampleIdField || "sample_id";
        document.getElementById("fTcpHost").value        = c.tcpHost || "";
        document.getElementById("fTcpPort").value        = c.tcpPort || "";
        document.getElementById("fTcpMode").value        = c.tcpMode || "server";
        document.getElementById("fSerialPort").value     = c.serialPort || "";
        document.getElementById("fBaudRate").value       = c.baudRate || 9600;
        document.getElementById("fDataBits").value       = c.dataBits || 8;
        document.getElementById("fStopBits").value       = c.stopBits || 1;
        document.getElementById("fParity").value         = c.parity || "none";
        document.getElementById("fWatchDir").value       = c.watchDirectory || "";
        document.getElementById("fFilePattern").value    = c.filePattern || "*.txt";
        document.getElementById("fNotes").value          = c.notes || "";
        presetSelect.value = "";
        updateConnectionPanels();
        renderParamMappingRows(Array.isArray(c.paramMappings) ? c.paramMappings : []);
        machineModal.classList.add("open");
    }

    function resetForm() {
        machineForm.reset();
        presetSelect.value = "";
        document.getElementById("fSampleIdField").value = "sample_id";
        document.getElementById("fFilePattern").value   = "*.txt";
        updateConnectionPanels();
        renderParamMappingRows([]);
    }

    // ── Connection type panel switching ──────────────────────────────────────
    document.getElementById("fConnectionType").addEventListener("change", updateConnectionPanels);
    function updateConnectionPanels() {
        const val = document.getElementById("fConnectionType").value;
        document.getElementById("panelTcp").classList.toggle("show",    val === "tcpip");
        document.getElementById("panelSerial").classList.toggle("show", val === "serial_rs232");
        document.getElementById("panelFile").classList.toggle("show",   val === "file_watch");
    }

    // ── Param mapping rows ───────────────────────────────────────────────────
    function renderParamMappingRows(mappings = []) {
        const container = document.getElementById("paramMappingRows");
        container.innerHTML = `
            <table class="param-table">
                <thead><tr><th>Machine Key (e.g. WBC)</th><th>Test Short Name (e.g. TLC)</th><th>Unit</th><th></th></tr></thead>
                <tbody id="paramTbody"></tbody>
            </table>`;
        const tbody = container.querySelector("#paramTbody");
        mappings.forEach(m => addParamRow(m));
    }

    function addParamRow(data = {}) {
        let tbody = document.getElementById("paramTbody");
        if (!tbody) renderParamMappingRows([]);
        tbody = document.getElementById("paramTbody");
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><input type="text" class="pm-key"  placeholder="e.g. WBC"  value="${escHtml(data.machineKey || "")}" /></td>
            <td><input type="text" class="pm-name" placeholder="e.g. TLC"  value="${escHtml(data.testShortName || "")}" /></td>
            <td><input type="text" class="pm-unit" placeholder="e.g. 10³/µL" value="${escHtml(data.unit || "")}" style="max-width:100px" /></td>
            <td><button type="button" class="del-row-btn" title="Remove"><i class="fa-solid fa-xmark"></i></button></td>`;
        tr.querySelector(".del-row-btn").addEventListener("click", () => tr.remove());
        tbody.appendChild(tr);
    }

    document.getElementById("addParamRow").addEventListener("click", () => addParamRow());

    function collectParamMappings() {
        const rows = document.querySelectorAll("#paramTbody tr");
        const mappings = [];
        rows.forEach(tr => {
            const key  = tr.querySelector(".pm-key")?.value.trim();
            const name = tr.querySelector(".pm-name")?.value.trim();
            const unit = tr.querySelector(".pm-unit")?.value.trim();
            if (key && name) mappings.push({ machineKey: key, testShortName: name, unit: unit || "" });
        });
        return mappings;
    }

    // ── Form submit (create / update) ────────────────────────────────────────
    machineForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("saveConnectorBtn");
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

        const payload = {
            machineName:    document.getElementById("fMachineName").value.trim(),
            machineType:    document.getElementById("fMachineType").value,
            manufacturer:   document.getElementById("fManufacturer").value.trim(),
            modelNumber:    document.getElementById("fModelNumber").value.trim(),
            connectionType: document.getElementById("fConnectionType").value,
            protocol:       document.getElementById("fProtocol").value,
            sampleIdField:  document.getElementById("fSampleIdField").value.trim() || "sample_id",
            tcpHost:        document.getElementById("fTcpHost").value.trim(),
            tcpPort:        document.getElementById("fTcpPort").value ? Number(document.getElementById("fTcpPort").value) : null,
            tcpMode:        document.getElementById("fTcpMode").value,
            serialPort:     document.getElementById("fSerialPort").value.trim(),
            baudRate:       Number(document.getElementById("fBaudRate").value),
            dataBits:       Number(document.getElementById("fDataBits").value),
            stopBits:       Number(document.getElementById("fStopBits").value),
            parity:         document.getElementById("fParity").value,
            watchDirectory: document.getElementById("fWatchDir").value.trim(),
            filePattern:    document.getElementById("fFilePattern").value.trim(),
            paramMappings:  collectParamMappings(),
            notes:          document.getElementById("fNotes").value.trim()
        };

        try {
            const url    = editingId ? `${API}/${editingId}` : API;
            const method = editingId ? "PUT" : "POST";
            const res    = await fetch(url, {
                method,
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);

            toast(data.message, "success");
            closeModal();
            await loadConnectors();
        } catch (err) {
            toast("Save failed: " + err.message, "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Machine';
        }
    });

    // ── Toggle enable/disable ────────────────────────────────────────────────
    async function toggleConnector(id, currentlyActive) {
        try {
            const res  = await fetch(`${API}/${id}/toggle`, { method: "PATCH", credentials: "include" });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            toast(data.message, currentlyActive ? "warn" : "success");
            await loadConnectors();
        } catch (err) {
            toast("Toggle failed: " + err.message, "error");
        }
    }

    // ── Delete ───────────────────────────────────────────────────────────────
    async function deleteConnector(id, name) {
        if (!confirm(`Delete machine connector "${name}"? This cannot be undone.`)) return;
        try {
            const res  = await fetch(`${API}/${id}`, { method: "DELETE", credentials: "include" });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            toast("Deleted successfully", "success");
            await loadConnectors();
        } catch (err) {
            toast("Delete failed: " + err.message, "error");
        }
    }

    // ── Detail modal ─────────────────────────────────────────────────────────
    async function openDetail(id) {
        detailModal.classList.add("open");
        document.getElementById("detailModalBody").innerHTML = `<p style="text-align:center;padding:30px"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</p>`;

        try {
            const res  = await fetch(`${API}/${id}/test-connection`, { method: "POST", credentials: "include" });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);

            const d = data.data;
            document.getElementById("detailModalTitle").innerHTML = `<i class="fa-solid fa-circle-info"></i> ${escHtml(d.machineName)}`;

            const proto  = { astm_e1394: "ASTM E1394", hl7_v2: "HL7 v2.x", json_rest: "JSON REST", csv_flat: "CSV Flat", custom: "Custom" }[d.protocol] || d.protocol;
            const connT  = { tcpip: "TCP/IP", serial_rs232: "RS-232 Serial", file_watch: "File Watch" }[d.connectionType] || d.connectionType;

            document.getElementById("detailModalBody").innerHTML = `
                <div style="margin-bottom:18px">
                    <h3 style="font-size:14px;color:var(--muted);margin-bottom:8px">INGEST URL — Configure your machine / middleware to POST results to:</h3>
                    <div class="ingest-url-box">
                        <span id="ingestUrlText">${escHtml(d.ingestUrl)}</span>
                        <button onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('ingestUrlText').textContent);window.showStatusMessage?.('Copied!','success')">
                            <i class="fa-solid fa-copy"></i> Copy
                        </button>
                    </div>
                    <p style="font-size:12px;color:var(--muted);margin-top:6px">
                        This URL accepts <strong>POST</strong> requests with JSON body. Include your <strong>sample_id</strong> field and all test result fields.
                    </p>
                </div>

                <div class="form-grid" style="margin-bottom:16px">
                    <div><div class="form-hint">Connection Type</div><div style="font-weight:700">${connT}</div></div>
                    <div><div class="form-hint">Protocol</div><div style="font-weight:700">${proto}</div></div>
                    <div><div class="form-hint">Sample ID Field</div><div style="font-weight:700"><code>${escHtml(d.sampleIdField)}</code></div></div>
                    ${d.tcpPort ? `<div><div class="form-hint">TCP Port</div><div style="font-weight:700">${d.tcpPort}</div></div>` : ""}
                    <div><div class="form-hint">Last Data Received</div><div style="font-weight:700">${fmt(d.lastDataReceivedAt)}</div></div>
                    <div><div class="form-hint">Status</div><div><span class="badge ${STATUS_META[d.connectionStatus || "unknown"].cls}">${STATUS_META[d.connectionStatus || "unknown"].label}</span></div></div>
                </div>

                ${d.paramMappings && d.paramMappings.length ? `
                <h3 style="font-size:13px;font-weight:800;margin-bottom:8px">Parameter Mappings</h3>
                <table class="param-table">
                    <thead><tr><th>Machine Key</th><th>Test Short Name</th><th>Unit</th></tr></thead>
                    <tbody>${d.paramMappings.map(m => `<tr><td><code>${escHtml(m.machineKey)}</code></td><td><code>${escHtml(m.testShortName)}</code></td><td>${escHtml(m.unit || "—")}</td></tr>`).join("")}</tbody>
                </table>` : `<p style="font-size:13px;color:var(--muted)">No parameter mappings configured. Click <strong>Edit</strong> on the card to add them.</p>`}

                <div style="margin-top:20px;padding:14px;background:var(--info-bg);border-radius:8px;border:1px solid #90caf9">
                    <h4 style="font-size:13px;font-weight:800;color:var(--info);margin-bottom:6px"><i class="fa-solid fa-lightbulb"></i> How to send data to LabFlowLIS</h4>
                    <p style="font-size:12.5px;color:var(--text);line-height:1.7">
                        POST a JSON object to the Ingest URL above. The JSON must include the <strong>sample_id</strong> field (matching the patient's barcode) and any result fields using your configured machine keys.<br/><br/>
                        <strong>Example:</strong><br/>
                        <code style="background:#e3f2fd;padding:4px 8px;border-radius:4px;display:inline-block;margin-top:4px">
                            { "sample_id": "BAR12345", "WBC": "7.4", "HGB": "13.2", "PLT": "215" }
                        </code>
                    </p>
                </div>`;
        } catch (err) {
            document.getElementById("detailModalBody").innerHTML = `<p style="color:var(--danger);text-align:center;padding:20px"><i class="fa-solid fa-triangle-exclamation"></i> ${escHtml(err.message)}</p>`;
        }
    }

    document.getElementById("closeDetailModal").addEventListener("click", () => detailModal.classList.remove("open"));
    detailModal.addEventListener("click", e => { if (e.target === detailModal) detailModal.classList.remove("open"); });

    // ── Simulator Modal ──────────────────────────────────────────────────────
    const simConnectorSelect = document.getElementById("simConnectorSelect");
    const simSampleId        = document.getElementById("simSampleId");
    const simPayloadTemplate = document.getElementById("simPayloadTemplate");
    const simPayloadJson     = document.getElementById("simPayloadJson");
    const sendMockDataBtn    = document.getElementById("sendMockDataBtn");

    function populateSimulatorConnectors() {
        if (!simConnectorSelect) return;
        simConnectorSelect.innerHTML = '<option value="">— Generic API (/get-result) —</option>' +
            connectors.map(c => `<option value="${c._id}">${escHtml(c.machineName)} (${c.machineType})</option>`).join("");
    }

    function updateSimulatorJson() {
        const tplKey = simPayloadTemplate.value;
        const base = SIM_TEMPLATES[tplKey] || SIM_TEMPLATES.cbc;
        const sampleId = simSampleId.value.trim() || "SAMPLE12345";
        const full = { sample_id: sampleId, ...base };
        simPayloadJson.value = JSON.stringify(full, null, 2);
    }

    simPayloadTemplate.addEventListener("change", updateSimulatorJson);
    simSampleId.addEventListener("input", updateSimulatorJson);

    document.getElementById("openTestSimulatorBtn").addEventListener("click", () => {
        populateSimulatorConnectors();
        if (!simSampleId.value) simSampleId.value = "SAMPLE101";
        updateSimulatorJson();
        simulatorModal.classList.add("open");
    });

    function closeSimulator() { simulatorModal.classList.remove("open"); }
    document.getElementById("closeSimulatorModal").addEventListener("click", closeSimulator);
    document.getElementById("cancelSimulatorModal").addEventListener("click", closeSimulator);
    simulatorModal.addEventListener("click", e => { if (e.target === simulatorModal) closeSimulator(); });

    sendMockDataBtn.addEventListener("click", async () => {
        let payload;
        try {
            payload = JSON.parse(simPayloadJson.value);
        } catch (e) {
            toast("Invalid JSON in payload: " + e.message, "error");
            return;
        }

        sendMockDataBtn.disabled = true;
        sendMockDataBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…';

        const connectorId = simConnectorSelect.value;
        const targetUrl = connectorId
            ? `${API}/ingest/${connectorId}`
            : `${BASE_URL}/api/v1/user/get-result`;

        try {
            const res = await fetch(targetUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!data.success && data.status !== "success") throw new Error(data.message || "Failed to send");

            toast(`Test data sent successfully for Sample ID: ${payload.sample_id}!`, "success", 4500);
            closeSimulator();
            await loadConnectors();
        } catch (err) {
            toast("Error sending mock data: " + err.message, "error");
        } finally {
            sendMockDataBtn.disabled = false;
            sendMockDataBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Test Data Now';
        }
    });

    // ── Init ─────────────────────────────────────────────────────────────────
    renderInstructions();
    loadConnectors();

})();
