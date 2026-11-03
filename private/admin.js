// ==========================================================================
// LabFlow Admin — Enterprise Single Page Application Controller
// ==========================================================================

// Global variables (exposed on window for subpage scripts)
let userId;
let role;
let username;
let userRole;
let user;
let BASE_URL = window.location.origin;

let subscriptionServerOffsetMs = 0;
let subscriptionCountdownInterval = null;
let subscriptionStatusInterval = null;
let subscriptionBannerDismissed = false;
let subscriptionBannerExpanded = false;
let subscriptionBannerPositionObserversInstalled = false;
let subscriptionBannerLastLayout = null;

let pageTransitionSequence = 0;
let activePageTransitionSession = null;
let isPageFetchTrackingInstalled = false;
let isSubpageListenerTrackingInstalled = false;
let isCapturingSubpageListeners = false;
const activeSubpageGlobalListeners = [];
let userMenuListenersInstalled = false;

const MOBILE_DRAWER_BREAKPOINT = 1024;
let lastViewportWasMobile = window.innerWidth <= MOBILE_DRAWER_BREAKPOINT;

// Child/Detail route to parent navigation mapping & human-readable metadata
const ROUTE_META_MAP = {
  dashboard: { title: "Dashboard", section: "Overview", parent: "dashboard" },
  aiCopilot: { title: "AI Copilot", section: "Intelligence", parent: "aiCopilot" },
  allcases: { title: "All Cases", section: "Operations", parent: "allcases" },
  labreport: { title: "Enter Lab Report", section: "Operations", parent: "allcases" },
  reportedit: { title: "Edit Report", section: "Operations", parent: "allcases" },
  reportFormat: { title: "Report Preview", section: "Operations", parent: "allcases" },
  reportFormat1: { title: "Report Format", section: "Operations", parent: "allcases" },
  reportFormat3: { title: "Report Format", section: "Operations", parent: "allcases" },
  reportFormat4: { title: "Report Format", section: "Operations", parent: "allcases" },
  ModifyCase: { title: "Modify Case", section: "Operations", parent: "allcases" },
  editbooking: { title: "Edit Booking", section: "Operations", parent: "allcases" },
  new_booking: { title: "New Booking", section: "Booking", parent: "new_booking" },
  barcodeManager: { title: "Barcode Studio", section: "Booking", parent: "barcodeManager" },
  cancel_booking: { title: "Cancel Booking", section: "Booking", parent: "cancel_booking" },
  cancelled: { title: "Cancelled Bookings", section: "Booking", parent: "cancelled" },
  samples: { title: "Sample Tracking", section: "Operations", parent: "samples" },
  Allorders: { title: "Orders", section: "Operations", parent: "Allorders" },
  test: { title: "Test Directory", section: "Test Database", parent: "test" },
  addTest: { title: "Create Test", section: "Test Database", parent: "test" },
  editTest: { title: "Edit Test", section: "Test Database", parent: "test" },
  addTestDocument: { title: "Test Documents", section: "Test Database", parent: "addTestDocument" },
  testPackage: { title: "Test Packages", section: "Test Database", parent: "testPackage" },
  addPackage: { title: "Create Package", section: "Test Database", parent: "testPackage" },
  editPackage: { title: "Edit Package", section: "Test Database", parent: "testPackage" },
  testPanels: { title: "Test Panels", section: "Test Database", parent: "testPanels" },
  addPanels: { title: "Create Panel", section: "Test Database", parent: "testPanels" },
  editPanels: { title: "Edit Panel", section: "Test Database", parent: "testPanels" },
  category: { title: "Test Categories", section: "Test Database", parent: "category" },
  addCategory: { title: "Add Category", section: "Test Database", parent: "category" },
  editCategory: { title: "Edit Category", section: "Test Database", parent: "category" },
  formulaBuilder: { title: "Formula Builder", section: "Test Database", parent: "formulaBuilder" },
  machineConnector: { title: "Machine Connector", section: "Settings", parent: "machineConnector" },
  generatebill: { title: "Generate Bill", section: "Billing", parent: "generatebill" },
  fullLedger: { title: "Track Ledger", section: "Finance", parent: "fullLedger" },
  expense: { title: "Expenses", section: "Finance", parent: "expense" },
  addexpense: { title: "Add Expense", section: "Finance", parent: "addexpense" },
  budgetCategory: { title: "Budget Categories", section: "Finance", parent: "budgetCategory" },
  refferDashboard: { title: "Subscription & Plan", section: "Account", parent: "refferDashboard" },
  Add_doctor: { title: "Add Doctor", section: "Doctors", parent: "Add_doctor" },
  List_doctor: { title: "Doctor Directory", section: "Doctors", parent: "List_doctor" },
  editDoctor: { title: "Edit Doctor", section: "Doctors", parent: "List_doctor" },
  doctorPricing: { title: "Doctor Commission & Pricing", section: "Doctors", parent: "List_doctor" },
  Add_lab: { title: "Add Partner Lab", section: "Labs", parent: "Add_lab" },
  List_lab: { title: "Partner Labs", section: "Labs", parent: "List_lab" },
  editLab: { title: "Edit Partner Lab", section: "Labs", parent: "List_lab" },
  inventory: { title: "Inventory", section: "Inventory", parent: "inventory" },
  Addproduct: { title: "Add Product", section: "Inventory", parent: "Addproduct" },
  editproduct: { title: "Edit Product", section: "Inventory", parent: "inventory" },
  Productview: { title: "Product Details", section: "Inventory", parent: "inventory" },
  Add_franchisse: { title: "Add Franchisee", section: "Franchisee", parent: "Add_franchisse" },
  List_franchisse: { title: "Franchisee Network", section: "Franchisee", parent: "List_franchisse" },
  editFranchisee: { title: "Edit Franchisee", section: "Franchisee", parent: "List_franchisse" },
  Accounts: { title: "Franchisee Accounts", section: "Franchisee", parent: "Accounts" },
  Assign_price: { title: "Assign Pricing", section: "Franchisee", parent: "Assign_price" },
  Bulk_pricing: { title: "Bulk Pricing", section: "Franchisee", parent: "Bulk_pricing" },
  Assign_credit: { title: "Assign Credits", section: "Franchisee", parent: "Assign_credit" },
  assignTarget: { title: "Assign Targets", section: "Franchisee", parent: "assignTarget" },
  Credit_history: { title: "Credit History", section: "Franchisee", parent: "Credit_history" },
  Add_staff: { title: "Manage Staff", section: "Staff", parent: "Add_staff" },
  List_staff: { title: "Staff Directory", section: "Staff", parent: "Add_staff" },
  editStaff: { title: "Edit Staff", section: "Staff", parent: "Add_staff" },
  staffActivity: { title: "Staff Activity Monitor", section: "Staff", parent: "staffActivity" },
  Update_profile: { title: "Profile & Lab Branding", section: "Settings", parent: "Update_profile" },
  printsetting: { title: "Print & PDF Customizer", section: "Settings", parent: "Update_profile" },
  update_password: { title: "Security & Password", section: "Settings", parent: "update_password" },
  addvideo: { title: "Training Videos", section: "Resources", parent: "addvideo" }
};

function normalizeGlobalId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return normalizeGlobalId(value._id);
  if (typeof value === "object" && value.id) return normalizeGlobalId(value.id);
  return String(value);
}

function syncAdminGlobals() {
  window.userId = normalizeGlobalId(userId || user?.parentUser || user?._id);
  window.role = role || "";
  window.username = username || "";
  window.userRole = userRole || "";
  window.user = user || null;
  window.BASE_URL = BASE_URL || window.location.origin;
}

function syncBrandLogos(logoUrl) {
  const resolved = logoUrl || "/images/logoLabFlow.svg";
  const sidebarLogo = document.getElementById("logo");
  const topbarLogo = document.getElementById("topbarLogo");
  if (sidebarLogo) sidebarLogo.src = resolved;
  if (topbarLogo) topbarLogo.src = resolved;
}

function markPermissionHidden(element) {
  if (!(element instanceof HTMLElement)) return;
  element.style.display = "none";
  element.dataset.permissionHidden = "true";
}

function markPermissionVisible(element, displayMode = "") {
  if (!(element instanceof HTMLElement)) return;
  delete element.dataset.permissionHidden;
  element.style.display = displayMode;
}

// ==========================================================================
// SUBSCRIPTION STATE & LIVE BANNER ENGINE
// ==========================================================================

function getPortalSubscriptionState(currentUser = user) {
  const tenantSubscription = currentUser?.tenantId?.subscriptionPlan;
  if (tenantSubscription && typeof tenantSubscription.isActive === "boolean") {
    return tenantSubscription;
  }
  return currentUser?.subscription || null;
}

function isPortalSubscriptionLocked(currentUser = user) {
  return getPortalSubscriptionState(currentUser)?.isActive === false;
}

function syncSubscriptionServerClock(serverDateHeaderOrIso) {
  if (!serverDateHeaderOrIso) return;
  const serverTime = new Date(serverDateHeaderOrIso).getTime();
  if (Number.isFinite(serverTime)) {
    subscriptionServerOffsetMs = serverTime - Date.now();
  }
}

function subscriptionNow() {
  return Date.now() + subscriptionServerOffsetMs;
}

function getSubscriptionEffectiveEndDate(subscription) {
  return (
    subscription?.effectiveEndDate ||
    subscription?.gracePeriod?.graceUntil ||
    subscription?.endDate ||
    null
  );
}

