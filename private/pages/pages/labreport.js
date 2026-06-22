async function loadfunction() {
    function ensureStatusHost() {
        let host = document.getElementById("status-message-host");
        if (host) return host;

        host = document.createElement("div");
        host.id = "status-message-host";
        host.style.position = "fixed";
        host.style.top = "80px";
        host.style.right = "14px";
        host.style.zIndex = "99999";
        host.style.display = "flex";
        host.style.flexDirection = "column";
        host.style.gap = "8px";
        host.style.maxWidth = "360px";
        document.body.appendChild(host);
        return host;
    }

    function showStatusMessage(message, type = "success", timeoutMs = 2800) {
        if (!message) return;
        const host = ensureStatusHost();
        const toast = document.createElement("div");
        const palette = {
            success: { bg: "#e8f7ee", border: "#2e9b57", text: "#1f6d3d" },
            error: { bg: "#fdecec", border: "#c62828", text: "#8e1d1d" },
            warn: { bg: "#fff7e6", border: "#f39c12", text: "#8a5a00" },
            info: { bg: "#eaf3ff", border: "#2b6cb0", text: "#1e4e80" },
        };
        const color = palette[type] || palette.info;
        toast.style.background = color.bg;
        toast.style.borderLeft = `4px solid ${color.border}`;
        toast.style.color = color.text;
        toast.style.padding = "10px 12px";
        toast.style.fontSize = "13px";
        toast.style.fontWeight = "600";
        toast.style.borderRadius = "6px";
        toast.style.boxShadow = "0 6px 20px rgba(0,0,0,0.12)";
        toast.style.wordBreak = "break-word";
        toast.textContent = message;
        host.appendChild(toast);
        window.setTimeout(() => toast.remove(), timeoutMs);
    }

    window.showStatusMessage = showStatusMessage;

    const deviceLockState = window.__labflowDeviceLockState || (window.__labflowDeviceLockState = {
        active: false,
        overlay: null,
        observer: null,
        speechPlayed: false,
        fetchWrapped: false,
    });

    const DEVICE_LOCK_QR_PLACEHOLDER =
        "UPI QR / GPay QR will appear here";
    const DEVICE_LOCK_MESSAGE = {
        englishTitle: "ACCESS DENIED! DEVICE LIMIT REACHED",
        englishBody:
            "Your account is already active and running on another computer/laptop. As per your single-institute plan, concurrent login is restricted.",
        englishUpgrade:
            "UPGRADE YOUR PLAN NOW: Run LabFlowLIS on multiple devices simultaneously for just ₹299/Month per extra device!",
        englishSteps:
            "How to unlock instantly: Scan the QR Code below, make the payment of ₹299, and click the WhatsApp button to send us the screenshot. We will activate your extra device within 2 minutes!",
        hindiTitle:
            "सॉफ्टवेयर ब्लॉक कर दिया गया है! डिवाइस की सीमा समाप्त",
        hindiBody:
            "आपका अकाउंट पहले से ही किसी दूसरे कंप्यूटर या मोबाइल पर चल रहा है। नियम के अनुसार, यह प्लान केवल एक ही लैब/संस्थान के उपयोग के लिए है।",
        hindiUpgrade:
            "तुरंत नया प्लान लें: एक साथ कई कंप्यूटरों पर सॉफ्टवेयर चलाने के लिए अभी अपना प्लान बदलें, मात्र ₹299/महीना प्रति अतिरिक्त कंप्यूटर!",
        hindiSteps:
            "चालू करने का आसान तरीका: नीचे दिए गए QR कोड को स्कैन करके ₹299 का भुगतान करें, और WhatsApp बटन पर क्लिक करके पेमेंट का स्क्रीनशॉट भेजें। हम 2 मिनट में आपका दूसरा कंप्यूटर चालू कर देंगे!",
        speech:
            "सावधान! आपकी डिवाइस सीमा समाप्त हो चुकी है। यह सॉफ्टवेयर पहले से ही किसी और कंप्यूटर पर एक्टिव है। अगर आप इसे इस कंप्यूटर पर भी एक साथ चलाना चाहते हैं, तो स्क्रीन पर दिए गए क्यूआर कोड पर दो सौ निन्यानबे रुपये का भुगतान करें, और स्क्रीनशॉट व्हाट्सऐप पर भेजकर इसे तुरंत चालू करवाएं।",
    };

    function injectDeviceLockStyles() {
        if (document.getElementById("labflow-device-lock-styles")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "labflow-device-lock-styles";
        style.textContent = `
            #labflow-device-lock-overlay {
                position: fixed;
                inset: 0;
                z-index: 2147483647;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 20px;
                background: radial-gradient(circle at top, rgba(255, 201, 61, 0.22), rgba(0, 0, 0, 0.92) 58%);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                color: #fff;
            }

            #labflow-device-lock-overlay .device-lock-shell {
                width: min(1040px, 100%);
                max-height: calc(100vh - 32px);
                overflow: auto;
                border: 3px solid #ffeb3b;
                border-radius: 28px;
                background: linear-gradient(180deg, rgba(142, 16, 12, 0.98) 0%, rgba(30, 10, 8, 0.98) 100%);
                box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
                padding: 22px;
            }

            #labflow-device-lock-overlay .device-lock-banner {
                display: grid;
                grid-template-columns: 1.3fr 1fr;
                gap: 18px;
                align-items: stretch;
            }

            #labflow-device-lock-overlay .device-lock-headline {
                padding: 24px;
                border-radius: 22px;
                background: linear-gradient(135deg, #ff1f1f 0%, #b81c1c 52%, #ffcf33 100%);
                color: #111;
                text-transform: uppercase;
                border: 2px solid rgba(255, 255, 255, 0.22);
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.35);
            }

            #labflow-device-lock-overlay .device-lock-headline h1 {
                margin: 0;
                font-size: clamp(2rem, 4.5vw, 4rem);
                line-height: 0.95;
                font-weight: 900;
                letter-spacing: 0.04em;
            }

            #labflow-device-lock-overlay .device-lock-headline p {
                margin: 14px 0 0;
                font-size: 1rem;
                font-weight: 800;
            }

            #labflow-device-lock-overlay .device-lock-column {
                display: grid;
                gap: 14px;
            }

            #labflow-device-lock-overlay .device-lock-card {
                border-radius: 22px;
                padding: 18px;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.18);
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
            }

            #labflow-device-lock-overlay .device-lock-card h2 {
                margin: 0 0 8px;
                font-size: clamp(1.45rem, 2.8vw, 2.25rem);
                line-height: 1.05;
                font-weight: 900;
                color: #fffbea;
            }

            #labflow-device-lock-overlay .device-lock-card p,
            #labflow-device-lock-overlay .device-lock-card li {
                margin: 0;
                font-size: 1rem;
                line-height: 1.55;
                color: #fff;
                font-weight: 600;
            }

            #labflow-device-lock-overlay .device-lock-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
                margin-top: 16px;
            }

            #labflow-device-lock-overlay .device-lock-qr {
                min-height: 220px;
                border-radius: 22px;
                border: 2px dashed rgba(255, 235, 59, 0.88);
                background: rgba(0, 0, 0, 0.25);
                display: flex;
                align-items: center;
                justify-content: center;
                text-align: center;
                padding: 18px;
                font-weight: 900;
                color: #fff7a6;
            }

            #labflow-device-lock-overlay .device-lock-qr img {
                width: 100%;
                max-width: 280px;
                height: auto;
                display: block;
                border-radius: 14px;
                background: #fff;
                padding: 8px;
            }

            #labflow-device-lock-overlay .device-lock-whatsapp {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                padding: 16px 18px;
                margin-top: 14px;
                border-radius: 999px;
                background: linear-gradient(135deg, #2dd54c 0%, #128c7e 100%);
                color: #fff;
                font-size: 1rem;
                font-weight: 900;
                text-decoration: none;
                text-align: center;
                box-shadow: 0 16px 30px rgba(18, 140, 126, 0.4);
                animation: deviceLockPulse 1.7s ease-in-out infinite;
            }

            #labflow-device-lock-overlay .device-lock-note {
                margin-top: 12px;
                padding: 12px 14px;
                border-radius: 14px;
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                font-weight: 700;
            }

            @keyframes deviceLockPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.02); }
            }

            @media (max-width: 860px) {
                #labflow-device-lock-overlay .device-lock-banner,
                #labflow-device-lock-overlay .device-lock-grid {
                    grid-template-columns: 1fr;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function getDeviceLockWhatsAppNumber() {
        return String(
            window.LABFLOW_DEVICE_LOCK_WHATSAPP_NUMBER ||
            window.DEVICE_LOCK_WHATSAPP_NUMBER ||
            "919999999999"
        ).replace(/\D/g, "");
    }

    function getDeviceLockUserId() {
        return String(
            window.user?._id ||
            window.userId ||
            localStorage.getItem("userId") ||
            ""
        ).trim();
    }

    function buildDeviceLockWhatsAppLink() {
        const number = getDeviceLockWhatsAppNumber();
        const userId = getDeviceLockUserId() || "UNKNOWN";
        const message =
            `Hello Admin, I have paid Rs.299 to add an extra device. Please approve. My User ID: ${userId}`;
        return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    }

    function ensureDeviceLockOverlay() {
        injectDeviceLockStyles();

        if (deviceLockState.overlay && document.body.contains(deviceLockState.overlay)) {
            return deviceLockState.overlay;
        }

        const overlay = document.createElement("div");
        overlay.id = "labflow-device-lock-overlay";
        overlay.innerHTML = `
            <div class="device-lock-shell" role="dialog" aria-modal="true" aria-labelledby="deviceLockTitle">
                <div class="device-lock-banner">
                    <div class="device-lock-headline">
                        <h1 id="deviceLockTitle">${DEVICE_LOCK_MESSAGE.englishTitle}</h1>
                        <p>${DEVICE_LOCK_MESSAGE.englishBody}</p>
                        <p>${DEVICE_LOCK_MESSAGE.englishUpgrade}</p>
                        <p>${DEVICE_LOCK_MESSAGE.englishSteps}</p>
                    </div>
                    <div class="device-lock-card">
                        <h2>हिंदी / Hindi</h2>
                        <p>${DEVICE_LOCK_MESSAGE.hindiTitle}</p>
                        <p style="margin-top: 10px;">${DEVICE_LOCK_MESSAGE.hindiBody}</p>
                        <p style="margin-top: 10px;">${DEVICE_LOCK_MESSAGE.hindiUpgrade}</p>
                        <p style="margin-top: 10px;">${DEVICE_LOCK_MESSAGE.hindiSteps}</p>
                    </div>
                </div>

                <div class="device-lock-grid">
                    <div class="device-lock-card">
                        <h2>Payment QR Code</h2>
                        <div class="device-lock-qr" data-device-lock-qr>${DEVICE_LOCK_QR_PLACEHOLDER}</div>
                    </div>

                    <div class="device-lock-card">
                        <h2>WhatsApp Approval</h2>
                        <p>Send the payment screenshot here and we will enable the extra device fast.</p>
                        <a class="device-lock-whatsapp" data-device-lock-whatsapp target="_blank" rel="noreferrer noopener">
                            WhatsApp पर स्क्रीनशॉट भेजें और चालू करवाएं
                        </a>
                        <div class="device-lock-note">
                            If the screen stays blocked, refresh is not enough. Please complete the payment or contact the admin.
                        </div>
                    </div>
                </div>
            </div>
        `;

        const qrSlot = overlay.querySelector("[data-device-lock-qr]");
        const qrImageUrl =
            window.LABFLOW_DEVICE_LOCK_QR_IMAGE_URL ||
            window.DEVICE_LOCK_QR_IMAGE_URL ||
            "";

        if (qrImageUrl) {
            qrSlot.innerHTML = `<img src="${qrImageUrl}" alt="Device unlock QR code" />`;
        }

        const waButton = overlay.querySelector("[data-device-lock-whatsapp]");
        waButton.href = buildDeviceLockWhatsAppLink();

        document.body.appendChild(overlay);
        deviceLockState.overlay = overlay;
        return overlay;
    }

    function speakDeviceLockMessage() {
        if (deviceLockState.speechPlayed || !("speechSynthesis" in window)) {
            return;
        }

        deviceLockState.speechPlayed = true;
        const utterance = new SpeechSynthesisUtterance(DEVICE_LOCK_MESSAGE.speech);
        utterance.lang = "hi-IN";
        utterance.rate = 0.88;
        utterance.pitch = 1;
        utterance.volume = 1;

        const speakNow = () => {
            const voices = window.speechSynthesis.getVoices() || [];
            const preferredVoice =
                voices.find((voice) => String(voice.lang || "").toLowerCase() === "hi-in") ||
                voices.find((voice) => /hindi/i.test(String(voice.name || voice.lang || ""))) ||
                voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith("hi"));

            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }

            try {
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
            } catch (error) {
                console.warn("Device lock speech could not start", error);
            }
        };

        if (window.speechSynthesis.getVoices().length > 0) {
            speakNow();
        } else {
            window.speechSynthesis.addEventListener("voiceschanged", speakNow, { once: true });
            window.setTimeout(speakNow, 300);
        }
    }

    function keepDeviceLockOverlayAlive() {
        if (deviceLockState.observer || !document.body) {
            return;
        }

        deviceLockState.observer = new MutationObserver(() => {
            if (!deviceLockState.active) {
                return;
            }

            const overlay = ensureDeviceLockOverlay();
            if (!document.body.contains(overlay)) {
                document.body.appendChild(overlay);
            }

            document.documentElement.style.overflow = "hidden";
            document.body.style.overflow = "hidden";
            document.body.style.pointerEvents = "none";
            overlay.style.display = "flex";
            overlay.style.pointerEvents = "auto";
        });

        deviceLockState.observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    function clearStoredAuthTokens() {
        const keys = ["token", "accessToken", "refreshToken"];
        for (const key of keys) {
            try {
                localStorage.removeItem(key);
                sessionStorage.removeItem(key);
            } catch (error) {
                console.warn("Failed to clear stored auth token", key, error);
            }
        }
    }

    function activateDeviceLockOverlay(reason = "SESSION_INVALIDATED") {
        deviceLockState.active = true;
        clearStoredAuthTokens();
        const overlay = ensureDeviceLockOverlay();
        const headline = overlay.querySelector("#deviceLockTitle");
        const note = overlay.querySelector(".device-lock-note");

        if (headline) {
            headline.textContent =
                reason === "DEVICE_LIMIT_EXCEEDED"
                    ? DEVICE_LOCK_MESSAGE.englishTitle
                    : "SESSION LOST! PLEASE LOGIN AGAIN";
        }

        if (note && reason !== "DEVICE_LIMIT_EXCEEDED") {
            note.textContent =
                "Your current session was removed or expired on another device. Please sign in again to continue.";
        }

        document.documentElement.style.overflow = "hidden";
        document.body.style.overflow = "hidden";
        document.body.style.pointerEvents = "none";
        overlay.style.display = "flex";
        overlay.style.pointerEvents = "auto";

        keepDeviceLockOverlayAlive();
        speakDeviceLockMessage();
    }

    async function inspectDeviceLockResponse(response) {
        if (!response || ![401, 403].includes(response.status)) {
            return null;
        }

        let payload = {};
        try {
            payload = await response.clone().json();
        } catch (jsonError) {
            try {
                const text = await response.clone().text();
                payload = { message: text };
            } catch (textError) {
                payload = {};
            }
        }

        const errorCode = String(
            payload?.error || payload?.code || payload?.message || ""
        ).trim().toUpperCase();

        if (response.status === 403 && errorCode === "DEVICE_LIMIT_EXCEEDED") {
            return "DEVICE_LIMIT_EXCEEDED";
        }

        if (
            response.status === 401 ||
            errorCode === "DEVICE_SESSION_INVALIDATED" ||
            errorCode === "SESSION_INVALIDATED"
        ) {
            return "SESSION_INVALIDATED";
        }

        return null;
    }

    function installDeviceLockFetchGuard() {
        if (deviceLockState.fetchWrapped || typeof window.fetch !== "function") {
            return;
        }

        const originalFetch = window.fetch.bind(window);
        window.fetch = async function deviceLockAwareFetch(input, init) {
            const response = await originalFetch(input, init);
            const lockReason = await inspectDeviceLockResponse(response);
            if (lockReason) {
                activateDeviceLockOverlay(lockReason);
            }
            return response;
        };

        deviceLockState.fetchWrapped = true;
    }

    installDeviceLockFetchGuard();

    const DIFFERENTIAL_PERCENTAGE_FIELD_NAMES = [
        "Neutrophils Percentage",
        "Monocytes Percentage",
        "Lymphocytes Percentage",
        "Eosinophils Percentage",
        "Basophils Percentage",
    ];
    const DIFFERENTIAL_PERCENTAGE_FIELD_ALIASES = {
        "Neutrophils Percentage": ["Neutrophils Percentage"],
        "Monocytes Percentage": ["Monocytes Percentage"],
        "Lymphocytes Percentage": ["Lymphocytes Percentage", "Lymphocyte Percentage"],
        "Eosinophils Percentage": ["Eosinophils Percentage"],
        "Basophils Percentage": ["Basophils Percentage"],
    };
    const DIFFERENTIAL_TOTAL_TARGET = 100;
    const DIFFERENTIAL_TOTAL_TOLERANCE = 0.01;
    const FORMULA_FUNCTIONS = {
        abs: (...values) => Math.abs(values[0]),
        ceil: (...values) => Math.ceil(values[0]),
        floor: (...values) => Math.floor(values[0]),
        max: (...values) => Math.max(...values),
        min: (...values) => Math.min(...values),
        pow: (...values) => Math.pow(values[0], values[1]),
        round: (...values) => {
            const number = Number(values[0] || 0);
            const precision = Number.isFinite(values[1]) ? values[1] : 0;
            const scale = 10 ** precision;
            return Math.round(number * scale) / scale;
        },
    };
    const formulaState = {
        formulas: [],
        formulaByTargetMasterKey: new Map(),
        dependentsBySourceMasterKey: new Map(),
        inputByMasterKey: new Map(),
    };
    const LEGACY_FORMULA_CONFIGS = [
        {
            targetNames: ["Neutrophils-Absolute Count"],
            displayExpression: "(Total Leucocytes Count / 100) * Neutrophils Percentage",
            expressionTemplate: "({{tlc}} / 100) * {{neutrophilsPercentage}}",
            dependencies: {
                tlc: ["Total Leucocytes Count"],
                neutrophilsPercentage: ["Neutrophils Percentage"],
            },
        },
        {
            targetNames: ["Lymphocytes-Absolute Count"],
            displayExpression: "(Lymphocyte Percentage / 100) * Total Leucocytes Count",
            expressionTemplate: "({{lymphocytePercentage}} / 100) * {{tlc}}",
            dependencies: {
                lymphocytePercentage: ["Lymphocyte Percentage"],
                tlc: ["Total Leucocytes Count"],
            },
        },
        {
            targetNames: ["Eosinophil-Absolute Count"],
            displayExpression: "(Eosinophils Percentage / 100) * Total Leucocytes Count",
            expressionTemplate: "({{eosinophilsPercentage}} / 100) * {{tlc}}",
            dependencies: {
                eosinophilsPercentage: ["Eosinophils Percentage"],
                tlc: ["Total Leucocytes Count"],
            },
        },
        {
            targetNames: ["Monocyte- Absolute Count"],
            displayExpression: "(Monocytes Percentage / 100) * Total Leucocytes Count",
            expressionTemplate: "({{monocytesPercentage}} / 100) * {{tlc}}",
            dependencies: {
                monocytesPercentage: ["Monocytes Percentage"],
                tlc: ["Total Leucocytes Count"],
            },
        },
        {
            targetNames: ["Basophils-Absolute Count"],
            displayExpression: "(Basophils Percentage / 100) * Total Leucocytes Count",
            expressionTemplate: "({{basophilsPercentage}} / 100) * {{tlc}}",
            dependencies: {
                basophilsPercentage: ["Basophils Percentage"],
                tlc: ["Total Leucocytes Count"],
            },
        },
        {
            targetNames: ["Neutrophil Lymphocyte Ratio"],
            displayExpression: "Neutrophils-Absolute Count / Lymphocytes-Absolute Count",
            expressionTemplate: "{{neutrophilsAbsolute}} / {{lymphocytesAbsolute}}",
            dependencies: {
                neutrophilsAbsolute: ["Neutrophils-Absolute Count"],
                lymphocytesAbsolute: ["Lymphocytes-Absolute Count"],
            },
        },
        {
            targetNames: ["Mean Corpuscular Volume (MCV)"],
            displayExpression: "Hematocrit (HCT) * 10 / Total Red Blood Cell Count",
            expressionTemplate: "({{hct}} * 10) / {{rbcCount}}",
            dependencies: {
                hct: ["Hematocrit (HCT)", "PACKED CELL VOLUME (PCV)", "PCV"],
                rbcCount: ["Total Red Blood Cell Count", "RBC COUNT", "RBC"],
            },
        },
        {
            targetNames: ["Mean Corpuscular Hemoglobin (MCH)"],
            displayExpression: "Hemoglobin * 10 / Total Red Blood Cell Count",
            expressionTemplate: "({{hemoglobin}} * 10) / {{rbcCount}}",
            dependencies: {
                hemoglobin: ["Hemoglobin", "HAEMOGLOBIN (HB)", "HEMOGLOBIN (HB)", "HB"],
                rbcCount: ["Total Red Blood Cell Count", "RBC COUNT", "RBC"],
            },
        },
        {
            targetNames: ["Mean Corpuscular Hemoglobin Concentration (MCHC)"],
            displayExpression: "Hemoglobin * 100 / Hematocrit (HCT)",
            expressionTemplate: "({{hemoglobin}} * 100) / {{hct}}",
            dependencies: {
                hemoglobin: ["Hemoglobin", "HAEMOGLOBIN (HB)", "HEMOGLOBIN (HB)", "HB"],
                hct: ["Hematocrit (HCT)", "PACKED CELL VOLUME (PCV)", "PCV"],
            },
        },
        {
            targetNames: ["MCV"],
            displayExpression: "PACKED CELL VOLUME (PCV) * 10 / RBC COUNT",
            expressionTemplate: "({{pcv}} * 10) / {{rbcCount}}",
            dependencies: {
                pcv: ["PACKED CELL VOLUME (PCV)", "Hematocrit (HCT)", "PCV"],
                rbcCount: ["RBC COUNT", "Total Red Blood Cell Count", "RBC"],
            },
        },
        {
            targetNames: ["MCH"],
            displayExpression: "HAEMOGLOBIN (HB) * 10 / RBC COUNT",
            expressionTemplate: "({{hemoglobin}} * 10) / {{rbcCount}}",
            dependencies: {
                hemoglobin: ["HAEMOGLOBIN (HB)", "HEMOGLOBIN (HB)", "Hemoglobin", "HB"],
                rbcCount: ["RBC COUNT", "Total Red Blood Cell Count", "RBC"],
            },
        },
        {
            targetNames: ["MCHC"],
            displayExpression: "HAEMOGLOBIN (HB) * 100 / PACKED CELL VOLUME (PCV)",
            expressionTemplate: "({{hemoglobin}} * 100) / {{pcv}}",
            dependencies: {
                hemoglobin: ["HAEMOGLOBIN (HB)", "HEMOGLOBIN (HB)", "Hemoglobin", "HB"],
                pcv: ["PACKED CELL VOLUME (PCV)", "Hematocrit (HCT)", "PCV"],
            },
        },
        {
            targetNames: ["VLDL Cholesterol"],
            displayExpression: "Triglycerides / 5",
            expressionTemplate: "{{triglycerides}} / 5",
            dependencies: {
                triglycerides: ["Triglycerides"],
            },
        },
        {
            targetNames: ["LDL Cholesterol"],
            displayExpression: "Total Cholesterol - HDL Cholesterol - VLDL Cholesterol",
            expressionTemplate: "{{totalCholesterol}} - {{hdlCholesterol}} - {{vldlCholesterol}}",
            dependencies: {
                totalCholesterol: ["Total Cholesterol"],
                hdlCholesterol: ["HDL Cholesterol"],
                vldlCholesterol: ["VLDL Cholesterol"],
            },
        },
        {
            targetNames: ["LDL / HDL Ratio"],
            displayExpression: "LDL Cholesterol / HDL Cholesterol",
            expressionTemplate: "{{ldlCholesterol}} / {{hdlCholesterol}}",
            dependencies: {
                ldlCholesterol: ["LDL Cholesterol"],
                hdlCholesterol: ["HDL Cholesterol"],
            },
        },
        {
            targetNames: ["Total Cholesterol / HDL"],
            displayExpression: "Total Cholesterol / HDL Cholesterol",
            expressionTemplate: "{{totalCholesterol}} / {{hdlCholesterol}}",
            dependencies: {
                totalCholesterol: ["Total Cholesterol"],
                hdlCholesterol: ["HDL Cholesterol"],
            },
        },
        {
            targetNames: ["TG / HDL"],
            displayExpression: "Triglycerides / HDL Cholesterol",
            expressionTemplate: "{{triglycerides}} / {{hdlCholesterol}}",
            dependencies: {
                triglycerides: ["Triglycerides"],
                hdlCholesterol: ["HDL Cholesterol"],
            },
        },
        {
            targetNames: ["Non-HDL cholesterol"],
            displayExpression: "Total Cholesterol - HDL Cholesterol",
            expressionTemplate: "{{totalCholesterol}} - {{hdlCholesterol}}",
            dependencies: {
                totalCholesterol: ["Total Cholesterol"],
                hdlCholesterol: ["HDL Cholesterol"],
            },
        },
        {
            targetNames: ["Serum Bilirubin (Indirect)"],
            displayExpression: "Serum Bilirubin (Total) - Serum Bilirubin (Direct)",
            expressionTemplate: "{{bilirubinTotal}} - {{bilirubinDirect}}",
            dependencies: {
                bilirubinTotal: ["Serum Bilirubin (Total)"],
                bilirubinDirect: ["Serum Bilirubin (Direct)"],
            },
        },
        {
            targetNames: ["Globulin"],
            displayExpression: "Serum Protein - Serum Albumin",
            expressionTemplate: "{{serumProtein}} - {{serumAlbumin}}",
            dependencies: {
                serumProtein: ["Serum Protein"],
                serumAlbumin: ["Serum Albumin"],
            },
        },
        {
            targetNames: ["A/G Ratio"],
            displayExpression: "Serum Albumin / Globulin",
            expressionTemplate: "{{serumAlbumin}} / {{globulin}}",
            dependencies: {
                serumAlbumin: ["Serum Albumin"],
                globulin: ["Globulin"],
            },
        },
        {
            targetNames: ["Sgot/Sgpt Ratio Formula", "SGOT/SGPT RATIO"],
            displayExpression: "SGPT (ALT) / SGOT (AST)",
            expressionTemplate: "{{sgpt}} / {{sgot}}",
            dependencies: {
                sgpt: ["SGPT (ALT)"],
                sgot: ["SGOT (AST)"],
            },
        },
        {
            targetNames: ["BUN"],
            displayExpression: "Serum Urea * 0.467",
            expressionTemplate: "{{serumUrea}} * 0.467",
            dependencies: {
                serumUrea: ["Serum Urea"],
            },
        },
        {
            targetNames: ["Urea / Creatinine Ratio"],
            displayExpression: "Serum Urea / Serum Creatinine",
            expressionTemplate: "{{serumUrea}} / {{serumCreatinine}}",
            dependencies: {
                serumUrea: ["Serum Urea"],
                serumCreatinine: ["Serum Creatinine"],
            },
        },
        {
            targetNames: ["BUN / Creatinine Ratio"],
            displayExpression: "BUN / Serum Creatinine",
            expressionTemplate: "{{bun}} / {{serumCreatinine}}",
            dependencies: {
                bun: ["BUN"],
                serumCreatinine: ["Serum Creatinine"],
            },
        },
        {
            targetNames: ["Transferrin Saturation"],
            displayExpression: "Iron * 100 / Total Iron Binding Capacity",
            expressionTemplate: "({{iron}} * 100) / {{tibc}}",
            dependencies: {
                iron: ["Iron"],
                tibc: ["Total Iron Binding Capacity"],
            },
        },
        {
            targetNames: ["Estimated average glucose", "Estimatedaverageglucose"],
            displayExpression: "(28.7 * GLYCATED HAEMOGLOBIN(HbA1c)) - 46.7",
            expressionTemplate: "(28.7 * {{hba1c}}) - 46.7",
            dependencies: {
                hba1c: ["GLYCATED HAEMOGLOBIN(HbA1c)"],
            },
        },
        {
            targetNames: ["index"],
            displayExpression: "Prothrombin Time Patient Value / Prothrombin Time Control Value",
            expressionTemplate: "{{ptPatient}} / {{ptControl}}",
            dependencies: {
                ptPatient: ["Prothrombin Time Patient Value"],
                ptControl: ["Prothrombin Time Control Value"],
            },
        },
    ];

    function normalizeFieldIdentity(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "");
    }

    const DIFFERENTIAL_PERCENTAGE_FIELD_SET = new Set(
        Object.values(DIFFERENTIAL_PERCENTAGE_FIELD_ALIASES)
            .flat()
            .map((fieldName) => normalizeFieldIdentity(fieldName))
    );

    function tokenizeFormulaExpression(expression) {
        const source = String(expression || "").trim();
        const tokens = [];
        let index = 0;

        while (index < source.length) {
            const char = source[index];

            if (/\s/.test(char)) {
                index += 1;
                continue;
            }

            if ("+-*/(),".includes(char)) {
                tokens.push({ type: char, value: char });
                index += 1;
                continue;
            }

            if (char === "{" && source[index + 1] === "{") {
                const endIndex = source.indexOf("}}", index + 2);
                if (endIndex === -1) {
                    throw new Error("Formula placeholder बंद नहीं हुआ है।");
                }

                const parameterId = source.slice(index + 2, endIndex).trim();
                tokens.push({ type: "variable", value: parameterId });
                index = endIndex + 2;
                continue;
            }

            if (/\d|\./.test(char)) {
                let endIndex = index + 1;
                while (endIndex < source.length && /[\d.]/.test(source[endIndex])) {
                    endIndex += 1;
                }

                tokens.push({
                    type: "number",
                    value: Number.parseFloat(source.slice(index, endIndex)),
                });
                index = endIndex;
                continue;
            }

            if (/[a-zA-Z_]/.test(char)) {
                let endIndex = index + 1;
                while (endIndex < source.length && /[a-zA-Z0-9_]/.test(source[endIndex])) {
                    endIndex += 1;
                }

                tokens.push({
                    type: "identifier",
                    value: source.slice(index, endIndex).toLowerCase(),
                });
                index = endIndex;
                continue;
            }

            throw new Error(`Unsupported token "${char}"`);
        }

        return tokens;
    }

    function createFormulaCursor(tokens) {
        let index = 0;

        return {
            peek() {
                return tokens[index] || null;
            },
            next() {
                return tokens[index++] || null;
            },
            isComplete() {
                return index >= tokens.length;
            },
        };
    }

    function parseFormulaExpression(expression, resolveVariable) {
        const tokens = tokenizeFormulaExpression(expression);
        const cursor = createFormulaCursor(tokens);

        function parseExpression() {
            let value = parseTerm();

            while (true) {
                const token = cursor.peek();
                if (!token || (token.type !== "+" && token.type !== "-")) {
                    return value;
                }

                cursor.next();
                const right = parseTerm();
                value = token.type === "+" ? value + right : value - right;
            }
        }

        function parseTerm() {
            let value = parseFactor();

            while (true) {
                const token = cursor.peek();
                if (!token || (token.type !== "*" && token.type !== "/")) {
                    return value;
                }

                cursor.next();
                const right = parseFactor();

                if (token.type === "/") {
                    if (right === 0) {
                        throw new Error("Division by zero");
                    }
                    value /= right;
                    continue;
                }

                value *= right;
            }
        }

        function parseFactor() {
            const token = cursor.peek();
            if (!token) {
                throw new Error("Formula expression अधूरा है।");
            }

            if (token.type === "+") {
                cursor.next();
                return parseFactor();
            }

            if (token.type === "-") {
                cursor.next();
                return -parseFactor();
            }

            if (token.type === "number") {
                cursor.next();
                return token.value;
            }

            if (token.type === "variable") {
                cursor.next();
                return resolveVariable(token.value);
            }

            if (token.type === "(") {
                cursor.next();
                const nestedValue = parseExpression();
                const closing = cursor.next();
                if (!closing || closing.type !== ")") {
                    throw new Error("Closing bracket missing");
                }
                return nestedValue;
            }

            if (token.type === "identifier") {
                cursor.next();
                const opening = cursor.next();
                if (!opening || opening.type !== "(") {
                    throw new Error(`Function ${token.value} malformed`);
                }

                const args = [];
                if (cursor.peek()?.type !== ")") {
                    while (true) {
                        args.push(parseExpression());
                        if (cursor.peek()?.type === ",") {
                            cursor.next();
                            continue;
                        }
                        break;
                    }
                }

                const closing = cursor.next();
                if (!closing || closing.type !== ")") {
                    throw new Error(`Function ${token.value} closing bracket missing`);
                }

                const handler = FORMULA_FUNCTIONS[token.value];
                if (!handler) {
                    throw new Error(`Unsupported function ${token.value}`);
                }

                return handler(...args);
            }

            throw new Error(`Unexpected token ${token.value}`);
        }

        const result = parseExpression();
        if (!cursor.isComplete()) {
            throw new Error("Formula expression invalid है।");
        }
        return result;
    }

    async function loadTenantFormulas() {
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/formulas/active`);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Failed to load formulas");
            }

            formulaState.formulas = Array.isArray(result.data) ? result.data : [];
        } catch (error) {
            formulaState.formulas = [];
            console.error("Error loading formulas:", error);
        }
    }

    function buildLegacyFieldIndex() {
        const fieldIndex = new Map();

        document.querySelectorAll(".value-input[data-param-id]").forEach((input) => {
            const names = [
                input.dataset.paramName,
                input.dataset.id,
                input.closest("tr")?.children?.[1]?.textContent,
            ];

            names.forEach((name) => {
                const normalizedName = normalizeFieldIdentity(name);
                if (normalizedName && !fieldIndex.has(normalizedName)) {
                    fieldIndex.set(normalizedName, input);
                }
            });
        });

        return fieldIndex;
    }

    function findLegacyInput(fieldIndex, names = []) {
        for (const name of names) {
            const normalizedName = normalizeFieldIdentity(name);
            const matchedInput = fieldIndex.get(normalizedName);
            if (matchedInput) {
                return matchedInput;
            }
        }
        return null;
    }

    function buildLegacyFallbackFormulas(savedFormulas) {
        const fieldIndex = buildLegacyFieldIndex();
        const savedTargetIds = new Set(
            (savedFormulas || []).map((formula) => String(formula.targetMasterKey || ""))
        );
        const fallbackFormulas = [];

        LEGACY_FORMULA_CONFIGS.forEach((config) => {
            const targetInput = findLegacyInput(fieldIndex, config.targetNames);
            if (!targetInput?.dataset?.masterParamKey) {
                return;
            }

            const targetMasterKey = String(targetInput.dataset.masterParamKey);
            if (savedTargetIds.has(targetMasterKey)) {
                return;
            }

            const dependencies = [];
            let expression = config.expressionTemplate;
            let canBuildFormula = true;

            Object.entries(config.dependencies || {}).forEach(([tokenKey, dependencyNames]) => {
                const dependencyInput = findLegacyInput(fieldIndex, dependencyNames);
                if (!dependencyInput?.dataset?.masterParamKey) {
                    canBuildFormula = false;
                    return;
                }

                const dependencyMasterKey = String(dependencyInput.dataset.masterParamKey);
                expression = expression.split(`{{${tokenKey}}}`).join(`{{${dependencyMasterKey}}}`);
                dependencies.push({
                    testId: dependencyInput.dataset.testId || null,
                    parameterId: dependencyInput.dataset.paramId || null,
                    parameterMasterKey: dependencyMasterKey,
                    label: dependencyInput.dataset.paramName || dependencyInput.dataset.id || dependencyNames[0] || "",
                });
            });

            if (!canBuildFormula) {
                return;
            }

            fallbackFormulas.push({
                _id: `legacy-${targetMasterKey}`,
                targetTestId: targetInput.dataset.testId || null,
                targetParameterId: targetInput.dataset.paramId || null,
                targetMasterKey,
                targetLabel: targetInput.dataset.paramName || targetInput.dataset.id || config.targetNames[0],
                expression,
                displayExpression: config.displayExpression,
                dependencies,
                precision: 2,
                isActive: true,
                allowManualOverride: false,
            });
        });

        return fallbackFormulas;
    }

    function rebuildFormulaIndexes() {
        formulaState.formulaByTargetMasterKey.clear();
        formulaState.dependentsBySourceMasterKey.clear();
        formulaState.inputByMasterKey.clear();

        document.querySelectorAll(".value-input[data-param-id]").forEach((input) => {
            if (input.dataset.masterParamKey) {
                formulaState.inputByMasterKey.set(String(input.dataset.masterParamKey), input);
            }
        });

        formulaState.formulas.forEach((formula) => {
            const targetMasterKey = String(formula.targetMasterKey || "");
            if (!targetMasterKey) return;

            formulaState.formulaByTargetMasterKey.set(targetMasterKey, formula);

            (formula.dependencies || []).forEach((dependency) => {
                const dependencyMasterKey = String(dependency.parameterMasterKey || "");
                if (!dependencyMasterKey) return;

                if (!formulaState.dependentsBySourceMasterKey.has(dependencyMasterKey)) {
                    formulaState.dependentsBySourceMasterKey.set(dependencyMasterKey, []);
                }
                formulaState.dependentsBySourceMasterKey.get(dependencyMasterKey).push(formula);
            });
        });
    }

    function setFormulaInputDisplayState(input, formula) {
        if (!input) return;

        input.dataset.formulaField = "true";
        input.dataset.formulaTargetId = String(formula._id || "");
        input.readOnly = !formula.allowManualOverride;
        input.classList.toggle("formula-value-input", true);
    }

    function addIconsToMatchingRows() {
        formulaState.formulas = [
            ...(formulaState.formulas || []),
            ...buildLegacyFallbackFormulas(formulaState.formulas || []),
        ];
        rebuildFormulaIndexes();
        const rows = document.querySelectorAll(".table tbody tr[data-order]");

        rows.forEach((row) => {
            const valueColumn = row.querySelector(".formulaIcon");
            const input = row.querySelector(".value-input[data-param-id]");
            if (!valueColumn || !input) return;

            const formula = formulaState.formulaByTargetMasterKey.get(String(input.dataset.masterParamKey || ""));
            if (!formula) {
                return;
            }

            setFormulaInputDisplayState(input, formula);

            if (valueColumn.querySelector(".icon")) return;

            const title = row.children[1]?.textContent?.trim() || formula.targetLabel || "Formula";
            const icon = document.createElement("div");
            icon.type = "div";
            icon.classList.add("icon", "formula-icon-button", "formula-tooltip-container");
            icon.tabIndex = -1;
            icon.setAttribute("aria-label", `Formula for ${title}`);
            icon.innerHTML = `<i class="fa-solid fa-calculator" aria-hidden="true"></i>`;

            const tooltip = document.createElement("div");
            tooltip.classList.add("tooltip-box");

            const tooltipLabel = document.createElement("div");
            tooltipLabel.className = "tooltip-box__label";
            tooltipLabel.textContent = "Formula";

            const tooltipFormula = document.createElement("code");
            tooltipFormula.className = "tooltip-box__formula";
            tooltipFormula.textContent = formula.displayExpression || formula.expression || "";

            tooltip.appendChild(tooltipLabel);
            tooltip.appendChild(tooltipFormula);
            icon.appendChild(tooltip);
            valueColumn.appendChild(icon);
        });
    }

    function getNumericValueFromInput(input) {
        if (!input) {
            return { hasValue: false, value: 0 };
        }

        const rawValue = String(input.value || "").trim();
        if (rawValue === "") {
            return { hasValue: false, value: 0 };
        }

        const numericValue = Number.parseFloat(rawValue);
        if (!Number.isFinite(numericValue)) {
            return { hasValue: false, value: 0 };
        }

        return { hasValue: true, value: numericValue };
    }

    function applyComputedFormulaValue(input, formula, value) {
        if (!input) return;

        const precision = Number.isFinite(Number(formula.precision)) ? Number(formula.precision) : 2;
        input.value = Number(value).toFixed(precision);
        processInput(input);
    }

    function clearComputedFormulaValue(input) {
        if (!input) return;
        input.value = "";
        processInput(input);
    }

    function recalculateSingleFormula(formula) {
        const targetMasterKey = String(formula.targetMasterKey || "");
        const targetInput = formulaState.inputByMasterKey.get(targetMasterKey);
        if (!targetInput) {
            return false;
        }

        const dependencyValues = {};
        let hasAnyDependencyValue = false;
        let hasMissingDependency = false;

        (formula.dependencies || []).forEach((dependency) => {
            const dependencyMasterKey = String(dependency.parameterMasterKey || "");
            const dependencyInput = formulaState.inputByMasterKey.get(dependencyMasterKey);
            const { hasValue, value } = getNumericValueFromInput(dependencyInput);
            dependencyValues[dependencyMasterKey] = value;
            hasAnyDependencyValue = hasAnyDependencyValue || hasValue;
            hasMissingDependency = hasMissingDependency || !hasValue;
        });

        if (!hasAnyDependencyValue || hasMissingDependency) {
            clearComputedFormulaValue(targetInput);
            return false;
        }

        try {
            const computedValue = parseFormulaExpression(formula.expression, (parameterId) => {
                return dependencyValues[String(parameterId)] || 0;
            });

            applyComputedFormulaValue(targetInput, formula, computedValue);
            return true;
        } catch (error) {
            console.error(`Error evaluating formula for ${formula.targetLabel}:`, error);
            clearComputedFormulaValue(targetInput);
            return false;
        }
    }

    function recalculateFormulaCascadeFromParam(paramId) {
        const queue = [String(paramId || "")];
        const visitedTargets = new Set();

        while (queue.length) {
            const sourceMasterKey = queue.shift();
            const dependentFormulas = formulaState.dependentsBySourceMasterKey.get(sourceMasterKey) || [];

            dependentFormulas.forEach((formula) => {
                const targetMasterKey = String(formula.targetMasterKey || "");
                if (!targetMasterKey || visitedTargets.has(targetMasterKey)) {
                    return;
                }

                visitedTargets.add(targetMasterKey);
                recalculateSingleFormula(formula);
                queue.push(targetMasterKey);
            });
        }
    }

    function recalculateAllFormulas() {
        formulaState.formulas.forEach((formula) => {
            recalculateSingleFormula(formula);
        });
    }

    function parseStoredCheckboxFlag(value) {
        if (typeof value === "boolean") return value;
        if (typeof value === "number") return value === 1;
        if (typeof value === "string") {
            const normalizedValue = value.trim().toLowerCase();
            if (["true", "1", "yes", "on"].includes(normalizedValue)) return true;
            if (["false", "0", "no", "off", ""].includes(normalizedValue)) return false;
        }
        return Boolean(value);
    }

    function resolveStoredCheckboxFlag(...values) {
        for (const value of values) {
            if (value !== undefined && value !== null) {
                return parseStoredCheckboxFlag(value);
            }
        }
        return false;
    }

    function isKeyboardNavigationField(element) {
        if (!(element instanceof HTMLElement)) return false;
        if (!element.matches("input, select")) return false;
        if (element.matches("textarea, [contenteditable='true']")) return false;
        if (element.closest(".ck, .ck-editor, .text-dropdown")) return false;
        if (element.disabled || element.readOnly) return false;

        const fieldType = (element.getAttribute("type") || "").toLowerCase();
        if (["hidden", "checkbox", "button", "submit", "radio", "file"].includes(fieldType)) {
            return false;
        }

        return true;
    }

    function isManualNavigationField(element) {
        return isKeyboardNavigationField(element) && element.dataset.formulaField !== "true";
    }

    function focusFieldWithCenteredScroll(field) {
        if (!field) return;

        const scrollTarget = field.closest("tr") || field;
        field.focus({ preventScroll: true });
        if (typeof field.select === "function" && field.tagName === "INPUT") {
            field.select();
        }
        smoothScrollTo(scrollTarget);
    }

    function focusNextManualField(currentField, direction = 1) {
        const navigationFields = Array.from(
            document.querySelectorAll("input, select")
        ).filter((field) => {
            if (!isKeyboardNavigationField(field)) return false;
            const style = window.getComputedStyle(field);
            return style.display !== "none" && style.visibility !== "hidden";
        });

        const currentIndex = navigationFields.indexOf(currentField);
        if (currentIndex === -1) return false;

        for (
            let nextIndex = currentIndex + direction;
            nextIndex >= 0 && nextIndex < navigationFields.length;
            nextIndex += direction
        ) {
            const nextField = navigationFields[nextIndex];
            if (!isManualNavigationField(nextField)) continue;
            focusFieldWithCenteredScroll(nextField);
            return true;
        }

        return false;
    }

    // const urlParams = new URLSearchParams(window.location.search);
    const booking = JSON.parse(localStorage.getItem("booking"));
    // for getting individual parameter lower and upper value
    const patient = { age: booking.year, gender: booking.gender };
    // //for pdf only (print tale on seperate page)
    // document.getElementById('check1').checked = true;
    let isdocumented = false;
    //Array for filtering tests and pannels
    let testArray = [];
    //Array for filtering tests, pannels, package 
    let testArray2 = [];
    let testpanels;
    // for sample receiving time 
    let recievedOn;
    const showRandomBtn = document.getElementById('randomresult');

    if (user.showRandomBtn) {
        showRandomBtn.style.display = 'block';
    } else {
        showRandomBtn.style.display = 'none';
    }

    // for getting barcode tests
    try {
        const response = await fetch(`${BASE_URL}/api/v1/user/getbarcodeTests`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json', // Specify JSON format
            },
            body: JSON.stringify({ bookingId: booking.bookingId }),
        });

        if (!response.ok) {
            // Handle non-2xx HTTP responses
            const errorData = await response.json();

            return;
        }

        const data = await response.json();

        testpanels = data[0];
        data[0].barcodes.barcodes.forEach(element => {
            const array = element.testandpannelArray;
            testArray.push(...array);
        })

        getallpptfromrelatedbarcode(data[0].barcodes.barcodes);

        recievedOn = formatDateTimeLocal(data[0].barcodes.createdAt);
    } catch (error) {

    }

    // this is for testArray2
    async function getallpptfromrelatedbarcode(barcodes) {
        const bookingByBarcode = new Map();
        booking.tableData.forEach((entry) => {
            const key = (entry.barcodeId || "").trim();
            if (!key) return;
            bookingByBarcode.set(key, entry);
        });

        for (const object of barcodes) {
            const match = bookingByBarcode.get((object.barcode || "").trim());
            if (match?.testName) testArray2.push(...match.testName.split(","));
        }
    }

    // for removing duplicacy
    let uniquetestArray2 = [...new Set(testArray2)];
    let uniquetestArray = [...new Set(testArray)];

    function parseDateInput(value, fallbackTime = "") {
        if (!value) return null;

        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : value;
        }

        const rawValue = String(value).trim();
        if (!rawValue) return null;

        const timeMatch = String(fallbackTime || "")
            .trim()
            .match(/^(\d{1,2}):(\d{2})/);
        const fallbackHours = timeMatch ? Number(timeMatch[1]) : 0;
        const fallbackMinutes = timeMatch ? Number(timeMatch[2]) : 0;

        // IST offset in ms: UTC + 5:30
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

        const isoDateMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})T/);
        if (isoDateMatch && timeMatch) {
            const [, year, month, day] = isoDateMatch;
            // Create date in UTC by applying IST offset, so getUTC* extracts IST components
            const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), fallbackHours, fallbackMinutes) - IST_OFFSET_MS;
            return new Date(utcMs);
        }

        const ymdMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (ymdMatch) {
            const [, year, month, day] = ymdMatch;
            // Create date at IST midnight (UTC: 18:30 previous day)
            const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), fallbackHours, fallbackMinutes) - IST_OFFSET_MS;
            return new Date(utcMs);
        }

        const dmyMatch = rawValue.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
        if (dmyMatch) {
            const [, day, month, year] = dmyMatch;
            const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), fallbackHours, fallbackMinutes) - IST_OFFSET_MS;
            return new Date(utcMs);
        }

        // For full ISO strings (e.g., from server with 'Z'), JavaScript handles correctly.
        // But to be safe, force IST interpretation for strings without timezone
        if (!rawValue.endsWith('Z') && !rawValue.includes('+')) {
            const parsed = new Date(rawValue);
            if (!Number.isNaN(parsed.getTime())) {
                // If it has time component, treat as IST
                const utcMs = parsed.getTime() - IST_OFFSET_MS;
                return new Date(utcMs);
            }
        }

        const parsedDate = new Date(rawValue);
        return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
    }

    // Convert to the required format
    function formatDateTimeLocal(dateInput, fallbackTime = "") {
        const date = parseDateInput(dateInput, fallbackTime);
        if (!date) return "";

        // Convert to IST (UTC + 5:30) before extracting date/time components
        // parseDateInput already stored dates in UTC representing IST,
        // but for ISO strings with 'Z' the date is in true UTC.
        // We normalize everything to IST here by adding the offset from true UTC.
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        const istTimestamp = date.getTime() + IST_OFFSET_MS;
        const istDate = new Date(istTimestamp);

        // Use getUTCFullYear/getUTCMonth/etc after offsetting for IST
        const year = istDate.getUTCFullYear();
        const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(istDate.getUTCDate()).padStart(2, '0');
        const hours = String(istDate.getUTCHours()).padStart(2, '0');
        const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');

        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    function getRegisteredOnValue() {
        return formatDateTimeLocal(booking.createdAt || booking.date, booking.createdAt ? "" : booking.time);
    }

    function getCollectedOnValue() {
        return formatDateTimeLocal(booking.date, booking.time);
    }

    // Function to apply logic to each abnormal input field 
    const processInput = (input) => {
        const row = input.closest("tr"); // Get the row containing the input
        const highLowSpan = row?.querySelector?.(".HighLow"); // Get the span for L/H display
        const inputValue = (input.value || "").trim(); // Get the input value as a string and trim whitespace
        const referenceType = input.dataset.referenceType || "numeric";

        // Reset baseline styles
        row.style.fontWeight = "normal";
        input.style.fontWeight = "normal";
        if (highLowSpan) highLowSpan.textContent = "";

        // Text-based reference: only bold if marked abnormal
        if (referenceType === "text") {
            if (!inputValue) return;
            let isAbnormal = input.dataset.isAbnormal === "true";

            // Try to infer abnormal flag from cached options if not already set
            if (!isAbnormal) {
                const key = textKeyForInput();
                const cached = textDropdownState.cache.get(key);
                if (cached && cached.length) {
                    const match = cached.find(
                        (entry) => (entry.valueName || "").toLowerCase() === inputValue.toLowerCase()
                    );
                    if (match) {
                        isAbnormal = !!match.isAbnormal;
                        input.dataset.isAbnormal = match.isAbnormal ? "true" : "false";
                    }
                }
            }

            if (isAbnormal) {
                row.style.fontWeight = "bold";
                input.style.fontWeight = "bold";
            }
            return;
        }

        const numericValue = parseFloat(inputValue); // Parse the numeric value from the input
        const lowerValue = parseFloat(input.getAttribute('data-lower'));
        const upperValue = parseFloat(input.getAttribute('data-upper'));

        // Reset styling and span content if input is invalid
        if (isNaN(numericValue) && inputValue.toLowerCase() !== "positive") {
            return;
        }

        // Apply logic for bold styling and L/H display
        if (inputValue.toLowerCase() === "positive") {
            // If the input is "positive" (case-insensitive)
            row.style.fontWeight = "bold";
            input.style.fontWeight = "bold";
            if (highLowSpan) highLowSpan.textContent = ""; // No L or H for "positive"
        } else if (numericValue < lowerValue) {
            row.style.fontWeight = "bold";
            input.style.fontWeight = "bold";
            if (highLowSpan) highLowSpan.textContent = "L"; // Low
        } else if (numericValue > upperValue) {
            row.style.fontWeight = "bold";
            if (highLowSpan) highLowSpan.textContent = "H"; // High
            input.style.fontWeight = "bold";
        } else {
            // Reset to normal if none of the conditions match
            row.style.fontWeight = "normal";
            input.style.fontWeight = "normal";
            if (highLowSpan) highLowSpan.textContent = "";
        }
    };
    window.__labReportProcessInput = processInput;

    // --- Text reference dropdown state/helpers ---
    const textDropdownState = {
        cache: new Map(),
        activeDropdown: null,
        activeInput: null,
        hoverTimer: null,
    };

    // Keep the existing form flow intact while allowing Enter/Tab to skip formula fields.
    document.addEventListener(
        "keydown",
        (event) => {
            const isEnterKey = event.key === "Enter";
            const isTabKey = event.key === "Tab";
            if (!isEnterKey && !isTabKey) return;
            if ((isEnterKey && event.shiftKey) || event.ctrlKey || event.altKey || event.metaKey) return;
            if (textDropdownState.activeDropdown) return;
            if (!isKeyboardNavigationField(event.target)) return;

            const direction = isTabKey && event.shiftKey ? -1 : 1;
            const moved = focusNextManualField(event.target, direction);

            if (isEnterKey || moved) {
                event.preventDefault();
            }
        },
        true
    );

    const isTextReferenceInput = (input) => {
        return input && (input.dataset.referenceType || "").toLowerCase() === "text";
    };

    const textKeyForInput = () => "global-text-reference";

    const closeTextDropdown = () => {
        if (textDropdownState.activeDropdown) {
            textDropdownState.activeDropdown.remove();
        }
        textDropdownState.activeDropdown = null;
        textDropdownState.activeInput = null;
    };

    const positionTextDropdown = (dropdown, input) => {
        const rect = input.getBoundingClientRect();
        dropdown.style.minWidth = `${rect.width}px`;
        dropdown.style.left = `${rect.left + window.scrollX}px`;
        dropdown.style.top = `${rect.bottom + window.scrollY + 6}px`;
    };

    const applySelectedValue = (input, item) => {
        input.value = item?.valueName || "";
        input.dataset.isAbnormal = item?.isAbnormal ? "true" : "false";
        processInput(input);
        // Bubble input event so existing listeners/formulas run
        input.dispatchEvent(new Event("input", { bubbles: true }));
        closeTextDropdown();
    };

    const saveTextReferenceValue = async ({ id, testId, parameterId, valueName, isAbnormal }) => {
        const url = id
            ? `${BASE_URL}/api/v1/user/test-reference-values/${id}`
            : `${BASE_URL}/api/v1/user/test-reference-values`;
        const method = id ? "PUT" : "POST";
        const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ valueName, isAbnormal }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(body?.message || "Failed to save reference value.");
        }
        return body?.data || body;
    };

    const deleteTextReferenceValueApi = async (id) => {
        const response = await fetch(`${BASE_URL}/api/v1/user/test-reference-values/${id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(body?.message || "Failed to delete reference value.");
        }
        return body?.data || body;
    };

    const fetchTextReferenceValues = async (input) => {
        const key = textKeyForInput();
        if (textDropdownState.cache.has(key)) {
            return textDropdownState.cache.get(key);
        }

        const payload = {};

        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/test-reference-values/list`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const body = await response.json().catch(() => ({}));
            const values = Array.isArray(body?.data) ? body.data : [];
            textDropdownState.cache.set(key, values);
            return values;
        } catch (error) {
            console.error("Error fetching text reference values", error);
            showStatusMessage("Unable to load saved values.", "error");
            return [];
        }
    };

    const renderTextDropdown = (input, values) => {
        closeTextDropdown();

        const dropdown = document.createElement("div");
        dropdown.className = "text-dropdown";
        dropdown.dataset.key = textKeyForInput();

        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Search values";
        searchInput.className = "text-dropdown__search";

        const list = document.createElement("div");
        list.className = "text-dropdown__list";

        const form = document.createElement("div");
        form.className = "text-dropdown__form is-hidden";
        form.innerHTML = `
            <label class="text-dropdown__label">Value Name</label>
            <input type="text" class="text-dropdown__input" placeholder="e.g. Present (+++)" />
            <label class="text-dropdown__checkbox">
                <input type="checkbox" class="text-dropdown__checkbox-input" /> Mark as Abnormal
            </label>
            <div class="text-dropdown__form-actions">
                <button type="button" class="text-dropdown__save">Save</button>
                <button type="button" class="text-dropdown__cancel">Cancel</button>
            </div>
        `;
        const nameInput = form.querySelector(".text-dropdown__input");
        const abnormalToggle = form.querySelector(".text-dropdown__checkbox-input");
        const saveBtn = form.querySelector(".text-dropdown__save");
        const cancelBtn = form.querySelector(".text-dropdown__cancel");

        const footer = document.createElement("div");
        footer.className = "text-dropdown__footer";
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "text-dropdown__add";
        addButton.textContent = "+ Add new";
        footer.appendChild(addButton);

        const showForm = (mode = "create", item = null) => {
            form.classList.remove("is-hidden");
            form.dataset.mode = mode;
            form.dataset.editId = item?._id || "";
            nameInput.value = item?.valueName || "";
            abnormalToggle.checked = item?.isAbnormal || false;
            saveBtn.textContent = mode === "edit" ? "Update" : "Save";
            setTimeout(() => nameInput.focus(), 10);
        };

        const hideForm = () => {
            form.classList.add("is-hidden");
            form.dataset.mode = "";
            form.dataset.editId = "";
            nameInput.value = "";
            abnormalToggle.checked = false;
        };

        addButton.addEventListener("click", (event) => {
            event.stopPropagation();
            showForm("create");
        });

        cancelBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            hideForm();
        });

        saveBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            const valueName = nameInput.value.trim();
            if (!valueName) {
                showStatusMessage("Enter a value name.", "warn");
                return;
            }
            const payload = {
                valueName,
                isAbnormal: abnormalToggle.checked,
            };
            const key = textKeyForInput();
            try {
                const saved = await saveTextReferenceValue({
                    ...payload,
                    id: form.dataset.editId || null,
                });
                const current = textDropdownState.cache.get(key) || [];
                const updated =
                    form.dataset.editId && form.dataset.editId !== ""
                        ? current.map((entry) => (entry._id === saved._id ? saved : entry))
                        : [...current, saved];
                textDropdownState.cache.set(key, updated);
                renderTextDropdown(input, updated);
                applySelectedValue(input, saved);
            } catch (error) {
                showStatusMessage(error.message || "Unable to save value.", "error");
            }
        });

        if (!values.length) {
            const empty = document.createElement("div");
            empty.className = "text-dropdown__empty";
            empty.textContent = "No saved values yet";
            list.appendChild(empty);
        }

        values.forEach((item) => {
            const row = document.createElement("div");
            row.className = "text-dropdown__item";
            row.dataset.id = item._id;
            row.dataset.valueName = (item.valueName || "").toLowerCase();
            row._textRefValue = item;

            const valueWrap = document.createElement("div");
            valueWrap.className = "text-dropdown__value";
            valueWrap.textContent = item.valueName;

            if (item.isAbnormal) {
                const badge = document.createElement("span");
                badge.className = "text-dropdown__badge";
                badge.textContent = "Abnormal";
                valueWrap.appendChild(badge);
            }

            const actions = document.createElement("div");
            actions.className = "text-dropdown__actions";

            const editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "text-dropdown__icon";
            editBtn.innerHTML = `<i class="fas fa-pen"></i>`;
            editBtn.title = "Edit";
            editBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                showForm("edit", item);
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "text-dropdown__icon";
            deleteBtn.innerHTML = `<i class="fas fa-trash"></i>`;
            deleteBtn.title = "Delete";
            deleteBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                if (!confirm("Delete this value?")) return;
                try {
                    await deleteTextReferenceValueApi(item._id);
                    const key = textKeyForInput();
                    const next = (textDropdownState.cache.get(key) || []).filter(
                        (entry) => entry._id !== item._id
                    );
                    textDropdownState.cache.set(key, next);
                    renderTextDropdown(input, next);
                } catch (error) {
                    showStatusMessage(error.message || "Unable to delete value.", "error");
                }
            });

            actions.append(editBtn, deleteBtn);

            row.appendChild(valueWrap);
            row.appendChild(actions);

            row.addEventListener("click", (event) => {
                event.stopPropagation();
                applySelectedValue(input, item);
            });

            list.appendChild(row);
        });

        searchInput.addEventListener("input", () => {
            const term = searchInput.value.toLowerCase();
            list.querySelectorAll(".text-dropdown__item").forEach((row) => {
                const match = row.dataset.valueName || "";
                row.style.display = match.includes(term) ? "flex" : "none";
            });
        });

        dropdown.appendChild(searchInput);
        dropdown.appendChild(list);
        dropdown.appendChild(footer);
        dropdown.appendChild(form);

        document.body.appendChild(dropdown);
        positionTextDropdown(dropdown, input);

        textDropdownState.activeDropdown = dropdown;
        textDropdownState.activeInput = input;
    };

    const openTextDropdown = async (input) => {
        if (!isTextReferenceInput(input)) return;
        // Toggle: if same input already active, close instead of reopening
        if (textDropdownState.activeInput === input && textDropdownState.activeDropdown) {
            closeTextDropdown();
            return;
        }
        const values = await fetchTextReferenceValues(input);
        renderTextDropdown(input, values);
    };

    document.addEventListener("click", (event) => {
        if (!textDropdownState.activeDropdown) return;
        const clickedInsideDropdown = textDropdownState.activeDropdown.contains(event.target);
        const clickedInput = event.target.closest(".value-input");
        const clickedTrigger = event.target.closest(".text-dropdown-trigger");
        if (clickedInsideDropdown) return;
        if (clickedInput && isTextReferenceInput(clickedInput)) return;
        if (clickedTrigger) return;
        closeTextDropdown();
    });

    document.addEventListener(
        "keydown",
        (event) => {
            if (!textDropdownState.activeDropdown) return;
            if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
            event.preventDefault();
            const items = Array.from(
                textDropdownState.activeDropdown.querySelectorAll(".text-dropdown__item")
            ).filter((el) => el.style.display !== "none");
            if (!items.length) return;
            let index = items.findIndex((el) => el.classList.contains("is-focused"));
            if (event.key === "ArrowDown") {
                index = (index + 1) % items.length;
            } else if (event.key === "ArrowUp") {
                index = index <= 0 ? items.length - 1 : index - 1;
            } else if (event.key === "Enter") {
                if (index === -1) index = 0;
                const item = items[index]?._textRefValue;
                if (item && textDropdownState.activeInput) {
                    applySelectedValue(textDropdownState.activeInput, item);
                }
                return;
            }
            items.forEach((el) => el.classList.remove("is-focused"));
            if (items[index]) {
                items[index].classList.add("is-focused");
                items[index].scrollIntoView({ block: "nearest" });
            }
        },
        true
    );

    const repositionActiveDropdown = () => {
        if (textDropdownState.activeDropdown && textDropdownState.activeInput) {
            positionTextDropdown(textDropdownState.activeDropdown, textDropdownState.activeInput);
        }
    };

    window.addEventListener("scroll", repositionActiveDropdown, true);
    window.addEventListener("resize", repositionActiveDropdown);

    let valueInputListenersBound = false;

    // for processing all fields once after render
    function addInputListeners() {
        const inputs = document.querySelectorAll(".value-input");
        inputs.forEach((input) => {
            if (isTextReferenceInput(input)) {
                fetchTextReferenceValues(input).then(() => processInput(input));
            } else {
                processInput(input);
            }
        });
    }

    // ✅ CKEditor initialization with proper button setup
    const editorInstances = new Map();
    const previousContentMap = new Map(); // ✅ Global map for storing previous content

    const initEditor = (uniqueTestId, interpretation) => {


        const editorElement = document.querySelector(`#editorContent-${uniqueTestId}`);

        if (!editorElement) {
            console.error(`Editor element not found: editorContent-${uniqueTestId}`);
            return;
        }

        // अगर editor पहले से exist करता है तो destroy करें
        if (editorInstances.has(uniqueTestId)) {
            editorInstances.get(uniqueTestId).destroy()
                .then(() => {
                    createNewEditor(uniqueTestId, interpretation, editorElement);
                });
        } else {
            createNewEditor(uniqueTestId, interpretation, editorElement);
        }
    };

    function createNewEditor(uniqueTestId, interpretation, editorElement) {
        // Safely check if CKEditor is available
        if (!window.CKEDITOR || !window.CKEDITOR.DecoupledEditor) {
            console.warn('CKEditor not available for editor:', uniqueTestId);
            return null;
        }

        const { DecoupledEditor } = window.CKEDITOR;

        DecoupledEditor.create(editorElement, {
            licenseKey: 'GPL',
            plugins: [
                window.CKEDITOR.Alignment,
                window.CKEDITOR.Autoformat,
                window.CKEDITOR.BlockQuote,
                window.CKEDITOR.Bold,
                window.CKEDITOR.Code,
                window.CKEDITOR.CodeBlock,
                window.CKEDITOR.Essentials,
                window.CKEDITOR.FindAndReplace,
                window.CKEDITOR.FontBackgroundColor,
                window.CKEDITOR.FontColor,
                window.CKEDITOR.FontFamily,
                window.CKEDITOR.FontSize,
                window.CKEDITOR.Heading,
                window.CKEDITOR.Highlight,
                window.CKEDITOR.HorizontalLine,
                window.CKEDITOR.ImageBlock,
                window.CKEDITOR.ImageCaption,
                window.CKEDITOR.ImageInline,
                window.CKEDITOR.ImageInsert,
                window.CKEDITOR.ImageResize,
                window.CKEDITOR.ImageStyle,
                window.CKEDITOR.ImageTextAlternative,
                window.CKEDITOR.ImageToolbar,
                window.CKEDITOR.Indent,
                window.CKEDITOR.IndentBlock,
                window.CKEDITOR.Italic,
                window.CKEDITOR.Link,
                window.CKEDITOR.LinkImage,
                window.CKEDITOR.List,
                window.CKEDITOR.ListProperties,
                window.CKEDITOR.MediaEmbed,
                window.CKEDITOR.PageBreak,
                window.CKEDITOR.Paragraph,
                window.CKEDITOR.RemoveFormat,
                window.CKEDITOR.SpecialCharacters,
                window.CKEDITOR.SpecialCharactersEssentials,
                window.CKEDITOR.Strikethrough,
                window.CKEDITOR.Subscript,
                window.CKEDITOR.Superscript,
                window.CKEDITOR.Table,
                window.CKEDITOR.TableToolbar,
                window.CKEDITOR.TextTransformation,
                window.CKEDITOR.TodoList,
                window.CKEDITOR.Underline,
                window.CKEDITOR.WordCount
            ],
            toolbar: {
                items: [
                    'undo', 'redo',
                    '|',
                    'heading',
                    '|',
                    'fontSize', 'fontFamily', 'fontColor', 'fontBackgroundColor',
                    '|',
                    'bold', 'italic', 'underline', 'strikethrough',
                    'subscript', 'superscript', 'code',
                    '|',
                    'link', 'insertImage', 'insertTable', 'mediaEmbed',
                    'blockQuote', 'codeBlock',
                    '|',
                    'alignment',
                    '|',
                    'bulletedList', 'numberedList', 'todoList',
                    'outdent', 'indent',
                    '|',
                    'specialCharacters', 'horizontalLine', 'pageBreak',
                    '|',
                    'highlight', 'removeFormat',
                    '|',
                    'findAndReplace'
                ],
                shouldNotGroupWhenFull: true
            },
            fontSize: {
                options: [10, 12, 14, 'default', 18, 20, 24, 30]
            },
            table: {
                contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells']
            },
            image: {
                toolbar: [
                    'imageTextAlternative', 'toggleImageCaption',
                    '|',
                    'imageStyle:inline', 'imageStyle:block', 'imageStyle:side',
                    '|',
                    'resizeImage'
                ]
            }
        })
            .then(editor => {
                editorInstances.set(uniqueTestId, editor);

                // ✅ Store original content in global map
                if (interpretation) {
                    editor.setData(interpretation);
                    previousContentMap.set(uniqueTestId, interpretation);
                }



                // Toolbar ko editor ke upar manually add karo
                const toolbarContainer = document.createElement('div');
                toolbarContainer.classList.add('custom-toolbar');
                editorElement.parentNode.insertBefore(toolbarContainer, editorElement);
                toolbarContainer.appendChild(editor.ui.view.toolbar.element);

                // ✅ CRITICAL: Button event listeners ko editor ready hone ke BAAD attach karo
                setupEditorButtons(uniqueTestId);
            })
            .catch(error => console.error(error));
    }

    // ✅ Separate function for button setup (called AFTER editor is ready)
    function setupEditorButtons(uniqueTestId) {
        const test = { _id: uniqueTestId }; // Get test object reference if needed
        // Get button references
        const saveAsDefaultButton = document.querySelector(`[data-editor-id="${uniqueTestId}"][data-action="save-default"]`);
        const saveTemplateButton = document.querySelector(`[data-editor-id="${uniqueTestId}"][data-action="save-template"]`);
        const restoreDefaultButton = document.querySelector(`[data-editor-id="${uniqueTestId}"][data-action="restore-default"]`);
        const restorePreviousButton = document.querySelector(`[data-editor-id="${uniqueTestId}"][data-action="restore-previous"]`);

        // ✅ Save as Default
        if (saveAsDefaultButton) {
            saveAsDefaultButton.addEventListener("click", () => {
                const userConfirmed = confirm("Are you sure you want to save this template as default?");
                if (!userConfirmed) return;

                const editorContent = getEditorContent(uniqueTestId);

                fetch(`${BASE_URL}/api/v1/user/updateTestInterpretation`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        testId: test._id,
                        interpretation: editorContent,
                    }),
                })
                    .then(response => response.json())
                    .then(data => {
                        showStatusMessage(
                            data ? "Content saved as default successfully!" : "Failed to save interpretation.",
                            data ? "success" : "error"
                        );
                    })
                    .catch(() => {
                        showStatusMessage("An error occurred while saving the interpretation.", "error");
                    });
            });
        }

        // ✅ Save Template
        if (saveTemplateButton) {
            saveTemplateButton.addEventListener("click", () => {
                const popup = document.createElement("div");
                popup.className = "popup-overlay";
                popup.innerHTML = `
                <div class="popup-content">
                    <h1>ADD New Template</h1>
                    <div class="popup-form">
                        <label for="templateName">* Template Name</label>
                        <input type="text" id="templateName" name="templateName" placeholder="Enter template name">
                    </div>
                    <button id="saveTemplate">Save</button>
                </div>
            `;

                document.body.appendChild(popup);

                const saveButton = popup.querySelector("#saveTemplate");
                saveButton.addEventListener("click", () => {
                    const templateName = document.getElementById("templateName").value;
                    const editorContent = getEditorContent(uniqueTestId);

                    fetch(`${BASE_URL}/api/v1/user/saveTestTemplate`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            testId: test._id,
                            templateName,
                            content: editorContent,
                        }),
                    })
                        .then(response => response.json())
                        .then(data => {
                            showStatusMessage(data.message || "Template saved successfully!", "success");
                            popup.remove();
                            addNewTemplate(templateName, editorContent, uniqueTestId);
                            fetchTemplates(uniqueTestId, test._id);
                        })
                        .catch(() => {
                            showStatusMessage("Failed to save template.", "error");
                        });
                });

                popup.addEventListener("click", (event) => {
                    if (event.target === popup) {
                        popup.remove();
                    }
                });
            });
        }

        // ✅ Restore Default
        if (restoreDefaultButton) {
            restoreDefaultButton.addEventListener("click", () => {
                const defaultContent = previousContentMap.get(uniqueTestId);
                if (defaultContent) {
                    setEditorContent(uniqueTestId, defaultContent);

                } else {
                    showStatusMessage("No default content available", "warn");
                }
            });
        }

        // ✅ Restore Previous
        if (restorePreviousButton) {
            restorePreviousButton.addEventListener("click", () => {
                const previousContent = previousContentMap.get(`${uniqueTestId}_previous`);
                if (previousContent) {
                    setEditorContent(uniqueTestId, previousContent);

                } else {
                    showStatusMessage("No previous content available", "warn");
                }
            });
        }
    }

    // Helper function: Get editor content safely
    function getEditorContent(uniqueTestId) {
        const editor = editorInstances.get(uniqueTestId);

        if (!editor) {
            console.warn(`Editor not found for: ${uniqueTestId}`);
            return '';
        }

        try {
            const data = editor.getData();
            return data || '';
        } catch (error) {
            console.error(`Error getting editor data for ${uniqueTestId}:`, error);
            return '';
        }
    }

    // Helper function: Set editor content safely
    function setEditorContent(uniqueTestId, content) {
        const editor = editorInstances.get(uniqueTestId);

        if (!editor) {
            console.warn(`Editor not found for: ${uniqueTestId}`);
            return false;
        }

        try {
            editor.setData(content || '');
            return true;
        } catch (error) {
            console.error(`Error setting editor data for ${uniqueTestId}:`, error);
            return false;
        }
    }

    // ✅ Modified fetchTemplates function
    async function fetchTemplates(uniqueTestId, testId) {
        const apiDataDiv = document.querySelector(`#apiData-${uniqueTestId}`);

        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/getTemplatesByTestId`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ testId }),
            });

            if (!response.ok) {

            }

            const responseData = await response.json();
            const templates = responseData?.data?.templates || [];

            if (templates.length === 0) {
                apiDataDiv.innerHTML = "No templates available.";
            } else {
                apiDataDiv.innerHTML = "";
                templates.forEach((template) => addTemplate(template, uniqueTestId));
            }
        } catch (error) {
            console.error("Error fetching templates:", error);
            apiDataDiv.innerHTML = "No templates available.";
        }
    }

    // ✅ Modified addTemplate function with proper event handling
    function addTemplate(template, uniqueTestId) {
        const apiDataDiv = document.querySelector(`#apiData-${uniqueTestId}`);
        const templateDiv = document.createElement("div");
        templateDiv.className = "template-item";

        const templateNameSpan = document.createElement("span");
        templateNameSpan.textContent = template.templateName;
        templateNameSpan.style.cursor = "pointer";
        templateNameSpan.setAttribute("title", "Double click to choose");

        // ✅ Template apply karne par previous content save karo
        templateNameSpan.addEventListener("click", () => {
            const currentContent = getEditorContent(uniqueTestId);

            // Store current content as previous
            previousContentMap.set(`${uniqueTestId}_previous`, currentContent);

            // Apply template content
            setEditorContent(uniqueTestId, template.content);


        });

        const deleteIcon = document.createElement("span");
        deleteIcon.textContent = "🗑️";
        deleteIcon.style.cursor = "pointer";
        deleteIcon.style.color = "red";
        deleteIcon.style.marginLeft = "10px";
        deleteIcon.setAttribute("title", "Double click to delete template");

        deleteIcon.addEventListener("click", () => deleteTemplate(template.templateName, templateDiv));

        templateDiv.appendChild(templateNameSpan);
        templateDiv.appendChild(deleteIcon);
        apiDataDiv.appendChild(templateDiv);
    }

    function addNewTemplate(templateName, content, uniqueTestId) {
        const template = { templateName, content };
        addTemplate(template, uniqueTestId);
    }

    function deleteTemplate(templateName, templateDiv) {
        fetch(`${BASE_URL}/api/v1/user/deleteTemplateByName`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ templateName }),
        })
            .then((response) => response.json())
            .then((data) => {
                if (data.ok) {
                    showStatusMessage(data.message || "Template deleted successfully!", "success");
                    templateDiv.remove();
                } else {
                    showStatusMessage(data.message || "Failed to delete template.", "error");
                }
            })
            .catch(() => {
                showStatusMessage("An error occurred while deleting the template.", "error");
            });
    }

    // Helper function: Destroy editor safely
    async function destroyEditor(uniqueTestId) {
        const editor = editorInstances.get(uniqueTestId);

        if (!editor) {
            console.warn(`Editor not found for destruction: ${uniqueTestId}`);
            return;
        }

        try {
            await editor.destroy();
            editorInstances.delete(uniqueTestId);

        } catch (error) {
            console.error(`❌ Error destroying editor ${uniqueTestId}:`, error);
            // Forcefully delete from map even if destroy fails
            editorInstances.delete(uniqueTestId);
        }
    }

    //for creating tables
    async function createTable(title, category, data, isPanel = false, hideCategory = false, panelDetails = null) {
        const section = document.createElement("div");
        section.classList.add("section");



        // Table heading (only if not hidden)
        if (!hideCategory) {
            const categoryHeading = document.createElement("h2");
            categoryHeading.textContent = category.category;
            categoryHeading.setAttribute('data-order', category.orderId);
            section.appendChild(categoryHeading);

            const heading = document.createElement("h3");
            heading.textContent = title;
            heading.setAttribute('data-order', panelDetails?.order || 999)
            section.appendChild(heading);
        }

        // Table
        const table = document.createElement("table");
        table.className = "table";
        const thead = document.createElement("thead");
        thead.innerHTML = `
        <tr>
            <th>P.B.</th>
            <th>Test</th>
            <th class="valueColumn">Value</th>
            <th>Unit</th>
            <th class="reference">Reference</th>
        </tr>
    `;
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        tbody.className = "tbody";
        const previousContentMap = {};
        let previousContent = '';
        for (const test of data) {
            if (test.isDocumentedTest) {

                const uniqueTestId = `${test._id}`; // Combine test._id and test.order for unique ID
                const row = document.createElement("tr");
                row.setAttribute("data-order", test.order);
                row.setAttribute("data-id", test._id);

                const detailsRow = document.createElement("tr");
                detailsRow.setAttribute("data-order", test.order);
                const pagebreakcell = document.createElement("td");
                pagebreakcell.innerHTML = '<input type="checkbox" id="pagebreak" name="pagebreak" tabindex="-1">';
                const detailsCell = document.createElement("td");
                detailsCell.colSpan = 4;
                detailsCell.style.width = "95%";

                const detailsDiv = document.createElement("div");
                detailsDiv.className = "editor-container";

                const editorDiv = document.createElement("div");
                editorDiv.id = `editorContent-${uniqueTestId}`;
                editorDiv.className = "editor-content";
                detailsDiv.appendChild(editorDiv);

                const apiDataDiv = document.createElement("div");
                apiDataDiv.id = `apiData-${uniqueTestId}`;
                apiDataDiv.className = "api-data";
                apiDataDiv.style.marginTop = "10px";
                apiDataDiv.textContent = "Loading additional data...";
                detailsDiv.appendChild(apiDataDiv);

                const buttonsDiv = document.createElement("div");
                buttonsDiv.className = "buttonsDiv";

                const createButton = (text, className, clickHandler, iconHTML = null) => {
                    const button = document.createElement("button");
                    button.className = className;
                    button.style.marginRight = "10px";

                    if (iconHTML) {
                        const iconElement = document.createElement("span");
                        iconElement.innerHTML = iconHTML;
                        button.appendChild(iconElement);
                    }

                    const textNode = document.createTextNode(text);
                    button.appendChild(textNode);

                    return button;
                };

                // ✅ Create buttons with data attributes
                const saveAsDefaultButton = createButton(
                    "Save as Default",
                    "save-as-default-btn",
                    null,
                    `<i class="fa-solid fa-floppy-disk"></i>`
                );
                saveAsDefaultButton.setAttribute('data-editor-id', uniqueTestId);
                saveAsDefaultButton.setAttribute('data-action', 'save-default');

                const saveTemplateButton = createButton(
                    "Save Template",
                    "save-template-btn",
                    null,
                    `<i class="fa-solid fa-circle-plus"></i>`
                );
                saveTemplateButton.setAttribute('data-editor-id', uniqueTestId);
                saveTemplateButton.setAttribute('data-action', 'save-template');

                const restoreDefaultButton = createButton(
                    "Restore Default",
                    "restore-default-btn",
                    null,
                    `<i class="fa-solid fa-rotate-right"></i>`
                );
                restoreDefaultButton.setAttribute('data-editor-id', uniqueTestId);
                restoreDefaultButton.setAttribute('data-action', 'restore-default');

                const restorePreviousButton = createButton(
                    "Restore Previous",
                    "restore-previous-btn",
                    null,
                    `<i class="fa-solid fa-rotate-right"></i>`
                );
                restorePreviousButton.setAttribute('data-editor-id', uniqueTestId);
                restorePreviousButton.setAttribute('data-action', 'restore-previous');

                buttonsDiv.appendChild(saveTemplateButton);
                buttonsDiv.appendChild(restoreDefaultButton);
                buttonsDiv.appendChild(restorePreviousButton);
                buttonsDiv.appendChild(saveAsDefaultButton);
                detailsDiv.appendChild(buttonsDiv);

                detailsCell.appendChild(detailsDiv);
                detailsRow.appendChild(pagebreakcell);
                detailsRow.appendChild(detailsCell);
                tbody.appendChild(detailsRow);

                // ✅ Initialize editor AND fetch templates
                setTimeout(() => {
                    initEditor(uniqueTestId, test.interpretation);

                    // Fetch templates after a small delay to ensure editor is ready
                    setTimeout(() => {
                        fetchTemplates(uniqueTestId, test._id);
                    }, 500);
                }, 1000);

                continue;
            }

            const { lowerValue, upperValue } = await getLowerUpperValues(patient, test.parameters[0]?.NormalValue);

            const row = document.createElement("tr");
            row.setAttribute("data-order", test.order); // Set a data attribute for sorting

            if (test.parameters && test.parameters.length > 1) {
                // Row for tests with multiple parameters
                row.innerHTML = `
                <td><input type="checkbox" id="pagebreak" name="pagebreak" tabindex="-1"></td>
                <td class="test-name"><div class="test-name-cell">${test.Name}</div></td>
                <td></td>
                <td></td>
                <td></td>
                    `;
                tbody.appendChild(row);

                // Rows for individual parameters
                for (const param of test.parameters) {
                    const { lowerValue, upperValue } = await getLowerUpperValues(patient, param?.NormalValue);
                    const paramRow = document.createElement("tr");
                    paramRow.setAttribute("data-order", test.order); // Set a data attribute for sorting
                    paramRow.innerHTML = `
        <td><input type="checkbox" id="pagebreak" name="pagebreak" tabindex="-1"></td>
        <td style="padding-left: 20px;" class="test-name" id="parameters"><div class="test-name-cell">${param.Para_name}</div></td>
        <td class="unit">
            <div class="value-column">
                <div class="formulaIcon"></div>
                <span class="HighLow"></span>
                <div class="value-field ${(param.ValueType || (param.text ? "text" : "numeric") || "numeric").toString().toLowerCase() === "text" ? "is-text-ref" : "is-numeric-ref"}">
                    <input type="text" 
                        name="parameterName" 
                        data-test-id="${test._id}" 
                        data-param-id="${param._id || ""}" 
                        data-master-param-key="${param.masterParameterKey || ""}"
                        data-param-name="${param.Para_name}" 
                        data-reference-type="${(param.ValueType || (param.text ? "text" : "numeric") || "numeric").toString().toLowerCase()}" 
                        data-Shortname="${test.Short_name}" 
                        data-id="${param.Para_name.replace(/\s+/g, '')}" 
                        data-lower="${lowerValue || ""}" 
                        data-upper="${upperValue || ""}"
                        data-for-random="${param.forRandom || false}"
                        data-lower-range="${param.lowerRange || ""}"
                        data-upper-range="${param.upperRange || ""}"
                        class="value-input" 
                        value="${param.defaultresult || ""}">
                    <button type="button" class="text-dropdown-trigger ${(param.ValueType || (param.text ? "text" : "numeric") || "numeric").toString().toLowerCase() === "text" ? "" : "placeholder-trigger"}" tabindex="-1">
                        <i class="fas fa-caret-down"></i>
                    </button>
                </div>
                <button class="add-remark" tabindex="-1">+</button>
            </div>
        </td>
        <td>${param.unit}</td>
        <td class="reference"><i class="fas fa-edit" onclick="openModal(this)"></i>${param?.text || (lowerValue && upperValue ? `${lowerValue} - ${upperValue}` : "")}</td>
    `;
                    tbody.appendChild(paramRow);
                    // Add remark functionality
                    const addRemarkButton = paramRow.querySelector(".add-remark");
                    const input = row.querySelector("input");
                    // processInput(input);

                    let paramRowCalc = null; // Pehle null se initialize karein

                    if (param.Para_name === "Basophils Percentage") {
                        paramRowCalc = document.createElement("tr");
                        paramRowCalc.setAttribute("data-order", test.order); // Set a data attribute for sorting
                        paramRowCalc.className = "exclude differential-total-row";

                        const paramRowDiv = document.createElement("td");
                        paramRowDiv.className = "differential-total-cell";
                        paramRowDiv.setAttribute("colSpan", "4");
                        paramRowCalc.appendChild(paramRowDiv);
                    }

                    // Sirf tab insert karein jab `paramRowCalc` exist kare
                    if (paramRowCalc) {
                        paramRow.parentNode.insertBefore(paramRowCalc, paramRow.nextSibling);
                    }

                    addRemarkButton.addEventListener("click", () => {
                        if (!addRemarkButton.remarkRow) {
                            const remarkRow = document.createElement("tr");
                            remarkRow.setAttribute("data-order", test.order); // Set a data attribute for sorting
                            remarkRow.innerHTML = `
                            <td></td>
                    <td>Remarks</td>
                    <td colspan="3">
                        <textarea id="remarkoftest"></textarea>
                        <i class="fa-solid fa-trash delete-row"></i>
                    </td>
                `;
                            tbody.insertBefore(remarkRow, paramRow.nextSibling);
                            addRemarkButton.style.display = "none";
                            addRemarkButton.remarkRow = remarkRow;

                            const deleteButton = remarkRow.querySelector(".delete-row");
                            deleteButton.addEventListener("click", () => {
                                remarkRow.remove();
                                addRemarkButton.style.display = "inline-block";
                                addRemarkButton.remarkRow = null;
                            });
                        }
                    });
                }

            } else {
                row.innerHTML = `
    <td><input type="checkbox" id="pagebreak" name="pagebreak" tabindex="-1"></td>
    <td class="test-name"><div class="test-name-cell">${test.Name}</div></td>
    <td class="unit">
        <div class="value-column">
            <div class="formulaIcon"></div>
            <span class="HighLow"></span>
            <div class="value-field ${(test.parameters?.[0]?.ValueType || (test.parameters?.[0]?.text ? "text" : "numeric") || "numeric").toString().toLowerCase() === "text" ? "is-text-ref" : "is-numeric-ref"}">
                <input type="text" 
                    name="valueInput" 
                    class="value-input" 
                    data-test-id="${test._id}" 
                    data-param-id="${test.parameters?.[0]?._id || ""}" 
                    data-master-param-key="${test.parameters?.[0]?.masterParameterKey || ""}"
                    data-param-name="${test.parameters?.[0]?.Para_name || test.Name}" 
                    data-reference-type="${(test.parameters?.[0]?.ValueType || (test.parameters?.[0]?.text ? "text" : "numeric") || "numeric").toString().toLowerCase()}" 
                    data-Shortname="${test.Short_name}" 
                    data-id="${test.Name}" 
                    data-lower="${lowerValue || ""}" 
                    data-upper="${upperValue || ""}"
                    data-for-random="${test.parameters?.[0]?.forRandom || false}"
                    data-lower-range="${test.parameters?.[0]?.lowerRange || ""}"
                    data-upper-range="${test.parameters?.[0]?.upperRange || ""}"
                    value="${test.parameters?.[0]?.defaultresult || ""}">
                <button type="button" class="text-dropdown-trigger ${(test.parameters?.[0]?.ValueType || (test.parameters?.[0]?.text ? "text" : "numeric") || "numeric").toString().toLowerCase() === "text" ? "" : "placeholder-trigger"}" tabindex="-1">
                    <i class="fas fa-caret-down"></i>
                </button>
            </div>
            <button class="add-remark" tabindex="-1">+</button>
        </div>
    </td>
    <td>${test.parameters?.[0]?.unit || ""}</td>
    <td class="reference"><i class="fas fa-edit" onclick="openModal(this)"></i>${test.parameters[0]?.text || (lowerValue && upperValue ? `${lowerValue} - ${upperValue}` : "")}</td>
`;
                tbody.appendChild(row);

                // Add remark functionality
                const addRemarkButton = row.querySelector(".add-remark");
                const input = row.querySelector("input");
                // processInput(input);

                let paramRowCalc = null; // Pehle null se initialize karein

                if (test.Name === "Basophils Percentage") {
                    paramRowCalc = document.createElement("tr");
                    paramRowCalc.setAttribute("data-order", test.order); // Set a data attribute for sorting
                    paramRowCalc.className = "exclude differential-total-row";

                    const paramRowDiv = document.createElement("td");
                    paramRowDiv.className = "differential-total-cell";
                    paramRowDiv.setAttribute("colSpan", "4");
                    paramRowCalc.appendChild(paramRowDiv);
                }

                // Sirf tab insert karein jab `paramRowCalc` exist kare
                if (paramRowCalc) {
                    row.parentNode.insertBefore(paramRowCalc, row.nextSibling);
                }

                addRemarkButton.addEventListener("click", () => {
                    if (!addRemarkButton.remarkRow) {
                        const remarkRow = document.createElement("tr");
                        remarkRow.setAttribute("data-order", test.order); // Set a data attribute for sorting
                        remarkRow.innerHTML = `
                        <td></td>
                        <td>Remarks</td>
                        <td colspan="3">
                            <textarea id="remarkoftest"></textarea>
                            <i class="fa-solid fa-trash delete-row"></i>
                        </td>
                    `;
                        tbody.insertBefore(remarkRow, row.nextSibling);
                        addRemarkButton.style.display = "none";
                        addRemarkButton.remarkRow = remarkRow;

                        const deleteButton = remarkRow.querySelector(".delete-row");
                        deleteButton.addEventListener("click", () => {
                            remarkRow.remove();
                            addRemarkButton.style.display = "inline-block";
                            addRemarkButton.remarkRow = null;
                        });
                    }
                });

            }

            // Panel-level hide flags should hide details for all child tests,
            // while unchecked panel flags should still respect each test's own hide setting.
            const panelHideMethodInstrument = isPanel
                ? panelDetails?.hideMethodInstrument
                : false;
            const testHideMethodInstrument = resolveStoredCheckboxFlag(
                test.hideMethodInstrument,
                test.hidemethodinstrument,
                test.panelVariables?.hideMethodInstrument,
                test.panelVariables?.hidemethodinstrument
            );
            const shouldHideMethodInstrument = panelHideMethodInstrument || testHideMethodInstrument;

            const panelHideInterpretation = isPanel
                ? resolveStoredCheckboxFlag(
                    panelDetails?.hideInterpretation,
                    panelDetails?.hideinterpretation,
                    panelDetails?.panelVariables?.hideInterpretation,
                    panelDetails?.panelVariables?.hideinterpretation
                )
                : false;
            const testHideInterpretation = resolveStoredCheckboxFlag(
                test.hideInterpretation,
                test.hideinterpretation,
                test.panelVariables?.hideInterpretation,
                test.panelVariables?.hideinterpretation
            );
            const shouldHideInterpretation = panelHideInterpretation || testHideInterpretation;

            const methodText = test.method.trim()? test.method.trim() : "";
            const instrumentText = test.instrument.trim()? test.instrument.trim() : "";

            const interpretationText = typeof test.interpretation === "string"
                ? test.interpretation.trim()
                : (typeof test.panelVariables?.interpretation === "string" ? test.panelVariables.interpretation.trim() : "");

            const detailBlocks = [];

            if (!shouldHideMethodInstrument) {
                if (methodText) {
                    detailBlocks.push(`<p class="methods">Method: ${methodText}</p>`);
                }
                if (instrumentText) {
                    detailBlocks.push(`<p class="methods">Instrument: ${instrumentText}</p>`);
                }
            }
            if (!shouldHideInterpretation && interpretationText) {
                detailBlocks.push(`<p>${interpretationText}</p>`);
            }

            if (detailBlocks.length > 0) {
                const detailsRow = document.createElement("tr");
                detailsRow.setAttribute("data-order", test.order);
                const detailsCell = document.createElement("td");
                detailsCell.colSpan = 4;

                const detailsDiv = document.createElement("div");
                detailsDiv.classList.add("test-details");
                detailsDiv.innerHTML = detailBlocks.join("");

                const pagebreakCell = document.createElement("td");
                pagebreakCell.innerHTML = '<input type="checkbox" id="pagebreak" name="pagebreak" tabindex="-1">';

                detailsCell.appendChild(detailsDiv);
                detailsRow.appendChild(pagebreakCell);
                detailsRow.appendChild(detailsCell);
                tbody.appendChild(detailsRow);
            }
        }

        // Add buttons for Notes, Advice, and Remarks
        const buttonsRow = document.createElement("tr");
        const buttonsCell = document.createElement("td");
        buttonsCell.colSpan = 4;
        buttonsCell.classList.add("table-buttons");

        const buttons = ["Add Notes", "Add Advice", "Add Remarks"];
        buttons.forEach((label) => {
            const button = document.createElement("button");
            button.textContent = label;
            button.classList.add("add-row-button");
            // Dynamically set tabindex="-1" to button
            button.setAttribute('tabindex', '-1');

            button.addEventListener("click", () => {
                if (!button.additionalRow) {
                    const additionalRow = document.createElement("tr");
                    additionalRow.innerHTML = `
                    <td></td>
                    <td>${label.split(" ")[1]}</td>
                    <td colspan="3">
                        <textarea></textarea>
                        <i class="fa-solid fa-trash delete-row"></i>
                    </td>
                `;
                    tbody.appendChild(additionalRow);
                    button.style.display = "none";
                    button.additionalRow = additionalRow;

                    const deleteButton = additionalRow.querySelector(".delete-row");
                    deleteButton.addEventListener("click", () => {
                        additionalRow.remove();
                        button.style.display = "inline-block";
                        button.additionalRow = null;
                    });
                }
            });

            buttonsCell.appendChild(button);
        });

        table.appendChild(tbody);
        buttonsRow.appendChild(buttonsCell);
        table.appendChild(buttonsRow);

        if (isPanel) {
            const hidePanelInterpretation = parseStoredCheckboxFlag(
                panelDetails.hidePanelInterpretation ?? panelDetails.hidepanelinterpretation
            );
            const shouldShowPanelInterpretation = !hidePanelInterpretation && Boolean(panelDetails.interpretation);

            if (shouldShowPanelInterpretation) {
                const interpretationrow = document.createElement("tr");
                const interpretationCell = document.createElement("td");
                interpretationCell.colSpan = 5;
                interpretationCell.classList.add("interpretation-row");
                const interpretationDiv = document.createElement("div");
                interpretationDiv.classList.add("interpretations");
                interpretationDiv.id = `displayArea-${panelDetails._id}`;
                interpretationDiv.innerHTML = `<h3 id="editButton-${panelDetails._id}">${panelDetails.interpretation ? 'Interpretations' : ''} <i class="fas fa-edit"></i></h3>
                <div class="pannelInterpretation" id="interpretationText-${panelDetails._id}">${panelDetails.interpretation || ""}</div>`;
                interpretationCell.appendChild(interpretationDiv);

                const editorDiv = document.createElement("div");
                editorDiv.id = `editorContainer-${panelDetails._id}`;
                editorDiv.classList.add("editorContainer");
                editorDiv.style.display = "none";  // Hide the editor initially
                editorDiv.innerHTML = `<div id="editor-${panelDetails._id}"></div>
                <button id="saveButton-${panelDetails._id}" tabindex="-1">Save</button>
                <button id="cancelButton-${panelDetails._id}" tabindex="-1">Cancel</button>`;
                interpretationCell.appendChild(editorDiv);

                interpretationrow.appendChild(interpretationCell);
                table.appendChild(interpretationrow);
                // table.appendChild(tbody);
            }
        }
        // table.appendChild(buttonsRow);
        section.appendChild(table);
        document.getElementById("tables-container").appendChild(section);
        if (isPanel) {
            const hidePanelInterpretation = parseStoredCheckboxFlag(
                panelDetails.hidePanelInterpretation ?? panelDetails.hidepanelinterpretation
            );
            const shouldShowPanelInterpretation = !hidePanelInterpretation && Boolean(panelDetails.interpretation);

            if (shouldShowPanelInterpretation) {
                await setupInterpretationEdit(panelDetails._id);
            }
        }
    }

    function generateRandomResults() {
        const tablecontainer = document.querySelectorAll("#tables-container .section table tbody tr:not(.exclude)");

        tablecontainer.forEach((row) => {
            const input = row.querySelector(".value-input");

            if (!input) return; // Agar input nahi hai to skip karo

            const testId = input.getAttribute('data-id');

            // ✅ NEW: Check forRandom attribute
            const forRandom = input.getAttribute('data-for-random');

            // ✅ If forRandom is not true, skip this field
            if (forRandom !== 'true') {
                return;
            }

            // Check karo ki ye formula-based test hai ya nahi
            const isFormulaTest = input.dataset.formulaField === "true" ||
                row.querySelector('.formulaIcon .icon');

            // Agar formula test hai to skip karo
            if (isFormulaTest) {
                return;
            }

            // ✅ NEW: Get lowerRange and upperRange instead of lowerValue and upperValue
            const lowerRange = parseFloat(input.getAttribute('data-lower-range'));
            const upperRange = parseFloat(input.getAttribute('data-upper-range'));

            // Agar lowerRange ya upperRange valid nahi hai to skip karo
            if (isNaN(lowerRange) || isNaN(upperRange)) {

                return;
            }

            // Range ke andar random number generate karo
            // Decimal places maintain karne ke liye
            const decimalPlaces = Math.max(
                (lowerRange.toString().split('.')[1] || '').length,
                (upperRange.toString().split('.')[1] || '').length
            );

            const randomValue = (Math.random() * (upperRange - lowerRange) + lowerRange).toFixed(decimalPlaces);

            // Input me value set karo
            input.value = randomValue;

            // Process input to apply styling (L/H indicators)
            processInput(input);

            // Formula calculations trigger karo agar zaroorat ho
            handleInputChange(input);
        });
    }

    // Button ko event listener attach karo (no change needed)
    document.getElementById("randomresult")?.addEventListener("click", function (event) {
        event.preventDefault();
        generateRandomResults();
    });

    // Set up listeners for parameter formulas 
    function setupListeners() {
        if (valueInputListenersBound) return;
        const tablesContainer = document.getElementById("tables-container");
        if (!tablesContainer) return;

        tablesContainer.addEventListener("click", (event) => {
            const trigger = event.target.closest(".text-dropdown-trigger");
            if (!trigger) return;
            const input = trigger.closest(".value-column")?.querySelector(".value-input");
            if (!isTextReferenceInput(input)) return;
            event.stopPropagation();
            openTextDropdown(input);
        });

        // Event delegation: single listener for all dynamic .value-input fields.
        tablesContainer.addEventListener("input", (event) => {
            const input = event.target.closest(".value-input");
            if (!input) return;
            if (isTextReferenceInput(input) && event.isTrusted) {
                input.dataset.isAbnormal = "false";
            }
            processInput(input);
            handleInputChange(input);
        });

        valueInputListenersBound = true;
    }

    function getDifferentialPercentageInputs() {
        return Array.from(document.querySelectorAll(".value-input")).filter((input) => {
            const parameterName =
                input.getAttribute("data-param-name") ||
                input.getAttribute("data-id") ||
                "";

            return DIFFERENTIAL_PERCENTAGE_FIELD_SET.has(
                normalizeFieldIdentity(parameterName)
            );
        });
    }

    function getDifferentialTotalCell() {
        return document.querySelector("tr.differential-total-row td");
    }

    function getDifferentialPercentageState() {
        const inputs = getDifferentialPercentageInputs();
        const hasExpectedInputs = inputs.length === DIFFERENTIAL_PERCENTAGE_FIELD_NAMES.length;
        const hasAnyValue = inputs.some((input) => input.value.trim() !== "");
        const total = inputs.reduce((sum, input) => sum + (parseFloat(input.value) || 0), 0);
        const isComplete = inputs.length > 0 && inputs.every((input) => input.value.trim() !== "");
        const isValid =
            hasExpectedInputs &&
            isComplete &&
            Math.abs(total - DIFFERENTIAL_TOTAL_TARGET) <= DIFFERENTIAL_TOTAL_TOLERANCE;

        return {
            inputs,
            total,
            hasAnyValue,
            hasExpectedInputs,
            isComplete,
            isValid,
        };
    }

    function updateDifferentialTotalCell(state) {
        const totalCell = getDifferentialTotalCell();
        if (!totalCell) return;

        totalCell.textContent = state.inputs.length
            ? `Total: ${state.total.toFixed(2)} / ${DIFFERENTIAL_TOTAL_TARGET.toFixed(2)}`
            : "";
        totalCell.classList.toggle("is-valid", state.hasAnyValue && state.isValid);
        totalCell.classList.toggle(
            "is-invalid",
            state.hasAnyValue && state.hasExpectedInputs && !state.isValid
        );
    }

    function focusDifferentialPercentageInputs(inputs) {
        if (!inputs.length) return;

        const targetInput =
            inputs.find((input) => input.value.trim() === "" || Number.isNaN(parseFloat(input.value))) ||
            inputs[0];
        const targetRow = targetInput.closest("tr") || targetInput;

        smoothScrollTo(targetRow);
        window.setTimeout(() => {
            targetInput.focus({ preventScroll: true });
            if (typeof targetInput.select === "function") {
                targetInput.select();
            }
        }, 220);
    }

    function syncDifferentialPercentageValidation(options = {}) {
        const { focusInvalid = false, showMessage = false } = options;
        const state = getDifferentialPercentageState();
        const shouldHighlight = state.hasAnyValue && state.hasExpectedInputs && !state.isValid;

        updateDifferentialTotalCell(state);

        state.inputs.forEach((input) => {
            input.classList.toggle("value-input--aggregate-error", shouldHighlight);
            input.closest("tr")?.classList.toggle("aggregate-invalid-row", shouldHighlight);
        });

        if (!shouldHighlight) {
            return true;
        }

        if (showMessage) {
            showStatusMessage(
                `Differential percentage total must be exactly 100 before final save. Current total: ${state.total.toFixed(2)}.`,
                "warn",
                4200
            );
        }

        if (focusInvalid) {
            focusDifferentialPercentageInputs(state.inputs);
        }

        return false;
    }

    // Handle input changes and update formula row
    function handleInputChange(resultInputs) {
        syncDifferentialPercentageValidation();
        const changedMasterKey = String(resultInputs?.dataset?.masterParamKey || "");
        if (changedMasterKey) {
            recalculateFormulaCascadeFromParam(changedMasterKey);
        }
    }
    window.__labReportHandleInputChange = handleInputChange;

    // for order in sequence heading, pannels, tests, tables
    async function groupTablesByCategory() {
        const container = document.getElementById("tables-container");
        const sections = Array.from(container.querySelectorAll(".section"));

        // Create a map to group sections by category
        const categoryMap = new Map();

        // 🟢 Step 1: Group sections by category
        for (const section of sections) {
            const categoryHeading = section.querySelector("h2");
            if (categoryHeading) {
                const category = categoryHeading.textContent;
                const dataOrder = categoryHeading.getAttribute("data-order");

                if (!categoryMap.has(category)) {
                    categoryMap.set(category, { sections: [], dataOrder });
                }

                // Preserve the h3 tag if it exists
                const h3Tag = section.querySelector("h3");
                const h3DataOrder = h3Tag?.getAttribute("data-order");

                // Remove the category heading (h2)
                categoryHeading.remove();

                // Move h3 tag above the first table if it exists
                const tables = section.querySelectorAll(".table");
                if (h3Tag && tables.length > 0) {
                    section.insertBefore(h3Tag, tables[0]);
                }

                // 🟢 Step 2: Sort rows inside all tables
                for (const table of tables) {
                    const tbody = table.querySelector("tbody");
                    if (tbody) {
                        const rows = Array.from(tbody.querySelectorAll(":scope > tr"));

                        // ✅ Sorting rows based on `data-order`
                        rows.sort((rowA, rowB) => {
                            const orderA = parseInt(rowA.getAttribute("data-order"), 10) || 9999;
                            const orderB = parseInt(rowB.getAttribute("data-order"), 10) || 9999;
                            return orderA - orderB;
                        });

                        // ✅ Clear existing rows and append sorted rows
                        tbody.innerHTML = "";
                        for (const row of rows) {
                            tbody.appendChild(row);
                        }
                    }
                }

                // Push section into category map
                categoryMap.get(category).sections.push({ section, h3DataOrder: h3DataOrder ? parseInt(h3DataOrder, 10) : null });
            }
        }

        // 🟢 Step 3: Clear the container and re-add grouped sections
        container.innerHTML = "";

        // Sort categories by `data-order`
        const sortedCategories = Array.from(categoryMap.entries()).sort(
            ([, { dataOrder: orderA }], [, { dataOrder: orderB }]) => (orderA || 0) - (orderB || 0)
        );

        // 🟢 Step 4: Append sorted categories and sections
        for (const [category, { sections, dataOrder }] of sortedCategories) {
            const groupedSection = document.createElement("div");
            groupedSection.classList.add("grouped-section");

            // Add category heading
            const categoryHeading = document.createElement("h2");
            categoryHeading.textContent = category;
            if (dataOrder) categoryHeading.setAttribute("data-order", dataOrder);
            groupedSection.appendChild(categoryHeading);

            // Sort sections by `h3DataOrder`
            const sortedSections = sections.sort(({ h3DataOrder: orderA }, { h3DataOrder: orderB }) => {
                if (orderA == undefined || orderA === 0) return 1;
                if (orderB == undefined || orderB === 0) return -1;
                return orderA - orderB;
            });

            // Append sorted sections
            for (const { section } of sortedSections) {
                groupedSection.appendChild(section);
            }

            container.appendChild(groupedSection);
        }
    }

    async function renderData() {
        // const data = await sendValueToDatabase();
        if (!testpanels) return;


        const { singleTests, panels } = testpanels;

        // Group in O(n) using map for faster rendering on large reports.
        const singleTestsByCategoryMap = new Map();

        singleTests.forEach((test) => {
            // Update uniqueTestArray2
            const index = uniquetestArray2.indexOf(test.Name);
            if (index > -1 && test.Short_name) {
                uniquetestArray2.splice(index, 1);
                uniquetestArray2.push(test.Short_name);
            }

            const key = test.category.category;
            if (!singleTestsByCategoryMap.has(key)) {
                singleTestsByCategoryMap.set(key, {
                    category: test.category, // store full category object
                    tests: []
                });
            }

            singleTestsByCategoryMap.get(key).tests.push(test);
        });
        const singleTestsByCategory = Array.from(singleTestsByCategoryMap.values());



        const matchedCategories = new Set();

        // Render panels and collect matched categories
        if (panels && panels.length > 0) {
            for (const panel of panels) {
                await createTable(
                    `${panel.name}`,
                    panel.category,
                    panel.testsId,
                    true,
                    false,
                    panel
                );

                matchedCategories.add(panel.category);
            }
        }

        // Render single tests whose categories are already matched
        for (const entry of singleTestsByCategory) {
            const { category, tests } = entry;
            if (matchedCategories.has(category.category)) {
                await createTable(category.category, category, tests, false, false);
            }
        }

        // Render single tests whose categories were not matched
        for (const entry of singleTestsByCategory) {
            const { category, tests } = entry;
            if (!matchedCategories.has(category.category)) {
                await createTable(category.category, category, tests);
            }
        }

        await groupTablesByCategory();
    }

    await renderData();
    await loadTenantFormulas();
    addIconsToMatchingRows();
    recalculateAllFormulas();
    setupListeners();
    addInputListeners();
    syncDifferentialPercentageValidation();
    await lisresult();
    await fetchEnteredResult();
    // await fetchEnteredResult();

    // for fetching previous results
    async function fetchEnteredResult() {
        const tablecontainer = document.querySelectorAll("#tables-container .section table tbody tr:not(.exclude)");

        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/getBookedTestById`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ BookingId: booking._id }),
            });

            const data = await response.json();
            const enteredValues = data.data?.EnteredValues || [];
            const enteredValuesById = new Map(enteredValues.map((entry) => [entry.TestinputId, entry]));

            for (const row of tablecontainer) {
                const checkbox = row.cells[0].querySelector('input[type="checkbox"]');
                const input = row.querySelector(".value-input");
                const editorContainer = row.querySelector("[id^='editorContent']");

                if (input) {
                    const dataId = input.getAttribute('data-id');
                    const matchingData = enteredValuesById.get(dataId);

                    checkbox.checked = matchingData?.pagebreak || false;

                    if (matchingData) {
                        input.value = matchingData.currentvalue;
                        // Restore abnormal flag for text references
                        if (matchingData.hasOwnProperty("isAbnormal")) {
                            input.dataset.isAbnormal = matchingData.isAbnormal ? "true" : "false";
                        }
                        processInput(input);
                        handleInputChange(input);
                    }
                }

                if (editorContainer) {
                    const editorId = editorContainer.id;
                    const uniqueTestId = editorId.replace('editorContent-', ''); // ✅ Extract uniqueTestId
                    const matchingData = enteredValuesById.get(editorId);
                    checkbox.checked = matchingData?.pagebreak || false;

                    if (matchingData && matchingData.isDocumented === "true") {
                        const trySetEditor = () => {
                            const success = setEditorContent(uniqueTestId, matchingData.currentvalue);
                            if (!success) {
                                requestAnimationFrame(() => setEditorContent(uniqueTestId, matchingData.currentvalue));
                            }
                        };
                        trySetEditor();
                    }
                }
            }

            syncDifferentialPercentageValidation();
            recalculateAllFormulas();
        } catch (error) {
            console.error("Error fetching entered results:", error);
        }
    }

    async function lisresult() {
        const getresultbutton = document.getElementById('getresult');
        const modifycase = document.getElementById('modifycase');
        const tablecontainer = document.querySelectorAll("#tables-container .section table tbody tr:not(.exclude)");
        const bootalert = document.querySelector(".alert");

        getresultbutton.style.display = "flex";

        getresultbutton.addEventListener("click", fetchlisresult);

        modifycase.addEventListener('click', function () {
            localStorage.setItem("regId", JSON.stringify(booking.bookingId));
            loadPage('editbooking', booking.bookingId);
        })

        async function fetchlisresult() {
            getresultbutton.disabled = true;
            try {
                const response = await fetch(`${BASE_URL}/api/v1/user/getbarcoderesult`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ barcodeIds: booking.acceptedbarcode })
                })

                const data = await response.json();


                if (!data.data) {
                    bootalert.classList.remove("fade", "alert-success");
                    bootalert.classList.add("show", "alert-danger");
                    bootalert.textContent = data.message;
                    setTimeout(() => {
                        bootalert.classList.remove("show");
                        bootalert.classList.add("fade");
                    }, 10000)
                    return;
                }

                const hasNonEmptyArray = Object.values(data.data).some(
                    arr => Array.isArray(arr) && arr.length > 0
                );

                if (data.status === "success" && hasNonEmptyArray) {
                    populatelisresult(data);
                    bootalert.classList.remove("fade", "alert-danger");
                    bootalert.classList.add("show", "alert-success");
                    bootalert.textContent = data.message;
                } else {
                    bootalert.classList.remove("fade", "alert-success");
                    bootalert.classList.add("show", "alert-danger");
                    bootalert.textContent = data.message;
                }

            } catch (error) {
                bootalert.classList.remove("fade", "alert-success");
                bootalert.classList.add("show", "alert-danger");
                bootalert.textContent = error.message;
            } finally {
                getresultbutton.disabled = false;
            }
            setTimeout(() => {
                bootalert.classList.remove("show");
                bootalert.classList.add("fade");
            }, 3000)
        }

        function populatelisresult(data) {
            const object = data.data;

            Object.entries(object).forEach(([Key, value]) => {
                value.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                value.forEach((element) => {

                    for (const row of tablecontainer) {
                        const input = row.querySelector(".value-input");

                        if (input) {
                            const shortName = input.getAttribute('data-Shortname');

                            // Find matching entry
                            if (element.lisData.hasOwnProperty(shortName)) {
                                input.value = element.lisData[shortName];
                                processInput(input);
                                handleInputChange(input);
                            }
                        }
                    }
                })
            });
        }
    }

    let reportedOnManuallyEdited = false;

    function getCurrentReportedOnValue() {
        return formatDateTimeLocal(new Date());
    }

    // for seeting default time in input fields
    function defaultdateandtime() {
        const reportedOnInput = document.getElementById('reportedOn');
        if (!reportedOnInput) return;

        reportedOnInput.value = getCurrentReportedOnValue();
        reportedOnManuallyEdited = false;
    }

    // for populating patient information
    function populateHea() {

        document.getElementById("booking-registeration-number").innerText = booking.bookingId;
        // document.getElementById("booking-registeration-number2").innerText = reg_id;
        const patientdetails = document.createElement("div");
        patientdetails.classList.add("report-details-innerDiv2");
        patientdetails.innerHTML = `<div class="left2">
                <div class="infor-div"><div class="tags">Patient Name:</div><div class="value-header">${booking.patientName}</div></div>
                <div class="infor-div"><div class="tags">Age / Sex:</div> <div class="value-header">${booking.year} / ${booking.gender}</div></div>
                <div class="infor-div"><div class="tags">Referred By:</div> <div class="value-header">${booking.doctorName}</div></div>
                <div class="infor-div"><div class="tags">Lab Name:</div> <div class="value-header">${booking.labName}</div></div>
                <div class="infor-div"><div class="tags">Investigations:</div> <div class="value-header">${uniquetestArray2}</div></div>
            </div>
            <div class="right2">
                <div class="registered-div2">
                    <div class="registeration-tag2">Registered on:</div>
                    <input name="DateTime" type="datetime-local" id="registeredOn" value="${getRegisteredOnValue()}">
                </div>
                <div class="registered-div2">
                    <div class="registeration-tag2">Collected on:</div>
                    <input name="DateTime" type="datetime-local" id="collectedOn" name="collectedOn" value="${getCollectedOnValue()}">
                </div>
                <div class="registered-div2">
                    <div class="registeration-tag2">Received on:</div>
                    <input name="DateTime" type="datetime-local" id="receivedOn" name="receivedOn" value="${recievedOn}">
                </div>
                <div class="registered-div2">
                    <div class="registeration-tag2">Reported on:</div>
                    <input name="DateTime" type="datetime-local" id="reportedOn" name="reportedOn">
                </div>
            </div>
            <div class="barcode-div2">
    <div class="barcode2" style="padding: 8px;">
        <div id="barcodeContainer2">
    <img id="barcodeImage"></img>
</div>
    </div>
</div>
`;

        document.querySelector(".report-details").appendChild(patientdetails);

        const reportedOnInput = document.getElementById('reportedOn');
        if (reportedOnInput) {
            reportedOnInput.addEventListener('input', () => {
                reportedOnManuallyEdited = true;
            });
            reportedOnInput.addEventListener('change', () => {
                reportedOnManuallyEdited = true;
            });
        }

        defaultdateandtime();
    }

    //initialization
    await populateHea();

    // for generating barcode
    async function barcodegenerator() {
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/generate-barcode`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ number: booking.acceptedbarcode[0] }),
            });

            if (response.ok) {
                const data = await response.json();
                // If your API returns an image URL
                document.getElementById("barcodeImage").src = data.barcode; // Display the barcode image
            } else {
                showStatusMessage("Failed to generate barcode!", "error");
            }
        } catch (error) {
            console.error("Error generating barcode:", error);
            showStatusMessage("An error occurred. Please try again.", "error");
        }
    }

    //initialization
    barcodegenerator();

    async function setupInterpretationEdit(index) {
        const editButton = document.getElementById(`editButton-${index}`);
        const saveButton = document.getElementById(`saveButton-${index}`);
        const cancelButton = document.getElementById(`cancelButton-${index}`);
        const displayArea = document.getElementById(`displayArea-${index}`);
        const editorContainer = document.getElementById(`editorContainer-${index}`);
        const interpretationText = document.getElementById(`interpretationText-${index}`);
        const editorElementId = `editor-${index}`;
        const editorKey = `panel-${index}`;

        if (editButton) {
            editButton.addEventListener('click', async function () {
                // ✅ Pehle existing editor ko destroy karo (agar exist karta hai)
                if (editorInstances.has(editorKey)) {
                    await editorInstances.get(editorKey).destroy();
                    editorInstances.delete(editorKey);
                }

                // ✅ Purane toolbar ko remove karo
                const existingToolbar = editorContainer.querySelector('.ck-toolbar-container');
                if (existingToolbar) {
                    existingToolbar.remove();
                }

                // ✅ Editor element ko clear karo
                const editorElement = document.querySelector(`#${editorElementId}`);
                if (editorElement) {
                    editorElement.innerHTML = '';
                }

                // Display area ko hide karo aur editor ko show karo
                displayArea.style.display = 'none';
                editorContainer.style.display = 'block';

                // ✅ CKEditor initialize karo - safely check first
                if (!window.CKEDITOR || !window.CKEDITOR.DecoupledEditor) {
                    console.error('CKEditor not available');
                    showStatusMessage('Editor not available. Please refresh the page.', 'error');
                    return;
                }

                const { DecoupledEditor } = window.CKEDITOR;

                try {
                    const editor = await DecoupledEditor.create(editorElement, {
                        licenseKey: 'GPL',
                        plugins: [
                            window.CKEDITOR.Alignment,
                            window.CKEDITOR.Autoformat,
                            window.CKEDITOR.BlockQuote,
                            window.CKEDITOR.Bold,
                            window.CKEDITOR.Code,
                            window.CKEDITOR.CodeBlock,
                            window.CKEDITOR.Essentials,
                            window.CKEDITOR.FindAndReplace,
                            window.CKEDITOR.FontBackgroundColor,
                            window.CKEDITOR.FontColor,
                            window.CKEDITOR.FontFamily,
                            window.CKEDITOR.FontSize,
                            window.CKEDITOR.Heading,
                            window.CKEDITOR.Highlight,
                            window.CKEDITOR.HorizontalLine,
                            window.CKEDITOR.ImageBlock,
                            window.CKEDITOR.ImageCaption,
                            window.CKEDITOR.ImageInline,
                            window.CKEDITOR.ImageInsert,
                            window.CKEDITOR.ImageResize,
                            window.CKEDITOR.ImageStyle,
                            window.CKEDITOR.ImageTextAlternative,
                            window.CKEDITOR.ImageToolbar,
                            window.CKEDITOR.Indent,
                            window.CKEDITOR.IndentBlock,
                            window.CKEDITOR.Italic,
                            window.CKEDITOR.Link,
                            window.CKEDITOR.LinkImage,
                            window.CKEDITOR.List,
                            window.CKEDITOR.ListProperties,
                            window.CKEDITOR.MediaEmbed,
                            window.CKEDITOR.PageBreak,
                            window.CKEDITOR.Paragraph,
                            window.CKEDITOR.RemoveFormat,
                            window.CKEDITOR.SpecialCharacters,
                            window.CKEDITOR.SpecialCharactersEssentials,
                            window.CKEDITOR.Strikethrough,
                            window.CKEDITOR.Subscript,
                            window.CKEDITOR.Superscript,
                            window.CKEDITOR.Table,
                            window.CKEDITOR.TableToolbar,
                            window.CKEDITOR.TextTransformation,
                            window.CKEDITOR.TodoList,
                            window.CKEDITOR.Underline,
                            window.CKEDITOR.WordCount
                        ],
                        toolbar: {
                            items: [
                                'undo', 'redo',
                                '|',
                                'heading',
                                '|',
                                'fontSize', 'fontFamily', 'fontColor', 'fontBackgroundColor',
                                '|',
                                'bold', 'italic', 'underline', 'strikethrough',
                                'subscript', 'superscript', 'code',
                                '|',
                                'link', 'insertImage', 'insertTable', 'mediaEmbed',
                                'blockQuote', 'codeBlock',
                                '|',
                                'alignment',
                                '|',
                                'bulletedList', 'numberedList', 'todoList',
                                'outdent', 'indent',
                                '|',
                                'specialCharacters', 'horizontalLine', 'pageBreak',
                                '|',
                                'highlight', 'removeFormat',
                                '|',
                                'findAndReplace'
                            ],
                            shouldNotGroupWhenFull: true
                        },
                        table: {
                            contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells']
                        },
                        placeholder: 'Type your content here...'
                    });

                    // ✅ Toolbar ko manually attach karo
                    const toolbarContainer = document.createElement('div');
                    toolbarContainer.classList.add('ck-toolbar-container');
                    editorContainer.insertBefore(toolbarContainer, editorElement);
                    toolbarContainer.appendChild(editor.ui.view.toolbar.element);

                    // ✅ Editor instance ko store karo
                    editorInstances.set(editorKey, editor);

                    // ✅ Initial content set karo
                    if (interpretationText?.innerHTML) {
                        editor.setData(interpretationText.innerHTML);
                    }


                } catch (error) {
                    console.error('❌ Error initializing CKEditor:', error);
                }
            });

            saveButton.addEventListener('click', async function () {
                const content = getEditorContent(editorKey);
                if (content !== null) {
                    interpretationText.innerHTML = content;
                }

                // Editor ko destroy karo
                await destroyEditor(editorKey);

                editorContainer.style.display = 'none';
                displayArea.style.display = 'block';
            });

            cancelButton.addEventListener('click', async function () {
                // Editor ko destroy karo bina content save kiye
                await destroyEditor(editorKey);

                editorContainer.style.display = 'none';
                displayArea.style.display = 'block';
            });
        }
    }

    // for getting reference lower and upper value
    async function getLowerUpperValues(patient, defaultresults) {

        if (!patient || !defaultresults || defaultresults.length === 0) {
            return "";
        }
        // Helper function to convert age to days based on the unit
        const convertToDays = (age, unit) => {
            if (unit === "Years" || unit === "years") return age * 365;
            if (unit === "Months" || unit === "months") return age * 30;
            if (unit === "Days" || unit === "days") return age;
            return 0; // Unknown unit
        };

        // Extract patient age and unit, then convert to days
        const [patientAge, patientAgeUnit] = patient.age.split(" ");
        const patientAgeInDays = convertToDays(parseInt(patientAge), patientAgeUnit);

        for (const result of defaultresults) {
            // Convert minAge and maxAge in result to days
            const minAgeInDays = convertToDays(parseInt(result.minAge), result.minAgeUnit);
            const maxAgeInDays = convertToDays(parseInt(result.maxAge), result.maxAgeUnit);

            // Check if gender and age (in days) fall within the criteria
            if (
                (result.gender === "Any" || result.gender === patient.gender) &&
                patientAgeInDays >= minAgeInDays &&
                patientAgeInDays <= maxAgeInDays
            ) {
                return { lowerValue: result.lowerValue, upperValue: result.upperValue };
            }
        }

        // If no match is found, return null or an appropriate message
        return "";
    }

    // Fixed extractTableData function - All rows ka pagebreak track
    function extractTableData() {
        const tables = document.querySelectorAll("#tables-container .section table");
        const allTableData = [];

        tables.forEach((table) => {
            const category = table.closest(".grouped-section").querySelector("h2")?.textContent || "Unknown Category";
            const title = table.closest(".section").querySelector("h3")?.textContent || "Unknown Title";

            const rows = table.querySelectorAll("tbody tr:not(.exclude)");
            const tableData = [];
            let tableNotes = null;
            let tableRemarks = null;
            let tableAdvice = null;
            let tableInterpretation = null;

            let lastTestObject = null;

            rows.forEach((row) => {
                // ✅ Har row ke liye pagebreak check karo
                const pagebreak = row?.cells[0]?.querySelector('input[type="checkbox"]')?.checked || false;

                const testName = row.querySelector(".test-name")?.outerHTML || null;
                const inputEl = row.querySelector(".unit input");
                const valueInput = inputEl?.value || null;
                const unit = row.querySelector(".unit + td")?.textContent?.trim() || null;
                const reference = row.querySelector(".reference")?.textContent?.trim() || null;
                const referenceType = (inputEl?.dataset.referenceType || "numeric").toLowerCase();
                const lowerValue = parseFloat(inputEl?.getAttribute('data-lower'));
                const upperValue = parseFloat(inputEl?.getAttribute('data-upper'));
                let isAbnormal = inputEl?.dataset.isAbnormal === "true";
                let isBold = false;

                if (referenceType === "text") {
                    isBold = isAbnormal;
                } else {
                    const numericValue = parseFloat(valueInput);
                    const positive = (valueInput || "").toLowerCase() === "positive";
                    if (positive) {
                        isBold = true;
                        isAbnormal = true;
                    } else if (!isNaN(numericValue)) {
                        if (!isNaN(lowerValue) && numericValue < lowerValue) { isBold = true; isAbnormal = true; }
                        if (!isNaN(upperValue) && numericValue > upperValue) { isBold = true; isAbnormal = true; }
                    }
                }

                // Check for CKEditor in the row
                const editorContainer = row.querySelector("[id^='editorContent']");
                let editorContent = null;
                let isDocumented = false;

                if (editorContainer) {
                    const editorId = editorContainer.id;
                    const uniqueTestId = editorId.replace('editorContent-', '');
                    editorContent = getEditorContent(uniqueTestId);
                    if (editorContent) {
                        isDocumented = true;
                    }
                }

                // ✅ Main test row
                if (testName || valueInput || unit || reference || editorContent) {

                    const testObject = {
                        pagebreak: pagebreak,
                        testName: editorContent || testName,
                        value: valueInput,
                        unit,
                        reference,
                        referenceType,
                        isAbnormal,
                        isBold,
                        isDocumented,
                    };

                    tableData.push(testObject);
                    lastTestObject = testObject;
                } else {
                    // ✅ Detail/Remark/Notes rows - Ab yahan bhi separate objects banayenge
                    const colspanCell = row.querySelector("[colspan='3'], [colspan='4'], [colspan='5']");
                    if (colspanCell) {
                        // Individual test remark
                        if (colspanCell.querySelector("#remarkoftest")) {
                            const value = colspanCell.querySelector("#remarkoftest").value;

                            // ✅ Remark ko separate object banao with pagebreak
                            const remarkObject = {
                                pagebreak: pagebreak,
                                testName: null,
                                value: null,
                                unit: null,
                                reference: null,
                                isDocumented: false,
                                remark: value  // ✅ Remark property add
                            };

                            tableData.push(remarkObject);
                            lastTestObject = remarkObject; // Update lastTestObject
                        }
                        // Table-level remarks/advice/notes
                        else if (colspanCell.querySelector("textarea")) {
                            const value = colspanCell.querySelector("textarea").value;
                            const labelText = colspanCell.previousElementSibling?.textContent?.toLowerCase() || "";

                            if (labelText.includes("remarks")) {
                                tableRemarks = value;
                            } else if (labelText.includes("advice")) {
                                tableAdvice = value;
                            } else if (labelText.includes("notes")) {
                                tableNotes = value;
                            }
                        }
                        // Test details
                        else {
                            const innerContent = colspanCell.querySelector(".test-details")?.innerHTML;
                            if (innerContent) {
                                // ✅ Details ko separate object banao with pagebreak
                                const detailObject = {
                                    pagebreak: pagebreak,
                                    testName: null,
                                    value: null,
                                    unit: null,
                                    reference: null,
                                    isDocumented: false,
                                    details: innerContent  // ✅ Details property add
                                };

                                tableData.push(detailObject);
                                lastTestObject = detailObject; // Update lastTestObject
                            }
                        }
                    }
                }
            });

            // Check for Interpretation row
            const interpretationRow = Array.from(table.querySelectorAll("tr")).find(row =>
                row.querySelector(".interpretation-row")
            );

            if (interpretationRow) {
                const interpretationCell = interpretationRow.querySelector(".interpretations");
                if (interpretationCell) {
                    tableInterpretation = interpretationCell.querySelector(".pannelInterpretation")?.innerHTML?.trim() || null;
                }
            }

            if (tableData.length > 0 || tableNotes || tableRemarks || tableAdvice || tableInterpretation) {
                allTableData.push({
                    category,
                    title,
                    tests: tableData,
                    notes: tableNotes,
                    remarks: tableRemarks,
                    advice: tableAdvice,
                    interpretation: tableInterpretation,
                });
            }
        });

        return allTableData;
    }

    // for saving data 
    async function saveTablesToDatabase(saveOnly) {
        const extractedData = extractTableData();
        delete booking.__v;
        delete booking.updatedAt;
        delete booking._id;
        delete booking.createdAt;
        delete booking.tableData;

        const collectedOn = document.getElementById('collectedOn').value;
        const receivedOn = document.getElementById('receivedOn').value;
        const reportedOn = document.getElementById('reportedOn').value;
        const categorized = document.getElementById('check1').checked;
        const moredetails = document.getElementById('moredetails').value;

        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/saveReportData`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    reportData: extractedData, reg_id: booking.bookingId, booking,
                    collectedOn, receivedOn, reportedOn, categorized, moredetails,
                    uniquetestArray: uniquetestArray2, isdocumented
                }),
            });

            if (!response.ok) {
                showStatusMessage("Failed to save report data.", "error");
                return false;
            }

            if (response.ok && saveOnly) {
                const result = await response.json();

                const barcodeId = result._id;
                showStatusMessage("Report saved successfully. Opening report page...", "success");
                // return;
                const url = `${BASE_URL}/${user.role === "staff" ? "admin" : "admin"}/admin.html?page=${user.role === "staff" ? user.tenantId.adminDetails.userId.pdfFormat : user.pdfFormat}&value1=${barcodeId}`;
                window.location.href = url;
                return true;
            }
            showStatusMessage("Report saved successfully.", "success");
            return true;
        } catch (error) {
            console.error("Error saving tables to database:", error);
            showStatusMessage("An error occurred while saving the tables. Please try again.", "error");
            return false;
        }
    }

    // for checking empty fields
    async function checkFields(savebtn) {
        const AllFields = document.querySelectorAll("#tables-container .section table tbody tr:not(.exclude)");
        const AllFieldsArray = [];
        let hasAnyEnteredValue = false;

        if (savebtn && !syncDifferentialPercentageValidation({ focusInvalid: true, showMessage: true })) {
            return false;
        }

        for (let field of AllFields) {
            const pb = field.cells[0].querySelector('input[type="checkbox"]')?.checked;
            const input = field.querySelector('.value-input');
            const editorContainer = field.querySelector("[id^='editorContent']");

            if (editorContainer) {
                const editorId = editorContainer.id;
                const uniqueTestId = editorId.replace('editorContent-', ''); // ✅ Extract uniqueTestId

                // ✅ CKEditor se data lena
                const editorContent = getEditorContent(uniqueTestId);

                // Debug

                if (editorContent) {
                    hasAnyEnteredValue = true;
                    isdocumented = true;
                    const data = {
                        currentvalue: editorContent,
                        TestinputId: editorId, // Full editor ID save karein
                        isDocumented: "true",
                        pagebreak: pb
                    }
                    AllFieldsArray.push(data);
                }
            } else if (input) {
                const data_id = input.getAttribute('data-id');
                const value = input.value.trim();
                if (value !== "") {
                    hasAnyEnteredValue = true;
                }
                const referenceType = (input.dataset.referenceType || "numeric").toLowerCase();
                const lowerValue = parseFloat(input.getAttribute('data-lower'));
                const upperValue = parseFloat(input.getAttribute('data-upper'));
                let isAbnormal = input.dataset.isAbnormal === "true";
                let isBold = false;

                if (referenceType === "text") {
                    isBold = isAbnormal;
                } else {
                    const numericValue = parseFloat(value);
                    const positive = value.toLowerCase() === "positive";
                    if (positive) {
                        isBold = true;
                    } else if (!isNaN(numericValue)) {
                        if (!isNaN(lowerValue) && numericValue < lowerValue) isBold = true;
                        if (!isNaN(upperValue) && numericValue > upperValue) isBold = true;
                    }
                }

                const data = {
                    currentvalue: value,
                    TestinputId: data_id,
                    isDocumented: "false",
                    pagebreak: pb,
                    isAbnormal,
                    isBold,
                    referenceType
                }
                AllFieldsArray.push(data);
            }
        }

        if (savebtn && !hasAnyEnteredValue) {
            showStatusMessage("सभी result fields खाली हैं। Final save करने से पहले कम से कम एक value भरें।", "warn");
            const firstInput = document.querySelector("#tables-container .value-input");
            if (firstInput) {
                smoothScrollTo(firstInput.closest("tr") || firstInput);
                firstInput.focus({ preventScroll: true });
            }
            return false;
        }

        if (AllFieldsArray.length >= 0) {
            const id = JSON.parse(localStorage.getItem("booking"))._id;

            try {
                const response = await fetch(`${BASE_URL}/api/v1/user/saveOrUpdateBookedTest`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ BookingId: id, EnteredValues: AllFieldsArray }),
                });

                if (response.ok) {
                    const res = await response.json();
                } else {
                    showStatusMessage("Failed to update entered values.", "error");
                }
            } catch (error) {
                console.error("Error saving tables to database:", error);
                showStatusMessage("Failed to update entered values.", "error");
            }
            return true;
        }
    }

    // for scrolling animation
    function smoothScrollTo(element) {
        const elementRect = element.getBoundingClientRect();
        const targetPosition = elementRect.top + window.scrollY - (window.innerHeight / 2) + (elementRect.height / 2);
        const startPosition = window.scrollY;
        const distance = targetPosition - startPosition;
        const duration = 600; // Adjust for smoother effect
        let startTime = null;

        function animation(currentTime) {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const progress = Math.min(timeElapsed / duration, 1);

            window.scrollTo(0, startPosition + distance * easeInOutCubic(progress));

            if (timeElapsed < duration) {
                requestAnimationFrame(animation);
            }
        }

        function easeInOutCubic(t) {
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        requestAnimationFrame(animation);
    }

    async function editdoctorsvisibility() {
        const showlab = document.getElementById('labsign').checked;
        const showfirstdoctor = document.getElementById('firstdoctor').checked;
        const showseconddoctor = document.getElementById('seconddoctor').checked;
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/editdoctorsvisibility`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json', // Specify JSON format
                },
                body: JSON.stringify({ showlab, showfirstdoctor, showseconddoctor }),
            });

            if (response.ok) {

            } else {
                showStatusMessage("Failed to update doctor visibility.", "error");
            }

        } catch (error) {
            showStatusMessage(error.message, "error")
        }
    }

    // Add an event listener for the submit button to trigger the API call
    document.getElementById("finalBtn").addEventListener("click", async (event) => {
        event.preventDefault(); // Prevent default form submission
        event.target.disabled = true;
        const reportedOnInput = document.getElementById('reportedOn');
        if (reportedOnInput && (!reportedOnManuallyEdited || !reportedOnInput.value)) {
            reportedOnInput.value = getCurrentReportedOnValue();
        }
        const returned = await checkFields(true);
        if (!returned) {
            event.target.disabled = false;
            return;
        }
        await editdoctorsvisibility();
        await saveTablesToDatabase(true);
        event.target.disabled = false;
    });
    // Add an event listener for the submit button to trigger the API call
    document.getElementById("saveBtn").addEventListener("click", async (event) => {
        event.preventDefault(); // Prevent default form submission
        event.target.disabled = true;
        const returned = await checkFields(false);
        if (!returned) {
            event.target.disabled = false;
            return;
        }
        await editdoctorsvisibility();
        await saveTablesToDatabase(false);
        event.target.disabled = false;
    });

    // Ensure the buttons container starts hidden
    document.getElementById("buttons-container").style.display = "none";

    // Add event listener to the main container
    const reorderContainerElement = document.getElementById("reorder-container");
    if (reorderContainerElement) {
        reorderContainerElement.addEventListener("click", function () {
            const buttonsContainer = document.getElementById("buttons-container");
            // Toggle the visibility of the buttons container
            if (buttonsContainer && (buttonsContainer.style.display === "none" || buttonsContainer.style.display === "")) {
                buttonsContainer.style.display = "flex";
            } else if (buttonsContainer) {
                buttonsContainer.style.display = "none";
            }
        });
    }

    // Add event listener to the document to hide the buttons container on outside click
    document.addEventListener("click", function (event) {
        const buttonsContainer = document.getElementById("buttons-container");
        const reorderContainer = document.getElementById("reorder-container");

        // Hide the buttons container if clicked outside
        if (
            buttonsContainer &&
            reorderContainer &&
            buttonsContainer.style.display === "flex" &&
            !reorderContainer.contains(event.target) &&
            !buttonsContainer.contains(event.target)
        ) {
            buttonsContainer.style.display = "none";
        }
    });

    // Add event listeners for the buttons
    document.getElementById("reorder-tables").addEventListener("click", function () {
        window.open(`${BASE_URL}/admin.html?page=test&value1=&value2=`, '_blank');
    });

    document.getElementById("reorder-categories").addEventListener("click", function () {
        window.open(`${BASE_URL}/admin.html?page=categories&value1=&value2=`, '_blank');
    });

    document.getElementById("reorder-pannels").addEventListener("click", function () {
        window.open(`${BASE_URL}/admin.html?page=testPanels&value1=&value2=`, '_blank');
    });

    async function populatedoctorvisibility() {
        try {
            // Send a POST request to the API with value1 in the request body
            const response = await fetch(`${BASE_URL}/api/v1/user/getDoctorsSign`);

            // Check if the response is okay
            if (!response.ok) {
                throw new Error('Failed to fetch data from API');
            }

            // Parse the response JSON
            const data = await response.json();

            document.getElementById('labsign').checked = data.showlabinchargesign;
            document.getElementById('firstdoctor').checked = data.showfirstdoctorsign;
            document.getElementById('seconddoctor').checked = data.showseconddoctorsign;

        } catch (error) {

        }
    }
    populatedoctorvisibility();
}

