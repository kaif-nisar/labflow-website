(function () {
  if (window.LabFlowDeviceLockScreen) {
    return;
  }

  const state = {
    active: false,
    overlay: null,
    observer: null,
    speechPlayed: false,
    fetchWrapped: false,
  };

  const copy = {
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

  function clearStoredAuthTokens() {
    for (const key of ["token", "accessToken", "refreshToken"]) {
      try {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      } catch (_) {}
    }
  }

  function getWhatsAppNumber() {
    return String(
      window.LABFLOW_DEVICE_LOCK_WHATSAPP_NUMBER ||
      window.DEVICE_LOCK_WHATSAPP_NUMBER ||
      "919999999999"
    ).replace(/\D/g, "");
  }

  function getUserId() {
    return String(
      window.user?._id ||
      window.userId ||
      localStorage.getItem("userId") ||
      ""
    ).trim();
  }

  function buildWhatsAppLink() {
    const message =
      `Hello Admin, I have paid Rs.299 to add an extra device. Please approve. My User ID: ${getUserId() || "UNKNOWN"}`;
    return `https://wa.me/${getWhatsAppNumber()}?text=${encodeURIComponent(message)}`;
  }

  function injectStyles() {
    if (document.getElementById("labflow-device-lock-styles")) return;

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
        padding: 18px;
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
      }

      #labflow-device-lock-overlay .device-lock-headline,
      #labflow-device-lock-overlay .device-lock-card {
        border-radius: 22px;
        padding: 20px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.18);
      }

      #labflow-device-lock-overlay .device-lock-headline {
        background: linear-gradient(135deg, #ff1f1f 0%, #b81c1c 52%, #ffcf33 100%);
        color: #111;
        text-transform: uppercase;
      }

      #labflow-device-lock-overlay h1,
      #labflow-device-lock-overlay h2,
      #labflow-device-lock-overlay p {
        margin: 0 0 12px;
      }

      #labflow-device-lock-overlay h1 {
        font-size: clamp(2rem, 4.5vw, 4rem);
        line-height: 0.95;
        font-weight: 900;
        letter-spacing: 0.04em;
      }

      #labflow-device-lock-overlay h2 {
        font-size: clamp(1.3rem, 2.6vw, 2rem);
        line-height: 1.05;
        font-weight: 900;
        color: #fffbea;
      }

      #labflow-device-lock-overlay p {
        font-size: 1rem;
        line-height: 1.55;
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

  function ensureOverlay() {
    injectStyles();

    if (state.overlay && document.body.contains(state.overlay)) {
      return state.overlay;
    }

    const overlay = document.createElement("div");
    overlay.id = "labflow-device-lock-overlay";
    overlay.innerHTML = `
      <div class="device-lock-shell" role="dialog" aria-modal="true" aria-labelledby="deviceLockTitle">
        <div class="device-lock-banner">
          <div class="device-lock-headline">
            <h1 id="deviceLockTitle">${copy.englishTitle}</h1>
            <p>${copy.englishBody}</p>
            <p>${copy.englishUpgrade}</p>
            <p>${copy.englishSteps}</p>
          </div>
          <div class="device-lock-card">
            <h2>हिंदी / Hindi</h2>
            <p>${copy.hindiTitle}</p>
            <p>${copy.hindiBody}</p>
            <p>${copy.hindiUpgrade}</p>
            <p>${copy.hindiSteps}</p>
          </div>
        </div>
        <div class="device-lock-grid">
          <div class="device-lock-card">
            <h2>Payment QR Code</h2>
            <div class="device-lock-qr" data-device-lock-qr>UPI QR / GPay QR will appear here</div>
          </div>
          <div class="device-lock-card">
            <h2>WhatsApp Approval</h2>
            <p>Send the payment screenshot here and we will enable the extra device fast.</p>
            <a class="device-lock-whatsapp" data-device-lock-whatsapp target="_blank" rel="noreferrer noopener">
              WhatsApp पर स्क्रीनशॉट भेजें और चालू करवाएं
            </a>
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

    overlay.querySelector("[data-device-lock-whatsapp]").href = buildWhatsAppLink();
    document.body.appendChild(overlay);
    state.overlay = overlay;
    return overlay;
  }

  function playSpeech() {
    if (state.speechPlayed || !("speechSynthesis" in window)) return;
    state.speechPlayed = true;

    const utterance = new SpeechSynthesisUtterance(copy.speech);
    utterance.lang = "hi-IN";
    utterance.rate = 0.88;
    utterance.pitch = 1;
    utterance.volume = 1;

    const speakNow = () => {
      try {
        const voices = window.speechSynthesis.getVoices() || [];
        utterance.voice =
          voices.find((voice) => String(voice.lang || "").toLowerCase() === "hi-in") ||
          voices.find((voice) => /hindi/i.test(String(voice.name || voice.lang || ""))) ||
          null;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch (_) {}
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      speakNow();
    } else {
      window.speechSynthesis.addEventListener("voiceschanged", speakNow, { once: true });
      window.setTimeout(speakNow, 300);
    }
  }

  function keepAlive() {
    if (state.observer || !document.body) return;

    state.observer = new MutationObserver(() => {
      if (!state.active) return;
      const overlay = ensureOverlay();
      if (!document.body.contains(overlay)) {
        document.body.appendChild(overlay);
      }
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.style.pointerEvents = "none";
      overlay.style.display = "flex";
      overlay.style.pointerEvents = "auto";
    });
    state.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function activate(reason = "SESSION_INVALIDATED") {
    state.active = true;
    clearStoredAuthTokens();
    const overlay = ensureOverlay();
    const title = overlay.querySelector("#deviceLockTitle");
    if (title && reason !== "DEVICE_LIMIT_EXCEEDED") {
      title.textContent = "SESSION LOST! PLEASE LOGIN AGAIN";
    }
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.pointerEvents = "none";
    overlay.style.display = "flex";
    overlay.style.pointerEvents = "auto";
    keepAlive();
    playSpeech();
  }

  async function inspectResponse(response) {
    if (!response || ![401, 403].includes(response.status)) {
      return null;
    }

    let payload = {};
    try {
      payload = await response.clone().json();
    } catch (_) {
      try {
        payload = { message: await response.clone().text() };
      } catch (_) {
        payload = {};
      }
    }

    const code = String(payload?.error || payload?.code || payload?.message || "").trim().toUpperCase();
    if (response.status === 403 && code === "DEVICE_LIMIT_EXCEEDED") {
      return "DEVICE_LIMIT_EXCEEDED";
    }
    if (code === "DEVICE_SESSION_INVALIDATED" || code === "SESSION_INVALIDATED") {
      return "SESSION_INVALIDATED";
    }
    return null;
  }

  function installFetchGuard() {
    if (state.fetchWrapped || typeof window.fetch !== "function") return;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (...args) {
      const response = await originalFetch(...args);
      const reason = await inspectResponse(response);
      if (reason) activate(reason);
      return response;
    };
    state.fetchWrapped = true;
  }

  window.LabFlowDeviceLockScreen = {
    activate,
    installFetchGuard,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installFetchGuard, { once: true });
  } else {
    installFetchGuard();
  }
})();
