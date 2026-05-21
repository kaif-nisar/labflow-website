(async function () {
    const bootStartedAt = Date.now();
    const MIN_SKELETON_VISIBLE_MS = 150;
    const bootLoaderEl = document.getElementById('pageBootLoader');
    const bootShellEl = bootLoaderEl?.querySelector('.page-boot-shell');
    const pageRootEl = document.getElementById('reportFormat1Root') || document.body;
    const reportContainerEl = document.getElementById('container');
    const signOffEl = document.querySelector('.signed-off-div');
    const actionBarEl = document.querySelector('.download-pdf-div');

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

    // Force skeleton visible first, then reveal page after render completion.
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
    // ─── 1. URL PARAMS ───────────────────────────────────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    let value1 = urlParams.get('value1');

    // ─── 2. PARALLEL INITIAL FETCHES ─────────────────────────────────────────
    const report = await fetchreport();

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
    let prefetchedViewBlobUrl = null;
    let prefetchedPayloadKey = "";
    let doctorsSignCache = null;
    let renderTask = Promise.resolve();
    let qrTask = Promise.resolve();
    let barcodeTask = Promise.resolve();

    // ─── 3. Header + Doctor Signs parallel ───────────────────────────────────
    // populateHeader ke andar qrcodegenerator() call hota hai
    const doctorsSignTask = fetchdoctorsandlabsign();
    await populateHeader();

    barcodeTask = barcodegenerator();
    renderTask = renderData(report);
    syncBootLoaderLayout();
    signoffdivfunction();
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
            const response = await fetch(`${BASE_URL}/api/v1/user/getDoctorsSign`);
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

    // ─── QR Code Generator ───────────────────────────────────────────────────
    // QR API se base64 PNG ya URL aata hai.
    // Dono cases mein ensure karo ki img.src = "data:image/..." ho
    // kyunki PDF renderer (puppeteer/headless) external URLs fetch nahi kar pata.
    async function qrcodegenerator() {
        try {
            const response = await fetch(`/api/v1/user/generate-qr`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ link: urlWithParam }),
            });
            if (!response.ok) throw new Error('Failed to generate QR code.');
            const data = await response.json();
            const qrCodeImage = document.getElementById('qrimg');
            if (!qrCodeImage) { console.error('qrimg element not found'); return; }
            const qrSource = data?.qrCode || data?.qrcode || data?.qr || data?.image || data?.url;
            if (!qrSource) throw new Error('QR source missing in API response');

            if (qrSource.startsWith('data:')) {
                // Already base64 — seedha set karo
                qrCodeImage.src = qrSource;
            } else if (qrSource) {
                // URL hai — fetch karke base64 mein convert karo
                try {
                    qrCodeImage.src = await urlToBase64(qrSource);
                } catch {
                    qrCodeImage.src = qrSource; // fallback
                }
            }
            qrCodeImage.style.display = 'block';
            qrCodeImage.loading = 'eager';
            console.log('QR set, src prefix:', qrCodeImage.src.substring(0, 30));
        } catch (error) {
            console.error('QR Error:', error);
        }
    }

    // ─── Shared base64 helper ────────────────────────────────────────────────
