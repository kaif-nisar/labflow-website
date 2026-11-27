/**
 * Dynamic Page Loader — Enterprise Zero-Blank SPA Router
 * Handles navigation, refresh snapshot hydration, and full API/HTML buffering.
 */

window.BASE_URL = window.location.origin;
const portalGuard = window.AppPortalGuard.configure({
    loginPath: "/login.html",
    homePath: "/superAdmin/superAdmin.html",
    useFetchGuard: true,
    sessionType: "superAdmin",
});

const SUPERADMIN_SNAPSHOT_STORAGE_KEY = "lf_spa_snapshot_superadmin";
const SILENT_BACKGROUND_API_PATTERNS = [
    "/api/session",
    "/api/v1/user/getnewnotificationforadmin",
    "/api/v1/user/check-subscription"
];

let saTransitionSequence = 0;
let activeSaTransitionSession = null;
let committedSaPageState = null;
let currentSaActivePage = null;
let currentSaActiveQueryKey = null;
let isSaNetworkTrackingInstalled = false;
let isSaListenerTrackingInstalled = false;
let isSaTimerTrackingInstalled = false;
let isSaCapturingListeners = false;
let activeSaListenerTarget = null;
let activeSaDomReadyQueue = null;
let currentSaTimerOwner = null;
const saReExecIsolatedScripts = new Set();

function loaderfunction() {
    window.AppTopLoader?.scanLegacyLoaders(document);
}

loaderfunction();

function clearSuperAdminSnapshot() {
    try {
        sessionStorage.removeItem(SUPERADMIN_SNAPSHOT_STORAGE_KEY);
    } catch (e) {}
}

function isSilentSaTransitionUrl(rawUrl) {
    const url = String(rawUrl || "");
    if (!url) return false;
    return SILENT_BACKGROUND_API_PATTERNS.some((pattern) => url.includes(pattern));
}

