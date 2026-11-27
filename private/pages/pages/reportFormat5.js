/**
 * ============================================================================
 * REPORT FORMAT 5 — EXECUTIVE CLINICAL DIAGNOSTIC VIEWER & ENGINE
 * ============================================================================
 * File: private/pages/pages/reportFormat5.js
 *
 * Adapted cleanly for LabFlow LIS (`labflow-website`) matching the Executive
 * Clinical Design (`oh5-*`):
 *   1. Authentic Specimen Barcode Per Report & Per Page
 *   2. Centered Category (`HAEMATOLOGY`) & Test Profile (`CBC`) banners ABOVE tables
 *   3. Horizontally centered Observed Result ([22px | 54px+ center | 22px H/L])
 *      and centered Unit & Biological Ref. Interval columns
 *   4. Ultra-compact, even Row Spacing (Spacing = 1 -> 0.5px, live slider `#oh5RowGapInput`)
 *   5. Balanced Header with right-column Timestamps & Investigations + LabFlow Print Settings
 *   6. Portaled `#popupModal` + `#toastStack` on `document.body` (`z-index: 2147483647`)
 *      so Top Navbar & Left Sidebar NEVER overlap the Share/PDF modal
 *   7. Full LabFlow `/api/v1/user/get-pdf` + `/adding-pdf-data` + `ReportActionHelpers`
 *      compatibility (`value1` + `reportId` + `pdfformat: "reportFormat5"`)
 * ============================================================================
 */