async function initialization() {
    const loader = document.querySelector(".loader");
    loader.style.display = "flex";
    try {
        await loadfunction();
    } catch (error) {

    } finally {
        loader.style.display = "none";
    }
}

initialization();

// Function to open the modal
function openModal(button) {
    const modalElement = document.getElementById('modal');
    const contentBox = document.getElementById('content-box');
    if (contentBox) {
        contentBox.classList.add('reference-modal-active');
    }
    modalElement.style.display = 'flex';
    // Get the row of the clicked button
    const row = button.closest('tr');
    const valueInput = row?.querySelector('.value-input');
    // Prefer the bound parameter name from the row to avoid mismatches with display text.
    const firstColumnValue = valueInput?.dataset?.paramName || row?.cells?.[1]?.innerText?.trim() || "";
    const testId = valueInput?.dataset?.testId || "";
    const parameterId = valueInput?.dataset?.paramId || "";
    const modal = document.getElementById('modal');
    if (modal) {
        modal.dataset.referenceTestName = firstColumnValue;
        modal.dataset.referenceTestId = testId;
        modal.dataset.referenceParamId = parameterId;
    }
    fetchDefaultResults({
        testName: firstColumnValue,
        testId,
        parameterId
    });
    // Trigger data collection and send when needed
    const submitBtn = document.getElementById('submit-button');
    submitBtn.onclick = function () {
        gatherFormData({
            testName: firstColumnValue,
            testId,
            parameterId
        });
    };
}