function formatSubscriptionCountdown(endDate) {
  const diff = new Date(endDate).getTime() - subscriptionNow();
  if (diff <= 0) return "00d 00h 00m 00s";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return `${String(days).padStart(2, "0")}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function formatSubscriptionBannerCountdown(endDate) {
  const diff = getSubscriptionRemainingMs(endDate);
  const totalHours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return `${String(totalHours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function getSubscriptionDaysLeft(endDate) {
  const diff = new Date(endDate).getTime() - subscriptionNow();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getSubscriptionRemainingMs(endDate) {
  return Math.max(0, new Date(endDate).getTime() - subscriptionNow());
}

function getSubscriptionSignedRemainingMs(endDate) {
  return new Date(endDate).getTime() - subscriptionNow();
}

function getSubscriptionSeverity(endDate) {
  const diffMs = getSubscriptionRemainingMs(endDate);
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours <= 6) return "critical";
  if (diffHours <= 48) return "danger";
  return "warning";
}

function formatSubscriptionDisplayDate(dateLike) {
  if (!dateLike) return "--";
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "--";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatSubscriptionShortCountdown(endDate) {
  const diff = getSubscriptionRemainingMs(endDate);
  const totalHours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return `${String(totalHours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function getSubscriptionReminderCopy(daysLeft, severity) {
  if (severity === "expired") {
    return "Your subscription has expired. Renew now to restore uninterrupted access to the portal.";
  }
  if (severity === "critical") {
    return "Final renewal window is running. Renew now to avoid an immediate service interruption.";
  }
  if (severity === "danger") {
    return "Less than 48 hours remain. Please renew now to keep bookings and reports running smoothly.";
  }
  return `Your subscription is in its final ${daysLeft} day(s). A timely renewal will prevent portal interruption.`;
}

// ==========================================================================
// SPA STAGING, FETCH TRACKING & SUBPAGE CSS ISOLATION ENGINE
// ==========================================================================

function installPageFetchTracking() {
  if (isPageFetchTrackingInstalled || typeof window.fetch !== "function") return;

  const originalFetch = window.fetch.bind(window);
  isPageFetchTrackingInstalled = true;

  window.fetch = function trackedPageFetch(input, init) {
    const session = activePageTransitionSession;
    const isSilent = Boolean(init && init.__topLoaderSilent);

    if (!session || isSilent) {
      return originalFetch(input, init);
    }

    session.pendingFetches += 1;
    return Promise.resolve(originalFetch(input, init)).finally(() => {
      session.pendingFetches = Math.max(0, session.pendingFetches - 1);
      session.lastActivityAt = performance.now();
    });
  };
}

/**
 * Tracks global `window` & `document` listeners attached by dynamically loaded
 * subpage scripts so they can be cleanly removed when navigating to a new route,
 * preventing stale handler crashes and duplicate event firing across SPA routes.
 */
function installSubpageListenerTracking() {
  if (isSubpageListenerTrackingInstalled) return;
  isSubpageListenerTrackingInstalled = true;

  [window, document].forEach((target) => {
    const origAdd = target.addEventListener.bind(target);
    const origRemove = target.removeEventListener.bind(target);

    target.addEventListener = function trackedAddEventListener(type, listener, options) {
      if (isCapturingSubpageListeners && typeof listener === "function") {
        activeSubpageGlobalListeners.push({ target, type, listener, options, origRemove });
      }
      return origAdd(type, listener, options);
    };
  });
}

function cleanupSubpageGlobalListeners() {
  while (activeSubpageGlobalListeners.length > 0) {
    const entry = activeSubpageGlobalListeners.pop();
    try {
      entry.origRemove(entry.type, entry.listener, entry.options);
    } catch (e) {}
  }
}

function getLiveContentBox() {
  return (
    document.querySelector(".content-box:not([data-staging-content-box='true'])") ||
    document.getElementById("content-box")
  );
}

function createHiddenPageBuildContainer(liveContainer) {
  if (!(liveContainer instanceof HTMLElement) || !liveContainer.parentElement) {
    return null;
  }

  const rect = liveContainer.getBoundingClientRect();
  const staging = document.createElement("div");
  staging.className = liveContainer.className;
  staging.id = "lf-staging-content-box";
  staging.dataset.stagingContentBox = "true";
  staging.setAttribute("aria-hidden", "true");
  staging.style.position = "fixed";
  staging.style.left = "-200vw";
  staging.style.top = "0";
  const stageWidth = Math.max(200, Math.round(rect.width || liveContainer.offsetWidth || 320));
  staging.style.width = `${stageWidth}px`;
  staging.style.maxWidth = `${stageWidth}px`;
  staging.style.visibility = "hidden";
  staging.style.pointerEvents = "none";
  staging.style.opacity = "0";
  staging.style.zIndex = "-1";
  staging.style.overflow = "hidden";

  liveContainer.parentElement.insertBefore(staging, liveContainer);
  return staging;
}

function destroyHiddenPageBuildContainer(staging) {
  if (staging instanceof HTMLElement) {
    staging.remove();
  }
}

const BARE_SUBPAGE_TAG_RE =
  /^(?:input|select|textarea|button|label|p|h[1-6]|table|thead|tbody|tfoot|tr|th|td|ul|ol|li|a|header|footer|main|section|form)(?=$|[\s>+~.:#\[])/i;

function splitTopLevelCssSelectors(selectorText) {
  const parts = [];
  let depthParen = 0;
  let depthBracket = 0;
  let quote = null;
  let start = 0;

  for (let i = 0; i < selectorText.length; i++) {
    const ch = selectorText[i];
    if (quote) {
      if (ch === "\\" && i + 1 < selectorText.length) {
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(") {
      depthParen += 1;
    } else if (ch === ")") {
      depthParen = Math.max(0, depthParen - 1);
    } else if (ch === "[") {
      depthBracket += 1;
    } else if (ch === "]") {
      depthBracket = Math.max(0, depthBracket - 1);
    } else if (ch === "," && depthParen === 0 && depthBracket === 0) {
      parts.push(selectorText.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(selectorText.slice(start));
  return parts;
}

function rewriteSubpageSelector(rawSel) {
  const trimmed = rawSel.trim();
  if (!trimmed) return rawSel;

  if (trimmed.includes("#content-box") || trimmed.includes(".spa-page-canvas")) {
    return trimmed;
  }

  // Leave `body:has(...)` shell hooks intact
  if (/^(?:html|body)\s*:/i.test(trimmed)) {
    return trimmed;
  }

  // Use `:where(...)` (zero specificity) so FontAwesome, Tailwind & subpage classes are never overridden
  if (trimmed === "*") {
    return ":where(.content-box .spa-page-canvas), :where(.content-box .spa-page-canvas) *";
  }

  if (/^\*::?(?:before|after)$/i.test(trimmed) || /^\*\s+[>+~]/.test(trimmed)) {
    return `:where(.content-box .spa-page-canvas) ${trimmed}`;
  }

  if (/^(?:html|body)$/i.test(trimmed)) {
    return ":where(.content-box .spa-page-canvas)";
  }

  if (/^body[\s>+~]/i.test(trimmed)) {
    return `:where(.content-box .spa-page-canvas)${trimmed.slice(4)}`;
  }

  if (BARE_SUBPAGE_TAG_RE.test(trimmed)) {
    return `:where(.content-box .spa-page-canvas) ${trimmed}`;
  }

  return trimmed;
}

function scopeSubpageCssText(css) {
  let out = "";
  let i = 0;
  const len = css.length;

  while (i < len) {
    if (css[i] === "/" && css[i + 1] === "*") {
      const endComment = css.indexOf("*/", i + 2);
      if (endComment === -1) {
        out += css.slice(i);
        break;
      }
      out += css.slice(i, endComment + 2);
      i = endComment + 2;
      continue;
    }

    if (/\s/.test(css[i])) {
      out += css[i];
      i += 1;
      continue;
    }

    let j = i;
    let quote = null;
    while (j < len) {
      const ch = css[j];
      if (quote) {
        if (ch === "\\" && j + 1 < len) j += 1;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === "/" && css[j + 1] === "*") {
        const endC = css.indexOf("*/", j + 2);
        if (endC === -1) {
          j = len;
          break;
        }
        j = endC + 1;
      } else if (ch === "{" || ch === ";" || ch === "}") {
        break;
      }
      j += 1;
    }

    if (j >= len) {
      out += css.slice(i);
      break;
    }

    const token = css[j];
    const header = css.slice(i, j);

    if (token === ";" || token === "}") {
      out += header + token;
      i = j + 1;
      continue;
    }

    let depth = 1;
    let k = j + 1;
    quote = null;
    while (k < len && depth > 0) {
      const ch = css[k];
      if (quote) {
        if (ch === "\\" && k + 1 < len) k += 1;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === "/" && css[k + 1] === "*") {
        const endC = css.indexOf("*/", k + 2);
        if (endC === -1) {
          k = len;
          break;
        }
        k = endC + 1;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
      }
      k += 1;
    }

    const innerBlock = css.slice(j + 1, k - 1);
    const trimmedHeader = header.trim();

    if (
      /^@(?:-webkit-|-moz-|-o-)?keyframes\b/i.test(trimmedHeader) ||
      /^@media\s+print\b/i.test(trimmedHeader) ||
      /^@font-face\b/i.test(trimmedHeader) ||
      /^@page\b/i.test(trimmedHeader)
    ) {
      out += header + "{" + innerBlock + "}";
    } else if (trimmedHeader.startsWith("@")) {
      out += header + "{" + scopeSubpageCssText(innerBlock) + "}";
    } else {
      const cleanHeader = header.replace(/\/\*[\s\S]*?\*\//g, "");
      const rewritten = splitTopLevelCssSelectors(cleanHeader)
        .map(rewriteSubpageSelector)
        .join(", ");
      out += rewritten + " {" + innerBlock + "}";
    }

    i = k;
  }

  return out;
}

/**
 * Intelligent Subpage Dark-Mode CSS Synthesizer & Contrast Engine.
 * Compiles companion `html[data-theme="dark"]` rules directly from each subpage's
 * scoped `<style>` blocks so all 120+ clinical subpages render with soft slate-navy
 * surfaces and guaranteed WCAG-readable text — while keeping literal A4 PDF/print
 * report paper containers true white.
 */
const PRINT_PAPER_PAGES = new Set([
  "reportFormat",
  "reportFormat1",
  "reportFormat3",
  "reportFormat4",
  "invoice",
  "generatecertificate"
]);

const PAPER_SELECTOR_RE =
  /\.(?:container-pdf|ps-a4-sheet|ps-a4-body|ps-a4-letterhead-overlay|a4-page|print-sheet)\b/i;

const NAMED_CSS_COLORS = {
  white: [255, 255, 255, 1],
  whitesmoke: [245, 245, 245, 1],
  snow: [255, 250, 250, 1],
  ghostwhite: [248, 248, 255, 1],
  aliceblue: [240, 248, 255, 1],
  floralwhite: [255, 250, 240, 1],
  ivory: [255, 255, 240, 1],
  azure: [240, 255, 255, 1],
  mintcream: [245, 255, 250, 1],
  honeydew: [240, 255, 240, 1],
  lavenderblush: [255, 240, 245, 1],
  seashell: [255, 245, 238, 1],
  linen: [250, 240, 230, 1],
  beige: [245, 245, 220, 1],
  gainsboro: [220, 220, 220, 1],
  lightgray: [211, 211, 211, 1],
  lightgrey: [211, 211, 211, 1],
  silver: [192, 192, 192, 1],
  darkgray: [169, 169, 169, 1],
  darkgrey: [169, 169, 169, 1],
  gray: [128, 128, 128, 1],
  grey: [128, 128, 128, 1],
  dimgray: [105, 105, 105, 1],
  dimgrey: [105, 105, 105, 1],
  slategray: [112, 128, 144, 1],
  slategrey: [112, 128, 144, 1],
  darkslategray: [47, 79, 79, 1],
  darkslategrey: [47, 79, 79, 1],
  black: [0, 0, 0, 1],
  navy: [0, 0, 128, 1],
  darkblue: [0, 0, 139, 1],
  darkgreen: [0, 100, 0, 1],
  maroon: [128, 0, 0, 1],
  darkred: [139, 0, 0, 1],
  indigo: [75, 0, 130, 1],
  purple: [128, 0, 128, 1],
  brown: [165, 42, 42, 1]
};

function rgbToHslMetrics(r, g, b, a = 1) {
  const rn = Math.min(255, Math.max(0, r)) / 255;
  const gn = Math.min(255, Math.max(0, g)) / 255;
  const bn = Math.min(255, Math.max(0, b)) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        break;
      case gn:
        h = ((bn - rn) / d + 2) * 60;
        break;
      default:
        h = ((rn - gn) / d + 4) * 60;
        break;
    }
  }

  return { r, g, b, a: Math.min(1, Math.max(0, a)), h, s, l, chroma: d };
}

function parseCssColor(raw) {
  if (!raw) return null;
  const str = String(raw).trim().toLowerCase();
  if (!str || str === "transparent" || str === "inherit" || str === "currentcolor" || str === "none" || str === "initial" || str === "unset") {
    return null;
  }

  if (NAMED_CSS_COLORS[str]) {
    const [r, g, b, a] = NAMED_CSS_COLORS[str];
    return rgbToHslMetrics(r, g, b, a);
  }

  if (str[0] === "#") {
    const hex = str.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      if ([r, g, b, a].some(Number.isNaN)) return null;
      return rgbToHslMetrics(r, g, b, a);
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b, a].some(Number.isNaN)) return null;
      return rgbToHslMetrics(r, g, b, a);
    }
    return null;
  }

  const rgbMatch = str.match(/^rgba?\(\s*([0-9.]+)\s*[,\s]\s*([0-9.]+)\s*[,\s]\s*([0-9.]+)(?:\s*[,/]\s*([0-9.%]+))?\s*\)$/);
  if (rgbMatch) {
    const r = parseFloat(rgbMatch[1]);
    const g = parseFloat(rgbMatch[2]);
    const b = parseFloat(rgbMatch[3]);
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      a = rgbMatch[4].endsWith("%") ? parseFloat(rgbMatch[4]) / 100 : parseFloat(rgbMatch[4]);
    }
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return rgbToHslMetrics(r, g, b, a);
  }

  const hslMatch = str.match(/^hsla?\(\s*([0-9.]+)(?:deg)?\s*[,\s]\s*([0-9.]+)%\s*[,\s]\s*([0-9.]+)%(?:\s*[,/]\s*([0-9.%]+))?\s*\)$/);
  if (hslMatch) {
    const h = ((parseFloat(hslMatch[1]) % 360) + 360) % 360;
    const s = Math.min(100, Math.max(0, parseFloat(hslMatch[2]))) / 100;
    const l = Math.min(100, Math.max(0, parseFloat(hslMatch[3]))) / 100;
    let a = 1;
    if (hslMatch[4] !== undefined) {
      a = hslMatch[4].endsWith("%") ? parseFloat(hslMatch[4]) / 100 : parseFloat(hslMatch[4]);
    }
    if ([h, s, l, a].some(Number.isNaN)) return null;
    const chroma = s * (1 - Math.abs(2 * l - 1));
    return { r: 0, g: 0, b: 0, a, h, s, l, chroma };
  }

  return null;
}

function remapSurfaceColorForDark(rawColor) {
  const c = parseCssColor(rawColor);
  if (!c) return null;

  const chroma = c.chroma !== undefined ? c.chroma : c.s * (1 - Math.abs(2 * c.l - 1));

  // Translucent white decorative glass overlays (e.g. rgba(255,255,255,0.34) circles on KPI cards)
  // Tone down alpha so they remain whisper-subtle glass highlights instead of milky grey circles!
  if (c.a >= 0.10 && c.a < 0.42) {
    if (c.l >= 0.90 && chroma <= 0.16) {
      return "rgba(255, 255, 255, 0.045)";
    }
    return null;
  }

  if (c.a < 0.42) return null;

  const alphaStr = Number(c.a.toFixed(3));

  // Pure white & ultra-light cream/off-white cards (#ffffff, #fffaf5, #fff7ed, #fcf9f2, #fffef5) -> Elevated Soft Slate (#1b263b)
  if (c.l >= 0.935 && chroma <= 0.15) {
    return c.a < 0.99 ? `rgba(27, 38, 59, ${alphaStr})` : "#1b263b";
  }

  // Subtle off-white / light-grey panels, table headers, hover fills -> Secondary Slate (#22304a)
  if (c.l >= 0.83 && c.l < 0.935 && chroma <= 0.15) {
    return c.a < 0.99 ? `rgba(34, 48, 74, ${alphaStr})` : "#22304a";
  }

  // True pastel status / KPI tint backgrounds (#e0f2fe, #dcfce7, #ffe4d6, #e8ddff)
  // Preserve original Hue while shifting into a calm, refined slate-harmonized dark tint!
  if (c.l >= 0.78 && chroma > 0.15) {
    const sat = Math.min(34, Math.max(22, Math.round(c.s * 36)));
    return c.a < 0.99
      ? `hsla(${Math.round(c.h)}, ${sat}%, 19%, ${alphaStr})`
      : `hsl(${Math.round(c.h)}, ${sat}%, 19%)`;
  }

  return null;
}

function remapTextColorForDark(rawColor) {
  const c = parseCssColor(rawColor);
  if (!c || c.a < 0.35) return null;
  if (c.l >= 0.65) return null; // Already light text

  // Dark/medium saturated accent text (#166534, #0369a1, #1d4ed8, #dc2626, #92400e, #4338ca)
  if (c.s >= 0.28 && c.l < 0.57) {
    const sat = Math.min(92, Math.max(66, Math.round(c.s * 100)));
    return `hsl(${Math.round(c.h)}, ${sat}%, 74%)`;
  }

  // Near-black / dark headings & values
  if (c.l <= 0.26) return "#f1f5f9";
  // Medium-dark labels & body copy
  if (c.l <= 0.44) return "#d3deeb";
  // Muted captions & secondary copy
  return "#9db0c9";
}

function remapBorderColorForDark(rawColor) {
  const c = parseCssColor(rawColor);
  if (!c || c.a < 0.2) return null;

  if (c.l >= 0.72 && c.s <= 0.30) {
    return "#2c3d59";
  }
  if (c.l >= 0.70 && c.s > 0.30) {
    return `hsla(${Math.round(c.h)}, 46%, 44%, 0.45)`;
  }
  return null;
}

const COLOR_TOKEN_IN_VALUE_RE =
  /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\([^)]+\)|hsla?\([^)]+\)|\b(?:white|whitesmoke|snow|ghostwhite|aliceblue|gainsboro|lightgray|lightgrey|black)\b/gi;

function remapBackgroundValueForDark(rawVal) {
  const trimmed = rawVal.trim();
  const single = remapSurfaceColorForDark(trimmed);
  if (single) return single;

  // Handle linear/radial gradients only when ALL color stops are light (>= 0.80 lightness)
  if (/gradient\s*\(/i.test(trimmed)) {
    const tokens = trimmed.match(COLOR_TOKEN_IN_VALUE_RE) || [];
    if (tokens.length > 0) {
      const parsed = tokens.map(parseCssColor).filter(Boolean);
      if (parsed.length === tokens.length && parsed.every((p) => p.l >= 0.80 || p.a < 0.25)) {
        return trimmed.replace(COLOR_TOKEN_IN_VALUE_RE, (match) => {
          return remapSurfaceColorForDark(match) || match;
        });
      }
    }
    return null;
  }

  // Handle shorthand `background: #ffffff url(...)`
  if (!trimmed.includes("(")) {
    let changed = false;
    const replaced = trimmed.replace(COLOR_TOKEN_IN_VALUE_RE, (match) => {
      const next = remapSurfaceColorForDark(match);
      if (next) {
        changed = true;
        return next;
      }
      return match;
    });
    return changed ? replaced : null;
  }

  return null;
}

function remapBorderShorthandForDark(rawVal) {
  let changed = false;
  const replaced = rawVal.replace(COLOR_TOKEN_IN_VALUE_RE, (match) => {
    const next = remapBorderColorForDark(match);
    if (next) {
      changed = true;
      return next;
    }
    return match;
  });
  return changed ? replaced : null;
}

function splitCssDeclarations(blockText) {
  const decls = [];
  let depth = 0;
  let quote = null;
  let start = 0;

  for (let i = 0; i < blockText.length; i++) {
    const ch = blockText[i];
    if (quote) {
      if (ch === "\\" && i + 1 < blockText.length) i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      decls.push(blockText.slice(start, i));
      start = i + 1;
    }
  }
  if (start < blockText.length) {
    decls.push(blockText.slice(start));
  }
  return decls;
}

function prefixSelectorForDarkTheme(rawSel) {
  const trimmed = rawSel.trim();
  if (!trimmed) return "";
  if (PAPER_SELECTOR_RE.test(trimmed)) return "";
  if (trimmed.includes('data-theme="dark"')) return trimmed;
  if (trimmed === ":root") return 'html[data-theme="dark"] .spa-page-canvas, html[data-theme="dark"]';
  if (trimmed.startsWith(":where(")) {
    return `:where(html[data-theme="dark"]) ${trimmed}`;
  }
  return `html[data-theme="dark"] ${trimmed}`;
}

function resolveCssVarReference(rawVal, varColorMap) {
  if (!rawVal || !varColorMap) return rawVal;
  const m = rawVal.trim().match(/^var\(\s*(--[a-zA-Z0-9_-]+)(?:\s*,\s*([^)]+))?\s*\)$/);
  if (!m) return rawVal;
  const varName = m[1];
  if (varColorMap.has(varName)) {
    return varColorMap.get(varName);
  }
  return m[2] ? m[2].trim() : rawVal;
}

function synthesizeDarkDeclarationsForBlock(innerBlock, varColorMap) {
  const rawDecls = splitCssDeclarations(innerBlock);
  const parsedDecls = [];
  let ruleHasUntouchedBrightBg = false;

  for (const raw of rawDecls) {
    const cleaned = raw.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (!cleaned) continue;
    const colonIdx = cleaned.indexOf(":");
    if (colonIdx <= 0) continue;

    const prop = cleaned.slice(0, colonIdx).trim();
    let val = cleaned.slice(colonIdx + 1).trim();
    let important = false;
    if (/!important\s*$/i.test(val)) {
      important = true;
      val = val.replace(/\s*!important\s*$/i, "").trim();
    }

    parsedDecls.push({ prop, propLower: prop.toLowerCase(), val, important });
  }

  const outDecls = [];

  // Pass 1: Background & custom variables & borders
  for (const d of parsedDecls) {
    const { prop, propLower, val, important } = d;
    const impSuffix = important ? " !important" : "";

    if (prop.startsWith("--")) {
      if (varColorMap) {
        varColorMap.set(prop, val);
      }
      let nextVar = null;
      if (/(?:text|fg|ink|heading|title|label|muted|sub)/i.test(prop)) {
        nextVar = remapTextColorForDark(val);
      } else if (/(?:border|line|divider|stroke)/i.test(prop)) {
        nextVar = remapBorderColorForDark(val);
      } else if (/shadow/i.test(prop)) {
        if (/rgba?\(/i.test(val)) {
          nextVar = "0 10px 28px rgba(2, 6, 23, 0.38)";
        }
      } else if (/(?:bg|card|surface|panel|light|fill|canvas|base)/i.test(prop)) {
        nextVar = remapBackgroundValueForDark(val);
      }
      if (nextVar) {
        outDecls.push(`${prop}: ${nextVar}${impSuffix}`);
        if (varColorMap) {
          varColorMap.set(`${prop}__darkRemapped`, nextVar);
        }
      }
      continue;
    }

    if (propLower === "background" || propLower === "background-color") {
      const nextBg = remapBackgroundValueForDark(val);
      if (nextBg) {
        outDecls.push(`${propLower}: ${nextBg}${impSuffix}`);
      } else {
        const varMatch = val.trim().match(/^var\(\s*(--[a-zA-Z0-9_-]+)/);
        const wasVarDarkRemapped = varMatch && varColorMap?.has(`${varMatch[1]}__darkRemapped`);
        if (!wasVarDarkRemapped) {
          const resolvedBg = resolveCssVarReference(val, varColorMap);
          const directColor = parseCssColor(resolvedBg);
          if (directColor && directColor.a >= 0.5 && directColor.l >= 0.48) {
            // Bright saturated button/badge surface (e.g. #fbbf24 yellow) kept as-is -> keep dark text!
            ruleHasUntouchedBrightBg = true;
          }
        }
      }
      continue;
    }

    if (
      propLower === "border" ||
      propLower === "border-top" ||
      propLower === "border-right" ||
      propLower === "border-bottom" ||
      propLower === "border-left" ||
      propLower === "border-color" ||
      propLower === "border-top-color" ||
      propLower === "border-right-color" ||
      propLower === "border-bottom-color" ||
      propLower === "border-left-color" ||
      propLower === "outline-color"
    ) {
      const nextBorder = propLower.endsWith("color")
        ? remapBorderColorForDark(val) || remapBorderShorthandForDark(val)
        : remapBorderShorthandForDark(val);
      if (nextBorder) {
        outDecls.push(`${propLower}: ${nextBorder}${impSuffix}`);
      }
    }
  }

  // Pass 2: Foreground text `color` (including `var(--brand)` references, respecting bright-surface invariant!)
  if (!ruleHasUntouchedBrightBg) {
    for (const d of parsedDecls) {
      if (d.propLower === "color") {
        const varMatch = d.val.trim().match(/^var\(\s*(--[a-zA-Z0-9_-]+)/);
        if (varMatch && varColorMap?.has(`${varMatch[1]}__darkRemapped`)) {
          // Already remapped at the CSS variable declaration level
          continue;
        }
        const resolvedColor = resolveCssVarReference(d.val, varColorMap);
        const nextColor = remapTextColorForDark(resolvedColor);
        if (nextColor) {
          outDecls.push(`color: ${nextColor}${d.important ? " !important" : ""}`);
        }
      }
    }
  }

  return outDecls;
}

function synthesizeSubpageDarkCss(scopedCss, pageName, sharedVarMap = null) {
  if (!scopedCss || PRINT_PAPER_PAGES.has(pageName)) return "";
  const varColorMap = sharedVarMap || new Map();

  let darkOut = "";
  let i = 0;
  const len = scopedCss.length;

  while (i < len) {
    if (scopedCss[i] === "/" && scopedCss[i + 1] === "*") {
      const endComment = scopedCss.indexOf("*/", i + 2);
      if (endComment === -1) break;
      i = endComment + 2;
      continue;
    }

    if (/\s/.test(scopedCss[i])) {
      i += 1;
      continue;
    }

    let j = i;
    let quote = null;
    while (j < len) {
      const ch = scopedCss[j];
      if (quote) {
        if (ch === "\\" && j + 1 < len) j += 1;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === "/" && scopedCss[j + 1] === "*") {
        const endC = scopedCss.indexOf("*/", j + 2);
        if (endC === -1) {
          j = len;
          break;
        }
        j = endC + 1;
      } else if (ch === "{" || ch === ";" || ch === "}") {
        break;
      }
      j += 1;
    }

    if (j >= len) break;

    const token = scopedCss[j];
    const header = scopedCss.slice(i, j);

    if (token === ";" || token === "}") {
      i = j + 1;
      continue;
    }

    let depth = 1;
    let k = j + 1;
    quote = null;
    while (k < len && depth > 0) {
      const ch = scopedCss[k];
      if (quote) {
        if (ch === "\\" && k + 1 < len) k += 1;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === "/" && scopedCss[k + 1] === "*") {
        const endC = scopedCss.indexOf("*/", k + 2);
        if (endC === -1) {
          k = len;
          break;
        }
        k = endC + 1;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
      }
      k += 1;
    }

    const innerBlock = scopedCss.slice(j + 1, k - 1);
    const trimmedHeader = header.trim();

    if (
      /^@(?:-webkit-|-moz-|-o-)?keyframes\b/i.test(trimmedHeader) ||
      /^@media\s+print\b/i.test(trimmedHeader) ||
      /^@font-face\b/i.test(trimmedHeader) ||
      /^@page\b/i.test(trimmedHeader)
    ) {
      // Skip print and keyframe blocks
    } else if (trimmedHeader.startsWith("@")) {
      const nested = synthesizeSubpageDarkCss(innerBlock, pageName, varColorMap);
      if (nested) {
        darkOut += `${trimmedHeader} {\n${nested}}\n`;
      }
    } else {
      const cleanHeader = header.replace(/\/\*[\s\S]*?\*\//g, "");
      const darkSelectors = splitTopLevelCssSelectors(cleanHeader)
        .map(prefixSelectorForDarkTheme)
        .filter(Boolean);

      if (darkSelectors.length > 0) {
        const darkDecls = synthesizeDarkDeclarationsForBlock(innerBlock, varColorMap);
        if (darkDecls.length > 0) {
          darkOut += `${darkSelectors.join(", ")} { ${darkDecls.join("; ")}; }\n`;
        }
      }
    }

    i = k;
  }

  return darkOut;
}

/**
 * Prevents subpage <style> tags (such as `* { color: #333 }` in labreport.html,
 * bare `button`/`input`/`p` rules, or `body { background: ... }`) from leaking
 * onto the Admin Shell sidebar, topbar, command palette, or popovers, AND
 * appends synthesized `html[data-theme="dark"]` companion rules.
 */
function scopeSubpageStyles(canvas, pageName = "") {
  if (!(canvas instanceof HTMLElement)) return;

  canvas.querySelectorAll("style").forEach((styleEl) => {
    const css = styleEl.textContent;
    if (!css) return;

    const scoped = scopeSubpageCssText(css);
    const darkCompanion = synthesizeSubpageDarkCss(scoped, pageName);
    const combined = darkCompanion ? `${scoped}\n/* LabFlow Auto-Dark Companion */\n${darkCompanion}` : scoped;

    if (combined !== css) {
      styleEl.textContent = combined;
    }
  });
}

/**
 * Extracts safe typography/color utility classes from `<body class="...">` of full-HTML
 * subpages while stripping layout-breaking classes (`min-h-screen`, `h-screen`, `p-6`, etc.).
 */
function extractSafeBodyClasses(rawHtml) {
  const bodyMatch = String(rawHtml || "").match(/<body[^>]*\bclass\s*=\s*["']([^"']+)["']/i);
  if (!bodyMatch || !bodyMatch[1]) return [];

  const ignored = /^(min-h-screen|h-screen|w-screen|p-\d+|px-\d+|py-\d+|pt-\d+|pb-\d+|pl-\d+|pr-\d+|m-\d+|bg-gray-\d+|bg-slate-\d+)$/;
  return bodyMatch[1]
    .split(/\s+/)
    .map((cls) => cls.trim())
    .filter((cls) => cls && !ignored.test(cls));
}

function mountNormalizedSubpage(stagingContainer, rawHtml, pageName) {
  const canvas = document.createElement("div");
  canvas.className = "spa-page-canvas";
  canvas.dataset.spaPage = pageName;

  const extraClasses = extractSafeBodyClasses(rawHtml);
  extraClasses.forEach((cls) => canvas.classList.add(cls));

  canvas.innerHTML = rawHtml;
  scopeSubpageStyles(canvas, pageName);

  // Remove any stale body-mounted modals from previous navigations that share an ID with incoming elements
  canvas.querySelectorAll("[id]").forEach((incomingNode) => {
    const id = incomingNode.id;
    if (!id) return;
    document.querySelectorAll(`body > [id="${CSS.escape(id)}"]`).forEach((staleNode) => {
      if (
        staleNode.id !== "subscriptionModal" &&
        staleNode.id !== "lfCommandModal" &&
        staleNode.id !== "lfAppShell" &&
        staleNode.id !== "app-top-loader" &&
        staleNode.id !== "subscription-alert-portal"
      ) {
        staleNode.remove();
      }
    });
  });

  stagingContainer.innerHTML = "";
  stagingContainer.appendChild(canvas);
}

function swapBuiltPageIntoLiveContainer(staging, liveContainer) {
  if (!(staging instanceof HTMLElement) || !(liveContainer instanceof HTMLElement)) {
    return;
  }

  liveContainer.innerHTML = "";
  liveContainer.classList.remove("reference-modal-active");

  const fragment = document.createDocumentFragment();
  while (staging.firstChild) {
    fragment.appendChild(staging.firstChild);
  }
  liveContainer.appendChild(fragment);
}

function waitForAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForPageStability(container, session, options = {}) {
  const quietWindowMs = options.quietWindowMs || 220;
  const timeoutMs = options.timeoutMs || 12000;
  const startedAt = performance.now();
  let lastMutationAt = performance.now();

  const observer = new MutationObserver(() => {
    lastMutationAt = performance.now();
    if (session) {
      session.lastActivityAt = lastMutationAt;
    }
  });

  if (container instanceof HTMLElement) {
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
  }

  try {
    while (performance.now() - startedAt < timeoutMs) {
      await waitForAnimationFrame();
      await waitForAnimationFrame();

      const now = performance.now();
      const noPendingFetches = !session || session.pendingFetches === 0;
      const domQuiet = now - lastMutationAt >= quietWindowMs;

      if (noPendingFetches && domQuiet) {
        await waitForAnimationFrame();
        return true;
      }
    }
  } finally {
    observer.disconnect();
  }

  return false;
}

// ==========================================================================
// SUBSCRIPTION ALERT PORTAL POSITIONING & RENDERING
// ==========================================================================

function positionSubscriptionBanner() {
  if (!document.body.classList.contains("has-subscription-banner")) return;
  const container = document.querySelector(".content-box:not([data-staging-content-box='true'])") || document.getElementById("content-box");
  const portal = document.getElementById("subscription-alert-portal");
  if (!container || !portal) return;

  const topbar = document.getElementById("top-navbar");
  const rect = container.getBoundingClientRect();
  const computed = window.getComputedStyle(container);
  const leftInset = parseFloat(computed.paddingLeft) || 0;
  const rightInset = parseFloat(computed.paddingRight) || 0;
  const rawUsableWidth = Math.max(280, rect.width - leftInset - rightInset);
  const usableWidth = Math.min(rawUsableWidth, 1680);
  const centerX = rect.left + (rect.width / 2);
  const topbarHeight = topbar?.getBoundingClientRect?.().height || 64;
  const nextTop = Math.max(12, topbarHeight + 12);
  const hasStableRect = rect.width >= 280 && rect.height > 0;
  const isCenterWithinViewport = centerX >= (usableWidth / 2) - 4 && centerX <= (window.innerWidth - (usableWidth / 2) + 4);

  if (!hasStableRect || !isCenterWithinViewport) {
    if (subscriptionBannerLastLayout) {
      portal.style.left = subscriptionBannerLastLayout.left;
      portal.style.width = subscriptionBannerLastLayout.width;
      portal.style.top = subscriptionBannerLastLayout.top;
      portal.style.transform = "translateX(-50%)";
    }
    return;
  }

  subscriptionBannerLastLayout = {
    left: `${Math.max(0, centerX)}px`,
    width: `${Math.max(280, usableWidth)}px`,
    top: `${nextTop}px`
  };

  portal.style.left = subscriptionBannerLastLayout.left;
  portal.style.width = subscriptionBannerLastLayout.width;
  portal.style.top = subscriptionBannerLastLayout.top;
  portal.style.transform = "translateX(-50%)";
}

function syncSubscriptionBannerPosition(frames = 8) {
  let remainingFrames = Math.max(1, frames);

  const updatePosition = () => {
    positionSubscriptionBanner();
    remainingFrames -= 1;
    if (remainingFrames > 0) {
      requestAnimationFrame(updatePosition);
    }
  };

  requestAnimationFrame(updatePosition);
}

function installSubscriptionBannerPositionTracking() {
  if (subscriptionBannerPositionObserversInstalled) return;

  const contentBox = getLiveContentBox();
  const topbar = document.getElementById("top-navbar");
  if (!contentBox) return;

  subscriptionBannerPositionObserversInstalled = true;

  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(() => {
      syncSubscriptionBannerPosition(6);
    });

    resizeObserver.observe(contentBox);
    if (topbar) {
      resizeObserver.observe(topbar);
    }
  }

  contentBox.addEventListener("transitionend", () => syncSubscriptionBannerPosition(6));
  window.addEventListener("scroll", positionSubscriptionBanner, { passive: true });
}

function setSubscriptionBannerExpanded(isExpanded) {
  subscriptionBannerExpanded = Boolean(isExpanded);
  const bar = document.querySelector("#subscription-alert-portal #subscription-alert-bar");
  const toggleButton = document.querySelector("#subscription-alert-expand");
  if (!bar) return;

  bar.classList.toggle("is-expanded", subscriptionBannerExpanded);
  if (toggleButton) {
    toggleButton.setAttribute("aria-expanded", subscriptionBannerExpanded ? "true" : "false");
    toggleButton.innerHTML = subscriptionBannerExpanded
      ? `<span>Hide</span>
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
           <path d="m18 15-6-6-6 6"></path>
         </svg>`
      : `<span>Details</span>
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
           <path d="m6 9 6 6 6-6"></path>
         </svg>`;
  }
}

function ensureSubscriptionBannerShell() {
  const container = document.getElementById("content-box");
  if (!container || !document.body) return null;

  if (!document.getElementById("subscription-alert-style")) {
    const style = document.createElement("style");
    style.id = "subscription-alert-style";
    style.textContent = `
      .subscription-alert-portal {
        position: fixed;
        top: 0;
        z-index: 1090;
        pointer-events: none;
        max-width: calc(100vw - 24px);
        overflow: visible;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        font-family: var(--lf-font-sans, "Manrope", "Segoe UI", sans-serif);
      }
      .subscription-alert-bar {
        display: none;
        pointer-events: auto;
        position: relative;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        margin: 0 auto;
        border-radius: 16px;
        overflow: hidden;
        color: #17324d;
        background: linear-gradient(135deg, rgba(255, 249, 224, 0.98), rgba(255, 236, 179, 0.96));
        border: 1px solid rgba(227, 159, 28, 0.65);
        box-shadow: 0 14px 36px rgba(168, 112, 7, 0.16), inset 0 1px 0 rgba(255,255,255,0.8);
        backdrop-filter: blur(16px);
        transform: translateY(-8px) scale(0.99);
        opacity: 0;
        min-height: 66px;
        max-height: 66px;
        transition: opacity 0.24s ease, transform 0.24s ease, max-height 0.26s ease;
      }
      .subscription-alert-bar.is-dismissing {
        opacity: 0 !important;
        transform: translate3d(var(--dismiss-x, 0), var(--dismiss-y, 0), 0) scale(0.9) !important;
      }
      .subscription-alert-bar.is-visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .subscription-alert-bar.is-expanded {
        max-height: min(78vh, 520px);
      }
      .subscription-alert-bar[data-severity="danger"] {
        border-color: rgba(241, 142, 88, 0.8);
        background: linear-gradient(135deg, rgba(255, 242, 232, 0.99), rgba(255, 214, 184, 0.96));
      }
      .subscription-alert-bar[data-severity="critical"] {
        border-color: rgba(230, 93, 93, 0.85);
        background: linear-gradient(135deg, rgba(255, 238, 238, 0.99), rgba(255, 204, 204, 0.96));
      }
      .subscription-alert-shell {
        position: relative;
        z-index: 1;
        display: grid;
        width: 100%;
      }
      .subscription-alert-summary {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        min-height: 66px;
        padding: 10px 16px;
        min-width: 0;
      }
      .subscription-alert-head {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .subscription-alert-titleWrap {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .subscription-alert-icon {
        width: 38px;
        height: 38px;
        flex: 0 0 38px;
        border-radius: 11px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(255,255,255,0.94);
        border: 1px solid rgba(211, 222, 237, 0.95);
      }
      .subscription-alert-icon svg {
        width: 20px;
        height: 20px;
        color: #b87a16;
      }
      .subscription-alert-bar[data-severity="danger"] .subscription-alert-icon svg { color: #c46232; }
      .subscription-alert-bar[data-severity="critical"] .subscription-alert-icon svg { color: #c14444; }
      .subscription-alert-summaryMain {
        min-width: 0;
        display: grid;
        gap: 2px;
      }
      .subscription-alert-kicker {
        font-size: 13px;
        font-weight: 800;
        color: #8e5700;
        font-variant-numeric: tabular-nums;
      }
      .subscription-alert-kicker.is-expired { color: #c14444 !important; }
      .subscription-alert-heading {
        font-size: 13.5px;
        font-weight: 700;
        color: #12304b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .subscription-alert-scroll {
        min-width: 0;
        width: 100%;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .subscription-alert-scroll::-webkit-scrollbar { display: none; }
      .subscription-alert-track {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .subscription-alert-inlineChip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 30px;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.78);
        border: 1px solid rgba(214, 162, 44, 0.45);
        white-space: nowrap;
      }
      .subscription-alert-inlineLabel {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #74869b;
      }
      .subscription-alert-inlineValue {
        font-size: 12px;
        font-weight: 700;
        color: #13314b;
      }
      .subscription-alert-actionsInline {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
      }
      .subscription-alert-expand,
      .subscription-alert-close {
        min-width: 36px;
        height: 36px;
        padding: 0 10px;
        border: 0;
        border-radius: 10px;
        background: rgba(255,255,255,0.82);
        color: #475569;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        cursor: pointer;
        box-shadow: inset 0 0 0 1px rgba(203, 213, 225, 0.85);
      }
      .subscription-alert-expand span { font-size: 12px; font-weight: 700; }
      .subscription-alert-expand svg, .subscription-alert-close svg { width: 16px; height: 16px; }
      .subscription-alert-details {
        display: grid;
        gap: 12px;
        padding: 0 16px 16px;
        max-height: calc(min(78vh, 520px) - 80px);
        overflow-y: auto;
      }
      .subscription-alert-bar:not(.is-expanded) .subscription-alert-details { display: none; }
      .subscription-alert-detailsPanel {
        display: grid;
        gap: 12px;
        padding: 16px;
        border-radius: 14px;
        background: rgba(255,255,255,0.92);
        border: 1px solid rgba(208, 220, 234, 0.95);
      }
      .subscription-alert-statusRow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      .subscription-alert-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        font-size: 12px;
        font-weight: 700;
        color: #334155;
      }
      .subscription-alert-pillDot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #d09b31;
      }
      .subscription-alert-timerCard {
        display: grid;
        gap: 6px;
        padding: 14px 16px;
        border-radius: 12px;
        background: #fffbeb;
        border: 1px solid rgba(222, 166, 29, 0.4);
      }
      .subscription-alert-timerLabel {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #87611e;
      }
      .subscription-alert-timerValue {
        font-size: clamp(20px, 2vw, 28px);
        font-weight: 800;
        color: #ac6500;
        font-variant-numeric: tabular-nums;
      }
      .subscription-alert-timerHint { font-size: 12.5px; color: #64748b; }
      .subscription-alert-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .subscription-alert-cta,
      .subscription-alert-secondary {
        min-height: 40px;
        padding: 8px 16px;
        border-radius: 10px;
        border: 0;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }
      .subscription-alert-cta {
        flex: 1 1 200px;
        color: #fff;
        background: #2563eb;
      }
      .subscription-alert-secondary {
        flex: 1 1 180px;
        color: #334155;
        background: #f1f5f9;
        border: 1px solid #cbd5e1;
      }
      .subscription-alert-footerNote { font-size: 12px; color: #64748b; }
      .subscription-alert-contactCard {
        display: grid;
        gap: 8px;
        padding: 12px;
        border-radius: 12px;
        background: #fef2f2;
        border: 1px solid #fecaca;
      }
      .subscription-alert-contactLead { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #b91c1c; }
      .subscription-alert-contactTitle { font-size: 13.5px; font-weight: 700; color: #7f1d1d; }
      .subscription-alert-contactGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .subscription-alert-contactItem { padding: 8px 10px; border-radius: 8px; background: #fff; border: 1px solid #fee2e2; }
      .subscription-alert-contactItemLabel { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #991b1b; }
      .subscription-alert-contactItemValue { font-size: 12.5px; font-weight: 700; color: #450a0a; }
      .subscription-alert-hidden { display: none !important; }
      @media (max-width: 640px) {
        .subscription-alert-expand span { display: none; }
        .subscription-alert-contactGrid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  let portal = document.getElementById("subscription-alert-portal");
  if (portal) return portal.querySelector("#subscription-alert-bar");

  portal = document.createElement("div");
  portal.id = "subscription-alert-portal";
  portal.className = "subscription-alert-portal";
  portal.innerHTML = `
    <div id="subscription-alert-bar" class="subscription-alert-bar" role="status" aria-live="polite">
      <div class="subscription-alert-shell">
        <div class="subscription-alert-summary">
          <div class="subscription-alert-head">
            <div class="subscription-alert-titleWrap">
              <div class="subscription-alert-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 9v4"></path>
                  <path d="M12 17h.01"></path>
                  <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"></path>
                </svg>
              </div>
              <div class="subscription-alert-summaryMain">
                <div class="subscription-alert-kicker" id="subscription-alert-kicker">0 Days Left</div>
                <div class="subscription-alert-heading" id="subscription-alert-heading">Subscription reminder</div>
              </div>
            </div>
          </div>
          <div class="subscription-alert-scroll">
            <div class="subscription-alert-track">
              <span class="subscription-alert-inlineChip subscription-alert-inlineChip--wide">
                <span class="subscription-alert-inlineLabel">Expiry</span>
                <span class="subscription-alert-inlineValue" id="subscription-end-date-inline">--</span>
              </span>
              <span class="subscription-alert-inlineChip subscription-alert-hidden" id="subscription-contact-whatsapp-chip">
                <span class="subscription-alert-inlineLabel">WhatsApp</span>
                <span class="subscription-alert-inlineValue" id="subscription-contact-whatsapp-inline">9520976242</span>
              </span>
              <span class="subscription-alert-inlineChip subscription-alert-hidden" id="subscription-contact-email-chip">
                <span class="subscription-alert-inlineLabel">Email</span>
                <span class="subscription-alert-inlineValue" id="subscription-contact-email-inline">qodex786@gmail.com</span>
              </span>
            </div>
          </div>
          <div class="subscription-alert-actionsInline">
            <button type="button" class="subscription-alert-expand" id="subscription-alert-expand" aria-label="Expand subscription details" aria-expanded="false">
              <span>Details</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="m6 9 6 6 6-6"></path>
              </svg>
            </button>
            <button type="button" class="subscription-alert-close" id="subscription-alert-close" aria-label="Dismiss subscription alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M18 6 6 18"></path>
                <path d="m6 6 12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="subscription-alert-details">
          <div class="subscription-alert-detailsPanel">
            <div class="subscription-alert-statusRow">
              <div class="subscription-alert-pill">
                <span class="subscription-alert-pillDot"></span>
                <span id="subscription-warning-status">0 Days Left</span>
              </div>
              <div class="subscription-alert-pill">
                <span id="subscription-end-date">--</span>
              </div>
            </div>
            <div class="subscription-alert-timerCard">
              <div class="subscription-alert-timerLabel" id="subscription-timer-label">Expiry Overview</div>
              <div class="subscription-alert-timerValue" id="subscription-timer-value">00h 00m 00s</div>
              <div class="subscription-alert-timerHint" id="subscription-alert-subtext"></div>
              <div class="subscription-alert-timerHint" id="subscription-timer-hint"></div>
            </div>
            <div class="subscription-alert-actions">
              <button type="button" class="subscription-alert-cta" id="subscription-recharge-btn">Renew Subscription</button>
              <button type="button" class="subscription-alert-secondary" id="subscription-view-details-btn">Review Status</button>
            </div>
            <div class="subscription-alert-footerNote" id="subscription-alert-footerNote"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(portal);
  installSubscriptionBannerPositionTracking();
  syncSubscriptionBannerPosition(10);

  const dismiss = () => {
    subscriptionBannerDismissed = true;
    hideSubscriptionBanner();
  };

  portal.querySelector("#subscription-recharge-btn")?.addEventListener("click", showSubscriptionModal);
  portal.querySelector("#subscription-view-details-btn")?.addEventListener("click", showSubscriptionModal);
  portal.querySelector("#subscription-alert-close")?.addEventListener("click", dismiss);
  portal.querySelector("#subscription-alert-expand")?.addEventListener("click", () => {
    setSubscriptionBannerExpanded(!subscriptionBannerExpanded);
  });

  return portal.querySelector("#subscription-alert-bar");
}

function hideSubscriptionBanner() {
  const bar = document.querySelector("#subscription-alert-portal #subscription-alert-bar");
  if (bar) {
    bar.style.display = "none";
    bar.classList.remove("is-visible");
  }
  document.body.classList.remove("has-subscription-banner");
  subscriptionBannerExpanded = false;
  if (subscriptionCountdownInterval) {
    clearInterval(subscriptionCountdownInterval);
    subscriptionCountdownInterval = null;
  }
}

function renderSubscriptionBanner(subscription) {
  const bar = ensureSubscriptionBannerShell();
  const endDate = getSubscriptionEffectiveEndDate(subscription);

  if (!bar || !endDate || subscriptionBannerDismissed) {
    hideSubscriptionBanner();
    return;
  }

  const daysLeft = getSubscriptionDaysLeft(endDate);
  const remainingMs = getSubscriptionSignedRemainingMs(endDate);
  const isExpired = remainingMs <= 0 || subscription?.isActive === false;

  if (!isExpired && daysLeft > 7) {
    hideSubscriptionBanner();
    return;
  }

  if (subscriptionCountdownInterval) {
    clearInterval(subscriptionCountdownInterval);
    subscriptionCountdownInterval = null;
  }

  const severity = isExpired ? "expired" : getSubscriptionSeverity(endDate);
  const reminderCopy = getSubscriptionReminderCopy(daysLeft, severity);
  const timerValue = bar.querySelector("#subscription-timer-value");
  const timerLabel = bar.querySelector("#subscription-timer-label");
  const timerHint = bar.querySelector("#subscription-timer-hint");
  const heading = bar.querySelector("#subscription-alert-heading");
  const subtext = bar.querySelector("#subscription-alert-subtext");
  const kicker = bar.querySelector("#subscription-alert-kicker");
  const warningStatus = bar.querySelector("#subscription-warning-status");
  const footerNote = bar.querySelector("#subscription-alert-footerNote");
  const endDateNode = bar.querySelector("#subscription-end-date");
  const endDateInlineNode = bar.querySelector("#subscription-end-date-inline");
  const contactEmailChip = bar.querySelector("#subscription-contact-email-chip");
  const contactWhatsappChip = bar.querySelector("#subscription-contact-whatsapp-chip");

  if (!timerValue || !timerLabel || !timerHint || !heading || !subtext || !kicker || !warningStatus || !footerNote || !endDateNode) {
    return;
  }

  bar.dataset.severity = isExpired ? "critical" : severity;
  endDateNode.textContent = `Expires ${formatSubscriptionDisplayDate(endDate)}`;
  if (endDateInlineNode) endDateInlineNode.textContent = formatSubscriptionDisplayDate(endDate);
  subtext.textContent = reminderCopy;
  kicker.dataset.mode = "countdown";
  kicker.classList.toggle("is-expired", isExpired);
  contactEmailChip?.classList.toggle("subscription-alert-hidden", !isExpired);
  contactWhatsappChip?.classList.toggle("subscription-alert-hidden", !isExpired);

  if (isExpired) {
    heading.textContent = "Subscription has expired";
    warningStatus.textContent = "Expired";
  } else if (severity === "critical") {
    heading.textContent = "Subscription is in its final hours";
    warningStatus.textContent = `${daysLeft} Day(s) Left`;
  } else if (severity === "danger") {
    heading.textContent = "Subscription is about to expire";
    warningStatus.textContent = `${daysLeft} Day(s) Left`;
  } else {
    heading.textContent = "Subscription expiry is approaching";
    warningStatus.textContent = `${daysLeft} Day(s) Left`;
  }

  const paintBannerSummary = () => {
    const remainingDays = getSubscriptionDaysLeft(endDate);
    kicker.textContent = formatSubscriptionBannerCountdown(endDate);
    warningStatus.textContent = `${remainingDays} Day(s) Left`;
  };

  if (isExpired) {
    kicker.textContent = "Your subscription has expired.";
    timerLabel.textContent = "Subscription Expired";
    timerValue.textContent = "Renewal Required";
    timerHint.textContent = "Contact support or upload UPI payment proof to restore access immediately.";
    footerNote.innerHTML = `
      <div class="subscription-alert-contactCard">
        <div class="subscription-alert-contactLead">Immediate Support</div>
        <div class="subscription-alert-contactTitle">Contact for instant renewal</div>
        <div class="subscription-alert-contactGrid">
          <div class="subscription-alert-contactItem">
            <span class="subscription-alert-contactItemLabel">Email</span>
            <span class="subscription-alert-contactItemValue">qodex786@gmail.com</span>
          </div>
          <div class="subscription-alert-contactItem">
            <span class="subscription-alert-contactItemLabel">WhatsApp</span>
            <span class="subscription-alert-contactItemValue">9520976242</span>
          </div>
        </div>
      </div>
    `;
  } else if (getSubscriptionRemainingMs(endDate) <= 48 * 60 * 60 * 1000) {
    const paint = () => {
      paintBannerSummary();
      timerValue.textContent = formatSubscriptionShortCountdown(endDate);
      timerHint.textContent = `Live countdown running until ${formatSubscriptionDisplayDate(endDate)}.`;
    };
    timerLabel.textContent = "Live Countdown";
    footerNote.textContent = "Timer is synchronized with server clock across page reloads.";
    paint();
    subscriptionCountdownInterval = setInterval(paint, 1000);
  } else {
    kicker.textContent = `${daysLeft} Day(s) Left`;
    timerLabel.textContent = "Remaining";
    timerValue.textContent = `${daysLeft} day(s)`;
    timerHint.textContent = `Expiry scheduled for ${formatSubscriptionDisplayDate(endDate)}.`;
    footerNote.textContent = "Timer is synchronized with server clock across page reloads.";
    subscriptionCountdownInterval = setInterval(() => {
      const refreshedDaysLeft = getSubscriptionDaysLeft(endDate);
      kicker.textContent = `${refreshedDaysLeft} Day(s) Left`;
      warningStatus.textContent = `${refreshedDaysLeft} Day(s) Left`;
    }, 60000);
  }

  document.body.classList.add("has-subscription-banner");
  positionSubscriptionBanner();
  bar.style.display = "flex";
  setSubscriptionBannerExpanded(subscriptionBannerExpanded);
  requestAnimationFrame(() => {
    bar.classList.add("is-visible");
  });
  syncSubscriptionBannerPosition(10);
}

async function refreshSubscriptionBanner() {
  try {
    const response = await fetch(`${BASE_URL}/api/v1/user/check-subscription`, {
      method: "POST",
      credentials: "include",
      __topLoaderSilent: true
    });
    syncSubscriptionServerClock(response.headers.get("date"));
    if (!response.ok) return;
    const payload = await response.json();
    renderSubscriptionBanner(payload?.subscription || getPortalSubscriptionState(user));
  } catch (error) {
    console.error("Subscription banner refresh failed:", error);
  }
}

syncAdminGlobals();

// ==========================================================================
// SHELL POPOVERS, SIDEBAR DRAWER & KEYBOARD CONTROLS
// ==========================================================================

function closeAllPopovers(exceptNode = null) {
  const helpPopup = document.getElementById("helpPopup");
  const userPopup = document.getElementById("userPopup");
  const notificationContainer = document.getElementById("notificationContainer");
  const toggleNotifBtn = document.getElementById("toggleNotifications");

  if (helpPopup && helpPopup !== exceptNode) {
    helpPopup.style.display = "none";
  }
  if (userPopup && userPopup !== exceptNode) {
    userPopup.style.display = "none";
  }
  if (notificationContainer && notificationContainer !== exceptNode) {
    notificationContainer.classList.remove("show");
    if (toggleNotifBtn) toggleNotifBtn.setAttribute("aria-expanded", "false");
  }
}

function initPopovers() {
  const helpDiv = document.querySelector(".help-div");
  const mobileHelpBtn = document.getElementById("lfMobileHelpBtn");
  const helpPopup = document.getElementById("helpPopup");
  const closeHelpBtn = document.getElementById("closeHelpBtn");
  const toggleNotifBtn = document.getElementById("toggleNotifications");
  const notificationContainer = document.getElementById("notificationContainer");

  if (helpDiv && helpPopup) {
    helpDiv.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = helpPopup.style.display !== "block";
      closeAllPopovers(helpPopup);
      helpPopup.style.display = willOpen ? "block" : "none";
    });
  }

  if (mobileHelpBtn && helpPopup) {
    mobileHelpBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeMobileSidebar();
      closeAllPopovers(helpPopup);
      helpPopup.style.display = "block";
    });
  }

  if (closeHelpBtn && helpPopup) {
    closeHelpBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      helpPopup.style.display = "none";
    });
  }

  if (toggleNotifBtn && notificationContainer) {
    toggleNotifBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willShow = !notificationContainer.classList.contains("show");
      closeAllPopovers(notificationContainer);
      notificationContainer.classList.toggle("show", willShow);
      toggleNotifBtn.setAttribute("aria-expanded", String(willShow));
      if (willShow) {
        notificationContainer.focus({ preventScroll: true });
      }
    });
  }

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Node)) return;

    if (
      helpPopup &&
      helpPopup.style.display === "block" &&
      !helpPopup.contains(target) &&
      !helpDiv?.contains(target) &&
      !mobileHelpBtn?.contains(target)
    ) {
      helpPopup.style.display = "none";
    }

    if (
      notificationContainer &&
      notificationContainer.classList.contains("show") &&
      !notificationContainer.contains(target) &&
      !toggleNotifBtn?.contains(target)
    ) {
      notificationContainer.classList.remove("show");
      toggleNotifBtn?.setAttribute("aria-expanded", "false");
    }
  });
}

