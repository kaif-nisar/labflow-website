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
            const prefs = {
                HighLow: hasSaved && data?.HighLow !== undefined ? Boolean(data.HighLow) : true,
                HLinred: hasSaved && data?.HLinred !== undefined ? Boolean(data.HLinred) : true,
                BoldRow: hasSaved && data?.BoldRow !== undefined ? Boolean(data.BoldRow) : true,
            };
            applyLegacyAbnormalHighlightStyles(prefs);
            return prefs;
        } catch {
            applyLegacyAbnormalHighlightStyles(defaults);
            return defaults;
        }
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
    };
})();