// Function to close the modal
function closeModal() {
    const modalElement = document.getElementById('modal');
    const contentBox = document.getElementById('content-box');
    if (modalElement) {
        modalElement.style.display = 'none';
    }
    if (contentBox) {
        contentBox.classList.remove('reference-modal-active');
    }
}

// Close the modal if clicked outside the form-section
window.onclick = function (event) {
    const modal = document.getElementById('modal');
    const formSection = document.querySelector('.form-section');
    if (event.target === modal && !formSection.contains(event.target)) {
        closeModal();
    }
}

// edit range code ---------------------------------------------------------------------------

//for only add edit reference value
function toggleForm(selectElement) {
    const formContainer = document.getElementById('form-container');
    const textArea = document.getElementById('text-area');
    const addMoreBtn = document.getElementById('add-more-btn');

    if (selectElement.value === 'text') {
        formContainer.style.display = 'none';
        textArea.style.display = 'block';
        addMoreBtn.style.display = 'none'; // Hide Add more button
    } else {
        formContainer.style.display = 'block';
        textArea.style.display = 'none';
        addMoreBtn.style.display = 'flex'; // Show Add more button
    }
}

// for adding numeric row in reference 
function addRow() {
    const formContainer = document.getElementById('form-container');

    // Clone the first row if it exists, otherwise create a new row
    let newRow;
    if (formContainer.firstElementChild) {
        newRow = formContainer.firstElementChild.cloneNode(true);
    } else {
        newRow = document.createElement('div');
        newRow.className = 'row-container';
        newRow.innerHTML = `
            <span class="delete-btn" onclick="deleteRow(this)">🗑️</span>
            <div class="row-item">
                <label for="sex">Sex</label>
                <select name="sex" class="sex">
                    <option value="Any" >Any</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                </select>
            </div>
            <div class="row-item">
                <label for="min_age">Min. Age</label>
                <input type="number" name="min_age" class="min-age" value="">
            </div>
            <div class="row-item">
                <label for="min_age_unit">Min Age Unit</label>
                <select name="min_age_unit">
                    <option value="Years" >Years</option>
                    <option value="Months" >Months</option>
                    <option value="Days">Days</option>
                </select>
            </div>
            <div class="row-item">
                <label for="max_age">Max. Age</label>
                <input type="number" name="max_age" class="max-age" value="">
            </div>
            <div class="row-item">
                <label for="max_age_unit">Max Age Unit</label>
                <select name="max_age_unit">
                    <option value="Years" >Years</option>
                    <option value="Months" >Months</option>
                    <option value="Days" >Days</option>
                </select>
            </div>
            <div class="row-item">
                <label for="lower_value">Lower Value</label>
                <input type="number" name="lower_value" class="lower-value" value="" oninput="updateReportDisplay(this)">
            </div>
            <div class="row-item">
                <label for="upper_value">Upper Value</label>
                <input type="number" name="upper_value" class="upper-value" value="" oninput="updateReportDisplay(this)">
            </div>
            <div class="row-item">
                <label for="display_report">Display report</label>
                <span class="display-report"> - </span>
            </div>
        `;
    }

    // Reset the values in the new row
    newRow.querySelector('.min-age').value = "";
    newRow.querySelector('.max-age').value = "";
    newRow.querySelector('.lower-value').value = "";
    newRow.querySelector('.upper-value').value = "";

    // Append the new row to the form container
    formContainer.appendChild(newRow);
}