(function (global) {
  "use strict";

  if (typeof global.__oh5Cleanup === "function") {
    try {
      global.__oh5Cleanup();
    } catch (err) {
      console.warn("[Format5] Previous instance cleanup warning:", err);
    }
  }

  const BASE_URL = global.BASE_URL || global.location.origin;
  const CM_TO_PX = 37.7952755906;
  const A4_HEIGHT_PX = 1123;
  const DEFAULT_SIDE_PAD_PX = 28;

  const abortController = new AbortController();
  const { signal } = abortController;

  let activeUser = {};
  try {
    activeUser = typeof user !== "undefined" && user ? user : (global.user || JSON.parse(localStorage.getItem("user") || "{}") || {});
  } catch {
    activeUser = global.user || {};
  }

  const resolvedAssignedFormat =
    (activeUser?.role === "staff"
      ? (activeUser?.tenantId?.adminDetails?.userId?.pdfFormat || activeUser?.createdBy?.pdfFormat || activeUser?.pdfFormat)
      : activeUser?.pdfFormat) || "reportFormat5";
  const effectiveFormat = "reportFormat5";

  const tenantId =
    activeUser?.tenantId?._id ||
    activeUser?.tenantId ||
    activeUser?.createdBy?.tenantId?._id ||
    activeUser?.createdBy?.tenantId ||
    "";

  const isLayerOneTenant = activeUser?.tenantId?.modelType === "1layer";
  let evaluateClinicalReferenceFlagFn = null;
  const urlParams = new URLSearchParams(global.location.search);
  const urlValue1 = urlParams.get("value1") || localStorage.getItem("value1") || localStorage.getItem("myKey") || "";

  const state = {
    value1: urlValue1,
    reportId: "",
    bookingId: "",
    fullReport: null,
    report: null,
    isSelectiveMode: false,
    filterDrawerController: null,
    bookingData: null,
    barcodeMetaEntries: [],
    testMethodMap: new Map(),
    backgroundImageUrl: "",
    backgroundPreviewUrl: "",
    doctorsSign: null,
    barcodeMap: new Map(),
    defaultSpecimen: { barcodeId: "", sampleType: "" },
    qrDataUrl: "",
    qrLinkUrl: "",
    withoutLetterhead: false,
    categoryNodes: [],
    remarksNode: null,
    endNode: null,
    headerElement: null,
    footerElement: null,
    portaledNodes: [],
    unsubscribeActions: null,
    settings: {
      headermargin: 2.8,
      footermargin: 1.0,
      marginLeft: 0,
      marginRight: 0,
      LeftsignPd: 0,
      Rightsignpd: 0,
      headerContentGap: 0.7,
      selectedFontSize: 10.5,
      selectedFontFamily: "'Segoe UI', Arial, Helvetica, sans-serif",
      RowSpacing: 1,
      HighLow: true,
      HLinred: true,
      BoldRow: true,
      showInvest: true,
      showCategory: true,
      showTestHeading: true,
      hideTableHeadings: false,
      showlab: false,
      showdoctorfirst: true,
      showdoctorsecond: true,
      fileInputLab: "",
      fileInputDoctorleft: "",
      fileInputDoctorright: "",
      fileInputLabtext: "",
      fileInputDoctorlefttext: "",
      fileInputDoctorrighttext: "",
    },
    activeShareChannel: "",
    currentPreviewPdfUrl: "",
    openedPdfUrls: [],
    hasSavedInitialSnapshot: false,
    saveTimer: null,
  };

  /* =========================================================================
   * 1. UTILITY HELPERS & SPECIMEN BARCODE MATCHING
   * ========================================================================= */

  function pickNonEmpty(...vals) {
    for (const v of vals) {
      if (v === undefined || v === null) continue;
      const str = String(v).trim();
      if (str !== "" && str !== "null" && str !== "undefined") return v;
    }
    return "";
  }

  function normalizeReferenceDisplay(raw) {
    return String(raw ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr)>/gi, "\n")
      .replace(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^<>]*>/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseNum(value, fallback, min = -Infinity, max = Infinity) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function parseBool(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const norm = value.trim().toLowerCase();
      if (norm === "true" || norm === "1" || norm === "yes") return true;
      if (norm === "false" || norm === "0" || norm === "no") return false;
    }
    return fallback;
  }

  function stripHtmlTags(raw) {
    if (!raw) return "";
    const div = document.createElement("div");
    div.innerHTML = String(raw);
    return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
  }

  function normalizeText(value) {
    return stripHtmlTags(String(value ?? ""))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function sanitizeRichHtml(raw) {
    if (!raw) return "";
    const template = document.createElement("template");
    template.innerHTML = String(raw);
    template.content.querySelectorAll("script, iframe, object, embed, link").forEach((n) => n.remove());
    template.content.querySelectorAll("*").forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || (name === "href" && attr.value.trim().toLowerCase().startsWith("javascript:"))) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return template.innerHTML;
  }

  function portalOverlaysToBody() {
    const pageRoot = document.getElementById("oh5PageRoot");
    const result = {};

    ["popupModal", "toastStack"].forEach((id) => {
      const ownedInRoot = pageRoot?.querySelector(`#${id}`) || null;
      const alreadyOwned =
        state.portaledNodes.find((el) => el && el.id === id && el.dataset?.oh5Owned === "true") || null;
      const targetNode = ownedInRoot || alreadyOwned || document.getElementById(id);

      document.querySelectorAll(`body > #${id}`).forEach((existing) => {
        if (existing !== targetNode) {
          existing.remove();
        }
      });

      if (targetNode) {
        targetNode.dataset.oh5Owned = "true";
        if (targetNode.parentElement !== document.body) {
          document.body.appendChild(targetNode);
        }
        if (!state.portaledNodes.includes(targetNode)) {
          state.portaledNodes.push(targetNode);
        }
      }

      result[id] = targetNode;
    });

    return result;
  }

  function toast(message, type = "info") {
    portalOverlaysToBody();
    const stack = document.getElementById("toastStack");
    if (!stack) return;
    const item = document.createElement("div");
    item.className = `oh5-toast is-${type}`;
    item.textContent = message;
    stack.appendChild(item);
    setTimeout(() => {
      item.style.opacity = "0";
      item.style.transition = "opacity 0.25s ease";
      setTimeout(() => item.remove(), 260);
    }, 3600);
  }

  function setButtonLoading(buttonId, isLoading) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.disabled = isLoading;
    const overlay = btn.closest(".downloadDiv")?.querySelector(".loading-overlay");
    if (overlay) {
      overlay.style.display = isLoading ? "flex" : "none";
    }
  }

  async function imageToBase64(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;

    // Resolve root-relative paths (/uploads/signatures/...) reliably against BASE_URL
    const resolvedUrl = raw.startsWith("/")
      ? `${BASE_URL}${raw}`
      : (!/^https?:\/\//i.test(raw) ? `${BASE_URL}/uploads/${raw.replace(/^\/+/, "")}` : raw);

    try {
      const response = await fetch(resolvedUrl, { cache: "no-store", credentials: "include", signal });
      if (!response.ok) return raw;
      const blob = await response.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result || raw);
        reader.onerror = () => resolve(raw);
        reader.readAsDataURL(blob);
      });
    } catch {
      return raw;
    }
  }

  function formatClinicalDate(rawDate, rawTime) {
    if (!rawDate) return "";
    let parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime()) && typeof rawDate === "string") {
      const parts = rawDate.split(/[-/]/);
      if (parts.length === 3) {
        const [p1, p2, p3] = parts.map(Number);
        if (p3 > 1900) parsed = new Date(p3, p2 - 1, p1);
        else if (p1 > 1900) parsed = new Date(p1, p2 - 1, p3);
      }
    }
    if (Number.isNaN(parsed.getTime())) {
      return `${rawDate}${rawTime ? ` ${rawTime}` : ""}`.trim();
    }
    const dateStr = parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
    if (rawTime && String(rawTime).trim()) {
      return `${dateStr}, ${String(rawTime).trim()}`;
    }
    const hasTime = parsed.getHours() !== 0 || parsed.getMinutes() !== 0;
    if (!hasTime) return dateStr;
    const timeStr = parsed.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateStr}, ${timeStr}`;
  }

  async function loadClinicalRangeEvaluator() {
    if (typeof evaluateClinicalReferenceFlagFn === "function") return;
    const origins = [];
    if (BASE_URL) origins.push(BASE_URL);
    if (global.location?.origin && !origins.includes(global.location.origin)) {
      origins.push(global.location.origin);
    }
    for (const origin of origins) {
      try {
        const mod = await import(`${origin}/js/clinicalRangeEvaluator.mjs?v=3`);
        if (typeof mod?.evaluateClinicalReferenceFlag === "function") {
          evaluateClinicalReferenceFlagFn = mod.evaluateClinicalReferenceFlag;
          return;
        }
      } catch (err) {
        console.warn("[Format5] Shared clinicalRangeEvaluator.mjs unavailable from", origin, err?.message || err);
      }
    }
  }

  function evaluateReferenceFlag(rawValue, rawReference, patientGender = "", extra = {}) {
    const opts =
      rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
        ? {
            value: "",
            reference: "",
            gender: "",
            testName: "",
            age: "",
            referenceType: "",
            dbIsAbnormal: false,
            dbFlag: "",
            ...rawValue,
          }
        : typeof patientGender === "object" && patientGender !== null
        ? { value: rawValue, reference: rawReference, ...patientGender }
        : {
            value: rawValue,
            reference: rawReference,
            gender: patientGender,
            testName: extra.testName || "",
            age: extra.age || "",
            referenceType: extra.referenceType || "",
            dbIsAbnormal: Boolean(extra.dbIsAbnormal),
            dbFlag: extra.dbFlag || "",
          };
    const valStr = String(opts.value ?? "").trim();
    const refStr = String(opts.reference ?? "").trim();

    if (typeof evaluateClinicalReferenceFlagFn === "function") {
      return evaluateClinicalReferenceFlagFn(opts);
    }

    if (!valStr) return { isAbnormal: false, flag: "", isNumeric: false };
    const cleanDbFlag = /^(?:H|L)$/i.test(String(opts.dbFlag || "").trim())
      ? String(opts.dbFlag).trim().toUpperCase()
      : "";
    const effectiveDbAbnormal = Boolean(opts.dbIsAbnormal || cleanDbFlag);
    const cleanVal = valStr.replace(/,/g, "").replace(/\s*%$/, "").trim();
    const numMatch = cleanVal.match(/^(?:<=|>=|<|>)?\s*([+-]?\d+(?:\.\d+)?)/);
    const numVal = numMatch ? Number(numMatch[1]) : NaN;
    const isPureNumeric = cleanVal !== "" && Number.isFinite(numVal);

    if (isPureNumeric && refStr) {
      const cleanRef = refStr.replace(/,/g, "");
      const rangeMatch = cleanRef.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|\bto\b)\s*(-?\d+(?:\.\d+)?)/i);
      if (rangeMatch) {
        const low = parseFloat(rangeMatch[1]);
        const high = parseFloat(rangeMatch[2]);
        if (Number.isFinite(low) && Number.isFinite(high)) {
          if (numVal < low) return { isAbnormal: true, flag: "L", isNumeric: true };
          if (numVal > high) return { isAbnormal: true, flag: "H", isNumeric: true };
          return { isAbnormal: false, flag: "", isNumeric: true };
        }
      }
      const upperMatch = cleanRef.match(/^(?:<=|<|up\s*to)\s*(-?\d+(?:\.\d+)?)/i);
      if (upperMatch && numVal > parseFloat(upperMatch[1])) {
        return { isAbnormal: true, flag: "H", isNumeric: true };
      }
      const lowerMatch = cleanRef.match(/^(?:>=|>)\s*(-?\d+(?:\.\d+)?)/i);
      if (lowerMatch && numVal < parseFloat(lowerMatch[1])) {
        return { isAbnormal: true, flag: "L", isNumeric: true };
      }
    }

    return {
      isAbnormal: effectiveDbAbnormal,
      flag: effectiveDbAbnormal ? cleanDbFlag : "",
      isNumeric: isPureNumeric,
    };
  }

  function collectAllSpecimenEntries(report, bookingData, barcodeMetaRows = []) {
    const entries = [];
    const addEntry = (rawBarcode, rawType, rawTestNames = []) => {
      const barcodeId = String(rawBarcode ?? "").trim();
      const sampleType = String(rawType ?? "").trim();
      const testNames = Array.isArray(rawTestNames)
        ? rawTestNames.map(normalizeText).filter(Boolean)
        : String(rawTestNames ?? "")
            .split(/[,;/|]/)
            .map(normalizeText)
            .filter(Boolean);

      if (!barcodeId && !sampleType) return;
      entries.push({ barcodeId, sampleType, testNames });
    };

    if (Array.isArray(report?.CategoryAndTest)) {
      report.CategoryAndTest.forEach((sec) => {
        (sec?.sampleDetails || []).forEach((s) =>
          addEntry(s?.barcodeId || s?.confirmBarcodeId || s?.barcode, s?.sampleType || s?.typeOfSample, s?.testNames)
        );
      });
    }

    if (Array.isArray(report?.sampleDetails)) {
      report.sampleDetails.forEach((s) =>
        addEntry(s?.barcodeId || s?.confirmBarcodeId || s?.barcode, s?.sampleType || s?.typeOfSample, s?.testNames)
      );
    }

    const bookingTable = report?.bookingTableData || bookingData?.tableData || [];
    if (Array.isArray(bookingTable)) {
      bookingTable.forEach((row) =>
        addEntry(
          row?.confirmBarcodeId || row?.barcodeId || row?.barcode,
          row?.sampleType || row?.typeOfSample,
          [row?.testName, row?.panelName, row?.title].filter(Boolean)
        )
      );
    }

    const acceptedList = bookingData?.acceptedbarcode || report?.acceptedbarcode || [];
    if (Array.isArray(acceptedList)) {
      acceptedList.forEach((item) => {
        if (typeof item === "string") {
          addEntry(item, "", []);
        } else if (item && typeof item === "object") {
          addEntry(
            item?.barcode || item?.barcodeId || item?.confirmBarcodeId,
            item?.sampleType || item?.typeOfSample,
            item?.testandpannelArray || item?.testNames || item?.testName
          );
        }
      });
    }

    (Array.isArray(barcodeMetaRows) ? barcodeMetaRows : []).forEach((entry) => {
      const names = [
        ...(entry?.singleTests || []).map((t) => t?.testName || t?.name),
        ...(entry?.panels || []).map((p) => p?.panelName || p?.title || p?.testName),
      ].filter(Boolean);
      addEntry(entry?.barcodeNumber || entry?.barcode, entry?.sampleType || "", names);
    });

    return entries;
  }

  function resolveSpecimenForCategory(categoryData, report, bookingData) {
    const secSamples = Array.isArray(categoryData?.sampleDetails) ? categoryData.sampleDetails : [];
    const sectionTestNames = new Set();
    [categoryData?.panelName, categoryData?.title, categoryData?.category]
      .map(normalizeText)
      .filter(Boolean)
      .forEach((n) => sectionTestNames.add(n));
    (categoryData?.tests || []).forEach((t) => {
      [t?.Name, t?.testName].map(normalizeText).filter(Boolean).forEach((n) => sectionTestNames.add(n));
    });

    const scoreCandidate = (cand) => {
      let hits = 0;
      (cand.testNames || []).forEach((tn) => {
        if (sectionTestNames.has(tn)) hits += 3;
        else {
          for (const st of sectionTestNames) {
            if (st.includes(tn) || tn.includes(st)) hits += 1;
          }
        }
      });
      return hits;
    };

    if (secSamples.length) {
      let bestSec = null;
      let bestScore = -1;
      secSamples.forEach((s) => {
        const bid = String(s?.barcodeId || s?.confirmBarcodeId || s?.barcode || "").trim();
        const stype = String(s?.sampleType || s?.typeOfSample || "").trim();
        if (!bid && !stype) return;
        const sc = scoreCandidate({
          testNames: Array.isArray(s?.testNames) ? s.testNames.map(normalizeText) : [],
        });
        if (!bestSec || sc > bestScore) {
          bestSec = { barcodeId: bid, sampleType: stype };
          bestScore = sc;
        }
      });
      if (bestSec && bestSec.barcodeId) return bestSec;
    }

    const allEntries = collectAllSpecimenEntries(report, bookingData, state.barcodeMetaEntries);
    let bestMatch = null;
    let bestHits = 0;
    allEntries.forEach((entry) => {
      if (!entry.barcodeId) return;
      const hits = scoreCandidate(entry);
      if (hits > bestHits) {
        bestHits = hits;
        bestMatch = { barcodeId: entry.barcodeId, sampleType: entry.sampleType };
      }
    });
    if (bestMatch) return bestMatch;

    const firstValidSpecimen = allEntries.find((e) => e.barcodeId);
    if (firstValidSpecimen) {
      return {
        barcodeId: firstValidSpecimen.barcodeId,
        sampleType: firstValidSpecimen.sampleType || "",
      };
    }

    return {
      barcodeId: String(report?.bookingId || ""),
      sampleType: secSamples[0]?.sampleType || "",
    };
  }

  /* =========================================================================
   * 2. API HYDRATION (LABFLOW ENDPOINTS)
   * ========================================================================= */

  async function ensureTemplatePreviewHelperLoaded() {
    if (global.TemplatePreviewHelper) return global.TemplatePreviewHelper;
    const scriptUrl = `${BASE_URL}/js/templatePreviewHelper.js`;
    if (typeof global.loadScript === "function") {
      try {
        await global.loadScript(scriptUrl);
        if (global.TemplatePreviewHelper) return global.TemplatePreviewHelper;
      } catch {
        // Fallback to script tag
      }
    }
    try {
      await new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = scriptUrl;
        script.async = false;
        script.onload = resolve;
        script.onerror = resolve;
        document.body.appendChild(script);
      });
    } catch {
      // Non-fatal
    }
    return global.TemplatePreviewHelper || null;
  }

  function isPdfTemplateUrl(url) {
    if (global.TemplatePreviewHelper?.isPdfUrl) {
      return global.TemplatePreviewHelper.isPdfUrl(url);
    }
    const raw = String(url || "").trim().toLowerCase();
    if (!raw) return false;
    if (/^data:application\/(?:x-)?pdf(?:[;,]|$)/.test(raw)) return true;
    return raw.split("?")[0].split("#")[0].endsWith(".pdf");
  }

  async function resolveLetterheadPreviewUrl(bgUrl) {
    const raw = String(bgUrl || "").trim();
    if (!raw) return "";
    if (!isPdfTemplateUrl(raw)) return raw;
    try {
      const helper = await ensureTemplatePreviewHelperLoaded();
      if (!helper?.getPdfPreviewUrl) return "";
      return await helper.getPdfPreviewUrl(raw, { targetWidth: 1588 });
    } catch (err) {
      console.warn("[Format5] PDF letterhead preview failed:", err?.message || err);
      return "";
    }
  }

  async function ensureReportActionHelpersLoaded() {
    if (global.ReportActionHelpers) return global.ReportActionHelpers;
    const scriptUrl = `${BASE_URL}/admin/pages/pages/reportAction.shared.js?t=${Date.now()}`;
    if (typeof global.loadScript === "function") {
      try {
        await global.loadScript(scriptUrl);
        if (global.ReportActionHelpers) return global.ReportActionHelpers;
      } catch {
        // Fallback to script tag
      }
    }
    try {
      await new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = scriptUrl;
        script.async = false;
        script.onload = resolve;
        script.onerror = resolve;
        document.body.appendChild(script);
      });
    } catch {
      // Non-fatal
    }
    return global.ReportActionHelpers || null;
  }

  async function fetchReportData(value1) {
    const response = await fetch(`${BASE_URL}/api/v1/user/ReportData`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ value1 }),
      signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch report (${response.status})`);
    }
    return await response.json();
  }

  async function fetchPrintSettingsSafe(reportId) {
    if (!reportId) return {};
    try {
      const response = await fetch(`${BASE_URL}/api/v1/user/getting-pdf-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reportId }),
        signal,
      });
      if (!response.ok) return {};
      return (await response.json()) || {};
    } catch {
      return {};
    }
  }

  async function fetchBookingDetailsSafe(bookingId) {
    try {
      const cachedRaw = localStorage.getItem("booking");
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached && String(cached.bookingId) === String(bookingId) && (cached.acceptedbarcode || cached.tableData)) {
          return cached;
        }
      }
    } catch { /* ignore */ }

    if (!bookingId) return null;
    try {
      const response = await fetch(`${BASE_URL}/api/v1/user/getbooking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value1: bookingId }),
        signal,
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async function fetchBarcodeTestMetadataSafe(bookingId) {
    if (!bookingId) return;
    try {
      const response = await fetch(`${BASE_URL}/api/v1/user/getbarcodeTests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ bookingId }),
        signal,
      });
      if (!response.ok) return;
      const rows = await response.json();
      state.barcodeMetaEntries = Array.isArray(rows) ? rows : [];

      const recordItem = (item) => {
        if (!item) return;
        const meta = {
          method: item.method || item.testMethod || "",
          instrument: item.instrument || item.analyzer || "",
          hideMethodInstrument: Boolean(item.hideMethodInstrument),
          Short_name: item.Short_name || item.shortName || "",
        };
        [item._id, item.originalTestId, normalizeText(item.testName), normalizeText(item.name)]
          .filter(Boolean)
          .forEach((k) => state.testMethodMap.set(String(k), meta));
      };

      state.barcodeMetaEntries.forEach((entry) => {
        (entry?.singleTests || []).forEach(recordItem);
        (entry?.panels || []).forEach((panel) => {
          recordItem(panel);
          (panel?.tests || []).forEach(recordItem);
        });
      });
    } catch {
      // Optional enrichment
    }
  }

  async function fetchTemplateLetterhead() {
    try {
      const response = await fetch(`${BASE_URL}/api/v1/user/templates`, {
        method: "POST",
        credentials: "include",
        signal,
      });
      if (!response.ok) return "";
      const data = await response.json();
      return data?.urls?.[0]?.template || "";
    } catch {
      return "";
    }
  }

  async function fetchDoctorsSignatures() {
    try {
      const response = await fetch(`${BASE_URL}/api/v1/user/getDoctorsSign`, {
        credentials: "include",
        signal,
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async function fetchBarcodeImage(codeNumber) {
    const cleanNum = String(codeNumber || "").trim();
    if (!cleanNum) return "";
    if (state.barcodeMap.has(cleanNum)) return state.barcodeMap.get(cleanNum);

    try {
      const response = await fetch(`${BASE_URL}/api/v1/user/generate-barcode?nonumber=true&dense=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ number: cleanNum, displayValue: false, dense: true, background: "transparent" }),
        signal,
      });
      if (!response.ok) return "";
      const data = await response.json();
      const b64 = await imageToBase64(data?.barcode || "");
      if (b64) state.barcodeMap.set(cleanNum, b64);
      return b64;
    } catch {
      return "";
    }
  }

  async function fetchQrCodeImage(targetUrl) {
    if (!targetUrl) return "";
    try {
      const response = await fetch(`${BASE_URL}/api/v1/user/generate-qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ link: targetUrl }),
        signal,
      });
      if (!response.ok) return "";
      const data = await response.json();
      return data?.qrCode || "";
    } catch {
      return "";
    }
  }

  function hydratePrintSettings(reportData, savedCustomization, doctorsSign) {
    const ps = savedCustomization || reportData?.printSettings || {};
    const docSign = doctorsSign || {};

    let lsPrint = {};
    try {
      lsPrint = JSON.parse(localStorage.getItem("printSettings") || "{}") || {};
    } catch {
      lsPrint = {};
    }

    const pick = (...vals) => {
      for (const v of vals) {
        if (v !== undefined && v !== null && v !== "") return v;
      }
      return undefined;
    };

    const hasExplicitSavedPrefs = Boolean(ps?.hasUserSavedPrintSettings);
    const pickSensitive = (...vals) => (hasExplicitSavedPrefs ? pick(...vals) : undefined);

    state.settings.headermargin = parseNum(pick(ps.headermargin, lsPrint.headermargin), 2.8, 0, 10);
    state.settings.footermargin = parseNum(pick(ps.footermargin, lsPrint.footermargin), 1.0, 0, 6);
    state.settings.marginLeft = parseNum(pick(ps.marginLeft, lsPrint.marginLeft), 0, 0, 4);
    state.settings.marginRight = parseNum(pick(ps.marginRight, lsPrint.marginRight), 0, 0, 4);
    state.settings.LeftsignPd = parseNum(pick(ps.LeftsignPd, lsPrint.LeftsignPd), 0, 0, 6);
    state.settings.Rightsignpd = parseNum(pick(ps.Rightsignpd, lsPrint.Rightsignpd), 0, 0, 6);
    state.settings.headerContentGap = parseNum(pick(ps.headerContentGap, lsPrint.headerContentGap), 0.7, 0.1, 10);
    state.settings.selectedFontSize = parseNum(pickSensitive(ps.selectedFontSize, lsPrint.selectedFontSize), 10.5, 8, 18);
    state.settings.selectedFontFamily = pick(ps.selectedFontFamily, lsPrint.selectedFontFamily, "'Segoe UI', Arial, Helvetica, sans-serif") || "'Segoe UI', Arial, Helvetica, sans-serif";
    state.settings.RowSpacing = parseNum(pickSensitive(ps.RowSpacing, lsPrint.RowSpacing), 1, 0, 12);

    state.settings.HighLow = parseBool(pickSensitive(ps.HighLow, lsPrint.HighLow), true);
    state.settings.HLinred = parseBool(pickSensitive(ps.HLinred, lsPrint.HLinred), true);
    state.settings.BoldRow = parseBool(pickSensitive(ps.BoldRow, lsPrint.BoldRow), true);
    // Investigations always stays visible inside Format 5 right-column header
    state.settings.showInvest = true;

    const hideCatsFlag = pick(ps.hideCategories, lsPrint.hideCategories);
    state.settings.showCategory = hideCatsFlag !== undefined
      ? !parseBool(hideCatsFlag, false)
      : parseBool(pick(ps.showCategory, lsPrint.showCategory), true);

    state.settings.hideTableHeadings = parseBool(pick(ps.hideTableHeadings, lsPrint.hideTableHeadings), false);
    state.settings.showTestHeading = parseBool(pick(ps.showTestHeading, lsPrint.showTestHeading), true);

    state.settings.showlab = parseBool(pick(docSign.showlabinchargesign, ps.showlab, reportData?.showLabIncharge), false);
    state.settings.showdoctorfirst = parseBool(pick(docSign.showfirstdoctorsign, ps.showdoctorfirst), true);
    state.settings.showdoctorsecond = parseBool(pick(docSign.showseconddoctorsign, ps.showdoctorsecond), true);

    state.settings.fileInputLab = pick(docSign.labinchargesign, ps.fileInputLab, "") || "";
    state.settings.fileInputDoctorleft = pick(docSign.firstdoctorsign, ps.fileInputDoctorleft, "") || "";
    state.settings.fileInputDoctorright = pick(docSign.seconddoctorsign, ps.fileInputDoctorright, "") || "";

    state.settings.fileInputLabtext = pick(docSign.labinchargeinfo, ps.fileInputLabtext, "") || "";
    state.settings.fileInputDoctorlefttext = pick(docSign.firstdoctorsigninfo, ps.fileInputDoctorlefttext, "") || "";
    state.settings.fileInputDoctorrighttext = pick(docSign.seconddoctorsigninfo, ps.fileInputDoctorrighttext, "") || "";
    state.settings.signatureLayout = docSign.signatureLayout || ps.signatureLayout || null;

    if (ps.backgroundImageUrl && !state.backgroundImageUrl) {
      state.backgroundImageUrl = ps.backgroundImageUrl;
    }
    state.withoutLetterhead = parseBool(pick(ps.checkBox), false);

    const gapInput = document.getElementById("oh5RowGapInput");
    const gapVal = document.getElementById("oh5RowGapVal");
    const lhCheckbox = document.getElementById("oh5WithoutLetterhead");
    if (gapInput) gapInput.value = String(state.settings.RowSpacing);
    if (gapVal) gapVal.textContent = String(state.settings.RowSpacing);
    if (lhCheckbox) lhCheckbox.checked = Boolean(state.withoutLetterhead);
  }

  /* =========================================================================
   * 3. FORMAT 5 DOM BUILDERS
   * ========================================================================= */

  function getChronologicalTimestamps(report) {
    const regStr = formatClinicalDate(report.registeredOn || report.date || report.createdAt, report.registeredOn ? "" : report.time);
    const collStr = formatClinicalDate(report.collectedOn) || regStr;
    const recStr = formatClinicalDate(report.receivedOn) || collStr;
    const repStr = formatClinicalDate(report.reportedOn || new Date().toISOString()) || recStr;
    return { regStr, collStr, recStr, repStr };
  }

  function resolveShortInvestigationText(report) {
    if (Array.isArray(report?.investigationShortNames) && report.investigationShortNames.length > 0) {
      return report.investigationShortNames.filter(Boolean).join(", ");
    }

    const shortLookup = new Map();
    const addAlias = (full, shortVal) => {
      const f = normalizeText(full);
      const s = String(shortVal ?? "").trim();
      if (f && s) shortLookup.set(f, s);
    };

    // 1. Booking selectedItems directly holds Test, Panel, AND Package shortName & itemName
    const selectedItems = Array.isArray(state.bookingData?.selectedItems) ? state.bookingData.selectedItems : [];
    selectedItems.forEach((item) => {
      if (item?.itemName && item?.shortName) {
        addAlias(item.itemName, item.shortName);
      }
    });

    // 2. Barcode master entries hold Short_name for tests, panels, and packages
    state.barcodeMetaEntries.forEach((entry) => {
      (entry?.singleTests || []).forEach((t) => {
        addAlias(t?.Name || t?.testName || t?.name, t?.Short_name || t?.shortName);
      });
      (entry?.panels || []).forEach((p) => {
        addAlias(p?.name || p?.panelName || p?.title || p?.testName, p?.Short_name || p?.shortName);
      });
      (entry?.packages || []).forEach((pk) => {
        addAlias(pk?.packageName || pk?.name, pk?.Short_name || pk?.shortName);
      });
    });

    state.testMethodMap.forEach((meta, key) => {
      if (meta?.Short_name) shortLookup.set(normalizeText(key), meta.Short_name);
    });

    (report?.CategoryAndTest || []).forEach((cat) => {
      if (!cat) return;
      if (cat.panelName && cat.Short_name) addAlias(cat.panelName, cat.Short_name);
      if (cat.title && cat.Short_name) addAlias(cat.title, cat.Short_name);
      if (cat.packageName && cat.Short_name) addAlias(cat.packageName, cat.Short_name);
      (cat.tests || []).forEach((t) => {
        const full = t?.Name || t?.testName;
        const sh = t?.Short_name || t?.shortName || t?.defaultShortName;
        if (full && sh) addAlias(full, sh);
      });
    });

    const tokens = [];
    const seen = new Set();
    const pushToken = (rawName, explicitShort = "") => {
      const clean = String(rawName ?? "").trim();
      if (!clean) return;
      const resolved = String(explicitShort || shortLookup.get(normalizeText(clean)) || clean).trim();
      const key = normalizeText(resolved);
      if (key && !seen.has(key)) {
        seen.add(key);
        tokens.push(resolved);
      }
    };

    // Priority 1: Exact selectedItems from booking (skipped in Selective Mode so filtered header reflects selected tests/panels only)
    if (!report?.isSelectiveReport && selectedItems.length > 0) {
      selectedItems.forEach((item) => {
        pushToken(item?.itemName || item?.shortName, item?.shortName || "");
      });
      if (tokens.length) return tokens.join(", ");
    }

    // Priority 2: Selected investigations (when selective subset active) or full uniquetestArray mapped against shortLookup
    const sourceInvestList =
      report?.isSelectiveReport && Array.isArray(report?.investigationShortNames)
        ? report.investigationShortNames
        : report?.uniquetestArray;

    if (Array.isArray(sourceInvestList) && sourceInvestList.length) {
      sourceInvestList.forEach((item) => {
        const whole = String(item ?? "").trim();
        if (!whole) return;
        if (shortLookup.has(normalizeText(whole))) {
          pushToken(whole);
        } else {
          whole.split(",").map((s) => s.trim()).filter(Boolean).forEach((part) => pushToken(part));
        }
      });
    } else if (typeof sourceInvestList === "string" && sourceInvestList.trim()) {
      sourceInvestList.split(",").map((s) => s.trim()).filter(Boolean).forEach((part) => pushToken(part));
    }

    // Priority 3: Fall back to CategoryAndTest if still empty
    if (!tokens.length && Array.isArray(report?.CategoryAndTest)) {
      report.CategoryAndTest.forEach((cat) => {
        if (cat?.packageName) {
          pushToken(cat.packageName, cat.Short_name || "");
        } else if (cat?.panelName || (cat?.title && !String(cat.title).includes("Unknown Title"))) {
          pushToken(cat.panelName || cat.title, cat.Short_name || "");
        } else if (cat?.category) {
          pushToken(cat.category);
        }
      });
    }

    return tokens.join(", ") || "Standard Evaluation";
  }

  function buildHeaderElement(report, specimenOverride = null) {
    const { regStr, collStr, recStr, repStr } = getChronologicalTimestamps(report);
    const activeSpecimen = specimenOverride?.barcodeId ? specimenOverride : state.defaultSpecimen;

    const barcodeNumber = activeSpecimen?.barcodeId || report.bookingId || "";
    const barcodeImgUrl = state.barcodeMap.get(barcodeNumber) || "";
    const sampleDisplay = activeSpecimen?.sampleType
      ? `${activeSpecimen.sampleType}${activeSpecimen.barcodeId ? ` (${activeSpecimen.barcodeId})` : ""}`
      : (activeSpecimen?.barcodeId ? `Barcode: ${activeSpecimen.barcodeId}` : "Standard Specimen");

    const ageText = report.year ? `${report.year} Y` : "";
    const genderText = report.gender ? String(report.gender) : "";
    const ageGenderBadge = [ageText, genderText].filter(Boolean).join(" / ") || "N/A";
    const contactText = report.patientPhone || report.phone || report.contactDefaults?.phone || report.address || "—";

    const leftRows = [
      { label: "Ref. By", val: report.doctorName || "Self" },
      ...(!isLayerOneTenant ? [{ label: "Lab / Client", val: report.labName || "Direct" }] : []),
      { label: "Contact", val: contactText },
      { label: "Specimen", val: sampleDisplay, id: "oh5HeaderSpecimenVal" },
    ];

    // Investigations always renders inside right section under Reg/Rep/Coll/Rec
    const investNames = resolveShortInvestigationText(report);
    const investHtml = `
      <div class="oh5-header-invest investigationDiv" id="investDiv">
        <span class="tags oh5-invest-label">Investigations :</span>
        <span class="value oh5-invest-value" data-field="uniquetestArray">${escapeHtml(investNames)}</span>
      </div>`;

    const card = document.createElement("div");
    card.className = "oh5-header-card";
    card.setAttribute("data-active-barcode", barcodeNumber);
    card.innerHTML = `
      <div class="oh5-header-top-band">
        <div class="oh5-patient-identity">
          <span class="oh5-patient-name" data-field="patientName">${escapeHtml(report.patientName || "Patient")}</span>
          <span class="oh5-age-gender" data-field="ageSex">${escapeHtml(ageGenderBadge)}</span>
          <span class="oh5-uhid-pill">Reg/Booking: ${escapeHtml(report.reg_id || report.bookingId || "—")}</span>
        </div>
        <div class="oh5-barcode-box">
          <div class="oh5-barcode-img-slot">
            ${barcodeImgUrl
              ? `<img id="barcodeImage" src="${escapeHtml(barcodeImgUrl)}" alt="Specimen Barcode ${escapeHtml(barcodeNumber)}" />`
              : ""}
          </div>
          <div class="oh5-accession-badge">
            <span class="oh5-accession-label">Specimen Barcode</span>
            <span class="oh5-accession-id" id="oh5HeaderBarcodeLabel" data-field="specimenBarcode">${escapeHtml(barcodeNumber || "—")}</span>
          </div>
        </div>
      </div>

      <div class="oh5-header-grid">
        <div class="oh5-patient-col">
          <table class="oh5-meta-table">
            <tbody>
              ${leftRows.map((r) => `
                <tr>
                  <td class="oh5-meta-label">${escapeHtml(r.label)}</td>
                  <td class="oh5-meta-sep">:</td>
                  <td class="oh5-meta-val"${r.id ? ` id="${r.id}"` : ""}>${escapeHtml(r.val)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div class="oh5-specimen-col">
          <div class="oh5-ts-grid">
            <div class="oh5-ts-item"><span class="oh5-ts-lbl">Reg:</span>${escapeHtml(regStr || "—")}</div>
            <div class="oh5-ts-item"><span class="oh5-ts-lbl">Coll:</span>${escapeHtml(collStr || "—")}</div>
            <div class="oh5-ts-item"><span class="oh5-ts-lbl">Rec:</span>${escapeHtml(recStr || "—")}</div>
            <div class="oh5-ts-item"><span class="oh5-ts-lbl">Rep:</span>${escapeHtml(repStr || "—")}</div>
          </div>
          ${investHtml}
        </div>
      </div>
    `;
    return card;
  }

  function buildSignatureCredHtml(rawText) {
    const lines = String(rawText ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return "";
    const [first, ...rest] = lines;
    return `<span class="oh5-sign-name">${escapeHtml(first)}</span>${
      rest.length ? `<span class="oh5-sign-role">${rest.map(escapeHtml).join("<br>")}</span>` : ""
    }`;
  }

  function buildFooterElement() {
    const s = state.settings;
    const wrap = document.createElement("div");
    wrap.className = "oh5-footer-wrap";

    const makeSlotHtml = (slotKey, id, slotClass, visible, imgSrc, credText, alt) => `
      <div class="oh5-sign-slot ${slotClass} ${visible ? "" : "oh5-sign-hidden"}" data-sig-slot="${slotKey}" id="${id}">
        <div class="oh5-sign-img-wrap">
          ${imgSrc ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(alt)}" class="oh5-sign-img" onerror="this.style.display='none'" />` : ""}
        </div>
        <div class="oh5-sign-cred">${buildSignatureCredHtml(credText)}</div>
      </div>
    `;

    wrap.innerHTML = `
      <div class="oh5-footer-top-row">
        <div class="oh5-qr-block" id="qrBlock">
          ${state.qrDataUrl
            ? `<img id="qrimg" class="oh5-qr-img" src="${escapeHtml(state.qrDataUrl)}" alt="Verify Report QR" />`
            : '<div style="width:44px;height:44px;background:#e2e8f0;border-radius:3px;"></div>'}
          <div class="oh5-qr-caption">
            <span class="oh5-qr-title">Scan to Verify</span>
          </div>
        </div>
        <div class="signatures oh5-signatures" style="padding-left:${parseNum(s.LeftsignPd, 0, 0, 6)}cm;padding-right:${parseNum(s.Rightsignpd, 0, 0, 6)}cm;">
          ${makeSlotHtml("lab", "labInchargeSign", "oh5-sign-lab", s.showlab, s.fileInputLab, s.fileInputLabtext, "Lab In-Charge Signature")}
          ${makeSlotHtml("doc1", "firstDoctorSign", "oh5-sign-doc1", s.showdoctorfirst, s.fileInputDoctorleft, s.fileInputDoctorlefttext, "Pathologist Signature")}
          ${makeSlotHtml("doc2", "secondDoctorSign", "oh5-sign-doc2", s.showdoctorsecond, s.fileInputDoctorright, s.fileInputDoctorrighttext, "Authorized Signatory")}
        </div>
      </div>
    `;
    return wrap;
  }

  function sanitizeCategories(categories) {
    if (!Array.isArray(categories)) return [];
    return categories
      .map((cat, origCatIdx) => {
        if (!cat) return null;
        const validTests = [];
        (cat.tests || []).forEach((t, origTestIdx) => {
          if (!t) return;
          const isValid =
            t.isDocumented ||
            t.isInterpretation ||
            t.isMultiHeader ||
            t.isMultiParameterHeading ||
            (Array.isArray(t.parameters) && t.parameters.length > 0) ||
            String(t.value ?? t.result ?? "").trim().length > 0 ||
            Boolean(t.remark || t.details || t.Name || t.testName);
          if (isValid) {
            validTests.push({ ...t, _origTestIdx: origTestIdx });
          }
        });
        if (!validTests.length && !cat.interpretation && !cat.advice && !cat.notes && !cat.remarks) {
          return null;
        }
        return { ...cat, _origCatIdx: origCatIdx, tests: validTests };
      })
      .filter(Boolean);
  }

  function buildFlagSlotInnerHtml(flag, isHighLowEnabled, isRedEnabled) {
    if (!flag || !isHighLowEnabled) return "";
    return `<span class="HL"><span class="oh5-flag-badge${isRedEnabled ? " is-red" : ""}">${escapeHtml(flag)}</span></span>`;
  }

  function applyRowEvaluationState(tr, evalRes, settings = state.settings) {
    if (!tr) return;
    const isAbnormal = Boolean(evalRes?.isAbnormal);
    const flag = isAbnormal ? String(evalRes?.flag || "") : "";
    const valCell = tr.children[1];
    const valSpan = tr.querySelector('[data-field="value"]') || tr.querySelector(".oh5-result-value");
    const flagSlot = tr.querySelector(".oh5-flag-slot");

    tr.classList.remove("oh5-row--abnormal", "BoldRow", "is-bold-row", "is-red-row", "is-normal-row");
    if (valCell) valCell.classList.remove("high-low");
    if (valSpan) valSpan.classList.remove("is-abnormal", "is-red");
    if (flagSlot) flagSlot.innerHTML = "";

    tr.setAttribute("data-evaluated", "v2");
    tr.setAttribute("data-abnormal", isAbnormal ? "1" : "0");
    tr.setAttribute("data-flag", flag);

    if (isAbnormal) {
      tr.classList.add("oh5-row--abnormal", "BoldRow");
      if (settings.BoldRow) tr.classList.add("is-bold-row");
      if (settings.HLinred) tr.classList.add("is-red-row");
      if (valCell) valCell.classList.add("high-low");
      if (valSpan) {
        valSpan.classList.add("is-abnormal");
        if (settings.HLinred) valSpan.classList.add("is-red");
      }
      if (flagSlot) {
        flagSlot.innerHTML = buildFlagSlotInnerHtml(flag, settings.HighLow, settings.HLinred);
      }
    } else {
      tr.classList.add("is-normal-row");
    }
  }

  function resolveMethodDisplay(testObj, rawName) {
    const cleanName = stripHtmlTags(rawName);
    const meta =
      state.testMethodMap.get(String(testObj?._id || "")) ||
      state.testMethodMap.get(String(testObj?.originalTestId || "")) ||
      state.testMethodMap.get(normalizeText(cleanName)) ||
      {};
    if (meta.hideMethodInstrument || testObj?.hideMethodInstrument) return "";
    const parts = [];
    const m = stripHtmlTags(testObj?.method || meta.method || "");
    const inst = stripHtmlTags(testObj?.instrument || meta.instrument || "");
    if (m) parts.push(`Method: ${m}`);
    if (inst) parts.push(`Instrument: ${inst}`);
    return parts.join(" | ");
  }

  function createParameterRow({
    catIndex,
    testIndex,
    paramIndex = null,
    title,
    method,
    value,
    unit,
    reference,
    isSubParam = false,
    patientGender = "",
    patientAge = "",
    referenceType = "",
    dbIsAbnormal = false,
    dbFlag = "",
  }) {
    const cleanTitle = stripHtmlTags(title);
    const cleanMethod = stripHtmlTags(method);
    const safeVal = value === null || value === undefined || String(value) === "null" ? "" : String(value);
    const safeUnit = unit === null || unit === undefined || String(unit) === "null" ? "" : String(unit);
    const safeRef = reference === null || reference === undefined || String(reference) === "null" ? "" : String(reference);

    const evalRes = evaluateReferenceFlag({
      value: safeVal,
      reference: safeRef,
      testName: cleanTitle,
      gender: patientGender,
      age: patientAge,
      referenceType,
      dbIsAbnormal: Boolean(dbIsAbnormal),
      dbFlag,
    });

    const tr = document.createElement("tr");
    const rowKey = `${catIndex}:${testIndex}:${paramIndex !== null ? paramIndex : "self"}`;
    tr.className = `oh5-test-row${isSubParam ? " oh5-param-row parameter-row" : ""}`;
    tr.setAttribute("data-row-key", rowKey);
    tr.setAttribute("data-test-name", cleanTitle);
    if (referenceType) tr.setAttribute("data-ref-type", String(referenceType));
    if (dbFlag) tr.setAttribute("data-db-flag", String(dbFlag));

    const titleHtml = isSubParam
      ? `<span class="oh5-param-indent"><span class="oh5-test-title test-name">${escapeHtml(cleanTitle)}</span></span>`
      : `<span class="oh5-test-title test-name">${escapeHtml(cleanTitle)}</span>`;

    const methodHtml = cleanMethod
      ? `<span class="methods oh5-method-note">${escapeHtml(cleanMethod)}</span>`
      : "";

    tr.innerHTML = `
      <td>
        ${titleHtml}
        ${methodHtml}
      </td>
      <td class="oh5-col-result-cell">
        <div class="oh5-result-wrap">
          <span class="oh5-result-value cell-edit"
                contenteditable="true"
                spellcheck="false"
                data-cat-idx="${catIndex}"
                data-test-idx="${testIndex}"
                ${paramIndex !== null ? `data-param-idx="${paramIndex}"` : ""}
                data-field="value"
                title="Click to edit observed result inline">${escapeHtml(safeVal)}</span>
          <span class="oh5-flag-slot"></span>
        </div>
      </td>
      <td class="oh5-unit-cell">
        <span class="oh5-unit-inner cell-edit"
              contenteditable="true"
              spellcheck="false"
              data-cat-idx="${catIndex}"
              data-test-idx="${testIndex}"
              ${paramIndex !== null ? `data-param-idx="${paramIndex}"` : ""}
              data-field="unit">${escapeHtml(safeUnit)}</span>
      </td>
      <td class="oh5-ref-block">
        <span class="oh5-ref-text cell-edit"
              contenteditable="true"
              spellcheck="false"
              data-cat-idx="${catIndex}"
              data-test-idx="${testIndex}"
              ${paramIndex !== null ? `data-param-idx="${paramIndex}"` : ""}
              data-field="reference">${escapeHtml(safeRef)}</span>
      </td>
    `;

    applyRowEvaluationState(tr, evalRes, state.settings);

    tr.querySelectorAll(".cell-edit").forEach((cell) => {
      cell.addEventListener("blur", () => handleInlineCellEdit(cell, tr));
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && cell.getAttribute("data-field") !== "reference") {
          e.preventDefault();
          cell.blur();
        }
      });
    });

    return tr;
  }

  function handleInlineCellEdit(cellEl, rowEl) {
    const catIdx = Number(cellEl.getAttribute("data-cat-idx"));
    const testIdx = Number(cellEl.getAttribute("data-test-idx"));
    const paramIdxAttr = cellEl.getAttribute("data-param-idx");
    const field = cellEl.getAttribute("data-field");
    const newValue = (cellEl.textContent || "").trim();

    const cat = state.report?.CategoryAndTest?.[catIdx];
    const test = cat?.tests?.[testIdx];
    if (!test) return;

    let targetObj = test;
    if (paramIdxAttr !== null && Array.isArray(test.parameters)) {
      targetObj = test.parameters[Number(paramIdxAttr)] || test;
    }

    if (field === "value") {
      if ("value" in targetObj || paramIdxAttr === null) targetObj.value = newValue;
      else targetObj.result = newValue;
    } else if (field === "unit") {
      targetObj.unit = newValue;
    } else if (field === "reference") {
      if ("reference" in targetObj || paramIdxAttr === null) targetObj.reference = newValue;
      else targetObj.text = newValue;
    }

    const currentVal = (rowEl.querySelector('[data-field="value"]')?.textContent || "").trim();
    const currentRef = (rowEl.querySelector('[data-field="reference"]')?.textContent || "").trim();
    const evalRes = evaluateReferenceFlag({
      value: currentVal,
      reference: currentRef,
      testName: rowEl.getAttribute("data-test-name") || "",
      gender: state.report?.gender || "",
      age: state.report?.year || "",
      referenceType: rowEl.getAttribute("data-ref-type") || targetObj?.referenceType || "",
      dbIsAbnormal: false,
    });

    targetObj.isAbnormal = evalRes.isAbnormal;
    targetObj.isBold = evalRes.isAbnormal;
    targetObj.highLow = evalRes.flag || "";

    applyRowEvaluationState(rowEl, evalRes, state.settings);

    const rowKey = rowEl.getAttribute("data-row-key");
    if (rowKey) {
      for (const section of state.categoryNodes) {
        const sourceRow = section.querySelector(`tr[data-row-key="${rowKey}"]`);
        if (sourceRow && sourceRow !== rowEl) {
          const sourceField = sourceRow.querySelector(`[data-field="${field}"]`);
          if (sourceField) sourceField.textContent = newValue;
          applyRowEvaluationState(sourceRow, evalRes, state.settings);
          break;
        }
      }
    }

    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      saveCurrentSnapshot({ silent: true });
    }, 700);
  }

  function createCalloutCard(titleText, htmlBody, extraClass = "") {
    const cleanHtml = sanitizeRichHtml(htmlBody);
    const temp = document.createElement("div");
    temp.innerHTML = cleanHtml;
    if (!temp.textContent.replace(/\u00a0/g, " ").trim() && !temp.querySelector("img, table, ul, ol")) {
      return null;
    }

    const card = document.createElement("div");
    card.className = `oh5-interpretation-card interpretation ${extraClass}`;
    card.innerHTML = `
      <span class="oh5-interpretation-title">${escapeHtml(titleText)}</span>
      <div class="documented-content">${cleanHtml}</div>
    `;
    return card;
  }

  function buildBodySections(report) {
    state.categoryNodes = [];
    state.remarksNode = null;

    const sanitizedCats = sanitizeCategories(report.CategoryAndTest || []);
    const rawCats = report.CategoryAndTest || [];
    const patientGender = report?.gender || "";
    const patientAge = report?.year || "";

    sanitizedCats.forEach((cat, safeIdx) => {
      const catIdx = Number.isInteger(cat._origCatIdx)
        ? cat._origCatIdx
        : Math.max(0, rawCats.findIndex((raw) => raw === cat || (raw?.category === cat.category && raw?.title === cat.title)));

      const section = document.createElement("section");
      section.className = "section oh5-category-section";

      const catTitle = String(cat.category || "").trim();
      const isPanel = cat.type === "panel" || (cat.title && cat.title !== cat.category && !String(cat.title).includes("Unknown Title"));
      const panelTitle = isPanel ? String(cat.panelName || cat.title || "").trim() : "";

      const specimen = resolveSpecimenForCategory(cat, report, state.bookingData);
      const specimenImg = state.barcodeMap.get(specimen.barcodeId) || "";

      section.setAttribute("data-category-name", catTitle);
      if (panelTitle) section.setAttribute("data-panel-name", panelTitle);
      if (cat.packageName) section.setAttribute("data-package-name", cat.packageName);
      section.setAttribute("data-specimen-barcode", specimen.barcodeId || "");
      section.setAttribute("data-specimen-type", specimen.sampleType || "");
      if (specimenImg) section.setAttribute("data-specimen-barcode-img", specimenImg);

      if ((report.categorizedPDF && safeIdx > 0) || cat.pagebreak) {
        section.classList.add("page-break", "oh5-page-break-before");
      }

      if (state.settings.showCategory && catTitle) {
        const banner = document.createElement("div");
        banner.className = "section-heading-main oh5-category-banner";
        banner.innerHTML = `<span>${escapeHtml(catTitle)}</span>`;
        section.appendChild(banner);
      }

      let currentTable = null;
      let currentTbody = null;

      const closeTable = () => {
        currentTable = null;
        currentTbody = null;
      };

      const appendProfileBanner = (headingText) => {
        if (!headingText || !state.settings.showTestHeading) return;
        closeTable();
        const prof = document.createElement("div");
        prof.className = "section-heading-sub oh5-profile-banner";
        prof.innerHTML = `<span>${escapeHtml(headingText.toUpperCase())}</span>`;
        section.appendChild(prof);
      };

      const ensureTable = () => {
        if (currentTable && currentTbody) return currentTbody;
        currentTable = document.createElement("table");
        currentTable.className = "oh5-results-table";
        currentTable.innerHTML = `
          <thead>
            <tr>
              <th>Investigation / Parameter</th>
              <th class="oh5-col-val"><span class="oh5-result-header-inner">Observed Result</span></th>
              <th><span class="oh5-unit-header-inner">Unit</span></th>
              <th><span class="oh5-ref-header-inner">Biological Ref. Interval</span></th>
            </tr>
          </thead>
          <tbody></tbody>
        `;
        currentTbody = currentTable.querySelector("tbody");
        section.appendChild(currentTable);
        return currentTbody;
      };

      if (panelTitle) {
        appendProfileBanner(panelTitle);
      }

      (cat.tests || []).forEach((test, tIdx) => {
        const testIdx = Number.isInteger(test._origTestIdx) ? test._origTestIdx : tIdx;
        if (test.isInterpretation) {
          closeTable();
          const card = createCalloutCard("Clinical Interpretation", test.details || "");
          if (card) section.appendChild(card);
          return;
        }

        if (test.isDocumented || test.document) {
          closeTable();
          const docCard = document.createElement("div");
          docCard.className = `documented-content oh5-documented-card${test.pagebreak ? " page-break oh5-page-break-before" : ""}`;
          docCard.innerHTML = sanitizeRichHtml(test.document || test.testName || test.value || "");
          section.appendChild(docCard);
          return;
        }

        if (Array.isArray(test.parameters) && test.parameters.length > 1) {
          const profileName = stripHtmlTags(test.Name || test.testName || "");
          if (profileName && normalizeText(profileName) !== normalizeText(panelTitle)) {
            appendProfileBanner(profileName);
          }
          const tbody = ensureTable();
          test.parameters.forEach((param, pIdx) => {
            const pName = param.Para_name || param.parameterName || param.name || "";
            const pVal = pickNonEmpty(param.value, param.result, param.currentvalue, param.defaultresult);
            const pRef = normalizeReferenceDisplay(pickNonEmpty(param.reference, param.normalRange, param.text));
            tbody.appendChild(createParameterRow({
              catIndex: catIdx,
              testIndex: testIdx,
              paramIndex: pIdx,
              title: pName,
              method: resolveMethodDisplay(param, pName),
              value: pVal,
              unit: param.unit || "",
              reference: pRef,
              isSubParam: true,
              patientGender,
              patientAge,
              referenceType: param.referenceType || test.referenceType || "",
              dbIsAbnormal: Boolean(param.isAbnormal || param.isBold || param.highLow),
              dbFlag: param.highLow || "",
            }));
          });

          if (test.remark) {
            closeTable();
            const c = createCalloutCard("Clinical Remark", escapeHtml(test.remark));
            if (c) section.appendChild(c);
          }
          if (test.details) {
            closeTable();
            const c = createCalloutCard("Clinical Note", test.details);
            if (c) section.appendChild(c);
          }
          return;
        }

        const rawName = String(test.Name || test.testName || "");
        const isExplicitParam = Boolean(test.isParameter) || /id=["']parameters["']/.test(rawName);
        const isExplicitMulti = Boolean(test.isMultiHeader || test.isMultiParameterHeading);
        const resolvedVal = pickNonEmpty(test.value, test.result, test.currentvalue);
        const resolvedRef = normalizeReferenceDisplay(pickNonEmpty(test.reference, test.normalRange, test.text));
        const hasEmptyFields = !resolvedVal && !test.unit && !resolvedRef;
        const isImplicitHeader = !isExplicitParam && !test.isDocumented && (isExplicitMulti || hasEmptyFields);

        if (isImplicitHeader) {
          const profName = stripHtmlTags(rawName);
          if (normalizeText(profName) !== normalizeText(panelTitle)) {
            appendProfileBanner(profName);
          }
        } else {
          const tbody = ensureTable();
          tbody.appendChild(createParameterRow({
            catIndex: catIdx,
            testIndex: testIdx,
            title: rawName,
            method: resolveMethodDisplay(test, rawName),
            value: resolvedVal,
            unit: test.unit || "",
            reference: resolvedRef,
            isSubParam: isExplicitParam,
            patientGender,
            patientAge,
            referenceType: test.referenceType || "",
            dbIsAbnormal: Boolean(test.isAbnormal || test.isBold || test.highLow),
            dbFlag: test.highLow || "",
          }));
        }

        if (test.remark) {
          closeTable();
          const c = createCalloutCard("Remark", escapeHtml(test.remark));
          if (c) section.appendChild(c);
        }
        if (test.details && !test.isInterpretation) {
          closeTable();
          const c = createCalloutCard("Notes", test.details);
          if (c) section.appendChild(c);
        }
      });

      [
        cat.advice ? createCalloutCard("Medical Advice", cat.advice) : null,
        cat.notes ? createCalloutCard("Technical Note", cat.notes) : null,
        cat.remarks ? createCalloutCard("Remarks", cat.remarks) : null,
        cat.interpretation ? createCalloutCard("Clinical Interpretation", cat.interpretation) : null,
      ]
        .filter(Boolean)
        .forEach((c) => {
          closeTable();
          section.appendChild(c);
        });

      if (section.children.length > 0) {
        state.categoryNodes.push(section);
      }
    });

    if (report.MoreDetails && stripHtmlTags(report.MoreDetails).length > 0) {
      const more = document.createElement("div");
      more.className = "moreDetails oh5-remarks-card";
      more.innerHTML = `
        <span class="oh5-remarks-title">Additional Findings &amp; Clinical Comments</span>
        <div class="documented-content">${sanitizeRichHtml(report.MoreDetails)}</div>
      `;
      state.remarksNode = more;
    }

    const endMarker = document.createElement("div");
    endMarker.className = "oh5-end-of-report";
    endMarker.textContent = "End Of Report";
    state.endNode = endMarker;
  }

  /* =========================================================================
   * 4. TRUE A4 SCREEN PAGINATION
   * ========================================================================= */

  function applyDynamicPreviewCss() {
    let dynStyle = document.getElementById("oh5DynamicVarsStyle");
    if (!dynStyle) {
      dynStyle = document.createElement("style");
      dynStyle.id = "oh5DynamicVarsStyle";
      document.head.appendChild(dynStyle);
      state.portaledNodes.push(dynStyle);
    }

    const s = state.settings;
    const rowPadY = s.RowSpacing <= 0 ? "0" : (0.5 + (s.RowSpacing - 1) * 0.7).toFixed(2);
    const fontPx = s.selectedFontSize;
    const subFontPx = Math.max(8, fontPx - 2).toFixed(1);
    const headerFontPx = Math.max(8.5, fontPx - 1.5).toFixed(1);

    dynStyle.textContent = `
      #oh5PageRoot {
        font-family: ${s.selectedFontFamily};
      }
      #oh5PageRoot .oh5-results-table thead {
        display: ${s.hideTableHeadings ? "none" : "table-header-group"};
      }
      #oh5PageRoot .oh5-results-table tbody td {
        font-size: ${fontPx}px;
        padding-top: ${rowPadY}px;
        padding-bottom: ${rowPadY}px;
      }
      #oh5PageRoot .oh5-results-table thead th {
        font-size: ${headerFontPx}px;
      }
      #oh5PageRoot .oh5-method-note {
        font-size: ${subFontPx}px;
      }
      #oh5PageRoot .oh5-category-banner {
        font-size: ${(fontPx + 1).toFixed(1)}px;
      }
      #oh5PageRoot .oh5-profile-banner {
        font-size: ${fontPx.toFixed(1)}px;
      }
      #oh5PageRoot .oh5-flag-badge {
        display: ${s.HighLow ? "inline-flex" : "none"} !important;
      }
      #oh5PageRoot tr.oh5-test-row.is-normal-row td,
      #oh5PageRoot tr.oh5-test-row.is-normal-row .oh5-test-title,
      #oh5PageRoot tr.oh5-test-row.is-normal-row .oh5-result-value,
      #oh5PageRoot tr.oh5-test-row.is-normal-row .oh5-unit-cell,
      #oh5PageRoot tr.oh5-test-row.is-normal-row .oh5-unit-inner,
      #oh5PageRoot tr.oh5-test-row.is-normal-row .oh5-ref-block,
      #oh5PageRoot tr.oh5-test-row.is-normal-row .oh5-ref-text {
        font-weight: 400 !important;
        background-color: transparent !important;
      }
      #oh5PageRoot .oh5-result-value.is-abnormal {
        color: ${s.HLinred ? "#b91c1c" : "#0f172a"} !important;
      }
      #oh5PageRoot .oh5-flag-badge {
        background: ${s.HLinred ? "#fee2e2" : "#e2e8f0"};
        color: ${s.HLinred ? "#991b1b" : "#0f172a"};
        border-color: ${s.HLinred ? "#ef4444" : "#94a3b8"};
      }
      #oh5PageRoot tr.oh5-row--abnormal td {
        background-color: ${s.HLinred ? "rgba(254, 226, 226, 0.72)" : "rgba(241, 245, 249, 0.92)"};
        border-bottom-color: ${s.HLinred ? "#fecaca" : "#cbd5e1"};
        color: ${s.HLinred ? "#7f1d1d" : "#0f172a"};
      }
      #oh5PageRoot tr.oh5-row--abnormal td:first-child {
        border-left-color: ${s.HLinred ? "#dc2626" : "#1e3a5f"};
      }
      #oh5PageRoot tr.oh5-row--abnormal .oh5-test-title,
      #oh5PageRoot tr.oh5-row--abnormal .oh5-unit-cell,
      #oh5PageRoot tr.oh5-row--abnormal .oh5-unit-inner,
      #oh5PageRoot tr.oh5-row--abnormal .oh5-ref-block,
      #oh5PageRoot tr.oh5-row--abnormal .oh5-ref-text {
        color: ${s.HLinred ? "#7f1d1d" : "#0f172a"};
      }
      #oh5PageRoot tr.oh5-row--abnormal td,
      #oh5PageRoot tr.oh5-row--abnormal .oh5-test-title,
      #oh5PageRoot tr.oh5-row--abnormal .oh5-result-value,
      #oh5PageRoot tr.oh5-row--abnormal .oh5-unit-cell,
      #oh5PageRoot tr.oh5-row--abnormal .oh5-unit-inner,
      #oh5PageRoot tr.oh5-row--abnormal .oh5-ref-block,
      #oh5PageRoot tr.oh5-row--abnormal .oh5-ref-text {
        font-weight: ${s.BoldRow ? "700" : "400"} !important;
      }
      #oh5PageRoot tr.oh5-row--abnormal .oh5-method-note {
        font-weight: 400 !important;
        color: var(--oh5-muted) !important;
      }
      ${(() => {
        const engine = state.sigLayoutEngine;
        if (!s.signatureLayout?.isCustom || !engine?.buildCustomSignatureStageCss) return "";
        return `
          #oh5PageRoot .oh5-footer-top-row .signatures.oh5-signatures {
            flex: 1 1 0 !important;
            width: auto !important;
            min-width: 0 !important;
          }
          ${engine.buildCustomSignatureStageCss({
            containerSelector: "#oh5PageRoot .oh5-signatures",
            slotSelector: ".oh5-sign-slot",
            layout: s.signatureLayout,
            visibility: {
              lab: Boolean(s.showlab),
              doc1: Boolean(s.showdoctorfirst),
              doc2: Boolean(s.showdoctorsecond),
            },
            baseFontSizePx: Math.max(8.5, Number(fontPx || 10.5) - 1),
          })}
        `;
      })()}
    `;
  }

  function renderPaginatedSheets() {
    applyDynamicPreviewCss();

    const stack = document.getElementById("sheetStackWrap");
    const container = document.getElementById("container");
    if (!stack || !container) return;

    stack.innerHTML = "";
    container.style.display = "block";

    const s = state.settings;
    const headerMarginPx = Math.round(s.headermargin * CM_TO_PX);
    const footerMarginPx = Math.round(s.footermargin * CM_TO_PX);
    const headerGapPx = Math.round(s.headerContentGap * CM_TO_PX);
    const leftPadPx = DEFAULT_SIDE_PAD_PX + Math.round(s.marginLeft * CM_TO_PX);
    const rightPadPx = DEFAULT_SIDE_PAD_PX + Math.round(s.marginRight * CM_TO_PX);
    const isPdfBg = isPdfTemplateUrl(state.backgroundImageUrl);
    const bgUrl = !state.withoutLetterhead
      ? (isPdfBg ? state.backgroundPreviewUrl : state.backgroundImageUrl)
      : "";

    const sheetsMeta = [];

    const createSheet = (initialSpecimen = null) => {
      const sheet = document.createElement("div");
      sheet.className = "oh5-sheet";
      if (bgUrl) {
        sheet.style.backgroundImage = `url("${bgUrl}")`;
      }

      const hdr = document.createElement("div");
      hdr.className = "oh5-sheet-header";
      hdr.style.padding = `${headerMarginPx}px ${rightPadPx}px ${headerGapPx}px ${leftPadPx}px`;
      hdr.appendChild(buildHeaderElement(state.report, initialSpecimen));

      const body = document.createElement("div");
      body.className = "oh5-sheet-body";
      body.style.padding = `0 ${rightPadPx}px 0 ${leftPadPx}px`;

      const ftr = document.createElement("div");
      ftr.className = "oh5-sheet-footer";
      ftr.style.padding = `6px ${rightPadPx}px ${footerMarginPx}px ${leftPadPx}px`;
      if (state.footerElement) {
        ftr.appendChild(state.footerElement.cloneNode(true));
      }
      const metaRow = document.createElement("div");
      metaRow.className = "oh5-footer-bottom-meta";
      metaRow.innerHTML = `
        <span>Report Format: Format 5 (Clinical Standard)</span>
        <span class="oh5-page-counter"></span>
      `;
      ftr.appendChild(metaRow);

      sheet.appendChild(hdr);
      sheet.appendChild(body);
      sheet.appendChild(ftr);
      stack.appendChild(sheet);

      const rec = {
        sheet,
        body,
        hdr,
        ftr,
        activeSpecimen: initialSpecimen || state.defaultSpecimen,
      };
      sheetsMeta.push(rec);
      return rec;
    };

    const firstCat = state.categoryNodes[0];
    const firstSpec = firstCat
      ? {
          barcodeId: firstCat.getAttribute("data-specimen-barcode") || state.defaultSpecimen.barcodeId,
          sampleType: firstCat.getAttribute("data-specimen-type") || state.defaultSpecimen.sampleType,
        }
      : state.defaultSpecimen;

    let current = createSheet(firstSpec);

    const hasRoom = () =>
      current.body.scrollHeight <= current.body.clientHeight + 1 &&
      current.sheet.scrollHeight <= A4_HEIGHT_PX + 2;

    const updateSheetSpecimenHeader = (sheetRec, spec) => {
      if (!spec?.barcodeId) return;
      sheetRec.activeSpecimen = spec;
      sheetRec.hdr.innerHTML = "";
      sheetRec.hdr.appendChild(buildHeaderElement(state.report, spec));
    };

    state.categoryNodes.forEach((catSection, idx) => {
      const catSpecimen = {
        barcodeId: catSection.getAttribute("data-specimen-barcode") || state.defaultSpecimen.barcodeId,
        sampleType: catSection.getAttribute("data-specimen-type") || state.defaultSpecimen.sampleType,
      };

      const specimenChanged =
        idx > 0 &&
        current.body.children.length > 0 &&
        catSpecimen.barcodeId &&
        current.activeSpecimen?.barcodeId &&
        catSpecimen.barcodeId !== current.activeSpecimen.barcodeId;

      const forceNewPage =
        idx > 0 &&
        current.body.children.length > 0 &&
        (catSection.classList.contains("page-break") || specimenChanged);

      if (forceNewPage) {
        current = createSheet(catSpecimen);
      } else if (current.body.children.length === 0) {
        updateSheetSpecimenHeader(current, catSpecimen);
      }

      const fullClone = catSection.cloneNode(true);
      current.body.appendChild(fullClone);
      if (hasRoom()) {
        return;
      }

      current.body.removeChild(fullClone);
      if (current.body.scrollHeight > A4_HEIGHT_PX * 0.72 && current.body.children.length > 0) {
        current = createSheet(catSpecimen);
      }

      let targetSec = document.createElement("section");
      targetSec.className = "section oh5-category-section";
      current.body.appendChild(targetSec);

      Array.from(catSection.children).forEach((child) => {
        if (child.tagName !== "TABLE") {
          const cClone = child.cloneNode(true);
          targetSec.appendChild(cClone);
          if (!hasRoom() && targetSec.children.length > 1) {
            targetSec.removeChild(cClone);
            current = createSheet(catSpecimen);
            targetSec = document.createElement("section");
            targetSec.className = "section oh5-category-section";
            targetSec.appendChild(cClone);
            current.body.appendChild(targetSec);
          }
          return;
        }

        const origThead = child.querySelector("thead");
        const origRows = Array.from(child.querySelectorAll("tbody > tr"));

        const makeFreshTable = () => {
          const tbl = document.createElement("table");
          tbl.className = child.className;
          if (origThead) tbl.appendChild(origThead.cloneNode(true));
          const tb = document.createElement("tbody");
          tbl.appendChild(tb);
          return { tbl, tb };
        };

        let { tbl, tb } = makeFreshTable();
        targetSec.appendChild(tbl);

        origRows.forEach((row) => {
          const rClone = row.cloneNode(true);
          tb.appendChild(rClone);
          if (!hasRoom() && tb.children.length > 1) {
            tb.removeChild(rClone);
            current = createSheet(catSpecimen);
            targetSec = document.createElement("section");
            targetSec.className = "section oh5-category-section";
            current.body.appendChild(targetSec);
            const nextTable = makeFreshTable();
            tbl = nextTable.tbl;
            tb = nextTable.tb;
            tb.appendChild(rClone);
            targetSec.appendChild(tbl);
          }
        });
      });
    });

    const tailNodes = [state.remarksNode, state.endNode].filter(Boolean);
    tailNodes.forEach((node) => {
      const clone = node.cloneNode(true);
      current.body.appendChild(clone);
      if (!hasRoom() && current.body.children.length > 1) {
        current.body.removeChild(clone);
        current = createSheet(current.activeSpecimen);
        current.body.appendChild(clone);
      }
    });

    const total = sheetsMeta.length;
    sheetsMeta.forEach(({ sheet }, index) => {
      const counter = sheet.querySelector(".oh5-page-counter");
      if (counter) {
        counter.textContent = `Page ${index + 1} of ${total}`;
      }

      sheet.querySelectorAll(".cell-edit").forEach((cell) => {
        const tr = cell.closest("tr");
        cell.addEventListener("blur", () => handleInlineCellEdit(cell, tr));
        cell.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && cell.getAttribute("data-field") !== "reference") {
            e.preventDefault();
            cell.blur();
          }
        });
      });
    });
  }

  /* =========================================================================
   * 5. SNAPSHOT & PDF PAYLOAD BUILDERS (LABFLOW COMPATIBLE)
   * ========================================================================= */

  function buildSemanticSnapshotParts() {
    const headerHtml = state.headerElement ? state.headerElement.outerHTML : "";

    const bodyWrap = document.createElement("div");
    state.categoryNodes.forEach((node) => {
      bodyWrap.appendChild(node.cloneNode(true));
    });
    if (state.remarksNode) bodyWrap.appendChild(state.remarksNode.cloneNode(true));
    if (state.endNode) bodyWrap.appendChild(state.endNode.cloneNode(true));

    const footerHtml = state.footerElement ? state.footerElement.outerHTML : "";
    return {
      header: headerHtml,
      htmlContent: bodyWrap.innerHTML,
      footer: footerHtml,
    };
  }

  async function saveCurrentSnapshot({ silent = false } = {}) {
    if (!state.reportId) return false;
    if (state.isSelectiveMode) {
      if (!silent) toast("Selective Subset active — full saved report remains safe in DB.", "info");
      return true;
    }
    const s = state.settings;
    const snapshot = buildSemanticSnapshotParts();
    const investigationMargin = Math.round(s.headermargin * CM_TO_PX + 115);

    const payload = {
      value1: state.reportId,
      reportId: state.reportId,
      bookingId: state.bookingId,
      htmlContent: snapshot.htmlContent,
      cssContent: "",
      header: snapshot.header,
      footer: snapshot.footer,
      backgroundImageUrl: state.backgroundImageUrl || "",
      investigationmargin: investigationMargin,
      headermargin: String(s.headermargin),
      footermargin: String(s.footermargin),
      marginLeft: String(s.marginLeft),
      marginRight: String(s.marginRight),
      LeftsignPd: String(s.LeftsignPd),
      Rightsignpd: String(s.Rightsignpd),
      headerContentGap: s.headerContentGap,
      showlab: s.showlab,
      showdoctorfirst: s.showdoctorfirst,
      showdoctorsecond: s.showdoctorsecond,
      fileInputLab: s.fileInputLab,
      fileInputDoctorleft: s.fileInputDoctorleft,
      fileInputDoctorright: s.fileInputDoctorright,
      fileInputLabtext: s.fileInputLabtext,
      fileInputDoctorlefttext: s.fileInputDoctorlefttext,
      fileInputDoctorrighttext: s.fileInputDoctorrighttext,
      signatureLayout: s.signatureLayout || null,
      isdocumented: Boolean(state.report?.isDocumented || state.report?.isdocumented),
      pdfformat: effectiveFormat,
      pdfFormat: effectiveFormat,
    };

    try {
      const response = await fetch(`${BASE_URL}/api/v1/user/adding-pdf-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
        signal,
      });
      if (!response.ok) throw new Error(`Save layout failed (${response.status})`);
      if (!silent) toast("Report layout saved cleanly.", "success");
      return true;
    } catch (err) {
      console.error("[Format5] Snapshot save failed:", err);
      if (!silent) toast(err.message || "Could not save report layout.", "error");
      return false;
    }
  }

  async function requestFormat5PdfBlob({ download = false } = {}) {
    const s = state.settings;
    const snapshot = buildSemanticSnapshotParts();

    const payload = {
      value1: state.reportId,
      reportId: state.reportId,
      bookingId: state.bookingId,
      pdfformat: effectiveFormat,
      pdfFormat: effectiveFormat,
      checkBox: Boolean(state.withoutLetterhead),
      backgroundImageUrl: state.backgroundImageUrl || "",
      headermargin: String(s.headermargin),
      footermargin: String(s.footermargin),
      marginLeft: String(s.marginLeft),
      marginRight: String(s.marginRight),
      LeftsignPd: String(s.LeftsignPd),
      Rightsignpd: String(s.Rightsignpd),
      headerContentGap: s.headerContentGap,
      selectedFontSize: s.selectedFontSize,
      selectedFontFamily: s.selectedFontFamily,
      RowSpacing: s.RowSpacing,
      HighLow: s.HighLow,
      HLinred: s.HLinred,
      BoldRow: s.BoldRow,
      showInvest: s.showInvest,
      hideCategories: !s.showCategory,
      hideTableHeadings: s.hideTableHeadings,
      showCategory: s.showCategory,
      showTestHeading: s.showTestHeading,
      showlab: s.showlab,
      showdoctorfirst: s.showdoctorfirst,
      showdoctorsecond: s.showdoctorsecond,
      fileInputLab: s.fileInputLab,
      fileInputDoctorleft: s.fileInputDoctorleft,
      fileInputDoctorright: s.fileInputDoctorright,
      fileInputLabtext: s.fileInputLabtext,
      fileInputDoctorlefttext: s.fileInputDoctorlefttext,
      fileInputDoctorrighttext: s.fileInputDoctorrighttext,
      signatureLayout: s.signatureLayout || null,
      htmlContent: snapshot.htmlContent,
      cssContent: "",
      header: snapshot.header,
      footer: snapshot.footer,
      DownloadPdf: Boolean(download),
      explicitPrintSettingsSave: false,
      skipCustomizationSave: Boolean(state.isSelectiveMode),
      isSelectivePrint: Boolean(state.isSelectiveMode),
      investigationmargin: Math.round(s.headermargin * CM_TO_PX + 115),
    };

    const response = await fetch(`${BASE_URL}/api/v1/user/get-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const rawErr = await response.text().catch(() => "");
      let msg = `PDF generation failed (${response.status})`;
      try {
        const parsed = JSON.parse(rawErr);
        if (parsed?.message) msg = parsed.message;
      } catch {
        if (rawErr) msg = rawErr;
      }
      throw new Error(msg);
    }

    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i);
    const filename = match
      ? decodeURIComponent(match[1])
      : `${(state.report?.patientName || "Report").replace(/\s+/g, "_")}_${state.bookingId || "Format5"}.pdf`;

    const rawBlob = await response.blob();
    const pdfBlob = rawBlob.type === "application/pdf"
      ? rawBlob
      : new Blob([await rawBlob.arrayBuffer()], { type: "application/pdf" });

    return {
      blob: pdfBlob,
      filename,
    };
  }

  /* =========================================================================
   * 6. SIGN-OFF, ACTION TRACKING & INTERACTIVE CONTROLS
   * ========================================================================= */

  function updateSignOffUI(isSigned) {
    const signBtn = document.getElementById("signOff");
    const pill = document.getElementById("oh5SignStatusPill");

    if (signBtn) {
      signBtn.classList.toggle("is-signed", isSigned);
      const span = signBtn.querySelector(".oh5-btn-label");
      if (span) span.textContent = isSigned ? "Signed Off" : "Sign Off";
    }

    if (pill) {
      pill.classList.toggle("is-signed", isSigned);
      pill.classList.toggle("is-pending", !isSigned);
      pill.innerHTML = isSigned
        ? '<i class="fas fa-check-circle"></i> Signed Off'
        : '<i class="fas fa-clock"></i> Pending Sign-Off';
    }
  }

  function syncActionBadgesFromStats(counters = {}, actionHistory = {}) {
    if (state.report) {
      state.report.actionCounters = counters;
      state.report.actionHistory = actionHistory;
    }

    const viewEl = document.getElementById("viewCount");
    const dlEl = document.getElementById("downloadCount");
    if (viewEl) viewEl.textContent = String(Number(counters?.viewPdf || 0));
    if (dlEl) dlEl.textContent = String(Number(counters?.downloadPdf || 0));
  }

  function sanitizeActionQueueStorage() {
    try {
      const key = "labflow.reportActionQueue.v1";
      const raw = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(raw)) {
        const cleaned = raw.filter((item) => item && typeof item.action === "string" && item.action.trim());
        if (cleaned.length !== raw.length) {
          localStorage.setItem(key, JSON.stringify(cleaned));
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  async function trackReportAction(actionType) {
    if (!global.ReportActionHelpers?.trackAction || !state.reportId || !actionType) return;
    try {
      const updated = await global.ReportActionHelpers.trackAction({
        reportId: state.reportId,
        bookingId: state.bookingId,
        action: actionType,
        currentCounters: state.report?.actionCounters || {},
        currentHistory: state.report?.actionHistory || {},
      });
      if (updated?.actionCounters) {
        syncActionBadgesFromStats(updated.actionCounters, updated.actionHistory || {});
      }
    } catch (err) {
      console.warn("[Format5] Action tracking skipped:", err?.message || err);
    }
  }

  function applyLayerOneRules() {
    if (!isLayerOneTenant) return;
    const root = document.getElementById("oh5PageRoot");
    if (root) {
      root.querySelectorAll(".forhide").forEach((el) => {
        el.style.display = "none";
      });
    }
    const signBtn = document.getElementById("signOff");
    if (signBtn) signBtn.style.display = "none";
  }

  function bindEventHandlers() {
    const lhCheckbox = document.getElementById("oh5WithoutLetterhead");
    if (lhCheckbox) {
      lhCheckbox.addEventListener("change", () => {
        state.withoutLetterhead = Boolean(lhCheckbox.checked);
        renderPaginatedSheets();
      }, { signal });
    }

    const gapInput = document.getElementById("oh5RowGapInput");
    const gapVal = document.getElementById("oh5RowGapVal");
    if (gapInput) {
      gapInput.addEventListener("input", () => {
        const nextGap = parseNum(gapInput.value, 1, 0, 12);
        state.settings.RowSpacing = nextGap;
        if (gapVal) gapVal.textContent = String(nextGap);
        renderPaginatedSheets();
      }, { signal });
    }

    const signOffBtn = document.getElementById("signOff");
    if (signOffBtn) {
      signOffBtn.addEventListener("click", async () => {
        if (!state.reportId) return;
        const nextSignOff = !Boolean(state.report?.signOff);
        setButtonLoading("signOff", true);
        try {
          const res = await fetch(`${BASE_URL}/api/v1/user/editReportsignofffield`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ value1: state.reportId, signoff: nextSignOff }),
            signal,
          });
          if (!res.ok) throw new Error("Sign-off request failed");

          if (state.report) state.report.signOff = nextSignOff;
          updateSignOffUI(nextSignOff);
          toast(nextSignOff ? "Report signed off successfully." : "Sign-off removed.", "success");

          if (nextSignOff && state.bookingId) {
            fetch(`${BASE_URL}/api/v1/user/CompleteBookingcontroller`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ bookingid: state.bookingId }),
              signal,
            }).catch(() => {});
          }
          await saveCurrentSnapshot({ silent: true });
        } catch (err) {
          toast(err.message || "Sign-off failed.", "error");
        } finally {
          setButtonLoading("signOff", false);
        }
      }, { signal });
    }

    const enterResultBtn = document.getElementById("enterResult");
    if (enterResultBtn) {
      enterResultBtn.addEventListener("click", async () => {
        if (!state.bookingId) return;
        try {
          enterResultBtn.disabled = true;
          const res = await fetch(`${BASE_URL}/api/v1/user/getbooking`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ value1: state.bookingId }),
            signal,
          });
          if (res.ok) {
            const booking = await res.json();
            if (booking && (booking.bookingId || booking._id)) {
              booking.__fullBooking = true;
              localStorage.setItem("booking", JSON.stringify(booking));
              localStorage.setItem("regId", JSON.stringify(booking.bookingId || state.bookingId));
            }
          }
          window.open(`${BASE_URL}/admin/admin.html?page=labreport&value1=${encodeURIComponent(state.bookingId)}`, "_blank");
        } finally {
          enterResultBtn.disabled = false;
        }
      }, { signal });
    }

    const saveBtn = document.getElementById("savePDF");
    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        setButtonLoading("savePDF", true);
        try {
          await saveCurrentSnapshot({ silent: false });
        } finally {
          setButtonLoading("savePDF", false);
        }
      }, { signal });
    }

    const downloadBtn = document.getElementById("downloadPDF");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", async () => {
        setButtonLoading("downloadPDF", true);
        try {
          const { blob, filename } = await requestFormat5PdfBlob({ download: true });
          if (global.LabFlowDesktopShell?.saveAndOpenPdf) {
            const buffer = await blob.arrayBuffer();
            await global.LabFlowDesktopShell.saveAndOpenPdf({ fileName: filename, buffer });
          } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          }
          await trackReportAction("downloadPdf");
          toast("Format 5 PDF downloaded successfully.", "success");
        } catch (err) {
          toast(err.message || "PDF download failed.", "error");
        } finally {
          setButtonLoading("downloadPDF", false);
        }
      }, { signal });
    }

    const printBtn = document.getElementById("BrowserPrint");
    if (printBtn) {
      printBtn.addEventListener("click", async () => {
        if (printBtn.disabled) return;
        const usesDesktopShell = Boolean(global.LabFlowDesktopShell?.saveAndOpenPdf);
        let printTab = null;

        // Open blank tab synchronously inside user gesture so popup blockers allow immediate PDF navigation
        if (!usesDesktopShell) {
          try {
            printTab = global.open("", "_blank");
            if (printTab && printTab.document) {
              printTab.document.open();
              printTab.document.write(
                `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Generating Clinical PDF — LabFlow</title>` +
                  `<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;color:#0f172a;}` +
                  `.card{background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:28px 34px;text-align:center;box-shadow:0 12px 32px rgba(15,23,42,.08);max-width:360px;}` +
                  `.spin{width:32px;height:32px;border:3px solid #e2e8f0;border-top-color:#0f766e;border-radius:50%;margin:0 auto 14px;animation:s .75s linear infinite;}` +
                  `h3{margin:0 0 6px;font-size:15px;font-weight:700;color:#1e3a5f;}p{margin:0;font-size:12.5px;color:#475569;}` +
                  `@keyframes s{to{transform:rotate(360deg);}}</style></head>` +
                  `<body><div class="card"><div class="spin"></div><h3>Generating Format 5 PDF</h3><p>Preparing print-ready report, opening automatically...</p></div></body></html>`
              );
              printTab.document.close();
            }
          } catch {
            printTab = null;
          }
        }

        setButtonLoading("BrowserPrint", true);
        clearTimeout(state.saveTimer);
        try {
          const { blob, filename } = await requestFormat5PdfBlob({ download: false });
          if (!blob || blob.size === 0) {
            throw new Error("Generated PDF is empty.");
          }

          if (usesDesktopShell) {
            const buffer = await blob.arrayBuffer();
            await global.LabFlowDesktopShell.saveAndOpenPdf({ fileName: filename, buffer });
          } else {
            const pdfUrl = URL.createObjectURL(blob);
            state.openedPdfUrls.push(pdfUrl);
            setTimeout(() => {
              URL.revokeObjectURL(pdfUrl);
              state.openedPdfUrls = state.openedPdfUrls.filter((u) => u !== pdfUrl);
            }, 5 * 60 * 1000);

            if (printTab && !printTab.closed) {
              printTab.location.replace(pdfUrl);
            } else {
              // Strict popup blocker fallback: display immediately inside integrated preview modal
              const liveModal = portalOverlaysToBody()?.popupModal || document.getElementById("popupModal");
              const livePdfFrame = liveModal?.querySelector("#pdfFrame") || document.getElementById("pdfFrame");
              if (state.currentPreviewPdfUrl) {
                URL.revokeObjectURL(state.currentPreviewPdfUrl);
              }
              state.currentPreviewPdfUrl = pdfUrl;
              if (liveModal && livePdfFrame) {
                const statusEl = document.getElementById("oh5PreviewStatus");
                if (statusEl) statusEl.style.display = "none";
                livePdfFrame.style.display = "block";
                livePdfFrame.src = pdfUrl;
                liveModal.classList.add("is-open");
                liveModal.style.display = "flex";
              }
            }
          }

          await trackReportAction("printDialog");
          toast("PDF generated and opened for print.", "success");
        } catch (err) {
          const msg = err?.message || "Could not generate print PDF.";
          if (printTab && !printTab.closed) {
            try {
              printTab.document.open();
              printTab.document.write(
                `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:32px;color:#991b1b;background:#fef2f2;">` +
                  `<h3>PDF Generation Failed</h3><p>${escapeHtml(msg)}</p></body></html>`
              );
              printTab.document.close();
            } catch { /* ignore cross-state error */ }
          }
          toast(msg, "error");
        } finally {
          setButtonLoading("BrowserPrint", false);
        }
      }, { signal });
    }

    const settingsAnchr = document.getElementById("PDFsettinganchr");
    const settingsBtn = document.getElementById("PDFsetting");
    const settingsTrigger = settingsAnchr || settingsBtn;
    if (settingsTrigger) {
      settingsTrigger.addEventListener("click", async (event) => {
        event.preventDefault();
        setButtonLoading("PDFsetting", true);
        try {
          localStorage.setItem("pdfformat", effectiveFormat);
          localStorage.setItem("reportId", state.reportId);
          localStorage.setItem("value1", state.reportId);
          localStorage.setItem("myKey", state.reportId);
          if (state.bookingId) localStorage.setItem("bookingId", state.bookingId);
          await saveCurrentSnapshot({ silent: true });
          const targetUrl = settingsAnchr?.href || `${BASE_URL}/admin/pages/pages/printsetting.html`;
          window.location.href = targetUrl;
        } finally {
          setButtonLoading("PDFsetting", false);
        }
      }, { signal });
    }

    const sendReportBtn = document.getElementById("sendReport");
    const modal = portalOverlaysToBody()?.popupModal || document.getElementById("popupModal");
    const closeModalBtn = modal?.querySelector(".close-button");
    const inputBar = document.getElementById("inputField");
    const contactInput = document.getElementById("contactInput");
    const pdfFrame = document.getElementById("pdfFrame");
    const previewStatus = document.getElementById("oh5PreviewStatus");

    const setPreviewStatus = (message = "", mode = "loading") => {
      if (!previewStatus) return;
      if (!message) {
        previewStatus.style.display = "none";
        previewStatus.textContent = "";
        previewStatus.className = "oh5-preview-status";
        return;
      }
      previewStatus.textContent = message;
      previewStatus.className = `oh5-preview-status is-${mode}`;
      previewStatus.style.display = "flex";
    };

    const closeModal = () => {
      const liveModal = document.getElementById("popupModal") || modal;
      if (liveModal) {
        liveModal.classList.remove("is-open");
        liveModal.style.display = "none";
      }
      if (inputBar) inputBar.style.display = "none";
      setPreviewStatus("");
      if (state.currentPreviewPdfUrl) {
        URL.revokeObjectURL(state.currentPreviewPdfUrl);
        state.currentPreviewPdfUrl = "";
      }
      if (pdfFrame) {
        pdfFrame.src = "";
        pdfFrame.style.display = "none";
      }
    };

    if (sendReportBtn) {
      sendReportBtn.addEventListener("click", async () => {
        const liveModal = portalOverlaysToBody()?.popupModal || document.getElementById("popupModal") || modal;
        if (!liveModal) {
          toast("Share popup container not found.", "error");
          return;
        }
        const livePdfFrame = liveModal.querySelector("#pdfFrame") || pdfFrame;

        setButtonLoading("sendReport", true);
        if (state.currentPreviewPdfUrl) {
          URL.revokeObjectURL(state.currentPreviewPdfUrl);
          state.currentPreviewPdfUrl = "";
        }
        if (livePdfFrame) {
          livePdfFrame.src = "";
          livePdfFrame.style.display = "none";
        }
        setPreviewStatus("Generating PDF preview, please wait...", "loading");
        liveModal.classList.add("is-open");
        liveModal.style.display = "flex";

        try {
          const { blob } = await requestFormat5PdfBlob({ download: false });
          if (!blob || blob.size === 0) {
            throw new Error("Generated PDF preview is empty.");
          }
          state.currentPreviewPdfUrl = URL.createObjectURL(blob);
          setPreviewStatus("");
          if (livePdfFrame) {
            livePdfFrame.style.display = "block";
            livePdfFrame.src = state.currentPreviewPdfUrl;
          }
          await trackReportAction("viewPdf");
        } catch (err) {
          const errMsg = err?.message || "Could not generate preview for sharing.";
          setPreviewStatus(`${errMsg} — Click "Open PDF" or retry.`, "error");
          toast(errMsg, "error");
        } finally {
          setButtonLoading("sendReport", false);
        }
      }, { signal });
    }

    if (closeModalBtn) {
      closeModalBtn.addEventListener("click", closeModal, { signal });
    }
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
      }, { signal });
    }

    document.getElementById("smsButton")?.addEventListener("click", () => {
      state.activeShareChannel = "sms";
      if (inputBar) inputBar.style.display = "flex";
      if (contactInput) {
        contactInput.type = "tel";
        contactInput.value = state.report?.patientPhone || state.report?.phone || state.report?.contactDefaults?.phone || "";
        contactInput.placeholder = "Enter patient mobile number";
      }
    }, { signal });

    document.getElementById("emailButton")?.addEventListener("click", () => {
      state.activeShareChannel = "email";
      if (inputBar) inputBar.style.display = "flex";
      if (contactInput) {
        contactInput.type = "email";
        const defaultMail =
          state.report?.savedDoctorEmail ||
          state.report?.contactDefaults?.email ||
          global.ReportActionHelpers?.resolveDoctorEmail?.(state.report) ||
          "";
        contactInput.value = defaultMail;
        contactInput.placeholder = "Enter recipient email address";
      }
    }, { signal });

    document.getElementById("whatsappButton")?.addEventListener("click", () => {
      const msg = encodeURIComponent(
        `Hello ${state.report?.patientName || "Patient"},\nYour diagnostic lab report (Booking ID: ${state.bookingId || state.reportId}) is ready.\nDownload verified PDF:\n${state.qrLinkUrl}`
      );
      const rawPhone = String(state.report?.patientPhone || state.report?.phone || "").replace(/\D/g, "");
      const waUrl = rawPhone
        ? `https://wa.me/${rawPhone.length === 10 ? "91" + rawPhone : rawPhone}?text=${msg}`
        : `https://wa.me/?text=${msg}`;
      window.open(waUrl, "_blank", "noopener,noreferrer");
      trackReportAction("whatsappOpen");
    }, { signal });

    document.getElementById("openPdfButton")?.addEventListener("click", () => {
      if (state.currentPreviewPdfUrl) {
        window.open(state.currentPreviewPdfUrl, "_blank", "noopener,noreferrer");
      }
    }, { signal });

    document.getElementById("sendButton")?.addEventListener("click", async () => {
      const contact = (contactInput?.value || "").trim();
      if (!contact) {
        toast("Please enter a recipient contact first.", "warn");
        return;
      }
      if (!state.currentPreviewPdfUrl) {
        toast("PDF preview is not ready yet.", "error");
        return;
      }
      try {
        const pdfRes = await fetch(state.currentPreviewPdfUrl);
        const pdfBlob = await pdfRes.blob();

        if (state.activeShareChannel === "sms") {
          const formData = new FormData();
          formData.append("pdf", new File([pdfBlob], "report_format5.pdf", { type: "application/pdf" }));
          formData.append("phoneNumber", contact);
          formData.append("message", "Your diagnostic test report is ready.");
          const res = await fetch(`${BASE_URL}/api/v1/user/send-sms`, {
            method: "POST",
            credentials: "include",
            body: formData,
          });
          if (!res.ok) throw new Error("SMS dispatch failed");
          await trackReportAction("sms");
          toast("SMS sent successfully!", "success");
        } else if (state.activeShareChannel === "email") {
          if (global.ReportActionHelpers?.sendPdfByEmail) {
            await global.ReportActionHelpers.sendPdfByEmail({
              email: contact,
              pdfBlob,
              report: state.report,
            });
          } else {
            const formData = new FormData();
            formData.append("pdf", new File([pdfBlob], "report_format5.pdf", { type: "application/pdf" }));
            formData.append("email", contact);
            formData.append("reportId", state.reportId);
            const res = await fetch(`${BASE_URL}/api/v1/user/send-email`, {
              method: "POST",
              credentials: "include",
              body: formData,
            });
            if (!res.ok) throw new Error("Email dispatch failed");
          }
          toast("Email sent successfully!", "success");
        }
      } catch (err) {
        toast(err.message || "Sending report failed.", "error");
      }
    }, { signal });
  }

  /* =========================================================================
   * 7. INITIALIZATION PIPELINE
   * ========================================================================= */

  async function initReportFormat5() {
    portalOverlaysToBody();
    const skeleton = document.getElementById("oh5Skeleton");

    try {
      await ensureReportActionHelpersLoaded();
      if (!state.value1) {
        throw new Error("No booking/report identifier (`value1`) provided.");
      }

      if (activeUser && activeUser.showprintsetting === false) {
        const printSettingWrap = document.getElementById("printsettingbutton");
        if (printSettingWrap) printSettingWrap.style.display = "none";
      }

      const [reportData, templateBg, doctorsSign] = await Promise.all([
        fetchReportData(state.value1),
        fetchTemplateLetterhead(),
        fetchDoctorsSignatures(),
        loadClinicalRangeEvaluator(),
      ]);

      if (!reportData || !reportData._id) {
        throw new Error("Report data not found for this booking.");
      }

      state.fullReport = reportData;
      state.reportId = String(reportData._id);
      state.bookingId = String(reportData.bookingId || state.value1);
      state.backgroundImageUrl = templateBg || "";
      state.doctorsSign = doctorsSign;

      const [, , savedCustomization, selectiveCtx] = await Promise.all([
        fetchBookingDetailsSafe(state.bookingId).then((b) => { state.bookingData = b; }),
        fetchBarcodeTestMetadataSafe(state.bookingId),
        fetchPrintSettingsSafe(state.reportId),
        global.ReportActionHelpers?.resolveInitialSelectiveReport
          ? global.ReportActionHelpers.resolveInitialSelectiveReport(reportData, state.bookingId)
          : Promise.resolve({ fullReport: reportData, activeReport: reportData, initialManifest: null, barcodeMeta: null, isSelective: false }),
      ]);

      state.isSelectiveMode = Boolean(selectiveCtx?.isSelective);
      state.report = selectiveCtx?.activeReport || reportData;
      const activeReport = state.report;

      localStorage.setItem("myKey", state.reportId);
      localStorage.setItem("value1", state.reportId);
      localStorage.setItem("reportId", state.reportId);
      localStorage.setItem("pdfformat", resolvedAssignedFormat || effectiveFormat);

      hydratePrintSettings(reportData, savedCustomization, doctorsSign);

      const topSummary = document.getElementById("oh5TopSummary");
      if (topSummary) {
        topSummary.innerHTML = `${escapeHtml(reportData.patientName || "Patient")} <span>#${escapeHtml(state.bookingId)}</span>`;
      }
      const catPill = document.getElementById("oh5CatModePill");
      if (catPill && reportData.categorizedPDF) {
        catPill.style.display = "inline-flex";
      }

      const allSpecimens = collectAllSpecimenEntries(reportData, state.bookingData, state.barcodeMetaEntries);
      const primaryCatSpec =
        Array.isArray(activeReport.CategoryAndTest) && activeReport.CategoryAndTest.length
          ? resolveSpecimenForCategory(activeReport.CategoryAndTest[0], activeReport, state.bookingData)
          : (allSpecimens.find((e) => e.barcodeId) || { barcodeId: state.bookingId, sampleType: "" });

      state.defaultSpecimen = primaryCatSpec;

      const uniqueBarcodeNumbers = new Set();
      if (primaryCatSpec.barcodeId) uniqueBarcodeNumbers.add(primaryCatSpec.barcodeId);
      (reportData.CategoryAndTest || []).forEach((cat) => {
        const s = resolveSpecimenForCategory(cat, reportData, state.bookingData);
        if (s?.barcodeId) uniqueBarcodeNumbers.add(s.barcodeId);
      });
      allSpecimens.forEach((e) => {
        if (e.barcodeId) uniqueBarcodeNumbers.add(e.barcodeId);
      });

      state.qrLinkUrl = `${BASE_URL}/pages/pages/download_reports.html?value=${encodeURIComponent(state.reportId)}&id=${encodeURIComponent(String(tenantId))}`;

      const [rawQr, b64Lab, b64Doc1, b64Doc2, sigEngine, resolvedBgPreview] = await Promise.all([
        fetchQrCodeImage(state.qrLinkUrl),
        imageToBase64(state.settings.fileInputLab),
        imageToBase64(state.settings.fileInputDoctorleft),
        imageToBase64(state.settings.fileInputDoctorright),
        global.ReportActionHelpers?.loadSignatureLayoutEngine?.() || Promise.resolve(null),
        resolveLetterheadPreviewUrl(state.backgroundImageUrl),
        ...Array.from(uniqueBarcodeNumbers).map((bNum) => fetchBarcodeImage(bNum)),
      ]);

      state.backgroundPreviewUrl = resolvedBgPreview || "";
      state.sigLayoutEngine = sigEngine || null;
      state.qrDataUrl = await imageToBase64(rawQr);
      if (b64Lab) state.settings.fileInputLab = b64Lab;
      if (b64Doc1) state.settings.fileInputDoctorleft = b64Doc1;
      if (b64Doc2) state.settings.fileInputDoctorright = b64Doc2;

      state.headerElement = buildHeaderElement(activeReport, state.defaultSpecimen);
      state.footerElement = buildFooterElement();
      buildBodySections(activeReport);

      if (skeleton) skeleton.style.display = "none";
      renderPaginatedSheets();
      applyLayerOneRules();
      updateSignOffUI(Boolean(reportData.signOff));
      bindEventHandlers();

      if (global.ReportActionHelpers?.mountReportFilterDrawer) {
        const drawerBarcodeMeta = state.barcodeMetaEntries.length ? state.barcodeMetaEntries : selectiveCtx?.barcodeMeta;
        state.filterDrawerController = await global.ReportActionHelpers.mountReportFilterDrawer({
          fullReport: state.fullReport,
          initialManifest: selectiveCtx?.initialManifest || null,
          barcodeMeta: drawerBarcodeMeta,
          dockEl: document.querySelector(".oh5-dock"),
          onSelectionApplied: async ({ filteredReport, isSelective }) => {
            state.isSelectiveMode = Boolean(isSelective);
            state.report = filteredReport;
            const nextPrimarySpec =
              Array.isArray(filteredReport.CategoryAndTest) && filteredReport.CategoryAndTest.length
                ? resolveSpecimenForCategory(filteredReport.CategoryAndTest[0], filteredReport, state.bookingData)
                : (allSpecimens.find((e) => e.barcodeId) || state.defaultSpecimen);
            state.defaultSpecimen = nextPrimarySpec;
            state.headerElement = buildHeaderElement(filteredReport, state.defaultSpecimen);
            buildBodySections(filteredReport);
            renderPaginatedSheets();
            applyLayerOneRules();
            toast(
              isSelective
                ? "Report updated with selected tests/panels cleanly."
                : "Restored complete Full Report.",
              "success"
            );
          },
        });
      }

      if (global.ReportActionHelpers) {
        sanitizeActionQueueStorage();
        const mergedStats = global.ReportActionHelpers.mergeQueuedActionStats?.({
          reportId: state.reportId,
          bookingId: state.bookingId,
          actionCounters: reportData.actionCounters || {},
          actionHistory: reportData.actionHistory || {},
        }) || {
          actionCounters: reportData.actionCounters || {},
          actionHistory: reportData.actionHistory || {},
        };

        syncActionBadgesFromStats(mergedStats.actionCounters, mergedStats.actionHistory);

        global.ReportActionHelpers.flushPendingActions?.({
          reportId: state.reportId,
          bookingId: state.bookingId,
          onSynced: (synced) => {
            if (synced?.actionCounters) {
              syncActionBadgesFromStats(synced.actionCounters, synced.actionHistory || {});
            }
          },
        });

        state.unsubscribeActions = global.ReportActionHelpers.subscribeToActionUpdates?.((payload) => {
          if (!payload) return;
          const matchesReport =
            (payload.reportId && String(payload.reportId) === String(state.reportId)) ||
            (payload.bookingId && String(payload.bookingId) === String(state.bookingId));
          if (matchesReport && payload.actionCounters) {
            syncActionBadgesFromStats(payload.actionCounters, payload.actionHistory || {});
          }
        });
      }

      if (!state.hasSavedInitialSnapshot) {
        state.hasSavedInitialSnapshot = true;
        await saveCurrentSnapshot({ silent: true });
      }
    } catch (err) {
      console.error("[Format5] Initialization error:", err);
      if (skeleton) {
        skeleton.innerHTML = `
          <div style="text-align:center;padding:36px 20px;color:#b91c1c;">
            <i class="fas fa-exclamation-triangle" style="font-size:28px;margin-bottom:10px;"></i>
            <h3 style="margin:0 0 6px;font-size:16px;">Unable to load Format 5 Report</h3>
            <p style="margin:0;color:#475569;font-size:13px;">${escapeHtml(err.message || "Unexpected error occurred.")}</p>
          </div>
        `;
      }
      toast(err.message || "Failed to load report.", "error");
    }
  }

  global.__oh5Cleanup = () => {
    abortController.abort();
    clearTimeout(state.saveTimer);
    if (typeof state.unsubscribeActions === "function") {
      state.unsubscribeActions();
      state.unsubscribeActions = null;
    }
    if (typeof state.filterDrawerController?.cleanup === "function") {
      state.filterDrawerController.cleanup();
      state.filterDrawerController = null;
    }
    if (state.currentPreviewPdfUrl) {
      URL.revokeObjectURL(state.currentPreviewPdfUrl);
    }
    if (Array.isArray(state.openedPdfUrls)) {
      state.openedPdfUrls.forEach((u) => {
        try {
          if (u) URL.revokeObjectURL(u);
        } catch { /* ignore */ }
      });
      state.openedPdfUrls = [];
    }
    state.portaledNodes.forEach((n) => {
      try {
        if (n && n.parentElement) n.remove();
      } catch { /* ignore */ }
    });
    state.portaledNodes = [];
  };

  global.cleanupCurrentPage = global.__oh5Cleanup;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initReportFormat5, { once: true, signal });
  } else {
    initReportFormat5();
  }
})(window);