function closeMobileSidebar() {
  if (window.innerWidth > MOBILE_DRAWER_BREAKPOINT) return;
  const sidebar = document.getElementById("left-navbar");
  const mainContent = getLiveContentBox();
  sidebar?.classList.add("hidden");
  mainContent?.classList.add("collapsed");
  document.body.classList.remove("lf-mobile-drawer-open");
  document.getElementById("toggle-div")?.setAttribute("aria-expanded", "false");
}

function syncResponsiveSidebar(forceInit = false) {
  const sidebar = document.getElementById("left-navbar");
  const mainContent = getLiveContentBox();
  if (!sidebar || !mainContent) return;

  const isMobile = window.innerWidth <= MOBILE_DRAWER_BREAKPOINT;
  if (!forceInit && isMobile === lastViewportWasMobile) {
    return;
  }
  lastViewportWasMobile = isMobile;

  const toggleBtn = document.getElementById("toggle-div");

  if (isMobile) {
    sidebar.classList.add("hidden");
    mainContent.classList.add("collapsed");
    document.body.classList.remove("lf-mobile-drawer-open");
    document.body.classList.remove("lf-sidebar-collapsed");
    toggleBtn?.setAttribute("aria-expanded", "false");
  } else {
    sidebar.classList.remove("hidden");
    mainContent.classList.remove("collapsed");
    document.body.classList.remove("lf-mobile-drawer-open");
    document.body.classList.remove("lf-sidebar-collapsed");
    toggleBtn?.setAttribute("aria-expanded", "true");
    document.querySelectorAll("#left-navbar .lf-mobile-only-sub").forEach((sub) => {
      sub.style.display = "none";
    });
  }

  if (document.body.classList.contains("has-subscription-banner")) {
    syncSubscriptionBannerPosition(8);
  }
}