//for deleting row
function deleteRow(element) {
    const formContainer = document.getElementById('form-container');
    if (formContainer.childElementCount > 1) {
        element.parentElement.remove();
    }
}

function getCurrentReferencePatient() {
    const booking = JSON.parse(localStorage.getItem("booking") || "null");
    return {
        age: booking?.year || "",
        gender: booking?.gender || ""
    };
}

function convertReferenceAgeToDays(age, unit) {
    const numericAge = parseInt(age, 10);
    if (Number.isNaN(numericAge)) return 0;
    if (unit === "Years" || unit === "years") return numericAge * 365;
    if (unit === "Months" || unit === "months") return numericAge * 30;
    if (unit === "Days" || unit === "days") return numericAge;
    return 0;
}

function resolveDisplayedReference(dataObject = [], patient = {}) {
    const patientAgeText = String(patient.age || "").trim();
    const [patientAge = "", patientAgeUnit = "years"] = patientAgeText.split(" ");
    const patientAgeInDays = convertReferenceAgeToDays(patientAge, patientAgeUnit);

    for (const result of Array.isArray(dataObject) ? dataObject : []) {
        const minAgeInDays = convertReferenceAgeToDays(result.minAge, result.minAgeUnit);
        const maxAgeInDays = convertReferenceAgeToDays(result.maxAge, result.maxAgeUnit);
        const genderMatches = result.gender === "Any" || result.gender === patient.gender;
        const ageMatches = patientAgeInDays >= minAgeInDays && patientAgeInDays <= maxAgeInDays;

        if (genderMatches && ageMatches) {
            return {
                text: [result.lowerValue, result.upperValue].filter(Boolean).join(" - ") || "-",
                lowerValue: result.lowerValue || "",
                upperValue: result.upperValue || ""
            };
        }
    }

    const firstResult = Array.isArray(dataObject) ? dataObject[0] : null;
    if (firstResult) {
        return {
            text: [firstResult.lowerValue, firstResult.upperValue].filter(Boolean).join(" - ") || "-",
            lowerValue: firstResult.lowerValue || "",
            upperValue: firstResult.upperValue || ""
        };
    }

    return {
        text: "-",
        lowerValue: "",
        upperValue: ""
    };
}