function getSaRouteTitle(page) {
    if (!page) return "Workspace";
    const safePage = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(page) : String(page);
    const navMatch = document.querySelector(`.menu-item[data-page="${safePage}"]`);
    const text = navMatch?.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
    return String(page).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SaBufferHud = (() => {
    let progress = 0;
    let trickleTimer = null;
    let hideTimer = null;

    function stopTrickle() {
        if (trickleTimer) {
            window.clearInterval(trickleTimer);
            trickleTimer = null;
        }
    }

    function paintProgress(pct) {
        progress = Math.max(0, Math.min(100, Number(pct) || 0));
        const ratio = (progress / 100).toFixed(3);
        document.documentElement.style.setProperty("--lf-rail-progress", ratio);
    }

    function clearNavLoading() {
        document.querySelectorAll(".menu-item.is-route-loading").forEach((el) => {
            el.classList.remove("is-route-loading");
            el.removeAttribute("aria-busy");
        });
        document.querySelectorAll(".lf-nav-pending-spinner").forEach((sp) => sp.remove());
    }

    function markNavLoading(page, preferredTrigger = null) {
        clearNavLoading();
        const sidebarEl = document.getElementById("sidebar");
        if (!sidebarEl) return;

        let targetEl = null;
        if (preferredTrigger instanceof HTMLElement && sidebarEl.contains(preferredTrigger)) {
            targetEl = preferredTrigger;
        } else if (page) {
            const safePage = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(page) : String(page);
            targetEl = sidebarEl.querySelector(`.menu-item[data-page="${safePage}"]`);
        }

        if (!targetEl) return;
        targetEl.classList.add("is-route-loading");
        targetEl.setAttribute("aria-busy", "true");
        if (!targetEl.querySelector(".lf-nav-pending-spinner")) {
            const spinner = document.createElement("span");
            spinner.className = "lf-nav-pending-spinner";
            spinner.setAttribute("aria-hidden", "true");
            targetEl.appendChild(spinner);
        }
    }

    function start(page, { isBoot = false, triggerEl = null } = {}) {
        if (hideTimer) {
            window.clearTimeout(hideTimer);
            hideTimer = null;
        }
        if (window.__lfBootProgressTimer) {
            window.clearInterval(window.__lfBootProgressTimer);
            window.__lfBootProgressTimer = null;
        }

        const startPct = isBoot && typeof window.__lfBootProgress === "number"
            ? Math.max(14, Math.min(58, window.__lfBootProgress))
            : 16;

        document.getElementById("lfInstantRail")?.classList.add("is-active");
        markNavLoading(page, triggerEl);

        paintProgress(startPct);
        stopTrickle();
        trickleTimer = window.setInterval(() => {
            if (progress >= 92) return;
            const step = Math.max(0.6, (92 - progress) * 0.08);
            paintProgress(Math.min(92, progress + step));
        }, 180);
    }

    function setStage(minPct) {
        if (typeof minPct === "number" && minPct > progress) {
            paintProgress(minPct);
        }
    }

    function updateNetworkStatus(session) {
        if (!session || session !== activeSaTransitionSession) return;
        if (session.pendingFetches > 0) {
            setStage(Math.max(progress, 74));
        } else if (session.totalFetchesStarted > 0) {
            setStage(Math.max(progress, 90));
        }
    }

    function finish({ immediate = false } = {}) {
        stopTrickle();
        clearNavLoading();
        paintProgress(100);

        const hideNow = () => {
            document.getElementById("lfInstantRail")?.classList.remove("is-active");
            hideTimer = null;
        };

        if (immediate) hideNow();
        else hideTimer = window.setTimeout(hideNow, 180);
    }

    function abort() {
        stopTrickle();
        clearNavLoading();
        document.getElementById("lfInstantRail")?.classList.remove("is-active");
    }

    return { start, setStage, updateNetworkStatus, finish, abort };
})();

function showSaRouteErrorToast(page, errorMessage, onRetry) {
    const host = document.getElementById("lfRouteToastHost");
    if (!host) return;
    host.querySelectorAll(".lf-route-toast").forEach((n) => n.remove());

    const label = getSaRouteTitle(page);
    const safeMsg = String(errorMessage || "Unable to fetch page or API data.")
        .replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" }[ch]));

    const toast = document.createElement("div");
    toast.className = "lf-route-toast";
    toast.setAttribute("role", "alert");
    toast.innerHTML = `
        <span class="lf-route-toast__icon"><i class="fa-solid fa-triangle-exclamation"></i></span>
        <div class="lf-route-toast__body">
            <p class="lf-route-toast__title">Could not open ${label}</p>
            <p class="lf-route-toast__msg">${safeMsg} Staying on your current page.</p>
            <div class="lf-route-toast__actions">
                <button type="button" class="lf-route-toast__btn lf-route-toast__btn--primary" data-toast-retry="1">Retry</button>
                <button type="button" class="lf-route-toast__btn" data-toast-dismiss="1">Dismiss</button>
            </div>
        </div>
        <button type="button" class="lf-route-toast__close" aria-label="Close" data-toast-dismiss="1">&times;</button>
    `;

    const closeToast = () => toast.remove();
    toast.querySelectorAll("[data-toast-dismiss='1']").forEach((btn) => btn.addEventListener("click", closeToast));
    toast.querySelector("[data-toast-retry='1']")?.addEventListener("click", () => {
        closeToast();
        if (typeof onRetry === "function") onRetry();
    });

    host.appendChild(toast);
    window.setTimeout(() => {
        if (toast.isConnected) toast.remove();
    }, 8000);
}

function installSaNetworkTracking() {
    if (isSaNetworkTrackingInstalled) return;
    isSaNetworkTrackingInstalled = true;

    if (typeof window.fetch === "function") {
        const originalFetch = window.fetch.bind(window);
        window.fetch = function trackedSaFetch(input, init) {
            const session = activeSaTransitionSession;
            const reqUrl = typeof input === "string" ? input : (input && input.url ? input.url : "");
            const isSilent = Boolean((init && init.__topLoaderSilent) || isSilentSaTransitionUrl(reqUrl));

            if (!session || isSilent) {
                return originalFetch(input, init);
            }

            session.pendingFetches += 1;
            session.totalFetchesStarted += 1;
            session.lastActivityAt = performance.now();
            SaBufferHud.updateNetworkStatus(session);

            return Promise.resolve(originalFetch(input, init)).finally(() => {
                session.pendingFetches = Math.max(0, session.pendingFetches - 1);
                session.lastActivityAt = performance.now();
                SaBufferHud.updateNetworkStatus(session);
            });
        };
    }

    if (typeof window.XMLHttpRequest === "function" && window.XMLHttpRequest.prototype) {
        const origOpen = window.XMLHttpRequest.prototype.open;
        const origSend = window.XMLHttpRequest.prototype.send;

        window.XMLHttpRequest.prototype.open = function trackedSaXhrOpen(method, url) {
            this.__lfRequestUrl = String(url || "");
            return origOpen.apply(this, arguments);
        };

        window.XMLHttpRequest.prototype.send = function trackedSaXhrSend() {
            const session = activeSaTransitionSession;
            const isSilent = Boolean(this.__lfTopLoaderSilent || isSilentSaTransitionUrl(this.__lfRequestUrl));

            if (!session || isSilent) {
                return origSend.apply(this, arguments);
            }

            session.pendingFetches += 1;
            session.totalFetchesStarted += 1;
            session.lastActivityAt = performance.now();
            SaBufferHud.updateNetworkStatus(session);

            const topToken = window.AppTopLoader?.start(this.__lfRequestUrl || "xhr");
            let settled = false;
            const onFinish = () => {
                if (settled) return;
                settled = true;
                session.pendingFetches = Math.max(0, session.pendingFetches - 1);
                session.lastActivityAt = performance.now();
                SaBufferHud.updateNetworkStatus(session);
                if (topToken) window.AppTopLoader?.done(topToken);
            };

            this.addEventListener("loadend", onFinish, { once: true });
            return origSend.apply(this, arguments);
        };
    }
}

function installSaListenerTracking() {
    if (isSaListenerTrackingInstalled) return;
    isSaListenerTrackingInstalled = true;

    [window, document].forEach((target) => {
        const origAdd = target.addEventListener.bind(target);
        const origRemove = target.removeEventListener.bind(target);

        target.addEventListener = function trackedSaAddEventListener(type, listener, options) {
            const isFnOrObj = typeof listener === "function" || (listener && typeof listener.handleEvent === "function");
            if (isSaCapturingListeners && isFnOrObj) {
                if (target === document && type === "DOMContentLoaded" && document.readyState !== "loading") {
                    if (Array.isArray(activeSaDomReadyQueue)) {
                        activeSaDomReadyQueue.push(listener);
                    }
                    return;
                }
                if (Array.isArray(activeSaListenerTarget)) {
                    activeSaListenerTarget.push({ target, type, listener, options, origRemove });
                }
            }
            return origAdd(type, listener, options);
        };
    });
}

function installSaTimerTracking() {
    if (isSaTimerTrackingInstalled) return;
    isSaTimerTrackingInstalled = true;

    const origSetInterval = window.setInterval.bind(window);
    const origClearInterval = window.clearInterval.bind(window);
    const origSetTimeout = window.setTimeout.bind(window);
    const origClearTimeout = window.clearTimeout.bind(window);
    const trackedTimeoutTokens = new Map();

    window.setInterval = function trackedSaSetInterval(fn, delay) {
        const owner = currentSaTimerOwner;
        if (!owner || typeof fn !== "function") {
            return origSetInterval.apply(window, arguments);
        }

        const args = Array.prototype.slice.call(arguments, 2);
        let intervalId = null;
        const wrapped = () => {
            if (owner.destroyed) {
                if (intervalId !== null) origClearInterval(intervalId);
                return;
            }
            if (activeSaTransitionSession && committedSaPageState === owner) {
                return;
            }
            fn.apply(window, args);
        };

        intervalId = origSetInterval(wrapped, delay);
        owner.intervals.add(intervalId);
        return intervalId;
    };

    window.clearInterval = function trackedSaClearInterval(id) {
        if (committedSaPageState?.intervals) committedSaPageState.intervals.delete(id);
        if (activeSaTransitionSession?.pageState?.intervals) activeSaTransitionSession.pageState.intervals.delete(id);
        return origClearInterval(id);
    };

    window.setTimeout = function trackedSaSetTimeout(fn, delay) {
        const owner = currentSaTimerOwner;
        const session = activeSaTransitionSession;
        const ms = Number(delay) || 0;

        if (!owner || typeof fn !== "function") {
            return origSetTimeout.apply(window, arguments);
        }

        const args = Array.prototype.slice.call(arguments, 2);
        const shouldAwaitStartup = Boolean(session && session.pageState === owner && session.isBootstrappingTimers && ms <= 750);
        if (shouldAwaitStartup) {
            session.pendingStartupTimers += 1;
        }

        let timeoutId = null;
        const wrapped = () => {
            trackedTimeoutTokens.delete(timeoutId);
            try {
                if (!owner.destroyed) fn.apply(window, args);
            } finally {
                if (shouldAwaitStartup) {
                    session.pendingStartupTimers = Math.max(0, session.pendingStartupTimers - 1);
                    session.lastActivityAt = performance.now();
                }
            }
        };

        timeoutId = origSetTimeout(wrapped, delay);
        owner.timeouts.add(timeoutId);
        if (shouldAwaitStartup) {
            trackedTimeoutTokens.set(timeoutId, session);
        }
        return timeoutId;
    };

    window.clearTimeout = function trackedSaClearTimeout(id) {
        const session = trackedTimeoutTokens.get(id);
        if (session) {
            trackedTimeoutTokens.delete(id);
            session.pendingStartupTimers = Math.max(0, session.pendingStartupTimers - 1);
        }
        if (committedSaPageState?.timeouts) committedSaPageState.timeouts.delete(id);
        if (activeSaTransitionSession?.pageState?.timeouts) activeSaTransitionSession.pageState.timeouts.delete(id);
        return origClearTimeout(id);
    };
}

function scopeSaSubpageStyles(canvas) {
    if (!(canvas instanceof HTMLElement)) return;
    canvas.querySelectorAll("style").forEach((styleEl) => {
        const css = styleEl.textContent;
        if (!css) return;
        const rewritten = css
            .replace(/(^|\})\s*\*\s*\{/g, "$1 .spa-page-canvas * {")
            .replace(/(^|\})\s*body\s*\{/gi, "$1 .spa-page-canvas {")
            .replace(/(^|\})\s*html\s*\{/gi, "$1 .spa-page-canvas {");
        if (rewritten !== css) {
            styleEl.textContent = rewritten;
        }
    });
}

function createSaPageStateRecord(page) {
    return {
        page,
        destroyed: false,
        scripts: [],
        globalListeners: [],
        intervals: new Set(),
        timeouts: new Set(),
        cleanupFn: null
    };
}

function teardownSaPageState(pageState, liveContainer = null, clearDom = false) {
    if (!pageState || pageState.destroyed) {
        if (clearDom && liveContainer) liveContainer.innerHTML = "";
        return;
    }

    pageState.destroyed = true;
    pageState.intervals.forEach((id) => { try { window.clearInterval(id); } catch (e) {} });
    pageState.intervals.clear();
    pageState.timeouts.forEach((id) => { try { window.clearTimeout(id); } catch (e) {} });
    pageState.timeouts.clear();

    while (pageState.globalListeners.length > 0) {
        const entry = pageState.globalListeners.pop();
        try { entry.origRemove(entry.type, entry.listener, entry.options); } catch (e) {}
    }

    if (typeof pageState.cleanupFn === "function") {
        try { pageState.cleanupFn(); } catch (e) { console.warn("cleanupCurrentPage failed:", e); }
        pageState.cleanupFn = null;
    }

    if (committedSaPageState === pageState && typeof window.cleanupCurrentPage === "function") {
        try { window.cleanupCurrentPage(); } catch (e) { console.warn("window.cleanupCurrentPage failed:", e); }
        window.cleanupCurrentPage = null;
    }

    if (committedSaPageState === pageState) {
        if (window.editor && typeof window.editor.destroy === "function") {
            window.editor.destroy().catch((err) => console.warn("Editor cleanup failed:", err));
            window.editor = null;
        }
        document.querySelectorAll("body > .modal-backdrop").forEach((b) => b.remove());
        document.body.classList.remove("modal-open");
    }

    pageState.scripts.forEach((s) => {
        if (s && s.getAttribute?.("data-preserve") !== "true") {
            try { s.remove(); } catch (e) {}
        }
    });
    pageState.scripts = [];

    if (clearDom && liveContainer) liveContainer.innerHTML = "";
}

function serializeSaSnapshotHtml(container) {
    if (!(container instanceof HTMLElement)) return "";
    if (container.querySelector("[data-lf-snapshot='true'], [data-lf-boot-skeleton='true'], .lf-route-error")) {
        return "";
    }
    if (!container.querySelector(".spa-page-canvas")) return "";

    const clone = container.cloneNode(true);
    clone.querySelectorAll("script, [data-lf-transient='true'], .modal-backdrop").forEach((el) => el.remove());

    const origInputs = container.querySelectorAll("input, textarea, select");
    const cloneInputs = clone.querySelectorAll("input, textarea, select");
    origInputs.forEach((origEl, idx) => {
        const targetEl = cloneInputs[idx];
        if (!targetEl) return;
        if (origEl instanceof HTMLInputElement) {
            if (origEl.type === "checkbox" || origEl.type === "radio") {
                if (origEl.checked) targetEl.setAttribute("checked", "checked");
                else targetEl.removeAttribute("checked");
            } else if (origEl.type !== "password" && origEl.type !== "file") {
                targetEl.setAttribute("value", origEl.value);
            }
        } else if (origEl instanceof HTMLTextAreaElement) {
            targetEl.textContent = origEl.value;
        } else if (origEl instanceof HTMLSelectElement) {
            const selected = new Set(Array.from(origEl.selectedOptions).map((o) => o.value));
            Array.from(targetEl.options).forEach((opt) => {
                if (selected.has(opt.value)) opt.setAttribute("selected", "selected");
                else opt.removeAttribute("selected");
            });
        }
    });

    const origCanvases = container.querySelectorAll("canvas");
    const cloneCanvases = clone.querySelectorAll("canvas");
    let canvasBytesUsed = 0;
    origCanvases.forEach((origCanvas, idx) => {
        const targetCanvas = cloneCanvases[idx];
        if (!targetCanvas || !targetCanvas.parentNode) return;
        if (origCanvas.width <= 0 || origCanvas.height <= 0 || canvasBytesUsed > 650000) return;
        try {
            const dataUrl = origCanvas.toDataURL("image/png");
            if (!dataUrl || dataUrl.length > 320000) return;
            canvasBytesUsed += dataUrl.length;
            const img = document.createElement("img");
            img.src = dataUrl;
            img.alt = "";
            img.className = `${origCanvas.className ? origCanvas.className + " " : ""}lf-snapshot-canvas`;
            const rect = origCanvas.getBoundingClientRect();
            img.style.width = rect.width ? `${Math.round(rect.width)}px` : "100%";
            img.style.height = rect.height ? `${Math.round(rect.height)}px` : "auto";
            targetCanvas.parentNode.replaceChild(img, targetCanvas);
        } catch (e) {}
    });

    const html = clone.innerHTML;
    if (html.length > 1600000) {
        clone.querySelectorAll("img.lf-snapshot-canvas").forEach((img) => img.remove());
        const compact = clone.innerHTML;
        return compact.length <= 1600000 ? compact : "";
    }
    return html;
}

function captureSuperAdminSnapshot() {
    try {
        if (!currentSaActivePage || !committedSaPageState) return;
        const container = window.router?.container || document.querySelector(".content") || document.getElementById("main-content");
        const contentHtml = serializeSaSnapshotHtml(container);
        if (!contentHtml) return;

        sessionStorage.setItem(SUPERADMIN_SNAPSHOT_STORAGE_KEY, JSON.stringify({
            pathname: window.location.pathname,
            search: window.location.search,
            page: currentSaActivePage,
            ts: Date.now(),
            scrollY: Math.round(window.scrollY || window.pageYOffset || 0),
            contentHtml
        }));
    } catch (e) {}
}

let isSaSnapshotPersistenceInstalled = false;
function installSaSnapshotPersistence() {
    if (isSaSnapshotPersistenceInstalled) return;
    isSaSnapshotPersistenceInstalled = true;
    window.addEventListener("pagehide", captureSuperAdminSnapshot);
    window.addEventListener("beforeunload", captureSuperAdminSnapshot);
}

function extractSaTopLevelFunctionNames(codeText) {
    const names = [];
    const seen = new Set();
    const re = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
    let match;
    while ((match = re.exec(codeText)) !== null) {
        if (match[1] && !seen.has(match[1])) {
            seen.add(match[1]);
            names.push(match[1]);
        }
    }
    return names;
}

async function flushSaCapturedDomReadyCallbacks(queue) {
    if (!Array.isArray(queue) || queue.length === 0) return;
    for (const listener of queue) {
        try {
            const evt = new Event("DOMContentLoaded");
            if (typeof listener === "function") {
                const res = listener.call(document, evt);
                if (res && typeof res.then === "function") await res;
            } else if (listener && typeof listener.handleEvent === "function") {
                const res = listener.handleEvent(evt);
                if (res && typeof res.then === "function") await res;
            }
        } catch (err) {
            console.error("Subpage DOMContentLoaded handler error:", err);
        }
    }
}

function waitForSaAnimationFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForSaPageStability(container, session, options = {}) {
    const quietWindowMs = options.quietWindowMs || 280;
    const timeoutMs = options.timeoutMs || 20000;
    const startedAt = performance.now();
    let lastMutationAt = performance.now();
    let slowHintShown = false;

    const observer = new MutationObserver(() => {
        lastMutationAt = performance.now();
        if (session) session.lastActivityAt = lastMutationAt;
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
            if (session && activeSaTransitionSession && activeSaTransitionSession.id !== session.id) {
                return false;
            }

            await waitForSaAnimationFrame();
            await waitForSaAnimationFrame();

            const now = performance.now();
            const pendingNetwork = session ? session.pendingFetches : 0;
            const pendingTimers = session ? session.pendingStartupTimers : 0;
            const domQuiet = now - lastMutationAt >= quietWindowMs;

            if (!slowHintShown && now - startedAt > 2600 && pendingNetwork > 0) {
                slowHintShown = true;
                SaBufferHud.setStage(84, `Still syncing API data (${pendingNetwork} pending)...`);
            }

            if (pendingNetwork === 0 && pendingTimers === 0 && domQuiet) {
                await waitForSaAnimationFrame();
                return true;
            }
        }
    } finally {
        observer.disconnect();
    }

    return false;
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", async function () {
    installSaNetworkTracking();
    installSaListenerTracking();
    installSaTimerTracking();
    installSaSnapshotPersistence();

    const logoutButton = document.getElementById("logout");
    if (logoutButton) {
        logoutButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            logout();
        });
    }

    window.appState = {
        loadedScripts: new Set(),
        loadedStyles: new Set(),
        currentPage: null,
        pageParams: {}
    };

    initNavigation();

    const urlParams = new URLSearchParams(window.location.search);
    const currentPage = urlParams.get("page") || "dashboard";

    let bootRestoreScrollY = 0;
    try {
        const rawSnap = sessionStorage.getItem(SUPERADMIN_SNAPSHOT_STORAGE_KEY);
        if (rawSnap) {
            const parsedSnap = JSON.parse(rawSnap);
            if (parsedSnap && parsedSnap.search === window.location.search) {
                bootRestoreScrollY = Number(parsedSnap.scrollY) || 0;
            }
        }
    } catch (e) {}

    // Fetch initial HTML in parallel with session check
    const preFetchedHtmlPromise = fetch(`pages/${currentPage}.html?t=${Date.now()}`, {
        __topLoaderSilent: true
    }).catch(() => null);

    let session = null;
    try {
        session = await portalGuard.ensureSession({
            type: "superAdmin",
            strict: true,
            loginPath: "/login.html",
        });
    } catch (error) {
        console.error("Super admin session validation failed:", error);
    }

    if (!session) {
        SaBufferHud.abort();
        clearSuperAdminSnapshot();
        return;
    }

    await initializeRouter({
        initialPage: currentPage,
        preFetchedHtmlPromise,
        restoreScrollY: bootRestoreScrollY
    });
});