let sidebarResizeTimer = null;

// Toggle sidebar functionality (Desktop collapse & Mobile slide-over drawer)
function toggleSidebar() {
  const sidebar = document.getElementById("left-navbar");
  const mainContent = getLiveContentBox();
  if (!sidebar || !mainContent) return;

  const isMobile = window.innerWidth <= MOBILE_DRAWER_BREAKPOINT;
  const isCurrentlyHidden = sidebar.classList.toggle("hidden");

  const toggleBtn = document.getElementById("toggle-div");
  if (toggleBtn) {
    toggleBtn.setAttribute("aria-expanded", String(!isCurrentlyHidden));
  }

  if (isMobile) {
    mainContent.classList.add("collapsed");
    document.body.classList.toggle("lf-mobile-drawer-open", !isCurrentlyHidden);
  } else {
    mainContent.classList.toggle("collapsed", isCurrentlyHidden);
    document.body.classList.toggle("lf-sidebar-collapsed", isCurrentlyHidden);
    document.body.classList.remove("lf-mobile-drawer-open");
  }

  if (document.body.classList.contains("has-subscription-banner")) {
    syncSubscriptionBannerPosition(24);
  }

  // Dispatch resize after the 380ms GPU cubic-bezier glide finishes so charts/tables
  // never cause a synchronous reflow mid-animation.
  if (sidebarResizeTimer) {
    window.clearTimeout(sidebarResizeTimer);
  }
  sidebarResizeTimer = window.setTimeout(() => {
    sidebarResizeTimer = null;
    window.dispatchEvent(new Event("resize"));
  }, 400);
}

