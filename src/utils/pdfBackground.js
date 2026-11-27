import puppeteer from "puppeteer";
import { PDFDocument, degrees } from "pdf-lib";
import {
    detectMimeTypeFromBuffer,
    readAssetAsBuffer,
} from "./pdfOfflineAssets.js";
import { getPuppeteerLaunchOptions } from "./puppeteerRuntime.js";

/**
 * Rasterize non-PNG/JPG images (SVG, WebP, GIF, etc.) into a transparent PNG buffer
 * using headless Chromium so pdf-lib can embed them cleanly.
 *
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 * @param {number} [width=595]
 * @param {number} [height=842]
 * @returns {Promise<Buffer|null>}
 */
export const convertImageToPngViaPuppeteer = async (imageBuffer, mimeType, width = 595, height = 842) => {
    let browser = null;
    try {
        const launchOptions = getPuppeteerLaunchOptions();
        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        await page.setViewport({ width, height });

        const base64 = imageBuffer.toString("base64");
        const dataUrl = `data:${mimeType};base64,${base64}`;

        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head>
            <meta charset="utf-8">
            <style>
                * { margin: 0; padding: 0; }
                html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: transparent; }
                img { width: 100%; height: 100%; object-fit: cover; display: block; }
            </style>
            </head>
            <body>
            <img src="${dataUrl}" />
            </body>
            </html>
        `, { waitUntil: "networkidle0" });

        const pngBuffer = await page.screenshot({
            type: "png",
            clip: { x: 0, y: 0, width, height },
            omitBackground: true,
        });

        console.log("[bg-pdf] Image->PNG conversion via Puppeteer succeeded.", {
            width,
            height,
            pngSize: pngBuffer?.length ?? 0,
        });
        return pngBuffer;
    } catch (err) {
        console.error("[bg-pdf] Image->PNG Puppeteer conversion failed:", err?.message || err);
        return null;
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
};

/**
 * Draw an embedded background PDF page onto a target pdf-lib page, honoring the
 * source page's CropBox and /Rotate metadata so it fills the target page cleanly.
 */
const drawEmbeddedPdfBackground = (targetPage, embeddedBgPage, rotAngle, pageWidth, pageHeight) => {
    const normalizedRot = ((rotAngle % 360) + 360) % 360;

    if (normalizedRot === 90) {
        targetPage.drawPage(embeddedBgPage, {
            x: 0,
            y: pageHeight,
            width: pageHeight,
            height: pageWidth,
            rotate: degrees(-90),
        });
        return;
    }

    if (normalizedRot === 180) {
        targetPage.drawPage(embeddedBgPage, {
            x: pageWidth,
            y: pageHeight,
            width: pageWidth,
            height: pageHeight,
            rotate: degrees(180),
        });
        return;
    }

    if (normalizedRot === 270) {
        targetPage.drawPage(embeddedBgPage, {
            x: pageWidth,
            y: 0,
            width: pageHeight,
            height: pageWidth,
            rotate: degrees(90),
        });
        return;
    }

    targetPage.drawPage(embeddedBgPage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
    });
};

const pageHasContents = (page) => {
    try {
        return Boolean(page?.node?.Contents?.());
    } catch {
        return false;
    }
};

const composeWithPdfBackground = async (inputPdfDoc, outputPdfDoc, bgBuffer) => {
    let bgPdfDoc;
    try {
        bgPdfDoc = await PDFDocument.load(bgBuffer, { ignoreEncryption: true });
    } catch (err) {
        console.error("[bg-pdf] Failed to load PDF letterhead template:", err?.message || err);
        return false;
    }

    if (bgPdfDoc.isEncrypted) {
        console.warn("[bg-pdf] Encrypted PDF letterhead cannot be embedded cleanly.");
        return false;
    }

    const bgPages = bgPdfDoc.getPages();
    if (!bgPages || bgPages.length === 0) {
        console.warn("[bg-pdf] PDF letterhead template contains no pages.");
        return false;
    }

    const bgTemplatePage = bgPages[0];
    const rotAngle = bgTemplatePage.getRotation()?.angle || 0;
    let embeddedBgPage = null;

    if (pageHasContents(bgTemplatePage)) {
        const cropBox = bgTemplatePage.getCropBox() || bgTemplatePage.getMediaBox();
        try {
            embeddedBgPage = await outputPdfDoc.embedPage(bgTemplatePage, {
                left: cropBox.x,
                bottom: cropBox.y,
                right: cropBox.x + cropBox.width,
                top: cropBox.y + cropBox.height,
            });
        } catch (err) {
            console.error("[bg-pdf] Failed to embed PDF letterhead page:", err?.message || err);
            return false;
        }
    } else {
        console.warn("[bg-pdf] PDF letterhead template page 1 has no drawing contents; keeping blank background.");
    }

    const sourcePages = inputPdfDoc.getPages();
    for (let i = 0; i < sourcePages.length; i++) {
        const srcPage = sourcePages[i];
        const pageWidth = srcPage.getWidth();
        const pageHeight = srcPage.getHeight();
        const newPage = outputPdfDoc.addPage([pageWidth, pageHeight]);

        if (embeddedBgPage) {
            drawEmbeddedPdfBackground(newPage, embeddedBgPage, rotAngle, pageWidth, pageHeight);
        }

        if (pageHasContents(srcPage)) {
            const [copiedPage] = await outputPdfDoc.embedPages([srcPage]);
            if (!copiedPage) {
                throw new Error(`Failed to embed report page at index ${i}`);
            }

            newPage.drawPage(copiedPage, {
                x: 0,
                y: 0,
                width: pageWidth,
                height: pageHeight,
            });
        }
    }

    console.log("[bg-pdf] Vector PDF letterhead applied across", sourcePages.length, "page(s).");
    return true;
};

const embedBackgroundImageAsset = async (outputPdfDoc, backgroundAsset, pgW, pgH) => {
    const mimeStr = String(backgroundAsset.mimeType || "").toLowerCase();
    const isPng = mimeStr.includes("png");
    const isJpg = mimeStr.includes("jpeg") || mimeStr.includes("jpg");
    const needsConversion = !isPng && !isJpg;

    let workingBuffer = backgroundAsset.buffer;
    let workingIsPng = isPng;

    if (needsConversion) {
        console.log(`[bg-pdf] MIME type "${mimeStr}" is not directly supported by pdf-lib. Converting to PNG via Puppeteer...`);
        const converted = await convertImageToPngViaPuppeteer(backgroundAsset.buffer, backgroundAsset.mimeType, pgW, pgH);
        if (!converted) {
            console.error("[bg-pdf] Conversion failed — background image will not be applied.");
            return null;
        }
        workingBuffer = converted;
        workingIsPng = true;
    }

    try {
        return workingIsPng
            ? await outputPdfDoc.embedPng(workingBuffer)
            : await outputPdfDoc.embedJpg(workingBuffer);
    } catch (embedErr) {
        console.warn("[bg-pdf] Direct embed failed:", embedErr?.message || embedErr, "— trying alternate strategies...");
        try {
            return await outputPdfDoc.embedPng(workingBuffer);
        } catch {
            try {
                return await outputPdfDoc.embedJpg(workingBuffer);
            } catch {
                const lastResort = await convertImageToPngViaPuppeteer(backgroundAsset.buffer, backgroundAsset.mimeType, pgW, pgH);
                if (!lastResort) return null;
                try {
                    return await outputPdfDoc.embedPng(lastResort);
                } catch (finalErr) {
                    console.error("[bg-pdf] Last-resort embed failed:", finalErr?.message || finalErr);
                    return null;
                }
            }
        }
    }
};

/**
 * Overlay a generated (transparent-background) report PDF on top of a letterhead
 * template (either an image PNG/JPG/SVG/WebP or a PDF template).
 *
 * @param {Buffer|Uint8Array} inputPdfBuffer
 * @param {string} backgroundTemplateUrl
 * @returns {Promise<Uint8Array|Buffer|null>}
 */
export const addBackgroundToPdf = async (inputPdfBuffer, backgroundTemplateUrl) => {
    if (!inputPdfBuffer) {
        console.error("[bg-pdf] Input PDF buffer is null or undefined — cannot compose background.");
        return null;
    }

    if (!backgroundTemplateUrl) {
        return inputPdfBuffer;
    }

    try {
        let inputPdfDoc;
        try {
            inputPdfDoc = await PDFDocument.load(inputPdfBuffer);
        } catch (loadErr) {
            console.error("[bg-pdf] Failed to load input PDF buffer:", loadErr?.message || loadErr);
            return inputPdfBuffer;
        }

        const sourcePages = inputPdfDoc.getPages();
        if (sourcePages.length === 0) {
            console.error("[bg-pdf] Source PDF has no pages.");
            return inputPdfBuffer;
        }

        const backgroundAsset = await readAssetAsBuffer(backgroundTemplateUrl).catch((assetErr) => {
            console.error("[bg-pdf] readAssetAsBuffer threw an error:", assetErr?.message || assetErr);
            return null;
        });

        if (!backgroundAsset?.buffer) {
            console.warn("[bg-pdf] Background asset could not be resolved; returning original PDF.", {
                urlPrefix: String(backgroundTemplateUrl || "").slice(0, 80),
            });
            return inputPdfBuffer;
        }

        const outputPdfDoc = await PDFDocument.create();
        const detectedMime = detectMimeTypeFromBuffer(backgroundAsset.buffer) || "";
        const assetMime = String(backgroundAsset.mimeType || "").toLowerCase();
        const isPdfTemplate = assetMime.includes("pdf") || detectedMime === "application/pdf";

        if (isPdfTemplate) {
            const pdfApplied = await composeWithPdfBackground(inputPdfDoc, outputPdfDoc, backgroundAsset.buffer);
            if (!pdfApplied) {
                return inputPdfBuffer;
            }
            return outputPdfDoc.save();
        }

        const pgW = Math.round(sourcePages[0].getWidth());
        const pgH = Math.round(sourcePages[0].getHeight());
        const backgroundImage = await embedBackgroundImageAsset(outputPdfDoc, backgroundAsset, pgW, pgH);
        if (!backgroundImage) {
            console.warn("[bg-pdf] backgroundImage is null after all embed attempts — returning original PDF.");
            return inputPdfBuffer;
        }

        for (let i = 0; i < sourcePages.length; i++) {
            const srcPage = sourcePages[i];
            const pageWidth = srcPage.getWidth();
            const pageHeight = srcPage.getHeight();
            const newPage = outputPdfDoc.addPage([pageWidth, pageHeight]);

            newPage.drawImage(backgroundImage, {
                x: 0,
                y: 0,
                width: pageWidth,
                height: pageHeight,
            });

            if (pageHasContents(srcPage)) {
                const [copiedPage] = await outputPdfDoc.embedPages([srcPage]);
                if (!copiedPage) {
                    console.error(`[bg-pdf] embedPages returned null for page index ${i}`);
                    return null;
                }

                newPage.drawPage(copiedPage, {
                    x: 0,
                    y: 0,
                    width: pageWidth,
                    height: pageHeight,
                });
            }
        }

        return outputPdfDoc.save();
    } catch (error) {
        console.error("[bg-pdf] Unexpected error in addBackgroundToPdf:", {
            message: error?.message || String(error),
            stack: error?.stack || "",
        });
        return null;
    }
};