/**
 * Initialize navigation system (single clean handler without duplicate pushState)
 */
function initNavigation() {
    const menuItems = document.querySelectorAll(".menu-item[data-page]");
    menuItems.forEach((item) => {
        if (item.dataset.saNavBound === "true") return;
        item.dataset.saNavBound = "true";
        item.addEventListener("click", function (e) {
            e.preventDefault();
            const pageToLoad = this.getAttribute("data-page");
            if (!pageToLoad) return;

            const sidebar = document.getElementById("sidebar");
            if (sidebar && sidebar.classList.contains("active")) {
                sidebar.classList.remove("active");
            }

            if (window.router) {
                window.router.loadPage(pageToLoad, null, null, null, null, true, { triggerEl: this });
            } else {
                console.error("Router not initialized");
            }
        });
    });

    const toggleSidebar = document.getElementById("toggle-sidebar");
    const sidebar = document.getElementById("sidebar");
    if (toggleSidebar && sidebar && toggleSidebar.dataset.saToggleBound !== "true") {
        toggleSidebar.dataset.saToggleBound = "true";
        toggleSidebar.addEventListener("click", function () {
            sidebar.classList.toggle("active");
        });
    }
}

// Enhanced SPA Router with off-screen staging, full API buffering & zero-blank transitions
class SPARouter {
    constructor(containerSelector = ".content", bootOptions = {}) {
        this.containerSelector = containerSelector;
        this.container = document.querySelector(containerSelector);
        this.BASE_URL = window.location.origin;
        this.loadedScripts = new Set();
        this.currentPageLoaded = null;
        this.currentScript = null;

        if (!this.container) {
            this.container = document.querySelector(".content") ||
                document.querySelector("#content") ||
                document.querySelector("main") ||
                document.querySelector("#main") ||
                document.body;

            if (!this.container) {
                console.error("No suitable container found. Router will not function properly.");
                return;
            }
        }

        this.init(bootOptions);
    }