window.toggleSidebar = toggleSidebar;

// ==========================================================================
// ENTERPRISE SOFT DARK / LIGHT THEME ENGINE + MONGODB PERSISTENCE
// ==========================================================================

const THEME_STORAGE_GLOBAL_KEY = "lf_admin_theme";
const THEME_LAST_UID_KEY = "lf_last_uid";
let userInitiatedThemeInSession = false;
let themeTransitionTimer = null;
let themePersistSequence = 0;
let isAdaptingInlineThemeStyles = false;
let inlineThemeObserverScheduled = false;

function normalizeThemeValue(val) {
  return String(val || "").trim().toLowerCase() === "dark" ? "dark" : "light";
}

function getCurrentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function getActiveAccountThemeId(targetUser = user) {
  const rawId = targetUser?._id || "";
  if (rawId) return String(rawId);
  try {
    return localStorage.getItem(THEME_LAST_UID_KEY) || "";
  } catch (e) {
    return "";
  }
}

function saveThemeToLocalCache(theme, accountId = "") {
  const normalized = normalizeThemeValue(theme);
  try {
    localStorage.setItem(THEME_STORAGE_GLOBAL_KEY, normalized);
    const uid = accountId || getActiveAccountThemeId();
    if (uid) {
      localStorage.setItem(THEME_LAST_UID_KEY, uid);
      localStorage.setItem(`${THEME_STORAGE_GLOBAL_KEY}_${uid}`, normalized);
    }
  } catch (e) {
    // Ignore storage quota / privacy mode errors
  }
}

