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
            "UPGRADE YOUR PLAN NOW: Run LabFlowLIS on multiple devices simultaneously for just â‚¹299/Month per extra device!",
        englishSteps:
            "How to unlock instantly: Scan the QR Code below, make the payment of â‚¹299, and click the WhatsApp button to send us the screenshot. We will activate your extra device within 2 minutes!",
        hindiTitle:
            "à¤¸à¥‰à¤«à¥à¤Ÿà¤µà¥‡à¤¯à¤° à¤¬à¥à¤²à¥‰à¤• à¤•à¤° à¤¦à¤¿à¤¯à¤¾ à¤—à¤¯à¤¾ à¤¹à¥ˆ! à¤¡à¤¿à¤µà¤¾à¤‡à¤¸ à¤•à¥€ à¤¸à¥€à¤®à¤¾ à¤¸à¤®à¤¾à¤ªà¥à¤¤",
        hindiBody:
            "à¤†à¤ªà¤•à¤¾ à¤…à¤•à¤¾à¤‰à¤‚à¤Ÿ à¤ªà¤¹à¤²à¥‡ à¤¸à¥‡ à¤¹à¥€ à¤•à¤¿à¤¸à¥€ à¤¦à¥‚à¤¸à¤°à¥‡ à¤•à¤‚à¤ªà¥à¤¯à¥‚à¤Ÿà¤° à¤¯à¤¾ à¤®à¥‹à¤¬à¤¾à¤‡à¤² à¤ªà¤° à¤šà¤² à¤°à¤¹à¤¾ à¤¹à¥ˆà¥¤ à¤¨à¤¿à¤¯à¤® à¤•à¥‡ à¤…à¤¨à¥à¤¸à¤¾à¤°, à¤¯à¤¹ à¤ªà¥à¤²à¤¾à¤¨ à¤•à¥‡à¤µà¤² à¤à¤• à¤¹à¥€ à¤²à¥ˆà¤¬/à¤¸à¤‚à¤¸à¥à¤¥à¤¾à¤¨ à¤•à¥‡ à¤‰à¤ªà¤¯à¥‹à¤— à¤•à¥‡ à¤²à¤¿à¤ à¤¹à¥ˆà¥¤",
        hindiUpgrade:
            "à¤¤à¥à¤°à¤‚à¤¤ à¤¨à¤¯à¤¾ à¤ªà¥à¤²à¤¾à¤¨ à¤²à¥‡à¤‚: à¤à¤• à¤¸à¤¾à¤¥ à¤•à¤ˆ à¤•à¤‚à¤ªà¥à¤¯à¥‚à¤Ÿà¤°à¥‹à¤‚ à¤ªà¤° à¤¸à¥‰à¤«à¥à¤Ÿà¤µà¥‡à¤¯à¤° à¤šà¤²à¤¾à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤…à¤­à¥€ à¤…à¤ªà¤¨à¤¾ à¤ªà¥à¤²à¤¾à¤¨ à¤¬à¤¦à¤²à¥‡à¤‚, à¤®à¤¾à¤¤à¥à¤° â‚¹299/à¤®à¤¹à¥€à¤¨à¤¾ à¤ªà¥à¤°à¤¤à¤¿ à¤…à¤¤à¤¿à¤°à¤¿à¤•à¥à¤¤ à¤•à¤‚à¤ªà¥à¤¯à¥‚à¤Ÿà¤°!",
        hindiSteps:
            "à¤šà¤¾à¤²à¥‚ à¤•à¤°à¤¨à¥‡ à¤•à¤¾ à¤†à¤¸à¤¾à¤¨ à¤¤à¤°à¥€à¤•à¤¾: à¤¨à¥€à¤šà¥‡ à¤¦à¤¿à¤ à¤—à¤ QR à¤•à¥‹à¤¡ à¤•à¥‹ à¤¸à¥à¤•à¥ˆà¤¨ à¤•à¤°à¤•à¥‡ â‚¹299 à¤•à¤¾ à¤­à¥à¤—à¤¤à¤¾à¤¨ à¤•à¤°à¥‡à¤‚, à¤”à¤° WhatsApp à¤¬à¤Ÿà¤¨ à¤ªà¤° à¤•à¥à¤²à¤¿à¤• à¤•à¤°à¤•à¥‡ à¤ªà¥‡à¤®à¥‡à¤‚à¤Ÿ à¤•à¤¾ à¤¸à¥à¤•à¥à¤°à¥€à¤¨à¤¶à¥‰à¤Ÿ à¤­à¥‡à¤œà¥‡à¤‚à¥¤ à¤¹à¤® 2 à¤®à¤¿à¤¨à¤Ÿ à¤®à¥‡à¤‚ à¤†à¤ªà¤•à¤¾ à¤¦à¥‚à¤¸à¤°à¤¾ à¤•à¤‚à¤ªà¥à¤¯à¥‚à¤Ÿà¤° à¤šà¤¾à¤²à¥‚ à¤•à¤° à¤¦à¥‡à¤‚à¤—à¥‡!",
        speech:
            "à¤¸à¤¾à¤µà¤§à¤¾à¤¨! à¤†à¤ªà¤•à¥€ à¤¡à¤¿à¤µà¤¾à¤‡à¤¸ à¤¸à¥€à¤®à¤¾ à¤¸à¤®à¤¾à¤ªà¥à¤¤ à¤¹à¥‹ à¤šà¥à¤•à¥€ à¤¹à¥ˆà¥¤ à¤¯à¤¹ à¤¸à¥‰à¤«à¥à¤Ÿà¤µà¥‡à¤¯à¤° à¤ªà¤¹à¤²à¥‡ à¤¸à¥‡ à¤¹à¥€ à¤•à¤¿à¤¸à¥€ à¤”à¤° à¤•à¤‚à¤ªà¥à¤¯à¥‚à¤Ÿà¤° à¤ªà¤° à¤à¤•à¥à¤Ÿà¤¿à¤µ à¤¹à¥ˆà¥¤ à¤…à¤—à¤° à¤†à¤ª à¤‡à¤¸à¥‡ à¤‡à¤¸ à¤•à¤‚à¤ªà¥à¤¯à¥‚à¤Ÿà¤° à¤ªà¤° à¤­à¥€ à¤à¤• à¤¸à¤¾à¤¥ à¤šà¤²à¤¾à¤¨à¤¾ à¤šà¤¾à¤¹à¤¤à¥‡ à¤¹à¥ˆà¤‚, à¤¤à¥‹ à¤¸à¥à¤•à¥à¤°à¥€à¤¨ à¤ªà¤° à¤¦à¤¿à¤ à¤—à¤ à¤•à¥à¤¯à¥‚à¤†à¤° à¤•à¥‹à¤¡ à¤ªà¤° à¤¦à¥‹ à¤¸à¥Œ à¤¨à¤¿à¤¨à¥à¤¯à¤¾à¤¨à¤¬à¥‡ à¤°à¥à¤ªà¤¯à¥‡ à¤•à¤¾ à¤­à¥à¤—à¤¤à¤¾à¤¨ à¤•à¤°à¥‡à¤‚, à¤”à¤° à¤¸à¥à¤•à¥à¤°à¥€à¤¨à¤¶à¥‰à¤Ÿ à¤µà¥à¤¹à¤¾à¤Ÿà¥à¤¸à¤à¤ª à¤ªà¤° à¤­à¥‡à¤œà¤•à¤° à¤‡à¤¸à¥‡ à¤¤à¥à¤°à¤‚à¤¤ à¤šà¤¾à¤²à¥‚ à¤•à¤°à¤µà¤¾à¤à¤‚à¥¤",
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
                        <h2>à¤¹à¤¿à¤‚à¤¦à¥€ / Hindi</h2>
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
                            WhatsApp à¤ªà¤° à¤¸à¥à¤•à¥à¤°à¥€à¤¨à¤¶à¥‰à¤Ÿ à¤­à¥‡à¤œà¥‡à¤‚ à¤”à¤° à¤šà¤¾à¤²à¥‚ à¤•à¤°à¤µà¤¾à¤à¤‚
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
            targetNames: [
                "Hematocrit (HCT)",
                "Hematocrit",
                "PACKED CELL VOLUME (PCV)",
                "PCV",
                "HCT",
                "Hematocrit (COMPLETE BLOOD COUNT (CBC))",
            ],
            displayExpression: "Hemoglobin * 3",
            expressionTemplate: "{{hemoglobin}} * 3",
            dependencies: {
                hemoglobin: ["Hemoglobin", "HAEMOGLOBIN (HB)", "HEMOGLOBIN (HB)", "HB", "Hemoglobin (COMPLETE BLOOD COUNT (CBC))"],
            },
        },
        {
            targetNames: [
                "Neutrophils-Absolute Count",
                "Neutrophils (Abs)",
                "Neutrophils (Abs) (COMPLETE BLOOD COUNT (CBC))",
                "Absolute Neutrophil Count",
                "ANC",
            ],
            displayExpression: "(Total Leucocytes Count / 100) * Neutrophils Percentage",
            expressionTemplate: "({{tlc}} / 100) * {{neutrophilsPercentage}}",
            dependencies: {
                tlc: ["Total Leucocytes Count", "TOTAL COUNT (WBC)", "TLC", "TOTAL COUNT (WBC) (COMPLETE BLOOD COUNT (CBC))"],
                neutrophilsPercentage: ["Neutrophils Percentage", "Neutrophils (%)", "Neutrophils", "Neutrophils (%) (COMPLETE BLOOD COUNT (CBC))"],
            },
        },
        {
            targetNames: [
                "Lymphocytes-Absolute Count",
                "Lymphocytes (Abs)",
                "Lymphocytes (Abs) (COMPLETE BLOOD COUNT (CBC))",
                "Absolute Lymphocyte Count",
                "ALC",
            ],
            displayExpression: "(Lymphocyte Percentage / 100) * Total Leucocytes Count",
            expressionTemplate: "({{lymphocytePercentage}} / 100) * {{tlc}}",
            dependencies: {
                lymphocytePercentage: ["Lymphocyte Percentage", "Lymphocytes Percentage", "Lymphocytes (%)", "Lymphocytes", "Lymphocytes (%) (COMPLETE BLOOD COUNT (CBC))"],
                tlc: ["Total Leucocytes Count", "TOTAL COUNT (WBC)", "TLC", "TOTAL COUNT (WBC) (COMPLETE BLOOD COUNT (CBC))"],
            },
        },
        {
            targetNames: [
                "Eosinophil-Absolute Count",
                "Eosinophils-Absolute Count",
                "Eosinophils (Abs)",
                "Eosinophils (Abs) (COMPLETE BLOOD COUNT (CBC))",
                "Absolute Eosinophil Count",
                "AEC",
            ],
            displayExpression: "(Eosinophils Percentage / 100) * Total Leucocytes Count",
            expressionTemplate: "({{eosinophilsPercentage}} / 100) * {{tlc}}",
            dependencies: {
                eosinophilsPercentage: ["Eosinophils Percentage", "Eosinophil Percentage", "Eosinophils (%)", "Eosinophils", "Eosinophils (%) (COMPLETE BLOOD COUNT (CBC))"],
                tlc: ["Total Leucocytes Count", "TOTAL COUNT (WBC)", "TLC", "TOTAL COUNT (WBC) (COMPLETE BLOOD COUNT (CBC))"],
            },
        },
        {
            targetNames: [
                "Monocyte- Absolute Count",
                "Monocyte-Absolute Count",
                "Monocytes (Abs)",
                "Monocytes (Abs) (COMPLETE BLOOD COUNT (CBC))",
                "Absolute Monocyte Count",
                "AMC",
            ],
            displayExpression: "(Monocytes Percentage / 100) * Total Leucocytes Count",
            expressionTemplate: "({{monocytesPercentage}} / 100) * {{tlc}}",
            dependencies: {
                monocytesPercentage: ["Monocytes Percentage", "Monocyte Percentage", "Monocytes (%)", "Monocytes", "Monocytes (%) (COMPLETE BLOOD COUNT (CBC))"],
                tlc: ["Total Leucocytes Count", "TOTAL COUNT (WBC)", "TLC", "TOTAL COUNT (WBC) (COMPLETE BLOOD COUNT (CBC))"],
            },
        },
        {
            targetNames: [
                "Basophils-Absolute Count",
                "Basophils (Abs)",
                "Basophils (Abs) (COMPLETE BLOOD COUNT (CBC))",
                "Absolute Basophil Count",
                "ABC",
            ],
            displayExpression: "(Basophils Percentage / 100) * Total Leucocytes Count",
            expressionTemplate: "({{basophilsPercentage}} / 100) * {{tlc}}",
            dependencies: {
                basophilsPercentage: ["Basophils Percentage", "Basophil Percentage", "Basophils (%)", "Basophils", "Basophils (%) (COMPLETE BLOOD COUNT (CBC))"],
                tlc: ["Total Leucocytes Count", "TOTAL COUNT (WBC)", "TLC", "TOTAL COUNT (WBC) (COMPLETE BLOOD COUNT (CBC))"],
            },
        },
        {
            targetNames: ["Neutrophil Lymphocyte Ratio", "NLR"],
            displayExpression: "Neutrophils-Absolute Count / Lymphocytes-Absolute Count",
            expressionTemplate: "{{neutrophilsAbsolute}} / {{lymphocytesAbsolute}}",
            dependencies: {
                neutrophilsAbsolute: ["Neutrophils-Absolute Count", "Neutrophils (Abs)", "Absolute Neutrophil Count", "ANC"],
                lymphocytesAbsolute: ["Lymphocytes-Absolute Count", "Lymphocytes (Abs)", "Absolute Lymphocyte Count", "ALC"],
            },
        },
        {
            targetNames: ["Neutrophil Lymphocyte Ratio", "NLR"],
            displayExpression: "Neutrophils Percentage / Lymphocytes Percentage",
            expressionTemplate: "{{neutrophilsPercentage}} / {{lymphocytesPercentage}}",
            dependencies: {
                neutrophilsPercentage: ["Neutrophils Percentage", "Neutrophils (%)", "Neutrophils", "Neutrophils (%) (COMPLETE BLOOD COUNT (CBC))"],
                lymphocytesPercentage: ["Lymphocyte Percentage", "Lymphocytes Percentage", "Lymphocytes (%)", "Lymphocytes", "Lymphocytes (%) (COMPLETE BLOOD COUNT (CBC))"],
            },
        },
        {
            targetNames: [
                "Mean Corpuscular Volume (MCV)",
                "MCV",
                "MCV (COMPLETE BLOOD COUNT (CBC))",
            ],
            displayExpression: "Hematocrit (HCT) * 10 / Total Red Blood Cell Count",
            expressionTemplate: "({{hct}} * 10) / {{rbcCount}}",
            dependencies: {
                hct: ["Hematocrit (HCT)", "Hematocrit", "PACKED CELL VOLUME (PCV)", "PCV", "HCT", "Hematocrit (COMPLETE BLOOD COUNT (CBC))"],
                rbcCount: ["Total Red Blood Cell Count", "RBC COUNT", "RBC", "RBC Count (COMPLETE BLOOD COUNT (CBC))"],
            },
        },
        {
            targetNames: [
                "Mean Corpuscular Hemoglobin (MCH)",
                "MCH",
                "MCH (COMPLETE BLOOD COUNT (CBC))",
            ],
            displayExpression: "Hemoglobin * 10 / Total Red Blood Cell Count",
            expressionTemplate: "({{hemoglobin}} * 10) / {{rbcCount}}",
            dependencies: {
                hemoglobin: ["Hemoglobin", "HAEMOGLOBIN (HB)", "HEMOGLOBIN (HB)", "HB", "Hemoglobin (COMPLETE BLOOD COUNT (CBC))"],
                rbcCount: ["Total Red Blood Cell Count", "RBC COUNT", "RBC", "RBC Count (COMPLETE BLOOD COUNT (CBC))"],
            },
        },
        {
            targetNames: [
                "Mean Corpuscular Hemoglobin Concentration (MCHC)",
                "MCHC",
                "MCHC (COMPLETE BLOOD COUNT (CBC))",
            ],
            displayExpression: "Hemoglobin * 100 / Hematocrit (HCT)",
            expressionTemplate: "({{hemoglobin}} * 100) / {{hct}}",
            dependencies: {
                hemoglobin: ["Hemoglobin", "HAEMOGLOBIN (HB)", "HEMOGLOBIN (HB)", "HB", "Hemoglobin (COMPLETE BLOOD COUNT (CBC))"],
                hct: ["Hematocrit (HCT)", "Hematocrit", "PACKED CELL VOLUME (PCV)", "PCV", "HCT", "Hematocrit (COMPLETE BLOOD COUNT (CBC))"],
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
            targetNames: ["Sgot/Sgpt Ratio Formula", "SGOT/SGPT RATIO", "De Ritis Ratio", "AST/ALT Ratio", "SGOT / SGPT Ratio"],
            displayExpression: "SGOT (AST) / SGPT (ALT)",
            expressionTemplate: "{{sgot}} / {{sgpt}}",
            dependencies: {
                sgot: ["SGOT (AST)", "SGOT", "AST", "Aspartate Aminotransferase"],
                sgpt: ["SGPT (ALT)", "SGPT", "ALT", "Alanine Aminotransferase"],
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
                    throw new Error("Formula placeholder à¤¬à¤‚à¤¦ à¤¨à¤¹à¥€à¤‚ à¤¹à¥à¤† à¤¹à¥ˆà¥¤");
                }

                const parameterId = source.slice(index + 2, endIndex).trim();
                tokens.push({ type: "variable", value: parameterId });
                index = endIndex + 2;
                continue;
            }

            if (char === "{" && source[index + 1] !== "{") {
                const endIndex = source.indexOf("}", index + 1);
                if (endIndex !== -1) {
                    const parameterId = source.slice(index + 1, endIndex).trim();
                    tokens.push({ type: "variable", value: parameterId });
                    index = endIndex + 1;
                    continue;
                }
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
                throw new Error("Formula expression à¤…à¤§à¥‚à¤°à¤¾ à¤¹à¥ˆà¥¤");
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
            throw new Error("Formula expression invalid à¤¹à¥ˆà¥¤");
        }
        return result;
    }

    async function loadTenantFormulas() {
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/formulas/active`, {
                credentials: "include",
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Failed to load formulas");
            }

            formulaState.formulas = Array.isArray(result.data) ? result.data : [];
            console.log(`[Formula Engine] Loaded ${formulaState.formulas.length} active formula(s) from server`);
        } catch (error) {
            formulaState.formulas = [];
            console.error("Error loading formulas:", error);
        }
    }

    const CLINICAL_ALIAS_MAP = {
        hematocrit: ["hct", "pcv", "packedcellvolume", "hematocrit", "haematocrit", "hematocrithct", "packedcellvolumepcv"],
        pcv: ["hct", "hematocrit", "haematocrit", "packedcellvolume", "pcv", "hematocrithct"],
        mcv: ["meancorpuscularvolume", "mcv", "meancorpuscularvolumemcv"],
        mch: ["meancorpuscularhemoglobin", "mch", "meancorpuscularhemoglobinmch", "meancorpuscularhaemoglobin"],
        mchc: ["meancorpuscularhemoglobinconcentration", "mchc", "meancorpuscularhemoglobinconcentrationmchc", "meancorpuscularhaemoglobinconcentration"],
        hemoglobin: ["haemoglobin", "hemoglobin", "hb", "haemoglobinhb", "hemoglobinhb"],
        rbc: ["totalredbloodcellcount", "rbccount", "rbc", "redbloodcells", "redcell", "redbloodcell"],
        tlc: ["totalleucocytescount", "totalleukocytecount", "tlc", "wbc", "totalcountwbc", "totalcount", "whitebloodcells"],
        neutrophils: ["neutrophilspercentage", "neutrophilpercentage", "neutrophils%", "neutrophils"],
        lymphocytes: ["lymphocytepercentage", "lymphocytespercentage", "lymphocytes%", "lymphocytes"],
        monocytes: ["monocytespercentage", "monocytepercentage", "monocytes%", "monocytes"],
        eosinophils: ["eosinophilspercentage", "eosinophilpercentage", "eosinophils%", "eosinophils"],
        basophils: ["basophilspercentage", "basophilpercentage", "basophils%", "basophils"],
        neutrophilsabs: ["neutrophilsabsolutecount", "neutrophilsabs", "absoluteneutrophilcount", "anc", "neutrophilsabsolutecountanc"],
        lymphocytesabs: ["lymphocytesabsolutecount", "lymphocytesabs", "absolutelymphocytecount", "alc", "lymphocytesabsolutecountalc"],
        monocytesabs: ["monocyteabsolutecount", "monocytesabs", "absolutemonocytecount", "amc", "monocyteabsolutecountamc"],
        eosinophilsabs: ["eosinophilabsolutecount", "eosinophilsabs", "absoluteeosinophilcount", "aec", "eosinophilsabsolutecountaec"],
        basophilsabs: ["basophilsabsolutecount", "basophilsabs", "absolutebasophilcount", "abc", "basophilsabsolutecountabc"],
        anc: ["neutrophilsabsolutecount", "neutrophilsabs", "absoluteneutrophilcount", "anc", "neutrophilsabsolutecountanc"],
        alc: ["lymphocytesabsolutecount", "lymphocytesabs", "absolutelymphocytecount", "alc", "lymphocytesabsolutecountalc"],
        amc: ["monocyteabsolutecount", "monocytesabs", "absolutemonocytecount", "amc", "monocyteabsolutecountamc"],
        aec: ["eosinophilabsolutecount", "eosinophilsabs", "absoluteeosinophilcount", "aec", "eosinophilsabsolutecountaec"],
        abc: ["basophilsabsolutecount", "basophilsabs", "absolutebasophilcount", "abc", "basophilsabsolutecountabc"],
        nlr: ["neutrophillymphocyteratio", "nlr"],
        vldl: ["vldlcholesterol", "vldl"],
        ldl: ["ldlcholesterol", "ldl"],
        nonhdl: ["nonhdlcholesterol", "nonhdl"],
        totalcholesterol: ["totalcholesterol", "cholesteroltotal", "cholesterol"],
        hdl: ["hdlcholesterol", "hdl"],
        triglycerides: ["triglycerides", "triglyceride", "tg"],
        bilirubintotal: ["serumbilirubintotal", "bilirubintotal", "totalbilirubin"],
        bilirubindirect: ["serumbilirubindirect", "bilirubindirect", "directbilirubin"],
        bilirubinindirect: ["serumbilirubinindirect", "bilirubinindirect", "indirectbilirubin"],
        totalprotein: ["serumprotein", "totalprotein", "protein"],
        albumin: ["serumalbumin", "albumin"],
        globulin: ["serumglobulin", "globulin"],
        agratio: ["agratio", "a/gratio", "albumin/globulinratio"],
        urea: ["serumurea", "urea"],
        creatinine: ["serumcreatinine", "creatinine"],
        bun: ["bloodureanitrogen", "bun"],
        hba1c: ["glycatedhaemoglobinhba1c", "hba1c"],
    };

    function normalizeClinicalName(name) {
        if (!name) return "";
        const clean = String(name).toLowerCase().replace(/[^a-z0-9]/g, " ");
        const s = " " + clean + " ";

        // Prioritize platelet indices so Platelet haematocrit (PCT) does not falsely match red blood cell hematocrit (HCT)
        if (s.includes(" platelet ") || s.includes(" plt ") || s.includes(" pct ")) {
            if (s.includes(" haematocrit ") || s.includes(" hematocrit ") || s.includes(" pct ")) return "pct";
            if (s.includes(" distribution ") || s.includes(" pdw ")) return "pdw";
            if (s.includes(" volume ") || s.includes(" mpv ")) return "mpv";
            return "platelet";
        }

        if (s.includes(" rdw ") || s.includes(" distribution width ") || s.includes(" red cell distribution ")) return "rdw";
        if (s.includes(" mchc ") || s.includes(" mean corpuscular hemoglobin concentration ") || s.includes(" mean corpuscular haemoglobin concentration ")) return "mchc";
        if (s.includes(" mch ") || s.includes(" mean corpuscular hemoglobin ") || s.includes(" mean corpuscular haemoglobin ")) return "mch";
        if (s.includes(" mcv ") || s.includes(" mean corpuscular volume ")) return "mcv";
        if (s.includes(" hct ") || s.includes(" pcv ") || s.includes(" hematocrit ") || s.includes(" haematocrit ") || s.includes(" packed cell volume ")) return "hematocrit";
        if (s.includes(" hb ") || s.includes(" hemoglobin ") || s.includes(" haemoglobin ")) return "hemoglobin";
        if (s.includes(" rbc ") || s.includes(" red blood cell ") || s.includes(" red blood cells ") || s.includes(" red cell ") || s.includes(" erythrocyte ")) return "rbc";
        if (s.includes(" tlc ") || s.includes(" wbc ") || s.includes(" leukocyte ") || s.includes(" leucocyte ") || s.includes(" total count wbc ") || s.includes(" white blood cell ") || s.includes(" total count ")) return "tlc";

        const isAbs = s.includes(" abs ") || s.includes(" absolute ") || s.includes(" anc ") || s.includes(" alc ") || s.includes(" aec ") || s.includes(" amc ") || s.includes(" abc ");

        if (s.includes(" anc ") || (isAbs && (s.includes(" neutrophil ") || s.includes(" neutrophils ")))) return "neutrophilsabs";
        if (s.includes(" alc ") || (isAbs && (s.includes(" lymphocyte ") || s.includes(" lymphocytes ")))) return "lymphocytesabs";
        if (s.includes(" aec ") || (isAbs && (s.includes(" eosinophil ") || s.includes(" eosinophils ")))) return "eosinophilsabs";
        if (s.includes(" amc ") || (isAbs && (s.includes(" monocyte ") || s.includes(" monocytes ")))) return "monocytesabs";
        if (s.includes(" abc ") || (isAbs && (s.includes(" basophil ") || s.includes(" basophils ")))) return "basophilsabs";

        if (s.includes(" neutrophil ") || s.includes(" neutrophils ")) return "neutrophils";
        if (s.includes(" lymphocyte ") || s.includes(" lymphocytes ")) return "lymphocytes";
        if (s.includes(" eosinophil ") || s.includes(" eosinophils ")) return "eosinophils";
        if (s.includes(" monocyte ") || s.includes(" monocytes ")) return "monocytes";
        if (s.includes(" basophil ") || s.includes(" basophils ")) return "basophils";

        return clean.replace(/\s+/g, "");
    }

    function isDifferentialPercentageField(input) {
        if (!input) return false;
        const rawName = String(
            input.dataset?.paramName ||
            input.dataset?.id ||
            input.closest("tr")?.querySelector(".test-name-cell")?.textContent ||
            input.closest("tr")?.children?.[1]?.textContent ||
            ""
        ).toLowerCase();
        const normalized = normalizeFieldIdentity(rawName);
        if (DIFFERENTIAL_PERCENTAGE_FIELD_SET.has(normalized)) return true;
        return /neutrophil.*percent|lymphocyte.*percent|eosinophil.*percent|monocyte.*percent|basophil.*percent/.test(normalized);
    }

    function isAbsoluteCountQuery(names = []) {
        return names.some((name) => {
            const lower = String(name || "").toLowerCase();
            return /\b(abs|absolute|anc|alc|aec|amc|abc)\b/i.test(lower) || /\(abs\)/i.test(lower) || lower.includes("absolute");
        });
    }

    function buildLegacyFieldIndex() {
        const fieldIndex = new Map();

        document.querySelectorAll(".value-input[data-param-id]").forEach((input) => {
            const names = [
                input.dataset.paramName,
                input.dataset.id,
                input.dataset.shortname,
                input.closest("tr")?.querySelector(".test-name-cell")?.textContent,
                input.closest("tr")?.children?.[1]?.textContent,
            ];

            names.forEach((name) => {
                if (!name) return;
                const normalizedName = normalizeFieldIdentity(name);
                if (normalizedName && !fieldIndex.has(normalizedName)) {
                    fieldIndex.set(normalizedName, input);
                }

                const coreName = normalizeClinicalName(name);
                if (coreName && !fieldIndex.has(coreName)) {
                    fieldIndex.set(coreName, input);
                }

                // Index clinical alias keys
                for (const [canonical, aliases] of Object.entries(CLINICAL_ALIAS_MAP)) {
                    if (canonical === coreName || aliases.includes(coreName) || aliases.includes(normalizedName)) {
                        if (!fieldIndex.has(canonical)) fieldIndex.set(canonical, input);
                        aliases.forEach((aliasKey) => {
                            if (!fieldIndex.has(aliasKey)) fieldIndex.set(aliasKey, input);
                        });
                    }
                }
            });
        });

        return fieldIndex;
    }

    function findLegacyInput(fieldIndex, names = []) {
        if (!fieldIndex) return null;
        const searchingForAbsolute = isAbsoluteCountQuery(names);

        const checkCandidate = (candInput) => {
            if (!candInput) return null;
            // Differential percentage fields are manual technician inputs and must NEVER match absolute count targets
            if (searchingForAbsolute && isDifferentialPercentageField(candInput)) {
                return null;
            }
            return candInput;
        };

        for (const name of names) {
            if (!name) continue;
            const direct = checkCandidate(fieldIndex.get(String(name).trim()));
            if (direct) return direct;

            const normalizedName = normalizeFieldIdentity(name);
            const matchedInput = checkCandidate(fieldIndex.get(normalizedName));
            if (matchedInput) {
                return matchedInput;
            }

            const coreName = normalizeClinicalName(name);
            const matchedCore = checkCandidate(fieldIndex.get(coreName));
            if (matchedCore) {
                return matchedCore;
            }

            for (const [canonical, aliases] of Object.entries(CLINICAL_ALIAS_MAP)) {
                if (canonical === coreName || aliases.includes(coreName) || aliases.includes(normalizedName)) {
                    for (const candidate of [canonical, ...aliases]) {
                        const hit = checkCandidate(fieldIndex.get(candidate));
                        if (hit) return hit;
                    }
                }
            }
        }
        return null;
    }

    function adaptSavedFormulasToPage(savedFormulas, fieldIndex) {
        if (!Array.isArray(savedFormulas) || savedFormulas.length === 0) {
            return [];
        }

        const adaptedList = [];
        const seenTargetMasterKeys = new Set();

        savedFormulas.forEach((formula) => {
            if (!formula || formula.isActive === false) return;

            function buildCandidateQueryNames(rawLabel) {
                const list = [];
                if (!rawLabel) return list;
                const raw = String(rawLabel).trim();
                list.push(raw);

                // Trailing parenthesized test/panel qualifier: 'Hematocrit (COMPLETE BLOOD COUNT (CBC))' -> 'Hematocrit'
                const trailingStripped = raw.replace(/\s*\([^)()]*(?:\([^()]*\)[^)()]*)*\)\s*$/, "").trim();
                if (trailingStripped && !list.includes(trailingStripped)) {
                    list.push(trailingStripped);
                }

                // Strip all parenthesized expressions
                let allStripped = raw;
                while (/\([^()]*\)/.test(allStripped)) {
                    allStripped = allStripped.replace(/\s*\([^()]*\)/g, " ").trim();
                }
                allStripped = allStripped.replace(/\s+/g, " ").trim();
                if (allStripped && !list.includes(allStripped)) {
                    list.push(allStripped);
                }

                const withNorms = [];
                list.forEach((item) => {
                    withNorms.push(item);
                    const clin = normalizeClinicalName(item);
                    if (clin && !withNorms.includes(clin)) withNorms.push(clin);
                    const fld = normalizeFieldIdentity(item);
                    if (fld && !withNorms.includes(fld)) withNorms.push(fld);
                });
                return withNorms;
            }

            // 1. Check if the formula's target already exists on the current page by master key or paramId
            let targetInput = formulaState.inputByMasterKey.get(String(formula.targetMasterKey || ""));
            if (!targetInput && formula.targetParameterId) {
                targetInput = formulaState.inputByMasterKey.get(String(formula.targetParameterId));
            }

            // 2. If not found by master key/paramId, find by targetLabel or clinical name
            if (!targetInput) {
                targetInput = findLegacyInput(fieldIndex, buildCandidateQueryNames(formula.targetLabel));
            }

            if (!targetInput) {
                return;
            }

            if (!targetInput.dataset.masterParamKey) {
                targetInput.dataset.masterParamKey = targetInput.dataset.paramId || targetInput.dataset.testId || `param_${normalizeFieldIdentity(targetInput.dataset.paramName || targetInput.dataset.id || "target")}`;
            }

            // CRITICAL GUARD: Differential percentage fields must NEVER have a formula attached as a target!
            if (isDifferentialPercentageField(targetInput)) {
                return;
            }

            const pageTargetMasterKey = String(targetInput.dataset.masterParamKey);
            if (seenTargetMasterKeys.has(pageTargetMasterKey)) {
                return;
            }

            // 3. Resolve all dependencies to fields on the current page
            let adaptedExpression = String(formula.expression || "");
            const adaptedDependencies = [];
            let allDependenciesResolved = true;

            (formula.dependencies || []).forEach((dep) => {
                const origDepKey = String(dep.parameterMasterKey || "");
                let depInput = origDepKey ? formulaState.inputByMasterKey.get(origDepKey) : null;
                if (!depInput && dep.parameterId) {
                    depInput = formulaState.inputByMasterKey.get(String(dep.parameterId));
                }

                if (!depInput) {
                    depInput = findLegacyInput(fieldIndex, buildCandidateQueryNames(dep.label));
                }

                if (!depInput) {
                    allDependenciesResolved = false;
                    return;
                }

                if (!depInput.dataset.masterParamKey) {
                    depInput.dataset.masterParamKey = depInput.dataset.paramId || depInput.dataset.testId || `param_${normalizeFieldIdentity(depInput.dataset.paramName || depInput.dataset.id || "dep")}`;
                }

                const pageDepMasterKey = String(depInput.dataset.masterParamKey);

                if (origDepKey && origDepKey !== pageDepMasterKey) {
                    adaptedExpression = adaptedExpression.split(`{{${origDepKey}}}`).join(`{{${pageDepMasterKey}}}`);
                    adaptedExpression = adaptedExpression.split(`{${origDepKey}}`).join(`{{${pageDepMasterKey}}}`);
                }
                if (dep.parameterId && String(dep.parameterId) !== pageDepMasterKey) {
                    adaptedExpression = adaptedExpression.split(`{{${dep.parameterId}}}`).join(`{{${pageDepMasterKey}}}`);
                    adaptedExpression = adaptedExpression.split(`{${dep.parameterId}}`).join(`{{${pageDepMasterKey}}}`);
                }

                adaptedDependencies.push({
                    testId: depInput.dataset.testId || dep.testId || null,
                    parameterId: depInput.dataset.paramId || dep.parameterId || null,
                    parameterMasterKey: pageDepMasterKey,
                    label: depInput.dataset.paramName || depInput.dataset.id || dep.label || "",
                });
            });

            if (!allDependenciesResolved || !adaptedDependencies.length) {
                return;
            }

            seenTargetMasterKeys.add(pageTargetMasterKey);

            adaptedList.push({
                ...formula,
                targetMasterKey: pageTargetMasterKey,
                targetTestId: targetInput.dataset.testId || formula.targetTestId,
                targetParameterId: targetInput.dataset.paramId || formula.targetParameterId,
                targetLabel: targetInput.dataset.paramName || formula.targetLabel,
                expression: adaptedExpression,
                displayExpression: formula.displayExpression || adaptedExpression,
                dependencies: adaptedDependencies,
                precision: Number.isFinite(Number(formula.precision)) ? Number(formula.precision) : 2,
                isActive: true,
                allowManualOverride: true,
            });
        });

        return adaptedList;
    }

    function buildLegacyFallbackFormulas(savedFormulas, fieldIndex = null) {
        const resolvedFieldIndex = fieldIndex || buildLegacyFieldIndex();
        const savedTargetIds = new Set(
            (savedFormulas || []).map((formula) => String(formula.targetMasterKey || ""))
        );
        const fallbackFormulas = [];

        LEGACY_FORMULA_CONFIGS.forEach((config) => {
            const targetInput = findLegacyInput(resolvedFieldIndex, config.targetNames);
            if (!targetInput?.dataset?.masterParamKey) {
                return;
            }

            // CRITICAL GUARD: Differential percentage fields must NEVER have a formula attached as a target!
            if (isDifferentialPercentageField(targetInput)) {
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
                const dependencyInput = findLegacyInput(resolvedFieldIndex, dependencyNames);
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

            savedTargetIds.add(targetMasterKey);

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
                allowManualOverride: true,
            });
        });

        return fallbackFormulas;
    }

    function rebuildFormulaIndexes() {
        formulaState.formulaByTargetMasterKey.clear();
        formulaState.dependentsBySourceMasterKey.clear();
        formulaState.inputByMasterKey.clear();

        document.querySelectorAll(".value-input").forEach((input) => {
            if (!input.dataset.masterParamKey) {
                input.dataset.masterParamKey = input.dataset.paramId || input.dataset.testId || `param_${normalizeFieldIdentity(input.dataset.paramName || input.dataset.id || "field")}`;
            }

            const rawKeys = [
                String(input.dataset.masterParamKey || ""),
                String(input.dataset.paramId || ""),
                String(input.dataset.testId || ""),
                normalizeClinicalName(input.dataset.paramName),
                normalizeFieldIdentity(input.dataset.paramName),
                normalizeClinicalName(input.dataset.id),
                normalizeFieldIdentity(input.dataset.id),
            ].filter(Boolean);

            rawKeys.forEach((key) => {
                if (!formulaState.inputByMasterKey.has(key)) {
                    formulaState.inputByMasterKey.set(key, input);
                }
            });

            // Also register clinical alias keys for input lookup
            const coreName = normalizeClinicalName(input.dataset.paramName) || normalizeClinicalName(input.dataset.id);
            if (coreName) {
                for (const [canonical, aliases] of Object.entries(CLINICAL_ALIAS_MAP)) {
                    if (canonical === coreName || aliases.includes(coreName)) {
                        [canonical, ...aliases].forEach((aliasKey) => {
                            if (!formulaState.inputByMasterKey.has(aliasKey)) {
                                formulaState.inputByMasterKey.set(aliasKey, input);
                            }
                        });
                    }
                }
            }
        });

        formulaState.formulas.forEach((formula) => {
            const targetMasterKey = String(formula.targetMasterKey || "");
            const targetParamId = String(formula.targetParameterId || "");
            const targetLabelClinical = normalizeClinicalName(formula.targetLabel);
            const targetLabelField = normalizeFieldIdentity(formula.targetLabel);

            [targetMasterKey, targetParamId, targetLabelClinical, targetLabelField].filter(Boolean).forEach((tKey) => {
                if (!formulaState.formulaByTargetMasterKey.has(tKey)) {
                    formulaState.formulaByTargetMasterKey.set(tKey, formula);
                }
            });

            (formula.dependencies || []).forEach((dependency) => {
                const depKeys = [
                    String(dependency.parameterMasterKey || ""),
                    String(dependency.parameterId || ""),
                    normalizeClinicalName(dependency.label),
                    normalizeFieldIdentity(dependency.label),
                ].filter(Boolean);

                const depCore = normalizeClinicalName(dependency.label);
                if (depCore) {
                    for (const [canonical, aliases] of Object.entries(CLINICAL_ALIAS_MAP)) {
                        if (canonical === depCore || aliases.includes(depCore)) {
                            [canonical, ...aliases].forEach((alias) => depKeys.push(alias));
                        }
                    }
                }

                depKeys.forEach((key) => {
                    if (!formulaState.dependentsBySourceMasterKey.has(key)) {
                        formulaState.dependentsBySourceMasterKey.set(key, []);
                    }
                    const list = formulaState.dependentsBySourceMasterKey.get(key);
                    if (!list.includes(formula)) {
                        list.push(formula);
                    }
                });
            });
        });
    }

    function setFormulaInputDisplayState(input, formula) {
        if (!input) return;

        input.dataset.formulaField = "true";
        input.dataset.formulaTargetId = String(formula._id || "");
        input.readOnly = false;
        input.removeAttribute("readonly");
        input.disabled = false;
        input.removeAttribute("disabled");
        input.classList.toggle("formula-value-input", true);
    }

    function addIconsToMatchingRows() {
        // First map all inputs currently present on the page
        rebuildFormulaIndexes();
        const fieldIndex = buildLegacyFieldIndex();

        // Adapt formulas saved in DB to current fields (even across panel sub-tests or test variants)
        const adaptedSaved = adaptSavedFormulasToPage(formulaState.formulas, fieldIndex);

        // Fallback formulas for standard panels not yet saved in DB
        const fallbackFormulas = buildLegacyFallbackFormulas(adaptedSaved, fieldIndex);

        // Set active formula list and rebuild lookup indexes
        formulaState.formulas = [...adaptedSaved, ...fallbackFormulas];
        rebuildFormulaIndexes();

        const allInputs = document.querySelectorAll(".value-input");

        allInputs.forEach((input) => {
            const row = input.closest("tr");
            const valueColumn = input.closest(".value-column")?.querySelector(".formulaIcon") || row?.querySelector(".formulaIcon");
            if (!valueColumn) return;

            // Strict safety: differential percentage fields must never have formulas attached
            if (isDifferentialPercentageField(input)) {
                delete input.dataset.formulaField;
                delete input.dataset.formulaTargetId;
                input.readOnly = false;
                input.classList.remove("formula-value-input");
                const existingIcon = valueColumn.querySelector(".icon");
                if (existingIcon) existingIcon.remove();
                return;
            }

            // Find formula by master key, paramId, or clinical/field alias
            const possibleKeys = [
                String(input.dataset.masterParamKey || ""),
                String(input.dataset.paramId || ""),
                normalizeClinicalName(input.dataset.paramName),
                normalizeFieldIdentity(input.dataset.paramName),
                normalizeClinicalName(input.dataset.id),
                normalizeFieldIdentity(input.dataset.id),
            ].filter(Boolean);

            let formula = null;
            for (const key of possibleKeys) {
                if (formulaState.formulaByTargetMasterKey.has(key)) {
                    formula = formulaState.formulaByTargetMasterKey.get(key);
                    break;
                }
            }

            if (!formula) {
                return;
            }

            setFormulaInputDisplayState(input, formula);

            if (valueColumn.querySelector(".icon")) return;

            const title = row?.querySelector(".test-name-cell")?.textContent?.trim() || row?.children?.[1]?.textContent?.trim() || formula.targetLabel || input.dataset.paramName || "Formula";
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

        // If user has manually entered/overridden a value, do not overwrite it with computed value
        if (input.dataset.formulaManual === "true" && String(input.value || "").trim() !== "") {
            return;
        }

        const precision = Number.isFinite(Number(formula.precision)) ? Number(formula.precision) : 2;
        input.value = Number(value).toFixed(precision);
        input.dataset.formulaAutoCalculated = "true";
        delete input.dataset.formulaManual;
        processInput(input);
    }

    function clearComputedFormulaValue(input) {
        if (!input) return;
        input.value = "";
        delete input.dataset.formulaAutoCalculated;
        delete input.dataset.formulaManual;
        processInput(input);
    }

    function recalculateSingleFormula(formula) {
        const targetMasterKey = String(formula.targetMasterKey || "");
        const targetInput = formulaState.inputByMasterKey.get(targetMasterKey);
        if (!targetInput) {
            return false;
        }

        const prevVal = String(targetInput.value || "").trim();

        // MANUAL OVERRIDE GUARD:
        // If the user manually entered or modified this field and it has a value,
        // NEVER overwrite it with an automated formula calculation!
        if (targetInput.dataset.formulaManual === "true" && prevVal !== "") {
            return false;
        }

        const dependencyValues = {};
        let hasAnyDependencyValue = false;
        let hasMissingDependency = false;

        (formula.dependencies || []).forEach((dependency) => {
            const dependencyMasterKey = String(dependency.parameterMasterKey || "");
            let dependencyInput = formulaState.inputByMasterKey.get(dependencyMasterKey);
            if (!dependencyInput && dependency.parameterId) {
                dependencyInput = formulaState.inputByMasterKey.get(String(dependency.parameterId));
            }
            if (!dependencyInput && dependency.label) {
                dependencyInput = formulaState.inputByMasterKey.get(normalizeClinicalName(dependency.label)) ||
                                  formulaState.inputByMasterKey.get(normalizeFieldIdentity(dependency.label));
            }

            const { hasValue, value } = getNumericValueFromInput(dependencyInput);

            // Populate all identifier keys for robust lookup in parseFormulaExpression
            if (dependencyMasterKey) dependencyValues[dependencyMasterKey] = value;
            if (dependency.parameterId) dependencyValues[String(dependency.parameterId)] = value;
            if (dependency.label) {
                dependencyValues[dependency.label] = value;
                dependencyValues[normalizeClinicalName(dependency.label)] = value;
                dependencyValues[normalizeFieldIdentity(dependency.label)] = value;
            }

            hasAnyDependencyValue = hasAnyDependencyValue || hasValue;
            hasMissingDependency = hasMissingDependency || !hasValue;
        });

        if (!hasAnyDependencyValue || hasMissingDependency) {
            // Never clear user-entered or manually modified values when dependencies are missing
            if (targetInput.dataset.formulaManual === "true" || targetInput.dataset.formulaAutoCalculated !== "true") {
                return false;
            }
            if (prevVal !== "") {
                clearComputedFormulaValue(targetInput);
                return true;
            }
            return false;
        }

        try {
            const computedValue = parseFormulaExpression(formula.expression, (parameterId) => {
                const key = String(parameterId || "").trim();
                if (key in dependencyValues) return dependencyValues[key];
                const cleanKey = normalizeFieldIdentity(key);
                if (cleanKey in dependencyValues) return dependencyValues[cleanKey];
                const clinicalKey = normalizeClinicalName(key);
                if (clinicalKey in dependencyValues) return dependencyValues[clinicalKey];
                return 0;
            });

            if (!Number.isFinite(computedValue)) {
                return false;
            }

            applyComputedFormulaValue(targetInput, formula, computedValue);
            const newVal = String(targetInput.value || "").trim();
            return prevVal !== newVal;
        } catch (error) {
            console.error(`Error evaluating formula for ${formula.targetLabel}:`, error);
            if (targetInput.dataset.formulaManual === "true" || targetInput.dataset.formulaAutoCalculated !== "true") {
                return false;
            }
            if (prevVal !== "") {
                clearComputedFormulaValue(targetInput);
                return true;
            }
            return false;
        }
    }

    function recalculateFormulaCascadeFromParam(paramId, inputElement = null) {
        const queue = [String(paramId || "")];
        if (inputElement) {
            if (inputElement.dataset?.paramId) queue.push(String(inputElement.dataset.paramId));
            if (inputElement.dataset?.paramName) {
                queue.push(normalizeClinicalName(inputElement.dataset.paramName));
                queue.push(normalizeFieldIdentity(inputElement.dataset.paramName));
            }
            if (inputElement.dataset?.id) {
                queue.push(normalizeFieldIdentity(inputElement.dataset.id));
            }
        }

        const seen = new Set();
        let steps = 0;
        const MAX_STEPS = 60;

        while (queue.length && steps < MAX_STEPS) {
            steps += 1;
            const sourceKey = queue.shift();
            if (!sourceKey || seen.has(sourceKey)) continue;
            seen.add(sourceKey);

            const dependentFormulas = formulaState.dependentsBySourceMasterKey.get(sourceKey) || [];

            dependentFormulas.forEach((formula) => {
                const targetMasterKey = String(formula.targetMasterKey || "");
                if (!targetMasterKey || targetMasterKey === sourceKey) {
                    return;
                }

                const targetInput = formulaState.inputByMasterKey.get(targetMasterKey);
                // 1) Never recalculate the exact input that the user is actively typing in
                if (inputElement && targetInput === inputElement) {
                    return;
                }
                // 2) Never recalculate a field that was manually overridden by the user
                if (targetInput && targetInput.dataset.formulaManual === "true" && String(targetInput.value || "").trim() !== "") {
                    return;
                }

                const wasChanged = recalculateSingleFormula(formula);
                if (wasChanged) {
                    queue.push(targetMasterKey);
                }
            });
        }
    }

    function recalculateAllFormulas() {
        let changed = true;
        let passes = 0;
        const MAX_PASSES = 10;
        while (changed && passes < MAX_PASSES) {
            changed = false;
            passes += 1;
            formulaState.formulas.forEach((formula) => {
                const targetMasterKey = String(formula.targetMasterKey || "");
                const targetInput = formulaState.inputByMasterKey.get(targetMasterKey);
                // Do not recalculate manually entered values
                if (targetInput && targetInput.dataset.formulaManual === "true" && String(targetInput.value || "").trim() !== "") {
                    return;
                }

                const didChange = recalculateSingleFormula(formula);
                if (didChange) {
                    changed = true;
                }
            });
        }
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
        return isKeyboardNavigationField(element);
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

    function isBlankOrDotOnlyValue(value) {
        const normalized = String(value ?? "").trim();
        return normalized === "" || /^[.\s]+$/.test(normalized);
    }

    function getVisibleManualValueInputs() {
        return Array.from(document.querySelectorAll(".value-input")).filter((input) => {
            if (!(input instanceof HTMLElement)) return false;
            if (!isManualNavigationField(input)) return false;

            const style = window.getComputedStyle(input);
            return style.display !== "none" && style.visibility !== "hidden";
        });
    }

    function focusValueInputOrFinalButton(currentField, direction = 1) {
        const navigationFields = getVisibleManualValueInputs();
        const currentIndex = navigationFields.indexOf(currentField);
        if (currentIndex === -1) return false;

        if (direction < 0) {
            for (let prevIndex = currentIndex - 1; prevIndex >= 0; prevIndex -= 1) {
                const previousField = navigationFields[prevIndex];
                if (previousField?.disabled || previousField?.readOnly) continue;
                focusFieldWithCenteredScroll(previousField);
                return true;
            }
            return false;
        }

        for (let nextIndex = currentIndex + 1; nextIndex < navigationFields.length; nextIndex += 1) {
            const nextField = navigationFields[nextIndex];
            if (nextField?.disabled || nextField?.readOnly) continue;
            focusFieldWithCenteredScroll(nextField);
            return true;
        }

        const finalButton = document.getElementById("finalBtn");
        if (finalButton && !finalButton.disabled) {
            focusFieldWithCenteredScroll(finalButton);
            return true;
        }

        return false;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const urlBookingValue = (urlParams.get("value1") || "").trim();
    let booking = null;
    try {
        booking = JSON.parse(localStorage.getItem("booking") || "null")
            || JSON.parse(sessionStorage.getItem("booking") || "null");
    } catch {
        booking = null;
    }

    if (urlBookingValue && (!booking || String(booking.bookingId || "") !== urlBookingValue)) {
        try {
            const bRes = await fetch(`${BASE_URL}/api/v1/user/getbooking`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ value1: urlBookingValue }),
            });
            if (bRes.ok) {
                const fetchedBooking = await bRes.json();
                if (fetchedBooking && (fetchedBooking.bookingId || fetchedBooking._id)) {
                    booking = fetchedBooking;
                    try {
                        localStorage.setItem("booking", JSON.stringify(booking));
                    } catch { /* ignore */ }
                }
            }
        } catch (err) {
            console.warn("[LabReport] Fallback getbooking lookup failed:", err?.message || err);
        }
    }

    if (!booking || typeof booking !== "object") {
        booking = { bookingId: urlBookingValue || "", acceptedbarcode: [] };
    }
    // for getting individual parameter lower and upper value
    const patient = { age: booking.year, gender: booking.gender };
    // ✅ Restore "Print Categories from new Page" checkbox from saved booking data
    // booking.categorizedPDF is set by the server (SaveReportController saves it, 
    // NewBooking.controller.js restores it via getbooking API)
    const check1El = document.getElementById('check1');
    if (check1El) {
        check1El.checked = resolveStoredCheckboxFlag(
            booking?.categorizedPDF
        );
    }
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
            const errorData = await response.json().catch(() => ({}));
            console.error("Failed to fetch barcode tests:", response.status, errorData);
            return;
        }

        const data = await response.json();

        testpanels = Array.isArray(data) ? data[0] : data;
        const fetchedBarcodes = Array.isArray(testpanels?.barcodes?.barcodes)
            ? testpanels.barcodes.barcodes
            : [];
        fetchedBarcodes.forEach(element => {
            const array = Array.isArray(element?.testandpannelArray) ? element.testandpannelArray : [];
            testArray.push(...array);
        });

        await getallpptfromrelatedbarcode(fetchedBarcodes);

        recievedOn = testpanels?.barcodes?.createdAt
            ? formatDateTimeLocal(testpanels.barcodes.createdAt)
            : "";
    } catch (error) {
        console.error("Error fetching barcode tests:", error);
    }

    // this is for testArray2
    async function getallpptfromrelatedbarcode(barcodes) {
        const idToNameMap = new Map();

        (testpanels?.singleTests || []).forEach(test => {
            const name = test?.Short_name || test?.Name;
            if (test?._id && name) idToNameMap.set(String(test._id), name);
            if (test?.originalTestId && name) idToNameMap.set(String(test.originalTestId), name);
        });

        (testpanels?.panels || []).forEach(panel => {
            if (panel?._id && panel?.name) idToNameMap.set(String(panel._id), panel.name);
            if (panel?.originalPanelId && panel?.name) idToNameMap.set(String(panel.originalPanelId), panel.name);
        });

        (testpanels?.packages || []).forEach(pkg => {
            if (pkg?._id && pkg?.packageName) idToNameMap.set(String(pkg._id), pkg.packageName);
            if (pkg?.originalPackageId && pkg?.packageName) idToNameMap.set(String(pkg.originalPackageId), pkg.packageName);
        });

        const bookingByBarcode = new Map();
        if (Array.isArray(booking?.tableData)) {
            booking.tableData.forEach((entry) => {
                const key = (entry.barcodeId || entry.confirmBarcodeId || "").trim();
                if (!key) return;
                bookingByBarcode.set(key, entry);
            });
        }

        for (const object of (barcodes || [])) {
            const barcodeKey = (object?.barcode || "").trim();
            const match = bookingByBarcode.get(barcodeKey);
            const resolvedForBarcode = [];

            // 1. Resolve by object.testIds (from database acceptedBarcode)
            if (Array.isArray(object?.testIds) && object.testIds.length > 0) {
                object.testIds.forEach(item => {
                    const idKey = item?.id ? String(item.id) : "";
                    if (idKey && idToNameMap.has(idKey)) {
                        resolvedForBarcode.push(idToNameMap.get(idKey));
                    }
                });
            }

            // 2. Resolve by match.ids (from booking.tableData)
            if (resolvedForBarcode.length === 0 && Array.isArray(match?.ids) && match.ids.length > 0) {
                match.ids.forEach(item => {
                    const idKey = item?.id ? String(item.id) : "";
                    if (idKey && idToNameMap.has(idKey)) {
                        resolvedForBarcode.push(idToNameMap.get(idKey));
                    }
                });
            }

            // 3. If object.testandpannelArray has updated items from API
            if (resolvedForBarcode.length === 0 && Array.isArray(object?.testandpannelArray) && object.testandpannelArray.length > 0) {
                resolvedForBarcode.push(...object.testandpannelArray);
            }

            // 4. Fallback to match.testName string if legacy booking without IDs
            if (resolvedForBarcode.length === 0 && match?.testName) {
                resolvedForBarcode.push(...match.testName.split(",").map(t => t.trim()).filter(Boolean));
            }

            if (resolvedForBarcode.length > 0) {
                testArray2.push(...resolvedForBarcode);
                if (match) {
                    match.testName = [...new Set(resolvedForBarcode)].join(", ");
                }
            }
        }

        // If testArray2 is still empty but testpanels.investigations exists, use that
        if (testArray2.length === 0 && Array.isArray(testpanels?.investigations) && testpanels.investigations.length > 0) {
            testArray2.push(...testpanels.investigations);
        }
    }

    // for removing duplicacy
    let uniquetestArray2 = [...new Set(testArray2.map(s => String(s).trim()).filter(Boolean))];
    let uniquetestArray = [...new Set(testArray.map(s => String(s).trim()).filter(Boolean))];

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
        return booking.registeredOn || formatDateTimeLocal(booking.createdAt || booking.date, booking.createdAt ? "" : booking.time);
    }

    function getCollectedOnValue() {
        return booking.collectedOn || formatDateTimeLocal(booking.date, booking.time);
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

        // Text-based reference: respect manual dropdown abnormal OR evaluate scalar numeric ranges stored in `.reference`
        if (referenceType === "text") {
            if (!inputValue) {
                input.dataset.isAbnormal = "false";
                return;
            }
            let isAbnormal = input.dataset.isAbnormal === "true";

            const key = textKeyForInput();
            const cached = textDropdownState.cache.get(key);
            const matchedDropdown = cached?.find(
                (entry) => (entry.valueName || "").toLowerCase() === inputValue.toLowerCase()
            );
            if (matchedDropdown) {
                isAbnormal = !!matchedDropdown.isAbnormal;
                input.dataset.isAbnormal = isAbnormal ? "true" : "false";
                if (isAbnormal) {
                    row.style.fontWeight = "bold";
                    input.style.fontWeight = "bold";
                }
                return;
            }

            // Fallback: check if reference cell holds a simple numeric interval (e.g. "13.0 - 17.0")
            const refText = (row?.querySelector?.(".reference")?.textContent || "").replace(/,/g, "").trim();
            const cleanVal = inputValue.replace(/,/g, "").trim();
            const parsedNum = /^-?\d+(?:\.\d+)?$/.test(cleanVal) ? parseFloat(cleanVal) : NaN;
            const simpleRange = refText.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|\bto\b)\s*(-?\d+(?:\.\d+)?)/i);
            if (!isNaN(parsedNum) && simpleRange) {
                const low = parseFloat(simpleRange[1]);
                const high = parseFloat(simpleRange[2]);
                if (!isNaN(low) && !isNaN(high) && low <= high) {
                    if (parsedNum < low) {
                        row.style.fontWeight = "bold";
                        input.style.fontWeight = "bold";
                        input.dataset.isAbnormal = "true";
                        if (highLowSpan) highLowSpan.textContent = "L";
                        return;
                    }
                    if (parsedNum > high) {
                        row.style.fontWeight = "bold";
                        input.style.fontWeight = "bold";
                        input.dataset.isAbnormal = "true";
                        if (highLowSpan) highLowSpan.textContent = "H";
                        return;
                    }
                    input.dataset.isAbnormal = "false";
                    return;
                }
            }

            if (isAbnormal) {
                row.style.fontWeight = "bold";
                input.style.fontWeight = "bold";
            }
            return;
        }

        const numericValue = parseFloat(inputValue.replace(/,/g, "")); // Parse the numeric value from the input
        const lowerValue = parseFloat(input.getAttribute('data-lower'));
        const upperValue = parseFloat(input.getAttribute('data-upper'));

        // Reset styling and span content if input is invalid
        if (isNaN(numericValue) && inputValue.toLowerCase() !== "positive") {
            input.dataset.isAbnormal = "false";
            return;
        }

        // Apply logic for bold styling and L/H display
        if (inputValue.toLowerCase() === "positive") {
            // If the input is "positive" (case-insensitive)
            row.style.fontWeight = "bold";
            input.style.fontWeight = "bold";
            input.dataset.isAbnormal = "true";
            if (highLowSpan) highLowSpan.textContent = ""; // No L or H for "positive"
        } else if (numericValue < lowerValue) {
            row.style.fontWeight = "bold";
            input.style.fontWeight = "bold";
            input.dataset.isAbnormal = "true";
            if (highLowSpan) highLowSpan.textContent = "L"; // Low
        } else if (numericValue > upperValue) {
            row.style.fontWeight = "bold";
            input.style.fontWeight = "bold";
            input.dataset.isAbnormal = "true";
            if (highLowSpan) highLowSpan.textContent = "H"; // High
        } else {
            // Reset to normal if none of the conditions match
            row.style.fontWeight = "normal";
            input.style.fontWeight = "normal";
            input.dataset.isAbnormal = "false";
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

            const target = event.target instanceof HTMLElement ? event.target : null;
            const valueInput = target?.closest?.(".value-input");
            if (valueInput) {
                const direction = isTabKey && event.shiftKey ? -1 : 1;
                const moved = focusValueInputOrFinalButton(valueInput, direction);
                if (isEnterKey || moved) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                return;
            }

            if (!isKeyboardNavigationField(event.target)) {
                if (isEnterKey) {
                    const finalButton = document.getElementById("finalBtn");
                    if (finalButton && !finalButton.disabled) {
                        event.preventDefault();
                        finalButton.click();
                    }
                }
                return;
            }

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

    // âœ… CKEditor initialization with proper button setup
    const editorInstances = new Map();
    const previousContentMap = new Map(); // âœ… Global map for storing previous content

    const initEditor = (uniqueTestId, interpretation) => {


        const editorElement = document.querySelector(`#editorContent-${uniqueTestId}`);

        if (!editorElement) {
            console.error(`Editor element not found: editorContent-${uniqueTestId}`);
            return;
        }

        // à¤…à¤—à¤° editor à¤ªà¤¹à¤²à¥‡ à¤¸à¥‡ exist à¤•à¤°à¤¤à¤¾ à¤¹à¥ˆ à¤¤à¥‹ destroy à¤•à¤°à¥‡à¤‚
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

                // âœ… Store original content in global map
                if (interpretation) {
                    editor.setData(interpretation);
                    previousContentMap.set(uniqueTestId, interpretation);
                }



                // Toolbar ko editor ke upar manually add karo
                const toolbarContainer = document.createElement('div');
                toolbarContainer.classList.add('custom-toolbar');
                editorElement.parentNode.insertBefore(toolbarContainer, editorElement);
                toolbarContainer.appendChild(editor.ui.view.toolbar.element);

                // âœ… CRITICAL: Button event listeners ko editor ready hone ke BAAD attach karo
                setupEditorButtons(uniqueTestId);
            })
            .catch(error => console.error(error));
    }

    // âœ… Separate function for button setup (called AFTER editor is ready)
    function setupEditorButtons(uniqueTestId) {
        const test = { _id: uniqueTestId }; // Get test object reference if needed
        // Get button references
        const saveAsDefaultButton = document.querySelector(`[data-editor-id="${uniqueTestId}"][data-action="save-default"]`);
        const saveTemplateButton = document.querySelector(`[data-editor-id="${uniqueTestId}"][data-action="save-template"]`);
        const restoreDefaultButton = document.querySelector(`[data-editor-id="${uniqueTestId}"][data-action="restore-default"]`);
        const restorePreviousButton = document.querySelector(`[data-editor-id="${uniqueTestId}"][data-action="restore-previous"]`);

        // âœ… Save as Default
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

        // âœ… Save Template
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

        // âœ… Restore Default
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

        // âœ… Restore Previous
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

    // âœ… Modified fetchTemplates function
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

    // âœ… Modified addTemplate function with proper event handling
    function addTemplate(template, uniqueTestId) {
        const apiDataDiv = document.querySelector(`#apiData-${uniqueTestId}`);
        const templateDiv = document.createElement("div");
        templateDiv.className = "template-item";

        const templateNameSpan = document.createElement("span");
        templateNameSpan.textContent = template.templateName;
        templateNameSpan.style.cursor = "pointer";
        templateNameSpan.setAttribute("title", "Double click to choose");

        // âœ… Template apply karne par previous content save karo
        templateNameSpan.addEventListener("click", () => {
            const currentContent = getEditorContent(uniqueTestId);

            // Store current content as previous
            previousContentMap.set(`${uniqueTestId}_previous`, currentContent);

            // Apply template content
            setEditorContent(uniqueTestId, template.content);


        });

        const deleteIcon = document.createElement("span");
        deleteIcon.textContent = "ðŸ—‘ï¸";
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
            console.error(`âŒ Error destroying editor ${uniqueTestId}:`, error);
            // Forcefully delete from map even if destroy fails
            editorInstances.delete(uniqueTestId);
        }
    }

    /**
     * Resolve numeric `order` cleanly without treating `0` as missing.
     */
    function resolveNumericOrder(rawOrder, fallback = 9999) {
        const parsed = Number(rawOrder);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    const CATEGORY_HEX_ID_RE = /^[a-f0-9]{24}$/i;

    function extractCategoryLabel(rawCategory, depth = 0) {
        if (!rawCategory || depth > 3) return "";
        if (Array.isArray(rawCategory)) {
            return rawCategory.length > 0 ? extractCategoryLabel(rawCategory[0], depth + 1) : "";
        }
        if (typeof rawCategory === "string") {
            const trimmed = rawCategory.trim();
            return CATEGORY_HEX_ID_RE.test(trimmed) ? "" : trimmed;
        }
        if (typeof rawCategory === "object") {
            const candidates = [
                rawCategory.category,
                rawCategory.name,
                rawCategory.Name,
                rawCategory.categoryName,
                rawCategory.label,
                rawCategory.title,
            ];
            for (const candidate of candidates) {
                if (candidate == null) continue;
                const label = typeof candidate === "object"
                    ? extractCategoryLabel(candidate, depth + 1)
                    : String(candidate).trim();
                if (label && !CATEGORY_HEX_ID_RE.test(label)) {
                    return label;
                }
            }
        }
        return "";
    }

    function normalizeCategoryKey(rawName) {
        return String(rawName || "").trim().toLowerCase();
    }

    function normalizeCategoryMeta(rawCategory, fallbackName = "General") {
        const sourceObj = Array.isArray(rawCategory) ? rawCategory[0] : rawCategory;
        const name = extractCategoryLabel(rawCategory) || String(fallbackName || "General").trim() || "General";
        const orderId = resolveNumericOrder(
            sourceObj && typeof sourceObj === "object" ? (sourceObj.orderId ?? sourceObj.order) : undefined,
            9999
        );
        return {
            ...(sourceObj && typeof sourceObj === "object" && !Array.isArray(rawCategory) ? sourceObj : {}),
            category: name,
            orderId,
        };
    }

    function resolvePanelCategoryMeta(panel) {
        const directLabel = extractCategoryLabel(panel?.category);
        if (directLabel) {
            return normalizeCategoryMeta(panel.category, directLabel);
        }
        const childWithCategory = Array.isArray(panel?.testsId)
            ? panel.testsId.find((child) => extractCategoryLabel(child?.category))
            : null;
        if (childWithCategory) {
            return normalizeCategoryMeta(childWithCategory.category, "General");
        }
        return normalizeCategoryMeta(panel?.category, "General");
    }

    /**
     * Build the Page Break cell with a non-intrusive drag handle beside the checkbox.
     * Placing the handle inside column 0 ensures `.test-name` (column 1) stays 100% pure
     * for `extractTableData()` and report PDF formats.
     */
    function buildPageBreakCellHtml(handleRoleClass, titleText) {
        const safeTitle = String(titleText || "Drag row up or down to reorder")
            .replace(/"/g, "&quot;");
        return `<div class="lr-pb-wrap"><span class="lr-drag-handle ${handleRoleClass}" title="${safeTitle}" tabindex="-1" aria-label="${safeTitle}"><i class="fa-solid fa-grip-vertical"></i></span><input type="checkbox" id="pagebreak" name="pagebreak" tabindex="-1"></div>`;
    }

    //for creating tables
    async function createTable(title, category, data, isPanel = false, hideCategory = false, panelDetails = null) {
        const section = document.createElement("div");
        section.classList.add("section");
        const resolvedCategory = normalizeCategoryMeta(category);



        // Table heading (only if not hidden)
        if (!hideCategory) {
            const categoryHeading = document.createElement("h2");
            categoryHeading.textContent = resolvedCategory.category;
            categoryHeading.setAttribute('data-order', resolvedCategory.orderId);
            section.appendChild(categoryHeading);

            const headingBar = document.createElement("div");
            headingBar.className = "lr-sec-head-bar";
            const secChk = document.createElement("input");
            secChk.type = "checkbox";
            secChk.className = "lr-sec-print-check";
            secChk.checked = true;
            secChk.tabIndex = -1;
            secChk.title = `Include "${title}" in Selected Report`;
            const heading = document.createElement("h3");
            heading.textContent = title;
            heading.setAttribute('data-order', panelDetails?.order || 999);
            const secOnlyBtn = document.createElement("button");
            secOnlyBtn.type = "button";
            secOnlyBtn.className = "lr-sel-only-btn";
            secOnlyBtn.tabIndex = -1;
            secOnlyBtn.textContent = "Only This";
            secOnlyBtn.title = `Select ONLY "${title}" for report`;
            headingBar.appendChild(secChk);
            headingBar.appendChild(heading);
            headingBar.appendChild(secOnlyBtn);
            section.appendChild(headingBar);

            section.dataset.catName = resolvedCategory.category;
            section.dataset.catKey = normalizeCategoryKey(resolvedCategory.category);
            section.dataset.panelTitle = String(title || "");
            section.dataset.isPanel = isPanel ? "1" : "0";
            if (isPanel && panelDetails?._id) {
                section.dataset.panelId = String(panelDetails._id);
            }
        }

        // Table
        const table = document.createElement("table");
        table.className = "table";
        if (isPanel && panelDetails?._id) {
            table.dataset.panelId = String(panelDetails._id);
        }
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
        for (const test of (Array.isArray(data) ? data : [])) {
            if (!test || typeof test !== "object") continue;
            const safeTestName = String(test.Name || test.Short_name || "Unnamed Test");
            const safeTestParameters = Array.isArray(test.parameters) ? test.parameters : [];
            const testOrderVal = resolveNumericOrder(test?.order, 9999);
            const testBlockId = String(test?._id || "");
            const testOrderBadgeText = Number.isFinite(Number(test?.order)) ? `#${test.order}` : "";

            if (test.isDocumentedTest) {

                const uniqueTestId = `${test._id}`; // Combine test._id and test.order for unique ID
                const row = document.createElement("tr");
                row.setAttribute("data-order", testOrderVal);
                row.setAttribute("data-id", test._id);

                const detailsRow = document.createElement("tr");
                detailsRow.setAttribute("data-order", testOrderVal);
                detailsRow.setAttribute("data-id", test._id);
                detailsRow.setAttribute("data-test-block-id", testBlockId);
                detailsRow.setAttribute("data-row-role", "documented-test");
                const pagebreakcell = document.createElement("td");
                pagebreakcell.innerHTML = buildPageBreakCellHtml(
                    "lr-drag-handle--test",
                    `Drag to reorder test in database${testOrderBadgeText ? ` (Order ${testOrderBadgeText})` : ""}`
                );
                const detailsCell = document.createElement("td");
                detailsCell.colSpan = 4;
                detailsCell.style.width = "95%";

                const detailsDiv = document.createElement("div");
                detailsDiv.className = "editor-container";

                const docPrintBar = document.createElement("div");
                docPrintBar.className = "lr-doc-print-bar lr-print-ui";
                const docLabel = test.Name || "Documented Report";
                docPrintBar.innerHTML = `
                    <label style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;margin:0;">
                        <input type="checkbox" class="lr-row-print-check lr-print-doc-check" checked tabindex="-1" />
                        <span>Include in Report: ${docLabel}</span>
                    </label>
                    <button type="button" class="lr-row-only-btn" tabindex="-1">Only</button>
                `;
                detailsDiv.appendChild(docPrintBar);

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

                // âœ… Create buttons with data attributes
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

                // âœ… Initialize editor AND fetch templates
                setTimeout(() => {
                    initEditor(uniqueTestId, test.interpretation);

                    // Fetch templates after a small delay to ensure editor is ready
                    setTimeout(() => {
                        fetchTemplates(uniqueTestId, test._id);
                    }, 500);
                }, 1000);

                continue;
            }

            const { lowerValue, upperValue } = await getLowerUpperValues(patient, safeTestParameters[0]?.NormalValue);

            const row = document.createElement("tr");
            row.setAttribute("data-order", testOrderVal); // Set a data attribute for sorting
            row.setAttribute("data-test-block-id", testBlockId);

            if (safeTestParameters.length > 1) {
                row.setAttribute("data-row-role", "multi-header");
                // Row for tests with multiple parameters (dragging this moves the whole test block)
                row.innerHTML = `
                <td>${buildPageBreakCellHtml("lr-drag-handle--test", `Drag to reorder test in database${testOrderBadgeText ? ` (Order ${testOrderBadgeText})` : ""}`)}</td>
                <td class="test-name"><div class="lr-test-cell-wrap"><input type="checkbox" class="lr-row-print-check lr-print-group-check lr-print-ui" checked tabindex="-1" title="Include this test and all its parameters in Selected Report" /><div class="test-name-cell">${safeTestName}</div><button type="button" class="lr-row-only-btn lr-print-ui" tabindex="-1">Only</button></div></td>
                <td></td>
                <td></td>
                <td></td>
                    `;
                tbody.appendChild(row);

                // Respect persisted DB parameter order cleanly on initial render
                const sortedParameters = [...safeTestParameters].sort((paramA, paramB) => {
                    const ordA = resolveNumericOrder(paramA?.order, Number.MAX_SAFE_INTEGER);
                    const ordB = resolveNumericOrder(paramB?.order, Number.MAX_SAFE_INTEGER);
                    return ordA - ordB;
                });

                // Rows for individual parameters (dragging these reorders parameters inside this test)
                for (const param of sortedParameters) {
                    if (!param || typeof param !== "object") continue;
                    const safeParaName = String(param.Para_name || param.name || safeTestName || "Parameter");
                    const { lowerValue, upperValue } = await getLowerUpperValues(patient, param?.NormalValue);
                    const paramMasterKey =
                        param.masterParameterKey ||
                        param._id ||
                        test._id ||
                        ("param_" + safeParaName.toLowerCase().replace(/[^a-z0-9]/g, ""));
                    const paramOrderLabel = Number.isFinite(Number(param?.order)) ? ` (#${param.order})` : "";
                    const paramRow = document.createElement("tr");
                    paramRow.setAttribute("data-order", testOrderVal); // Keeps child row attached to parent test order
                    paramRow.setAttribute("data-test-block-id", testBlockId);
                    paramRow.setAttribute("data-row-role", "param-row");
                    paramRow.setAttribute("data-param-id", String(param._id || ""));
                    paramRow.setAttribute("data-master-param-key", String(paramMasterKey));
                    paramRow.setAttribute("data-param-name", safeParaName);
                    paramRow.innerHTML = `
        <td>${buildPageBreakCellHtml("lr-drag-handle--param", `Drag to reorder parameter inside ${safeTestName}${paramOrderLabel}`)}</td>
        <td style="padding-left: 20px;" class="test-name" id="parameters"><div class="lr-test-cell-wrap"><input type="checkbox" class="lr-row-print-check lr-print-param-check lr-print-ui" checked tabindex="-1" title="Include parameter in Selected Report" /><div class="test-name-cell">${safeParaName}</div><button type="button" class="lr-row-only-btn lr-print-ui" tabindex="-1">Only</button></div></td>
        <td class="unit">
            <div class="value-column">
                <div class="formulaIcon"></div>
                <span class="HighLow"></span>
                <div class="value-field ${(param.ValueType || (param.text ? "text" : "numeric") || "numeric").toString().toLowerCase() === "text" ? "is-text-ref" : "is-numeric-ref"}">
                    <input type="text" 
                        name="parameterName" 
                        data-test-id="${test._id || ""}" 
                        data-param-id="${param._id || ""}" 
                        data-master-param-key="${paramMasterKey}"
                        data-param-name="${safeParaName}" 
                        data-reference-type="${(param.ValueType || (param.text ? "text" : "numeric") || "numeric").toString().toLowerCase()}" 
                        data-Shortname="${test.Short_name || ""}" 
                        data-id="${safeParaName.replace(/\s+/g, '')}" 
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
        <td>${param.unit || ""}</td>
        <td class="reference"><i class="fas fa-edit" onclick="openModal(this)"></i>${param?.text || (lowerValue && upperValue ? `${lowerValue} - ${upperValue}` : "")}</td>
    `;
                    tbody.appendChild(paramRow);
                    // Add remark functionality
                    const addRemarkButton = paramRow.querySelector(".add-remark");
                    const input = row.querySelector("input");
                    // processInput(input);

                    let paramRowCalc = null; // Pehle null se initialize karein

                    if (safeParaName === "Basophils Percentage") {
                        paramRowCalc = document.createElement("tr");
                        paramRowCalc.setAttribute("data-order", testOrderVal); // Set a data attribute for sorting
                        paramRowCalc.setAttribute("data-test-block-id", testBlockId);
                        paramRowCalc.setAttribute("data-row-role", "differential-total");
                        paramRowCalc.setAttribute("data-owner-param-key", String(paramMasterKey));
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
                            remarkRow.setAttribute("data-order", testOrderVal); // Set a data attribute for sorting
                            remarkRow.setAttribute("data-test-block-id", testBlockId);
                            remarkRow.setAttribute("data-row-role", "inline-remark");
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
                row.setAttribute("data-row-role", "single-test");
                const singleParam = safeTestParameters[0] || {};
                const singleParaName = String(singleParam.Para_name || singleParam.name || safeTestName);
                const singleRefType = (singleParam.ValueType || (singleParam.text ? "text" : "numeric") || "numeric").toString().toLowerCase();
                row.innerHTML = `
    <td>${buildPageBreakCellHtml("lr-drag-handle--test", `Drag to reorder test in database${testOrderBadgeText ? ` (Order ${testOrderBadgeText})` : ""}`)}</td>
    <td class="test-name"><div class="lr-test-cell-wrap"><input type="checkbox" class="lr-row-print-check lr-print-test-check lr-print-ui" checked tabindex="-1" title="Include this test in Selected Report" /><div class="test-name-cell">${safeTestName}</div><button type="button" class="lr-row-only-btn lr-print-ui" tabindex="-1">Only</button></div></td>
    <td class="unit">
        <div class="value-column">
            <div class="formulaIcon"></div>
            <span class="HighLow"></span>
            <div class="value-field ${singleRefType === "text" ? "is-text-ref" : "is-numeric-ref"}">
                <input type="text" 
                    name="valueInput" 
                    class="value-input" 
                    data-test-id="${test._id || ""}" 
                    data-param-id="${singleParam._id || ""}" 
                    data-master-param-key="${singleParam.masterParameterKey || singleParam._id || test._id || ('param_' + singleParaName.toLowerCase().replace(/[^a-z0-9]/g, ''))}"
                    data-param-name="${singleParaName}" 
                    data-reference-type="${singleRefType}" 
                    data-Shortname="${test.Short_name || ""}" 
                    data-id="${safeTestName}" 
                    data-lower="${lowerValue || ""}" 
                    data-upper="${upperValue || ""}"
                    data-for-random="${singleParam.forRandom || false}"
                    data-lower-range="${singleParam.lowerRange || ""}"
                    data-upper-range="${singleParam.upperRange || ""}"
                    value="${singleParam.defaultresult || ""}">
                <button type="button" class="text-dropdown-trigger ${singleRefType === "text" ? "" : "placeholder-trigger"}" tabindex="-1">
                    <i class="fas fa-caret-down"></i>
                </button>
            </div>
            <button class="add-remark" tabindex="-1">+</button>
        </div>
    </td>
    <td>${singleParam.unit || ""}</td>
    <td class="reference"><i class="fas fa-edit" onclick="openModal(this)"></i>${singleParam?.text || (lowerValue && upperValue ? `${lowerValue} - ${upperValue}` : "")}</td>
`;
                tbody.appendChild(row);

                // Add remark functionality
                const addRemarkButton = row.querySelector(".add-remark");
                const input = row.querySelector("input");
                // processInput(input);

                let paramRowCalc = null; // Pehle null se initialize karein

                if (test.Name === "Basophils Percentage") {
                    paramRowCalc = document.createElement("tr");
                    paramRowCalc.setAttribute("data-order", testOrderVal); // Set a data attribute for sorting
                    paramRowCalc.setAttribute("data-test-block-id", testBlockId);
                    paramRowCalc.setAttribute("data-row-role", "differential-total");
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
                        remarkRow.setAttribute("data-order", testOrderVal); // Set a data attribute for sorting
                        remarkRow.setAttribute("data-test-block-id", testBlockId);
                        remarkRow.setAttribute("data-row-role", "inline-remark");
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
                ? Boolean(panelDetails?.hideMethodInstrument)
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

            const methodText = typeof test.method === "string" ? test.method.trim() : String(test.method || "").trim();
            const instrumentText = typeof test.instrument === "string" ? test.instrument.trim() : String(test.instrument || "").trim();

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
                detailsRow.setAttribute("data-order", testOrderVal);
                detailsRow.setAttribute("data-test-block-id", testBlockId);
                detailsRow.setAttribute("data-row-role", "test-details");
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

        if (isPanel && panelDetails) {
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
        if (isPanel && panelDetails) {
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

            // âœ… NEW: Check forRandom attribute
            const forRandom = input.getAttribute('data-for-random');

            // âœ… If forRandom is not true, skip this field
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

            // âœ… NEW: Get lowerRange and upperRange instead of lowerValue and upperValue
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

        // Event delegation on document: ensures listeners are NEVER dropped even if container innerHTML re-renders
        document.addEventListener("input", (event) => {
            const input = event.target.closest(".value-input");
            if (!input) return;
            if (input.dataset.formulaField === "true") {
                const val = String(input.value || "").trim();
                if (val !== "") {
                    input.dataset.formulaManual = "true";
                    delete input.dataset.formulaAutoCalculated;
                } else {
                    delete input.dataset.formulaManual;
                    delete input.dataset.formulaAutoCalculated;
                }
            }
            if (isTextReferenceInput(input) && event.isTrusted) {
                input.dataset.isAbnormal = "false";
            }
            processInput(input);
            handleInputChange(input);
        });

        document.addEventListener("change", (event) => {
            const input = event.target.closest(".value-input");
            if (!input) return;
            if (input.dataset.formulaField === "true") {
                const val = String(input.value || "").trim();
                if (val !== "") {
                    input.dataset.formulaManual = "true";
                    delete input.dataset.formulaAutoCalculated;
                } else {
                    delete input.dataset.formulaManual;
                    delete input.dataset.formulaAutoCalculated;
                }
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
        if (!resultInputs) return;
        const changedMasterKey = String(resultInputs.dataset?.masterParamKey || resultInputs.dataset?.paramId || "");
        recalculateFormulaCascadeFromParam(changedMasterKey, resultInputs);
    }
    window.__labReportHandleInputChange = handleInputChange;

    // for order in sequence heading, pannels, tests, tables
    async function groupTablesByCategory() {
        const container = document.getElementById("tables-container");
        const sections = Array.from(container.querySelectorAll(".section"));

        // Create a map to group sections by category
        const categoryMap = new Map();

        // Step 1: Group sections by category
        for (const section of sections) {
            const categoryHeading = section.querySelector("h2");
            if (categoryHeading) {
                const displayCategory = String(categoryHeading.textContent || section.dataset.catName || "General").trim() || "General";
                const categoryKey = normalizeCategoryKey(section.dataset.catKey || displayCategory);
                const dataOrder = resolveNumericOrder(categoryHeading.getAttribute("data-order"), 9999);

                if (!categoryMap.has(categoryKey)) {
                    categoryMap.set(categoryKey, { displayCategory, sections: [], dataOrder });
                } else {
                    const existingGroup = categoryMap.get(categoryKey);
                    if (dataOrder < existingGroup.dataOrder) {
                        existingGroup.dataOrder = dataOrder;
                    }
                    if (existingGroup.displayCategory === "General" && displayCategory !== "General") {
                        existingGroup.displayCategory = displayCategory;
                    }
                }

                // Preserve the section header bar (or bare h3) above the first table
                const headBar = section.querySelector(".lr-sec-head-bar");
                const h3Tag = headBar || section.querySelector("h3");
                const h3DataOrder = (section.querySelector("h3") || h3Tag)?.getAttribute("data-order");

                // Remove the category heading (h2)
                categoryHeading.remove();

                // Move heading bar / h3 above the first table if it exists
                const tables = section.querySelectorAll(".table");
                if (h3Tag && tables.length > 0) {
                    section.insertBefore(h3Tag, tables[0]);
                }

                // Step 2: Sort test blocks atomically by `data-order` (never splitting multi-param blocks)
                for (const table of tables) {
                    const tbody = table.querySelector("tbody");
                    if (tbody) {
                        const rows = Array.from(tbody.querySelectorAll(":scope > tr"));
                        const blocks = [];
                        const blockById = new Map();
                        const trailingRows = [];

                        for (const row of rows) {
                            const blockId = row.getAttribute("data-test-block-id");
                            if (!blockId) {
                                trailingRows.push(row);
                                continue;
                            }
                            if (!blockById.has(blockId)) {
                                const block = {
                                    blockId,
                                    order: resolveNumericOrder(row.getAttribute("data-order"), 9999),
                                    rows: [],
                                };
                                blockById.set(blockId, block);
                                blocks.push(block);
                            }
                            blockById.get(blockId).rows.push(row);
                        }

                        blocks.sort((a, b) => a.order - b.order);

                        const fragment = document.createDocumentFragment();
                        blocks.forEach((block) => {
                            block.rows.forEach((r) => fragment.appendChild(r));
                        });
                        trailingRows.forEach((r) => fragment.appendChild(r));
                        tbody.replaceChildren(fragment);
                    }
                }

                // Push section into category map
                categoryMap.get(categoryKey).sections.push({ section, h3DataOrder: h3DataOrder ? parseInt(h3DataOrder, 10) : null });
            }
        }

        // Step 3: Clear the container and re-add grouped sections
        container.innerHTML = "";

        // Sort categories by `data-order`
        const sortedCategories = Array.from(categoryMap.entries()).sort(
            ([, { dataOrder: orderA }], [, { dataOrder: orderB }]) =>
                resolveNumericOrder(orderA, 9999) - resolveNumericOrder(orderB, 9999)
        );

        // Step 4: Append sorted categories and sections
        for (const [, { displayCategory, sections, dataOrder }] of sortedCategories) {
            const groupedSection = document.createElement("div");
            groupedSection.classList.add("grouped-section");

            // Add category heading
            const categoryHeading = document.createElement("h2");
            categoryHeading.className = "lr-category-heading";
            categoryHeading.textContent = displayCategory;
            if (Number.isFinite(dataOrder)) categoryHeading.setAttribute("data-order", String(dataOrder));
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


        const { singleTests = [], panels = [] } = testpanels;

        // Group in O(n) using map for faster rendering on large reports.
        const singleTestsByCategoryMap = new Map();

        singleTests.forEach((test) => {
            if (!test || typeof test !== "object") return;
            // Update uniqueTestArray2
            const index = uniquetestArray2.indexOf(test.Name);
            if (index > -1 && test.Short_name) {
                uniquetestArray2.splice(index, 1);
                uniquetestArray2.push(test.Short_name);
            }

            const cat = normalizeCategoryMeta(test?.category, "General");
            const key = normalizeCategoryKey(cat.category);
            if (!singleTestsByCategoryMap.has(key)) {
                singleTestsByCategoryMap.set(key, {
                    category: cat, // store normalized category object
                    tests: []
                });
            } else {
                const existingEntry = singleTestsByCategoryMap.get(key);
                if (cat.orderId < existingEntry.category.orderId) {
                    existingEntry.category = cat;
                }
            }

            singleTestsByCategoryMap.get(key).tests.push(test);
        });

        const selectedItemIds = new Set(
            (booking?.selectedItems || [])
                .map((item) => String(item?.itemId || item?.id || ""))
                .filter(Boolean)
        );

        // Ensure standalone booked single tests are reflected in uniqueTestArray2
        singleTests.forEach((test) => {
            if (!test || typeof test !== "object") return;
            const testId = String(test._id || "");
            const origTestId = String(test.originalTestId || "");
            const label = test.Short_name || test.Name;
            if (!label) return;
            const isStandaloneBooked =
                (testId && selectedItemIds.has(testId)) ||
                (origTestId && selectedItemIds.has(origTestId));
            if (isStandaloneBooked && !uniquetestArray2.includes(label)) {
                uniquetestArray2.push(label);
            }
        });

        // Ensure panels are reflected in uniqueTestArray2 with their latest names from DB
        if (panels && panels.length > 0) {
            panels.forEach((panel) => {
                if (!panel?.name) return;
                const panelId = String(panel._id || "");
                const origId = String(panel.originalPanelId || "");

                // Check if any booking row had this panel ID
                (booking?.tableData || []).forEach(row => {
                    const matches = (row.ids || []).some(t => String(t?.id) === panelId || String(t?.id) === origId);
                    if (matches && row.testName) {
                        row.testName.split(",").map(s => s.trim()).filter(Boolean).forEach(oldName => {
                            const oldIndex = uniquetestArray2.indexOf(oldName);
                            if (oldIndex > -1 && oldName !== panel.name) {
                                uniquetestArray2.splice(oldIndex, 1);
                                if (!uniquetestArray2.includes(panel.name)) {
                                    uniquetestArray2.push(panel.name);
                                }
                            }
                        });
                    }
                });

                if (!uniquetestArray2.includes(panel.name)) {
                    const isBooked = (testpanels?.barcodes?.barcodes || []).some(b => 
                        (b.testIds || []).some(t => String(t?.id) === panelId || String(t?.id) === origId)
                    ) || (booking?.tableData || []).some(row => 
                        (row.ids || []).some(t => String(t?.id) === panelId || String(t?.id) === origId)
                    ) || (panelId && selectedItemIds.has(panelId)) || (origId && selectedItemIds.has(origId));

                    if (isBooked) {
                        uniquetestArray2.push(panel.name);
                    }
                }
            });
        }

        // Ensure packages are reflected in uniqueTestArray2 with their latest names from DB
        if (Array.isArray(testpanels?.packages) && testpanels.packages.length > 0) {
            testpanels.packages.forEach((pkg) => {
                if (!pkg?.packageName) return;
                const pkgId = String(pkg._id || "");
                const origId = String(pkg.originalPackageId || "");

                (booking?.tableData || []).forEach(row => {
                    const matches = (row.ids || []).some(t => String(t?.id) === pkgId || String(t?.id) === origId);
                    if (matches && row.testName) {
                        row.testName.split(",").map(s => s.trim()).filter(Boolean).forEach(oldName => {
                            const oldIndex = uniquetestArray2.indexOf(oldName);
                            if (oldIndex > -1 && oldName !== pkg.packageName) {
                                uniquetestArray2.splice(oldIndex, 1);
                                if (!uniquetestArray2.includes(pkg.packageName)) {
                                    uniquetestArray2.push(pkg.packageName);
                                }
                            }
                        });
                    }
                });

                if (!uniquetestArray2.includes(pkg.packageName)) {
                    const isBooked = (testpanels?.barcodes?.barcodes || []).some(b => 
                        (b.testIds || []).some(t => String(t?.id) === pkgId || String(t?.id) === origId)
                    ) || (booking?.tableData || []).some(row => 
                        (row.ids || []).some(t => String(t?.id) === pkgId || String(t?.id) === origId)
                    ) || (pkgId && selectedItemIds.has(pkgId)) || (origId && selectedItemIds.has(origId));

                    if (isBooked) {
                        uniquetestArray2.push(pkg.packageName);
                    }
                }
            });
        }

        uniquetestArray2 = [...new Set(uniquetestArray2.map(s => String(s).trim()).filter(Boolean))];
        const singleTestsByCategory = Array.from(singleTestsByCategoryMap.values());



        const matchedCategories = new Set();

        // Render panels and collect matched categories
        if (panels && panels.length > 0) {
            for (const panel of panels) {
                if (!panel || typeof panel !== "object") continue;
                const panelCategory = resolvePanelCategoryMeta(panel);
                const panelTests = (Array.isArray(panel.testsId) ? panel.testsId : [])
                    .filter((t) => t && typeof t === "object");
                await createTable(
                    `${panel.name || panel.Short_name || "Panel"}`,
                    panelCategory,
                    panelTests,
                    true,
                    false,
                    panel
                );

                matchedCategories.add(normalizeCategoryKey(panelCategory.category));
            }
        }

        // Render single tests whose categories are already matched
        for (const entry of singleTestsByCategory) {
            const { category, tests } = entry;
            if (matchedCategories.has(normalizeCategoryKey(category.category))) {
                await createTable(category.category, category, tests, false, false);
            }
        }

        // Render single tests whose categories were not matched
        for (const entry of singleTestsByCategory) {
            const { category, tests } = entry;
            if (!matchedCategories.has(normalizeCategoryKey(category.category))) {
                await createTable(category.category, category, tests);
            }
        }

        await groupTablesByCategory();
    }

    /**
     * Enables smooth mouse drag-and-drop row reordering directly inside Lab Report:
     *   1. Test-level drag (`.lr-drag-handle--test`): moves single tests, documented tests,
     *      or entire multi-parameter test blocks cleanly within their table and persists
     *      updated test `order` values in the database (`reorder-tests-from-report`).
     *   2. Parameter-level drag (`.lr-drag-handle--param`): moves parameters within their
     *      parent multi-parameter test and persists both `parameters` array order and
     *      `parameters[].order` in the database (`reorder-test-parameters`).
     */
    function initializeReportRowReordering() {
        const tablesContainer = document.getElementById("tables-container");
        if (!tablesContainer || tablesContainer.dataset.reorderInitialized === "true") {
            return;
        }
        tablesContainer.dataset.reorderInitialized = "true";

        let pendingRow = null;
        let pendingMode = "";
        let dragState = null;
        let autoScrollTimer = null;
        let lastDragClientY = 0;
        let reorderSaveInFlight = false;

        /** Collect all rows in `tbody` belonging to a given test block (`data-test-block-id`). */
        function getTestBlockRows(tbody, testBlockId) {
            if (!tbody || !testBlockId) return [];
            return Array.from(tbody.querySelectorAll(":scope > tr")).filter(
                (r) => r.getAttribute("data-test-block-id") === testBlockId
            );
        }

        /** Collect a parameter row + any immediately following inline remark / diff-total rows. */
        function getParamSubBlockRows(paramRow) {
            if (!paramRow) return [];
            const testBlockId = paramRow.getAttribute("data-test-block-id");
            const subRows = [paramRow];
            let cursor = paramRow.nextElementSibling;
            while (cursor && cursor.getAttribute("data-test-block-id") === testBlockId) {
                const role = cursor.getAttribute("data-row-role");
                if (role === "inline-remark" || role === "differential-total") {
                    subRows.push(cursor);
                    cursor = cursor.nextElementSibling;
                    continue;
                }
                break;
            }
            return subRows;
        }

        /** Map an inline-remark or differential-total row back to its owning `param-row`. */
        function findOwningParamRow(hoveredRow) {
            if (!hoveredRow) return null;
            const role = hoveredRow.getAttribute("data-row-role");
            if (role === "param-row") return hoveredRow;
            if (role !== "inline-remark" && role !== "differential-total") return null;

            const testBlockId = hoveredRow.getAttribute("data-test-block-id");
            let cursor = hoveredRow.previousElementSibling;
            while (cursor && cursor.getAttribute("data-test-block-id") === testBlockId) {
                if (cursor.getAttribute("data-row-role") === "param-row") {
                    return cursor;
                }
                if (cursor.getAttribute("data-row-role") === "multi-header") {
                    return null;
                }
                cursor = cursor.previousElementSibling;
            }
            return null;
        }

        function clearDropHighlights() {
            tablesContainer
                .querySelectorAll("tr.lr-drop-before, tr.lr-drop-after")
                .forEach((r) => r.classList.remove("lr-drop-before", "lr-drop-after"));
        }

        function stopAutoScroll() {
            if (autoScrollTimer) {
                clearInterval(autoScrollTimer);
                autoScrollTimer = null;
            }
        }

        function startAutoScroll() {
            stopAutoScroll();
            autoScrollTimer = setInterval(() => {
                if (!dragState || !lastDragClientY) return;
                const edgeThreshold = 85;
                const scrollStep = 14;
                if (lastDragClientY < edgeThreshold) {
                    window.scrollBy(0, -scrollStep);
                } else if (lastDragClientY > window.innerHeight - edgeThreshold) {
                    window.scrollBy(0, scrollStep);
                }
            }, 24);
        }

        function resetDragVisuals() {
            stopAutoScroll();
            clearDropHighlights();
            tablesContainer
                .querySelectorAll("tr.lr-row-dragging")
                .forEach((r) => r.classList.remove("lr-row-dragging"));
            if (pendingRow) {
                pendingRow.draggable = false;
                pendingRow = null;
            }
            pendingMode = "";
            if (dragState?.primaryRow) {
                dragState.primaryRow.draggable = false;
            }
            dragState = null;
        }

        function resolveDropPlan(hoveredRow, clientY) {
            if (!dragState || !hoveredRow) return null;
            const targetTbody = hoveredRow.closest("tbody");
            if (!targetTbody || targetTbody !== dragState.tbody) return null;

            if (dragState.mode === "param") {
                const targetParamRow = findOwningParamRow(hoveredRow);
                if (!targetParamRow) return null;
                if (targetParamRow.getAttribute("data-test-block-id") !== dragState.testBlockId) {
                    return null;
                }
                const targetSubRows = getParamSubBlockRows(targetParamRow);
                if (dragState.draggedRows.some((r) => targetSubRows.includes(r))) {
                    return null;
                }

                const firstRect = targetSubRows[0].getBoundingClientRect();
                const lastRect = targetSubRows[targetSubRows.length - 1].getBoundingClientRect();
                const midpointY = (firstRect.top + lastRect.bottom) / 2;
                const placeAfter = clientY >= midpointY;

                return {
                    highlightRow: placeAfter ? targetSubRows[targetSubRows.length - 1] : targetSubRows[0],
                    placeAfter,
                    insertBeforeNode: placeAfter
                        ? targetSubRows[targetSubRows.length - 1].nextSibling
                        : targetSubRows[0],
                };
            }

            // Test-block reorder: ignore non-test trailing rows (Notes / Advice / Remarks)
            const targetBlockId = hoveredRow.getAttribute("data-test-block-id");
            if (!targetBlockId || targetBlockId === dragState.testBlockId) return null;

            const targetBlockRows = getTestBlockRows(targetTbody, targetBlockId);
            if (!targetBlockRows.length) return null;

            const firstRect = targetBlockRows[0].getBoundingClientRect();
            const lastRect = targetBlockRows[targetBlockRows.length - 1].getBoundingClientRect();
            const midpointY = (firstRect.top + lastRect.bottom) / 2;
            const placeAfter = clientY >= midpointY;

            return {
                highlightRow: placeAfter ? targetBlockRows[targetBlockRows.length - 1] : targetBlockRows[0],
                placeAfter,
                insertBeforeNode: placeAfter
                    ? targetBlockRows[targetBlockRows.length - 1].nextSibling
                    : targetBlockRows[0],
            };
        }

        function syncInMemoryTestOrder(updatedOrders = {}, panelId = "") {
            const updateOrderOnDoc = (doc) => {
                if (!doc?._id) return;
                const nextOrd = updatedOrders[String(doc._id)];
                if (Number.isFinite(Number(nextOrd))) {
                    doc.order = Number(nextOrd);
                }
            };

            (testpanels?.singleTests || []).forEach(updateOrderOnDoc);
            (testpanels?.panels || []).forEach((panel) => {
                (panel?.testsId || []).forEach(updateOrderOnDoc);
                if (panelId && String(panel?._id) === String(panelId) && Array.isArray(panel.testsId)) {
                    panel.testsId.sort(
                        (a, b) => resolveNumericOrder(a?.order, 9999) - resolveNumericOrder(b?.order, 9999)
                    );
                    panel.tests = panel.testsId.map((t) => t?.Name).filter(Boolean);
                }
            });
        }

        function syncInMemoryParameterOrder(testId, orderedServerParams = []) {
            if (!testId || !Array.isArray(orderedServerParams) || !orderedServerParams.length) return;
            const orderById = new Map();
            const orderByMasterKey = new Map();
            orderedServerParams.forEach((p, idx) => {
                const ord = resolveNumericOrder(p?.order, idx + 1);
                if (p?._id) orderById.set(String(p._id), ord);
                if (p?.masterParameterKey) orderByMasterKey.set(String(p.masterParameterKey), ord);
            });

            const reorderDocParams = (testDoc) => {
                if (!testDoc || String(testDoc._id) !== String(testId) || !Array.isArray(testDoc.parameters)) return;
                testDoc.parameters.forEach((p, idx) => {
                    const matched =
                        (p?._id && orderById.get(String(p._id))) ||
                        (p?.masterParameterKey && orderByMasterKey.get(String(p.masterParameterKey)));
                    if (Number.isFinite(Number(matched))) {
                        p.order = Number(matched);
                    } else if (!Number.isFinite(Number(p.order))) {
                        p.order = idx + 1;
                    }
                });
                testDoc.parameters.sort(
                    (a, b) => resolveNumericOrder(a?.order, 9999) - resolveNumericOrder(b?.order, 9999)
                );
            };

            (testpanels?.singleTests || []).forEach(reorderDocParams);
            (testpanels?.panels || []).forEach((panel) => {
                (panel?.testsId || []).forEach(reorderDocParams);
            });
        }

        function restoreTbodySnapshot(tbody, snapshotRows) {
            if (!tbody || !Array.isArray(snapshotRows)) return;
            const frag = document.createDocumentFragment();
            snapshotRows.forEach((r) => {
                if (r) frag.appendChild(r);
            });
            tbody.replaceChildren(frag);
        }

        async function persistReorderedTests(tbody, snapshotRows) {
            const orderedTestIds = [];
            const seen = new Set();
            Array.from(tbody.querySelectorAll(":scope > tr[data-test-block-id]")).forEach((r) => {
                const id = r.getAttribute("data-test-block-id");
                if (id && !seen.has(id)) {
                    seen.add(id);
                    orderedTestIds.push(id);
                }
            });

            if (orderedTestIds.length < 2) return;
            const panelId = tbody.closest("table")?.dataset?.panelId || null;

            reorderSaveInFlight = true;
            try {
                const response = await fetch(`${BASE_URL}/api/v1/user/reorder-tests-from-report`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ orderedTestIds, panelId }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || payload?.success === false) {
                    throw new Error(payload?.message || "Failed to save test order to database.");
                }

                const updatedOrders = payload?.updatedOrders || {};
                Array.from(tbody.querySelectorAll(":scope > tr[data-test-block-id]")).forEach((r) => {
                    const blockId = r.getAttribute("data-test-block-id");
                    const nextOrder = updatedOrders[blockId];
                    if (Number.isFinite(Number(nextOrder))) {
                        r.setAttribute("data-order", String(nextOrder));
                        const handle = r.querySelector(".lr-drag-handle--test");
                        if (handle) {
                            handle.title = `Drag to reorder test in database (Order #${nextOrder})`;
                        }
                    }
                });

                syncInMemoryTestOrder(updatedOrders, panelId);
                syncDifferentialPercentageValidation();
                showStatusMessage("Test order saved to database.", "success", 2400);
            } catch (error) {
                console.error("Test reorder failed:", error);
                restoreTbodySnapshot(tbody, snapshotRows);
                syncDifferentialPercentageValidation();
                showStatusMessage(error?.message || "Could not update test order in database.", "error", 3600);
            } finally {
                reorderSaveInFlight = false;
            }
        }

        async function persistReorderedParameters(tbody, testId, snapshotRows) {
            const paramRows = Array.from(
                tbody.querySelectorAll(`:scope > tr[data-test-block-id="${CSS.escape(testId)}"][data-row-role="param-row"]`)
            );
            if (paramRows.length < 2) return;

            const orderedParameters = paramRows.map((r) => ({
                parameterId: r.getAttribute("data-param-id") || "",
                masterParameterKey: r.getAttribute("data-master-param-key") || "",
                paraName: r.getAttribute("data-param-name") || "",
            }));

            reorderSaveInFlight = true;
            try {
                const response = await fetch(`${BASE_URL}/api/v1/user/reorder-test-parameters`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ testId, orderedParameters }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || payload?.success === false) {
                    throw new Error(payload?.message || "Failed to save parameter order to database.");
                }

                paramRows.forEach((r, idx) => {
                    const handle = r.querySelector(".lr-drag-handle--param");
                    if (handle) {
                        const baseName = r.getAttribute("data-param-name") || "parameter";
                        handle.title = `Drag to reorder ${baseName} (#${idx + 1})`;
                    }
                });

                syncInMemoryParameterOrder(testId, payload?.parameters || []);
                syncDifferentialPercentageValidation();
                showStatusMessage("Parameter order saved to database.", "success", 2400);
            } catch (error) {
                console.error("Parameter reorder failed:", error);
                restoreTbodySnapshot(tbody, snapshotRows);
                syncDifferentialPercentageValidation();
                showStatusMessage(error?.message || "Could not update parameter order in database.", "error", 3600);
            } finally {
                reorderSaveInFlight = false;
            }
        }

        // Enable `draggable` strictly when user grabs the grip handle (preserves input text selection)
        tablesContainer.addEventListener("pointerdown", (event) => {
            if (reorderSaveInFlight) return;
            const handle = event.target.closest(".lr-drag-handle");
            if (!handle) {
                if (pendingRow) {
                    pendingRow.draggable = false;
                    pendingRow = null;
                }
                pendingMode = "";
                return;
            }
            const row = handle.closest("tbody > tr");
            if (!row) return;
            pendingRow = row;
            pendingMode = handle.classList.contains("lr-drag-handle--param") ? "param" : "test";
            row.draggable = true;
        });

        document.addEventListener("pointerup", () => {
            if (!dragState && pendingRow) {
                pendingRow.draggable = false;
                pendingRow = null;
                pendingMode = "";
            }
        });

        tablesContainer.addEventListener("dragstart", (event) => {
            const row = event.target.closest("tbody > tr");
            if (!row || reorderSaveInFlight || pendingRow !== row) {
                event.preventDefault();
                return;
            }

            const tbody = row.closest("tbody");
            const testBlockId = row.getAttribute("data-test-block-id");
            if (!tbody || !testBlockId) {
                event.preventDefault();
                resetDragVisuals();
                return;
            }

            const mode = pendingMode || (row.getAttribute("data-row-role") === "param-row" ? "param" : "test");
            const draggedRows =
                mode === "param" ? getParamSubBlockRows(row) : getTestBlockRows(tbody, testBlockId);
            if (!draggedRows.length) {
                event.preventDefault();
                resetDragVisuals();
                return;
            }

            dragState = {
                mode,
                tbody,
                testBlockId,
                primaryRow: row,
                draggedRows,
                dropPlan: null,
            };

            draggedRows.forEach((r) => r.classList.add("lr-row-dragging"));
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", testBlockId);
            }
            lastDragClientY = event.clientY;
            startAutoScroll();
        });

        tablesContainer.addEventListener("dragover", (event) => {
            if (!dragState) return;
            lastDragClientY = event.clientY;

            const hoveredRow = event.target.closest("tbody > tr");
            const plan = resolveDropPlan(hoveredRow, event.clientY);
            clearDropHighlights();
            dragState.dropPlan = plan;

            if (!plan) return;
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "move";
            }
            plan.highlightRow.classList.add(plan.placeAfter ? "lr-drop-after" : "lr-drop-before");
        });

        tablesContainer.addEventListener("drop", async (event) => {
            if (!dragState) return;
            event.preventDefault();

            const activeDrag = dragState;
            const hoveredRow = event.target.closest("tbody > tr");
            const plan = resolveDropPlan(hoveredRow, event.clientY) || activeDrag.dropPlan;

            if (!plan) {
                resetDragVisuals();
                return;
            }

            const { tbody, mode, testBlockId, draggedRows } = activeDrag;
            const snapshotRows = Array.from(tbody.children);
            const anchorNode = plan.insertBeforeNode;

            // Avoid inserting inside the dragged rows themselves
            if (anchorNode && draggedRows.includes(anchorNode)) {
                resetDragVisuals();
                return;
            }

            const fragment = document.createDocumentFragment();
            draggedRows.forEach((r) => fragment.appendChild(r));
            tbody.insertBefore(fragment, anchorNode || null);

            const afterRows = Array.from(tbody.children);
            const hasChanged = snapshotRows.some((r, idx) => afterRows[idx] !== r);

            resetDragVisuals();
            if (!hasChanged) return;

            if (mode === "param") {
                await persistReorderedParameters(tbody, testBlockId, snapshotRows);
            } else {
                await persistReorderedTests(tbody, snapshotRows);
            }
        });

        tablesContainer.addEventListener("dragend", () => {
            resetDragVisuals();
        });
    }

    let selectiveReportMod = null;
    async function loadSelectiveEngineSafe() {
        if (selectiveReportMod) return selectiveReportMod;
        try {
            const origin = (typeof BASE_URL === "string" && BASE_URL) ? BASE_URL : window.location.origin;
            selectiveReportMod = await import(`${origin}/js/selectiveReportEngine.mjs?v=1`);
        } catch (err) {
            console.warn("[LabReport] selectiveReportEngine unavailable:", err?.message || err);
        }
        return selectiveReportMod;
    }

    function normalizeSelCmp(str) {
        return String(str ?? "")
            .replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/gi, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function getRowPrintLabel(row) {
        if (!row) return "";
        if (row.getAttribute("data-row-role") === "documented-test") {
            const lbl = row.querySelector(".lr-doc-print-bar span")?.textContent || "";
            return lbl.replace(/^Include in Report:\s*/i, "").trim();
        }
        return (row.querySelector(".test-name-cell")?.textContent || row.querySelector(".test-name")?.textContent || "").trim();
    }

    function getCleanTestNameHtml(row) {
        const td = row?.querySelector(".test-name");
        if (!td) return null;
        const clone = td.cloneNode(true);
        clone.querySelectorAll(".lr-print-ui").forEach((n) => n.remove());
        const wrap = clone.querySelector(".lr-test-cell-wrap");
        if (wrap) {
            while (wrap.firstChild) clone.insertBefore(wrap.firstChild, wrap);
            wrap.remove();
        }
        return clone.outerHTML;
    }

    function initializeSelectiveReportControls() {
        const container = document.getElementById("tables-container");
        if (!container || container.dataset.selInitialized === "true") return;
        container.dataset.selInitialized = "true";

        const badgeEl = document.getElementById("lrSelSummaryBadge");
        const summaryTextEl = document.getElementById("lrSelSummaryText");
        const pkgRowEl = document.getElementById("lrSelPackageRow");
        const panelRowEl = document.getElementById("lrSelPanelRow");
        const matrixEl = document.getElementById("lrSelQuickMatrix");
        const toggleBtn = document.getElementById("lrSelToggleDetailsBtn");
        const allBtn = document.getElementById("lrSelAllBtn");
        const noneBtn = document.getElementById("lrSelNoneBtn");
        const selectedReportBtn = document.getElementById("selectedReportBtn");
        const selectedReportLbl = document.getElementById("lrSelectedReportLabel");
        const formatSelectEl = document.getElementById("lrSelectedFormatSelect");

        if (formatSelectEl) {
            const defFormat = String(
                user?.role === "staff"
                    ? user?.tenantId?.adminDetails?.userId?.pdfFormat
                    : user?.pdfFormat
            ).trim() || "reportFormat1";
            const opt0 = formatSelectEl.querySelector('option[value=""]');
            if (opt0) opt0.textContent = `Default (${defFormat})`;
        }

        const getAllSections = () => Array.from(container.querySelectorAll(".section"));
        const getSelectableRowsIn = (root) =>
            Array.from(root.querySelectorAll("tbody tr")).filter((tr) =>
                Boolean(tr.querySelector(".lr-row-print-check"))
            );
        const getLeafRowsIn = (root) =>
            getSelectableRowsIn(root).filter((tr) => tr.getAttribute("data-row-role") !== "multi-header");

        const getGroupChildParams = (groupRow) => {
            const tbody = groupRow?.closest("tbody");
            const blockId = groupRow?.getAttribute("data-test-block-id");
            if (!tbody || !blockId) return [];
            return Array.from(tbody.querySelectorAll(`tr[data-test-block-id="${CSS.escape(blockId)}"][data-row-role="param-row"]`));
        };

        const getParamParentGroup = (paramRow) => {
            const tbody = paramRow?.closest("tbody");
            const blockId = paramRow?.getAttribute("data-test-block-id");
            if (!tbody || !blockId) return null;
            return tbody.querySelector(`tr[data-test-block-id="${CSS.escape(blockId)}"][data-row-role="multi-header"]`);
        };

        // Map package memberships cleanly from testpanels.packages
        const packages = Array.isArray(testpanels?.packages) ? testpanels.packages : [];
        const packageMembersMap = new Map();

        const findMemberCheckboxesForPackage = (pkg) => {
            const testNameSet = new Set(
                (pkg?.testIds || []).map((t) => normalizeSelCmp(t?.Name || t?.testName)).filter(Boolean)
            );
            const panelNameSet = new Set(
                (pkg?.pannelIds || []).map((p) => normalizeSelCmp(p?.name || p?.panelName)).filter(Boolean)
            );
            const matchedRows = new Set();

            getAllSections().forEach((sec) => {
                const secTitleNorm = normalizeSelCmp(sec.dataset.panelTitle || "");
                const secIsInPkg = sec.dataset.isPanel === "1" && panelNameSet.has(secTitleNorm);
                getSelectableRowsIn(sec).forEach((tr) => {
                    if (secIsInPkg) {
                        matchedRows.add(tr);
                        return;
                    }
                    const rowNorm = normalizeSelCmp(getRowPrintLabel(tr));
                    if (rowNorm && testNameSet.has(rowNorm)) {
                        matchedRows.add(tr);
                        if (tr.getAttribute("data-row-role") === "multi-header") {
                            getGroupChildParams(tr).forEach((ch) => matchedRows.add(ch));
                        }
                    }
                });
            });
            return Array.from(matchedRows);
        };

        const syncAllHierarchyStates = () => {
            // 1. Sync multi-header checkboxes from their child params
            container.querySelectorAll('tr[data-row-role="multi-header"]').forEach((gRow) => {
                const gCb = gRow.querySelector(".lr-row-print-check");
                const params = getGroupChildParams(gRow);
                if (!gCb || !params.length) return;
                const checkedCount = params.filter((p) => p.querySelector(".lr-row-print-check")?.checked).length;
                gCb.checked = checkedCount === params.length;
                gCb.indeterminate = checkedCount > 0 && checkedCount < params.length;
                gRow.classList.toggle("lr-row-excluded", checkedCount === 0);
            });

            // 2. Update row visual excluded styling
            getSelectableRowsIn(container).forEach((tr) => {
                if (tr.getAttribute("data-row-role") === "multi-header") return;
                const cb = tr.querySelector(".lr-row-print-check");
                tr.classList.toggle("lr-row-excluded", Boolean(cb && !cb.checked));
            });

            // 3. Sync section header checkboxes + panel pills
            const sections = getAllSections();
            sections.forEach((sec) => {
                const secCb = sec.querySelector(".lr-sec-print-check");
                const leafs = getLeafRowsIn(sec);
                if (!secCb || !leafs.length) return;
                const checkedCount = leafs.filter((tr) => tr.querySelector(".lr-row-print-check")?.checked).length;
                secCb.checked = checkedCount === leafs.length;
                secCb.indeterminate = checkedCount > 0 && checkedCount < leafs.length;
            });

            // 4. Sync quick panel chip checkboxes
            if (panelRowEl) {
                panelRowEl.querySelectorAll("input[data-sec-idx]").forEach((cb) => {
                    const idx = Number(cb.getAttribute("data-sec-idx"));
                    const sec = sections[idx];
                    if (!sec) return;
                    const leafs = getLeafRowsIn(sec);
                    const checkedCount = leafs.filter((tr) => tr.querySelector(".lr-row-print-check")?.checked).length;
                    cb.checked = leafs.length > 0 && checkedCount === leafs.length;
                    cb.indeterminate = checkedCount > 0 && checkedCount < leafs.length;
                });
            }

            // 5. Sync package chips
            if (pkgRowEl) {
                pkgRowEl.querySelectorAll("input[data-pkg-key]").forEach((cb) => {
                    const key = cb.getAttribute("data-pkg-key");
                    const rows = (packageMembersMap.get(key) || []).filter(
                        (tr) => tr.getAttribute("data-row-role") !== "multi-header"
                    );
                    if (!rows.length) return;
                    const checkedCount = rows.filter((tr) => tr.querySelector(".lr-row-print-check")?.checked).length;
                    cb.checked = checkedCount === rows.length;
                    cb.indeterminate = checkedCount > 0 && checkedCount < rows.length;
                });
            }

            // 6. Update top badge & button labels
            const allLeafs = getLeafRowsIn(container);
            const selectedCount = allLeafs.filter((tr) => tr.querySelector(".lr-row-print-check")?.checked).length;
            const totalCount = allLeafs.length;

            if (badgeEl && summaryTextEl) {
                badgeEl.classList.remove("is-subset", "is-empty");
                if (selectedCount === 0) {
                    badgeEl.classList.add("is-empty");
                    summaryTextEl.textContent = `Report Selection: 0 / ${totalCount} items (Select at least 1)`;
                } else if (selectedCount === totalCount) {
                    summaryTextEl.textContent = `Report Selection: All Selected (${totalCount} / ${totalCount} — Full Report)`;
                } else {
                    badgeEl.classList.add("is-subset");
                    summaryTextEl.textContent = `Selected Subset: ${selectedCount} / ${totalCount} items for Report`;
                }
            }
            if (selectedReportBtn && selectedReportLbl) {
                selectedReportBtn.disabled = selectedCount === 0;
                selectedReportLbl.textContent =
                    selectedCount === totalCount
                        ? `Selected Report (${totalCount})`
                        : `Selected Report (${selectedCount}/${totalCount})`;
            }
        };

        const setRowsChecked = (rows, checked) => {
            rows.forEach((tr) => {
                const cb = tr.querySelector(".lr-row-print-check");
                if (cb) {
                    cb.checked = checked;
                    cb.indeterminate = false;
                }
            });
            syncAllHierarchyStates();
        };

        const selectOnlyRows = (targetRows) => {
            setRowsChecked(getSelectableRowsIn(container), false);
            setRowsChecked(targetRows, true);
            syncAllHierarchyStates();
        };

        // Build Quick Package & Panel chips cleanly
        const sections = getAllSections();
        if (pkgRowEl && packages.length > 0) {
            pkgRowEl.style.display = "flex";
            pkgRowEl.innerHTML = `<span class="lr-sel-group-lbl"><i class="fa-solid fa-box-open"></i> Packages:</span>`;
            packages.forEach((pkg, idx) => {
                const pkgKey = String(pkg?._id || `pkg_${idx}`);
                const members = findMemberCheckboxesForPackage(pkg);
                packageMembersMap.set(pkgKey, members);
                if (!members.length) return;

                const chip = document.createElement("div");
                chip.className = "lr-sel-chip";
                chip.innerHTML = `
                    <input type="checkbox" data-pkg-key="${pkgKey}" checked />
                    <span>${pkg.packageName}</span>
                    <button type="button" class="lr-sel-only-btn">Only</button>
                `;
                chip.querySelector("input").addEventListener("change", (e) => {
                    setRowsChecked(members, e.target.checked);
                });
                chip.querySelector(".lr-sel-only-btn").addEventListener("click", () => {
                    selectOnlyRows(members);
                });
                pkgRowEl.appendChild(chip);
            });
            if (matrixEl) matrixEl.classList.add("is-open");
        }

        if (panelRowEl && sections.length > 0) {
            panelRowEl.innerHTML = `<span class="lr-sel-group-lbl"><i class="fa-solid fa-vials"></i> Panels / Categories:</span>`;
            sections.forEach((sec, idx) => {
                const label = sec.dataset.panelTitle || sec.dataset.catName || `Section ${idx + 1}`;
                const leafs = getLeafRowsIn(sec);
                const chip = document.createElement("div");
                chip.className = "lr-sel-chip";
                chip.innerHTML = `
                    <input type="checkbox" data-sec-idx="${idx}" checked />
                    <span>${label} (${leafs.length})</span>
                    <button type="button" class="lr-sel-only-btn">Only</button>
                `;
                chip.querySelector("input").addEventListener("change", (e) => {
                    setRowsChecked(getSelectableRowsIn(sec), e.target.checked);
                });
                chip.querySelector(".lr-sel-only-btn").addEventListener("click", () => {
                    selectOnlyRows(getSelectableRowsIn(sec));
                });
                panelRowEl.appendChild(chip);
            });
            if (matrixEl && sections.length > 1) {
                matrixEl.classList.add("is-open");
            }
        }

        // Delegate clicks/changes inside #tables-container for sections & rows
        container.addEventListener("change", (e) => {
            const target = e.target;
            if (!(target instanceof HTMLInputElement)) return;
            if (target.classList.contains("lr-sec-print-check")) {
                const sec = target.closest(".section");
                if (sec) setRowsChecked(getSelectableRowsIn(sec), target.checked);
                return;
            }
            if (target.classList.contains("lr-row-print-check")) {
                const row = target.closest("tr");
                if (!row) return;
                if (row.getAttribute("data-row-role") === "multi-header") {
                    setRowsChecked(getGroupChildParams(row), target.checked);
                } else {
                    syncAllHierarchyStates();
                }
            }
        });

        container.addEventListener("click", (e) => {
            const secOnly = e.target?.closest?.(".lr-sec-head-bar .lr-sel-only-btn");
            if (secOnly) {
                const sec = secOnly.closest(".section");
                if (sec) selectOnlyRows(getSelectableRowsIn(sec));
                return;
            }
            const rowOnly = e.target?.closest?.(".lr-row-only-btn");
            if (rowOnly) {
                const row = rowOnly.closest("tr");
                if (!row) return;
                const role = row.getAttribute("data-row-role");
                if (role === "multi-header") {
                    selectOnlyRows([row, ...getGroupChildParams(row)]);
                } else if (role === "param-row") {
                    const parent = getParamParentGroup(row);
                    selectOnlyRows(parent ? [parent, row] : [row]);
                } else {
                    selectOnlyRows([row]);
                }
            }
        });

        toggleBtn?.addEventListener("click", () => {
            matrixEl?.classList.toggle("is-open");
        });
        allBtn?.addEventListener("click", () => {
            setRowsChecked(getSelectableRowsIn(container), true);
        });
        noneBtn?.addEventListener("click", () => {
            setRowsChecked(getSelectableRowsIn(container), false);
        });

        syncAllHierarchyStates();
    }

    async function buildSelectionManifestForSavedReport(savedReportDoc) {
        const mod = await loadSelectiveEngineSafe();
        if (!mod || !savedReportDoc) return null;

        const container = document.getElementById("tables-container");
        const sections = Array.from(container?.querySelectorAll(".section") || []);
        const tree = mod.buildReportSelectionTree(savedReportDoc, testpanels);
        const leafItems = [];
        tree.sections.forEach((sec) => {
            const hasChildren = new Set(sec.items.filter((i) => i.parentKey).map((i) => i.parentKey));
            sec.items.forEach((it) => {
                if (it.kind === "group" && hasChildren.has(it.key)) return;
                leafItems.push({ sec, it });
            });
        });

        // Build per-(sectionTitle, label) queue of checked booleans from current DOM rows
        const checkedQueueBySection = new Map();
        sections.forEach((sec) => {
            const catName = sec.closest(".grouped-section")?.querySelector("h2")?.textContent || sec.dataset.catName || "";
            const panelTitle = sec.dataset.panelTitle || sec.querySelector("h3")?.textContent || "";
            const isPanel = sec.dataset.isPanel === "1";
            const bucketKey = `${normalizeSelCmp(catName)}::${normalizeSelCmp(isPanel ? panelTitle : catName)}`;
            if (!checkedQueueBySection.has(bucketKey)) checkedQueueBySection.set(bucketKey, new Map());
            const itemMap = checkedQueueBySection.get(bucketKey);

            sec.querySelectorAll("tbody tr").forEach((tr) => {
                const cb = tr.querySelector(".lr-row-print-check");
                if (!cb) return;
                const role = tr.getAttribute("data-row-role");
                if (role === "multi-header") return;

                let hasVal = false;
                if (role === "documented-test") {
                    const ed = tr.querySelector("[id^='editorContent']");
                    const uId = ed?.id?.replace("editorContent-", "");
                    hasVal = Boolean(uId && getEditorContent(uId));
                } else {
                    const inp = tr.querySelector(".value-input");
                    hasVal = inp ? !isBlankOrDotOnlyValue(inp.value) : true;
                }
                if (!hasVal) return;

                const lblNorm = normalizeSelCmp(getRowPrintLabel(tr));
                if (!itemMap.has(lblNorm)) itemMap.set(lblNorm, []);
                itemMap.get(lblNorm).push(Boolean(cb.checked));
            });
        });

        const selectedKeys = [];
        const selectedLabels = [];
        let allChecked = true;

        leafItems.forEach(({ sec, it }) => {
            const bucketKey = `${normalizeSelCmp(sec.categoryName)}::${normalizeSelCmp(sec.isPanel ? sec.panelTitle : sec.categoryName)}`;
            const itemMap = checkedQueueBySection.get(bucketKey);
            const normLabel = normalizeSelCmp(it.label);
            let isChecked = true;

            if (itemMap && itemMap.has(normLabel) && itemMap.get(normLabel).length > 0) {
                isChecked = itemMap.get(normLabel).shift();
            } else {
                // Fallback match across DOM rows by label when categorized headings were merged
                const domMatch = Array.from(container.querySelectorAll("tbody tr")).find((tr) => {
                    const cb = tr.querySelector(".lr-row-print-check");
                    return cb && tr.getAttribute("data-row-role") !== "multi-header" && normalizeSelCmp(getRowPrintLabel(tr)) === normLabel;
                });
                if (domMatch) {
                    isChecked = Boolean(domMatch.querySelector(".lr-row-print-check")?.checked);
                }
            }

            if (isChecked) {
                selectedKeys.push(it.key);
                selectedLabels.push(it.shortLabel || it.label);
            } else {
                allChecked = false;
            }
        });

        if (!allChecked && selectedKeys.length === 0) {
            return { empty: true };
        }

        return {
            version: 1,
            bookingId: savedReportDoc.bookingId || booking?.bookingId || "",
            reportId: String(savedReportDoc._id || ""),
            mode: allChecked ? "full" : "selected",
            allSelected: allChecked,
            selectedItemKeys: selectedKeys,
            selectedLabels,
            includeMoreDetails: true,
        };
    }

    await renderData();
    initializeSelectiveReportControls();
    initializeReportRowReordering();
    await loadTenantFormulas();
    addIconsToMatchingRows();
    recalculateAllFormulas();
    setupListeners();
    addInputListeners();
    syncDifferentialPercentageValidation();
    await lisresult();
    await fetchEnteredResult();

    // Extra safety pass in next frames to guarantee all dynamically rendered or animated rows are attached
    requestAnimationFrame(() => {
        addIconsToMatchingRows();
        recalculateAllFormulas();
    });

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
                        if (input.dataset.formulaField === "true" && String(matchingData.currentvalue ?? "").trim() !== "") {
                            input.dataset.formulaManual = "true";
                        }
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
                    const uniqueTestId = editorId.replace('editorContent-', ''); // âœ… Extract uniqueTestId
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
            addIconsToMatchingRows();
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
            let populatedCount = 0;

            function findMachineValue(lisData, input) {
                if (!lisData || typeof lisData !== "object" || !input) return undefined;

                const candidates = [
                    input.getAttribute('data-Shortname'),
                    input.dataset?.shortname,
                    input.dataset?.paramName,
                    input.dataset?.id,
                    input.dataset?.masterParamKey,
                    input.closest("tr")?.querySelector(".test-name-cell")?.textContent?.trim(),
                    input.closest("tr")?.children?.[1]?.textContent?.trim()
                ].filter(Boolean);

                const cleanStr = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

                // 1. Exact match on any candidate key
                for (const cand of candidates) {
                    if (Object.prototype.hasOwnProperty.call(lisData, cand)) {
                        return lisData[cand];
                    }
                }

                // 2. Case-insensitive & normalized match
                const lisEntries = Object.entries(lisData).filter(([k]) => !k.startsWith("_") && k !== "sample_id");

                for (const cand of candidates) {
                    const normCand = cleanStr(cand);
                    if (!normCand) continue;

                    for (const [key, val] of lisEntries) {
                        if (cleanStr(key) === normCand) {
                            return val;
                        }
                    }
                }

                // 3. Clinical alias matching
                if (typeof normalizeClinicalName === "function") {
                    for (const cand of candidates) {
                        const candClin = normalizeClinicalName(cand);
                        if (!candClin) continue;

                        for (const [key, val] of lisEntries) {
                            const keyClin = normalizeClinicalName(key);
                            if (keyClin && keyClin === candClin) {
                                return val;
                            }
                        }
                    }
                }

                return undefined;
            }

            Object.entries(object).forEach(([Key, value]) => {
                if (!Array.isArray(value)) return;
                value.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                value.forEach((element) => {
                    if (!element?.lisData) return;

                    for (const row of tablecontainer) {
                        const input = row.querySelector(".value-input");
                        if (!input) continue;

                        const machineVal = findMachineValue(element.lisData, input);

                        if (machineVal !== undefined && machineVal !== null && machineVal !== "") {
                            input.value = machineVal;
                            if (input.dataset.formulaField === "true") {
                                input.dataset.formulaManual = "true";
                            }

                            // Subtle highlight animation for imported fields
                            input.style.transition = "background-color 0.4s ease, border-color 0.4s ease";
                            const origBg = input.style.backgroundColor;
                            input.style.backgroundColor = "#e8f7ee";
                            input.style.borderColor = "#2e9b57";
                            setTimeout(() => {
                                input.style.backgroundColor = origBg;
                                input.style.borderColor = "";
                            }, 1800);

                            processInput(input);
                            handleInputChange(input);
                            populatedCount++;
                        }
                    }
                });
            });

            if (typeof syncDifferentialPercentageValidation === "function") {
                syncDifferentialPercentageValidation();
            }
            if (typeof recalculateAllFormulas === "function") {
                recalculateAllFormulas();
            }

            if (populatedCount > 0) {
                showStatusMessage(`LIS: Successfully loaded ${populatedCount} parameter value(s) from analyzer!`, "success", 4000);
            }
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
                <div class="infor-div"><div class="tags">Investigations:</div> <div class="value-header">${Array.isArray(uniquetestArray2) ? uniquetestArray2.join(", ") : uniquetestArray2}</div></div>
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
                    <input name="DateTime" type="datetime-local" id="reportedOn" name="reportedOn" value="${booking.reportedOn || ''}">
                </div>
            </div>
            <div class="barcode-div2">
                <div class="barcode2">
                    <div id="barcodeContainer2">
                        <img id="barcodeImage" alt="Sample Barcode" />
                        <span id="lrBarcodeNumberText" class="lr-barcode-text"></span>
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

    function extractValidBarcodeToken(raw) {
        if (!raw) return "";
        if (typeof raw === "string" || typeof raw === "number") {
            const s = String(raw).trim();
            return s && s.toLowerCase() !== "undefined" && s.toLowerCase() !== "null" ? s : "";
        }
        if (typeof raw === "object") {
            return extractValidBarcodeToken(
                raw.barcode || raw.barcodeId || raw.confirmBarcodeId || raw.number || ""
            );
        }
        return "";
    }

    function resolveLabReportBarcodeNumber() {
        const candidates = [];
        if (Array.isArray(booking?.acceptedbarcode)) {
            booking.acceptedbarcode.forEach((entry) => candidates.push(extractValidBarcodeToken(entry)));
        } else {
            candidates.push(extractValidBarcodeToken(booking?.acceptedbarcode));
        }

        const barcodeList = testpanels?.barcodes?.barcodes;
        if (Array.isArray(barcodeList)) {
            barcodeList.forEach((entry) => candidates.push(extractValidBarcodeToken(entry)));
        }

        if (Array.isArray(booking?.tableData)) {
            booking.tableData.forEach((row) => {
                candidates.push(extractValidBarcodeToken(row?.confirmBarcodeId || row?.barcodeId || row?.barcode));
            });
        }

        candidates.push(extractValidBarcodeToken(booking?.bookingId || booking?.reg_id));

        return candidates.find(Boolean) || "";
    }

    // for generating barcode
    async function barcodegenerator() {
        const imgEl = document.getElementById("barcodeImage");
        const textEl = document.getElementById("lrBarcodeNumberText");
        const barcodeNumber = resolveLabReportBarcodeNumber();

        if (!barcodeNumber) {
            if (imgEl) imgEl.style.display = "none";
            if (textEl) textEl.textContent = "Barcode N/A";
            return;
        }

        if (!Array.isArray(booking.acceptedbarcode) || booking.acceptedbarcode.length === 0) {
            booking.acceptedbarcode = [barcodeNumber];
        }
        if (textEl) textEl.textContent = barcodeNumber;

        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/generate-barcode`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({ number: barcodeNumber }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            if (data?.barcode && imgEl) {
                imgEl.style.display = "block";
                imgEl.src = data.barcode;
                imgEl.alt = `Barcode ${barcodeNumber}`;
            } else {
                throw new Error("Empty barcode image returned");
            }
        } catch (error) {
            console.error("Error generating barcode:", error);
            if (imgEl) imgEl.style.display = "none";
            showStatusMessage("Failed to generate barcode image.", "error");
        }
    }

    //initialization
    await barcodegenerator();

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
                // âœ… Pehle existing editor ko destroy karo (agar exist karta hai)
                if (editorInstances.has(editorKey)) {
                    await editorInstances.get(editorKey).destroy();
                    editorInstances.delete(editorKey);
                }

                // âœ… Purane toolbar ko remove karo
                const existingToolbar = editorContainer.querySelector('.ck-toolbar-container');
                if (existingToolbar) {
                    existingToolbar.remove();
                }

                // âœ… Editor element ko clear karo
                const editorElement = document.querySelector(`#${editorElementId}`);
                if (editorElement) {
                    editorElement.innerHTML = '';
                }

                // Display area ko hide karo aur editor ko show karo
                displayArea.style.display = 'none';
                editorContainer.style.display = 'block';

                // âœ… CKEditor initialize karo - safely check first
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

                    // âœ… Toolbar ko manually attach karo
                    const toolbarContainer = document.createElement('div');
                    toolbarContainer.classList.add('ck-toolbar-container');
                    editorContainer.insertBefore(toolbarContainer, editorElement);
                    toolbarContainer.appendChild(editor.ui.view.toolbar.element);

                    // âœ… Editor instance ko store karo
                    editorInstances.set(editorKey, editor);

                    // âœ… Initial content set karo
                    if (interpretationText?.innerHTML) {
                        editor.setData(interpretationText.innerHTML);
                    }


                } catch (error) {
                    console.error('âŒ Error initializing CKEditor:', error);
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
            const numericAge = Number.isFinite(age) ? age : 0;
            const normUnit = String(unit || "years").trim().toLowerCase();
            if (normUnit.startsWith("y")) return numericAge * 365;
            if (normUnit.startsWith("m")) return numericAge * 30;
            if (normUnit.startsWith("d")) return numericAge;
            return numericAge * 365;
        };

        // Extract patient age and unit safely, then convert to days
        const ageStr = String(patient?.age ?? "").trim();
        const ageMatch = ageStr.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?/);
        const patientAge = ageMatch ? parseFloat(ageMatch[1]) : 0;
        const patientAgeUnit = (ageMatch && ageMatch[2]) ? ageMatch[2] : "Years";
        const patientAgeInDays = convertToDays(patientAge, patientAgeUnit);

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

    // Fixed extractTableData function - blank/dot-only value-input rows are skipped from final save.
    function extractTableData() {
        const tables = document.querySelectorAll("#tables-container .section table");
        const allTableData = [];
        const completionMeta = {
            totalRows: 0,
            savedRows: 0,
            skippedRows: 0,
            hasIncompleteValues: false,
        };

        tables.forEach((table) => {
            const category = table.closest(".grouped-section").querySelector("h2")?.textContent || "Unknown Category";
            const title = table.closest(".section").querySelector("h3")?.textContent || "Unknown Title";

            const rows = table.querySelectorAll("tbody tr:not(.exclude)");
            const tableData = [];
            let tableNotes = null;
            let tableRemarks = null;
            let tableAdvice = null;
            let tableInterpretation = null;

            rows.forEach((row) => {
                const pagebreak = row?.cells[0]?.querySelector('input[type="checkbox"]')?.checked || false;

                const testName = getCleanTestNameHtml(row);
                const inputEl = row.querySelector(".value-input");
                const rawValue = inputEl?.value ?? "";
                const trimmedValue = String(rawValue).trim();
                const valueInput = isBlankOrDotOnlyValue(rawValue) ? null : trimmedValue;
                const unit = row.querySelector(".unit + td")?.textContent?.trim() || null;
                const reference = row.querySelector(".reference")?.textContent?.trim() || null;
                const referenceType = (inputEl?.dataset.referenceType || "numeric").toLowerCase();
                const lowerValue = parseFloat(inputEl?.getAttribute('data-lower'));
                const upperValue = parseFloat(inputEl?.getAttribute('data-upper'));
                let isAbnormal = inputEl?.dataset.isAbnormal === "true";
                let isBold = false;
                const rowOrder = row.getAttribute("data-order");
                const testNameCell = row.querySelector(".test-name");
                const isFirstParameterRowInGroup =
                    Boolean(inputEl) &&
                    testNameCell?.id === "parameters" &&
                    row.previousElementSibling?.getAttribute("data-order") === rowOrder &&
                    !row.previousElementSibling?.querySelector(".value-input");

                let highLowFlag = row.querySelector(".HighLow")?.textContent?.trim() || "";
                if (referenceType === "text") {
                    isBold = isAbnormal;
                    if (!isAbnormal && !highLowFlag && reference) {
                        const cleanVal = trimmedValue.replace(/,/g, "");
                        const numVal = /^-?\d+(?:\.\d+)?$/.test(cleanVal) ? parseFloat(cleanVal) : NaN;
                        const simpleRange = String(reference).replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|\bto\b)\s*(-?\d+(?:\.\d+)?)/i);
                        if (!isNaN(numVal) && simpleRange) {
                            const lo = parseFloat(simpleRange[1]);
                            const hi = parseFloat(simpleRange[2]);
                            if (!isNaN(lo) && !isNaN(hi) && lo <= hi) {
                                if (numVal < lo) { isAbnormal = true; isBold = true; highLowFlag = "L"; }
                                else if (numVal > hi) { isAbnormal = true; isBold = true; highLowFlag = "H"; }
                            }
                        }
                    }
                } else {
                    const numericValue = parseFloat(trimmedValue.replace(/,/g, ""));
                    const positive = trimmedValue.toLowerCase() === "positive";
                    if (positive) {
                        isBold = true;
                        isAbnormal = true;
                    } else if (!isNaN(numericValue)) {
                        if (!isNaN(lowerValue) && numericValue < lowerValue) { isBold = true; isAbnormal = true; highLowFlag = highLowFlag || "L"; }
                        else if (!isNaN(upperValue) && numericValue > upperValue) { isBold = true; isAbnormal = true; highLowFlag = highLowFlag || "H"; }
                    }
                }

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

                const isMultiParameterHeadingRow =
                    !inputEl &&
                    Boolean(testName) &&
                    !editorContent &&
                    !unit &&
                    !reference &&
                    (row.querySelector(".test-name-cell")?.textContent?.trim() || row.querySelector(".test-name")?.textContent?.trim());

                const hasValueField = Boolean(inputEl);
                const shouldSkipBlankValueRow = hasValueField && !editorContent && isBlankOrDotOnlyValue(rawValue) && !isFirstParameterRowInGroup;

                if (hasValueField) {
                    completionMeta.totalRows += 1;
                    if (shouldSkipBlankValueRow) {
                        completionMeta.skippedRows += 1;
                        completionMeta.hasIncompleteValues = true;
                    } else {
                        completionMeta.savedRows += 1;
                    }
                }

                if (shouldSkipBlankValueRow) {
                    return;
                }

                if (testName || valueInput || unit || reference || editorContent) {
                    tableData.push({
                        pagebreak,
                        testName: editorContent || testName,
                        value: valueInput,
                        hasValueField: Boolean(inputEl),
                        isMultiParameterHeading: Boolean(isMultiParameterHeadingRow),
                        unit,
                        reference,
                        referenceType,
                        isAbnormal,
                        isBold,
                        highLow: highLowFlag,
                        isDocumented,
                    });
                    return;
                }

                const colspanCell = row.querySelector("[colspan='3'], [colspan='4'], [colspan='5']");
                if (!colspanCell) {
                    return;
                }

                if (colspanCell.querySelector("#remarkoftest")) {
                    const value = colspanCell.querySelector("#remarkoftest").value;
                    tableData.push({
                        pagebreak,
                        testName: null,
                        value: null,
                        unit: null,
                        reference: null,
                        isDocumented: false,
                        remark: value,
                    });
                    return;
                }

                if (colspanCell.querySelector("textarea")) {
                    const value = colspanCell.querySelector("textarea").value;
                    const labelText = colspanCell.previousElementSibling?.textContent?.toLowerCase() || "";

                    if (labelText.includes("remarks")) {
                        tableRemarks = value;
                    } else if (labelText.includes("advice")) {
                        tableAdvice = value;
                    } else if (labelText.includes("notes")) {
                        tableNotes = value;
                    }
                    return;
                }

                const innerContent = colspanCell.querySelector(".test-details")?.innerHTML;
                if (innerContent) {
                    tableData.push({
                        pagebreak,
                        testName: null,
                        value: null,
                        unit: null,
                        reference: null,
                        isDocumented: false,
                        details: innerContent,
                    });
                }
            });

            const interpretationRow = Array.from(table.querySelectorAll("tr")).find((row) =>
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

        return {
            allTableData,
            completionMeta,
            completionStatus: completionMeta.hasIncompleteValues ? "Partially Completed" : "Completed",
        };
    }

    // for saving data 
    async function saveTablesToDatabase(saveOnly, { selective = false, formatOverride = "" } = {}) {
        const extractedData = extractTableData();
        delete booking.__v;
        delete booking.updatedAt;
        delete booking._id;
        delete booking.createdAt;
        delete booking.tableData;

        const registeredOn = document.getElementById('registeredOn')?.value || "";
        const collectedOn = document.getElementById('collectedOn')?.value || "";
        const receivedOn = document.getElementById('receivedOn')?.value || "";
        const reportedOn = document.getElementById('reportedOn')?.value || "";

        booking.registeredOn = registeredOn;
        booking.collectedOn = collectedOn;
        booking.receivedOn = receivedOn;
        booking.reportedOn = reportedOn;
        try {
            localStorage.setItem("booking", JSON.stringify(booking));
        } catch (e) {}
        const categorized = document.getElementById('check1').checked;
        const moredetails = document.getElementById('moredetails').value;
        const completionMeta = extractedData.completionMeta;
        const completionStatus = extractedData.completionStatus;
        const defaultPdfFormat = String(
            user?.role === "staff"
                ? user?.tenantId?.adminDetails?.userId?.pdfFormat
                : user?.pdfFormat
        ).trim() || "reportFormat1";
        const resolvedPdfFormat = String(formatOverride || defaultPdfFormat).trim() || "reportFormat1";

        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/saveReportData`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    reportData: extractedData.allTableData,
                    reg_id: booking.bookingId,
                    booking,
                    registeredOn,
                    collectedOn, receivedOn, reportedOn, categorized, moredetails,
                    uniquetestArray: uniquetestArray2,
                    isdocumented,
                    reportCompletionMeta: completionMeta,
                    reportCompletionStatus: completionStatus,
                }),
            });

            if (!response.ok) {
                let message = "Failed to save report data.";
                try {
                    const payload = await response.json();
                    message = payload?.message || payload?.error || message;
                } catch {
                    // Keep the fallback message when the server does not return JSON.
                }
                showStatusMessage(message, "error");
                return false;
            }

            if (response.ok && saveOnly) {
                const result = await response.json();

                const barcodeId = result._id;
                if (!barcodeId) {
                    showStatusMessage("Report saved, but redirect could not continue because report ID was missing.", "error");
                    return false;
                }

                let targetUrl = `${BASE_URL}/admin/admin.html?page=${encodeURIComponent(resolvedPdfFormat)}&value1=${encodeURIComponent(barcodeId)}`;
                if (selective) {
                    const mod = await loadSelectiveEngineSafe();
                    const manifest = await buildSelectionManifestForSavedReport(result);
                    if (manifest?.empty) {
                        showStatusMessage("Please select at least 1 test, panel, or package for Selected Report.", "error");
                        return false;
                    }
                    if (mod && manifest && manifest.mode === "selected" && !manifest.allSelected) {
                        const selKey = mod.generateSelectiveManifestKey(barcodeId);
                        mod.saveSelectionManifest(selKey, manifest);
                        targetUrl += `&selKey=${encodeURIComponent(selKey)}`;
                    }
                }

                showStatusMessage(
                    selective ? "Full results saved safely. Opening Selected Report..." : "Report saved successfully. Opening Full Report...",
                    "success"
                );
                window.location.assign(targetUrl);
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
                const uniqueTestId = editorId.replace('editorContent-', ''); // âœ… Extract uniqueTestId

                // âœ… CKEditor se data lena
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

    // Add an event listener for the Full Report submit button to trigger the API call
    document.getElementById("finalBtn").addEventListener("click", async (event) => {
        event.preventDefault(); // Prevent default form submission
        const btn = event.currentTarget;
        const formatOverride = document.getElementById("lrSelectedFormatSelect")?.value || "";
        btn.disabled = true;
        const reportedOnInput = document.getElementById('reportedOn');
        if (reportedOnInput && (!reportedOnManuallyEdited || !reportedOnInput.value)) {
            reportedOnInput.value = getCurrentReportedOnValue();
        }
        const returned = await checkFields(true);
        if (!returned) {
            btn.disabled = false;
            return;
        }
        await editdoctorsvisibility();
        await saveTablesToDatabase(true, { selective: false, formatOverride });
        btn.disabled = false;
    });

    // Selected Subset Report button: saves FULL results safely, then opens ONLY checked tests/panels/packages
    const selectedReportButton = document.getElementById("selectedReportBtn");
    if (selectedReportButton) {
        selectedReportButton.addEventListener("click", async (event) => {
            event.preventDefault();
            const btn = event.currentTarget;
            const formatOverride = document.getElementById("lrSelectedFormatSelect")?.value || "";
            btn.disabled = true;
            const reportedOnInput = document.getElementById('reportedOn');
            if (reportedOnInput && (!reportedOnManuallyEdited || !reportedOnInput.value)) {
                reportedOnInput.value = getCurrentReportedOnValue();
            }
            const returned = await checkFields(true);
            if (!returned) {
                btn.disabled = false;
                return;
            }
            await editdoctorsvisibility();
            await saveTablesToDatabase(true, { selective: true, formatOverride });
            btn.disabled = false;
        });
    }
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
        console.error("Failed to initialize lab report:", error);
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
            <span class="delete-btn" onclick="deleteRow(this)">ðŸ—‘ï¸</span>
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
            <span class="delete-btn" onclick="deleteRow(this)">ðŸ—‘ï¸</span>
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

// Function to Sort Rows atomically by test block & data-order attribute
function sortRowsByDataOrder(tbody) {
    const rows = Array.from(tbody.querySelectorAll(":scope > tr"));
    const blocks = [];
    const blockById = new Map();
    const trailingRows = [];

    rows.forEach((row) => {
        const blockId = row.getAttribute("data-test-block-id");
        if (blockId) {
            if (!blockById.has(blockId)) {
                const parsedOrder = Number(row.getAttribute("data-order"));
                const block = {
                    blockId,
                    order: Number.isFinite(parsedOrder) ? parsedOrder : 9999,
                    rows: [],
                };
                blockById.set(blockId, block);
                blocks.push(block);
            }
            blockById.get(blockId).rows.push(row);
        } else if (row.hasAttribute("data-order")) {
            const parsedOrder = Number(row.getAttribute("data-order"));
            blocks.push({
                blockId: null,
                order: Number.isFinite(parsedOrder) ? parsedOrder : 9999,
                rows: [row],
            });
        } else {
            trailingRows.push(row);
        }
    });

    blocks.sort((a, b) => a.order - b.order);

    const fragment = document.createDocumentFragment();
    blocks.forEach((block) => block.rows.forEach((r) => fragment.appendChild(r)));
    trailingRows.forEach((r) => fragment.appendChild(r));
    tbody.replaceChildren(fragment);
}
// sortTests() is already covered during grouped render flow.