function refreshReferenceComparisonEffects(input) {
    if (!input) return;

    window.__labReportProcessInput?.(input);

    window.__labReportHandleInputChange?.(input);
}

function syncRenderedReferenceValues(referenceTarget = {}, payload = {}) {
    const normalizedTargetName = String(referenceTarget?.testName || referenceTarget || "").trim();
    const normalizedTestId = String(referenceTarget?.testId || "").trim();
    const normalizedParameterId = String(referenceTarget?.parameterId || "").trim();
    if (!normalizedTargetName && !normalizedParameterId) return;

    const patient = getCurrentReferencePatient();
    const referenceType = String(payload.selectType || "numeric").toLowerCase();
    const resolvedNumericReference = resolveDisplayedReference(payload.dataObject, patient);
    const referenceText = referenceType === "text"
        ? (String(payload.text || "").trim() || "-")
        : resolvedNumericReference.text;

    document.querySelectorAll("table tbody tr").forEach((row) => {
        const testNameCell = row.cells?.[1];
        if (!testNameCell) return;
        const valueInput = row.querySelector(".unit input");
        const rowTestId = String(valueInput?.dataset?.testId || "").trim();
        const rowParameterId = String(valueInput?.dataset?.paramId || "").trim();

        const isSameParameter = normalizedParameterId
            ? rowParameterId === normalizedParameterId
            : (
                String(testNameCell.innerText || "").trim() === normalizedTargetName &&
                (!normalizedTestId || rowTestId === normalizedTestId)
            );

        if (!isSameParameter) {
            return;
        }

        const referenceCell = row.querySelector(".reference");
        if (referenceCell) {
            const editIcon = referenceCell.querySelector("i");
            referenceCell.textContent = "";
            if (editIcon) {
                referenceCell.appendChild(editIcon);
            }
            referenceCell.append(referenceText);
        }
        if (valueInput) {
            valueInput.dataset.referenceType = referenceType;
            valueInput.dataset.lower = referenceType === "numeric" ? resolvedNumericReference.lowerValue : "";
            valueInput.dataset.upper = referenceType === "numeric" ? resolvedNumericReference.upperValue : "";
            refreshReferenceComparisonEffects(valueInput);
        }
    });
}