async function persistThemeToDatabase(theme) {
  const normalized = normalizeThemeValue(theme);
  const seq = ++themePersistSequence;
  if (user && typeof user === "object") {
    user.themePreference = normalized;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/v1/user/theme-preference`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ themePreference: normalized }),
      __topLoaderSilent: true
    });

    if (res.ok && seq === themePersistSequence) {
      const payload = await res.json().catch(() => null);
      const confirmed = payload?.data?.themePreference || payload?.themePreference;
      if (confirmed) {
        saveThemeToLocalCache(confirmed);
      }
    }
  } catch (err) {
    console.warn("Unable to sync theme preference to database:", err);
  }
}

function isProtectedPaperOrSkipNode(el) {
  if (!(el instanceof HTMLElement)) return true;
  const tag = el.tagName;
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "SVG" || tag === "PATH" || tag === "CANVAS" || tag === "OPTION") {
    return true;
  }
  if (
    el.closest(
      ".container-pdf, .ps-a4-sheet, .ps-a4-body, .ps-a4-letterhead-overlay, .a4-page, .print-sheet, [data-keep-light='true']"
    )
  ) {
    return true;
  }
  const canvas = el.closest(".spa-page-canvas");
  const pageName = canvas?.getAttribute("data-subpage") || "";
  if (pageName && PRINT_PAPER_PAGES.has(pageName)) {
    return true;
  }
  return false;
}

function adaptSingleElementInlineStyle(el, isDark) {
  if (!(el instanceof HTMLElement)) return;

  if (!isDark) {
    if (el.dataset.lfInlineAdapted !== "1") return;
    if (el.dataset.lfOrigBgc !== undefined) {
      el.style.backgroundColor = el.dataset.lfOrigBgc;
      delete el.dataset.lfOrigBgc;
    }
    if (el.dataset.lfOrigBg !== undefined) {
      el.style.background = el.dataset.lfOrigBg;
      delete el.dataset.lfOrigBg;
    }
    if (el.dataset.lfOrigFg !== undefined) {
      el.style.color = el.dataset.lfOrigFg;
      delete el.dataset.lfOrigFg;
    }
    if (el.dataset.lfOrigBdc !== undefined) {
      el.style.borderColor = el.dataset.lfOrigBdc;
      delete el.dataset.lfOrigBdc;
    }
    delete el.dataset.lfInlineAdapted;
    return;
  }

  if (isProtectedPaperOrSkipNode(el)) return;
  const st = el.style;
  if (!st || st.length === 0) return;

  let adapted = false;
  let hasUnremappedBrightBg = false;

  // 1. Background / backgroundColor
  const rawBgc = el.dataset.lfOrigBgc !== undefined ? el.dataset.lfOrigBgc : st.backgroundColor;
  if (rawBgc) {
    const darkBgc = remapSurfaceColorForDark(rawBgc);
    if (darkBgc) {
      if (el.dataset.lfOrigBgc === undefined) el.dataset.lfOrigBgc = rawBgc;
      st.backgroundColor = darkBgc;
      adapted = true;
    } else {
      const parsedBg = parseCssColor(rawBgc);
      if (parsedBg && parsedBg.a >= 0.5 && parsedBg.l >= 0.55) {
        hasUnremappedBrightBg = true;
      }
    }
  } else if (st.backgroundImage && /gradient\s*\(/i.test(st.backgroundImage)) {
    const rawBg = el.dataset.lfOrigBg !== undefined ? el.dataset.lfOrigBg : st.background;
    const darkBg = rawBg ? remapBackgroundValueForDark(rawBg) : null;
    if (darkBg) {
      if (el.dataset.lfOrigBg === undefined) el.dataset.lfOrigBg = rawBg;
      st.background = darkBg;
      adapted = true;
    }
  }

  // 2. Text color (preserve dark text if element intentionally keeps a bright solid badge fill)
  const rawFg = el.dataset.lfOrigFg !== undefined ? el.dataset.lfOrigFg : st.color;
  if (rawFg && !hasUnremappedBrightBg) {
    const darkFg = remapTextColorForDark(rawFg);
    if (darkFg) {
      if (el.dataset.lfOrigFg === undefined) el.dataset.lfOrigFg = rawFg;
      st.color = darkFg;
      adapted = true;
    }
  }

  // 3. Border color
  const rawBdc = el.dataset.lfOrigBdc !== undefined ? el.dataset.lfOrigBdc : st.borderColor;
  if (rawBdc) {
    const darkBdc = remapBorderColorForDark(rawBdc);
    if (darkBdc) {
      if (el.dataset.lfOrigBdc === undefined) el.dataset.lfOrigBdc = rawBdc;
      st.borderColor = darkBdc;
      adapted = true;
    }
  }

  if (adapted) {
    el.dataset.lfInlineAdapted = "1";
  }
}

function adaptSubpageInlineStylesForTheme(rootEl, isDark) {
  if (!rootEl || !(rootEl instanceof Element || rootEl instanceof Document)) return;
  if (isAdaptingInlineThemeStyles) return;

  isAdaptingInlineThemeStyles = true;
  try {
    const selector = isDark ? "[style]" : "[data-lf-inline-adapted='1']";
    if (rootEl instanceof HTMLElement && rootEl.matches(selector)) {
      adaptSingleElementInlineStyle(rootEl, isDark);
    }
    rootEl.querySelectorAll(selector).forEach((node) => {
      adaptSingleElementInlineStyle(node, isDark);
    });

    // Also adapt any Bootstrap modals appended directly under <body>
    document.querySelectorAll("body > .modal").forEach((modalNode) => {
      modalNode.querySelectorAll(selector).forEach((node) => {
        adaptSingleElementInlineStyle(node, isDark);
      });
    });
  } finally {
    isAdaptingInlineThemeStyles = false;
  }
}

function installThemeDomObserver() {
  const contentBox = document.getElementById("content-box");
  if (!contentBox) return;

  const observer = new MutationObserver((mutations) => {
    if (isAdaptingInlineThemeStyles || getCurrentTheme() !== "dark") return;
    let hasNewElements = false;
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length > 0) {
        hasNewElements = true;
        break;
      }
    }
    if (!hasNewElements || inlineThemeObserverScheduled) return;

    inlineThemeObserverScheduled = true;
    requestAnimationFrame(() => {
      inlineThemeObserverScheduled = false;
      if (getCurrentTheme() === "dark") {
        const liveBox = getLiveContentBox();
        if (liveBox) {
          adaptSubpageInlineStylesForTheme(liveBox, true);
        }
        syncChartsForTheme(true);
      }
    });
  });

  observer.observe(contentBox, {
    childList: true,
    subtree: true
  });
}

function syncChartsForTheme(isDark) {
  const ChartLib = window.Chart;
  if (!ChartLib) return;

  const tickColor = isDark ? "#cbd5e1" : "#475569";
  const legendColor = isDark ? "#e2e8f0" : "#334155";
  const gridColor = isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(226, 232, 240, 0.85)";

  try {
    if (ChartLib.defaults) {
      ChartLib.defaults.color = tickColor;
      ChartLib.defaults.borderColor = gridColor;
      if (ChartLib.defaults.global) {
        ChartLib.defaults.global.defaultFontColor = tickColor;
      }
    }

    const instances = [];
    if (typeof ChartLib.getChart === "function") {
      document.querySelectorAll("#content-box canvas").forEach((cv) => {
        const inst = ChartLib.getChart(cv);
        if (inst) instances.push(inst);
      });
    } else if (ChartLib.instances) {
      Object.values(ChartLib.instances).forEach((inst) => {
        if (inst) instances.push(inst);
      });
    }

    instances.forEach((chart) => {
      const opts = chart.options || {};
      // Chart.js v3 / v4 scales
      if (opts.scales && typeof opts.scales === "object" && !Array.isArray(opts.scales.xAxes)) {
        Object.values(opts.scales).forEach((scale) => {
          if (!scale || typeof scale !== "object") return;
          if (scale.ticks) scale.ticks.color = tickColor;
          if (scale.grid) scale.grid.color = gridColor;
          if (scale.title) scale.title.color = legendColor;
        });
      }
      // Chart.js v2 scales
      if (opts.scales) {
        ["xAxes", "yAxes"].forEach((axisKey) => {
          if (Array.isArray(opts.scales[axisKey])) {
            opts.scales[axisKey].forEach((axis) => {
              if (axis.ticks) axis.ticks.fontColor = tickColor;
              if (axis.gridLines) axis.gridLines.color = gridColor;
            });
          }
        });
      }
      if (opts.plugins?.legend?.labels) {
        opts.plugins.legend.labels.color = legendColor;
      }
      if (opts.plugins?.title) {
        opts.plugins.title.color = legendColor;
      }
      if (opts.legend?.labels) {
        opts.legend.labels.fontColor = legendColor;
      }
      if (typeof chart.update === "function") {
        chart.update("none");
      }
    });
  } catch (e) {
    // Non-fatal chart styling notice
  }
}

function syncThemeUiState(theme) {
  const isDark = theme === "dark";

  const topbarBtn = document.getElementById("lfThemeToggleBtn");
  if (topbarBtn) {
    topbarBtn.setAttribute("aria-pressed", String(isDark));
    const actionLabel = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";
    topbarBtn.setAttribute("title", actionLabel);
    topbarBtn.setAttribute("aria-label", actionLabel);
  }

  document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    const choice = normalizeThemeValue(btn.getAttribute("data-theme-choice"));
    const active = choice === theme;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-checked", String(active));
  });

  const mobileIcon = document.getElementById("lfMobileThemeIcon");
  const mobileLabel = document.getElementById("lfMobileThemeLabel");
  if (mobileIcon) {
    mobileIcon.className = isDark ? "fa-solid fa-sun" : "fa-solid fa-moon";
  }
  if (mobileLabel) {
    mobileLabel.textContent = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";
  }
}

function applyTheme(theme, options = {}) {
  const nextTheme = normalizeThemeValue(theme);
  const prevTheme = getCurrentTheme();
  const shouldAnimate = options.animate !== false && prevTheme !== nextTheme;
  const shouldPersist = Boolean(options.persist);
  const root = document.documentElement;

  if (shouldAnimate) {
    root.classList.add("lf-theme-transitioning");
    if (themeTransitionTimer) window.clearTimeout(themeTransitionTimer);
    themeTransitionTimer = window.setTimeout(() => {
      root.classList.remove("lf-theme-transitioning");
      themeTransitionTimer = null;
    }, 320);
  }

  root.setAttribute("data-theme", nextTheme);
  root.style.colorScheme = nextTheme;

  saveThemeToLocalCache(nextTheme, options.accountId || "");
  syncThemeUiState(nextTheme);

  const liveBox = getLiveContentBox();
  if (liveBox) {
    adaptSubpageInlineStylesForTheme(liveBox, nextTheme === "dark");
  }
  syncChartsForTheme(nextTheme === "dark");

  window.dispatchEvent(
    new CustomEvent("lf:themechange", { detail: { theme: nextTheme } })
  );

  if (shouldPersist) {
    persistThemeToDatabase(nextTheme);
  }

  return nextTheme;
}

function toggleTheme() {
  userInitiatedThemeInSession = true;
  const next = getCurrentTheme() === "dark" ? "light" : "dark";
  return applyTheme(next, { animate: true, persist: true });
}

function initThemeControls() {
  // Sync controls with whatever `<head>` pre-paint script restored
  syncThemeUiState(getCurrentTheme());

  const topbarBtn = document.getElementById("lfThemeToggleBtn");
  topbarBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    toggleTheme();
  });

  document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const chosen = normalizeThemeValue(btn.getAttribute("data-theme-choice"));
      userInitiatedThemeInSession = true;
      applyTheme(chosen, { animate: true, persist: true });
    });
  });

  const mobileThemeBtn = document.getElementById("lfMobileThemeBtn");
  mobileThemeBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    toggleTheme();
  });
}

window.applyAdminTheme = applyTheme;
window.toggleAdminTheme = toggleTheme;
window.getAdminTheme = getCurrentTheme;

// Toggle submenu items
function toggleSubItems(id, forceOpen = null) {
  const subItems = document.getElementById(id);
  if (!subItems) return;
  const toggleItem = subItems.previousElementSibling;

  const currentlyOpen = subItems.style.display === "block";
  const nextOpen = forceOpen === null ? !currentlyOpen : Boolean(forceOpen);

  subItems.style.display = nextOpen ? "block" : "none";
  if (toggleItem) {
    toggleItem.classList.toggle("expanded", nextOpen);
  }
}

window.toggleSubItems = toggleSubItems;

// Sidebar quick filter input
function initSidebarFilter() {
  const filterInput = document.getElementById("lfSidebarFilter");
  const panelList = document.getElementById("lfPanelList");
  const emptyState = document.getElementById("lfSidebarEmpty");
  if (!filterInput || !panelList) return;

  filterInput.addEventListener("input", () => {
    const query = filterInput.value.trim().toLowerCase();

    if (!query) {
      // Restore normal view while keeping permission-hidden items hidden
      panelList.querySelectorAll("li.m_dashbord, .booking.bookf").forEach((node) => {
        if (node.dataset.permissionHidden === "true") {
          node.style.display = "none";
        } else {
          node.style.display = "";
        }
      });

      panelList.querySelectorAll(".subItem").forEach((sub) => {
        const parentLi = sub.previousElementSibling;
        const isMobileOnly =
          sub.classList.contains("lf-mobile-only-sub") ||
          parentLi?.classList.contains("lf-mobile-only-group");
        if (
          sub.dataset.permissionHidden === "true" ||
          (isMobileOnly && window.innerWidth > MOBILE_DRAWER_BREAKPOINT)
        ) {
          sub.style.display = "none";
          return;
        }
        const hasActive = Boolean(sub.querySelector(".nav-item.active"));
        const wasExpanded = parentLi?.classList.contains("expanded") || hasActive;
        sub.style.display = wasExpanded ? "block" : "none";
      });

      if (emptyState) emptyState.hidden = true;
      return;
    }

    let visibleCount = 0;

    // Hide section dividers during text filtering for cleaner scan
    panelList.querySelectorAll(".booking.bookf").forEach((div) => {
      div.style.display = "none";
    });

    // Check top-level direct links and submenu groups
    Array.from(panelList.children).forEach((child) => {
      if (!(child instanceof HTMLElement)) return;
      if (child.classList.contains("booking")) return;

      if (child.tagName === "LI" && child.dataset.permissionHidden !== "true") {
        const nextSibling = child.nextElementSibling;
        const isGroupToggle = nextSibling && nextSibling.classList.contains("subItem");

        if (child.classList.contains("lf-mobile-only-group") && window.innerWidth > MOBILE_DRAWER_BREAKPOINT) {
          child.style.display = "none";
          if (isGroupToggle) nextSibling.style.display = "none";
          return;
        }

        if (child.classList.contains("lf-mobile-utility-item") && window.innerWidth > 768) {
          child.style.display = "none";
          return;
        }

        if (!isGroupToggle) {
          const text = child.textContent?.toLowerCase() || "";
          const match = text.includes(query);
          child.style.display = match ? "" : "none";
          if (match) visibleCount += 1;
        } else {
          if (nextSibling.dataset.permissionHidden === "true") {
            child.style.display = "none";
            nextSibling.style.display = "none";
            return;
          }

          const parentMatches = (child.textContent?.toLowerCase() || "").includes(query);
          let childMatchCount = 0;

          nextSibling.querySelectorAll("li").forEach((subLi) => {
            if (subLi.dataset.permissionHidden === "true") {
              subLi.style.display = "none";
              return;
            }
            const subText = subLi.textContent?.toLowerCase() || "";
            const subMatches = parentMatches || subText.includes(query);
            subLi.style.display = subMatches ? "" : "none";
            if (subMatches) childMatchCount += 1;
          });

          if (childMatchCount > 0) {
            child.style.display = "";
            nextSibling.style.display = "block";
            visibleCount += childMatchCount;
          } else {
            child.style.display = "none";
            nextSibling.style.display = "none";
          }
        }
      }
    });

    if (emptyState) {
      emptyState.hidden = visibleCount > 0;
    }
  });
}

// Enterprise Command Palette (Ctrl+K / Cmd+K)
function initCommandPalette() {
  const modal = document.getElementById("lfCommandModal");
  const trigger = document.getElementById("lfCmdTrigger");
  const closeBtn = document.getElementById("lfCmdCloseBtn");
  const input = document.getElementById("lfCmdInput");
  const resultsBox = document.getElementById("lfCmdResults");
  if (!modal || !input || !resultsBox) return;

  let activeIndex = 0;
  let currentEntries = [];

  function collectPermittedCommands() {
    const seen = new Set();
    const commands = [];

    document.querySelectorAll("#left-navbar .nav-item[data-page], #top-navbar .nav-item[data-page]").forEach((link) => {
      const page = link.getAttribute("data-page");
      if (!page || seen.has(page)) return;

      const parentLi = link.closest("li");
      const parentSub = link.closest(".subItem");
      if (
        parentLi?.dataset.permissionHidden === "true" ||
        parentSub?.dataset.permissionHidden === "true"
      ) {
        return;
      }

      seen.add(page);
      const meta = ROUTE_META_MAP[page] || {};
      const rawLabel = link.getAttribute("data-page-title") || link.textContent?.replace(/\s+/g, " ").trim() || page;
      const iconEl = link.querySelector("i");
      const iconClass = iconEl ? iconEl.className : "fa-solid fa-arrow-right";

      commands.push({
        page,
        title: meta.title || rawLabel,
        section: meta.section || "Workspace",
        keywords: `${rawLabel} ${meta.title || ""} ${meta.section || ""} ${page}`.toLowerCase(),
        iconClass
      });
    });

    // Include Training Videos if not already listed
    if (!seen.has("addvideo")) {
      commands.push({
        page: "addvideo",
        title: "Training & Tutorial Videos",
        section: "Resources",
        keywords: "videos tutorials training help",
        iconClass: "fa-solid fa-circle-play"
      });
    }

    // Quick Appearance Toggle Action
    const isDarkNow = getCurrentTheme() === "dark";
    commands.push({
      action: () => toggleTheme(),
      title: isDarkNow ? "Switch to Light Mode" : "Switch to Dark Mode",
      section: "Appearance",
      keywords: "dark mode light mode theme appearance night day color",
      iconClass: isDarkNow ? "fa-solid fa-sun" : "fa-solid fa-moon",
      enterLabel: "Toggle &crarr;"
    });

    return commands;
  }

  function renderResults() {
    const q = input.value.trim().toLowerCase();
    const all = collectPermittedCommands();
    currentEntries = q ? all.filter((item) => item.keywords.includes(q)) : all;
    activeIndex = Math.min(activeIndex, Math.max(0, currentEntries.length - 1));

    if (currentEntries.length === 0) {
      resultsBox.innerHTML = `<div style="padding: 28px 16px; text-align: center; color: #64748b; font-size: 13px;">No matching modules found for "<strong>${q.replace(/[<>&"]/g, "")}</strong>"</div>`;
      return;
    }

    resultsBox.innerHTML = currentEntries
      .map(
        (item, idx) => `
        <button type="button" class="lf-cmd-item ${idx === activeIndex ? "is-selected" : ""}" data-cmd-idx="${idx}" role="option" aria-selected="${idx === activeIndex}">
          <span class="lf-cmd-item__icon"><i class="${item.iconClass}"></i></span>
          <span class="lf-cmd-item__body">
            <span class="lf-cmd-item__title">${item.title}</span>
            <span class="lf-cmd-item__section">${item.section}</span>
          </span>
          <span class="lf-cmd-item__enter">${item.enterLabel || "Open &crarr;"}</span>
        </button>
      `
      )
      .join("");

    resultsBox.querySelectorAll(".lf-cmd-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-cmd-idx") || 0);
        const target = currentEntries[idx];
        if (target) {
          closeCommandPalette();
          if (typeof target.action === "function") {
            target.action();
          } else if (target.page) {
            loadPage(target.page);
          }
        }
      });
    });

    const selectedNode = resultsBox.querySelector(".lf-cmd-item.is-selected");
    selectedNode?.scrollIntoView({ block: "nearest" });
  }

  function openCommandPalette() {
    closeAllPopovers();
    modal.hidden = false;
    input.value = "";
    activeIndex = 0;
    renderResults();
    requestAnimationFrame(() => input.focus());
  }

  function closeCommandPalette() {
    modal.hidden = true;
  }

  trigger?.addEventListener("click", openCommandPalette);
  closeBtn?.addEventListener("click", closeCommandPalette);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeCommandPalette();
    }
  });

  input.addEventListener("input", () => {
    activeIndex = 0;
    renderResults();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (currentEntries.length > 0) {
        activeIndex = (activeIndex + 1) % currentEntries.length;
        renderResults();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentEntries.length > 0) {
        activeIndex = (activeIndex - 1 + currentEntries.length) % currentEntries.length;
        renderResults();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = currentEntries[activeIndex];
      if (chosen) {
        closeCommandPalette();
        if (typeof chosen.action === "function") {
          chosen.action();
        } else if (chosen.page) {
          loadPage(chosen.page);
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeCommandPalette();
    }
  });

  // Global Enterprise Keyboard Shortcuts
  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    const isMod = e.ctrlKey || e.metaKey;
    const activeTag = document.activeElement?.tagName || "";
    const isEditingText =
      activeTag === "INPUT" ||
      activeTag === "TEXTAREA" ||
      activeTag === "SELECT" ||
      document.activeElement?.isContentEditable;

    // Ctrl+K / Cmd+K -> Toggle Command Palette
    if (isMod && key === "k") {
      e.preventDefault();
      if (modal.hidden) {
        openCommandPalette();
      } else {
        closeCommandPalette();
      }
      return;
    }

    // Ctrl+B / Cmd+B -> Toggle Sidebar (when not inside CKEditor/contentEditable bold)
    if (isMod && key === "b" && !document.activeElement?.isContentEditable) {
      e.preventDefault();
      toggleSidebar();
      return;
    }

    // `/` -> Focus Sidebar Filter when not typing in an input
    if (e.key === "/" && !isMod && !isEditingText && modal.hidden) {
      const sidebar = document.getElementById("left-navbar");
      const filterInput = document.getElementById("lfSidebarFilter");
      if (sidebar && !sidebar.classList.contains("hidden") && filterInput) {
        e.preventDefault();
        filterInput.focus();
      }
      return;
    }

    // Escape -> Close Command Palette, Popovers, or Mobile Drawer
    if (e.key === "Escape") {
      if (!modal.hidden) {
        closeCommandPalette();
        return;
      }
      closeAllPopovers();
      closeMobileSidebar();
    }
  });
}

function initFullscreenControl() {
  const btn = document.getElementById("lfFullscreenBtn");
  if (!btn) return;

  const updateIcon = () => {
    const icon = btn.querySelector("i");
    if (!icon) return;
    icon.className = document.fullscreenElement ? "fa-solid fa-compress" : "fa-solid fa-expand";
  };

  btn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  document.addEventListener("fullscreenchange", updateIcon);
}

// ==========================================================================
// AUTHENTICATION, LOGOUT & ROLE/STAFF PERMISSIONS
// ==========================================================================

async function logout() {
  const modalLogoutBtn = document.getElementById("modalLogoutBtn");
  if (modalLogoutBtn) {
    modalLogoutBtn.disabled = true;
    modalLogoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing out...';
  }
  const regularLogoutBtn = document.getElementById("logoutButton");
  if (regularLogoutBtn) {
    regularLogoutBtn.style.pointerEvents = "none";
  }

  try {
    await fetch(`${BASE_URL}/api/v1/user/logout`, {
      method: "POST",
      credentials: "include"
    });
  } catch (error) {
    console.warn("Logout request failed, proceeding with client-side cleanup:", error);
  } finally {
    const savedThemeEntries = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k === THEME_STORAGE_GLOBAL_KEY || k === THEME_LAST_UID_KEY || k.startsWith(`${THEME_STORAGE_GLOBAL_KEY}_`))) {
          savedThemeEntries.push([k, localStorage.getItem(k)]);
        }
      }
      localStorage.clear();
      savedThemeEntries.forEach(([k, v]) => {
        if (v !== null) localStorage.setItem(k, v);
      });
    } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    try {
      document.cookie.split(";").forEach((c) => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
    } catch (e) {}
    window.location.href = `${BASE_URL}/franchiseelogin.html`;
  }
}

// Menu configuration based on user roles and tenant layers
const menuConfig = {
  admin1layer: {
    hidden: [
      "Add_franchisse", "List_franchisse", "Accounts",
      "Assign_price", "Bulk_pricing", "Transfer_pricing",
      "Assign_credit", "Credit_history"
    ]
  },
  admin2layer: { hidden: [] },
  admin3layer: { hidden: [] },
  admin4layer: { hidden: [] },
  franchisee: { hidden: [] },
  staff: {
    hidden: [
      "Add_staff", "List_staff", "Add_lab",
      "List_lab", "Add_doctor", "List_doctor"
    ]
  }
};

