/**
 * editModel.js - Enterprise Admin User & Model Modification Module
 * 
 * Features:
 * 1. Zero-Blocker Validation Architecture (Zero-friction updates with sanitized fallbacks)
 * 2. Easy Password Change (1-click generation, show/hide toggle, non-intrusive update)
 * 3. Bidirectional Expiry & Active Days Synchronization Engine (Loop-locked Date <-> Days math)
 * 4. AI Smart Extraction & Ingestion Engine (Dual-layer backend AI + heuristic fallback + postal enrichment)
 * 5. Persistent Device Restriction Subsystem (Structured { isEnabled, maxAllowedDevices } with complete hydration)
 */

(async function () {
  'use strict';

  // ==========================================
  // 1. STATE & CONSTANTS
  // ==========================================
  let isSyncingDate = false;
  const BASE_URL = window.location.origin;

  // Tooltip Registry
  const fieldHelp = {
    fullName: "Owner/Admin का पूरा नाम या Lab/Franchise display name।",
    username: "Login username. बदलने पर next login में नया username use होगा।",
    email: "Alerts, billing और account communication के लिए official email।",
    role: "Account role type. यहां tenant owner admin fixed रहता है।",
    phoneNo: "Client का primary contact mobile number।",
    password: "Password reset करने के लिए नया password डालें। खाली छोड़ने पर existing password unchanged रहेगा।",
    state: "State-level mapping और taxation compliance के लिए।",
    district: "District-level mapping और geographical routing के लिए।",
    pinCode: "6-digit PIN code डालने पर District और State automatically auto-fill हो जाते हैं।",
    address: "Complete correspondence / physical address record।",
    wallet: "Booking wallet balance manual credit/debit adjustment के लिए।",
    status: "Active/Inactive से account overall access enable/disable होता है।",
    planType: "Subscription billing catalog plan type (Monthly, Half-Yearly, Yearly)।",
    price: "Current active subscription plan price (INR)।",
    monthlyPrice: "Monthly catalog price value।",
    quaterlyPrice: "Quarterly catalog package price value।",
    yearlyPrice: "Yearly catalog enterprise price value।",
    activeForDays: "Portal कितने दिनों तक active रहेगा। यह Expiry Date के साथ directly synchronized है।",
    customExpiryDate: "Manual expiry date/time override. Days बदलने पर यह auto-update होता है।",
    extendFromCurrent: "Yes: current expiry से आगे extend करें, No: today/now से reset करें।",
    graceMonths: "Expiry के बाद extra months access दें।",
    graceDays: "Expiry के बाद extra days access दें।",
    graceHours: "Emergency testing के लिए extra hours दें।",
    graceNote: "Grace period grant करने का internal audit note/reason।",
    paymentStatus: "Paid/Unpaid payment status tracking।",
    paymentAmount: "Cash / manual payment amount received (INR)।",
    paymentMethod: "Manual payment source type (Cash, UPI, Bank Transfer)।",
    manualActivate: "Payment receive होने पर manual activation mark करें।",
    deviceRestrictionToggle: "Enable करने पर unauthorized simultaneous logins block होंगे और hardware limits enforce होंगी।",
    maxAllowedDevices: "Simultaneous authorized hardware sessions की maximum permissible limit (1-4 devices)।",
    aiRawInput: "WhatsApp messages, chits, या raw text paste करके एक click में form auto-fill करें।"
  };

  // ==========================================
  // 2. DOM ELEMENT REFERENCES
  // ==========================================
  const form = document.getElementById("adminEditForm");
  const els = {
    // AI Extraction
    aiRawInput: document.getElementById("aiRawInput"),
    btnAiParse: document.getElementById("btnAiParse"),
    btnAiClear: document.getElementById("btnAiClear"),
    aiParseSpinner: document.getElementById("aiParseSpinner"),
    aiParseStatus: document.getElementById("aiParseStatus"),

    // Profile & Password
    fullName: document.getElementById("fullName"),
    username: document.getElementById("username"),
    email: document.getElementById("email"),
    role: document.getElementById("role"),
    phoneNo: document.getElementById("phoneNo"),
    password: document.getElementById("password"),
    btnTogglePassword: document.getElementById("btnTogglePassword"),
    btnGeneratePassword: document.getElementById("btnGeneratePassword"),

    // Address & Geo
    pinCode: document.getElementById("pinCode"),
    pincodeSpinner: document.getElementById("pincodeSpinner"),
    pincodeFeedback: document.getElementById("pincodeFeedback"),
    district: document.getElementById("district"),
    state: document.getElementById("state"),
    address: document.getElementById("address"),
    wallet: document.getElementById("wallet"),
    status: document.getElementById("status"),

    // Subscription & Expiry
    planType: document.getElementById("planType"),
    price: document.getElementById("price"),
    monthlyPrice: document.getElementById("monthlyPrice"),
    quaterlyPrice: document.getElementById("quaterlyPrice"),
    yearlyPrice: document.getElementById("yearlyPrice"),
    activeForDays: document.getElementById("activeForDays"),
    customExpiryDate: document.getElementById("customExpiryDate"),
    expirySyncText: document.getElementById("expirySyncText"),
    extendFromCurrent: document.getElementById("extendFromCurrent"),
    paymentStatus: document.getElementById("paymentStatus"),

    // Grace Period
    graceMonths: document.getElementById("graceMonths"),
    graceDays: document.getElementById("graceDays"),
    graceHours: document.getElementById("graceHours"),
    graceNote: document.getElementById("graceNote"),
    paymentAmount: document.getElementById("paymentAmount"),
    paymentMethod: document.getElementById("paymentMethod"),
    manualActivate: document.getElementById("manualActivate"),

    // Device Access Control
    deviceRestrictionToggle: document.getElementById("deviceRestrictionToggle"),
    maxDevicesContainer: document.getElementById("maxDevicesContainer"),
    maxAllowedDevices: document.getElementById("maxAllowedDevices"),
    policyDisplayCount: document.getElementById("policyDisplayCount"),
    activeSessionsCount: document.getElementById("activeSessionsCount"),
    purgeAllSessions: document.getElementById("purgeAllSessions"),

    // PDF Formats & Features
    format1: document.getElementById("format1"),
    format2: document.getElementById("format2"),
    format3: document.getElementById("format3"),
    format4: document.getElementById("format4"),
    printsetting: document.getElementById("printsetting"),
    testdatabase: document.getElementById("testdatabase"),
    randomResult: document.getElementById("randomResult"),

    // Submission & Feedback
    saveButton: document.getElementById("saveButton"),
    formStatusNotice: document.getElementById("formStatusNotice"),

    // Format Visual Divs
    formatDiv1: document.querySelector(".format1"),
    formatDiv2: document.querySelector(".format2"),
    formatDiv3: document.querySelector(".format3"),
    formatDiv4: document.querySelector(".format4"),
  };

  // ==========================================
  // 3. UI INITIALIZATION & TOOLTIPS
  // ==========================================
  function attachFieldHelp() {
    Object.entries(fieldHelp).forEach(([fieldId, helpText]) => {
      const label = document.querySelector(`label[for="${fieldId}"]`);
      if (!label || label.querySelector(".field-help-icon")) return;

      const parent = label.closest(".form-group") || label.closest(".form-group-edit") || label.parentElement;
      if (!parent) return;

      const icon = document.createElement("span");
      icon.className = "field-help-icon";
      icon.textContent = "i";
      icon.setAttribute("aria-label", "Help documentation");

      const tip = document.createElement("div");
      tip.className = "field-help-tip";
      tip.textContent = helpText;

      icon.addEventListener("mouseenter", () => {
        document.querySelectorAll(".field-help-tip.show").forEach((el) => el.classList.remove("show"));
        tip.classList.add("show");
      });
      icon.addEventListener("mouseleave", () => tip.classList.remove("show"));
      icon.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isVisible = tip.classList.contains("show");
        document.querySelectorAll(".field-help-tip.show").forEach((el) => el.classList.remove("show"));
        if (!isVisible) tip.classList.add("show");
      });

      label.appendChild(icon);
      parent.appendChild(tip);
    });

    document.addEventListener("click", () => {
      document.querySelectorAll(".field-help-tip.show").forEach((el) => el.classList.remove("show"));
    });
  }

  function setupFormatBackgrounds() {
    if (els.formatDiv1) els.formatDiv1.style.backgroundImage = `url("${BASE_URL}/images/format2.png")`;
    if (els.formatDiv2) els.formatDiv2.style.backgroundImage = `url("${BASE_URL}/images/format3.png")`;
    if (els.formatDiv3) els.formatDiv3.style.backgroundImage = `url("${BASE_URL}/images/format1.png")`;
    if (els.formatDiv4) {
      els.formatDiv4.style.backgroundImage = `url("${BASE_URL}/images/format4.png"), linear-gradient(#f3f3f3,#e8e8e8)`;
      els.formatDiv4.style.backgroundSize = "cover";
    }
  }

  attachFieldHelp();
  setupFormatBackgrounds();

  // ==========================================
  // 4. BIDIRECTIONAL EXPIRY & DAYS SYNCHRONIZER
  // ==========================================
  function getTodayMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }

  function formatDateForInput(date) {
    if (!date || isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  function formatHumanReadableDate(date) {
    if (!date || isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function updateExpiryPreview() {
    if (!els.expirySyncText) return;
    const daysVal = parseInt(els.activeForDays?.value, 10);
    const dateVal = els.customExpiryDate?.value;

    if (dateVal) {
      const dt = new Date(dateVal);
      if (!isNaN(dt.getTime())) {
        const daysLabel = Number.isFinite(daysVal) ? ` (${daysVal} days duration)` : "";
        els.expirySyncText.innerHTML = `Active until <strong>${formatHumanReadableDate(dt)}</strong>${daysLabel}`;
        return;
      }
    }

    if (Number.isFinite(daysVal) && daysVal > 0) {
      const today = getTodayMidnight();
      const target = new Date(today.getTime() + daysVal * 24 * 60 * 60 * 1000);
      els.expirySyncText.innerHTML = `Active for <strong>${daysVal} days</strong> (approx. ${formatHumanReadableDate(target)})`;
      return;
    }

    els.expirySyncText.textContent = "Specify active days or select an expiry date to establish subscription validity.";
  }

  // Scenario A: Date input changed -> Calculate calendar days from today
  function syncDateToDays() {
    if (isSyncingDate || !els.customExpiryDate || !els.activeForDays) return;
    const rawDate = els.customExpiryDate.value;
    if (!rawDate) return;

    const targetDate = new Date(rawDate);
    if (isNaN(targetDate.getTime())) return;

    isSyncingDate = true;
    try {
      const today = getTodayMidnight();
      const targetMidnight = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
      const diffTime = targetMidnight.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      els.activeForDays.value = Math.max(0, diffDays);
      updateExpiryPreview();
    } finally {
      isSyncingDate = false;
    }
  }

  // Scenario B: Days input changed -> Compute Today + N days
  function syncDaysToDate() {
    if (isSyncingDate || !els.customExpiryDate || !els.activeForDays) return;
    const rawDays = els.activeForDays.value;

    if (rawDays === "" || rawDays === null || rawDays === undefined) {
      updateExpiryPreview();
      return;
    }

    const days = parseInt(rawDays, 10);
    if (isNaN(days) || days < 0) return;

    isSyncingDate = true;
    try {
      const now = new Date();
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 23, 59, 0, 0);
      els.customExpiryDate.value = formatDateForInput(targetDate);
      updateExpiryPreview();
    } finally {
      isSyncingDate = false;
    }
  }

  if (els.customExpiryDate) {
    els.customExpiryDate.addEventListener("input", syncDateToDays);
    els.customExpiryDate.addEventListener("change", syncDateToDays);
  }

  if (els.activeForDays) {
    els.activeForDays.addEventListener("input", syncDaysToDate);
    els.activeForDays.addEventListener("change", syncDaysToDate);
  }

  if (els.planType) {
    els.planType.addEventListener("change", () => {
      const val = els.planType.value;
      let targetDays = 30;
      if (val === "yearly") targetDays = 365;
      else if (val === "quaterly") targetDays = 90;

      const currentDays = parseInt(els.activeForDays?.value, 10);
      if (!currentDays || [30, 90, 180, 365].includes(currentDays)) {
        if (els.activeForDays) els.activeForDays.value = targetDays;
        syncDaysToDate();
      }
    });
  }

  // ==========================================
  // 5. GEOGRAPHIC ENRICHMENT (PINCODE RESOLVER)
  // ==========================================
  let pincodeDebounceTimer = null;

  async function resolvePincode(pin) {
    const cleanPin = String(pin || "").trim();
    if (!/^[1-9][0-9]{5}$/.test(cleanPin)) {
      if (els.pincodeFeedback) els.pincodeFeedback.style.display = "none";
      return null;
    }

    if (els.pincodeSpinner) els.pincodeSpinner.style.display = "inline-flex";
    if (els.pincodeFeedback) els.pincodeFeedback.style.display = "none";

    try {
      const response = await fetch(`https://api.postalpincode.in/pincode/${cleanPin}`);
      if (!response.ok) throw new Error("Postal API network error");
      const data = await response.json();

      if (Array.isArray(data) && data[0]?.Status === "Success" && Array.isArray(data[0]?.PostOffice) && data[0].PostOffice.length > 0) {
        const office = data[0].PostOffice[0];
        const resolved = {
          district: office.District || "",
          state: office.State || "",
        };

        if (els.district && (!els.district.value || els.district.dataset.autofilled === "true")) {
          els.district.value = resolved.district;
          els.district.dataset.autofilled = "true";
        }
        if (els.state && (!els.state.value || els.state.dataset.autofilled === "true")) {
          els.state.value = resolved.state;
          els.state.dataset.autofilled = "true";
        }

        if (els.pincodeFeedback) {
          els.pincodeFeedback.textContent = `✓ Auto-detected: ${resolved.district}, ${resolved.state}`;
          els.pincodeFeedback.style.color = "#059669";
          els.pincodeFeedback.style.display = "block";
        }
        return resolved;
      }
    } catch (err) {
      console.warn("Pincode enrichment skipped:", err.message);
    } finally {
      if (els.pincodeSpinner) els.pincodeSpinner.style.display = "none";
    }
    return null;
  }

  if (els.pinCode) {
    els.pinCode.addEventListener("input", (e) => {
      clearTimeout(pincodeDebounceTimer);
      const val = e.target.value.replace(/\D/g, "").slice(0, 6);
      e.target.value = val;
      if (val.length === 6) {
        pincodeDebounceTimer = setTimeout(() => resolvePincode(val), 250);
      }
    });
    els.pinCode.addEventListener("blur", (e) => {
      if (e.target.value.length === 6) {
        resolvePincode(e.target.value);
      }
    });
  }

  // ==========================================
  // 6. PERSISTENT DEVICE RESTRICTION SUBSYSTEM
  // ==========================================
  function setDeviceRestrictionState(enabled, maxDevices) {
    const isEnabled = enabled !== false;
    const validLimit = Math.min(4, Math.max(1, parseInt(maxDevices, 10) || 1));

    if (els.deviceRestrictionToggle) {
      els.deviceRestrictionToggle.checked = isEnabled;
    }

    if (els.maxAllowedDevices) {
      els.maxAllowedDevices.value = String(validLimit);
    }

    if (els.maxDevicesContainer) {
      els.maxDevicesContainer.style.display = isEnabled ? "block" : "none";
    }

    if (els.policyDisplayCount) {
      els.policyDisplayCount.textContent = isEnabled ? String(validLimit) : "Disabled (Unlimited)";
    }
  }

  if (els.deviceRestrictionToggle) {
    els.deviceRestrictionToggle.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      setDeviceRestrictionState(isChecked, els.maxAllowedDevices?.value || 1);
    });
  }

  if (els.maxAllowedDevices) {
    els.maxAllowedDevices.addEventListener("change", (e) => {
      if (els.policyDisplayCount) {
        els.policyDisplayCount.textContent = e.target.value;
      }
    });
  }

  // ==========================================
  // 7. EASY PASSWORD CHANGE (SHOW/HIDE + 1-CLICK GENERATOR)
  // ==========================================
  function generateStrongPassword() {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
    let pass = "Lab@";
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  }

  if (els.btnGeneratePassword) {
    els.btnGeneratePassword.addEventListener("click", () => {
      const pass = generateStrongPassword();
      if (els.password) {
        els.password.value = pass;
        els.password.type = "text";
        const eyeIcon = els.btnTogglePassword?.querySelector("i");
        if (eyeIcon) {
          eyeIcon.className = "fas fa-eye-slash";
        }
      }
    });
  }

  if (els.btnTogglePassword) {
    els.btnTogglePassword.addEventListener("click", () => {
      if (!els.password) return;
      const isHidden = els.password.type === "password";
      els.password.type = isHidden ? "text" : "password";
      const icon = els.btnTogglePassword.querySelector("i");
      if (icon) {
        icon.className = isHidden ? "fas fa-eye-slash" : "fas fa-eye";
      }
    });
  }

  // ==========================================
  // 8. AI SMART EXTRACTION & INGESTION ENGINE
  // ==========================================
  function extractEntitiesClientFallback(text) {
    if (!text || typeof text !== "string") return { result: {}, extractedFields: [] };
    const cleanText = text.trim();
    const lines = cleanText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const result = {};
    const extractedFields = [];

    // 1. Email
    const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      result.email = emailMatch[0].toLowerCase();
      extractedFields.push("Email");
    }

    // 2. Phone
    const phoneMatch = cleanText.match(/(?:(?:\+?91[\s-]?)?[0]?)?([6-9]\d{4}[\s-]?\d{5})\b/);
    if (phoneMatch) {
      result.phoneNo = phoneMatch[1].replace(/[\s-]/g, "");
      extractedFields.push("Phone Number");
    }

    // 3. Pincode
    const pinMatch = cleanText.match(/(?:pin(?:\s*code)?|pincode|postal\s*code)?\s*[:=-]?\s*\b([1-9][0-9]{5})\b/i);
    if (pinMatch) {
      result.pinCode = pinMatch[1];
      extractedFields.push("PIN Code");
    }

    // 4. Device Restriction
    const devMatch = cleanText.match(/(?:device(?:s)?|allowed\s*devices?|device\s*limit)\s*[:=-]?\s*(\d+)/i)
      || cleanText.match(/(?:max|limit)\s*[:=-]?\s*(\d+)\s*device/i)
      || cleanText.match(/(\d+)\s*(?:allowed\s*)?device/i);
    if (devMatch) {
      const count = Math.min(4, Math.max(1, parseInt(devMatch[1], 10) || 1));
      result.deviceRestriction = { isEnabled: true, maxAllowedDevices: count };
      extractedFields.push(`Device Limit (${count})`);
    } else if (/single\s*device/i.test(cleanText)) {
      result.deviceRestriction = { isEnabled: true, maxAllowedDevices: 1 };
      extractedFields.push("Device Limit (1)");
    } else if (/no\s*(?:device\s*)?limit|unlimited\s*device|disable\s*device/i.test(cleanText)) {
      result.deviceRestriction = { isEnabled: false, maxAllowedDevices: 1 };
      extractedFields.push("Device Restriction Disabled");
    }

    // 5. Validity
    if (/(?:1\s*year|yearly|12\s*months?|365\s*days?|annual)/i.test(cleanText)) {
      result.planType = "yearly";
      result.activeForDays = 365;
      extractedFields.push("Validity (1 Year)");
    } else if (/(?:half\s*year|6\s*months?|quaterly|quarterly|3\s*months?|180\s*days?)/i.test(cleanText)) {
      result.planType = "quaterly";
      result.activeForDays = /(?:6\s*months?|180\s*days?|half\s*year)/i.test(cleanText) ? 180 : 90;
      extractedFields.push(`Validity (${result.activeForDays} Days)`);
    } else if (/(?:1\s*month|monthly|30\s*days?)/i.test(cleanText)) {
      result.planType = "monthly";
      result.activeForDays = 30;
      extractedFields.push("Validity (30 Days)");
    } else {
      const daysMatch = cleanText.match(/(?:validity|duration|active\s*for|period)\s*[:=-]?\s*(\d+)\s*days?/i)
        || cleanText.match(/(\d+)\s*days?\s*(?:validity|duration|access)/i);
      if (daysMatch) {
        result.activeForDays = parseInt(daysMatch[1], 10);
        extractedFields.push(`Validity (${result.activeForDays} Days)`);
      }
    }

    // 6. Rent / Pricing
    const rentMatch = cleanText.match(/(?:monthly\s*rent|rent|price|amount|rate)\s*[:=-]?\s*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
    if (rentMatch) {
      result.price = rentMatch[1].replace(/,/g, "");
      extractedFields.push("Price / Rent");
    }

    // 7. Full Name / Lab Name
    const nameMatch = cleanText.match(/(?:(?:dr\.?|doctor|owner|contact\s*person|proprietor|full\s*name|name))\s*[:=-]\s*([^\n\r,]+)/i);
    if (nameMatch) {
      result.fullName = nameMatch[1].trim();
      extractedFields.push("Full Name");
    } else {
      const candidateLine = lines.find((l) =>
        /(?:lab\b|diagnostics?\b|pathology\b|healthcare\b|clinic\b|hospital\b)/i.test(l) &&
        !/@/.test(l) &&
        !/http/i.test(l) &&
        !/(?:validity|duration|phone|email|rent|pincode|address|device)/i.test(l)
      );
      if (candidateLine) {
        result.fullName = candidateLine.replace(/^[-\s*•]+/, "").trim();
        extractedFields.push("Full Name");
      }
    }

    // 8. Address
    const addrMatch = cleanText.match(/(?:address|addr|location)\s*[:=-]?\s*([^\n\r]+)/i);
    if (addrMatch) {
      result.address = addrMatch[1].trim();
      extractedFields.push("Address");
    }

    return { result, extractedFields };
  }

  async function parseAndFillFromRawText() {
    const rawText = els.aiRawInput?.value?.trim();
    if (!rawText) {
      showAiStatus("Please paste or type unstructured notes first.", "info");
      return;
    }

    if (els.btnAiParse) els.btnAiParse.disabled = true;
    if (els.aiParseSpinner) els.aiParseSpinner.style.display = "inline-flex";
    showAiStatus("Analyzing text and extracting entities...", "info");

    let extractedData = {};
    let extractedFieldNames = [];

    try {
      // Layer 1: Async Backend AI parser endpoint
      try {
        const response = await fetch("/api/ai/parse-lab-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: rawText }),
        });

        if (response.ok) {
          const json = await response.json();
          if (json?.success && json.data) {
            extractedData = json.data;
            extractedFieldNames = Object.keys(json.data);
          }
        }
      } catch (backendErr) {
        console.info("Backend AI parser unavailable, using fallback:", backendErr.message);
      }

      // Layer 2: Client-side RegEx Heuristic Fallback
      if (!extractedData || Object.keys(extractedData).length === 0) {
        const fallback = extractEntitiesClientFallback(rawText);
        extractedData = fallback.result;
        extractedFieldNames = fallback.extractedFields;
      }

      // Populate UI fields
      if (extractedData.fullName && els.fullName) els.fullName.value = extractedData.fullName;
      if (extractedData.email && els.email) els.email.value = extractedData.email;
      if (extractedData.phoneNo && els.phoneNo) els.phoneNo.value = extractedData.phoneNo;
      if (extractedData.username && els.username) els.username.value = extractedData.username;
      if (extractedData.password && els.password) els.password.value = extractedData.password;
      if (extractedData.address && els.address) els.address.value = extractedData.address;
      if (extractedData.price && els.price) els.price.value = extractedData.price;
      if (extractedData.planType && els.planType) els.planType.value = extractedData.planType;

      if (extractedData.deviceRestriction) {
        setDeviceRestrictionState(
          extractedData.deviceRestriction.isEnabled,
          extractedData.deviceRestriction.maxAllowedDevices
        );
      }

      if (extractedData.activeForDays && els.activeForDays) {
        els.activeForDays.value = extractedData.activeForDays;
        syncDaysToDate();
      }

      const pin = extractedData.pinCode || extractedData.pincode;
      if (pin && els.pinCode) {
        els.pinCode.value = pin;
        resolvePincode(pin);
      }

      const summary = extractedFieldNames.length > 0
        ? `✨ Auto-filled ${extractedFieldNames.length} updated field(s) from text.`
        : "No standard entities recognized in pasted text.";

      showAiStatus(summary, "success");
    } catch (err) {
      console.error("Extraction error:", err);
      showAiStatus("Extraction completed with partial results.", "info");
    } finally {
      if (els.btnAiParse) els.btnAiParse.disabled = false;
      if (els.aiParseSpinner) els.aiParseSpinner.style.display = "none";
    }
  }

  function showAiStatus(message, type = "info") {
    if (!els.aiParseStatus) return;
    els.aiParseStatus.textContent = message;
    els.aiParseStatus.className = `ai-status-notice show ${type}`;
  }

  if (els.btnAiParse) els.btnAiParse.addEventListener("click", parseAndFillFromRawText);
  if (els.btnAiClear) {
    els.btnAiClear.addEventListener("click", () => {
      if (els.aiRawInput) els.aiRawInput.value = "";
      if (els.aiParseStatus) {
        els.aiParseStatus.className = "ai-status-notice";
        els.aiParseStatus.textContent = "";
      }
    });
  }

  // ==========================================
  // 9. HYDRATION / LOAD USER DETAILS
  // ==========================================
  const urlParams = new URLSearchParams(window.location.search);
  const tenantId = urlParams.get("modelId") || urlParams.get("tenantId") || urlParams.get("id");

  function showFormFeedback(message, type = "success") {
    if (!els.formStatusNotice) return;
    els.formStatusNotice.innerHTML = message;
    els.formStatusNotice.className = `form-status-notice show ${type}`;
    els.formStatusNotice.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  if (tenantId) {
    try {
      const res = await fetch(`/api/v1/user/tenants-model/${tenantId}`);
      if (!res.ok) throw new Error("Failed to fetch tenant details");
      const { data } = await res.json();

      if (data) {
        const user = data.adminDetails?.userId || {};
        const sub = data.subscriptionPlan || {};
        const catalog = data.planCatalog || {};

        // Profile Details
        if (els.fullName) els.fullName.value = user.fullName || data.name || "";
        if (els.username) els.username.value = user.username || "";
        if (els.email) els.email.value = user.email || "";
        if (els.role) els.role.value = user.role || "admin";
        if (els.phoneNo) els.phoneNo.value = user.phoneNo || "";

        // Address & Geo
        if (els.state) els.state.value = user.state || "";
        if (els.district) els.district.value = user.district || "";
        if (els.pinCode) els.pinCode.value = user.pinCode || "";
        if (els.address) els.address.value = user.address || "";
        if (els.wallet) els.wallet.value = user.bookingWallet || 0;
        if (els.status) els.status.value = user.isActive ? "true" : "false";

        // Feature Checkboxes
        if (els.printsetting) els.printsetting.checked = Boolean(user.showprintsetting);
        if (els.testdatabase) els.testdatabase.checked = Boolean(user.showtestdatabase);
        if (els.randomResult) els.randomResult.checked = Boolean(user.showRandomBtn);

        // PDF Format
        const pdfFormat = user.pdfFormat || "reportFormat";
        if (pdfFormat === "reportFormat3" && els.format1) els.format1.checked = true;
        else if (pdfFormat === "reportFormat1" && els.format2) els.format2.checked = true;
        else if (pdfFormat === "reportFormat4" && els.format4) els.format4.checked = true;
        else if (els.format3) els.format3.checked = true;

        // Subscription Info
        if (els.planType) els.planType.value = sub.planType || "monthly";
        if (els.price) els.price.value = sub.price ?? catalog.monthly?.price ?? 0;
        if (els.paymentStatus) els.paymentStatus.value = sub.paymentStatus || "paid";
        if (els.monthlyPrice) els.monthlyPrice.value = catalog.monthly?.price || sub.price || 0;
        if (els.quaterlyPrice) els.quaterlyPrice.value = catalog.quaterly?.price || 0;
        if (els.yearlyPrice) els.yearlyPrice.value = catalog.yearly?.price || 0;
        if (els.activeForDays) els.activeForDays.value = sub.durationDays || "";

        // Grace Period
        if (els.graceMonths) els.graceMonths.value = sub.gracePeriod?.months || 0;
        if (els.graceDays) els.graceDays.value = sub.gracePeriod?.days || 0;
        if (els.graceHours) els.graceHours.value = sub.gracePeriod?.hours || 0;
        if (els.graceNote) els.graceNote.value = sub.gracePeriod?.note || "";

        // Expiry Date
        if (sub.endDate) {
          const dt = new Date(sub.endDate);
          if (!Number.isNaN(dt.getTime())) {
            const offset = dt.getTimezoneOffset();
            const local = new Date(dt.getTime() - offset * 60000).toISOString().slice(0, 16);
            if (els.customExpiryDate) els.customExpiryDate.value = local;
          }
        }

        // Persistent Device Restriction Subsystem Hydration
        const isRestrictionEnabled = data.deviceRestriction?.isEnabled !== undefined
          ? Boolean(data.deviceRestriction.isEnabled)
          : user.is_device_restriction_enabled !== undefined
            ? Boolean(user.is_device_restriction_enabled)
            : true;

        const maxDevices = Number(
          data.deviceRestriction?.maxAllowedDevices ??
          user.max_allowed_devices ??
          1
        ) || 1;

        setDeviceRestrictionState(isRestrictionEnabled, maxDevices);

        // Active Session Count
        const sessions = user.active_sessions || [];
        const sessionCount = user.activeSessionCount || sessions.length || 0;
        if (els.activeSessionsCount) {
          els.activeSessionsCount.value = `${sessionCount} active session(s) online`;
        }

        // Update expiry preview
        updateExpiryPreview();
      }
    } catch (err) {
      console.error("Hydration error:", err);
      showFormFeedback("Notice: Failed to load user details from server.", "error");
    }
  }

  // ==========================================
  // 10. ZERO-BLOCKER FORM SUBMISSION
  // ==========================================
  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      if (!tenantId) {
        showFormFeedback("Error: No tenant ID found in URL parameters.", "error");
        return;
      }

      // Collect values safely
      const formData = new FormData(this);
      const data = Object.fromEntries(formData.entries());

      // Format & Features
      const formatRadio = document.querySelector('input[name="format"]:checked');
      data.pdfFormat = formatRadio ? formatRadio.value : "reportFormat1";
      data.showprintsetting = Boolean(els.printsetting?.checked);
      data.showtestdatabase = Boolean(els.testdatabase?.checked);
      data.showRandomBtn = Boolean(els.randomResult?.checked);

      // Status
      data.isActive = els.status?.value === "true";
      delete data.status;

      // Device Restriction Payload
      const isDeviceEnabled = Boolean(els.deviceRestrictionToggle?.checked);
      const maxDevices = isDeviceEnabled
        ? Math.min(4, Math.max(1, parseInt(els.maxAllowedDevices?.value, 10) || 1))
        : null;

      data.deviceRestriction = {
        isEnabled: isDeviceEnabled,
        maxAllowedDevices: maxDevices,
      };
      data.is_device_restriction_enabled = isDeviceEnabled;
      data.max_allowed_devices = maxDevices || 1;

      // Emergency session purge
      if (els.purgeAllSessions?.checked) {
        data.purgeAllSessions = true;
      }

      // Easy Password Change: Omit if empty to keep existing password intact
      const rawPassword = els.password?.value?.trim();
      if (rawPassword) {
        data.password = rawPassword;
      } else {
        delete data.password;
      }

      // Construct Complete Payload
      const payload = {
        ...data,
        wallet: Number(els.wallet?.value || 0),
        paymentAmount: Number(els.paymentAmount?.value || 0),
        paymentMethod: els.paymentMethod?.value || "manual",
        manualActivate: Boolean(els.manualActivate?.checked),
        planType: els.planType?.value || "monthly",
        price: Number(els.price?.value || 0),
        monthlyPrice: Number(els.monthlyPrice?.value || 0),
        quaterlyPrice: Number(els.quaterlyPrice?.value || 0),
        yearlyPrice: Number(els.yearlyPrice?.value || 0),
        activeForDays: Number(els.activeForDays?.value || 0),
        customExpiryDate: els.customExpiryDate?.value || null,
        extendFromCurrent: els.extendFromCurrent?.value === "true",
        graceMonths: Number(els.graceMonths?.value || 0),
        graceDays: Number(els.graceDays?.value || 0),
        graceHours: Number(els.graceHours?.value || 0),
        graceNote: els.graceNote?.value?.trim() || "",
        paymentStatus: els.paymentStatus?.value || "paid",
      };

      // Loading state
      const saveBtn = els.saveButton || form.querySelector('button[type="submit"]');
      const originalText = saveBtn ? saveBtn.innerHTML : "Save Changes";
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Saving Updates...';
      }

      try {
        const response = await fetch(`/api/v1/user/update-model/${tenantId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (response.ok) {
          const passMsg = rawPassword ? " | <strong>Password:</strong> Successfully reset." : "";
          showFormFeedback(
            `<strong>✓ User & Model Updated Successfully!</strong><br>` +
            `<span><strong>Policy:</strong> ${isDeviceEnabled ? `${maxDevices} Device Limit` : "Unlimited"}${passMsg}</span>`,
            "success"
          );

          // Clear password input after successful change
          if (els.password) els.password.value = "";
          if (els.purgeAllSessions) els.purgeAllSessions.checked = false;
        } else {
          showFormFeedback(`<strong>Notice:</strong> ${result.message || "Failed to update model."}`, "error");
        }
      } catch (err) {
        console.error("Update failed:", err);
        showFormFeedback(`<strong>Network Error:</strong> ${err.message}`, "error");
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalText;
        }
      }
    });
  }
})();