    init(bootOptions = {}) {
        if (!this.container) return;

        const urlParams = new URLSearchParams(window.location.search);
        const currentPage = bootOptions.initialPage || urlParams.get("page") || "dashboard";

        this.setupDynamicLinks();

        this.loadPage(
            currentPage,
            urlParams.get("Name") || null,
            urlParams.get("_id") || null,
            null,
            urlParams.get("name") || null,
            false,
            {
                preserveUrlParams: true,
                isInitialHydration: true,
                preFetchedHtmlPromise: bootOptions.preFetchedHtmlPromise,
                restoreScrollY: bootOptions.restoreScrollY
            }
        );

        if (!this._popstateBound) {
            this._popstateBound = true;
            window.addEventListener("popstate", (event) => {
                const params = new URLSearchParams(window.location.search);
                const targetPage = event.state?.page || params.get("page") || "dashboard";
                this.loadPage(
                    targetPage,
                    event.state?.Name || params.get("Name") || null,
                    event.state?._id || params.get("_id") || null,
                    null,
                    event.state?.name || params.get("name") || null,
                    false,
                    { fromPopstate: true, preserveUrlParams: true, forceReload: true }
                );
            });
        }
    }

    createHiddenBuildContainer() {
        if (!(this.container instanceof HTMLElement) || !this.container.parentElement) {
            return null;
        }
        const rect = this.container.getBoundingClientRect();
        const staging = document.createElement("div");
        staging.className = this.container.className;
        staging.id = "lf-sa-staging-content";
        staging.dataset.stagingContentBox = "true";
        staging.setAttribute("aria-hidden", "true");
        staging.style.position = "fixed";
        staging.style.left = "-200vw";
        staging.style.top = "0";
        const stageWidth = Math.max(200, Math.round(rect.width || this.container.offsetWidth || 320));
        staging.style.width = `${stageWidth}px`;
        staging.style.maxWidth = `${stageWidth}px`;
        staging.style.visibility = "hidden";
        staging.style.pointerEvents = "none";
        staging.style.opacity = "0";
        staging.style.zIndex = "-1";
        staging.style.overflow = "hidden";

        this.container.parentElement.insertBefore(staging, this.container);
        return staging;
    }