function applyStaffPermissions(currentUser) {
  if (currentUser.role !== "staff") {
    return;
  }

  const permissions = currentUser.permissions || {};

  function hidePageElements(pageName) {
    const elements = document.querySelectorAll(`[data-page="${pageName}"]`);
    elements.forEach((elem) => {
      const parentLi = elem.closest("li");
      if (parentLi) {
        markPermissionHidden(parentLi);
      }
    });
  }

  function hideSectionById(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
      markPermissionHidden(section);
      const parentItem = section.previousElementSibling;
      if (parentItem && parentItem.tagName === "LI") {
        markPermissionHidden(parentItem);
      }
    }
  }

  function hideBookingSection(sectionName) {
    const headings = document.querySelectorAll(".booking-inner span.book_po");
    headings.forEach((heading) => {
      if (heading.textContent.includes(sectionName)) {
        const bookingSection = heading.closest(".booking");
        if (bookingSection) {
          markPermissionHidden(bookingSection);
        }
      }
    });
  }

  // 1. canManageBookings Permission
  if (!permissions.canManageBookings) {
    hidePageElements("samples");
    hidePageElements("new_booking");
    hidePageElements("cancel_booking");
    hidePageElements("cancelled");
    hideSectionById("manageBooking");
    hideSectionById("subItems2");
    hidePageElements("generatebill");
    hideSectionById("subItem001");

    document.querySelectorAll('.top-navbar [data-page="new_booking"]').forEach((btn) => {
      const parentLi = btn.closest("li");
      if (parentLi) markPermissionHidden(parentLi);
    });
  }

  if (!permissions.canManageBookings && !permissions.canViewReports) {
    hidePageElements("barcodeManager");
    document.querySelectorAll('.top-navbar [data-page="barcodeManager"]').forEach((btn) => {
      const parentLi = btn.closest("li");
      if (parentLi) markPermissionHidden(parentLi);
    });
  }

  // 2. canViewReports Permission
  if (!permissions.canViewReports) {
    hidePageElements("allcases");
    hidePageElements("samples");

    document.querySelectorAll('.top-navbar [data-page="allcases"]').forEach((btn) => {
      const parentLi = btn.closest("li");
      if (parentLi) markPermissionHidden(parentLi);
    });

    document.querySelectorAll('.top-navbar [data-page="samples"]').forEach((btn) => {
      const parentLi = btn.closest("li");
      if (parentLi) markPermissionHidden(parentLi);
    });
  }

  // 3. canManageUsers Permission
  if (!permissions.canManageUsers) {
    hideSectionById("subItems-b");
    hidePageElements("Add_franchisse");
    hidePageElements("List_franchisse");
    hidePageElements("Accounts");

    hideSectionById("subItems-c");
    hidePageElements("Assign_price");
    hidePageElements("Bulk_pricing");

    hideSectionById("subItems-d");
    hidePageElements("Assign_credit");
    hidePageElements("assignTarget");
    hidePageElements("Credit_history");

    hideBookingSection("MY FRANCHISEE");

    hidePageElements("Allorders");
    document.querySelectorAll('.top-navbar [data-page="Allorders"]').forEach((btn) => {
      const parentLi = btn.closest("li");
      if (parentLi) markPermissionHidden(parentLi);
    });

    hideSectionById("subItems-e");
    hidePageElements("Add_staff");
    hidePageElements("List_staff");
    hidePageElements("staffActivity");
    hideBookingSection("STAFF");

    hideSectionById("subItems5");
    hidePageElements("Add_doctor");
    hidePageElements("List_doctor");

    hideSectionById("subItems6");
    hidePageElements("Add_lab");
    hidePageElements("List_lab");

    hideSectionById("subItems7");
    hidePageElements("inventory");
    hidePageElements("Addproduct");
  }

  // 4. canManagePayments Permission
  if (!permissions.canManagePayments) {
    hidePageElements("fullLedger");
    hideSectionById("subItems8");
    hidePageElements("addexpense");
    hidePageElements("expense");
    hidePageElements("budgetCategory");
    hidePageElements("refferDashboard");

    hideSectionById("subItems-d");
    hidePageElements("Assign_credit");
    hidePageElements("assignTarget");
    hidePageElements("Credit_history");

    hideBookingSection("Expense");
  }

  // 5. canManageTest Permission
  if (!permissions.canManageTest) {
    const testDatabaseSection = document.getElementById("testdatabase");
    if (testDatabaseSection) {
      markPermissionHidden(testDatabaseSection);
    }

    hideSectionById("subItem");
    hidePageElements("test");
    hidePageElements("addTestDocument");
    hidePageElements("testPackage");
    hidePageElements("testPanels");
    hidePageElements("category");
    hidePageElements("formulaBuilder");
  }
}

function checkAndHidePrintSettingButton(currentUser) {
  if (currentUser.role === "staff" && currentUser.permissions && !currentUser.permissions.canManageTest) {
    const observer = new MutationObserver(() => {
      const printSettingBtn = document.getElementById("printsettingbutton");
      if (printSettingBtn) {
        printSettingBtn.style.display = "none";
      }
    });

    const contentBox = document.getElementById("content-box");
    if (contentBox) {
      observer.observe(contentBox, {
        childList: true,
        subtree: true
      });
    }
  }
}

async function verifyAccessToken() {
  try {
    const response = await fetch(`${BASE_URL}/api/verify-token`, {
      method: "GET",
      credentials: "include"
    });
    syncSubscriptionServerClock(response.headers.get("date"));

    if (!response.ok) {
      console.error("Authentication failed");
      localStorage.clear();
      sessionStorage.clear();
      return false;
    }

    const data = await response.json();
    if (data.user.role === "staff") {
      userId = data.user.parentUser;
      username = data.user.username;
      role = data.user.createdBy.role;
      userRole = data.user.role;
      user = data.user;
      syncBrandLogos(user?.tenantId?.logo);
      usericon(user);
    } else {
      userId = data.user._id;
      username = data.user.username;
      role = data.user.role;
      userRole = data.user.role;
      user = data.user;
      syncBrandLogos(user?.tenantId?.logo);
      usericon(user);
    }

    if (role === "admin") {
      const adminLayer = data.user.tenantId.modelType;
      role = `admin${adminLayer}`;
    }

    // Sync persisted Dark / Light mode preference from MongoDB user account
    const accountThemeId = String(data.user?._id || "");
    const dbThemeRaw = data.user?.themePreference;
    if (userInitiatedThemeInSession) {
      saveThemeToLocalCache(getCurrentTheme(), accountThemeId);
      persistThemeToDatabase(getCurrentTheme());
    } else if (dbThemeRaw === "dark" || dbThemeRaw === "light") {
      applyTheme(dbThemeRaw, {
        animate: false,
        persist: false,
        accountId: accountThemeId
      });
    } else {
      saveThemeToLocalCache(getCurrentTheme(), accountThemeId);
    }

    syncAdminGlobals();
    initializeMenu(role);

    if (userRole === "staff") {
      applyStaffPermissions(user);
      checkAndHidePrintSettingButton(user);
    }

    try {
      renderSubscriptionBanner(getPortalSubscriptionState(data.user));
      if (isPortalSubscriptionLocked(data.user)) {
        showSubscriptionModal();
      } else {
        hideSubscriptionModal();
      }
    } catch (e) {
      console.warn("Subscription check failed", e);
    }

    return data.isAuthorized;
  } catch (error) {
    console.error("Error verifying token:", error);
    return false;
  }
}

async function usericon(currentUser) {
  const userAvatar = document.getElementById("userAvatar");
  const userPopup = document.getElementById("userPopup");

  if (currentUser.showtestdatabase === false) {
    const testDb = document.getElementById("testdatabase");
    if (testDb) markPermissionHidden(testDb);
    const subItem = document.getElementById("subItem");
    if (subItem) markPermissionHidden(subItem);
  }

  if (currentUser?.tenantId?.modelType === "1layer") {
    document.querySelectorAll(".forhide").forEach((elem) => {
      markPermissionHidden(elem);
    });
  }

  if (!userMenuListenersInstalled && userAvatar && userPopup) {
    userMenuListenersInstalled = true;

    userAvatar.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = userPopup.style.display !== "block";
      closeAllPopovers(userPopup);
      userPopup.style.display = willOpen ? "block" : "none";
    });

    userAvatar.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        const willOpen = userPopup.style.display !== "block";
        closeAllPopovers(userPopup);
        userPopup.style.display = willOpen ? "block" : "none";
      }
    });

    document.addEventListener("click", (e) => {
      if (!userAvatar.contains(e.target) && !userPopup.contains(e.target)) {
        userPopup.style.display = "none";
      }
    });

    const popupLogoutBtn = document.getElementById("logoutBtn");
    if (popupLogoutBtn) {
      popupLogoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        logout();
      });
    }
  }

  const userNameEl = document.getElementById("userName");
  const userEmailEl = document.getElementById("userEmail");
  const avatarImg = document.getElementById("userAvatarImg");
  const popupAvatar = document.getElementById("popupAvatar");
  const avatarSrc = currentUser.profileimage || "/images/default-avatar.svg";

  if (userNameEl) userNameEl.textContent = currentUser.fullName || currentUser.username || "Administrator";
  if (userEmailEl) userEmailEl.textContent = currentUser.email || "";
  if (avatarImg) avatarImg.src = avatarSrc;
  if (popupAvatar) popupAvatar.src = avatarSrc;
}

function initializeMenu(incomingRole) {
  let effectiveRole = incomingRole;
  if (!menuConfig[effectiveRole]) {
    effectiveRole = "admin1layer";
  }

  let layerNumber = 1;
  if (effectiveRole.startsWith("admin") && effectiveRole.length > 5) {
    layerNumber = parseInt(effectiveRole.substring(5), 10) || 1;
  }

  const hiddenItems = menuConfig[effectiveRole]?.hidden || [];
  hiddenItems.forEach((itemId) => {
    const menuItems = document.querySelectorAll(`[data-page="${itemId}"]`);
    menuItems.forEach((item) => {
      const parentLi = item.closest("li");
      if (parentLi) {
        markPermissionHidden(parentLi);
      }
    });
  });

  const franchiseeSections = ["subItems-b", "subItems-c", "subItems-d"];

  if (effectiveRole === "admin1layer") {
    franchiseeSections.forEach((sectionId) => {
      const section = document.getElementById(sectionId);
      if (section) {
        markPermissionHidden(section);
        const parentItem = section.previousElementSibling;
        if (parentItem && parentItem.tagName === "LI") {
          markPermissionHidden(parentItem);
        }
      }
    });

    document.querySelectorAll(".booking-inner span.book_po").forEach((heading) => {
      if (heading.textContent.includes("FRANCHISEE")) {
        const bookingSection = heading.closest(".booking");
        if (bookingSection) {
          markPermissionHidden(bookingSection);
        }
      }
    });
  } else {
    franchiseeSections.forEach((sectionId) => {
      const section = document.getElementById(sectionId);
      if (section) {
        delete section.dataset.permissionHidden;
        section.style.display = "none";
        const parentItem = section.previousElementSibling;
        if (parentItem && parentItem.tagName === "LI") {
          markPermissionVisible(parentItem, "flex");
        }
      }
    });

    document.querySelectorAll(".booking-inner span.book_po").forEach((heading) => {
      if (heading.textContent.includes("MY FRANCHISEE")) {
        const bookingSection = heading.closest(".booking");
        if (bookingSection) {
          markPermissionVisible(bookingSection, "flex");
        }
      }
    });
  }

  const nameElement = document.querySelector(".name_text");
  const roleElement = document.querySelector(".nt1");

  if (nameElement) {
    nameElement.textContent = user?.fullName || username || "Administrator";
  }

  if (roleElement) {
    if (String(incomingRole).startsWith("staff") || userRole === "staff") {
      roleElement.textContent = `STAFF • LAYER ${layerNumber}`;
    } else if (String(incomingRole).startsWith("admin")) {
      roleElement.textContent = `ADMIN • LAYER ${layerNumber}`;
    } else {
      roleElement.textContent = String(incomingRole || "ADMIN").toUpperCase();
    }
  }
}

// ==========================================================================
// SUBSCRIPTION MODAL HELPERS
// ==========================================================================

let __subscriptionHandlers = { keydown: null, click: null };

function showSubscriptionModal() {
  const modal = document.getElementById("subscriptionModal");
  if (!modal) return;

  if (__subscriptionHandlers.keydown) {
    window.removeEventListener("keydown", __subscriptionHandlers.keydown, true);
    __subscriptionHandlers.keydown = null;
  }
  if (__subscriptionHandlers.click) {
    modal.removeEventListener("click", __subscriptionHandlers.click, true);
    __subscriptionHandlers.click = null;
  }

  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
  hideSubscriptionBanner();

  __subscriptionHandlers.keydown = function (e) {
    if (modal.style.display !== "flex" && modal.style.display !== "block") return;
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      hideSubscriptionModal();
    }
  };

  __subscriptionHandlers.click = function (e) {
    if (modal.style.display !== "flex" && modal.style.display !== "block") return;
    if (e.target === modal) {
      e.stopPropagation();
      e.preventDefault();
      hideSubscriptionModal();
    }
  };

  window.addEventListener("keydown", __subscriptionHandlers.keydown, true);
  modal.addEventListener("click", __subscriptionHandlers.click, true);

  const closeBtn = document.getElementById("closeSubscriptionModal");
  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.preventDefault();
      hideSubscriptionModal();
    };
  }

  const modalCloseBtn = document.getElementById("modalCloseBtn");
  if (modalCloseBtn) {
    modalCloseBtn.onclick = (e) => {
      e.preventDefault();
      hideSubscriptionModal();
    };
  }

  const modalLogoutBtn = document.getElementById("modalLogoutBtn");
  if (modalLogoutBtn) {
    modalLogoutBtn.onclick = (e) => {
      e.preventDefault();
      logout();
    };
  }

  if (window._subscriptionPollInterval) clearInterval(window._subscriptionPollInterval);
  window._subscriptionPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/verify-token`, {
        method: "GET",
        credentials: "include",
        __topLoaderSilent: true
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!isPortalSubscriptionLocked(data.user)) {
        hideSubscriptionModal();
        user = data.user;
        syncBrandLogos(user?.tenantId?.logo);
        syncAdminGlobals();
        clearInterval(window._subscriptionPollInterval);
        window._subscriptionPollInterval = null;
      }
    } catch (err) {
      console.warn("Subscription poll error", err);
    }
  }, 10000);
}

function hideSubscriptionModal() {
  const modal = document.getElementById("subscriptionModal");
  if (!modal) return;
  modal.style.display = "none";
  document.body.style.overflow = "";

  if (__subscriptionHandlers.keydown) {
    window.removeEventListener("keydown", __subscriptionHandlers.keydown, true);
    __subscriptionHandlers.keydown = null;
  }
  if (__subscriptionHandlers.click) {
    modal.removeEventListener("click", __subscriptionHandlers.click, true);
    __subscriptionHandlers.click = null;
  }
  if (window._subscriptionPollInterval) {
    clearInterval(window._subscriptionPollInterval);
    window._subscriptionPollInterval = null;
  }

  subscriptionBannerDismissed = false;
  renderSubscriptionBanner(getPortalSubscriptionState(user));
}

async function checkAuthorization() {
  const isAuthorized = await verifyAccessToken();
  if (!isAuthorized) {
    window.location.href = `${BASE_URL}/index.html`;
    return false;
  }
  return true;
}

// ==========================================================================
// NOTIFICATIONS FETCHER & RENDERER
// ==========================================================================

function renderEmptyNotificationsState(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="lf-notif-empty notification" role="status">
      <i class="fa-regular fa-bell-slash"></i>
      <strong>All caught up</strong>
      <span>No unread case notifications right now.</span>
    </div>
  `;
}

async function fetchNotifications() {
  try {
    const response = await fetch(`${BASE_URL}/api/v1/user/getnewnotificationforadmin`, {
      __topLoaderSilent: true
    });
    const data = await response.json();

    if (!response.ok || data.status === "empty" || !Array.isArray(data) || data.length === 0) {
      const alertdiv = document.querySelector(".alert-div");
      const messagescountspan = alertdiv?.querySelector("#messageshint");
      const messagescontainer = alertdiv?.querySelector("#notificationContainer");
      if (messagescountspan) messagescountspan.textContent = "";
      renderEmptyNotificationsState(messagescontainer);
      return;
    }

    populateMessages(data);
  } catch (error) {
    console.error("Error fetching notifications:", error);
  }

  function populateMessages(data) {
    const alertdiv = document.querySelector(".alert-div");
    if (!alertdiv) return;
    const messagescountspan = alertdiv.querySelector("#messageshint");
    const messagescontainer = alertdiv.querySelector("#notificationContainer");
    if (!messagescountspan || !messagescontainer) return;

    messagescountspan.textContent = String(data.length);
    messagescontainer.innerHTML = "";

    data.forEach((elem) => {
      const div = document.createElement("div");
      div.className = "notification";
      div.setAttribute("role", "alert");
      div.setAttribute("data-objId", elem._id);

      div.innerHTML = `
        <span class="deletemsg" title="Dismiss notification" style="cursor:pointer;">&#10005;</span>
        <strong>Booking ID:</strong> <span>${elem.relatedbooking?.bookingId || "N/A"}</span><br>
        <strong>Last Message:</strong> <span>${elem.lastMessage?.message || "No message"}</span><br>
        <strong>Patient Name:</strong> <span>${elem.relatedbooking?.patientName || "N/A"}</span><br>
        <strong>Franchisee:</strong> <span>${elem.relatedbooking?.createdBy?.username || "N/A"}</span>
      `;

      const deletebtn = div.querySelector(".deletemsg");
      deletebtn?.addEventListener("click", async function () {
        const objId = div.getAttribute("data-objId");
        try {
          const response = await fetch(`${BASE_URL}/api/v1/user/changewatchedstatus/${objId}`);
          if (response.ok) {
            div.remove();
            const remaining = messagescontainer.querySelectorAll(".notification[data-objId]").length;
            if (remaining === 0) {
              messagescountspan.textContent = "";
              messagescontainer.classList.remove("show");
              renderEmptyNotificationsState(messagescontainer);
            } else {
              messagescountspan.textContent = String(remaining);
            }
          }
        } catch (err) {
          console.error("Error updating conversation:", err.message);
        }
      });

      messagescontainer.appendChild(div);
    });
  }
}

