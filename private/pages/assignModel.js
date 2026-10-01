/**
 * assignModel.js - Enterprise Franchise Model Assignment & Ingestion Module
 * 
 * Features:
 * 1. Zero-Blocker Validation Architecture (Zero-friction submission with sanitized schema fallbacks)
 * 2. Bidirectional Expiry & Active Days Synchronization Engine (Date <-> Days loop-locked math)
 * 3. AI Smart Extraction & Ingestion Engine (Dual-layer backend AI + heuristic regex fallback + postal enrichment)
 * 4. Persistent Device Restriction Subsystem (Structured { isEnabled, maxAllowedDevices } with complete hydration)
 */

(function () {
    'use strict';

    // ==========================================
    // 1. STATE & CONSTANTS
    // ==========================================
    let isSyncingDate = false;
    let selectedLayer = '1'; // Default to 1 Layer Model
    const BASE_URL = window.location.origin;

    // Field Documentation Tooltip Registry
    const fieldHelp = {
        franchiseName: "यह client/tenant का official display नाम है जो portal, print header और billing में दिखाई देगा।",
        fullName: "Primary owner/doctor का पूरा नाम (e.g. Dr. Rajesh Sharma)।",
        email: "Login credentials और critical system alerts के लिए primary email ID।",
        phoneNo: "Support, SMS, और OTP संपर्क के लिए primary mobile number।",
        username: "Unique login username. खाली छोड़ने पर auto-generate हो जाएगा।",
        password: "First login password. Quick generator बटन से strong password बना सकते हैं।",
        pincode: "6-digit Indian PIN code डालने पर District और State automatically auto-resolve हो जाते हैं।",
        district: "District-level mapping और geographical analytics के लिए।",
        state: "State-level location record और GST taxation compliance के लिए।",
        address: "Client का complete physical correspondence address।",
        referral: "Referral partner या agent का tracking code (Optional)।",
        leaseTerms: "Default subscription billing cycle (Monthly, Half-Yearly, Yearly)।",
        rentAmount: "Monthly base subscription fee (INR)।",
        quaterlyRentAmount: "Quarterly package catalog price (INR)।",
        yearlyRentAmount: "Annual enterprise plan price (INR)।",
        activeForDays: "Portal कितने दिनों तक active रहेगा। यह Expiry Date के साथ directly synchronized है।",
        customExpiryDate: "Exact date/time जब portal automatically expire होगा। Days बदलने पर यह auto-update होता है।",
        graceMonths: "Subscription expire होने के बाद additional buffer months।",
        graceDays: "Subscription expire होने के बाद additional buffer days।",
        graceHours: "Emergency testing के लिए extra grace hours।",
        graceNote: "Grace period grant करने का internal audit note/reason।",
        deviceRestrictionToggle: "Enable करने पर multiple users एक साथ login नहीं कर पाएंगे और authorized hardware limits enforce होंगी।",
        maxAllowedDevices: "Simultaneous authorized hardware sessions की maximum permissible limit (1-4 devices)।",
        aiRawInput: "WhatsApp messages, physical chits, emails या raw text paste करके एक click में form auto-fill करें।"
    };

    // ==========================================
    // 2. DOM ELEMENT REFERENCES
    // ==========================================
    const els = {
        // Model Selection Cards
        modelCards: document.querySelectorAll('.model-card'),
        rentDetails: document.getElementById('rentDetails'),

        // AI Extraction
        aiRawInput: document.getElementById('aiRawInput'),
        btnAiParse: document.getElementById('btnAiParse'),
        btnAiClear: document.getElementById('btnAiClear'),
        aiParseSpinner: document.getElementById('aiParseSpinner'),
        aiParseStatus: document.getElementById('aiParseStatus'),

        // Identity
        franchiseName: document.getElementById('franchiseName'),
        fullName: document.getElementById('fullName'),
        email: document.getElementById('email'),
        phoneNo: document.getElementById('phoneNo'),
        username: document.getElementById('username'),
        password: document.getElementById('password'),
        btnTogglePassword: document.getElementById('btnTogglePassword'),
        btnGeneratePassword: document.getElementById('btnGeneratePassword'),
        referral: document.getElementById('referral'),

        // Address & Pincode
        pincode: document.getElementById('pincode'),
        pincodeSpinner: document.getElementById('pincodeSpinner'),
        pincodeFeedback: document.getElementById('pincodeFeedback'),
        district: document.getElementById('district'),
        state: document.getElementById('state'),
        address: document.getElementById('address'),

        // Plan & Dates
        leaseTerms: document.getElementById('leaseTerms'),
        rentAmount: document.getElementById('rentAmount'),
        quaterlyRentAmount: document.getElementById('quaterlyRentAmount'),
        yearlyRentAmount: document.getElementById('yearlyRentAmount'),
        activeForDays: document.getElementById('activeForDays'),
        customExpiryDate: document.getElementById('customExpiryDate'),
        expirySyncText: document.getElementById('expirySyncText'),

        // Grace Period
        graceMonths: document.getElementById('graceMonths'),
        graceDays: document.getElementById('graceDays'),
        graceHours: document.getElementById('graceHours'),
        graceNote: document.getElementById('graceNote'),

        // Device Restriction
        deviceRestrictionToggle: document.getElementById('deviceRestrictionToggle'),
        maxDevicesContainer: document.getElementById('maxDevicesContainer'),
        maxAllowedDevices: document.getElementById('maxAllowedDevices'),
        policyDisplayCount: document.getElementById('policyDisplayCount'),

        // Features & PDF Format
        formatRadios: document.querySelectorAll('input[name="format"]'),
        printsetting: document.getElementById('printsetting'),
        testdatabase: document.getElementById('testdatabase'),
        randomResult: document.getElementById('randomResult'),

        // Submission
        assignButton: document.getElementById('assignButton'),
        formStatusNotice: document.getElementById('formStatusNotice'),

        // Format Image Elements
        formatDiv1: document.querySelector('.format1'),
        formatDiv2: document.querySelector('.format2'),
        formatDiv3: document.querySelector('.format3'),
        formatDiv4: document.querySelector('.format4')
    };

    // ==========================================
    // 3. UI INITIALIZATION & HELP TOOLTIPS
    // ==========================================
    function initializeUi() {
        // Setup PDF Format Backgrounds
        if (els.formatDiv1) els.formatDiv1.style.backgroundImage = `url("${BASE_URL}/images/format2.png")`;
        if (els.formatDiv2) els.formatDiv2.style.backgroundImage = `url("${BASE_URL}/images/format3.png")`;
        if (els.formatDiv3) els.formatDiv3.style.backgroundImage = `url("${BASE_URL}/images/format1.png")`;
        if (els.formatDiv4) {
            els.formatDiv4.style.backgroundImage = `url("${BASE_URL}/images/format4.png"), linear-gradient(#f3f3f3, #e8e8e8)`;
            els.formatDiv4.style.backgroundSize = "cover";
        }

        // Attach Interactive Help Tooltips
        Object.entries(fieldHelp).forEach(([fieldId, helpText]) => {
            const label = document.querySelector(`label[for="${fieldId}"]`);
            if (!label || label.querySelector('.field-help-icon')) return;

            const parent = label.closest('.form-group') || label.parentElement;
            if (!parent) return;

            const icon = document.createElement('span');
            icon.className = 'field-help-icon';
            icon.textContent = 'i';
            icon.setAttribute('aria-label', 'Help documentation');

            const tip = document.createElement('div');
            tip.className = 'field-help-tip';
            tip.textContent = helpText;

            icon.addEventListener('mouseenter', () => {
                document.querySelectorAll('.field-help-tip.show').forEach(el => el.classList.remove('show'));
                tip.classList.add('show');
            });
            icon.addEventListener('mouseleave', () => tip.classList.remove('show'));
            icon.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isVisible = tip.classList.contains('show');
                document.querySelectorAll('.field-help-tip.show').forEach(el => el.classList.remove('show'));
                if (!isVisible) tip.classList.add('show');
            });

            label.appendChild(icon);
            parent.appendChild(tip);
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.field-help-tip.show').forEach(el => el.classList.remove('show'));
        });

        // Initialize default expiry date (30 days from now)
        if (!els.activeForDays?.value && !els.customExpiryDate?.value) {
            if (els.activeForDays) els.activeForDays.value = 30;
            syncDaysToDate();
        }
    }

    // ==========================================
    // 4. MODEL LAYER SELECTION
    // ==========================================
    function selectModelLayer(layerNumber) {
        selectedLayer = String(layerNumber || '1');
        els.modelCards.forEach(card => {
            if (card.getAttribute('data-layer') === selectedLayer) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
        if (els.rentDetails) {
            els.rentDetails.style.display = 'block';
        }
    }

    els.modelCards.forEach(card => {
        card.addEventListener('click', () => {
            const layer = card.getAttribute('data-layer');
            selectModelLayer(layer);
        });
    });

    // ==========================================
    // 5. BIDIRECTIONAL EXPIRY & DAYS SYNCHRONIZER
    // ==========================================
    function getTodayMidnight() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    }

    function formatDateForInput(date) {
        if (!date || isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    function formatHumanReadableDate(date) {
        if (!date || isNaN(date.getTime())) return '';
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function updateExpiryPreview() {
        if (!els.expirySyncText) return;
        const daysVal = parseInt(els.activeForDays?.value, 10);
        const dateVal = els.customExpiryDate?.value;

        if (dateVal) {
            const dt = new Date(dateVal);
            if (!isNaN(dt.getTime())) {
                const daysLabel = Number.isFinite(daysVal) ? ` (${daysVal} days duration)` : '';
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

        if (rawDays === '' || rawDays === null || rawDays === undefined) {
            updateExpiryPreview();
            return;
        }

        const days = parseInt(rawDays, 10);
        if (isNaN(days) || days < 0) return;

        isSyncingDate = true;
        try {
            const now = new Date();
            // Set expiry time to 23:59:00 on the calculated day
            const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 23, 59, 0, 0);
            els.customExpiryDate.value = formatDateForInput(targetDate);
            updateExpiryPreview();
        } finally {
            isSyncingDate = false;
        }
    }

    if (els.customExpiryDate) {
        els.customExpiryDate.addEventListener('input', syncDateToDays);
        els.customExpiryDate.addEventListener('change', syncDateToDays);
    }

    if (els.activeForDays) {
        els.activeForDays.addEventListener('input', syncDaysToDate);
        els.activeForDays.addEventListener('change', syncDaysToDate);
    }

    // Sync from Plan Type presets
    if (els.leaseTerms) {
        els.leaseTerms.addEventListener('change', () => {
            const val = els.leaseTerms.value;
            let targetDays = 30;
            if (val === 'yearly') targetDays = 365;
            else if (val === 'quaterly') targetDays = 90;

            // Only auto-update days if field is blank or matches a known default
            const currentDays = parseInt(els.activeForDays?.value, 10);
            if (!currentDays || [30, 90, 180, 365].includes(currentDays)) {
                if (els.activeForDays) els.activeForDays.value = targetDays;
                syncDaysToDate();
            }
        });
    }

    // ==========================================
    // 6. GEOGRAPHIC ENRICHMENT (PINCODE RESOLVER)
    // ==========================================
    let pincodeDebounceTimer = null;

    async function resolvePincode(pin) {
        const cleanPin = String(pin || '').trim();
        if (!/^[1-9][0-9]{5}$/.test(cleanPin)) {
            if (els.pincodeFeedback) els.pincodeFeedback.style.display = 'none';
            return null;
        }

        if (els.pincodeSpinner) els.pincodeSpinner.style.display = 'inline-flex';
        if (els.pincodeFeedback) els.pincodeFeedback.style.display = 'none';

        try {
            const response = await fetch(`https://api.postalpincode.in/pincode/${cleanPin}`);
            if (!response.ok) throw new Error('Postal API network error');
            const data = await response.json();

            if (Array.isArray(data) && data[0]?.Status === 'Success' && Array.isArray(data[0]?.PostOffice) && data[0].PostOffice.length > 0) {
                const office = data[0].PostOffice[0];
                const resolved = {
                    district: office.District || '',
                    state: office.State || '',
                    region: office.Region || ''
                };

                // Auto-fill without blocking manual edits
                if (els.district && (!els.district.value || els.district.dataset.autofilled === 'true')) {
                    els.district.value = resolved.district;
                    els.district.dataset.autofilled = 'true';
                }
                if (els.state && (!els.state.value || els.state.dataset.autofilled === 'true')) {
                    els.state.value = resolved.state;
                    els.state.dataset.autofilled = 'true';
                }

                if (els.pincodeFeedback) {
                    els.pincodeFeedback.textContent = `✓ Auto-detected: ${resolved.district}, ${resolved.state}`;
                    els.pincodeFeedback.style.color = '#059669';
                    els.pincodeFeedback.style.display = 'block';
                }
                return resolved;
            } else {
                if (els.pincodeFeedback) {
                    els.pincodeFeedback.textContent = 'Note: Pincode not found in postal database (optional).';
                    els.pincodeFeedback.style.color = '#d97706';
                    els.pincodeFeedback.style.display = 'block';
                }
            }
        } catch (err) {
            console.warn('Pincode enrichment skipped:', err.message);
        } finally {
            if (els.pincodeSpinner) els.pincodeSpinner.style.display = 'none';
        }
        return null;
    }

    if (els.pincode) {
        els.pincode.addEventListener('input', (e) => {
            clearTimeout(pincodeDebounceTimer);
            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
            e.target.value = val;
            if (val.length === 6) {
                pincodeDebounceTimer = setTimeout(() => resolvePincode(val), 250);
            }
        });
        els.pincode.addEventListener('blur', (e) => {
            if (e.target.value.length === 6) {
                resolvePincode(e.target.value);
            }
        });
    }

    // ==========================================
    // 7. PERSISTENT DEVICE RESTRICTION SUBSYSTEM
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
            els.maxDevicesContainer.style.display = isEnabled ? 'flex' : 'none';
        }

        if (els.policyDisplayCount) {
            els.policyDisplayCount.textContent = isEnabled ? String(validLimit) : 'Disabled (Unlimited)';
        }
    }

    if (els.deviceRestrictionToggle) {
        els.deviceRestrictionToggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            setDeviceRestrictionState(isChecked, els.maxAllowedDevices?.value || 1);
        });
    }

    if (els.maxAllowedDevices) {
        els.maxAllowedDevices.addEventListener('change', (e) => {
            if (els.policyDisplayCount) {
                els.policyDisplayCount.textContent = e.target.value;
            }
        });
    }

    // Initialize default restriction state (Enabled, 1 device)
    setDeviceRestrictionState(true, 1);

    // ==========================================
    // 8. AI SMART EXTRACTION & INGESTION ENGINE
    // ==========================================
    /**
     * Dual-Layer Smart Entity Parser
     * Layer 1: Calls backend API /api/ai/parse-lab-details
     * Layer 2: Instant, robust client-side RegEx heuristic fallback
     */
    function extractEntitiesClientFallback(text) {
        if (!text || typeof text !== 'string') return { result: {}, extractedFields: [] };
        const cleanText = text.trim();
        const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const result = {};
        const extractedFields = [];

        // 1. Email extraction
        const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
            result.email = emailMatch[0].toLowerCase();
            extractedFields.push('Email');
        }

        // 2. Phone / Mobile Number extraction (Indian 10-digit formats)
        const phoneMatch = cleanText.match(/(?:(?:\+?91[\s-]?)?[0]?)?([6-9]\d{4}[\s-]?\d{5})\b/);
        if (phoneMatch) {
            result.phoneNo = phoneMatch[1].replace(/[\s-]/g, '');
            extractedFields.push('Phone Number');
        }

        // 3. Pincode (6 digits)
        const pinMatch = cleanText.match(/(?:pin(?:\s*code)?|pincode|postal\s*code)?\s*[:=-]?\s*\b([1-9][0-9]{5})\b/i);
        if (pinMatch) {
            result.pincode = pinMatch[1];
            extractedFields.push('PIN Code');
        }

        // 4. Device Restriction / Limit extraction
        const devMatch = cleanText.match(/(?:device(?:s)?|allowed\s*devices?|device\s*limit)\s*[:=-]?\s*(\d+)/i)
            || cleanText.match(/(?:max|limit)\s*[:=-]?\s*(\d+)\s*device/i)
            || cleanText.match(/(\d+)\s*(?:allowed\s*)?device/i);
        if (devMatch) {
            const count = Math.min(4, Math.max(1, parseInt(devMatch[1], 10) || 1));
            result.deviceRestriction = { isEnabled: true, maxAllowedDevices: count };
            extractedFields.push(`Device Limit (${count})`);
        } else if (/single\s*device/i.test(cleanText)) {
            result.deviceRestriction = { isEnabled: true, maxAllowedDevices: 1 };
            extractedFields.push('Device Limit (1)');
        } else if (/no\s*(?:device\s*)?limit|unlimited\s*device|disable\s*device/i.test(cleanText)) {
            result.deviceRestriction = { isEnabled: false, maxAllowedDevices: 1 };
            extractedFields.push('Device Restriction Disabled');
        }

        // 5. Validity / Duration / Plan extraction
        if (/(?:1\s*year|yearly|12\s*months?|365\s*days?|annual)/i.test(cleanText)) {
            result.leaseTerms = 'yearly';
            result.activeForDays = 365;
            extractedFields.push('Validity (1 Year)');
        } else if (/(?:half\s*year|6\s*months?|quaterly|quarterly|3\s*months?|180\s*days?)/i.test(cleanText)) {
            result.leaseTerms = 'quaterly';
            result.activeForDays = /(?:6\s*months?|180\s*days?|half\s*year)/i.test(cleanText) ? 180 : 90;
            extractedFields.push(`Validity (${result.activeForDays} Days)`);
        } else if (/(?:1\s*month|monthly|30\s*days?)/i.test(cleanText)) {
            result.leaseTerms = 'monthly';
            result.activeForDays = 30;
            extractedFields.push('Validity (30 Days)');
        } else {
            const daysMatch = cleanText.match(/(?:validity|duration|active\s*for|period)\s*[:=-]?\s*(\d+)\s*days?/i)
                || cleanText.match(/(\d+)\s*days?\s*(?:validity|duration|access)/i);
            if (daysMatch) {
                result.activeForDays = parseInt(daysMatch[1], 10);
                extractedFields.push(`Validity (${result.activeForDays} Days)`);
            }
        }

        // 6. Rent / Pricing extraction
        const rentMatch = cleanText.match(/(?:monthly\s*rent|rent|price|amount|rate)\s*[:=-]?\s*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
        if (rentMatch) {
            result.rentAmount = rentMatch[1].replace(/,/g, '');
            extractedFields.push('Rent Amount');
        }

        // 7. Franchise / Lab / Center Name
        const labLabelMatch = cleanText.match(/(?:(?:lab|center|centre|franchise|clinic|hospital|diagnostic(?:\s*center)?)(?:\s*name)?)\s*[:=-]\s*([^\n\r,]+)/i);
        if (labLabelMatch) {
            result.franchiseName = labLabelMatch[1].trim();
            extractedFields.push('Franchise/Lab Name');
        } else {
            const candidateLine = lines.find(l => /(?:lab|diagnostics?|pathology|healthcare|clinic|hospital)/i.test(l) && !/@/.test(l) && !/http/i.test(l));
            if (candidateLine) {
                result.franchiseName = candidateLine.replace(/^[-*•\s]+/, '').trim();
                extractedFields.push('Franchise/Lab Name');
            }
        }

        // 8. Doctor / Full Name
        const doctorMatch = cleanText.match(/(?:dr\.?|doctor|owner|contact\s*person|proprietor|full\s*name|name)\s*[:=-]?\s*([^\n\r,]+)/i);
        if (doctorMatch) {
            result.fullName = doctorMatch[1].trim();
            extractedFields.push('Full Name');
        } else {
            const drLine = lines.find(l => /^dr[\s.]+/i.test(l));
            if (drLine) {
                result.fullName = drLine.trim();
                extractedFields.push('Full Name');
            }
        }

        // 9. Username & Password (if provided in credentials text)
        const userMatch = cleanText.match(/(?:user(?:name)?|login\s*id)\s*[:=-]?\s*([a-zA-Z0-9_.-]+)/i);
        if (userMatch) {
            result.username = userMatch[1].trim();
            extractedFields.push('Username');
        }
        const passMatch = cleanText.match(/(?:pass(?:word)?)\s*[:=-]?\s*([^\s,;]+)/i);
        if (passMatch) {
            result.password = passMatch[1].trim();
            extractedFields.push('Password');
        }

        // 10. Address / Location
        const addrMatch = cleanText.match(/(?:address|addr|location)\s*[:=-]?\s*([^\n\r]+)/i);
        if (addrMatch) {
            result.address = addrMatch[1].trim();
            extractedFields.push('Address');
        }

        // 11. Model Layer
        const layerMatch = cleanText.match(/([1-4])\s*(?:layer|tier)/i);
        if (layerMatch) {
            result.modelLayer = layerMatch[1];
            extractedFields.push(`Model Layer (${layerMatch[1]})`);
        }

        return { result, extractedFields };
    }

    async function parseAndFillFromRawText() {
        const rawText = els.aiRawInput?.value?.trim();
        if (!rawText) {
            showAiStatus("Please paste or type unstructured text into the box first.", "info");
            return;
        }

        // UI Loading State
        if (els.btnAiParse) els.btnAiParse.disabled = true;
        if (els.aiParseSpinner) els.aiParseSpinner.style.display = 'inline-flex';
        showAiStatus("Analyzing text and extracting entities...", "info");

        let extractedData = {};
        let extractedFieldNames = [];

        try {
            // Layer 1: Attempt Async Backend AI parsing endpoint
            try {
                const response = await fetch('/api/ai/parse-lab-details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: rawText })
                });

                if (response.ok) {
                    const json = await response.json();
                    if (json?.success && json.data) {
                        extractedData = json.data;
                        extractedFieldNames = Object.keys(json.data);
                    }
                }
            } catch (backendErr) {
                console.info('Backend AI parse endpoint unavailable, using heuristic fallback:', backendErr.message);
            }

            // Layer 2: Client-side RegEx Heuristic Fallback (Ensures 100% Reliability)
            if (!extractedData || Object.keys(extractedData).length === 0) {
                const fallback = extractEntitiesClientFallback(rawText);
                extractedData = fallback.result;
                extractedFieldNames = fallback.extractedFields;
            }

            // Ingest extracted values into UI form inputs
            if (extractedData.franchiseName && els.franchiseName) els.franchiseName.value = extractedData.franchiseName;
            if (extractedData.fullName && els.fullName) els.fullName.value = extractedData.fullName;
            if (extractedData.email && els.email) els.email.value = extractedData.email;
            if (extractedData.phoneNo && els.phoneNo) els.phoneNo.value = extractedData.phoneNo;
            if (extractedData.username && els.username) els.username.value = extractedData.username;
            if (extractedData.password && els.password) els.password.value = extractedData.password;
            if (extractedData.address && els.address) els.address.value = extractedData.address;
            if (extractedData.rentAmount && els.rentAmount) els.rentAmount.value = extractedData.rentAmount;
            if (extractedData.leaseTerms && els.leaseTerms) els.leaseTerms.value = extractedData.leaseTerms;

            if (extractedData.modelLayer) {
                selectModelLayer(extractedData.modelLayer);
            }

            // Ingest device restriction
            if (extractedData.deviceRestriction) {
                setDeviceRestrictionState(
                    extractedData.deviceRestriction.isEnabled,
                    extractedData.deviceRestriction.maxAllowedDevices
                );
            }

            // Ingest validity and trigger bidirectional synchronization
            if (extractedData.activeForDays && els.activeForDays) {
                els.activeForDays.value = extractedData.activeForDays;
                syncDaysToDate();
            }

            // Ingest Pincode & Trigger Postal Auto-Enrichment
            if (extractedData.pincode && els.pincode) {
                els.pincode.value = extractedData.pincode;
                resolvePincode(extractedData.pincode);
            }

            // Compute helpful non-blocking feedback
            const missing = [];
            if (!extractedData.phoneNo) missing.push("Mobile number");
            if (!extractedData.email) missing.push("Email");
            if (!extractedData.pincode) missing.push("Pincode");

            const missingNote = missing.length > 0 ? ` (Note: ${missing.join(", ")} missing in source text - optional)` : "";
            const summary = extractedFieldNames.length > 0
                ? `✨ Auto-filled ${extractedFieldNames.length} entity field(s)!${missingNote}`
                : "No standard entities recognized. You can fill the fields manually below without restrictions.";

            showAiStatus(summary, "success");
        } catch (err) {
            console.error('Extraction error:', err);
            showAiStatus("Extraction completed with partial results.", "info");
        } finally {
            if (els.btnAiParse) els.btnAiParse.disabled = false;
            if (els.aiParseSpinner) els.aiParseSpinner.style.display = 'none';
        }
    }

    function showAiStatus(message, type = 'info') {
        if (!els.aiParseStatus) return;
        els.aiParseStatus.textContent = message;
        els.aiParseStatus.className = `ai-status-notice show ${type}`;
    }

    if (els.btnAiParse) els.btnAiParse.addEventListener('click', parseAndFillFromRawText);
    if (els.btnAiClear) {
        els.btnAiClear.addEventListener('click', () => {
            if (els.aiRawInput) els.aiRawInput.value = '';
            if (els.aiParseStatus) {
                els.aiParseStatus.className = 'ai-status-notice';
                els.aiParseStatus.textContent = '';
            }
        });
    }

    // ==========================================
    // 9. PASSWORD GENERATOR & VISIBILITY
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
        els.btnGeneratePassword.addEventListener('click', () => {
            const pass = generateStrongPassword();
            if (els.password) {
                els.password.value = pass;
                els.password.type = 'text';
                const eyeIcon = els.btnTogglePassword?.querySelector('i');
                if (eyeIcon) {
                    eyeIcon.className = 'fas fa-eye-slash';
                }
            }
        });
    }

    if (els.btnTogglePassword) {
        els.btnTogglePassword.addEventListener('click', () => {
            if (!els.password) return;
            const isHidden = els.password.type === 'password';
            els.password.type = isHidden ? 'text' : 'password';
            const icon = els.btnTogglePassword.querySelector('i');
            if (icon) {
                icon.className = isHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
            }
        });
    }

    // ==========================================
    // 10. HYDRATION / EDIT MODE SUPPORT
    // ==========================================
    window.populateAssignModelData = function (data) {
        if (!data) return;

        const admin = data.adminDetails?.userId || data.adminDetails || {};
        const subscription = data.subscriptionPlan || data.subscription || {};
        const address = data.addressDetails || admin || {};

        // 1. Layer Card Selection
        const layerNum = String(data.modelType || '1layer').replace(/[^0-9]/g, '') || '1';
        selectModelLayer(layerNum);

        // 2. Identity
        if (els.franchiseName) els.franchiseName.value = data.name || '';
        if (els.fullName) els.fullName.value = admin.fullName || '';
        if (els.email) els.email.value = admin.email || '';
        if (els.phoneNo) els.phoneNo.value = admin.phoneNo || '';
        if (els.username) els.username.value = admin.username || '';

        // 3. Address & Geo
        if (els.state) els.state.value = admin.state || address.state || '';
        if (els.district) els.district.value = admin.district || address.district || '';
        if (els.pincode) els.pincode.value = admin.pinCode || address.pinCode || '';
        if (els.address) els.address.value = admin.address || address.address || '';

        // 4. Plan & Expiry
        if (els.leaseTerms) els.leaseTerms.value = subscription.planType || 'monthly';
        if (els.rentAmount) els.rentAmount.value = subscription.price ?? subscription.prices?.monthly ?? '';
        if (els.quaterlyRentAmount) els.quaterlyRentAmount.value = subscription.prices?.quaterly ?? data.planCatalog?.quaterly?.price ?? '';
        if (els.yearlyRentAmount) els.yearlyRentAmount.value = subscription.prices?.yearly ?? data.planCatalog?.yearly?.price ?? '';
        if (els.activeForDays) els.activeForDays.value = subscription.durationDays || subscription.activeForDays || '';

        if (subscription.endDate) {
            const dt = new Date(subscription.endDate);
            if (!isNaN(dt.getTime())) {
                if (els.customExpiryDate) els.customExpiryDate.value = formatDateForInput(dt);
            }
        }

        // 5. Grace Period
        const grace = subscription.gracePeriod || {};
        if (els.graceMonths) els.graceMonths.value = grace.months || 0;
        if (els.graceDays) els.graceDays.value = grace.days || 0;
        if (els.graceHours) els.graceHours.value = grace.hours || 0;
        if (els.graceNote) els.graceNote.value = grace.note || '';

        // 6. Persistent Device Restriction
        const isDeviceEnabled = data.deviceRestriction?.isEnabled !== undefined
            ? Boolean(data.deviceRestriction.isEnabled)
            : admin.is_device_restriction_enabled !== undefined
                ? Boolean(admin.is_device_restriction_enabled)
                : true;

        const maxDevices = Number(
            data.deviceRestriction?.maxAllowedDevices ??
            admin.max_allowed_devices ??
            1
        ) || 1;

        setDeviceRestrictionState(isDeviceEnabled, maxDevices);

        // 7. PDF Format
        const format = admin.pdfFormat || address.pdfFormat || 'reportFormat1';
        const targetRadio = document.querySelector(`input[name="format"][value="${format}"]`);
        if (targetRadio) targetRadio.checked = true;

        // 8. Feature Checkboxes
        if (els.printsetting) els.printsetting.checked = Boolean(admin.showprintsetting);
        if (els.testdatabase) els.testdatabase.checked = Boolean(admin.showtestdatabase);
        if (els.randomResult) els.randomResult.checked = Boolean(admin.showRandomBtn);

        // Update expiry preview
        updateExpiryPreview();
    };

    // Auto-hydrate if URL contains tenantId or modelId
    (async function checkUrlHydration() {
        const urlParams = new URLSearchParams(window.location.search);
        const tenantId = urlParams.get('tenantId') || urlParams.get('modelId') || urlParams.get('id');
        if (!tenantId) return;

        try {
            const res = await fetch(`/api/v1/user/tenants-model/${tenantId}`);
            if (res.ok) {
                const json = await res.json();
                if (json?.data) {
                    window.populateAssignModelData(json.data);
                    if (els.assignButton) {
                        els.assignButton.innerHTML = '<i class="fas fa-save"></i> Save Franchise Model Changes';
                    }
                }
            }
        } catch (err) {
            console.info('URL hydration skipped:', err.message);
        }
    })();

    // ==========================================
    // 11. ZERO-BLOCKER FORM SUBMISSION
    // ==========================================
    function showFormFeedback(message, type = 'success') {
        if (!els.formStatusNotice) return;
        els.formStatusNotice.innerHTML = message;
        els.formStatusNotice.className = `form-status-notice show ${type}`;
        els.formStatusNotice.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function handleFormSubmit() {
        // Safe sanitization: Default missing values to schema-safe fallbacks so form NEVER blocks
        const timestamp = Date.now().toString(36);
        const rawFranchiseName = els.franchiseName?.value?.trim();
        const rawFullName = els.fullName?.value?.trim();
        const rawEmail = els.email?.value?.trim();
        const rawPhoneNo = els.phoneNo?.value?.trim();
        const rawUsername = els.username?.value?.trim();
        const rawPassword = els.password?.value?.trim();
        const rawState = els.state?.value?.trim() || "";
        const rawDistrict = els.district?.value?.trim() || "";
        const rawPincode = els.pincode?.value?.trim() || "";
        const rawAddress = els.address?.value?.trim() || "";
        const rawRent = els.rentAmount?.value;
        const rawQuaterlyRent = els.quaterlyRentAmount?.value;
        const rawYearlyRent = els.yearlyRentAmount?.value;
        const rawLeaseTerms = els.leaseTerms?.value || 'monthly';
        const rawActiveDays = els.activeForDays?.value;
        const rawCustomExpiry = els.customExpiryDate?.value;
        const rawGraceMonths = els.graceMonths?.value;
        const rawGraceDays = els.graceDays?.value;
        const rawGraceHours = els.graceHours?.value;
        const rawGraceNote = els.graceNote?.value?.trim() || "";
        const rawReferral = els.referral?.value?.trim() || null;

        const selectedRadio = document.querySelector('input[name="format"]:checked');
        const pdfFormat = selectedRadio ? selectedRadio.value : 'reportFormat1';
        const showprintsetting = Boolean(els.printsetting?.checked);
        const showtestdatabase = Boolean(els.testdatabase?.checked);
        const showRandomBtn = Boolean(els.randomResult?.checked);

        // Persistent Device Restriction Subsystem State
        const isDeviceEnabled = Boolean(els.deviceRestrictionToggle?.checked);
        const maxDevices = isDeviceEnabled
            ? Math.min(4, Math.max(1, parseInt(els.maxAllowedDevices?.value, 10) || 1))
            : null;

        // Zero-Blocker Fallbacks: Guarantees Mongoose schema accepts submission without error
        const sanitizedName = rawFranchiseName || `Franchise-${timestamp}`;
        const sanitizedUsername = rawUsername || `user_${timestamp}`;
        const sanitizedEmail = rawEmail || `client_${timestamp}@labflow.local`;
        const sanitizedPassword = rawPassword || `Lab@${Math.floor(1000 + Math.random() * 9000)}`;
        const sanitizedFullName = rawFullName || sanitizedName;
        const sanitizedLayer = selectedLayer ? `${selectedLayer}layer` : '1layer';

        const numericRent = Number(rawRent || 0);
        const numericActiveDays = Number(rawActiveDays || 30);

        // Build Payload with structured deviceRestriction object
        const payload = {
            name: sanitizedName,
            modelType: sanitizedLayer,
            code: `FRANCHISE-${Date.now()}`,
            adminDetails: {
                email: sanitizedEmail,
                username: sanitizedUsername,
                password: sanitizedPassword
            },
            subscriptionPlan: {
                planType: rawLeaseTerms,
                startDate: new Date().toISOString(),
                price: numericRent,
                activeForDays: numericActiveDays,
                endDate: rawCustomExpiry || null,
                prices: {
                    monthly: numericRent,
                    quaterly: Number(rawQuaterlyRent || 0),
                    yearly: Number(rawYearlyRent || 0)
                },
                gracePeriod: {
                    months: Number(rawGraceMonths || 0),
                    days: Number(rawGraceDays || 0),
                    hours: Number(rawGraceHours || 0),
                    note: rawGraceNote
                },
                paymentStatus: "paid"
            },
            addressDetails: {
                fullName: sanitizedFullName,
                phoneNo: rawPhoneNo ? (parseInt(rawPhoneNo, 10) || null) : null,
                state: rawState,
                district: rawDistrict,
                pinCode: rawPincode,
                address: rawAddress,
                pdfFormat: pdfFormat,
                showprintsetting,
                showtestdatabase,
                showRandomBtn
            },
            // Structured Device Restriction Object
            deviceRestriction: {
                isEnabled: isDeviceEnabled,
                maxAllowedDevices: maxDevices
            },
            // Flat backward compatibility
            is_device_restriction_enabled: isDeviceEnabled,
            max_allowed_devices: maxDevices || 1,
            referralCodeProvided: rawReferral
        };

        // UI Loading Indicator
        const originalBtnText = els.assignButton?.innerHTML;
        if (els.assignButton) {
            els.assignButton.disabled = true;
            els.assignButton.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing Model Assignment...';
        }

        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/tenants`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (response.ok) {
                const successMsg = `
                    <strong>✓ Franchise Model Assigned Successfully!</strong><br>
                    <span><strong>Architecture:</strong> ${selectedLayer} Layer Model | <strong>Client:</strong> ${sanitizedName}</span><br>
                    <span><strong>Login Username:</strong> ${sanitizedUsername} | <strong>Device Policy:</strong> ${isDeviceEnabled ? `${maxDevices} Device Limit` : 'No Restrictions'}</span>
                `;
                showFormFeedback(successMsg, 'success');
            } else {
                showFormFeedback(`<strong>Notice:</strong> ${result.message || 'Server encountered an issue during assignment.'}`, 'error');
            }
        } catch (error) {
            showFormFeedback(`<strong>Network Error:</strong> ${error.message}`, 'error');
        } finally {
            if (els.assignButton) {
                els.assignButton.disabled = false;
                els.assignButton.innerHTML = originalBtnText;
            }
        }
    }

    if (els.assignButton) {
        els.assignButton.addEventListener('click', handleFormSubmit);
    }

    // Run Initializers
    initializeUi();

})();