    highlightActiveMenu(page) {
        const safePage = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(page) : String(page);
        document.querySelectorAll(".menu-item").forEach((item) => item.classList.remove("active"));
        document.querySelectorAll(`.menu-item[data-page="${safePage}"]`).forEach((item) => item.classList.add("active"));
        const title = getSaRouteTitle(page);
        document.title = `LabFlow Super Admin | ${title}`;
    }

    async loadPage(page, Name = null, _id = null, BASE_URL = null, name = null, updateHistory = true, options = {}) {
        if (!this.container || !page) return;

        const currentSearch = new URLSearchParams(window.location.search);
        const nextParams = new URLSearchParams();
        nextParams.set("page", page);

        if (options.queryParams && typeof options.queryParams === "object") {
            const entries = options.queryParams instanceof URLSearchParams
                ? Array.from(options.queryParams.entries())
                : Object.entries(options.queryParams);
            entries.forEach(([key, val]) => {
                if (key !== "page" && val !== undefined && val !== null && val !== "") {
                    nextParams.set(key, String(val));
                }
            });
        } else if (options.preserveUrlParams) {
            currentSearch.forEach((val, key) => {
                if (key !== "page") nextParams.set(key, val);
            });
        } else {
            if (Name !== undefined && Name !== null && Name !== "") nextParams.set("Name", Name);
            if (_id !== undefined && _id !== null && _id !== "") nextParams.set("_id", _id);
            if (name !== undefined && name !== null && name !== "") nextParams.set("name", name);
            if (currentSearch.has("debug")) nextParams.set("debug", currentSearch.get("debug"));
        }

        const nextQuery = `?${nextParams.toString()}`;

        // Ignore duplicate click if the exact same route is already buffering
        if (
            activeSaTransitionSession &&
            activeSaTransitionSession.targetQueryKey === nextQuery &&
            !options.forceReload
        ) {
            return;
        }

        const hasLiveContent = Boolean(
            committedSaPageState &&
            this.container.querySelector(".spa-page-canvas") &&
            !this.container.querySelector("[data-lf-snapshot='true'], [data-lf-boot-skeleton='true']")
        );

        const transitionId = ++saTransitionSequence;
        const pendingPageState = createSaPageStateRecord(page);
        const transitionSession = {
            id: transitionId,
            page,
            targetQueryKey: nextQuery,
            pendingFetches: 0,
            totalFetchesStarted: 0,
            pendingStartupTimers: 0,
            isBootstrappingTimers: false,
            lastActivityAt: performance.now(),
            pageState: pendingPageState
        };
        activeSaTransitionSession = transitionSession;

        SaBufferHud.start(page, {
            isBoot: Boolean(options.isInitialHydration),
            triggerEl: options.triggerEl || null
        });

        const prevHref = window.location.href;
        const prevState = window.history.state;
        const prevWindowCleanup = window.cleanupCurrentPage;
        let urlTemporarilyReplaced = false;
        let stagingContainer = null;

        try {
            SaBufferHud.setStage(26, "Fetching page template...");
            const cacheBust = Date.now();
            const html = await this.fetchPageHTML(page, cacheBust, options.preFetchedHtmlPromise);

            if (activeSaTransitionSession?.id !== transitionId) return;

            SaBufferHud.setStage(44, "Staging layout & styles...");
            stagingContainer = this.createHiddenBuildContainer();
            if (!stagingContainer) {
                throw new Error("Unable to create hidden build container.");
            }

            if (!options.fromPopstate && window.location.search !== nextQuery) {
                window.history.replaceState(prevState, "", nextQuery);
                urlTemporarilyReplaced = true;
            }

            const canvas = document.createElement("div");
            canvas.className = "spa-page-canvas";
            canvas.dataset.spaPage = page;
            canvas.innerHTML = html;
            scopeSaSubpageStyles(canvas);
            stagingContainer.innerHTML = "";
            stagingContainer.appendChild(canvas);

            if (stagingContainer.querySelector("#editor")) {
                SaBufferHud.setStage(52, "Loading rich editor...");
                await this.loadPageScript("./editor.js", null);
                if (activeSaTransitionSession?.id !== transitionId) return;
            }

            SaBufferHud.setStage(58, "Initializing page logic...");
            window.cleanupCurrentPage = null;
            window.subpageReady = null;
            isSaCapturingListeners = true;
            activeSaListenerTarget = pendingPageState.globalListeners;
            activeSaDomReadyQueue = [];
            currentSaTimerOwner = pendingPageState;
            transitionSession.isBootstrappingTimers = true;

            const scriptBaseKey = `pages/${page}.js`;
            try {
                await this.loadSubpageScriptForTransition(`${scriptBaseKey}?t=${cacheBust}`, scriptBaseKey, pendingPageState)
                    .catch((scriptErr) => {
                        console.warn(`Optional/companion script notice for "${page}":`, scriptErr.message);
                    });

                if (activeSaTransitionSession?.id === transitionId) {
                    await flushSaCapturedDomReadyCallbacks(activeSaDomReadyQueue);
                }
            } finally {
                isSaCapturingListeners = false;
                activeSaListenerTarget = null;
                activeSaDomReadyQueue = null;
                transitionSession.isBootstrappingTimers = false;
                pendingPageState.cleanupFn = window.cleanupCurrentPage;
                window.cleanupCurrentPage = prevWindowCleanup;
            }

            if (activeSaTransitionSession?.id !== transitionId) return;

            SaBufferHud.setStage(70, "Waiting for live API data...");

            if (window.subpageReady && typeof window.subpageReady.then === "function") {
                try {
                    await window.subpageReady;
                } finally {
                    window.subpageReady = null;
                }
            } else {
                window.subpageReady = null;
            }

            if (activeSaTransitionSession?.id !== transitionId) return;

            await waitForSaPageStability(stagingContainer, transitionSession);
            currentSaTimerOwner = null;

            if (activeSaTransitionSession?.id !== transitionId) return;

            SaBufferHud.setStage(97, "Rendering verified view...");

            // Atomic Commit: teardown outgoing live page ONLY now that new page & APIs finished
            const outgoingPageState = committedSaPageState;
            committedSaPageState = null;
            if (outgoingPageState) {
                teardownSaPageState(outgoingPageState, this.container, false);
            }

            this.container.innerHTML = "";
            const fragment = document.createDocumentFragment();
            while (stagingContainer.firstChild) {
                fragment.appendChild(stagingContainer.firstChild);
            }
            this.container.appendChild(fragment);

            committedSaPageState = pendingPageState;
            window.cleanupCurrentPage = pendingPageState.cleanupFn || null;
            this.currentPageLoaded = page;
            currentSaActivePage = page;
            currentSaActiveQueryKey = nextQuery;
            window.__lfHasBootSnapshot = false;
            if (window.appState) {
                window.appState.currentPage = page;
            }

            const statePayload = {
                page,
                Name: nextParams.get("Name") || undefined,
                _id: nextParams.get("_id") || undefined,
                name: nextParams.get("name") || undefined
            };

            if (updateHistory && !options.fromPopstate) {
                if (urlTemporarilyReplaced) {
                    window.history.replaceState(prevState, "", prevHref);
                    window.history.pushState(statePayload, "", nextQuery);
                } else {
                    window.history.replaceState(statePayload, "", nextQuery);
                }
            } else if (urlTemporarilyReplaced && !options.fromPopstate) {
                window.history.replaceState(statePayload, "", nextQuery);
            }

            const restoreY = options.isInitialHydration && typeof options.restoreScrollY === "number"
                ? options.restoreScrollY
                : 0;
            window.scrollTo({ top: restoreY, left: 0, behavior: "auto" });

            this.highlightActiveMenu(page);
            SaBufferHud.finish();

            window.requestAnimationFrame(() => {
                window.setTimeout(captureSuperAdminSnapshot, 120);
            });
        } catch (error) {
            console.error(`Error loading page ${page}:`, error);
            if (currentSaTimerOwner === pendingPageState) {
                currentSaTimerOwner = null;
            }
            window.cleanupCurrentPage = prevWindowCleanup;

            if (urlTemporarilyReplaced) {
                try { window.history.replaceState(prevState, "", prevHref); } catch (e) {}
            }

            teardownSaPageState(pendingPageState, null, false);

            if (activeSaTransitionSession?.id === transitionId) {
                SaBufferHud.abort();
                if (hasLiveContent) {
                    showSaRouteErrorToast(page, error?.message, () =>
                        this.loadPage(page, Name, _id, BASE_URL, name, updateHistory, options)
                    );
                } else {
                    this.handlePageLoadError(error, page);
                }
            }
        } finally {
            if (currentSaTimerOwner === pendingPageState) {
                currentSaTimerOwner = null;
            }
            if (stagingContainer instanceof HTMLElement) {
                stagingContainer.remove();
            }
            if (activeSaTransitionSession?.id === transitionId) {
                activeSaTransitionSession = null;
            } else if (!committedSaPageState || committedSaPageState !== pendingPageState) {
                teardownSaPageState(pendingPageState, null, false);
                if (urlTemporarilyReplaced && (!activeSaTransitionSession || activeSaTransitionSession.id < transitionId)) {
                    try { window.history.replaceState(prevState, "", prevHref); } catch (e) {}
                }
            }
        }
    }