// ==========================================================================
// DYNAMIC SPA ROUTER & SCRIPT LOADER
// ==========================================================================

const DYNAMIC_PAGE_SCRIPT_SELECTOR = 'script[data-dynamic-page-script="true"]';

function pageUsesEditor(container) {
  return Boolean(container?.querySelector("#editor"));
}

function updateBreadcrumbAndTitle(page) {
  const meta = ROUTE_META_MAP[page];
  const navMatch = document.querySelector(`.nav-item[data-page="${page}"]`);
  const fallbackTitle =
    navMatch?.getAttribute("data-page-title") ||
    navMatch?.textContent?.replace(/\s+/g, " ").trim() ||
    page.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const title = meta?.title || fallbackTitle;
  const section = meta?.section || "Workspace";

  const sectionNode = document.getElementById("lfBreadcrumbSection");
  const currentNode = document.getElementById("lfBreadcrumbCurrent");
  if (sectionNode) sectionNode.textContent = section;
  if (currentNode) currentNode.textContent = title;

  document.title = `${title} — LabFlow Admin`;
}

function highlightActiveMenuItem(page) {
  const mappedKey = ROUTE_META_MAP[page]?.parent || page;

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active");
  });

  document.querySelectorAll(".left-navbar .m_dashbord").forEach((li) => {
    li.classList.remove("has-active-child");
  });

  const activeItems = document.querySelectorAll(
    `.nav-item[data-page="${page}"], .nav-item[data-page="${mappedKey}"]`
  );

  activeItems.forEach((item) => {
    item.classList.add("active");

    const parentSub = item.closest(".subItem");
    if (parentSub && parentSub.dataset.permissionHidden !== "true") {
      const toggleLi = parentSub.previousElementSibling;
      const isMobileOnly =
        parentSub.classList.contains("lf-mobile-only-sub") ||
        toggleLi?.classList.contains("lf-mobile-only-group");

      if (isMobileOnly && window.innerWidth > MOBILE_DRAWER_BREAKPOINT) {
        parentSub.style.display = "none";
        return;
      }

      parentSub.style.display = "block";
      if (toggleLi && toggleLi.classList.contains("m_dashbord")) {
        toggleLi.classList.add("expanded", "has-active-child");
      }
    }
  });

  updateBreadcrumbAndTitle(page);
}

function clearOldPage() {
  const container =
    document.querySelector(".content-box[data-staging-content-box='true']") ||
    getLiveContentBox();

  cleanupSubpageGlobalListeners();

  if (window.editor && typeof window.editor.destroy === "function") {
    window.editor.destroy().catch((error) => console.warn("Editor cleanup failed:", error));
    window.editor = null;
  }

  document.querySelectorAll(DYNAMIC_PAGE_SCRIPT_SELECTOR).forEach((script) => {
    if (script.dataset.preserve !== "true") {
      script.remove();
    }
  });

  // Clean up any leftover Bootstrap modal backdrop from a previous page
  document.querySelectorAll("body > .modal-backdrop").forEach((backdrop) => backdrop.remove());
  document.body.classList.remove("modal-open");
  if (document.getElementById("subscriptionModal")?.style.display !== "flex") {
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
  }

  if (container) {
    container.innerHTML = "";
  }
}

function renderRouteError(liveContainer, page, errorMessage) {
  if (!liveContainer) return;
  liveContainer.innerHTML = `
    <div class="spa-page-canvas">
      <div class="lf-route-error">
        <div class="lf-route-error__icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <h3>Unable to Load Module</h3>
        <p>${errorMessage || `The requested view "${page}" could not be loaded. Please check your connection and try again.`}</p>
        <div class="lf-route-error__actions">
          <button type="button" class="lf-route-error__btn" id="lfRetryRouteBtn">Retry</button>
          <button type="button" class="lf-route-error__btn lf-route-error__btn--primary" id="lfHomeRouteBtn">Go to Dashboard</button>
        </div>
      </div>
    </div>
  `;

  liveContainer.querySelector("#lfRetryRouteBtn")?.addEventListener("click", () => loadPage(page));
  liveContainer.querySelector("#lfHomeRouteBtn")?.addEventListener("click", () => loadPage("dashboard"));
}

async function loadPage(page, Name, _id, customBaseUrl, name, options = {}) {
  if (!page) return;

  closeAllPopovers();
  closeMobileSidebar();

  const transitionId = ++pageTransitionSequence;
  const transitionSession = {
    id: transitionId,
    pendingFetches: 0,
    lastActivityAt: performance.now()
  };
  activePageTransitionSession = transitionSession;
  const routeToken = window.AppTopLoader?.start(`route:${page}`);
  let stagingContainer = null;

  fetchNotifications();

  const liveContainer =
    document.querySelector(".content-box:not([data-staging-content-box='true'])") ||
    document.querySelector(".content-box");

  try {
    if (!liveContainer) {
      throw new Error("Live content container not found.");
    }

    stagingContainer = createHiddenPageBuildContainer(liveContainer);
    if (!stagingContainer) {
      throw new Error("Unable to create hidden build container.");
    }

    const cacheBust = Date.now();
    const response = await fetch(`pages/pages/${page}.html?t=${cacheBust}`, {
      __topLoaderSilent: true
    });
    if (!response.ok) {
      throw new Error(`Failed to load page "${page}" (HTTP ${response.status}).`);
    }

    const html = await response.text();
    clearOldPage();

    // Update URL & History BEFORE running the page script (many subpages read URLSearchParams on init!)
    const currentSearch = new URLSearchParams(window.location.search);
    const nextParams = new URLSearchParams();
    nextParams.set("page", page);

    if (options.preserveUrlParams) {
      currentSearch.forEach((val, key) => {
        if (key !== "page") nextParams.set(key, val);
      });
    } else {
      if (Name !== undefined && Name !== null && Name !== "") nextParams.set("Name", Name);
      if (_id !== undefined && _id !== null && _id !== "") nextParams.set("_id", _id);
      if (name !== undefined && name !== null && name !== "") nextParams.set("name", name);
      if (currentSearch.has("debug")) nextParams.set("debug", currentSearch.get("debug"));
    }

    const statePayload = {
      page,
      Name: nextParams.get("Name") || undefined,
      _id: nextParams.get("_id") || undefined,
      name: nextParams.get("name") || undefined
    };

    if (!options.fromPopstate) {
      const nextQuery = `?${nextParams.toString()}`;
      if (window.location.search !== nextQuery) {
        window.history.pushState(statePayload, "", nextQuery);
      } else {
        window.history.replaceState(statePayload, "", nextQuery);
      }
    }

    // Mount subpage inside `.spa-page-canvas` and isolate any leaked global CSS rules
    mountNormalizedSubpage(stagingContainer, html, page);

    if (pageUsesEditor(stagingContainer)) {
      await loadScript("./editor.js");
    }

    isCapturingSubpageListeners = true;
    await loadScript(`pages/pages/${page}.js?t=${cacheBust}`)
      .catch((scriptErr) => {
        // Allow static HTML-only subpages to still render even if they have no companion .js
        console.warn(`Optional/companion script notice for "${page}":`, scriptErr.message);
      })
      .finally(() => {
        isCapturingSubpageListeners = false;
      });

    if (user && user.role === "staff") {
      checkAndHidePrintSettingButton(user);
    }

    await waitForPageStability(stagingContainer, transitionSession);

    if (activePageTransitionSession?.id !== transitionId) {
      return;
    }

    swapBuiltPageIntoLiveContainer(stagingContainer, liveContainer);
    if (getCurrentTheme() === "dark") {
      adaptSubpageInlineStylesForTheme(liveContainer, true);
      syncChartsForTheme(true);
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    ensureSubscriptionBannerShell();
    renderSubscriptionBanner(getPortalSubscriptionState(user));
    positionSubscriptionBanner();

    highlightActiveMenuItem(page);
  } catch (error) {
    console.error(error);
    if (activePageTransitionSession?.id === transitionId) {
      renderRouteError(liveContainer, page, error?.message);
    }
  } finally {
    destroyHiddenPageBuildContainer(stagingContainer);
    if (activePageTransitionSession?.id === transitionId) {
      activePageTransitionSession = null;
    }
    if (routeToken) {
      window.AppTopLoader?.done(routeToken);
    }
  }
}

window.loadPage = loadPage;

function loadScript(url) {
  if (url === "./editor.js") {
    if (typeof window.editorInit === "function") {
      return Promise.resolve(null);
    }
    if (window.__editorPageScriptPromise) {
      return window.__editorPageScriptPromise;
    }
  }

  const loadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(
      `${DYNAMIC_PAGE_SCRIPT_SELECTOR}[data-script-url="${url}"]`
    );
    if (existingScript) {
      if (url === "./editor.js") {
        resolve(existingScript);
        return;
      }
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = false;
    script.dataset.dynamicPageScript = "true";
    script.dataset.scriptUrl = url;
    if (url === "./editor.js") {
      script.dataset.preserve = "true";
    }
    script.onload = () => {
      if (url === "./editor.js") {
        window.__editorPageScriptPromise = Promise.resolve(script);
      }
      resolve(script);
    };
    script.onerror = () => {
      if (url === "./editor.js") {
        window.__editorPageScriptPromise = null;
      }
      script.remove();
      reject(new Error(`Failed to load script: ${url}`));
    };
    document.body.appendChild(script);
  });

  if (url === "./editor.js") {
    window.__editorPageScriptPromise = loadPromise;
  }

  return loadPromise;
}

window.loadScript = loadScript;

function attachMenuEventListeners() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const page = item.getAttribute("data-page");
      if (page) {
        loadPage(page);
      }
    });
  });
}

// Debug function to help troubleshoot admin layers
function debugAdminLayer() {
  const isDebugMode =
    localStorage.getItem("debugMode") === "true" ||
    window.location.search.includes("debug=true");

  if (!isDebugMode) return;

  const debugPanel = document.createElement("div");
  debugPanel.style.position = "fixed";
  debugPanel.style.bottom = "12px";
  debugPanel.style.right = "12px";
  debugPanel.style.backgroundColor = "rgba(15, 23, 42, 0.92)";
  debugPanel.style.color = "#f8fafc";
  debugPanel.style.padding = "12px";
  debugPanel.style.borderRadius = "10px";
  debugPanel.style.zIndex = "9999";
  debugPanel.style.fontSize = "12px";
  debugPanel.style.maxWidth = "280px";

  const layerSelector = document.createElement("select");
  layerSelector.style.color = "#0f172a";
  layerSelector.style.width = "100%";
  layerSelector.style.padding = "4px";
  layerSelector.style.borderRadius = "6px";
  layerSelector.innerHTML = `
    <option value="1">Layer 1</option>
    <option value="2">Layer 2</option>
    <option value="3">Layer 3</option>
    <option value="4">Layer 4</option>
  `;

  const currentLayer = localStorage.getItem("superFranchisee") || "2layer";
  layerSelector.value = currentLayer;

  layerSelector.addEventListener("change", (e) => {
    const newLayer = e.target.value;
    localStorage.setItem("superFranchisee", newLayer);
    const roleWithLayer = `superFranchisee${newLayer}`;
    initializeMenu(roleWithLayer);
    const roleNode = document.getElementById("current-role");
    if (roleNode) roleNode.textContent = roleWithLayer;
  });

  debugPanel.innerHTML = `
    <div style="margin-bottom:8px;"><strong>Admin Layer Debug</strong></div>
    <div style="margin-bottom:6px;">Current Role: <span id="current-role">${userRole || "unknown"}</span></div>
    <div style="margin-bottom:4px;">Override Layer:</div>
  `;

  debugPanel.appendChild(layerSelector);

  const reloadButton = document.createElement("button");
  reloadButton.textContent = "Apply & Reload";
  reloadButton.style.marginTop = "8px";
  reloadButton.style.padding = "6px";
  reloadButton.style.width = "100%";
  reloadButton.style.borderRadius = "6px";
  reloadButton.style.background = "#2563eb";
  reloadButton.style.color = "#fff";
  reloadButton.style.border = "0";
  reloadButton.addEventListener("click", () => window.location.reload());

  debugPanel.appendChild(reloadButton);
  document.body.appendChild(debugPanel);
}

// ==========================================================================
// BOOTSTRAP ON DOM READY
// ==========================================================================

document.addEventListener("DOMContentLoaded", async function () {
  installPageFetchTracking();
  installSubpageListenerTracking();
  initThemeControls();
  installThemeDomObserver();
  initPopovers();
  initSidebarFilter();
  initCommandPalette();
  initFullscreenControl();
  syncResponsiveSidebar(true);

  const mobileBackdrop = document.getElementById("lfSidebarBackdrop");
  const mobileCloseBtn = document.getElementById("lfSidebarCloseBtn");
  mobileBackdrop?.addEventListener("click", closeMobileSidebar);
  mobileCloseBtn?.addEventListener("click", closeMobileSidebar);

  ensureSubscriptionBannerShell();
  window.addEventListener("resize", () => {
    syncResponsiveSidebar(false);
    positionSubscriptionBanner();
  });

  // Verify token and initialize user data & permissions
  await verifyAccessToken();

  if (subscriptionStatusInterval) {
    clearInterval(subscriptionStatusInterval);
  }
  subscriptionStatusInterval = setInterval(refreshSubscriptionBanner, 60000);
  refreshSubscriptionBanner();

  // Attach UPI screenshot upload handler
  const upiForm = document.getElementById("upiForm");
  if (upiForm) {
    upiForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const fileInput = document.getElementById("upiScreenshot");
      const statusDiv = document.getElementById("upiStatus");
      if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        if (statusDiv) {
          statusDiv.textContent = "Please select a screenshot to upload.";
          statusDiv.style.color = "#dc2626";
        }
        return;
      }
      const formData = new FormData();
      formData.append("screenshot", fileInput.files[0]);
      formData.append("userId", userId || "");
      try {
        if (statusDiv) {
          statusDiv.textContent = "Uploading...";
          statusDiv.style.color = "#2563eb";
        }
        const res = await fetch(`${BASE_URL}/api/v1/user/upload-upi-screenshot`, {
          method: "POST",
          body: formData,
          credentials: "include"
        });
        if (res.ok) {
          if (statusDiv) {
            statusDiv.textContent = "Screenshot uploaded! SuperAdmin will verify and activate your account.";
            statusDiv.style.color = "#16a34a";
          }
        } else {
          if (statusDiv) {
            statusDiv.textContent = "Upload failed. Try again.";
            statusDiv.style.color = "#dc2626";
          }
        }
      } catch (err) {
        if (statusDiv) {
          statusDiv.textContent = "Error uploading screenshot.";
          statusDiv.style.color = "#dc2626";
        }
        console.error("Error uploading screenshot", err);
      }
    });
  }

  const logoutButton = document.getElementById("logoutButton");
  if (logoutButton) {
    logoutButton.addEventListener("click", logout);
    logoutButton.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        logout();
      }
    });
  }

  attachMenuEventListeners();

  // Load initial page from URL (preserving any existing deep-link params like _id / Name)
  const urlParams = new URLSearchParams(window.location.search);
  const currentPage = urlParams.get("page") || "dashboard";
  loadPage(
    currentPage,
    urlParams.get("Name") || undefined,
    urlParams.get("_id") || undefined,
    BASE_URL,
    urlParams.get("name") || undefined,
    { preserveUrlParams: true }
  );

  // Handle browser back/forward navigation cleanly without duplicating history entries
  window.addEventListener("popstate", (event) => {
    const params = new URLSearchParams(window.location.search);
    const targetPage = event.state?.page || params.get("page") || "dashboard";
    loadPage(
      targetPage,
      event.state?.Name || params.get("Name") || undefined,
      event.state?._id || params.get("_id") || undefined,
      BASE_URL,
      event.state?.name || params.get("name") || undefined,
      { fromPopstate: true, preserveUrlParams: true }
    );
  });

  debugAdminLayer();
});

function loaderfunction() {
  window.AppTopLoader?.scanLegacyLoaders(document);
}

loaderfunction();