async function urlToBase64(url) {
    // Relative URL (jaise /images/qr.png) ko Absolute URL (http://domain.com/images/qr.png) mein badle
    const absoluteUrl = new URL(url, window.location.origin).href;
    const target = new URL(absoluteUrl);
    const isSameOrigin = target.origin === window.location.origin;

    const res  = await fetch(absoluteUrl, {
        credentials: isSameOrigin ? 'include' : 'omit',
        mode: 'cors',
        cache: 'no-store'
    });
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

    // ─── ensureImagesBase64 ──────────────────────────────────────────────────
    // ✅ KEY FIX: #qrimg ko bhi include karo
    // QR src DOM mein base64 hai, lekin har savePdfData() call ke pehle fresh ensure karo
    // taaki header outerHTML mein QR ka data:image src ho — PDF renderer isko embed kar sake
async function ensureImagesBase64(selectors = ['#qrimg', '#barcodeImage', '.signed-off-div2 img']) {
    if (!Array.isArray(selectors) || !selectors.length) return;
    await Promise.all(selectors.map(async (sel) => {
        const imgs = document.querySelectorAll(sel);
        await Promise.all(Array.from(imgs).map(async img => {
            // Already base64 hai — skip 
            if (!img.src || img.src.startsWith('data:') || img.src === '') return;
            
            try { 
                // Convert to base64
                img.src = await urlToBase64(img.src); 
            } catch (e) { 
                console.warn(`base64 convert failed for ${sel}:`, e);
                // MAIN FIX: Agar fail ho, toh URL ko absolute bana dein taaki backend PDF engine access kar sake
                img.src = new URL(img.src, window.location.origin).href;
            }
        }));
    }));
}

    async function ensureCriticalCodeAssetsReady() {
        const qrCodeImage = document.getElementById('qrimg');
        const barcodeImage = document.getElementById('barcodeImage');

        // Fast exit: backend already returns base64 data URLs.
        const hasQrData = !!(qrCodeImage?.src && qrCodeImage.src.startsWith('data:image'));
        const hasBarcodeData = !!(barcodeImage?.src && barcodeImage.src.startsWith('data:image'));
        if (hasQrData && hasBarcodeData) return;

        await Promise.allSettled([qrTask, barcodeTask]);
        const retryTasks = [];

        // Retry once if code images are still missing (fast PDF click race-condition).
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

        // Keep this ultra-light for PDF speed: only wait briefly for code images.
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
    async function collectPdfPayload(extras = {}, options = {}) {
        const { skipImagePrep = false } = options;
        await renderTask;
        await ensureCriticalCodeAssetsReady();
        // Image prep is expensive (CORS + timeout waits). Keep it optional for fast view/prewarm path.
        if (!skipImagePrep) {
            await ensureImagesBase64();
            await waitForCriticalImages();
        } else {
            // Even in fast path, embed signature images so they don't disappear in PDF footer.
            await ensureImagesBase64(['.signed-off-div2 img']);
        }
        const resolvedBackgroundImageUrl =
            backgroundImageUrl ?? await templateImagePromise.catch(() => null);
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

    function toViewPdfNoBackgroundPayload(payload) {
        return {
            ...payload,
            backgroundImageUrl: null,
            checkBox: true,
            disableBackgroundImage: true
        };
    }

    function setPrefetchedViewBlob(blob, payloadKey) {
        if (prefetchedViewBlobUrl) URL.revokeObjectURL(prefetchedViewBlobUrl);
        prefetchedViewBlobUrl = URL.createObjectURL(blob);
        prefetchedPayloadKey = payloadKey;
    }

    async function fetchServerPdfBlob(latestPayload) {
        const response = await fetch(`/api/v1/user/get-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...latestPayload, value1, DownloadPdf: false }),
        });
        if (!response.ok) throw new Error('PDF generation failed');
        return response.blob();
    }

    async function prewarmPdfInBackground() {
        if (prewarmInFlight) return;
        prewarmInFlight = true;
        try {
            const latestPayload = await collectPdfPayload({}, { skipImagePrep: true });
            const viewPayload = toViewPdfNoBackgroundPayload(latestPayload);
            const payloadKey = buildViewPayloadKey(viewPayload);
            if (prefetchedViewBlobUrl && payloadKey === prefetchedPayloadKey) return;
            const blob = await fetchServerPdfBlob(viewPayload);
            setPrefetchedViewBlob(blob, payloadKey);
        } catch (error) {
            console.warn('PDF prewarm failed:', error);
        } finally {
            prewarmInFlight = false;
        }
    }

    // ─── PDF setting button ──────────────────────────────────────────────────
    document.getElementById('PDFsettinganchr').addEventListener('click', async (event) => {
        event.preventDefault();
        try {
            await savePdfData();
            window.location.href = document.getElementById('PDFsettinganchr').href;
        } catch (error) {
            console.error('Error generating PDF:', error);
        }
    });

    // ─── VIEW PDF ────────────────────────────────────────────────────────────
    // window.open() PEHLE (sync, user gesture mein) — popup blocker bypass
    // Blank tab mein spinner → PDF ready hone par location.href set
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
        const loader = e.target.closest(".downloadDiv").querySelector("#loadingOverlay");
        if (loader) loader.style.display = 'flex';
        e.target.disabled = true;

        const newTab = window.open('', '_blank');
        if (!newTab) {
            alert('Popup blocked! Please allow popups for this site and try again.');
            if (loader) loader.style.display = 'none';
            e.target.disabled = false;
            return;
        }

        // Loading spinner naye tab mein
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

        try {
            if (prefetchedViewBlobUrl) {
                newTab.location.href = prefetchedViewBlobUrl;
                return;
            }

            const latestPayload = await collectPdfPayload({}, { skipImagePrep: true });
            const viewPayload = toViewPdfNoBackgroundPayload(latestPayload);
            const payloadKey = buildViewPayloadKey(viewPayload);
            const pdfBlob = await fetchServerPdfBlob(viewPayload);
            setPrefetchedViewBlob(pdfBlob, payloadKey);
            newTab.location.href = prefetchedViewBlobUrl;
        } catch (error) {
            console.error('Error viewing PDF:', error);
            newTab.document.open();
            newTab.document.write(`<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Arial;font-size:17px;color:red;">
                ❌ PDF generation failed. Please close this tab and try again.</body></html>`);
            newTab.document.close();
        } finally {
            if (loader) loader.style.display = 'none';
            e.target.disabled = false;
        }
    });

    // ─── Send Report ─────────────────────────────────────────────────────────
    window.addEventListener('beforeunload', () => {
        if (prefetchedViewBlobUrl) URL.revokeObjectURL(prefetchedViewBlobUrl);
        prefetchedViewBlobUrl = null;
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

        sendReportButton.addEventListener('click', async (e) => {
            const loader = e.target.closest(".downloadDiv").querySelector("#loadingOverlay");
            if (!loader) { console.error("Loading overlay not found"); return; }
            loader.style.display = 'flex';
            e.target.disabled = true;
            try {
                const latestPayload = await collectPdfPayload();
                const pdfResponse = await fetch(`/api/v1/user/get-pdf`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...latestPayload, value1 }),
                });
                if (!pdfResponse.ok) throw new Error('PDF generation failed');
                if (popupModal.style.display === 'block') return;
                popupModal.style.display = 'block';
                const pdfBlob = await pdfResponse.blob();
                iframe.src = URL.createObjectURL(pdfBlob);
            } catch (error) {
                alert('Error generating PDF. Please try again.');
                popupModal.style.display = 'none';
            } finally {
                loader.style.display = 'none';
                e.target.disabled = false;
            }
        });

        closeButton.addEventListener('click', () => { popupModal.style.display = 'none'; });
        window.addEventListener('click', (event) => {
            if (event.target === popupModal) popupModal.style.display = 'none';
        });

        const setupInputField = (placeholderText, actionCallback) => {
            inputField.style.display = 'flex';
            contactInput.value = '';
            contactInput.placeholder = placeholderText;
            sendButton.onclick = () => {
                const contact = contactInput.value.trim();
                if (!contact) return alert('Please enter a valid input!');
                actionCallback(contact, iframe.src);
            };
        };

        document.getElementById('smsButton').addEventListener('click',
            () => setupInputField('Enter Phone Number for SMS', sendSMS));
        document.getElementById('whatsappButton').addEventListener('click',
            () => setupInputField('Enter WhatsApp Number', sendWhatsApp));
        document.getElementById('emailButton').addEventListener('click',
            () => setupInputField('Enter Email Address', sendEmail));
        document.getElementById('openPdfButton').addEventListener('click',
            () => window.open(iframe.src, '_blank'));
    }

    async function sendSMS(phoneNumber, pdfUrl) {
        const response = await fetch(pdfUrl);
        const blob = await response.blob();
        const pdfFile = new File([blob], "report2.pdf", { type: "application/pdf" });
        const formData = new FormData();
        formData.append('pdf', pdfFile);
        formData.append('phoneNumber', phoneNumber);
        formData.append('message', 'This is your test report from LabFlow. Thank you for using our services!');
        try {
            const res = await fetch(`/api/v1/user/send-sms`, { method: 'POST', body: formData });
            alert(res.ok ? 'SMS sent successfully!' : 'Failed to send SMS. Please try again.');
        } catch { alert('An error occurred while sending the SMS.'); }
    }

    async function sendWhatsApp(whatsappNumber) {
        if (!whatsappNumber || !/^\d+$/.test(whatsappNumber)) {
            return alert("Please enter a valid WhatsApp number without spaces or special characters.");
        }
        window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
            `Your Lab test report from LabFlow Click on the link below to download the report\n ${urlWithParam}`
        )}`, "_blank");
    }

    async function sendEmail(email) {
        try {
            const res = await fetch(`/api/v1/user/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    subject: 'Your Test Report from LabFlow',
                    body: 'This is your test report from LabFlow. Thank you for using our services!',
                    urlWithParam
                }),
            });
            alert(res.ok ? 'Email sent successfully!' : 'Failed to send Email. Please try again.');
        } catch { alert('An error occurred while sending the Email.'); }
    }

    // ─── fetchreport ─────────────────────────────────────────────────────────
    async function fetchreport() {
        try {
            const response = await fetch(`/api/v1/user/ReportData`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ value1 })
            });
            if (!response.ok) throw new Error("something went wrong");
            return await response.json();
        } catch (error) { console.log(error); }
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

    // ─── populateHeader ──────────────────────────────────────────────────────
    async function populateHeader() {
        document.getElementById("booking-registeration-number").innerText = report.reg_id;

        const patientdetails = document.createElement("div");
        patientdetails.classList.add("report-details-innerDiv2");
        patientdetails.innerHTML = `
        <div class="format1left2">
            <div class="format1-infor-div fixedheightdiv">
                <div class="format1-tags">Patient Name:</div>
                <!-- Patient name bold + bada — PDF mein highlight hoga -->
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
                        <!-- transparent background — barcode ke niche number nahi aayega (nonumber=true) -->
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
            <!-- blank src — qrcodegenerator() base64 set karega -->
            <img id="qrimg" src="" style="display:none;" loading="eager" decoding="sync">
            <div class="branding">
                <strong class="poweredby">Powered By</strong>
                <span class="occusoft">www.LabFlow</span>
            </div>
        </div>`;

        document.querySelector(".report-details").appendChild(patientdetails);

        // QR async run karein taaki first paint block na ho.
        qrTask = qrcodegenerator();
        qrTask.catch((error) => console.warn('QR generation deferred failed:', error));
    }

    // ─── barcodegenerator ────────────────────────────────────────────────────
    async function barcodegenerator() {
        const booking = JSON.parse(localStorage.getItem('booking'));
        try {
            const response = await fetch(`/api/v1/user/generate-barcode?nonumber=${true}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    number: booking.acceptedbarcode[0] || booking.bookingId,
                    displayValue: false,
                    background: 'transparent'
                }),
            });
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

    // ─── renderData ──────────────────────────────────────────────────────────
    async function renderData(data) {
        const container = document.getElementById("tables-container");
        const fragment  = document.createDocumentFragment();
        container.innerHTML = "";
        const categories = Array.isArray(data?.CategoryAndTest) ? data.CategoryAndTest : [];

        for (let index = 0; index < categories.length; index++) {
            const categoryData = categories[index];
            const section = document.createElement("div");
            section.className = "section";
            if (data.categorizedPDF && index > 0) section.classList.add("page-break");

            const headings = document.createElement("div");
            headings.classList.add("headings");

            const deleteH2Button = document.createElement("span");
            deleteH2Button.innerHTML = `<i class="fa-sharp fa-solid fa-xmark" title="Delete Entire category section"></i>`;
            deleteH2Button.className = "delete-btn wrong";

            const categoryHeading = document.createElement("h3");
            categoryHeading.textContent = categoryData.category;
            categoryHeading.appendChild(deleteH2Button);
            headings.appendChild(categoryHeading);

            let titleHeading = null;
            if (categoryData.category !== categoryData.title) {
                const deleteH3Button = document.createElement("span");
                deleteH3Button.innerHTML = `<i class="fa-sharp fa-solid fa-xmark" title="Delete Panel"></i>`;
                deleteH3Button.className = "delete-btn";

                if (!categoryData.title.includes('Unknown Title')) {
                    titleHeading = document.createElement("h4");
                    titleHeading.textContent = categoryData.title;
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
                        <th>Test Name</th>
                        <th class="valuecell">Value</th>
                        <th>Unit</th>
                        <th>Reference</th>
                    </tr>
                </thead>`;

            const tbody   = document.createElement("tbody");
            const tbodyFrag = document.createDocumentFragment();

            categoryData.tests.forEach((test) => {
                let testRow;

                if (test.testName) {
                    testRow = document.createElement("tr");
                    if (test.pagebreak) testRow.classList.add('page-break');

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
                    if (isBold) { testRow.style.fontWeight = "bold"; testRow.classList.add('BoldRow'); }

                    if (test.isDocumented) {
                        testRow.innerHTML = `
                        <td class="wrong"><span class="delete-row-icon" title="Delete Row"><i class="fa-sharp fa-solid fa-xmark"></i></span></td>
                        <td colspan="4" style="padding:0;border:none;"><div class="documented-content">${test.testName || ''}</div></td>`;
                    } else {
                        testRow.innerHTML = `
                        <td class="wrong"><span class="delete-row-icon" title="Delete Row"><i class="fa-sharp fa-solid fa-xmark"></i></span></td>
                        ${test.testName || ''}
                        <td class="high-low"><div class="HL"><span>${testNameSuffix}</span></div><span>${test.value || ''}</span></td>
                        <td>${test.unit || ''}</td>
                        <td>${test.reference || ''}</td>`;
                    }
                    tbodyFrag.appendChild(testRow);
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
            });

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

            // Render in chunks to keep main thread responsive on large reports.
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

    // ─── fetchTemplateImages ──────────────────────────────────────────────────
    async function fetchTemplateImages() {
        try {
            const response = await fetch(`/api/v1/user/templates`, { method: "POST" });
            const data = await response.json();
            if (data.urls && Array.isArray(data.urls)) return data.urls[0].template;
        } catch (error) { console.error('Error fetching template images:', error); }
    }

    function countLines() {
        return document.querySelector(".report-details").offsetHeight;
    }

    // ─── signoffdivfunction ───────────────────────────────────────────────────
    async function signoffdivfunction() {
        const signButton = document.getElementById("signOff");
        if (!signButton) return;

        const isLayerOne = user?.tenantId?.modelType === "1layer";
        let isSignedOff = Boolean(report.signOff);

        const syncSignoffUi = (signed) => {
            document.querySelectorAll(".click").forEach((btn) => {
                btn.classList.toggle("sign", !signed);
            });
            // Keep signatures visible irrespective of sign-off toggle; only buttons are gated.
        };

        const persistSignoff = async (signoff) => {
            const updateData = await collectPdfPayload({ bookingId: report.bookingId, isdocumented: report.isdocumented });

            try {
                const data = doctorsSignCache || await fetch(`${BASE_URL}/api/v1/user/getDoctorsSign`).then(r => r.json());
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
                fetch(`/api/v1/user/editReportsignofffield`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value1, signoff }),
                }),
                fetch(`/api/v1/user/adding-pdf-data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updateData),
                })
            ]);

            isSignedOff = signoff;
            report.signOff = signoff;
            await updatebookingisreportreadyfield(report.bookingId);
            setTimeout(() => { prewarmPdfInBackground(); }, 0);
        };

        if (isLayerOne) {
            const signWrap = signButton.closest(".downloadDiv");
            if (signWrap) signWrap.style.display = "none";

            // Layer-1: sign button logic is applied on load; no manual toggle.
            syncSignoffUi(true);

            // Keep DB signOff aligned with layer-1 behavior.
            if (!isSignedOff) {
                persistSignoff(true).catch((error) => {
                    console.error("Error applying default signoff for layer-1:", error);
                });
            }
            return;
        }

        // Non-layer-1 (including 4-layer): UI follows signOff field, toggled via Sign button.
        syncSignoffUi(isSignedOff);

        signButton.addEventListener("click", async function (e) {
            const loader = e.target.closest(".downloadDiv").querySelector("#loadingOverlay");
            if (!loader) return;
            loader.style.display = 'flex';
            e.target.disabled = true;

            const prevSignedOff = isSignedOff;
            const nextSignoff = !prevSignedOff;

            try {
                await persistSignoff(nextSignoff);
                syncSignoffUi(nextSignoff);
            } catch (error) {
                syncSignoffUi(prevSignedOff);
                console.error('Error:', error);
            } finally {
                loader.style.display = 'none';
                e.target.disabled = false;
            }
        });
    }

    async function updatebookingisreportreadyfield(bookingid) {
        try {
            const response = await fetch(`/api/v1/user/CompleteBookingcontroller`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookingid }),
            });
            if (!response.ok) console.log("status not updated");
        } catch (error) { console.log(error); }
    }

    // ─── DOWNLOAD PDF — name = patientName-bookingId ─────────────────────────
    async function downloadpdffunction({
        labinchargesign = null, checkBox = false, labinchargeinfo = "",
        headermargin, footermargin, marginRight, marginLeft,
        labinchargesignurl = null, selectedFontSize, RowSpacing,
        HighLow, HLinred, BoldRow, showInvest, DownloadPdf = true
    } = {}) {
        document.getElementById('downloadPDF').addEventListener('click', async (e) => {
            const loader = e.target.closest(".downloadDiv").querySelector("#loadingOverlay");
            if (!loader) return;
            loader.style.display = 'flex';
            e.target.disabled = true;

            try {
                const latestPayload = await collectPdfPayload();
                const response = await fetch(`/api/v1/user/get-pdf`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...latestPayload,
                        value1, labinchargesign, checkBox, backgroundImageUrl,
                        headermargin, footermargin, marginRight, marginLeft,
                        selectedFontSize, RowSpacing, HighLow, HLinred,
                        BoldRow, showInvest, DownloadPdf
                    }),
                });
                if (!response.ok) throw new Error('PDF generation failed');

                const pdfBlob = await response.blob();

                // PDF name = patientName-bookingId  e.g. "Naina-OH8897876.pdf"
                const safeName = (report.patientName || 'Patient')
                    .replace(/[^a-zA-Z0-9\u0900-\u097F\s]/g, '').trim().replace(/\s+/g, '_');
                const safeId = (report.bookingId || '').replace(/[^a-zA-Z0-9]/g, '');
                const link = document.createElement('a');
                link.href = window.URL.createObjectURL(pdfBlob);
                link.download = `${safeName}-${safeId}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                await updatebookingisreportreadyfield(report.bookingId);
            } catch (error) {
                console.error('Error generating PDF:', error);
            } finally {
                loader.style.display = 'none';
                e.target.disabled = false;
            }
        });
    }

    // ─── Browser Print ────────────────────────────────────────────────────────
    document.getElementById('BrowserPrint').addEventListener('click', function () {
        const printArea  = document.getElementById('container').innerHTML;
        const cssContent = document.getElementById('stying').innerHTML;
        const printWindow = window.open('', '_blank');
        printWindow.document.open();
        printWindow.document.write(`<html><head><title>Print Report</title>
            <style>${cssContent} body{font-family:Arial,sans-serif;margin:20px;}</style></head>
            <body onload="window.print();window.close();">${printArea}</body></html>`);
        printWindow.document.close();
    });

    // ─── hidecontent ─────────────────────────────────────────────────────────
    function hidecontent() {
        if (user.showprintsetting === false) {
            document.getElementById('printsettingbutton').style.display = "none";
        }
        if (user.tenantId.modelType === "1layer") {
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