    async fetchPageHTML(page, cacheBust = Date.now(), preFetchedPromise = null) {
        let response = null;
        if (preFetchedPromise) {
            response = await preFetchedPromise;
        }
        if (!response) {
            response = await fetch(`pages/${page}.html?t=${cacheBust}`, { __topLoaderSilent: true });
        }

        if (response.status === 401 || (response.redirected && /login/i.test(response.url))) {
            clearSuperAdminSnapshot();
            const err = new Error(`Failed to fetch page: 401 Unauthorized`);
            err.status = 401;
            throw err;
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
        }

        return await response.text();
    }

    async runIsolatedSubpageScript(url, baseKey, pageState) {
        const response = await fetch(url, { __topLoaderSilent: true });
        if (!response.ok) {
            throw new Error(`Failed to load script: ${url}`);
        }
        const sourceText = await response.text();
        const fnNames = extractSaTopLevelFunctionNames(sourceText);
        const exportsBlock = fnNames
            .map((fn) => `try { if (typeof ${fn} === "function") window["${fn}"] = ${fn}; } catch (_) {}`)
            .join("\n");

        const inlineScript = document.createElement("script");
        inlineScript.type = "text/javascript";
        inlineScript.setAttribute("data-dynamic", baseKey);
        inlineScript.textContent =
            `(function () {\n` +
            `${sourceText}\n` +
            `${exportsBlock}\n` +
            `})();\n//# sourceURL=${baseKey}`;

        document.body.appendChild(inlineScript);
        if (pageState?.scripts) {
            pageState.scripts.push(inlineScript);
        }
        this.currentScript = inlineScript;
        return inlineScript;
    }

