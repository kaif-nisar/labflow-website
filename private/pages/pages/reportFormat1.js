(async function () {
    const bootStartedAt = Date.now();
    const MIN_SKELETON_VISIBLE_MS = 150;
    const bootLoaderEl = document.getElementById('pageBootLoader');
    const bootShellEl = bootLoaderEl?.querySelector('.page-boot-shell');
    const pageRootEl = document.getElementById('reportFormat1Root') || document.body;
    const reportContainerEl = document.getElementById('container');
    const signOffEl = document.querySelector('.signed-off-div');
    const actionBarEl = document.querySelector('.download-pdf-div');
    let isBootPhase = true;

    function fetchWithTopLoaderControl(input, init = {}, { silent = false } = {}) {
        return fetch(input, silent ? { ...init, __topLoaderSilent: true } : init);
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

    function normalizeLookupPart(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function buildMethodInstrumentLookupKey(categoryName, titleName, testName) {
        return [
            normalizeLookupPart(categoryName),
            normalizeLookupPart(titleName),
            normalizeLookupPart(testName),
        ].join("::");
    }

    async function ensureReportActionHelpersLoaded() {
        if (window.ReportActionHelpers) {
            return window.ReportActionHelpers;
        }

        if (typeof window.loadScript === 'function') {
            await window.loadScript(`pages/pages/reportAction.shared.js?t=${Date.now()}`);
            return window.ReportActionHelpers || {};
        }

        const existingScript = document.querySelector('script[data-report-action-helper="true"]');
        if (existingScript) {
            await new Promise((resolve, reject) => {
                existingScript.addEventListener('load', resolve, { once: true });
                existingScript.addEventListener('error', reject, { once: true });
                setTimeout(resolve, 1500);
            });
            return window.ReportActionHelpers || {};
        }

        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `pages/pages/reportAction.shared.js?t=${Date.now()}`;
            script.async = false;
            script.dataset.reportActionHelper = 'true';
            script.onload = resolve;
            script.onerror = () => reject(new Error('reportAction.shared.js could not be loaded'));
            document.body.appendChild(script);
        });

        return window.ReportActionHelpers || {};
    }

    function syncBootLoaderLayout() {
        const container = document.getElementById('container');
        if (!bootLoaderEl || !bootShellEl || !container || !pageRootEl) return;
        const rootRect = pageRootEl.getBoundingClientRect();
        const rect = container.getBoundingClientRect();
        const topOffset = Math.max(0, Math.round(rect.top - rootRect.top));
        bootLoaderEl.style.paddingTop = `${topOffset}px`;
        bootLoaderEl.style.height = `${Math.max(pageRootEl.clientHeight, window.innerHeight)}px`;
        bootShellEl.style.width = `${Math.round(rect.width)}px`;
    }

    function setPageVisible(isVisible) {
        const visibility = isVisible ? 'visible' : 'hidden';
        if (reportContainerEl) reportContainerEl.style.visibility = visibility;
        if (signOffEl) signOffEl.style.visibility = visibility;
        if (actionBarEl) actionBarEl.style.visibility = visibility;
        if (pageRootEl) pageRootEl.style.overflow = isVisible ? '' : 'hidden';
    }

    setPageVisible(false);
    if (bootLoaderEl) {
        bootLoaderEl.style.display = 'flex';
        bootLoaderEl.classList.remove('is-hiding');
    }
    syncBootLoaderLayout();
    window.addEventListener('resize', syncBootLoaderLayout);

    async function waitForVisualReady() {
        const waitForCriticalImagesBootstrap = async () => {
            const imgs = document.querySelectorAll('#qrimg, #barcodeImage');
            await Promise.all(Array.from(imgs).map((img) => new Promise((resolve) => {
                if (!img || !img.src || (img.complete && img.naturalWidth > 0)) return resolve();
                const done = () => resolve();
                const timer = setTimeout(done, 1200);
                img.addEventListener('load', () => { clearTimeout(timer); done(); }, { once: true });
                img.addEventListener('error', () => { clearTimeout(timer); done(); }, { once: true });
            })));
        };

        if (document.fonts?.ready) {
            try {
                await Promise.race([
                    document.fonts.ready,
                    new Promise((resolve) => setTimeout(resolve, 350))
                ]);
            } catch (e) { /* ignore */ }
        }
        await waitForCriticalImagesBootstrap();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    function markPageReady() {
        const elapsed = Date.now() - bootStartedAt;
        const waitMs = Math.max(0, MIN_SKELETON_VISIBLE_MS - elapsed);
        setTimeout(() => {
            setPageVisible(true);
            isBootPhase = false;
            const bootLoader = document.getElementById('pageBootLoader');
            if (bootLoader) {
                bootLoader.classList.add('is-hiding');
                setTimeout(() => { bootLoader.style.display = 'none'; }, 240);
            }
            window.removeEventListener('resize', syncBootLoaderLayout);
        }, waitMs);
    }

    function markPageFailed(error) {
        console.error('Report bootstrap failed:', error);
        const bootLoader = document.getElementById('pageBootLoader');
        if (bootLoader) {
            const label = bootLoader.querySelector('.page-boot-text');
            if (label) label.textContent = 'Failed to load report';
        }
        setTimeout(() => markPageReady(), 1200);
    }

    try {
        await ensureReportActionHelpersLoaded();
    // ─── 1. URL PARAMS ───────────────────────────────────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    let value1 = urlParams.get('value1');

    // ─── 2. PARALLEL INITIAL FETCHES ─────────────────────────────────────────
    const report = await fetchreport();
    if (!report || !report._id) {
        throw new Error('Report data could not be loaded for this booking.');
    }
    const bookingTestMetaPromise = fetchBookingTestMeta(report?.bookingId);

    value1 = report._id;
    const baseUrl = `${BASE_URL}/pages/pages/download_reports.html`;
    let backgroundImageUrl = null;
    const templateImagePromise = fetchTemplateImages()
        .then((url) => {
            backgroundImageUrl = url || null;
            return backgroundImageUrl;
        })
        .catch(() => null);

    localStorage.setItem('myKey', value1);
    localStorage.setItem('bookingId', report.bookingId);
    localStorage.setItem('pdfformat', user.pdfFormat);

    const urlWithParam = `${baseUrl}?value=${encodeURIComponent(value1)}&id=${encodeURIComponent(user.tenantId._id)}`;

    let reportformatlabsign = false;
    let reportformatfirstdoctorsign = false;
    let reportformatseconddoctorsign = false;
    let prewarmInFlight = false;
    let prefetchedViewBlob = null;
    let prefetchedViewBlobUrl = null;
    let prefetchedPayloadKey = "";
    let activeSendPdfBlobUrl = null;
    let activeSendPdfBlob = null;
    let doctorsSignCache = null;
    let renderTask = Promise.resolve();
    let qrTask = Promise.resolve();
    let barcodeTask = Promise.resolve();
    const reportActionHelpers = window.ReportActionHelpers || {};
    const viewPdfButton = document.getElementById('viewPDF');
    const downloadPdfButton = document.getElementById('downloadPDF');
    const emailReportButton = document.getElementById('sendReport');
    const printReportButton = document.getElementById('BrowserPrint');
    const emailStatusMessage = document.getElementById('emailStatusMessage');
    const actionFeedbackMessage = document.getElementById('actionFeedbackMessage');

    const normalizeActionCounters = (counters) =>
        reportActionHelpers.normalizeCounters ? reportActionHelpers.normalizeCounters(counters) : (counters || {});

    const normalizeActionHistory = (history) =>
        reportActionHelpers.normalizeActionHistory ? reportActionHelpers.normalizeActionHistory(history) : (history || {});

    const ACTION_STATS_REFRESH_MS = 20000;
    let actionStatsIntervalId = null;
    let actionStatsSyncInFlight = false;
    let unsubscribeActionUpdates = null;

    function syncActionButtons(actionState = {}) {
        const mergedActionState = reportActionHelpers.mergeQueuedActionStats
            ? reportActionHelpers.mergeQueuedActionStats({
                reportId: value1,
                bookingId: report.bookingId,
                actionCounters: actionState?.actionCounters ?? actionState ?? report.actionCounters,
                actionHistory: actionState?.actionHistory ?? report.actionHistory,
            })
            : {
                actionCounters: actionState?.actionCounters ?? actionState ?? report.actionCounters,
                actionHistory: actionState?.actionHistory ?? report.actionHistory,
            };

        report.actionCounters = normalizeActionCounters(mergedActionState.actionCounters);
        report.actionHistory = normalizeActionHistory(mergedActionState.actionHistory);
        if (reportActionHelpers.applyActionCounts) {
            reportActionHelpers.applyActionCounts({
                viewButton: viewPdfButton,
                downloadButton: downloadPdfButton,
                emailButton: emailReportButton,
                printButton: printReportButton,
                counters: report.actionCounters,
                actionHistory: report.actionHistory
            });
        }
        [viewPdfButton, downloadPdfButton, emailReportButton, printReportButton].forEach((button) => {
            const labelNode = button?.querySelector('span');
            if (button && labelNode) {
                button.dataset.syncedLabel = labelNode.textContent;
            }
        });
    }

    function setEmailStatus(message = "", type = "info") {
        if (reportActionHelpers.setStatus) {
            reportActionHelpers.setStatus(emailStatusMessage, message, type);
        }
    }

    async function refreshActionStats({ silent = true } = {}) {
        if (!reportActionHelpers.fetchActionStats || actionStatsSyncInFlight) return null;

        actionStatsSyncInFlight = true;
        try {
            const latestStats = await reportActionHelpers.fetchActionStats({
                reportId: value1,
                bookingId: report.bookingId,
            });
            syncActionButtons(latestStats);
            return latestStats;
        } catch (error) {
            if (!silent) {
                console.warn('Unable to refresh action stats:', error);
            }
            return null;
        } finally {
            actionStatsSyncInFlight = false;
        }
    }

    async function flushPendingActionStats() {
        if (!reportActionHelpers.flushPendingActions) return [];

        return reportActionHelpers.flushPendingActions({
            reportId: value1,
            bookingId: report.bookingId,
            onSynced: syncActionButtons,
        });
    }

    function bootstrapActionSync() {
        if (reportActionHelpers.subscribeToActionUpdates) {
            unsubscribeActionUpdates = reportActionHelpers.subscribeToActionUpdates((payload) => {
                const sameReport = payload?.reportId && String(payload.reportId) === String(value1);
                const sameBooking = payload?.bookingId && String(payload.bookingId) === String(report.bookingId);
                if (!sameReport && !sameBooking) return;
                syncActionButtons(payload);
            });
        }

        const syncNow = async () => {
            await flushPendingActionStats();
            await refreshActionStats();
        };

        syncNow();

        if (!actionStatsIntervalId) {
            actionStatsIntervalId = window.setInterval(() => {
                if (document.hidden) return;
                syncNow();
            }, ACTION_STATS_REFRESH_MS);
        }

        window.addEventListener('focus', syncNow);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                syncNow();
            }
        });
    }

    let actionFeedbackTimer = null;

    function setActionFeedback(message = "", type = "info", options = {}) {
        if (!actionFeedbackMessage) return;

        const { autoHideMs = type === 'error' ? 4200 : 2600 } = options;
        if (actionFeedbackTimer) {
            clearTimeout(actionFeedbackTimer);
            actionFeedbackTimer = null;
        }

        if (!message) {
            actionFeedbackMessage.textContent = "";
            actionFeedbackMessage.style.display = "none";
            delete actionFeedbackMessage.dataset.state;
            return;
        }

        actionFeedbackMessage.textContent = message;
        actionFeedbackMessage.dataset.state = type;
        actionFeedbackMessage.style.display = "block";

        if (autoHideMs > 0) {
            actionFeedbackTimer = setTimeout(() => {
                actionFeedbackMessage.textContent = "";
                actionFeedbackMessage.style.display = "none";
                delete actionFeedbackMessage.dataset.state;
                actionFeedbackTimer = null;
            }, autoHideMs);
        }
    }

    function setButtonBusy(button, isBusy, busyLabel = "") {
        if (!button) return;

        const labelNode = button.querySelector('span');
        if (!button.dataset.baseLabel) {
            button.dataset.baseLabel = labelNode ? labelNode.textContent : button.textContent;
        }

        button.disabled = Boolean(isBusy);
        button.classList.toggle('is-busy', Boolean(isBusy));
        button.setAttribute('aria-busy', isBusy ? 'true' : 'false');

        if (isBusy && busyLabel) {
            if (labelNode) labelNode.textContent = busyLabel;
            else button.textContent = busyLabel;
            return;
        }

        if (!isBusy) {
            const refreshedLabel = button.dataset.syncedLabel || button.dataset.baseLabel;
            if (refreshedLabel) {
                if (labelNode) labelNode.textContent = refreshedLabel;
                else button.textContent = refreshedLabel;
            }
        }
    }

    async function trackSuccessfulAction(action) {
        if (!reportActionHelpers.trackAction) return null;
        try {
            const clientActionId = reportActionHelpers.createActionRequestId
                ? reportActionHelpers.createActionRequestId(action)
                : `${action}-${Date.now()}`;
            const tracked = await reportActionHelpers.trackAction({
                reportId: value1,
                bookingId: report.bookingId,
                action,
                clientActionId,
                currentCounters: report.actionCounters,
                currentHistory: report.actionHistory,
            });

            if (tracked?.actionCounters || tracked?.actionHistory) {
                syncActionButtons(tracked);
            }

            if (tracked?.queued) {
                setActionFeedback(
                    tracked?.message || 'Action saved locally. Count will sync automatically.',
                    'info',
                    { autoHideMs: 3600 }
                );
            }
            return tracked;
        } catch (error) {
            console.warn(`Unable to track ${action}:`, error);
            return null;
        }
    }

    function resolveDefaultEmail() {
        if (reportActionHelpers.resolveDoctorEmail) {
            return reportActionHelpers.resolveDoctorEmail(report);
        }
        return report?.contactDefaults?.email || report?.savedDoctorEmail || "";
    }

    function resolveDefaultWhatsappNumber() {
        const storedBooking = (() => {
            try {
                return JSON.parse(localStorage.getItem('booking')) || {};
            } catch {
                return {};
            }
        })();

        const candidates = [
            report?.patientPhone,
            report?.contactDefaults?.phone,
            report?.contactDefaults?.whatsapp,
            report?.savedDoctorMeta?.phone,
            storedBooking?.patientPhone,
        ];

        return candidates.find((entry) => String(entry || "").trim()) || "";
    }

    function normalizeWhatsappNumber(value) {
        let digits = String(value || "").replace(/\D/g, "");
        if (!digits) return "";
        if (digits.length === 10) {
            digits = `91${digits}`;
        }
        return digits;
    }

    function isValidWhatsappNumber(value) {
        const digits = normalizeWhatsappNumber(value);
        return digits.length >= 11 && digits.length <= 15;
    }

    function formatShareDate(value) {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        return new Intl.DateTimeFormat("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        }).format(date);
    }

    function buildWhatsappShareMessage() {
        const lines = [
            `Hello${report?.patientName ? ` ${report.patientName}` : ""},`,
            "",
            "Your lab report is ready.",
            report?.patientName ? `Patient Name: ${report.patientName}` : "",
            report?.bookingId ? `Booking ID: ${report.bookingId}` : "",
            report?.reportedOn ? `Reported On: ${formatShareDate(report.reportedOn)}` : "",
            report?.labName ? `Lab: ${report.labName}` : "",
            "",
            "Download your report securely using the link below:",
            urlWithParam,
            "",
            "Please keep this message for future reference.",
            "",
            "Regards,",
            report?.labName || "LabFlow",
        ];

        return lines.filter(Boolean).join("\n");
    }

    syncActionButtons(report);
    bootstrapActionSync();

    // ─── 3. Header + Doctor Signs parallel ───────────────────────────────────
    const doctorsSignTask = fetchdoctorsandlabsign();
    await populateHeader();

    barcodeTask = barcodegenerator();
    renderTask = renderData(report);
    syncBootLoaderLayout();
    await signoffdivfunction();
    downloadpdffunction();
    sendReport();
    hidecontent();
    markPageReady();

    const defer = (cb) => {
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => cb(), { timeout: 1200 });
        } else {
            setTimeout(cb, 0);
        }
    };

    defer(() => {
        Promise.allSettled([
            doctorsSignTask,
            qrTask,
            barcodeTask,
            waitForVisualReady(),
            convertImagesToBase64('.signed-off-div2 img')
        ]).then(() => {
            prewarmPdfInBackground();
        }).catch(() => {
            prewarmPdfInBackground();
        });
    });

    // ════════════════════════════════════════════════════════════════════════
    //  FUNCTION DEFINITIONS
    // ════════════════════════════════════════════════════════════════════════

    async function fetchdoctorsandlabsign() {
        try {
            const response = await fetchWithTopLoaderControl(`${BASE_URL}/api/v1/user/getDoctorsSign`, {}, { silent: isBootPhase });
            if (!response.ok) { console.log("doctor sign is not available"); return null; }

        const doctorsdata = await response.json();
        doctorsSignCache = doctorsdata;
        reportformatlabsign          = doctorsdata.showlabinchargesign;
        reportformatfirstdoctorsign  = doctorsdata.showfirstdoctorsign;
        reportformatseconddoctorsign = doctorsdata.showseconddoctorsign;

        const slot = (flag, src, text) => `
            <div class="left-sign" style="display:${flag ? 'block' : 'none'}; text-align:center;">
                ${src ? `<img src="${src}" width="95" height="35" loading="eager" decoding="sync"/>` : `<div style="height:35px;width:95px;"></div>`}
                <div class="textspan">${text || ''}</div>
            </div>`;

        const signoffdiv = document.querySelector('.signed-off-div');
        signoffdiv.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'signed-off-div2';
        div.innerHTML = `
        ${slot(reportformatfirstdoctorsign, doctorsdata.firstdoctorsign, doctorsdata.firstdoctorsigninfo)}
        ${slot(reportformatlabsign, doctorsdata.labinchargesign, doctorsdata.labinchargeinfo)}
        ${slot(reportformatseconddoctorsign, doctorsdata.seconddoctorsign, doctorsdata.seconddoctorsigninfo)}
        `;
        signoffdiv.appendChild(div);
        return doctorsdata;
    } catch (error) {
        console.log(error.message);
        return null;
    }
}

    async function qrcodegenerator() {
        try {
            const response = await fetchWithTopLoaderControl(`/api/v1/user/generate-qr`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ link: urlWithParam }),
            }, { silent: isBootPhase });
            if (!response.ok) throw new Error('Failed to generate QR code.');
            const data = await response.json();
            const qrCodeImage = document.getElementById('qrimg');
            if (!qrCodeImage) { console.error('qrimg element not found'); return; }
            const qrSource = data?.qrCode || data?.qrcode || data?.qr || data?.image || data?.url;
            if (!qrSource) throw new Error('QR source missing in API response');

            if (qrSource.startsWith('data:')) {
                qrCodeImage.src = qrSource;
            } else if (qrSource) {
                try {
                    qrCodeImage.src = await urlToBase64(qrSource);
                } catch {
                    qrCodeImage.src = qrSource;
                }
            }
            qrCodeImage.style.display = 'block';
            qrCodeImage.loading = 'eager';
            console.log('QR set, src prefix:', qrCodeImage.src.substring(0, 30));
        } catch (error) {
            console.error('QR Error:', error);
        }
    }

    async function urlToBase64(url) {
        const absoluteUrl = new URL(url, window.location.origin).href;
        const target = new URL(absoluteUrl);
        const isSameOrigin = target.origin === window.location.origin;

        const res  = await fetchWithTopLoaderControl(absoluteUrl, {
            credentials: isSameOrigin ? 'include' : 'omit',
            mode: 'cors',
            cache: 'no-store'
        }, { silent: true });
        if (!res.ok) throw new Error('Network response was not ok');
        const blob = await res.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onload  = () => resolve(reader.result);
            reader.onerror = reject;
        });
    }

    async function convertImagesToBase64(selector) {
        const images = document.querySelectorAll(selector);
        if (!images.length) return;
        await Promise.all(Array.from(images).map(async img => {
            if (!img.src || img.src.startsWith('data:') || img.src === '') return;
            try { img.src = await urlToBase64(img.src); } catch (e) { console.warn('img convert failed:', e); }
        }));
    }

    async function ensureImagesBase64(selectors = ['#qrimg', '#barcodeImage', '.signed-off-div2 img']) {
        if (!Array.isArray(selectors) || !selectors.length) return;
        await Promise.all(selectors.map(async (sel) => {
            const imgs = document.querySelectorAll(sel);
            await Promise.all(Array.from(imgs).map(async img => {
                if (!img.src || img.src.startsWith('data:') || img.src === '') return;
                try {
                    img.src = await urlToBase64(img.src);
                } catch (e) {
                    console.warn(`base64 convert failed for ${sel}:`, e);
                    img.src = new URL(img.src, window.location.origin).href;
                }
            }));
        }));
    }

    async function ensureCriticalCodeAssetsReady() {
        const qrCodeImage = document.getElementById('qrimg');
        const barcodeImage = document.getElementById('barcodeImage');

        const hasQrData = !!(qrCodeImage?.src && qrCodeImage.src.startsWith('data:image'));
        const hasBarcodeData = !!(barcodeImage?.src && barcodeImage.src.startsWith('data:image'));
        if (hasQrData && hasBarcodeData) return;

        await Promise.allSettled([qrTask, barcodeTask]);
        const retryTasks = [];

        if (qrCodeImage && !qrCodeImage.src) {
            qrTask = qrcodegenerator();
            retryTasks.push(qrTask);
        }
        if (barcodeImage && !barcodeImage.src) {
            barcodeTask = barcodegenerator();
            retryTasks.push(barcodeTask);
        }

        if (retryTasks.length) {
            await Promise.allSettled(retryTasks);
        }

        const codeImgs = Array.from(document.querySelectorAll('#qrimg, #barcodeImage'));
        await Promise.all(codeImgs.map((img) => waitForImageReady(img, 850)));
    }

    function waitForImageReady(img, timeoutMs = 6000) {
        if (!img || !img.src) return Promise.resolve();
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
            const done = () => resolve();
            const timer = setTimeout(done, timeoutMs);
            img.addEventListener('load', () => { clearTimeout(timer); done(); }, { once: true });
            img.addEventListener('error', () => { clearTimeout(timer); done(); }, { once: true });
        });
    }

    async function waitForCriticalImages() {
        const imgs = document.querySelectorAll('#qrimg, #barcodeImage, .signed-off-div2 img');
        await Promise.all(Array.from(imgs).map((img) => waitForImageReady(img)));
    }

    // ─── PDF data helper ─────────────────────────────────────────────────────
    // withBackground: true  → download PDF (background image include hogi)
    // withBackground: false → view/prewarm PDF (background hamesha null rahegi)
    // PDF + Download + prewarm flows blank background use karte hain.
    // Send/share flow background image ke saath hi rahega.
    async function collectPdfPayload(extras = {}, options = {}) {
        const { skipImagePrep = false, withBackground = true } = options;
        await renderTask;
        await ensureCriticalCodeAssetsReady();
        if (!skipImagePrep) {
            await ensureImagesBase64();
            await waitForCriticalImages();
        } else {
            await ensureImagesBase64(['.signed-off-div2 img']);
        }

        // ✅ KEY FIX: withBackground=false hone par background resolve hi mat karo
        let resolvedBackgroundImageUrl = null;
        if (withBackground) {
            resolvedBackgroundImageUrl =
                backgroundImageUrl ?? await templateImagePromise.catch(() => null);
        }

        return {
            showlab:             reportformatlabsign,
            showdoctorfirst:     reportformatfirstdoctorsign,
            showdoctorsecond:    reportformatseconddoctorsign,
            htmlContent:         document.querySelector('.container2').outerHTML,
            cssContent:          document.getElementById('stying').innerHTML,
            header:              document.querySelector('.report-details').outerHTML,
            footer:              document.querySelector('.signed-off-div').outerHTML,
            reportId:            value1,
            backgroundImageUrl:  resolvedBackgroundImageUrl,
            checkBox:            !withBackground,       // true = no background (server side flag)
            disableBackgroundImage: !withBackground,    // extra safety flag for server
            investigationmargin: countLines(),
            ...extras
        };
    }

    async function savePdfData(extras = {}) {
        const response = await fetch(`/api/v1/user/adding-pdf-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(await collectPdfPayload(extras)),
        });
        if (!response.ok) throw new Error('data not saved');
    }

    function buildViewPayloadKey(payload) {
        return JSON.stringify({ ...payload, value1, DownloadPdf: false });
    }

    function buildReportPdfFileName() {
        const safeName = (report?.patientName || 'Patient')
            .replace(/[^a-zA-Z0-9\u0900-\u097F\s]/g, '')
            .trim()
            .replace(/\s+/g, '_');
        const safeId = (report?.bookingId || 'Report').replace(/[^a-zA-Z0-9-_]/g, '');
        return `${safeName || 'Patient'}-${safeId || 'Report'}.pdf`;
    }

    async function openPdfInDesktopShell(pdfBlob, fileName = buildReportPdfFileName()) {
        if (!window.LabFlowDesktopShell?.saveAndOpenPdf || !(pdfBlob instanceof Blob)) {
            return false;
        }

        const result = await window.LabFlowDesktopShell.saveAndOpenPdf({
            fileName,
            buffer: await pdfBlob.arrayBuffer(),
        });

        if (!result?.success) {
            throw new Error(result?.message || 'PDF open failed');
        }

        return true;
    }

    // ─── FIX: View/prewarm ke liye hamesha withBackground:false use karo ────────
    async function prewarmPdfInBackground() {
        if (prewarmInFlight) return;
        prewarmInFlight = true;
        try {
            // withBackground:false → backgroundImageUrl=null, checkBox=true server ko jayega
            const viewPayload = await collectPdfPayload({}, { skipImagePrep: true, withBackground: false });
            const payloadKey = buildViewPayloadKey(viewPayload);
            if (prefetchedViewBlobUrl && payloadKey === prefetchedPayloadKey) return;
            const blob = await fetchServerPdfBlob(viewPayload, { silent: true });
            setPrefetchedViewBlob(blob, payloadKey);
        } catch (error) {
            console.warn('PDF prewarm failed:', error);
        } finally {
            prewarmInFlight = false;
        }
    }

    function setPrefetchedViewBlob(blob, payloadKey) {
        if (prefetchedViewBlobUrl) URL.revokeObjectURL(prefetchedViewBlobUrl);
        prefetchedViewBlob = blob;
        prefetchedViewBlobUrl = URL.createObjectURL(blob);
        prefetchedPayloadKey = payloadKey;
    }

    async function fetchServerPdfBlob(payload, { silent = false } = {}) {
        const response = await fetchWithTopLoaderControl(`/api/v1/user/get-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, value1, DownloadPdf: false, isReportFormat: true }),
        }, { silent });
        if (!response.ok) throw new Error('PDF generation failed');
        return response.blob();
    }

    // ─── PDF setting button ──────────────────────────────────────────────────
    document.getElementById('PDFsettinganchr').addEventListener('click', async (event) => {
        event.preventDefault();
        const settingsButton = document.getElementById('PDFsetting');
        setButtonBusy(settingsButton, true, 'Saving...');
        setActionFeedback('Print settings save ho rahi hain...', 'info', { autoHideMs: 0 });
        try {
            await savePdfData();
            window.location.href = document.getElementById('PDFsettinganchr').href;
        } catch (error) {
            console.error('Error generating PDF:', error);
            setActionFeedback('Print settings save nahi ho paayi. Please try again.', 'error');
        } finally {
            setButtonBusy(settingsButton, false);
        }
    });

    // ─── VIEW PDF ────────────────────────────────────────────────────────────
    function createViewPdfRoot() {
        const cssContent = document.getElementById('stying')?.innerHTML || '';
        const headerNode = document.querySelector('.report-details');
        const bodyNode = document.querySelector('.container2');
        const footerNode = document.querySelector('.signed-off-div');
        if (!headerNode || !bodyNode) throw new Error('PDF source nodes missing');

        const root = document.createElement('div');
        root.id = 'viewPdfRoot';
        root.style.width = '794px';
        root.style.margin = '0 auto';
        root.style.background = '#fff';
        root.style.color = '#000';

        const scopedStyle = document.createElement('style');
        scopedStyle.textContent = `
            ${cssContent}
            @page { size: A4 portrait; margin: 0; }
            #viewPdfRoot * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            #viewPdfRoot .download-pdf-div,
            #viewPdfRoot .wrong,
            #viewPdfRoot .delete-btn,
            #viewPdfRoot #modal,
            #viewPdfRoot .popup-modal { display: none !important; }
            #viewPdfRoot .container-format1 {
                box-shadow: none !important;
                border-radius: 0 !important;
                margin: 0 !important;
                width: 100% !important;
                padding: 0 !important;
            }
            #viewPdfRoot .report-details,
            #viewPdfRoot .container2 {
                width: 95% !important;
                margin-left: auto !important;
                margin-right: auto !important;
            }
            #viewPdfRoot .container22 { min-width: 0 !important; }
            #viewPdfRoot .signed-off-div {
                margin: 20px 0 0 0 !important;
                width: 92% !important;
                margin-left: auto !important;
                margin-right: auto !important;
            }
            #viewPdfRoot .signed-off-div2 {
                justify-content: space-between !important;
            }
            #viewPdfRoot .click.qr-div { display: flex !important; }
            #viewPdfRoot .page-break {
                break-before: page !important;
                page-break-before: always !important;
            }
            #viewPdfRoot table {
                page-break-inside: auto !important;
            }
            #viewPdfRoot tr {
                page-break-inside: avoid !important;
                page-break-after: auto !important;
            }
        `;

        const wrapper = document.createElement('div');
        wrapper.className = 'container-format1';
        const inner = document.createElement('div');
        inner.className = 'container22';
        inner.appendChild(headerNode.cloneNode(true));
        inner.appendChild(bodyNode.cloneNode(true));
        wrapper.appendChild(inner);

        root.appendChild(scopedStyle);
        root.appendChild(wrapper);
        if (footerNode) root.appendChild(footerNode.cloneNode(true));
        return root;
    }

    document.getElementById('viewPDF').addEventListener('click', async (e) => {
        const button = e.currentTarget;
        setButtonBusy(button, true, 'Opening...');
        setActionFeedback('PDF prepare ho rahi hai...', 'info', { autoHideMs: 0 });

        const shouldUseBrowserPopup = !window.LabFlowDesktopShell?.saveAndOpenPdf;
        const newTab = shouldUseBrowserPopup ? window.open('', '_blank') : null;
        if (shouldUseBrowserPopup && !newTab) {
            alert('Popup blocked! Please allow popups for this site and try again.');
            setActionFeedback('Popup blocked hai. Please allow popups and try again.', 'error');
            setButtonBusy(button, false);
            return;
        }

        if (newTab) {
            newTab.document.write(`<!DOCTYPE html><html><head><title>Opening PDF...</title>
            <style>
                *{margin:0;padding:0;box-sizing:border-box;}
                body{display:flex;flex-direction:column;align-items:center;justify-content:center;
                     height:100vh;background:#f0f4ff;font-family:Arial,sans-serif;}
                .spinner{width:56px;height:56px;border:6px solid #c7d9ff;
                         border-top:6px solid #1a73e8;border-radius:50%;
                         animation:spin 0.85s linear infinite;margin-bottom:22px;}
                @keyframes spin{to{transform:rotate(360deg);}}
                p{font-size:16px;color:#555;}
            </style></head><body>
                <div class="spinner"></div>
                <p>Opening PDF, please wait...</p>
            </body></html>`);
            newTab.document.close();
        }

        try {
            let pdfBlob = prefetchedViewBlob;

            if (!pdfBlob) {
                const viewPayload = await collectPdfPayload({}, { skipImagePrep: true, withBackground: false });
                const payloadKey = buildViewPayloadKey(viewPayload);
                pdfBlob = await fetchServerPdfBlob(viewPayload);
                setPrefetchedViewBlob(pdfBlob, payloadKey);
            }

            const openedInDesktop = await openPdfInDesktopShell(pdfBlob);
            if (!openedInDesktop && newTab) {
                newTab.location.href = prefetchedViewBlobUrl;
            }
            const trackedViewAction = await trackSuccessfulAction('viewPdf');
            setActionFeedback(
                trackedViewAction?.queued
                    ? 'PDF open ho gayi. Count locally save ho gaya, backend sync automatic hoga.'
                    : 'PDF open ho gayi aur count update ho gaya.',
                trackedViewAction?.queued ? 'info' : 'success'
            );
        } catch (error) {
            console.error('Error viewing PDF:', error);
            if (newTab) {
                newTab.document.open();
                newTab.document.write(`<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Arial;font-size:17px;color:red;">
                ❌ PDF generation failed. Please close this tab and try again.</body></html>`);
                newTab.document.close();
            }
            setActionFeedback('PDF open nahi ho paayi. Please try again.', 'error');
        } finally {
            setButtonBusy(button, false);
        }
    });

    // ─── Send Report ─────────────────────────────────────────────────────────
    window.addEventListener('beforeunload', () => {
        if (actionStatsIntervalId) {
            clearInterval(actionStatsIntervalId);
            actionStatsIntervalId = null;
        }
        if (typeof unsubscribeActionUpdates === 'function') {
            unsubscribeActionUpdates();
            unsubscribeActionUpdates = null;
        }
        if (prefetchedViewBlobUrl) URL.revokeObjectURL(prefetchedViewBlobUrl);
        if (activeSendPdfBlobUrl) URL.revokeObjectURL(activeSendPdfBlobUrl);
        prefetchedViewBlob = null;
        prefetchedViewBlobUrl = null;
        activeSendPdfBlobUrl = null;
        activeSendPdfBlob = null;
        prefetchedPayloadKey = "";
    });

    async function sendReport() {
        const sendReportButton = document.getElementById('sendReport');
        const popupModal       = document.getElementById('popupModal');
        const closeButton      = document.querySelector('.close-button');
        const inputField       = document.getElementById('inputField');
        const contactInput     = document.getElementById('contactInput');
        const sendButton       = document.getElementById('sendButton');
        const iframe           = document.getElementById('pdfFrame');
        const openPdfButton    = document.getElementById('openPdfButton');
        const whatsappButton   = document.getElementById('whatsappButton');
        const emailButton      = document.getElementById('emailButton');
        const shareTitle       = document.getElementById('shareTitle');
        const shareModeHint    = document.getElementById('shareModeHint');
        const shareDrafts      = {
            whatsapp: resolveDefaultWhatsappNumber(),
            email: resolveDefaultEmail(),
        };
        let activeShareMode = shareDrafts.whatsapp ? 'whatsapp' : 'email';

        const shareModeMeta = {
            whatsapp: {
                title: 'WhatsApp Report',
                placeholder: 'Enter WhatsApp Number',
                buttonLabel: 'Open WhatsApp',
                buttonIcon: 'fa-brands fa-whatsapp',
                inputType: 'tel',
                inputMode: 'numeric',
                autocomplete: 'tel',
                hint: 'A polished WhatsApp message with the secure report download link will open in a new chat. Indian 10-digit numbers are auto-formatted with +91.',
            },
            email: {
                title: 'Email Report',
                placeholder: 'Enter Email Address',
                buttonLabel: 'Send Email',
                buttonIcon: 'fa-solid fa-envelope',
                inputType: 'email',
                inputMode: 'email',
                autocomplete: 'email',
                hint: 'The PDF preview below will be sent as an email attachment using the existing email workflow.',
            },
        };

        const applyShareMode = (mode, { focusInput = false } = {}) => {
            if (!shareModeMeta[mode]) {
                mode = 'email';
            }

            shareDrafts[activeShareMode] = contactInput.value.trim();
            activeShareMode = mode;
            const meta = shareModeMeta[mode];

            whatsappButton.classList.toggle('is-active', mode === 'whatsapp');
            emailButton.classList.toggle('is-active', mode === 'email');

            shareTitle.textContent = meta.title;
            shareModeHint.textContent = meta.hint;

            contactInput.type = meta.inputType;
            contactInput.inputMode = meta.inputMode;
            contactInput.autocomplete = meta.autocomplete;
            contactInput.placeholder = meta.placeholder;
            contactInput.value = shareDrafts[mode] || "";

            sendButton.dataset.mode = mode;
            sendButton.innerHTML = `<i class="${meta.buttonIcon}"></i><span>${meta.buttonLabel}</span>`;
            sendButton.dataset.baseLabel = meta.buttonLabel;
            sendButton.dataset.syncedLabel = meta.buttonLabel;

            setEmailStatus();

            if (focusInput) {
                contactInput.focus();
                if (typeof contactInput.select === 'function') {
                    contactInput.select();
                }
            }
        };

        sendReportButton.addEventListener('click', async (e) => {
            const button = e.currentTarget;
            setButtonBusy(button, true, 'Preparing...');
            setEmailStatus();
            setActionFeedback('Report preview prepare ho rahi hai...', 'info', { autoHideMs: 0 });
            try {
                const latestPayload = await collectPdfPayload();
                const pdfResponse = await fetchWithTopLoaderControl(`/api/v1/user/get-pdf`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...latestPayload, value1, isReportFormat: true }),
                }, { silent: true });
                if (!pdfResponse.ok) throw new Error('PDF generation failed');
                popupModal.style.display = 'block';
                const pdfBlob = await pdfResponse.blob();
                activeSendPdfBlob = pdfBlob;
                if (activeSendPdfBlobUrl) URL.revokeObjectURL(activeSendPdfBlobUrl);
                activeSendPdfBlobUrl = URL.createObjectURL(activeSendPdfBlob);
                iframe.src = activeSendPdfBlobUrl;
                inputField.style.display = 'flex';
                shareDrafts.email = resolveDefaultEmail();
                shareDrafts.whatsapp = resolveDefaultWhatsappNumber();
                applyShareMode(shareDrafts.whatsapp ? 'whatsapp' : 'email', { focusInput: true });
                setActionFeedback('Report preview ready hai. WhatsApp ya email choose karke send karein.', 'success');
            } catch (error) {
                console.error('Error generating email preview:', error);
                setActionFeedback('Report preview generate nahi ho paayi. Please try again.', 'error');
                popupModal.style.display = 'none';
            } finally {
                setButtonBusy(button, false);
            }
        });

        closeButton.addEventListener('click', () => {
            popupModal.style.display = 'none';
            setEmailStatus();
        });
        window.addEventListener('click', (event) => {
            if (event.target === popupModal) {
                popupModal.style.display = 'none';
                setEmailStatus();
            }
        });

        contactInput.addEventListener('input', () => {
            shareDrafts[activeShareMode] = contactInput.value;
            setEmailStatus();
        });

        whatsappButton.addEventListener('click', () => applyShareMode('whatsapp', { focusInput: true }));
        emailButton.addEventListener('click', () => applyShareMode('email', { focusInput: true }));

        sendButton.onclick = async () => {
            if (activeShareMode === 'whatsapp') {
                const normalizedWhatsapp = normalizeWhatsappNumber(contactInput.value);
                if (!isValidWhatsappNumber(normalizedWhatsapp)) {
                    setEmailStatus('Please enter a valid WhatsApp number. 10-digit Indian numbers are supported automatically.', 'error');
                    return;
                }

                setButtonBusy(sendButton, true, 'Opening...');
                setEmailStatus('WhatsApp chat prepare ho rahi hai...', 'info');
                setActionFeedback('WhatsApp chat open ki ja rahi hai...', 'info', { autoHideMs: 0 });
                try {
                    shareDrafts.whatsapp = normalizedWhatsapp;
                    const whatsappUrl = `https://wa.me/${normalizedWhatsapp}?text=${encodeURIComponent(buildWhatsappShareMessage())}`;
                    const openedWindow = window.open(whatsappUrl, '_blank', 'noopener');
                    if (!openedWindow) {
                        throw new Error('WhatsApp window open nahi ho paayi. Please allow popups and try again.');
                    }

                    const trackedWhatsappAction = await trackSuccessfulAction('whatsappOpen');
                    setEmailStatus('WhatsApp chat ready hai. Message review karke send kar dein.', 'success');
                    setActionFeedback(
                        trackedWhatsappAction?.queued
                            ? 'WhatsApp open locally record ho gaya. Backend sync automatic hoga.'
                            : 'WhatsApp chat report link ke saath open ho gayi.',
                        trackedWhatsappAction?.queued ? 'info' : 'success'
                    );
                } catch (error) {
                    setEmailStatus(error?.message || 'WhatsApp open nahi ho paayi. Please try again.', 'error');
                    setActionFeedback(error?.message || 'WhatsApp open nahi ho paayi. Please try again.', 'error');
                } finally {
                    setButtonBusy(sendButton, false);
                }
                return;
            }

            const email = contactInput.value.trim().toLowerCase();
            if (!email || (typeof contactInput.checkValidity === 'function' && !contactInput.checkValidity())) {
                setEmailStatus('Please enter a valid email address.', 'error');
                if (typeof contactInput.reportValidity === 'function') {
                    contactInput.reportValidity();
                }
                return;
            }
            if (!activeSendPdfBlob && !iframe.src) {
                setEmailStatus('PDF preview ready nahi hai. Please try again.', 'error');
                return;
            }

            setButtonBusy(sendButton, true, 'Sending...');
            setEmailStatus('Email bheja ja raha hai...', 'info');
            setActionFeedback('Email send ho rahi hai...', 'info', { autoHideMs: 0 });
            try {
                shareDrafts.email = email;
                const clientActionId = reportActionHelpers.createActionRequestId
                    ? reportActionHelpers.createActionRequestId('email')
                    : `email-${Date.now()}`;
                const payload = await reportActionHelpers.sendPdfByEmail({
                    email,
                    pdfBlob: activeSendPdfBlob,
                    pdfUrl: iframe.src,
                    report,
                    clientActionId,
                });
                if (payload?.actionCounters || payload?.actionHistory) {
                    syncActionButtons(payload);
                }
                await refreshActionStats();
                setEmailStatus(payload?.message || 'Email sent successfully.', 'success');
                setActionFeedback(payload?.message || 'Email sent successfully.', 'success');
            } catch (error) {
                setEmailStatus(error?.message || 'Internet weak hai, email send nahi hua. Please try again.', 'error');
                setActionFeedback(error?.message || 'Internet weak hai, email send nahi hua. Please try again.', 'error');
            } finally {
                setButtonBusy(sendButton, false);
            }
        };

        openPdfButton.addEventListener('click', () => {
            if (!iframe.src && !activeSendPdfBlob) {
                setEmailStatus('Preview PDF abhi ready nahi hai.', 'error');
                return;
            }
            void (async () => {
                try {
                    if (activeSendPdfBlob && await openPdfInDesktopShell(activeSendPdfBlob)) {
                        return;
                    }
                    window.open(iframe.src, '_blank');
                } catch (error) {
                    console.error('Error opening preview PDF:', error);
                    setEmailStatus('Preview PDF open nahi ho paayi. Please try again.', 'error');
                }
            })();
        });

        applyShareMode(activeShareMode);
    }

    async function fetchreport() {
        try {
            const response = await fetchWithTopLoaderControl(`/api/v1/user/ReportData`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ value1 })
            }, { silent: isBootPhase });
            if (!response.ok) {
                let message = "something went wrong";
                try {
                    const payload = await response.json();
                    message = payload?.message || payload?.error || message;
                } catch {
                    // Ignore parse errors and use the fallback message.
                }
                throw new Error(message);
            }
            return await response.json();
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    async function fetchBookingTestMeta(bookingId) {
        if (!bookingId) {
            return new Map();
        }

        try {
            const response = await fetchWithTopLoaderControl(`/api/v1/user/getbarcodeTests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookingId })
            }, { silent: isBootPhase });

            if (!response.ok) {
                return new Map();
            }

            const payload = await response.json();
            return buildBookingTestMetaMap(payload?.[0]);
        } catch (error) {
            console.warn("Unable to load booking test metadata:", error);
            return new Map();
        }
    }

    function buildBookingTestMetaMap(testPayload = {}) {
        const lookup = new Map();

        const addMeta = (categoryName, titleName, testName, meta) => {
            if (!testName) {
                return;
            }

            const key = buildMethodInstrumentLookupKey(categoryName, titleName, testName);
            lookup.set(key, {
                hideMethodInstrument: parseStoredCheckboxFlag(meta?.hideMethodInstrument),
                method: meta?.method || "",
                instrument: meta?.instrument || "",
            });
        };

        const singleTests = Array.isArray(testPayload?.singleTests) ? testPayload.singleTests : [];
        singleTests.forEach((test) => {
            const categoryName = test?.category?.category || test?.category || "";
            addMeta(categoryName, categoryName, test?.Name, {
                hideMethodInstrument: test?.hideMethodInstrument,
                method: test?.method,
                instrument: test?.instrument,
            });
        });

        const panels = Array.isArray(testPayload?.panels) ? testPayload.panels : [];
        panels.forEach((panel) => {
            const categoryName = panel?.category?.category || panel?.category || "";
            const titleName = panel?.name || categoryName;
            const panelHideMethodInstrument = parseStoredCheckboxFlag(panel?.hideMethodInstrument);
            const tests = Array.isArray(panel?.testsId) ? panel.testsId : [];

            tests.forEach((test) => {
                addMeta(categoryName, titleName, test?.Name, {
                    hideMethodInstrument: panelHideMethodInstrument,
                    method: test?.method,
                    instrument: test?.instrument,
                });
            });
        });

        return lookup;
    }

    function formatDateTime(timestamp) {
        const date    = new Date(timestamp);
        const month   = (date.getMonth() + 1).toString().padStart(2, '0');
        const day     = date.getDate().toString().padStart(2, '0');
        const year    = date.getFullYear();
        let hours     = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const amPm    = hours >= 12 ? 'PM' : 'AM';
        hours = (hours % 12 || 12).toString().padStart(2, '0');
        return `${day}-${month}-${year} <span>${hours}:${minutes} ${amPm}</span>`;
    }

    async function populateHeader() {
        document.getElementById("booking-registeration-number").innerText = report.reg_id;

        const patientdetails = document.createElement("div");
        patientdetails.classList.add("report-details-innerDiv2");
        patientdetails.innerHTML = `
        <div class="format1left2">
            <div class="format1-infor-div fixedheightdiv">
                <div class="format1-tags">Patient Name:</div>
                <div class="value" style="font-weight:700;font-size:15px;color:#111;">${report.patientName}</div>
            </div>
            <div class="format1-infor-div fixedheightdiv"><div class="format1-tags">Age / Sex:</div><div class="value">${report.year} / ${report.gender}</div></div>
            <div class="format1-infor-div fixedheightdiv"><div class="format1-tags">Referred By:</div><div class="value">${report.doctorName}</div></div>
            <div class="format1-infor-div fixedheightdiv"><div class="format1-tags">Reg. no:</div><div class="value">${report.bookingId}</div></div>
            <div class="format1-infor-div forhide fixedheightdiv"><div class="format1-tags">Lab Name:</div><div class="value">${report.labName}</div></div>
            <div class="format1-infor-div forhide" id="investDiv"><div class="format1-tags">Investigations:</div><div class="value"><span id="investigationarray">${report.uniquetestArray}</span></div></div>
        </div>
        <div class="format1-right2">
            <div>
                <div class="format1-registered-div2">
                    <div class="barcode-div2"><div class="barcode2"><div id="barcodeContainer2">
                        <img id="barcodeImage" alt="Generated Barcode" style="background:transparent;" />
                    </div></div></div>
                </div>
                <div class="format1-registered-div2">
                    <div class="format1-registeration-tag2">Registered on:</div>
                    <div class="format1-time-div">${formatDateTime(new Date(report.date).toISOString().split('T')[0] + "T" + report.time)}</div>
                </div>
                <div class="format1-registered-div2 forhide">
                    <div class="format1-registeration-tag2">Collected on:</div>
                    <div class="format1-time-div">${formatDateTime(report.collectedOn)}</div>
                </div>
                <div class="format1-registered-div2 forhide">
                    <div class="format1-registeration-tag2">Received on:</div>
                    <div class="format1-time-div">${formatDateTime(report.receivedOn)}</div>
                </div>
                <div class="format1-registered-div2">
                    <div class="format1-registeration-tag2">Reported on:</div>
                    <div class="format1-time-div">${formatDateTime(report.reportedOn)}</div>
                </div>
            </div>
        </div>
        <div class="format1-rightcover"><span>${report.bookingId}</span></div>
        <div class="sign click qr-div">
            <img id="qrimg" src="" style="display:none;" loading="eager" decoding="sync">
            <div class="branding">
                <strong class="poweredby">Powered By</strong>
                <span class="occusoft">www.LabFlow</span>
            </div>
        </div>`;

        document.querySelector(".report-details").appendChild(patientdetails);

        qrTask = qrcodegenerator();
        qrTask.catch((error) => console.warn('QR generation deferred failed:', error));
    }

    async function barcodegenerator() {
        const booking = JSON.parse(localStorage.getItem('booking'));
        try {
            const response = await fetchWithTopLoaderControl(`/api/v1/user/generate-barcode?nonumber=${true}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    number: booking.acceptedbarcode[0] || booking.bookingId,
                    displayValue: false,
                    background: 'transparent'
                }),
            }, { silent: isBootPhase });
            if (response.ok) {
                const data = await response.json();
                const barcodeImg = document.getElementById("barcodeImage");
                barcodeImg.src = data.barcode;
                barcodeImg.style.background = 'transparent';
            } else {
                console.warn("Failed to generate barcode!");
            }
        } catch (error) {
            console.error("Error generating barcode:", error);
        }
    }

    function hasRenderableText(value) {
        return value !== null && value !== undefined && String(value).trim() !== "";
    }

    function createDeleteCell() {
        const deleteCell = document.createElement("td");
        deleteCell.className = "wrong";
        deleteCell.innerHTML = `<span class="delete-row-icon" title="Delete Row"><i class="fa-sharp fa-solid fa-xmark"></i></span>`;
        return deleteCell;
    }

    function createTestNameCell(testNameMarkup) {
        const fallbackCell = document.createElement("td");
        fallbackCell.className = "test-name";

        if (!hasRenderableText(testNameMarkup)) {
            return fallbackCell;
        }

        const template = document.createElement("template");
        template.innerHTML = String(testNameMarkup).trim();
        const parsedCell = template.content.querySelector("td");

        if (parsedCell) {
            return parsedCell.cloneNode(true);
        }

        const wrapper = document.createElement("div");
        wrapper.className = "test-name-cell";
        wrapper.textContent = template.content.textContent?.trim() || String(testNameMarkup).trim();
        fallbackCell.appendChild(wrapper);
        return fallbackCell;
    }

    function getTestNameCellMeta(testNameMarkup) {
        const cell = createTestNameCell(testNameMarkup);
        const text = cell.textContent?.replace(/\s+/g, " ").trim() || "";
        const isParameterRow = cell.id === "parameters"
            || Number.parseFloat(cell.style.paddingLeft || "0") > 0;

        return { cell, text, isParameterRow };
    }

    function createMethodInstrumentDetailsRow(methodInstrumentMeta) {
        if (!methodInstrumentMeta || methodInstrumentMeta.hideMethodInstrument) {
            return null;
        }

        const detailBlocks = [];
        if (methodInstrumentMeta.method) {
            detailBlocks.push(`<p class="methods">Method: ${methodInstrumentMeta.method}</p>`);
        }
        if (methodInstrumentMeta.instrument) {
            detailBlocks.push(`<p class="methods">Instrument: ${methodInstrumentMeta.instrument}</p>`);
        }

        if (!detailBlocks.length) {
            return null;
        }

        const detailsRow = document.createElement("tr");
        detailsRow.innerHTML = `
            <td class="wrong"></td>
            <td colspan="4" class="details-row"><div class="documented-content">${detailBlocks.join("")}</div></td>`;
        return detailsRow;
    }

    function hasLegacyMethodInstrumentDetails(tests, startIndex) {
        for (let index = startIndex + 1; index < tests.length; index++) {
            const nextTest = tests[index];

            if (nextTest?.details && /(Method:|Instrument:)/i.test(nextTest.details)) {
                return true;
            }

            if (!nextTest?.testName) {
                continue;
            }

            const nextMeta = getTestNameCellMeta(nextTest.testName);
            if (!nextMeta.isParameterRow) {
                return false;
            }
        }

        return false;
    }

    async function renderData(data) {
        const container = document.getElementById("tables-container");
        const fragment  = document.createDocumentFragment();
        container.innerHTML = "";
        const categories = Array.isArray(data?.CategoryAndTest) ? data.CategoryAndTest : [];
        const bookingTestMeta = await bookingTestMetaPromise;

        for (let index = 0; index < categories.length; index++) {
            const categoryData = categories[index];
            const section = document.createElement("div");
            section.className = "section";
            if (data.categorizedPDF && index > 0) section.classList.add("page-break");
            const categoryName = String(categoryData?.category || "").trim();
            const categoryTitle = String(categoryData?.title || "").trim();

            const headings = document.createElement("div");
            headings.classList.add("headings");

            const deleteH2Button = document.createElement("span");
            deleteH2Button.innerHTML = `<i class="fa-sharp fa-solid fa-xmark" title="Delete Entire category section"></i>`;
            deleteH2Button.className = "delete-btn wrong";

            const categoryHeading = document.createElement("h3");
            categoryHeading.classList.add("category-heading");
            categoryHeading.textContent = categoryName;
            categoryHeading.appendChild(deleteH2Button);
            headings.appendChild(categoryHeading);

            let titleHeading = null;
            if (categoryName !== categoryTitle) {
                const deleteH3Button = document.createElement("span");
                deleteH3Button.innerHTML = `<i class="fa-sharp fa-solid fa-xmark" title="Delete Panel"></i>`;
                deleteH3Button.className = "delete-btn";

                if (!categoryTitle.includes('Unknown Title')) {
                    titleHeading = document.createElement("h4");
                    titleHeading.classList.add("table-heading");
                    titleHeading.textContent = categoryTitle;
                    titleHeading.appendChild(deleteH3Button);
                    headings.appendChild(titleHeading);
                }

                deleteH3Button.addEventListener("click", () => {
                    titleHeading?.remove();
                    section.querySelector("table")?.remove();
                });
            }

            section.appendChild(headings);

            const table = document.createElement("table");
            table.className = "test-table";
            table.innerHTML = `
                <thead>
                    <tr>
                        <th class="deletion"></th>
                        <th width="300px">Test Name</th>
                        <th width="175px" class="valuecell">Value</th>
                        <th>Unit</th>
                        <th>Reference</th>
                    </tr>
                </thead>`;

            const tbody   = document.createElement("tbody");
            const tbodyFrag = document.createDocumentFragment();

            const tests = Array.isArray(categoryData.tests) ? categoryData.tests : [];

            for (let testIndex = 0; testIndex < tests.length; testIndex++) {
                const test = tests[testIndex];
                let testRow;

                if (test.testName) {
                    testRow = document.createElement("tr");
                    if (test.pagebreak) testRow.classList.add('page-break');
                    let appendedTestRow = false;

                    let isBold = Boolean(test.isBold || test.isAbnormal);
                    let testNameSuffix = "";
                    const refType = (test.referenceType || "").toLowerCase();

                    if (test.reference && refType !== "text") {
                        const parts = test.reference.split(" - ");
                        if (parts.length === 2) {
                            const lo = parseFloat(parts[0]), hi = parseFloat(parts[1]), v = parseFloat(test.value);
                            if (!isNaN(lo) && !isNaN(hi) && !isNaN(v)) {
                                if (v < lo) { isBold = true; testNameSuffix = "L"; }
                                else if (v > hi) { isBold = true; testNameSuffix = "H"; }
                            }
                        }
                    }

                    if (typeof test.value === "string" && test.value.toLowerCase().includes("positive")) {
                        isBold = true;
                    }
                    if (isBold) {
                        testRow.style.fontWeight = "bold";
                        testRow.classList.add('BoldRow', 'abnormal-result-row');
                    }

                    if (test.isDocumented) {
                        testRow.innerHTML = `
                        <td class="wrong"><span class="delete-row-icon" title="Delete Row"><i class="fa-sharp fa-solid fa-xmark"></i></span></td>
                        <td colspan="4" style="padding:0;border:none;"><div class="documented-content">${test.testName || ''}</div></td>`;
                    } else {
                        const testNameMeta = getTestNameCellMeta(test.testName);
                        const testNameCell = testNameMeta.cell;
                        const isMultiParameterHeading = Boolean(test.isMultiParameterHeading)
                            || (
                                hasRenderableText(test.testName)
                                && !hasRenderableText(test.value)
                                && !hasRenderableText(test.unit)
                                && !hasRenderableText(test.reference)
                            );
                        const isParameterRow = testNameMeta.isParameterRow;

                        if (isMultiParameterHeading) {
                            testRow.classList.add("multi-parameter-heading-row");
                            testNameCell.classList.add("multi-parameter-heading-cell");
                            (testNameCell.querySelector(".test-name-cell") || testNameCell)
                                .classList.add("multi-parameter-heading-text");
                        }

                        if (isParameterRow) {
                            testNameCell.classList.add("parameter-name-cell");
                        }

                        const valueCell = document.createElement("td");
                        valueCell.className = "high-low";
                        valueCell.innerHTML = `<div class="HL"><span class="high-low-marker">${testNameSuffix}</span></div><span class="result-value">${test.value || ''}</span>`;

                        const unitCell = document.createElement("td");
                        unitCell.textContent = test.unit || '';

                        const referenceCell = document.createElement("td");
                        referenceCell.textContent = test.reference || '';

                        testRow.appendChild(createDeleteCell());
                        testRow.appendChild(testNameCell);
                        testRow.appendChild(valueCell);
                        testRow.appendChild(unitCell);
                        testRow.appendChild(referenceCell);

                        const methodInstrumentMeta = bookingTestMeta.get(
                            buildMethodInstrumentLookupKey(
                                categoryData.category,
                                categoryData.title,
                                testNameMeta.text
                            )
                        );
                        const shouldRenderMethodInstrumentFallback = !isParameterRow
                            && !hasLegacyMethodInstrumentDetails(tests, testIndex);
                        const methodInstrumentRow = shouldRenderMethodInstrumentFallback
                            ? createMethodInstrumentDetailsRow(methodInstrumentMeta)
                            : null;

                        if (methodInstrumentRow) {
                            tbodyFrag.appendChild(testRow);
                            tbodyFrag.appendChild(methodInstrumentRow);
                            appendedTestRow = true;
                        } else {
                            tbodyFrag.appendChild(testRow);
                            appendedTestRow = true;
                        }
                    }
                    if (testRow && !appendedTestRow) {
                        tbodyFrag.appendChild(testRow);
                    }
                }

                if (test.remark) {
                    const remarkRow = document.createElement("tr");
                    remarkRow.innerHTML = `
                    <td class="wrong"></td>
                    <td colspan="4" class="remark-row"><div>Remark:</div> <span>${test.remark}</span></td>`;
                    tbodyFrag.appendChild(remarkRow);
                }

                if (test.details) {
                    const detailsRow = document.createElement("tr");
                    detailsRow.innerHTML = `
                    <td class="wrong"></td>
                    <td colspan="4" class="details-row"><div class="documented-content">${test.details}</div></td>`;
                    tbodyFrag.appendChild(detailsRow);
                }

                const deleteIcon = testRow?.querySelector(".delete-row-icon");
                if (deleteIcon) {
                    deleteIcon.addEventListener("click", () => {
                        const currentRow = deleteIcon.closest("tr");
                        let next = currentRow.nextElementSibling;
                        if (next?.querySelector(".remark-row")) { next.remove(); next = currentRow.nextElementSibling; }
                        if (next?.querySelector(".details-row")) next.remove();
                        currentRow.remove();
                    });
                }
            }

            tbody.appendChild(tbodyFrag);

            ['advice', 'notes', 'remarks'].forEach(key => {
                if (categoryData[key]) {
                    const row  = document.createElement("tr");
                    const cell = document.createElement("td");
                    cell.colSpan = 4;
                    cell.className = key;
                    cell.innerHTML = `<div>${key.charAt(0).toUpperCase() + key.slice(1)}:</div> <span>${categoryData[key]}</span>`;
                    row.appendChild(cell);
                    tbody.appendChild(row);
                }
            });

            table.appendChild(tbody);

            if (categoryData.interpretation) {
                const row  = document.createElement("tr");
                const cell = document.createElement("td");
                cell.colSpan = 4;
                cell.innerHTML = `<div class="interpretation"><p style="font-weight:bold;">Interpretation</p>${categoryData.interpretation}</div>`;
                row.appendChild(cell);
                table.appendChild(row);
            }

            section.appendChild(table);
            deleteH2Button.addEventListener("click", () => section.remove());
            fragment.appendChild(section);

            if ((index + 1) % 2 === 0) {
                container.appendChild(fragment);
                await new Promise((resolve) => requestAnimationFrame(resolve));
            }
        }

        if (fragment.childNodes.length > 0) {
            container.appendChild(fragment);
        }

        if (data.MoreDetails) {
            const more = document.createElement("div");
            more.className = "moreDetails";
            more.innerHTML = `<span>Additional Findings :-</span><br><div>${data.MoreDetails}</div>`;
            container.appendChild(more);
        }
    }

    async function fetchTemplateImages() {
        try {
            const response = await fetchWithTopLoaderControl(`/api/v1/user/templates`, { method: "POST" }, { silent: isBootPhase });
            const data = await response.json();
            if (data.urls && Array.isArray(data.urls)) return data.urls[0].template;
        } catch (error) { console.error('Error fetching template images:', error); }
    }

    function countLines() {
        return document.querySelector(".report-details").offsetHeight;
    }

    async function signoffdivfunction() {
        const signButton = document.getElementById("signOff");
        if (!signButton) return;

        const isLayerOne = user?.tenantId?.modelType === "1layer";
        let isSignedOff = Boolean(report.signOff);

        const syncSignoffUi = (signed) => {
            document.querySelectorAll(".click").forEach((btn) => {
                btn.classList.toggle("sign", !signed);
            });
        };

        const persistSignoff = async (signoff) => {
            const updateData = await collectPdfPayload({ bookingId: report.bookingId, isdocumented: report.isdocumented });

            try {
                const data =
                    doctorsSignCache ||
                    await doctorsSignTask ||
                    await fetchWithTopLoaderControl(`${BASE_URL}/api/v1/user/getDoctorsSign`, {}, { silent: isBootPhase }).then(r => r.json());
                doctorsSignCache = data;
                if (signoff) {
                    Object.assign(updateData, {
                        showlab:                  data.showlabinchargesign,
                        showdoctorfirst:          data.showfirstdoctorsign,
                        showdoctorsecond:         data.showseconddoctorsign,
                        fileInputLab:             data.labinchargesign,
                        fileInputDoctorleft:      data.firstdoctorsign,
                        fileInputDoctorright:     data.seconddoctorsign,
                        fileInputLabtext:         data.labinchargeinfo,
                        fileInputDoctorlefttext:  data.firstdoctorsigninfo,
                        fileInputDoctorrighttext: data.seconddoctorsigninfo,
                    });
                }
            } catch (error) {
                console.log(error.message);
            }

            await Promise.all([
                fetchWithTopLoaderControl(`/api/v1/user/editReportsignofffield`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value1, signoff }),
                }, { silent: isBootPhase }),
                fetchWithTopLoaderControl(`/api/v1/user/adding-pdf-data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updateData),
                }, { silent: isBootPhase })
            ]);

            isSignedOff = signoff;
            report.signOff = signoff;
            await updatebookingisreportreadyfield(report.bookingId);
            if (!isBootPhase) {
                setTimeout(() => { prewarmPdfInBackground(); }, 0);
            }
        };

        if (isLayerOne) {
            const signWrap = signButton.closest(".downloadDiv");
            if (signWrap) signWrap.style.display = "none";

            syncSignoffUi(true);

            if (!isSignedOff) {
                return persistSignoff(true).catch((error) => {
                    console.error("Error applying default signoff for layer-1:", error);
                });
            }
            return;
        }

        syncSignoffUi(isSignedOff);

        signButton.addEventListener("click", async function (e) {
            const button = e.currentTarget;
            setButtonBusy(button, true, 'Saving...');
            setActionFeedback('Sign status update ho raha hai...', 'info', { autoHideMs: 0 });

            const prevSignedOff = isSignedOff;
            const nextSignoff = !prevSignedOff;

            try {
                await persistSignoff(nextSignoff);
                syncSignoffUi(nextSignoff);
                setActionFeedback(nextSignoff ? 'Report sign off ho gayi.' : 'Report sign off hata di gayi.', 'success');
            } catch (error) {
                syncSignoffUi(prevSignedOff);
                console.error('Error:', error);
                setActionFeedback('Sign off update nahi ho paaya. Please try again.', 'error');
            } finally {
                setButtonBusy(button, false);
            }
        });
    }

    async function updatebookingisreportreadyfield(bookingid) {
        try {
            const response = await fetchWithTopLoaderControl(`/api/v1/user/CompleteBookingcontroller`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookingid }),
            }, { silent: isBootPhase });
            if (!response.ok) console.log("status not updated");
        } catch (error) { console.log(error); }
    }

    // ─── DOWNLOAD PDF ─────────────────────────────────────────────────────────
    // ✅ FIX 2: collectPdfPayload() se resolvedBackgroundImageUrl aata hai
    // Pehle: closure ka backgroundImageUrl alag se pass ho raha tha — conflict tha
    // Ab: collectPdfPayload() ka payload directly use karo, koi extra override mat karo
    // Isse download mein background sahi se include hogi (jab available ho)
    async function downloadpdffunction({
        labinchargesign = null, labinchargeinfo = "",
        headermargin, footermargin, marginRight, marginLeft,
        labinchargesignurl = null, selectedFontSize, RowSpacing,
        HighLow, HLinred, BoldRow, showInvest, DownloadPdf = true
    } = {}) {
        document.getElementById('downloadPDF').addEventListener('click', async (e) => {
            const button = e.currentTarget;
            setButtonBusy(button, true, 'Downloading...');
            setActionFeedback('PDF download prepare ho rahi hai...', 'info', { autoHideMs: 0 });

            try {
                const latestPayload = await collectPdfPayload({}, { withBackground: false });

                const response = await fetch(`/api/v1/user/get-pdf`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...latestPayload,
                        value1,
                        labinchargesign,
                        // ✅ backgroundImageUrl yahan deliberately omit — latestPayload mein already hai
                        headermargin, footermargin, marginRight, marginLeft,
                        selectedFontSize, RowSpacing, HighLow, HLinred,
                        BoldRow, showInvest, DownloadPdf,
                        isReportFormat: true
                    }),
                });
                if (!response.ok) throw new Error('PDF generation failed');

                const pdfBlob = await response.blob();

                const safeName = (report.patientName || 'Patient')
                    .replace(/[^a-zA-Z0-9\u0900-\u097F\s]/g, '').trim().replace(/\s+/g, '_');
                const safeId = (report.bookingId || '').replace(/[^a-zA-Z0-9]/g, '');
                const link = document.createElement('a');
                link.href = window.URL.createObjectURL(pdfBlob);
                link.download = `${safeName}-${safeId}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                const trackedDownloadAction = await trackSuccessfulAction('downloadPdf');
                await updatebookingisreportreadyfield(report.bookingId);
                setActionFeedback(
                    trackedDownloadAction?.queued
                        ? 'PDF download ho gayi. Count locally save ho gaya, backend sync automatic hoga.'
                        : 'PDF download ho gayi aur count update ho gaya.',
                    trackedDownloadAction?.queued ? 'info' : 'success'
                );
            } catch (error) {
                console.error('Error generating PDF:', error);
                setActionFeedback('PDF download nahi ho paayi. Please try again.', 'error');
            } finally {
                setButtonBusy(button, false);
            }
        });
    }

    // ─── Browser Print ────────────────────────────────────────────────────────
    document.getElementById('BrowserPrint').addEventListener('click', async function (e) {
        const button = e.currentTarget;
        setButtonBusy(button, true, 'Opening...');
        setActionFeedback('Print preview open ho raha hai...', 'info', { autoHideMs: 0 });
        try {
            const printArea  = document.getElementById('container').innerHTML;
            const cssContent = document.getElementById('stying').innerHTML;
            const printWindow = window.open('', '_blank');
            if (!printWindow) throw new Error('Popup blocked');
            printWindow.document.open();
            printWindow.document.write(`<html><head><title>Print Report</title>
                <style>${cssContent} body{font-family:Arial,sans-serif;margin:20px;}</style></head>
                <body onload="window.print();window.close();">${printArea}</body></html>`);
            printWindow.document.close();
            const trackedPrintAction = await trackSuccessfulAction('printDialog');
            setActionFeedback(
                trackedPrintAction?.queued
                    ? 'Print preview open ho gaya. Count locally save ho gaya, backend sync automatic hoga.'
                    : 'Print preview open ho gaya aur count update ho gaya.',
                trackedPrintAction?.queued ? 'info' : 'success'
            );
        } catch (error) {
            console.error('Error opening print preview:', error);
            setActionFeedback('Print preview open nahi ho paaya. Please try again.', 'error');
        } finally {
            setButtonBusy(button, false);
        }
    });

    function hidecontent() {
        if (user?.showprintsetting === false) {
            document.getElementById('printsettingbutton').style.display = "none";
        }
        if (user?.tenantId?.modelType === "1layer") {
            const style = document.getElementById("stying");
            style.textContent += `
            .format1-rightcover{height:75px;}
            #qrimg{width:83px;height:73px;}
            .click.qr-div{right:42px;top:5px;}
            @media print{
                .format1-rightcover{height:50px !important;}
                .format1-registered-div2{font-size:11px !important;}
                .format1-rightcover{left:62.1%;}
                .report-details-innerDiv2{min-height:70px !important;}
                #qrimg{width:55px !important;height:45px !important;}
            }`;
            document.querySelectorAll('.forhide').forEach(elem => { elem.style.display = "none"; });
        }
    }
    } catch (error) {
        markPageFailed(error);
    }
})();
