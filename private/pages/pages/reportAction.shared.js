(function () {
    const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
    const REPORT_ACTION_KEYS = Object.freeze([
        "viewPdf",
        "downloadPdf",
        "email",
        "sms",
        "whatsappOpen",
        "printDialog",
    ]);
    const DEFAULT_COUNTERS = Object.freeze({
        viewPdf: 0,
        downloadPdf: 0,
        email: 0,
        sms: 0,
        whatsappOpen: 0,
        printDialog: 0,
    });
    const DEFAULT_HISTORY = Object.freeze(
        Object.fromEntries(REPORT_ACTION_KEYS.map((key) => [key, []]))
    );
    const ACTION_BUTTON_CONFIG = Object.freeze({
        viewPdf: {
            buttonKey: "viewButton",
            label: "PDF",
            tooltipTitle: "PDF Opens",
        },
        downloadPdf: {
            buttonKey: "downloadButton",
            label: "Download",
            tooltipTitle: "Downloads",
        },
        email: {
            buttonKey: "emailButton",
            label: "Email Report",
            tooltipTitle: "Emails Sent",
        },
        printDialog: {
            buttonKey: "printButton",
            label: "Browser",
            tooltipTitle: "Print Previews",
        },
    });
    const ACTION_QUEUE_STORAGE_KEY = "labflow.reportActionQueue.v1";
    const ACTION_SYNC_CHANNEL_NAME = "labflow-report-action-sync";

    let tooltipLayer = null;
    let actionSyncChannel = null;

    function ensureHelperStyles() {
        if (typeof document === "undefined") return;
        if (document.getElementById("reportActionHelperStyles")) return;

        const style = document.createElement("style");
        style.id = "reportActionHelperStyles";
        style.textContent = `
            .button-count-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 22px;
                height: 22px;
                padding: 0 7px;
                margin-left: 4px;
                border-radius: 999px;
                font-size: 0.72rem;
                font-weight: 800;
                letter-spacing: 0.02em;
                line-height: 1;
                cursor: default;
                user-select: none;
            }
            .report-action-tooltip-layer {
                position: fixed;
                z-index: 10000;
                min-width: 220px;
                max-width: min(92vw, 320px);
                padding: 12px 14px;
                border-radius: 14px;
                background: rgba(15, 23, 42, 0.96);
                color: #f8fafc;
                box-shadow: 0 18px 40px rgba(15, 23, 42, 0.28);
                backdrop-filter: blur(10px);
                opacity: 0;
                pointer-events: none;
                transform: translateY(4px);
                transition: opacity 160ms ease, transform 160ms ease;
            }
            .report-action-tooltip-layer.is-visible {
                opacity: 1;
                transform: translateY(0);
            }
            .report-action-tooltip-title {
                margin: 0 0 8px;
                font-size: 12px;
                font-weight: 700;
                color: #bfdbfe;
                letter-spacing: 0.03em;
                text-transform: uppercase;
            }
            .report-action-tooltip-empty {
                margin: 0;
                font-size: 12px;
                color: #cbd5e1;
            }
            .report-action-tooltip-list {
                display: grid;
                gap: 6px;
                max-height: 240px;
                overflow-y: auto;
                padding-right: 2px;
            }
            .report-action-tooltip-item {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 8px;
                align-items: center;
                padding: 7px 8px;
                border-radius: 10px;
                background: rgba(148, 163, 184, 0.12);
                font-size: 12px;
            }
            .report-action-tooltip-date {
                color: #e2e8f0;
                font-weight: 600;
            }
            .report-action-tooltip-time {
                color: #93c5fd;
                font-weight: 700;
                white-space: nowrap;
            }
            .report-action-tooltip-item[data-pending="true"] .report-action-tooltip-time::after {
                content: " Syncing";
                color: #fbbf24;
                font-weight: 700;
            }
        `;

        document.head.appendChild(style);
    }

    function ensureTooltipLayer() {
        if (typeof document === "undefined") return null;
        ensureHelperStyles();
        if (tooltipLayer) return tooltipLayer;

        tooltipLayer = document.createElement("div");
        tooltipLayer.className = "report-action-tooltip-layer";
        tooltipLayer.setAttribute("aria-hidden", "true");
        document.body.appendChild(tooltipLayer);

        window.addEventListener("scroll", hideTooltip, true);
        window.addEventListener("resize", hideTooltip);
        return tooltipLayer;
    }

    function normalizeCount(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    function normalizeCounters(counters = {}) {
        return {
            ...DEFAULT_COUNTERS,
            viewPdf: normalizeCount(counters?.viewPdf),
            downloadPdf: normalizeCount(counters?.downloadPdf),
            email: normalizeCount(counters?.email),
            sms: normalizeCount(counters?.sms),
            whatsappOpen: normalizeCount(counters?.whatsappOpen),
            printDialog: normalizeCount(counters?.printDialog),
        };
    }

    function toIsoDateOrNull(value) {
        if (!value) {
            return null;
        }

        const parsed = value instanceof Date ? value : new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }

    function normalizeHistoryEntries(entries = []) {
        if (!Array.isArray(entries)) {
            return [];
        }

        return entries
            .map((entry) => {
                const clickedAt = toIsoDateOrNull(entry?.clickedAt || entry);
                if (!clickedAt) {
                    return null;
                }

                return {
                    actionId: String(entry?.actionId || "").trim(),
                    clickedAt,
                    pending: Boolean(entry?.pending),
                };
            })
            .filter(Boolean)
            .sort((left, right) => new Date(right.clickedAt) - new Date(left.clickedAt));
    }

    function normalizeActionHistory(history = {}) {
        return {
            ...DEFAULT_HISTORY,
            ...Object.fromEntries(
                REPORT_ACTION_KEYS.map((key) => [key, normalizeHistoryEntries(history?.[key])])
            ),
        };
    }

    function setStatus(statusElement, message = "", type = "info") {
        if (!statusElement) return;

        statusElement.textContent = message || "";
        statusElement.dataset.state = type;
        statusElement.style.display = message ? "block" : "none";
    }

    function isEditableKeyboardTarget(target) {
        if (!(target instanceof HTMLElement)) return false;
        if (target.matches("input, textarea, select, [contenteditable='true']")) return true;
        return Boolean(target.closest(".ck, .ck-editor, .text-dropdown"));
    }

    function bindPageLevelEnterShortcut({ buttonId = "signOff" } = {}) {
        if (typeof document === "undefined") {
            return () => {};
        }

        const handler = (event) => {
            if (event.key !== "Enter") return;
            if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;

            const target = event.target instanceof HTMLElement ? event.target : null;
            if (!target || isEditableKeyboardTarget(target) || target.closest("button, a, [role='button']")) {
                return;
            }

            const button = document.getElementById(buttonId);
            if (!button || button.disabled || button.offsetParent === null) {
                return;
            }

            event.preventDefault();
            button.click();
        };

        document.addEventListener("keydown", handler, true);
        return () => document.removeEventListener("keydown", handler, true);
    }

    function sanitizeFileSegment(value, fallback) {
        const cleaned = String(value || "")
            .replace(/[^\w\u0900-\u097F -]/g, "")
            .trim()
            .replace(/\s+/g, "_");

        return cleaned || fallback;
    }

    function buildAttachmentFileName(patientName, bookingId) {
        const safePatientName = sanitizeFileSegment(patientName, "Patient");
        const safeBookingId = sanitizeFileSegment(bookingId, "Report");
        return `${safePatientName}-${safeBookingId}.pdf`;
    }

    function buildReportEmailSubject(report = {}) {
        const bookingId = String(report?.bookingId || "").trim();
        return bookingId
            ? `Report shared from LabFlow | Booking ID ${bookingId}`
            : "Report shared from LabFlow";
    }

    function buildReportEmailBody(report = {}) {
        const lines = [
            "Hello,",
            "",
            "Please find the attached report shared from LabFlow.",
        ];

        if (report?.bookingId) {
            lines.push(`Booking ID: ${String(report.bookingId).trim()}`);
        }

        lines.push(
            "",
            "If you were not expecting this email, you may ignore it.",
            "",
            "Regards,",
            "LabFlow Team"
        );

        return lines.join("\n");
    }

    function resolveDoctorEmail(report = {}) {
        const candidates = [
            report?.contactDefaults?.email,
            report?.savedDoctorEmail,
            report?.latestDoctorEmail,
            report?.savedDoctorMeta?.email,
        ];

        return candidates.find((entry) => SIMPLE_EMAIL_REGEX.test(String(entry || "").trim())) || "";
    }

    function buildShareSummary(counters = {}, options = {}) {
        const { includeZero = false } = options;
        const normalizedCounters = normalizeCounters(counters);
        const summaryParts = [
            { short: "W", count: normalizedCounters.whatsappOpen },
            { short: "E", count: normalizedCounters.email },
            { short: "S", count: normalizedCounters.sms },
        ].filter((entry) => includeZero || entry.count > 0);

        return summaryParts.map((entry) => `${entry.short}${entry.count}`).join(" ");
    }

    function updateButtonLabel(button, baseLabel) {
        if (!button) return;

        const labelNode = button.querySelector("span");
        if (labelNode) {
            labelNode.textContent = baseLabel;
            button.dataset.syncedLabel = baseLabel;
            return;
        }

        button.textContent = baseLabel;
        button.dataset.syncedLabel = baseLabel;
    }

    function formatTooltipParts(value) {
        const isoValue = toIsoDateOrNull(value);
        if (!isoValue) {
            return {
                dateText: "Unknown",
                timeText: "",
            };
        }

        const date = new Date(isoValue);
        return {
            dateText: new Intl.DateTimeFormat("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            }).format(date),
            timeText: new Intl.DateTimeFormat("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
            }).format(date),
        };
    }

    function renderTooltipContent(entries = [], title = "Click History") {
        const normalizedEntries = normalizeHistoryEntries(entries);
        const entryMarkup = normalizedEntries.length
            ? `
                <div class="report-action-tooltip-list">
                    ${normalizedEntries.map((entry) => {
                        const { dateText, timeText } = formatTooltipParts(entry.clickedAt);
                        return `
                            <div class="report-action-tooltip-item" data-pending="${entry.pending ? "true" : "false"}">
                                <span class="report-action-tooltip-date">${dateText}</span>
                                <span class="report-action-tooltip-time">${timeText}</span>
                            </div>
                        `;
                    }).join("")}
                </div>
            `
            : `<p class="report-action-tooltip-empty">No clicks recorded yet.</p>`;

        return `
            <div class="report-action-tooltip-title">${title}</div>
            ${entryMarkup}
        `;
    }

    function positionTooltip(triggerElement) {
        const layer = ensureTooltipLayer();
        if (!layer || !triggerElement) return;

        const rect = triggerElement.getBoundingClientRect();
        const layerRect = layer.getBoundingClientRect();
        const top = Math.max(12, rect.top - layerRect.height - 12);
        const left = Math.min(
            window.innerWidth - layerRect.width - 12,
            Math.max(12, rect.left + (rect.width / 2) - (layerRect.width / 2))
        );

        layer.style.top = `${top}px`;
        layer.style.left = `${left}px`;
    }

    function hideTooltip() {
        if (!tooltipLayer) return;
        tooltipLayer.classList.remove("is-visible");
        tooltipLayer.setAttribute("aria-hidden", "true");
    }

    function showTooltip(triggerElement) {
        const layer = ensureTooltipLayer();
        if (!layer || !triggerElement) return;

        layer.innerHTML = renderTooltipContent(
            triggerElement._reportActionHistory || [],
            triggerElement._reportActionTitle || "Click History"
        );
        layer.classList.add("is-visible");
        layer.setAttribute("aria-hidden", "false");
        positionTooltip(triggerElement);
    }

    function attachTooltipHandlers(triggerElement) {
        if (!triggerElement || triggerElement.dataset.tooltipBound === "true") {
            return;
        }

        triggerElement.dataset.tooltipBound = "true";
        triggerElement.addEventListener("mouseenter", () => showTooltip(triggerElement));
        triggerElement.addEventListener("mouseleave", hideTooltip);
    }

    function ensureCountBadge(button) {
        if (!button) return null;

        let badge = button.querySelector(".button-count-badge");
        if (!badge) {
            badge = document.createElement("strong");
            badge.className = "button-count-badge";
            badge.setAttribute("aria-hidden", "true");
            button.appendChild(badge);
        }

        attachTooltipHandlers(badge);
        return badge;
    }

    function updateActionBadge(button, { label, count, historyEntries, tooltipTitle }) {
        if (!button) return;

        updateButtonLabel(button, label);

        const badge = ensureCountBadge(button);
        if (!badge) return;

        badge.textContent = String(normalizeCount(count));
        badge.title = "";
        badge._reportActionHistory = normalizeHistoryEntries(historyEntries);
        badge._reportActionTitle = tooltipTitle;
    }

    function applyActionCounts({ viewButton, downloadButton, emailButton, printButton, counters, actionHistory }) {
        ensureHelperStyles();

        const normalizedCounters = normalizeCounters(counters);
        const normalizedHistory = normalizeActionHistory(actionHistory);
        const buttonMap = {
            viewButton,
            downloadButton,
            emailButton,
            printButton,
        };

        Object.entries(ACTION_BUTTON_CONFIG).forEach(([actionKey, config]) => {
            updateActionBadge(buttonMap[config.buttonKey], {
                label: config.label,
                count: normalizedCounters[actionKey],
                historyEntries: normalizedHistory[actionKey],
                tooltipTitle: config.tooltipTitle,
            });
        });
    }

    function createActionRequestId(action) {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return `${action || "action"}-${crypto.randomUUID()}`;
        }

        return `${action || "action"}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    }

    function safeJsonParse(value, fallback = {}) {
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    }

    function getQueuedActions() {
        if (typeof localStorage === "undefined") {
            return [];
        }

        const queued = safeJsonParse(localStorage.getItem(ACTION_QUEUE_STORAGE_KEY), []);
        return Array.isArray(queued) ? queued : [];
    }

    function saveQueuedActions(queue) {
        if (typeof localStorage === "undefined") {
            return;
        }

        localStorage.setItem(ACTION_QUEUE_STORAGE_KEY, JSON.stringify(queue));
    }

    function enqueueAction(actionItem) {
        const queue = getQueuedActions();
        if (queue.some((entry) => entry?.clientActionId === actionItem?.clientActionId)) {
            return;
        }

        queue.push(actionItem);
        saveQueuedActions(queue);
    }

    function removeQueuedAction(clientActionId) {
        if (!clientActionId) return;

        const nextQueue = getQueuedActions().filter((entry) => entry?.clientActionId !== clientActionId);
        saveQueuedActions(nextQueue);
    }

    function matchesQueuedReport(entry, { reportId, bookingId } = {}) {
        if (!entry) return false;
        if (reportId && entry.reportId && String(entry.reportId) === String(reportId)) return true;
        if (bookingId && entry.bookingId && String(entry.bookingId) === String(bookingId)) return true;
        return false;
    }

    function mergeQueuedActionStats({ reportId, bookingId, actionCounters, actionHistory } = {}) {
        const mergedCounters = normalizeCounters(actionCounters);
        const mergedHistory = normalizeActionHistory(actionHistory);
        const queuedItems = getQueuedActions().filter((entry) => matchesQueuedReport(entry, { reportId, bookingId }));

        queuedItems.forEach((entry) => {
            const actionKey = entry?.action;
            if (!REPORT_ACTION_KEYS.includes(actionKey)) {
                return;
            }

            const alreadyIncluded = mergedHistory[actionKey].some(
                (historyEntry) => historyEntry.actionId && historyEntry.actionId === entry.clientActionId
            );

            if (!alreadyIncluded) {
                mergedHistory[actionKey] = normalizeHistoryEntries([
                    {
                        actionId: entry.clientActionId,
                        clickedAt: entry.createdAt,
                        pending: true,
                    },
                    ...mergedHistory[actionKey],
                ]);
            }

            mergedCounters[actionKey] = Math.max(
                mergedCounters[actionKey],
                mergedHistory[actionKey].length
            );
        });

        return {
            actionCounters: mergedCounters,
            actionHistory: mergedHistory,
        };
    }

    function getActionSyncChannel() {
        if (typeof BroadcastChannel === "undefined") {
            return null;
        }

        if (!actionSyncChannel) {
            actionSyncChannel = new BroadcastChannel(ACTION_SYNC_CHANNEL_NAME);
        }

        return actionSyncChannel;
    }

    function broadcastActionSync(payload) {
        const channel = getActionSyncChannel();
        if (!channel) return;

        channel.postMessage({
            type: "report-action-sync",
            ...payload,
        });
    }

    function subscribeToActionUpdates(callback) {
        const channel = getActionSyncChannel();
        if (!channel || typeof callback !== "function") {
            return () => {};
        }

        const handler = (event) => {
            if (event?.data?.type !== "report-action-sync") {
                return;
            }

            callback(event.data);
        };

        channel.addEventListener("message", handler);
        return () => channel.removeEventListener("message", handler);
    }

    function createHttpError(message, statusCode) {
        const error = new Error(message || "Request failed.");
        error.statusCode = Number(statusCode) || 0;
        error.retryable = !error.statusCode || error.statusCode >= 500;
        return error;
    }

    function wait(delayMs) {
        return new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    async function postJsonWithRetry(url, body, options = {}) {
        const {
            retries = 0,
            retryDelayMs = 400,
            topLoaderSilent = false,
        } = options;

        let attempt = 0;
        while (attempt <= retries) {
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                    ...(topLoaderSilent ? { __topLoaderSilent: true } : {}),
                });

                const rawText = await response.text().catch(() => "");
                const payload = rawText ? safeJsonParse(rawText, {}) : {};

                if (!response.ok) {
                    throw createHttpError(
                        payload?.message || payload?.error || rawText || "Request failed.",
                        response.status
                    );
                }

                return payload;
            } catch (error) {
                const normalizedError = error?.statusCode ? error : createHttpError(error?.message, 0);
                if (attempt >= retries || !normalizedError.retryable) {
                    throw normalizedError;
                }

                await wait(retryDelayMs * (attempt + 1));
                attempt += 1;
            }
        }

        throw createHttpError("Request failed.", 0);
    }

    function buildOptimisticActionState({
        reportId,
        bookingId,
        action,
        clientActionId,
        currentCounters,
        currentHistory,
        clickedAt,
    }) {
        const optimisticCounters = normalizeCounters(currentCounters);
        const optimisticHistory = normalizeActionHistory(currentHistory);

        optimisticCounters[action] = normalizeCount(optimisticCounters[action]) + 1;
        optimisticHistory[action] = normalizeHistoryEntries([
            {
                actionId: clientActionId,
                clickedAt,
                pending: true,
            },
            ...optimisticHistory[action],
        ]);

        return mergeQueuedActionStats({
            reportId,
            bookingId,
            actionCounters: optimisticCounters,
            actionHistory: optimisticHistory,
        });
    }

    async function trackAction({
        reportId,
        bookingId,
        action,
        clientActionId = createActionRequestId(action),
        currentCounters = {},
        currentHistory = {},
        queueOnFailure = true,
        retries = 2,
    }) {
        try {
            const payload = await postJsonWithRetry(
                "/api/v1/user/report-action",
                {
                    reportId,
                    bookingId,
                    action,
                    clientActionId,
                },
                { retries, topLoaderSilent: true }
            );

            removeQueuedAction(clientActionId);

            const mergedState = mergeQueuedActionStats({
                reportId,
                bookingId,
                actionCounters: payload?.data?.actionCounters || payload?.actionCounters,
                actionHistory: payload?.data?.actionHistory || payload?.actionHistory,
            });

            broadcastActionSync({
                reportId,
                bookingId,
                ...mergedState,
            });

            return {
                ...payload?.data,
                ...mergedState,
                clientActionId,
                queued: false,
                alreadyRecorded: Boolean(payload?.data?.alreadyRecorded || payload?.alreadyRecorded),
            };
        } catch (error) {
            if (!queueOnFailure || !error?.retryable) {
                throw error;
            }

            const createdAt = new Date().toISOString();
            enqueueAction({
                reportId,
                bookingId,
                action,
                clientActionId,
                createdAt,
            });

            const optimisticState = buildOptimisticActionState({
                reportId,
                bookingId,
                action,
                clientActionId,
                currentCounters,
                currentHistory,
                clickedAt: createdAt,
            });

            broadcastActionSync({
                reportId,
                bookingId,
                ...optimisticState,
            });

            return {
                ...optimisticState,
                clientActionId,
                queued: true,
                localEntry: {
                    actionId: clientActionId,
                    clickedAt: createdAt,
                    pending: true,
                },
                message: "Action saved locally and will sync automatically.",
            };
        }
    }

    async function fetchActionStats({ reportId, bookingId }) {
        const payload = await postJsonWithRetry(
            "/api/v1/user/report-action-stats",
            { reportId, bookingId },
            { retries: 1, topLoaderSilent: true }
        );

        return {
            ...(payload?.data || {}),
            ...mergeQueuedActionStats({
                reportId,
                bookingId,
                actionCounters: payload?.data?.actionCounters || payload?.actionCounters,
                actionHistory: payload?.data?.actionHistory || payload?.actionHistory,
            }),
        };
    }

    async function flushPendingActions({ reportId, bookingId, onSynced } = {}) {
        const queuedActions = getQueuedActions().filter((entry) => matchesQueuedReport(entry, { reportId, bookingId }));
        const syncResults = [];

        for (const queuedAction of queuedActions) {
            try {
                const syncedState = await trackAction({
                    reportId: queuedAction.reportId,
                    bookingId: queuedAction.bookingId,
                    action: queuedAction.action,
                    clientActionId: queuedAction.clientActionId,
                    queueOnFailure: false,
                    retries: 1,
                });

                removeQueuedAction(queuedAction.clientActionId);
                if (typeof onSynced === "function") {
                    onSynced(syncedState);
                }

                syncResults.push(syncedState);
            } catch (error) {
                syncResults.push({
                    clientActionId: queuedAction.clientActionId,
                    error,
                });
            }
        }

        return syncResults;
    }

    async function sendPdfByEmail({ email, pdfUrl, pdfBlob, report, clientActionId }) {
        const normalizedEmail = String(email || "").trim().toLowerCase();
        if (!SIMPLE_EMAIL_REGEX.test(normalizedEmail)) {
            throw new Error("Please enter a valid email address.");
        }

        let resolvedPdfBlob = pdfBlob || null;
        if (!resolvedPdfBlob) {
            const pdfResponse = await fetch(pdfUrl, { __topLoaderSilent: true });
            if (!pdfResponse.ok) {
                throw new Error("PDF file prepare nahi ho paayi. Please try again.");
            }
            resolvedPdfBlob = await pdfResponse.blob();
        }

        const resolvedClientActionId = String(clientActionId || createActionRequestId("email")).trim();
        const fileName = buildAttachmentFileName(report?.patientName, report?.bookingId);
        const formData = new FormData();
        formData.append("pdf", resolvedPdfBlob, fileName);
        formData.append("email", normalizedEmail);
        formData.append(
            "subject",
            buildReportEmailSubject(report)
        );
        formData.append(
            "body",
            buildReportEmailBody(report)
        );
        formData.append("reportId", report?._id || report?.reportId || "");
        formData.append("bookingId", report?.bookingId || "");
        formData.append("patientName", report?.patientName || "");
        formData.append("clientActionId", resolvedClientActionId);

        const response = await fetch("/api/v1/user/send-email", {
            method: "POST",
            body: formData,
            __topLoaderSilent: true,
        });

        const rawText = await response.text().catch(() => "");
        const payload = rawText ? safeJsonParse(rawText, {}) : {};
        if (!response.ok) {
            throw createHttpError(
                payload?.error
                || payload?.message
                || rawText
                || "Internet weak hai, email send nahi hua. Please try again.",
                response.status
            );
        }

        const mergedState = mergeQueuedActionStats({
            reportId: report?._id || report?.reportId || "",
            bookingId: report?.bookingId || "",
            actionCounters: payload?.actionCounters,
            actionHistory: payload?.actionHistory,
        });

        broadcastActionSync({
            reportId: report?._id || report?.reportId || "",
            bookingId: report?.bookingId || "",
            ...mergedState,
        });

        return {
            ...payload,
            ...mergedState,
            clientActionId: resolvedClientActionId,
            emailSentCount: normalizeCount(payload?.emailSentCount ?? payload?.actionCounters?.email),
        };
    }

    let cachedClinicalEvalFn = null;
    let clinicalEvalPromise = null;

    async function loadClinicalRangeEvaluator() {
        if (typeof cachedClinicalEvalFn === "function") return cachedClinicalEvalFn;
        if (!clinicalEvalPromise) {
            clinicalEvalPromise = (async () => {
                const candidateOrigins = [];
                if (typeof BASE_URL === "string" && BASE_URL) candidateOrigins.push(BASE_URL);
                if (typeof window !== "undefined" && window.location?.origin && !candidateOrigins.includes(window.location.origin)) {
                    candidateOrigins.push(window.location.origin);
                }
                for (const origin of candidateOrigins) {
                    try {
                        const mod = await import(`${origin}/js/clinicalRangeEvaluator.mjs?v=3`);
                        if (typeof mod?.evaluateClinicalReferenceFlag === "function") {
                            cachedClinicalEvalFn = mod.evaluateClinicalReferenceFlag;
                            return cachedClinicalEvalFn;
                        }
                    } catch (err) {
                        console.warn("[ReportActionHelpers] Could not load clinicalRangeEvaluator.mjs:", err?.message || err);
                    }
                }
                return null;
            })();
        }
        return clinicalEvalPromise;
    }

    function stripPlainHtmlText(raw) {
        return String(raw ?? "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^<>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function evaluateLegacyTestAbnormal(test = {}, report = {}) {
        const value = test?.value ?? test?.result ?? test?.currentvalue ?? "";
        const reference = test?.reference ?? test?.normalRange ?? test?.text ?? "";
        const testName = stripPlainHtmlText(test?.testName || test?.Name || "");
        const dbFlag = /^(?:H|L)$/i.test(String(test?.highLow || "").trim())
            ? String(test.highLow).trim().toUpperCase()
            : "";
        const dbIsAbnormal = Boolean(test?.isBold || test?.isAbnormal || dbFlag);

        if (typeof cachedClinicalEvalFn === "function") {
            return cachedClinicalEvalFn({
                value,
                reference,
                testName,
                gender: report?.gender || "",
                age: report?.year || "",
                referenceType: test?.referenceType || "",
                dbIsAbnormal,
                dbFlag,
            });
        }

        // Fallback if .mjs failed to load over network
        const valStr = String(value ?? "").trim();
        const refStr = stripPlainHtmlText(reference);
        if (!valStr) return { isAbnormal: false, flag: "", isNumeric: false };
        const cleanVal = valStr.replace(/,/g, "").trim();
        const numVal = /^-?\d+(?:\.\d+)?$/.test(cleanVal) ? Number(cleanVal) : NaN;
        if (Number.isFinite(numVal) && refStr) {
            const cleanRef = refStr.replace(/,/g, "");
            const rangeMatch = cleanRef.match(/([+-]?\d+(?:\.\d+)?)\s*(?:-|–|—|\bto\b)\s*([+-]?\d+(?:\.\d+)?)/i);
            if (rangeMatch) {
                const lo = parseFloat(rangeMatch[1]);
                const hi = parseFloat(rangeMatch[2]);
                if (Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi) {
                    if (numVal < lo) return { isAbnormal: true, flag: "L", isNumeric: true };
                    if (numVal > hi) return { isAbnormal: true, flag: "H", isNumeric: true };
                    return { isAbnormal: false, flag: "", isNumeric: true };
                }
            }
            const upperMatch = cleanRef.match(/^(?:<=|<|up\s*to)\s*([+-]?\d+(?:\.\d+)?)/i);
            if (upperMatch && numVal > parseFloat(upperMatch[1])) {
                return { isAbnormal: true, flag: "H", isNumeric: true };
            }
            const lowerMatch = cleanRef.match(/^(?:>=|>)\s*([+-]?\d+(?:\.\d+)?)/i);
            if (lowerMatch && numVal < parseFloat(lowerMatch[1])) {
                return { isAbnormal: true, flag: "L", isNumeric: true };
            }
        }
        return { isAbnormal: dbIsAbnormal, flag: dbIsAbnormal ? dbFlag : "", isNumeric: Number.isFinite(numVal) };
    }

    function applyLegacyAbnormalHighlightStyles({
        HighLow = true,
        HLinred = true,
        BoldRow = true,
    } = {}) {
        if (typeof document === "undefined") return;
        let styleEl = document.getElementById("labflowLegacyAbnormalStyles");
        if (!styleEl) {
            styleEl = document.createElement("style");
            styleEl.id = "labflowLegacyAbnormalStyles";
            (document.head || document.body).appendChild(styleEl);
        }

        const boldWeight = BoldRow ? "700" : "400";
        const rowBg = HLinred ? "rgba(254, 226, 226, 0.72)" : "rgba(241, 245, 249, 0.90)";
        const rowTextColor = HLinred ? "#7f1d1d" : "#0f172a";
        const valueTextColor = HLinred ? "#b91c1c" : "#0f172a";
        const stripeColor = HLinred ? "#dc2626" : "#1e3a5f";
        const badgeBg = HLinred ? "#fee2e2" : "#e2e8f0";
        const badgeColor = HLinred ? "#991b1b" : "#0f172a";
        const badgeBorder = HLinred ? "#ef4444" : "#94a3b8";

        styleEl.textContent = `
            table.test-table tbody tr.is-normal-row td,
            table.test-table tbody tr.is-normal-row td.high-low,
            table.test-table tbody tr.is-normal-row .test-name-cell,
            table.test-table tbody tr.is-normal-row .result-value,
            table.sec-tbl tbody tr.is-normal-row td {
                font-weight: 400 !important;
                color: #1e293b !important;
                background-color: transparent !important;
            }
            table.test-table tbody tr td:nth-child(2) {
                border-left: 3px solid transparent;
                padding-left: 6px;
            }
            table.test-table tbody tr.abnormal-result-row td,
            table.test-table tbody tr.BoldRow td,
            table.sec-tbl tbody tr.row-abn td,
            table.sec-tbl tbody tr.BoldRow td {
                background-color: ${rowBg} !important;
                color: ${rowTextColor} !important;
                font-weight: ${boldWeight} !important;
            }
            table.test-table tbody tr.abnormal-result-row td *,
            table.test-table tbody tr.BoldRow td *,
            table.sec-tbl tbody tr.row-abn td *,
            table.sec-tbl tbody tr.BoldRow td * {
                font-weight: ${boldWeight} !important;
                color: ${rowTextColor} !important;
            }
            table.test-table tbody tr.abnormal-result-row td.high-low .result-value,
            table.test-table tbody tr.BoldRow td.high-low .result-value,
            table.test-table tbody tr.abnormal-result-row td.high-low > span:last-child,
            table.test-table tbody tr.BoldRow td.high-low > span:last-child {
                color: ${valueTextColor} !important;
                font-weight: ${boldWeight} !important;
            }
            table.test-table tbody tr.abnormal-result-row td:nth-child(2),
            table.test-table tbody tr.BoldRow td:nth-child(2),
            table.sec-tbl tbody tr.row-abn td:first-child,
            table.sec-tbl tbody tr.BoldRow td:first-child {
                border-left: 3px solid ${stripeColor} !important;
                padding-left: 6px !important;
            }
            table.test-table tbody tr.abnormal-result-row .methods,
            table.test-table tbody tr.abnormal-result-row .methods *,
            table.test-table tbody tr.BoldRow .methods,
            table.test-table tbody tr.BoldRow .methods * {
                font-weight: 400 !important;
                color: #565656 !important;
            }
            td .HL span.high-low-marker,
            td .hl-tag {
                display: ${HighLow ? "inline-flex" : "none"} !important;
                align-items: center !important;
                justify-content: center !important;
                min-width: 18px;
                height: 15px;
                padding: 0 4px !important;
                margin-right: 4px !important;
                border-radius: 3px !important;
                font-size: 9px !important;
                font-weight: 800 !important;
                line-height: 1 !important;
                background-color: ${badgeBg} !important;
                color: ${badgeColor} !important;
                border: 1px solid ${badgeBorder} !important;
                vertical-align: middle !important;
            }
            td .HL span.high-low-marker:empty,
            td .hl-tag:empty {
                display: none !important;
            }
        `;
    }

    async function fetchAndApplyLegacyPrintSettings(reportId) {
        const defaults = { HighLow: true, HLinred: true, BoldRow: true };
        try {
            if (!reportId) {
                applyLegacyAbnormalHighlightStyles(defaults);
                return defaults;
            }
            const res = await fetch("/api/v1/user/getting-pdf-data", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportId }),
                __topLoaderSilent: true,
            });
            if (!res.ok) {
                applyLegacyAbnormalHighlightStyles(defaults);
                return defaults;
            }
            const data = await res.json();
            const hasSaved = Boolean(data?.hasUserSavedPrintSettings);
            const hasExplicitInvest = Boolean(data?.showInvestExplicit);
            const prefs = {
                HighLow: hasSaved && data?.HighLow !== undefined ? Boolean(data.HighLow) : true,
                HLinred: hasSaved && data?.HLinred !== undefined ? Boolean(data.HLinred) : true,
                BoldRow: hasSaved && data?.BoldRow !== undefined ? Boolean(data.BoldRow) : true,
                selectedFontSize: data?.selectedFontSize,
                selectedFontFamily: data?.selectedFontFamily,
                RowSpacing: data?.RowSpacing,
                showInvest: hasExplicitInvest ? Boolean(data?.showInvest ?? true) : true,
                showInvestExplicit: hasExplicitInvest,
                hideCategories: Boolean(data?.hideCategories),
                hideTableHeadings: Boolean(data?.hideTableHeadings),
                hasUserSavedPrintSettings: hasSaved,
            };
            applyLegacyAbnormalHighlightStyles(prefs);
            return prefs;
        } catch {
            applyLegacyAbnormalHighlightStyles(defaults);
            return defaults;
        }
    }

    let cachedSelectiveMod = null;
    let selectiveModPromise = null;
    let activeSelectiveState = { active: false, manifest: null };

    async function loadSelectiveReportEngine() {
        if (cachedSelectiveMod) return cachedSelectiveMod;
        if (!selectiveModPromise) {
            selectiveModPromise = (async () => {
                const candidateOrigins = [];
                if (typeof BASE_URL === "string" && BASE_URL) candidateOrigins.push(BASE_URL);
                if (typeof window !== "undefined" && window.location?.origin && !candidateOrigins.includes(window.location.origin)) {
                    candidateOrigins.push(window.location.origin);
                }
                for (const origin of candidateOrigins) {
                    try {
                        const mod = await import(`${origin}/js/selectiveReportEngine.mjs?v=1`);
                        if (typeof mod?.filterReportBySelection === "function") {
                            cachedSelectiveMod = mod;
                            return mod;
                        }
                    } catch (err) {
                        console.warn("[ReportActionHelpers] Could not load selectiveReportEngine.mjs:", err?.message || err);
                    }
                }
                return null;
            })();
        }
        return selectiveModPromise;
    }

    function setActiveSelectiveState(active, manifest = null) {
        activeSelectiveState = { active: Boolean(active), manifest: active ? manifest : null };
        if (typeof window !== "undefined") {
            window.__labflowSelectiveMode = Boolean(active);
        }
    }

    function isSelectivePrintActive() {
        return Boolean(activeSelectiveState.active);
    }

    async function resolveInitialSelectiveReport(fullReport, bookingId = "") {
        const mod = await loadSelectiveReportEngine();
        let initialManifest = null;
        let barcodeMeta = null;

        try {
            const urlParams = new URLSearchParams(window.location.search);
            const selKey = urlParams.get("selKey") || "";
            if (selKey && mod?.loadSelectionManifest) {
                initialManifest = mod.loadSelectionManifest(selKey);
            }
        } catch { /* ignore */ }

        const bId = bookingId || fullReport?.bookingId || "";
        if (bId) {
            try {
                const res = await fetch("/api/v1/user/getbarcodeTests", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ bookingId: bId }),
                    __topLoaderSilent: true,
                });
                if (res.ok) barcodeMeta = await res.json();
            } catch { /* optional enrichment */ }
        }

        const isSelective = Boolean(initialManifest && initialManifest.mode === "selected" && !initialManifest.allSelected);
        setActiveSelectiveState(isSelective, initialManifest);

        const activeReport = isSelective && mod?.filterReportBySelection
            ? mod.filterReportBySelection(fullReport, initialManifest, barcodeMeta)
            : fullReport;

        return {
            mod,
            fullReport,
            activeReport,
            initialManifest,
            barcodeMeta,
            isSelective,
        };
    }

    function ensureSelectiveFilterStyles() {
        if (typeof document === "undefined" || document.getElementById("lfSelectiveFilterStyles")) return;
        const style = document.createElement("style");
        style.id = "lfSelectiveFilterStyles";
        style.textContent = `
            .lf-filter-trigger-btn {
                display: inline-flex !important;
                align-items: center;
                gap: 6px;
                background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%) !important;
                color: #ffffff !important;
                border: 1px solid rgba(148, 163, 184, 0.35) !important;
                border-radius: 999px !important;
                padding: 0 12px !important;
                height: 32px !important;
                font: 600 12px/1 'Segoe UI', Arial, sans-serif !important;
                cursor: pointer;
                white-space: nowrap;
                box-shadow: 0 2px 8px rgba(15, 23, 42, 0.16);
                transition: transform 0.14s ease, filter 0.14s ease;
            }
            .lf-filter-trigger-btn:hover { transform: translateY(-1px); filter: brightness(1.08); }
            .lf-filter-trigger-btn.is-selective {
                background: linear-gradient(135deg, #0f766e 0%, #047857 100%) !important;
                border-color: #34d399 !important;
            }
            .lf-filter-badge {
                background: rgba(255, 255, 255, 0.22);
                color: #ffffff;
                border-radius: 999px;
                padding: 2px 7px;
                font-size: 10.5px;
                font-weight: 700;
            }
            .lf-filter-backdrop {
                position: fixed;
                inset: 0;
                z-index: 2147483640;
                background: rgba(15, 23, 42, 0.45);
                backdrop-filter: blur(3px);
                display: none;
                align-items: center;
                justify-content: center;
                padding: 16px;
            }
            .lf-filter-backdrop.is-open { display: flex; }
            .lf-filter-modal {
                width: min(680px, 100%);
                height: min(86vh, 720px);
                max-height: 90dvh;
                background: #ffffff;
                color: #0f172a;
                border-radius: 14px;
                box-shadow: 0 24px 64px rgba(15, 23, 42, 0.35);
                border: 1px solid #cbd5e1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                font-family: 'Segoe UI', Arial, sans-serif;
            }
            .lf-filter-head {
                flex: 0 0 auto;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 14px 18px;
                background: #0f172a;
                color: #ffffff;
            }
            .lf-filter-head h3 {
                margin: 0;
                font-size: 15px;
                font-weight: 700;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .lf-filter-head small {
                display: block;
                font-size: 11.5px;
                color: #94a3b8;
                font-weight: 400;
                margin-top: 2px;
            }
            .lf-filter-close {
                background: rgba(255, 255, 255, 0.14);
                border: none;
                color: #ffffff;
                width: 30px;
                height: 30px;
                border-radius: 8px;
                font-size: 18px;
                cursor: pointer;
                line-height: 1;
            }
            .lf-filter-controls {
                flex: 0 0 auto;
                padding: 10px 18px;
                background: #f8fafc;
                border-bottom: 1px solid #e2e8f0;
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 8px;
            }
            .lf-filter-search {
                flex: 1 1 200px;
                min-width: 160px;
                height: 32px;
                padding: 0 10px;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                font-size: 12.5px;
                outline: none;
            }
            .lf-filter-search:focus { border-color: #1e3a5f; box-shadow: 0 0 0 2px rgba(30,58,95,.15); }
            .lf-filter-pill-btn {
                height: 30px;
                padding: 0 11px;
                border-radius: 8px;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                color: #1e293b;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
            }
            .lf-filter-pill-btn:hover { background: #eef2ff; border-color: #93c5fd; }
            .lf-filter-pill-btn.is-primary { background: #1e3a5f; color: #ffffff; border-color: #1e3a5f; }
            .lf-filter-pkgs {
                flex: 0 0 auto;
                max-height: 104px;
                overflow-y: auto;
                padding: 8px 18px 8px;
                background: #f1f5f9;
                border-bottom: 1px solid #e2e8f0;
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                align-items: center;
            }
            .lf-filter-pkg-chip {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: #ffffff;
                border: 1px solid #94a3b8;
                border-radius: 999px;
                padding: 3px 10px;
                font-size: 11.5px;
                font-weight: 600;
                color: #0f172a;
            }
            .lf-filter-body {
                flex: 1 1 0%;
                min-height: 120px;
                overflow-y: auto !important;
                overflow-x: hidden;
                overscroll-behavior: contain;
                padding: 12px 18px;
                display: block;
                scrollbar-width: thin;
                scrollbar-color: #94a3b8 #f1f5f9;
            }
            .lf-filter-body::-webkit-scrollbar { width: 8px; }
            .lf-filter-body::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 8px; }
            .lf-filter-body::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 8px; }
            .lf-filter-body::-webkit-scrollbar-thumb:hover { background: #64748b; }
            .lf-filter-sec {
                flex: 0 0 auto;
                margin-bottom: 10px;
                border: 1px solid #cbd5e1;
                border-radius: 10px;
                overflow: visible;
                background: #ffffff;
            }
            .lf-filter-sec:last-child { margin-bottom: 0; }
            .lf-filter-sec-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 8px 12px;
                background: #f1f5f9;
                border-bottom: 1px solid #e2e8f0;
                border-radius: 9px 9px 0 0;
                font-weight: 700;
                font-size: 12.5px;
                color: #1e3a5f;
            }
            .lf-filter-check-lbl {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                flex: 1 1 auto;
                min-width: 0;
                margin: 0;
            }
            .lf-filter-check-lbl input[type="checkbox"] {
                width: 15px;
                height: 15px;
                accent-color: #0f766e;
                cursor: pointer;
                flex-shrink: 0;
            }
            .lf-filter-only-btn {
                border: 1px solid #cbd5e1;
                background: #ffffff;
                color: #0f766e;
                border-radius: 6px;
                padding: 2px 8px;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
                flex-shrink: 0;
            }
            .lf-filter-only-btn:hover { background: #ecfdf5; border-color: #10b981; }
            .lf-filter-items {
                display: flex;
                flex-direction: column;
            }
            .lf-filter-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 6px 12px;
                border-bottom: 1px solid #f1f5f9;
                font-size: 12.5px;
                color: #1e293b;
            }
            .lf-filter-row:last-child { border-bottom: none; border-radius: 0 0 9px 9px; }
            .lf-filter-row.is-group { background: #fafcfe; font-weight: 600; color: #0f172a; }
            .lf-filter-row.is-param { padding-left: 30px; color: #334155; font-size: 12px; }
            .lf-filter-foot {
                flex: 0 0 auto;
                padding: 12px 18px;
                background: #f8fafc;
                border-top: 1px solid #e2e8f0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                flex-wrap: wrap;
            }
            .lf-filter-foot-summary { font-size: 12px; color: #475569; font-weight: 600; }
            .lf-filter-foot-actions { display: flex; align-items: center; gap: 8px; }
            .lf-filter-apply-btn {
                height: 34px;
                padding: 0 16px;
                border-radius: 8px;
                border: none;
                background: #0f766e;
                color: #ffffff;
                font-size: 12.5px;
                font-weight: 700;
                cursor: pointer;
            }
            .lf-filter-apply-btn:hover { background: #0d9488; }
            @media print {
                .lf-filter-trigger-btn, .lf-filter-backdrop { display: none !important; }
            }
        `;
        document.head.appendChild(style);
    }

    function escapeFilterHtml(str) {
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    /**
     * Mounts a unified non-destructive "Filter Tests / Print Scope" button & modal
     * onto ANY LabFlow Report Format page (Formats 1, 2/Standard, 3, 4, 5).
     */
    async function mountReportFilterDrawer({
        fullReport,
        initialManifest = null,
        barcodeMeta = null,
        dockEl = null,
        onSelectionApplied,
    }) {
        const mod = await loadSelectiveReportEngine();
        if (!mod || !fullReport) return null;

        ensureSelectiveFilterStyles();
        const tree = mod.buildReportSelectionTree(fullReport, barcodeMeta);
        const leafItems = [];
        tree.sections.forEach((sec) => {
            const hasChildren = new Set(sec.items.filter((i) => i.parentKey).map((i) => i.parentKey));
            sec.items.forEach((it) => {
                if (it.kind === "group" && hasChildren.has(it.key)) return;
                leafItems.push({ sec, it });
            });
        });

        const selectedSet = new Set();
        const initAll = () => {
            selectedSet.clear();
            leafItems.forEach(({ it }) => selectedSet.add(it.key));
        };

        if (initialManifest && initialManifest.mode === "selected" && !initialManifest.allSelected) {
            const mKeys = new Set(initialManifest.selectedItemKeys || []);
            const mSec = new Set(initialManifest.selectedSectionKeys || []);
            const mPanels = new Set((initialManifest.selectedPanelNames || []).map(mod.normalizeSelText));
            const mLabels = new Set((initialManifest.selectedLabels || []).map(mod.normalizeSelText));
            leafItems.forEach(({ sec, it }) => {
                if (
                    mKeys.has(it.key) ||
                    mSec.has(sec.sectionKey) ||
                    (sec.panelTitle && mPanels.has(mod.normalizeSelText(sec.panelTitle))) ||
                    mLabels.has(mod.normalizeSelText(it.label))
                ) {
                    selectedSet.add(it.key);
                }
            });
            if (selectedSet.size === 0) initAll();
        } else {
            initAll();
        }

        let includeMoreDetails = initialManifest?.includeMoreDetails !== false;

        // Build trigger button
        const targetDock = dockEl || document.querySelector(".oh5-dock, .download-pdf-div");
        const existingBtn = document.getElementById("lfSelectiveFilterBtn");
        if (existingBtn) existingBtn.remove();
        const existingWrap = document.getElementById("lfSelectiveFilterWrap");
        if (existingWrap) existingWrap.remove();

        const triggerWrap = document.createElement("div");
        triggerWrap.id = "lfSelectiveFilterWrap";
        triggerWrap.className = targetDock?.classList.contains("oh5-dock") ? "downloadDiv no-print" : "downloadDiv no-print";
        triggerWrap.style.display = "inline-flex";
        triggerWrap.style.alignItems = "center";

        const triggerBtn = document.createElement("button");
        triggerBtn.id = "lfSelectiveFilterBtn";
        triggerBtn.type = "button";
        triggerBtn.className = "lf-filter-trigger-btn no-print";
        triggerBtn.title = "Select specific Tests / Panels / Packages to print separately";
        triggerWrap.appendChild(triggerBtn);

        if (targetDock) {
            const anchorSetting = targetDock.querySelector("#printsettingbutton");
            if (anchorSetting) targetDock.insertBefore(triggerWrap, anchorSetting);
            else targetDock.appendChild(triggerWrap);
        }

        // Build portal modal
        document.getElementById("lfSelectiveBackdrop")?.remove();
        const backdrop = document.createElement("div");
        backdrop.id = "lfSelectiveBackdrop";
        backdrop.className = "lf-filter-backdrop no-print";
        backdrop.innerHTML = `
            <div class="lf-filter-modal" role="dialog" aria-modal="true" aria-label="Select Tests for Report PDF">
                <div class="lf-filter-head">
                    <div>
                        <h3><i class="fas fa-filter"></i> Select Tests / Panels / Packages for Report</h3>
                        <small>Full data stays safe in database. Pick individual tests, panels, packages, or parameters to print separately.</small>
                    </div>
                    <button type="button" class="lf-filter-close" aria-label="Close">&times;</button>
                </div>
                <div class="lf-filter-controls">
                    <input type="search" class="lf-filter-search" placeholder="Search test, panel, category..." />
                    <button type="button" class="lf-filter-pill-btn is-primary" data-action="full">Full Report (All)</button>
                    <button type="button" class="lf-filter-pill-btn" data-action="none">Clear All</button>
                </div>
                <div class="lf-filter-pkgs" style="${tree.packages.length ? "" : "display:none;"}"></div>
                <div class="lf-filter-body"></div>
                <div class="lf-filter-foot">
                    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                        <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin:0;">
                            <input type="checkbox" id="lfFilterMoreDetailsChk" ${includeMoreDetails ? "checked" : ""} />
                            <span>Include Additional Findings</span>
                        </label>
                        <span class="lf-filter-foot-summary"></span>
                    </div>
                    <div class="lf-filter-foot-actions">
                        <button type="button" class="lf-filter-pill-btn" data-action="reset-full">Reset Full Report</button>
                        <button type="button" class="lf-filter-apply-btn" data-action="apply">Apply &amp; Update Report</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        const bodyEl = backdrop.querySelector(".lf-filter-body");
        const pkgsEl = backdrop.querySelector(".lf-filter-pkgs");
        const searchInput = backdrop.querySelector(".lf-filter-search");
        const summaryEl = backdrop.querySelector(".lf-filter-foot-summary");
        const moreDetailsChk = backdrop.querySelector("#lfFilterMoreDetailsChk");

        const updateTriggerText = () => {
            const total = leafItems.length;
            const selectedCount = selectedSet.size;
            const isFull = selectedCount === total;
            triggerBtn.classList.toggle("is-selective", !isFull);
            triggerBtn.innerHTML = `<i class="fas fa-tasks"></i><span>${isFull ? "All Tests" : "Selected Tests"}</span><span class="lf-filter-badge">${selectedCount}/${total}</span>`;
            if (summaryEl) {
                summaryEl.textContent = isFull
                    ? `Full Report (${total} / ${total} items selected)`
                    : `Selective Subset (${selectedCount} / ${total} items selected — DB full data preserved)`;
            }
        };

        const buildCurrentManifest = () => {
            const isFull = selectedSet.size === leafItems.length && includeMoreDetails;
            const selectedLabels = [];
            leafItems.forEach(({ sec, it }) => {
                if (selectedSet.has(it.key)) {
                    selectedLabels.push(it.shortLabel || it.label);
                }
            });
            return {
                version: 1,
                mode: isFull ? "full" : "selected",
                allSelected: isFull,
                selectedItemKeys: Array.from(selectedSet),
                selectedLabels,
                includeMoreDetails,
            };
        };

        const renderChecklist = (query = "") => {
            const q = mod.normalizeSelText(query);

            if (tree.packages.length && pkgsEl) {
                pkgsEl.innerHTML = `<span style="font-size:11px;font-weight:700;color:#475569;">Packages:</span>` + tree.packages.map((pkg) => {
                    const pkgLeafs = leafItems.filter(({ it }) => Array.isArray(it.packageIds) && it.packageIds.includes(pkg.id));
                    const checkedCount = pkgLeafs.filter(({ it }) => selectedSet.has(it.key)).length;
                    const allChecked = pkgLeafs.length > 0 && checkedCount === pkgLeafs.length;
                    return `
                        <div class="lf-filter-pkg-chip">
                            <label class="lf-filter-check-lbl">
                                <input type="checkbox" data-pkg-id="${escapeFilterHtml(pkg.id)}" ${allChecked ? "checked" : ""} />
                                <span>${escapeFilterHtml(pkg.name)} (${checkedCount}/${pkgLeafs.length})</span>
                            </label>
                            <button type="button" class="lf-filter-only-btn" data-only-pkg="${escapeFilterHtml(pkg.id)}">Only</button>
                        </div>
                    `;
                }).join("");

                pkgsEl.querySelectorAll("input[data-pkg-id]").forEach((cb) => {
                    const pkgId = cb.getAttribute("data-pkg-id");
                    const pkgLeafs = leafItems.filter(({ it }) => Array.isArray(it.packageIds) && it.packageIds.includes(pkgId));
                    const checkedCount = pkgLeafs.filter(({ it }) => selectedSet.has(it.key)).length;
                    cb.indeterminate = checkedCount > 0 && checkedCount < pkgLeafs.length;
                    cb.addEventListener("change", () => {
                        pkgLeafs.forEach(({ it }) => {
                            if (cb.checked) selectedSet.add(it.key);
                            else selectedSet.delete(it.key);
                        });
                        renderChecklist(searchInput?.value || "");
                        updateTriggerText();
                    });
                });

                pkgsEl.querySelectorAll("button[data-only-pkg]").forEach((btn) => {
                    btn.addEventListener("click", () => {
                        const pkgId = btn.getAttribute("data-only-pkg");
                        selectedSet.clear();
                        leafItems.forEach(({ it }) => {
                            if (Array.isArray(it.packageIds) && it.packageIds.includes(pkgId)) selectedSet.add(it.key);
                        });
                        renderChecklist(searchInput?.value || "");
                        updateTriggerText();
                    });
                });
            }

            bodyEl.innerHTML = "";
            tree.sections.forEach((sec) => {
                const secLeafs = leafItems.filter((x) => x.sec.sectionKey === sec.sectionKey).map((x) => x.it);
                if (!secLeafs.length) return;
                const matchingItems = sec.items.filter((it) => {
                    if (!q) return true;
                    return mod.normalizeSelText(sec.displayTitle).includes(q) || mod.normalizeSelText(it.label).includes(q);
                });
                if (!matchingItems.length) return;

                const secDiv = document.createElement("div");
                secDiv.className = "lf-filter-sec";
                const secCheckedCount = secLeafs.filter((it) => selectedSet.has(it.key)).length;
                const secAllChecked = secCheckedCount === secLeafs.length;

                secDiv.innerHTML = `
                    <div class="lf-filter-sec-head">
                        <label class="lf-filter-check-lbl">
                            <input type="checkbox" class="lf-sec-cb" ${secAllChecked ? "checked" : ""} />
                            <span>${escapeFilterHtml(sec.isPanel ? `${sec.displayTitle} (${sec.categoryName})` : sec.displayTitle)}</span>
                        </label>
                        <button type="button" class="lf-filter-only-btn" title="Print ONLY this section">Only This</button>
                    </div>
                    <div class="lf-filter-items"></div>
                `;

                const secCb = secDiv.querySelector(".lf-sec-cb");
                secCb.indeterminate = secCheckedCount > 0 && secCheckedCount < secLeafs.length;
                secCb.addEventListener("change", () => {
                    secLeafs.forEach((it) => {
                        if (secCb.checked) selectedSet.add(it.key);
                        else selectedSet.delete(it.key);
                    });
                    renderChecklist(searchInput?.value || "");
                    updateTriggerText();
                });

                secDiv.querySelector(".lf-filter-only-btn").addEventListener("click", () => {
                    selectedSet.clear();
                    secLeafs.forEach((it) => selectedSet.add(it.key));
                    renderChecklist(searchInput?.value || "");
                    updateTriggerText();
                });

                const itemsWrap = secDiv.querySelector(".lf-filter-items");
                const childrenByGroup = new Map();
                sec.items.forEach((it) => {
                    if (it.kind === "param" && it.parentKey) {
                        if (!childrenByGroup.has(it.parentKey)) childrenByGroup.set(it.parentKey, []);
                        childrenByGroup.get(it.parentKey).push(it);
                    }
                });

                matchingItems.forEach((it) => {
                    const rowDiv = document.createElement("div");
                    rowDiv.className = `lf-filter-row${it.kind === "group" ? " is-group" : it.kind === "param" ? " is-param" : ""}`;

                    const isGroupWithKids = it.kind === "group" && childrenByGroup.has(it.key);
                    const kids = isGroupWithKids ? childrenByGroup.get(it.key) : [];
                    const checked = isGroupWithKids
                        ? kids.length > 0 && kids.every((k) => selectedSet.has(k.key))
                        : selectedSet.has(it.key);

                    rowDiv.innerHTML = `
                        <label class="lf-filter-check-lbl">
                            <input type="checkbox" ${checked ? "checked" : ""} />
                            <span>${escapeFilterHtml(it.label)}</span>
                        </label>
                        <button type="button" class="lf-filter-only-btn">Only</button>
                    `;

                    const rowCb = rowDiv.querySelector('input[type="checkbox"]');
                    if (isGroupWithKids) {
                        const kCount = kids.filter((k) => selectedSet.has(k.key)).length;
                        rowCb.indeterminate = kCount > 0 && kCount < kids.length;
                    }

                    rowCb.addEventListener("change", () => {
                        if (isGroupWithKids) {
                            kids.forEach((k) => {
                                if (rowCb.checked) selectedSet.add(k.key);
                                else selectedSet.delete(k.key);
                            });
                        } else {
                            if (rowCb.checked) selectedSet.add(it.key);
                            else selectedSet.delete(it.key);
                        }
                        renderChecklist(searchInput?.value || "");
                        updateTriggerText();
                    });

                    rowDiv.querySelector(".lf-filter-only-btn").addEventListener("click", () => {
                        selectedSet.clear();
                        if (isGroupWithKids) kids.forEach((k) => selectedSet.add(k.key));
                        else selectedSet.add(it.key);
                        renderChecklist(searchInput?.value || "");
                        updateTriggerText();
                    });

                    itemsWrap.appendChild(rowDiv);
                });

                bodyEl.appendChild(secDiv);
            });
            updateTriggerText();
        };

        const applySelectionNow = async () => {
            if (selectedSet.size === 0) {
                alert("Please select at least 1 test, panel, or parameter before applying.");
                return;
            }
            includeMoreDetails = Boolean(moreDetailsChk?.checked);
            const manifest = buildCurrentManifest();
            const isSelective = manifest.mode === "selected" && !manifest.allSelected;
            setActiveSelectiveState(isSelective, manifest);
            const filteredReport = isSelective
                ? mod.filterReportBySelection(fullReport, manifest, barcodeMeta)
                : fullReport;
            backdrop.classList.remove("is-open");
            updateTriggerText();
            if (typeof onSelectionApplied === "function") {
                await onSelectionApplied({
                    fullReport,
                    filteredReport,
                    manifest,
                    isSelective,
                });
            }
        };

        triggerBtn.addEventListener("click", () => {
            renderChecklist(searchInput?.value || "");
            backdrop.classList.add("is-open");
        });
        backdrop.querySelector(".lf-filter-close").addEventListener("click", () => backdrop.classList.remove("is-open"));
        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) backdrop.classList.remove("is-open");
        });
        searchInput?.addEventListener("input", () => renderChecklist(searchInput.value));
        backdrop.querySelector('[data-action="full"]')?.addEventListener("click", () => {
            initAll();
            if (moreDetailsChk) moreDetailsChk.checked = true;
            renderChecklist(searchInput?.value || "");
        });
        backdrop.querySelector('[data-action="none"]')?.addEventListener("click", () => {
            selectedSet.clear();
            renderChecklist(searchInput?.value || "");
        });
        backdrop.querySelector('[data-action="apply"]')?.addEventListener("click", applySelectionNow);
        backdrop.querySelector('[data-action="reset-full"]')?.addEventListener("click", async () => {
            initAll();
            if (moreDetailsChk) moreDetailsChk.checked = true;
            renderChecklist(searchInput?.value || "");
            await applySelectionNow();
        });

        updateTriggerText();
        return {
            getManifest: buildCurrentManifest,
            cleanup() {
                triggerWrap.remove();
                backdrop.remove();
            },
        };
    }

    function normalizeInvestLookupText(value) {
        return stripPlainHtmlText(value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    }

    function resolveHeaderDoctorName(reportData = {}, bookingData = null) {
        const unwrappedBooking = bookingData?.data && typeof bookingData.data === "object"
            ? bookingData.data
            : bookingData;
        const isUsable = (val) => {
            const s = String(val ?? "").replace(/\s+/g, " ").trim();
            if (!s) return false;
            return !["null", "undefined", "none", "select doctor", "-- select doctor --", "-", "--", "n/a"].includes(s.toLowerCase());
        };
        const isNonSelfDoctor = (val) => isUsable(val) && String(val).replace(/\s+/g, " ").trim().toLowerCase() !== "self";
        const joinMetaName = (meta) => {
            if (!meta || typeof meta !== "object") return "";
            if (meta.displayName) return String(meta.displayName).trim();
            return [meta.firstName, meta.lastName].filter(Boolean).join(" ").trim();
        };

        const candidates = [
            reportData?.doctorName,
            reportData?.savedDoctor,
            joinMetaName(reportData?.savedDoctorMeta),
            joinMetaName(reportData?.savedDoctorId),
            reportData?.latestDoctorName,
            reportData?.referredBy,
            unwrappedBooking?.doctorName,
            unwrappedBooking?.savedDoctor,
            joinMetaName(unwrappedBooking?.savedDoctorMeta),
            joinMetaName(unwrappedBooking?.savedDoctorId),
            unwrappedBooking?.referredBy,
        ];

        // Prefer any named doctor over "Self" so a stale "Self" on one record never masks a real doctor
        for (const candidate of candidates) {
            if (isNonSelfDoctor(candidate)) {
                return String(candidate).replace(/\s+/g, " ").trim();
            }
        }
        for (const candidate of candidates) {
            if (isUsable(candidate)) {
                return String(candidate).replace(/\s+/g, " ").trim();
            }
        }
        return "";
    }

    function resolveHeaderInvestigationsText({ report = {}, bookingData = null, barcodeMeta = null } = {}) {
        const unwrappedBooking = bookingData?.data && typeof bookingData.data === "object"
            ? bookingData.data
            : bookingData;

        const shortLookup = new Map();
        const addAlias = (fullName, displayShort) => {
            const key = normalizeInvestLookupText(fullName);
            const shortVal = String(displayShort ?? "").replace(/\s+/g, " ").trim();
            if (key && shortVal && !shortLookup.has(key)) {
                shortLookup.set(key, shortVal);
            }
        };

        const selectedItems = Array.isArray(unwrappedBooking?.selectedItems) && unwrappedBooking.selectedItems.length > 0
            ? unwrappedBooking.selectedItems
            : (Array.isArray(report?.selectedItems) ? report.selectedItems : []);

        selectedItems.forEach((item) => {
            if (!item) return;
            const itemType = String(item.itemType || "").toLowerCase();
            if (itemType === "package") {
                const pkgDisplay = item.itemName || item.packageName || item.shortName || "";
                addAlias(item.itemName || item.packageName, pkgDisplay);
                addAlias(item.shortName, pkgDisplay);
            } else {
                const display = item.shortName || item.Short_name || item.itemName || "";
                addAlias(item.itemName || item.testName || item.panelName, display);
            }
        });

        const metaEntries = Array.isArray(barcodeMeta) ? barcodeMeta : (barcodeMeta ? [barcodeMeta] : []);
        metaEntries.forEach((entry) => {
            (entry?.singleTests || []).forEach((t) => {
                addAlias(t?.Name || t?.testName || t?.name, t?.Short_name || t?.shortName || t?.Name || t?.testName);
            });
            (entry?.panels || []).forEach((p) => {
                addAlias(p?.name || p?.panelName || p?.title || p?.testName, p?.Short_name || p?.shortName || p?.name || p?.panelName);
            });
            (entry?.packages || []).forEach((pk) => {
                const pkgLabel = pk?.packageName || pk?.name || pk?.Short_name || pk?.shortName || "";
                addAlias(pk?.packageName || pk?.name, pkgLabel);
                addAlias(pk?.Short_name || pk?.shortName, pkgLabel);
            });
        });

        (Array.isArray(report?.CategoryAndTest) ? report.CategoryAndTest : []).forEach((cat) => {
            if (!cat) return;
            if (cat.packageName) addAlias(cat.packageName, cat.packageName || cat.Short_name);
            if (cat.panelName && (cat.Short_name || cat.shortName)) addAlias(cat.panelName, cat.Short_name || cat.shortName);
            if (cat.title && (cat.Short_name || cat.shortName)) addAlias(cat.title, cat.Short_name || cat.shortName);
            (Array.isArray(cat.tests) ? cat.tests : []).forEach((t) => {
                const full = stripPlainHtmlText(t?.Name || t?.testName || "");
                const sh = t?.Short_name || t?.shortName || t?.defaultShortName || "";
                if (full && sh) addAlias(full, sh);
            });
        });

        const tokens = [];
        const seen = new Set();
        const pushToken = (rawName, explicitDisplay = "") => {
            const clean = String(rawName ?? "").replace(/\s+/g, " ").trim();
            if (!clean) return;
            const mapped = shortLookup.get(normalizeInvestLookupText(clean)) || "";
            const resolved = String(explicitDisplay || mapped || clean).trim();
            const key = normalizeInvestLookupText(resolved);
            if (key && !seen.has(key)) {
                seen.add(key);
                tokens.push(resolved);
            }
        };

        // 1. Full Report + booking selectedItems preserves booked order with Test/Panel short names & Package names
        if (!report?.isSelectiveReport && selectedItems.length > 0) {
            selectedItems.forEach((item) => {
                const itemType = String(item?.itemType || "").toLowerCase();
                if (itemType === "package") {
                    pushToken(item?.itemName || item?.packageName || item?.shortName, item?.itemName || item?.packageName || item?.shortName);
                } else {
                    pushToken(item?.itemName || item?.shortName, item?.shortName || item?.Short_name || "");
                }
            });
            if (tokens.length > 0) return tokens.join(", ");
        }

        // 2. Selective subset or report.uniquetestArray mapped cleanly via shortLookup
        const sourceList = report?.isSelectiveReport && Array.isArray(report?.investigationShortNames)
            ? report.investigationShortNames
            : report?.uniquetestArray;

        if (Array.isArray(sourceList) && sourceList.length > 0) {
            sourceList.forEach((item) => {
                const whole = String(item ?? "").trim();
                if (!whole) return;
                if (shortLookup.has(normalizeInvestLookupText(whole))) {
                    pushToken(whole);
                } else {
                    whole.split(",").map((s) => s.trim()).filter(Boolean).forEach((part) => pushToken(part));
                }
            });
        } else if (typeof sourceList === "string" && sourceList.trim()) {
            sourceList.split(",").map((s) => s.trim()).filter(Boolean).forEach((part) => pushToken(part));
        }

        // Include any booked packages from barcodeMeta on Full Report if not already represented
        if (!report?.isSelectiveReport) {
            metaEntries.forEach((entry) => {
                (entry?.packages || []).forEach((pk) => {
                    const pkgLabel = String(pk?.packageName || pk?.name || "").trim();
                    if (pkgLabel) pushToken(pkgLabel, pkgLabel);
                });
            });
        }

        // 2b. Fallback to barcodeMeta.investigations or booking.tableData test names mapped via shortLookup
        if (!tokens.length && !report?.isSelectiveReport) {
            metaEntries.forEach((entry) => {
                (entry?.investigations || []).forEach((inv) => pushToken(inv));
            });
        }
        if (!tokens.length && !report?.isSelectiveReport && Array.isArray(unwrappedBooking?.tableData)) {
            unwrappedBooking.tableData.forEach((row) => {
                String(row?.testName || "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .forEach((part) => pushToken(part));
            });
        }

        // 3. Fallback to CategoryAndTest
        if (!tokens.length && Array.isArray(report?.CategoryAndTest)) {
            report.CategoryAndTest.forEach((cat) => {
                if (cat?.packageName) {
                    pushToken(cat.packageName, cat.packageName);
                } else if (cat?.panelName || (cat?.title && !String(cat.title).includes("Unknown Title"))) {
                    pushToken(cat.panelName || cat.title, cat.Short_name || cat.shortName || "");
                } else if (cat?.category) {
                    pushToken(cat.category);
                }
            });
        }

        return tokens.join(", ");
    }

    let cachedSigLayoutMod = null;
    let sigLayoutPromise = null;

    async function loadSignatureLayoutEngine() {
        if (cachedSigLayoutMod) return cachedSigLayoutMod;
        if (!sigLayoutPromise) {
            sigLayoutPromise = (async () => {
                const candidateOrigins = [];
                if (typeof BASE_URL === "string" && BASE_URL) candidateOrigins.push(BASE_URL);
                if (typeof window !== "undefined" && window.location?.origin && !candidateOrigins.includes(window.location.origin)) {
                    candidateOrigins.push(window.location.origin);
                }
                for (const origin of candidateOrigins) {
                    try {
                        const mod = await import(`${origin}/js/signatureLayoutEngine.mjs?v=1`);
                        if (typeof mod?.normalizeSignatureLayout === "function") {
                            cachedSigLayoutMod = mod;
                            return mod;
                        }
                    } catch (err) {
                        console.warn("[ReportActionHelpers] Could not load signatureLayoutEngine.mjs:", err?.message || err);
                    }
                }
                return null;
            })();
        }
        return sigLayoutPromise;
    }

    async function applySignatureLayoutToFooterContainer(containerEl, rawLayout, opts = {}) {
        if (!containerEl) return false;
        const mod = await loadSignatureLayoutEngine();
        if (!mod?.applySignatureLayoutToContainer) return false;
        return mod.applySignatureLayoutToContainer(containerEl, rawLayout, opts);
    }

    window.ReportActionHelpers = {
        normalizeCounters,
        normalizeActionHistory,
        setStatus,
        isEditableKeyboardTarget,
        bindPageLevelEnterShortcut,
        buildAttachmentFileName,
        resolveDoctorEmail,
        buildShareSummary,
        updateButtonLabel,
        applyActionCounts,
        createActionRequestId,
        mergeQueuedActionStats,
        subscribeToActionUpdates,
        trackAction,
        fetchActionStats,
        flushPendingActions,
        sendPdfByEmail,
        loadClinicalRangeEvaluator,
        evaluateLegacyTestAbnormal,
        applyLegacyAbnormalHighlightStyles,
        fetchAndApplyLegacyPrintSettings,
        loadSelectiveReportEngine,
        resolveInitialSelectiveReport,
        mountReportFilterDrawer,
        isSelectivePrintActive,
        setActiveSelectiveState,
        resolveHeaderDoctorName,
        resolveHeaderInvestigationsText,
        loadSignatureLayoutEngine,
        applySignatureLayoutToFooterContainer,
    };
})();