    async loadSubpageScriptForTransition(url, baseKey, pageState) {
        if (saReExecIsolatedScripts.has(baseKey)) {
            return this.runIsolatedSubpageScript(url, baseKey, pageState);
        }

        let syntaxCollisionDetected = false;
        const errorListener = (event) => {
            const msg = String(event?.message || event?.error?.message || "");
            if (/already been declared/i.test(msg)) {
                syntaxCollisionDetected = true;
                event.preventDefault?.();
            }
        };

        window.addEventListener("error", errorListener);
        try {
            const scriptEl = await this.loadPageScript(url, pageState);
            if (syntaxCollisionDetected) {
                saReExecIsolatedScripts.add(baseKey);
                scriptEl?.remove?.();
                return this.runIsolatedSubpageScript(url, baseKey, pageState);
            }
            return scriptEl;
        } finally {
            window.removeEventListener("error", errorListener);
        }
    }

    async loadPageScript(scriptPath, pageState = null) {
        if (scriptPath === "./editor.js") {
            if (typeof window.editorInit === "function") {
                this.loadedScripts.add(scriptPath);
                return null;
            }
            if (window.__editorPageScriptPromise) {
                return window.__editorPageScriptPromise;
            }
        }

        const loadPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = scriptPath;
            script.async = false;
            script.setAttribute("data-dynamic", scriptPath);
            if (scriptPath === "./editor.js") {
                script.setAttribute("data-preserve", "true");
            }

            script.onload = () => {
                this.loadedScripts.add(scriptPath);
                this.currentScript = script;
                if (scriptPath === "./editor.js") {
                    window.__editorPageScriptPromise = Promise.resolve(script);
                } else if (pageState?.scripts) {
                    pageState.scripts.push(script);
                }
                resolve(script);
            };

            script.onerror = () => {
                const error = new Error(`Failed to load script: ${scriptPath}`);
                if (scriptPath === "./editor.js") {
                    window.__editorPageScriptPromise = null;
                }
                script.remove();
                reject(error);
            };

            document.body.appendChild(script);
        });

        if (scriptPath === "./editor.js") {
            window.__editorPageScriptPromise = loadPromise;
        }

        return loadPromise;
    }

    updateBrowserHistory(page, Name, _id, name) {
        const currentParams = new URLSearchParams(window.location.search);
        const urlParams = new URLSearchParams();

        urlParams.set("page", page);
        if (Name !== undefined && Name !== null && Name !== "") urlParams.set("Name", Name);
        if (_id !== undefined && _id !== null && _id !== "") urlParams.set("_id", _id);
        if (name !== undefined && name !== null && name !== "") urlParams.set("name", name);
        if (currentParams.has("debug")) urlParams.set("debug", currentParams.get("debug"));

        window.history.pushState({ page, Name, _id, name }, "", `?${urlParams.toString()}`);
    }

    setupDynamicLinks() {
        if (!this.container) return;

        if (this.linkClickHandler) {
            this.container.removeEventListener("click", this.linkClickHandler);
        }

        this.linkClickHandler = (e) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                return;
            }

            const link = e.target.closest("[data-page]");
            if (link && this.container.contains(link)) {
                e.preventDefault();
                const nextPage = link.getAttribute("data-page");
                const nextName = link.getAttribute("data-test-name");
                const nextId = link.getAttribute("data-id");
                const nextPanelName = link.getAttribute("data-panel-name");
                if (nextPage) {
                    this.loadPage(nextPage, nextName, nextId, null, nextPanelName);
                }
                return;
            }

            const anchor = e.target.closest("a[href]");
            if (anchor && this.container.contains(anchor) && anchor.target !== "_blank" && !anchor.hasAttribute("download")) {
                try {
                    const parsed = new URL(anchor.href, window.location.origin);
                    if (parsed.origin === window.location.origin && parsed.pathname === window.location.pathname) {
                        const targetPage = parsed.searchParams.get("page");
                        if (targetPage) {
                            e.preventDefault();
                            this.loadPage(targetPage, null, null, null, null, true, { queryParams: parsed.searchParams });
                        }
                    }
                } catch (err) {}
            }
        };

        this.container.addEventListener("click", this.linkClickHandler);
    }

    cleanPreviousPage() {
        if (committedSaPageState) {
            teardownSaPageState(committedSaPageState, this.container, true);
            committedSaPageState = null;
            return;
        }
        if (this.container) this.container.innerHTML = "";
    }

    showLoadingState() {
        if (this.container) this.container.setAttribute("aria-busy", "true");
    }

    hideLoadingState() {
        if (this.container) this.container.removeAttribute("aria-busy");
    }

    handlePageLoadError(error, page = null) {
        if (!this.container) return;

        const statusMatch = String(error?.message || "").match(/\b(\d{3})\b/);
        const status = Number(error?.status || statusMatch?.[1] || 500);

        if (status === 401) {
            clearSuperAdminSnapshot();
            portalGuard.restoreSession({ type: "superAdmin", strict: false }).then((sess) => {
                if (!sess?.authenticated && !sess?.transient) {
                    window.location.replace(`/login.html?sessionExpired=1&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
                }
            });
            return;
        }

        const retryTarget = page || this.currentPageLoaded || "dashboard";
        this.container.innerHTML = `
            <div class="spa-page-canvas">
                <div style="padding: 28px; margin: 20px auto; max-width: 600px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.06); text-align: center;">
                    <div style="font-size: 36px; color: #e53e3e; margin-bottom: 12px;"><i class="fas fa-exclamation-circle"></i></div>
                    <h3 style="color: #2d3748; margin-bottom: 8px;">Failed to Load Page</h3>
                    <p style="color: #718096; margin-bottom: 20px; font-size: 14px;">${error?.message || "An unexpected error occurred while loading this section."}</p>
                    <button type="button" id="saRetryRouteBtn" style="background: #4361ee; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">
                        <i class="fas fa-sync-alt" style="margin-right: 6px;"></i> Retry Loading
                    </button>
                </div>
            </div>
        `;
        this.container.querySelector("#saRetryRouteBtn")?.addEventListener("click", () => {
            this.loadPage(retryTarget, null, null, null, null, true, { forceReload: true });
        });
    }

    navigateTo(page, params = {}) {
        const { Name, _id, name } = params;
        this.loadPage(page, Name, _id, null, name);
    }

    getCurrentPage() {
        return this.currentPageLoaded;
    }

    clearAllScripts() {
        const dynamicScripts = document.querySelectorAll("script[data-dynamic]");
        dynamicScripts.forEach((script) => {
            if (script.getAttribute("data-preserve") === "true") return;
            this.loadedScripts.delete(script.getAttribute("data-dynamic"));
            script.remove();
        });
        this.currentScript = null;
    }

    reinitialize(containerSelector) {
        this.containerSelector = containerSelector;
        this.container = document.querySelector(containerSelector);
        return Boolean(this.container);
    }
}

function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }

        const observer = new MutationObserver((mutations, obs) => {
            const found = document.querySelector(selector);
            if (found) {
                obs.disconnect();
                resolve(found);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }, timeout);
    });
}

async function initializeRouter(bootOptions = {}) {
    try {
        await waitForElement(".content", 5000);
        window.router = new SPARouter(".content", bootOptions);
    } catch (error) {
        const alternatives = [".content", "#content", "main", "#main"];
        for (const selector of alternatives) {
            try {
                await waitForElement(selector, 1000);
                window.router = new SPARouter(selector, bootOptions);
                return;
            } catch (altError) {}
        }
        console.error("Could not initialize router with any container.");
    }
}

window.SPARouter = SPARouter;

window.loadPage = function (page, Name = null, _id = null, BASE_URL = null, name = null, updateHistory = true, options = {}) {
    if (window.router) {
        return window.router.loadPage(page, Name, _id, BASE_URL, name, updateHistory, options);
    } else {
        console.error("Router not initialized. Cannot load page:", page);
    }
};

function initCharts() {
    if (typeof Chart === "undefined") {
        console.warn("Chart.js not loaded, skipping chart initialization");
        return;
    }

    initRevenueChart();
    initModelUsageChart();
}

/**
 * Initialize revenue chart
 */
function initRevenueChart() {
    const revenueChartEl = document.getElementById("revenueChart");
    if (!revenueChartEl) return;

    if (revenueChartEl._chart) {
        revenueChartEl._chart.destroy();
    }

    const revenueChart = new Chart(revenueChartEl, {
        type: "line",
        data: {
            labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
            datasets: [{
                label: "Revenue",
                data: [18000, 19500, 17000, 21000, 24000, 22500, 28000, 26000, 29000, 32000, 30000, 34000],
                borderColor: "#4361ee",
                backgroundColor: "rgba(67, 97, 238, 0.1)",
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { borderDash: [3] }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });

    revenueChartEl._chart = revenueChart;
}

// Logout functionality
function logout() {
    clearSuperAdminSnapshot();

    const redirectToLogin = () => {
        portalGuard.clearStoredSession();
        sessionStorage.clear();
        window.location.replace(`${window.BASE_URL}/login.html?forceLogin=1`);
    };

    const tryLogout = async (endpoint) => {
        const response = await fetch(`${window.BASE_URL}${endpoint}`, {
            method: "POST",
            credentials: "include",
            keepalive: true,
        });

        if (!response.ok) {
            throw new Error(`Logout failed for ${endpoint}`);
        }
    };

    (async () => {
        try {
            try {
                await tryLogout("/api/v1/user/logout/superAdmin");
            } catch (primaryError) {
                console.warn("Super admin logout endpoint failed, trying generic logout:", primaryError);
                await tryLogout("/api/v1/user/logout");
            }

            redirectToLogin();
        } catch (error) {
            console.error("Logout error:", error);
            redirectToLogin();
        }
    })();
}

/**
 * Initialize model usage chart
 */
function initModelUsageChart() {
    const modelUsageChartEl = document.getElementById("modelUsageChart");
    if (!modelUsageChartEl) return;

    if (modelUsageChartEl._chart) {
        modelUsageChartEl._chart.destroy();
    }

    const modelUsageChart = new Chart(modelUsageChartEl, {
        type: "doughnut",
        data: {
            labels: ["1-Layer", "2-Layer", "3-Layer", "4-Layer"],
            datasets: [{
                data: [25, 35, 20, 20],
                backgroundColor: ["#4895ef", "#4361ee", "#3f37c9", "#4cc9f0"],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "bottom" }
            },
            cutout: "70%"
        }
    });

    modelUsageChartEl._chart = modelUsageChart;
}
