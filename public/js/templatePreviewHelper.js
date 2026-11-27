/**
 * Shared Browser Helper for PDF & Image Letterhead Template Previews.
 * Uses local /vendor/pdfjs (offline-ready, CSP-safe) to render Page 1 of a PDF
 * template into a crisp PNG data URL for Live Canvas, thumbnails, and Report Format 5.
 */
(function (global) {
    "use strict";

    if (global.TemplatePreviewHelper) {
        return;
    }

    const previewCache = new Map();
    const inFlightMap = new Map();
    let pdfJsLoadPromise = null;

    const PDF_PLACEHOLDER_SVG =
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160">' +
            '<rect width="120" height="160" rx="8" fill="#fef2f2" stroke="#fecaca" stroke-width="2"/>' +
            '<path d="M74 16H32a8 8 0 0 0-8 8v112a8 8 0 0 0 8 8h56a8 8 0 0 0 8-8V38L74 16z" fill="#ffffff" stroke="#ef4444" stroke-width="2.5"/>' +
            '<path d="M74 16v22h22" fill="#fee2e2" stroke="#ef4444" stroke-width="2.5" stroke-linejoin="round"/>' +
            '<rect x="34" y="76" width="52" height="24" rx="5" fill="#dc2626"/>' +
            '<text x="60" y="93" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#ffffff">PDF</text>' +
            '<line x1="36" y1="114" x2="84" y2="114" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"/>' +
            '<line x1="36" y1="124" x2="72" y2="124" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"/>' +
            "</svg>"
        );

    function getOrigin() {
        return (global.location && global.location.origin) || "";
    }

    function isPdfUrl(url) {
        if (!url || typeof url !== "string") return false;
        const raw = url.trim();
        if (!raw) return false;
        if (/^data:application\/(?:x-)?pdf(?:[;,]|$)/i.test(raw)) return true;
        const clean = raw.split("?")[0].split("#")[0].toLowerCase();
        return clean.endsWith(".pdf");
    }

    function isPdfFile(file) {
        if (!file) return false;
        const type = String(file.type || "").toLowerCase();
        const name = String(file.name || "").toLowerCase();
        return type === "application/pdf" || type === "application/x-pdf" || name.endsWith(".pdf");
    }

    function isImageFile(file) {
        if (!file) return false;
        const type = String(file.type || "").toLowerCase();
        const name = String(file.name || "").toLowerCase();
        return type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name);
    }

    async function validatePdfFileHeader(file) {
        if (!file || typeof file.slice !== "function") return false;
        try {
            const headBuf = await file.slice(0, 64).arrayBuffer();
            const bytes = new Uint8Array(headBuf);
            let str = "";
            for (let i = 0; i < bytes.length; i++) {
                str += String.fromCharCode(bytes[i]);
            }
            const trimmed = str.replace(/^[\s\0\xef\xbb\xbf]+/, "");
            return trimmed.startsWith("%PDF-");
        } catch {
            return false;
        }
    }

    function getPdfJsGlobal() {
        return global.pdfjsLib || global["pdfjs-dist/build/pdf"] || null;
    }

    async function ensurePdfJsLoaded() {
        const existing = getPdfJsGlobal();
        if (existing) {
            if (existing.GlobalWorkerOptions && !existing.GlobalWorkerOptions.workerSrc) {
                existing.GlobalWorkerOptions.workerSrc = `${getOrigin()}/vendor/pdfjs/pdf.worker.min.js`;
            }
            return existing;
        }

        if (pdfJsLoadPromise) return pdfJsLoadPromise;

        const scriptUrl = `${getOrigin()}/vendor/pdfjs/pdf.min.js`;
        pdfJsLoadPromise = new Promise((resolve, reject) => {
            const finish = () => {
                const lib = getPdfJsGlobal();
                if (!lib) {
                    pdfJsLoadPromise = null;
                    reject(new Error("PDF preview library did not initialize."));
                    return;
                }
                if (lib.GlobalWorkerOptions) {
                    lib.GlobalWorkerOptions.workerSrc = `${getOrigin()}/vendor/pdfjs/pdf.worker.min.js`;
                }
                resolve(lib);
            };

            const existingTag = document.querySelector('script[data-labflow-pdfjs="true"]');
            if (existingTag) {
                existingTag.addEventListener("load", finish, { once: true });
                existingTag.addEventListener("error", () => {
                    pdfJsLoadPromise = null;
                    reject(new Error("Failed to load PDF preview library."));
                }, { once: true });
                setTimeout(() => {
                    if (getPdfJsGlobal()) finish();
                }, 100);
                return;
            }

            const script = document.createElement("script");
            script.src = scriptUrl;
            script.async = false;
            script.dataset.labflowPdfjs = "true";
            script.onload = finish;
            script.onerror = () => {
                pdfJsLoadPromise = null;
                reject(new Error("Failed to load PDF preview library."));
            };
            document.head.appendChild(script);
        });

        return pdfJsLoadPromise;
    }

    function decodeBase64PdfDataUrl(dataUrl) {
        const commaIndex = dataUrl.indexOf(",");
        if (commaIndex === -1) {
            throw new Error("Invalid PDF data URL.");
        }
        const meta = dataUrl.slice(0, commaIndex);
        const payload = dataUrl.slice(commaIndex + 1).replace(/\s+/g, "");
        if (!/;base64/i.test(meta)) {
            const decoded = decodeURIComponent(payload);
            const arr = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) arr[i] = decoded.charCodeAt(i) & 0xff;
            return arr;
        }
        const bin = atob(payload);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
    }

    async function fetchPdfBytesFromSource(sourceUrl) {
        const raw = String(sourceUrl || "").trim();
        if (!raw) throw new Error("Empty PDF source URL.");

        if (raw.startsWith("data:")) {
            return decodeBase64PdfDataUrl(raw);
        }

        const origin = getOrigin();
        const isSameOrigin = raw.startsWith("/") || (origin && raw.startsWith(origin)) || raw.startsWith("blob:");
        const res = await fetch(raw, {
            credentials: isSameOrigin ? "same-origin" : "omit",
        });
        if (!res.ok) {
            throw new Error(`Failed to fetch PDF template (${res.status}).`);
        }
        const buf = await res.arrayBuffer();
        return new Uint8Array(buf);
    }

    async function renderPdfBytesToDataUrl(uint8Bytes, options = {}) {
        const targetWidth = Math.max(120, Math.min(2400, Number(options.targetWidth) || 1588));
        const pdfjsLib = await ensurePdfJsLoaded();

        const openDoc = async (disableWorker) => {
            // Pass a fresh copy so transferring to the worker does not detach caller's buffer.
            const bytesCopy = new Uint8Array(uint8Bytes);
            const task = pdfjsLib.getDocument({
                data: bytesCopy,
                disableWorker,
                verbosity: 0,
            });
            return task.promise;
        };

        let pdfDoc = null;
        try {
            try {
                pdfDoc = await openDoc(false);
            } catch (workerErr) {
                if (workerErr?.name === "PasswordException") {
                    throw workerErr;
                }
                pdfDoc = await openDoc(true);
            }

            const numPages = pdfDoc.numPages || 1;
            const page = await pdfDoc.getPage(1);
            const baseViewport = page.getViewport({ scale: 1 });
            const scale = Math.max(0.25, Math.min(4, targetWidth / Math.max(1, baseViewport.width)));
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(viewport.width));
            canvas.height = Math.max(1, Math.round(viewport.height));
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                throw new Error("Canvas 2D context unavailable.");
            }

            // Paint solid white paper background first so transparent PDF artwork displays crisply.
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({ canvasContext: ctx, viewport }).promise;
            const dataUrl = canvas.toDataURL("image/png");

            return {
                dataUrl,
                numPages,
                width: canvas.width,
                height: canvas.height,
            };
        } finally {
            if (pdfDoc && typeof pdfDoc.destroy === "function") {
                try {
                    await pdfDoc.destroy();
                } catch {
                    // ignore cleanup error
                }
            }
        }
    }

    async function getPdfPreviewUrl(sourceUrl, options = {}) {
        const targetWidth = Math.max(120, Math.min(2400, Number(options.targetWidth) || 1588));
        const cacheKey = `${sourceUrl}::${targetWidth}`;

        if (previewCache.has(cacheKey)) {
            return previewCache.get(cacheKey);
        }
        if (inFlightMap.has(cacheKey)) {
            return inFlightMap.get(cacheKey);
        }

        const task = (async () => {
            const bytes = await fetchPdfBytesFromSource(sourceUrl);
            const result = await renderPdfBytesToDataUrl(bytes, { targetWidth });
            if (result?.dataUrl) {
                previewCache.set(cacheKey, result.dataUrl);
            }
            return result.dataUrl;
        })().finally(() => {
            inFlightMap.delete(cacheKey);
        });

        inFlightMap.set(cacheKey, task);
        return task;
    }

    function clearCacheForUrl(sourceUrl) {
        if (!sourceUrl) return;
        for (const key of previewCache.keys()) {
            if (key.startsWith(`${sourceUrl}::`)) {
                previewCache.delete(key);
            }
        }
    }

    global.TemplatePreviewHelper = Object.freeze({
        PDF_PLACEHOLDER_SVG,
        isPdfUrl,
        isPdfFile,
        isImageFile,
        validatePdfFileHeader,
        ensurePdfJsLoaded,
        renderPdfBytesToDataUrl,
        getPdfPreviewUrl,
        clearCacheForUrl,
    });
})(window);