// for gathering reference data 
async function gatherFormData(referenceTarget = {}) {
    const tname = String(referenceTarget?.testName || referenceTarget || "").trim();
    const testId = String(referenceTarget?.testId || "").trim();
    const parameterId = String(referenceTarget?.parameterId || "").trim();

    // for normal value data retrieve
    const selectType = document.getElementById('select-type').value;
    let dataObject = {};
    let text;

    if (selectType === 'text') {
        // Gather data from textarea if type is "text"
        const textAreaData = document.getElementById('text-area').value;
        text = textAreaData;
    } else {
        // Gather data from dynamic rows if type is "numeric"
        const rows = document.querySelectorAll('.row-container');
        dataObject = Array.from(rows).map(row => ({
            gender: row.querySelector('.sex').value,
            minAge: row.querySelector('.min-age').value,
            minAgeUnit: row.querySelector('[name="min_age_unit"]').value,
            maxAge: row.querySelector('.max-age').value,
            maxAgeUnit: row.querySelector('[name="max_age_unit"]').value,
            lowerValue: row.querySelector('.lower-value').value,
            upperValue: row.querySelector('.upper-value').value,
        }));
    }

    await fetch(`${BASE_URL}/api/v1/user/edit-defaultresults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataObject, tname, text, selectType, testId, parameterId })
    })
        .then(async response => {
            const body = await response.json().catch(() => ({}));
            return { ok: response.ok, body };
        })
        .then(result => {
            if (result.ok) {
                syncRenderedReferenceValues({ testName: tname, testId, parameterId }, { dataObject, text, selectType });
                window.showStatusMessage?.(result.body?.message || "Reference value updated successfully.", "success");
                closeModal();
            } else {
                window.showStatusMessage?.(result.body?.message || "Failed to update reference value.", "error");
            }
        })
        .catch(error => {
            console.error('Error:', error);
            window.showStatusMessage?.("Failed to update reference value.", "error");
        });

}


//-----------------------------fetching data result----------------------------------
// for fetching referene value 
async function fetchDefaultResults(referenceTarget = {}) {
    try {
        const testName = String(referenceTarget?.testName || referenceTarget || "").trim();
        const testId = String(referenceTarget?.testId || "").trim();
        const parameterId = String(referenceTarget?.parameterId || "").trim();

        if (!testName) {
            throw new Error("Missing parameter name for reference edit.");
        }

        const response = await fetch(`${BASE_URL}/api/v1/user/edit-add-defaultresults`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ testName, testId, parameterId })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data?.message || "Failed to fetch reference value.");
        }

        const matchedParameter = data?.parameter
            || (Array.isArray(data?.parameters)
                ? data.parameters.find((para) => {
                    if (parameterId && String(para?._id || "") === parameterId) {
                        return true;
                    }
                    return para?.Para_name === testName;
                })
                : null);

        if (!matchedParameter) {
            throw new Error(`Reference configuration not found for '${testName}'.`);
        }

        populateRows(matchedParameter);
    } catch (error) {
        console.error('Error fetching default results:', error);
        window.showStatusMessage?.(error?.message || "Failed to fetch reference value.", "error");
        closeModal();
    }
}

// for populating reference data
function populateRows(parameter) {
    const formContainer = document.getElementById('form-container');
    const textArea = document.getElementById('text-area');
    formContainer.innerHTML = ''; // Clear any existing rows
    textArea.value = '';

    if (parameter.text) {
        document.getElementById('select-type').value = 'text';
        textArea.style.display = 'block';
        formContainer.style.display = 'none';
        textArea.value = parameter.text;
    } else {
        document.getElementById('select-type').value = 'numeric';
        formContainer.style.display = 'block';
        textArea.style.display = 'none';
        formContainer.innerHTML = ''; // Clear any existing rows
    }

    parameter?.NormalValue?.forEach(result => {
        const rowContainer = document.createElement('div');
        rowContainer.classList.add('row-container');

        rowContainer.innerHTML = `
            <span class="delete-btn" onclick="deleteRow(this)">🗑️</span>
            <div class="row-item">
                <label for="sex">Sex</label>
                <select name="sex" class="sex">
                    <option value="Any" ${result.gender === 'Any' ? 'selected' : ''}>Any</option>
                    <option value="Male" ${result.gender === 'Male' ? 'selected' : ''}>Male</option>
                    <option value="Female" ${result.gender === 'Female' ? 'selected' : ''}>Female</option>
                </select>
            </div>
            <div class="row-item">
                <label for="min_age">Min. Age</label>
                <input type="number" name="min_age" class="min-age" value="${result.minAge}">
            </div>
            <div class="row-item">
                <label for="min_age_unit">Min Age Unit</label>
                <select name="min_age_unit">
                    <option value="Years" ${result.minAgeUnit === 'Years' ? 'selected' : ''}>Years</option>
                    <option value="Months" ${result.minAgeUnit === 'Months' ? 'selected' : ''}>Months</option>
                    <option value="Days" ${result.minAgeUnit === 'Days' ? 'selected' : ''}>Days</option>
                </select>
            </div>
            <div class="row-item">
                <label for="max_age">Max. Age</label>
                <input type="number" name="max_age" class="max-age" value="${result.maxAge}">
            </div>
            <div class="row-item">
                <label for="max_age_unit">Max Age Unit</label>
                <select name="max_age_unit">
                    <option value="Years" ${result.maxAgeUnit === 'Years' ? 'selected' : ''}>Years</option>
                    <option value="Months" ${result.maxAgeUnit === 'Months' ? 'selected' : ''}>Months</option>
                    <option value="Days" ${result.maxAgeUnit === 'Days' ? 'selected' : ''}>Days</option>
                </select>
            </div>
            <div class="row-item">
                <label for="lower_value">Lower Value</label>
                <input type="number" name="lower_value" class="lower-value" value="${result.lowerValue}" oninput="updateReportDisplay(this)">
            </div>
            <div class="row-item">
                <label for="upper_value">Upper Value</label>
                <input type="number" name="upper_value" class="upper-value" value="${result.upperValue}" oninput="updateReportDisplay(this)">
            </div>
            <div class="row-item">
                <label for="display_report">Display report</label>
                <span class="display-report">${result.lowerValue} - ${result.upperValue}</span>
            </div>
        `;

        formContainer.appendChild(rowContainer);
    });
}

// for updating reference result
function updateReportDisplay(element) {
    const rowContainer = element.parentElement.parentElement;
    const lowerValue = rowContainer.querySelector('.lower-value').value;
    const upperValue = rowContainer.querySelector('.upper-value').value;
    const displayReport = rowContainer.querySelector('.display-report');

    if (lowerValue && upperValue) {
        displayReport.textContent = `${lowerValue} - ${upperValue}`;
    } else {
        displayReport.textContent = "-";
    }
}

// for sorting rows 
function sortTests() {
    // Get all the tables
    const tables = document.querySelectorAll(".table");

    tables.forEach((table) => {
        const tbody = table.querySelector("tbody");
        if (tbody) {
            // Sort only rows with the data-order attribute
            sortRowsByDataOrder(tbody);
        }
    });
}

// Function to Sort Rows by data-order Attribute
function sortRowsByDataOrder(tbody) {
    const rows = Array.from(tbody.querySelectorAll("tr"));

    // Separate rows with and without the data-order attribute
    const rowsWithOrder = rows.filter((row) => row.hasAttribute("data-order"));
    // Sort rows with the data-order attribute
    rowsWithOrder.sort((rowA, rowB) => {
        const orderA = parseInt(rowA.getAttribute("data-order"), 10) || 0;
        const orderB = parseInt(rowB.getAttribute("data-order"), 10) || 0;
        return orderA - orderB; // Ascending order
    });

    // Rebuild with fragment to reduce layout thrash
    const fragment = document.createDocumentFragment();
    let withOrderIndex = 0;

    rows.forEach((row) => {
        if (row.hasAttribute("data-order")) {
            fragment.appendChild(rowsWithOrder[withOrderIndex]);
            withOrderIndex++;
        } else {
            fragment.appendChild(row); // Append rows without data-order in their original positions
        }
    });
    tbody.replaceChildren(fragment);
}
// sortTests() is already covered during grouped render flow.
