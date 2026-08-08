import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import {
    convertImageToPngBuffer,
    loadOfflineHtmlIntoPage,
    readAssetAsBuffer,
    rewriteHtmlForOfflinePdf,
    sanitizePdfCss,
    sanitizePdfMarkup,
} from '../utils/pdfOfflineAssets.js';
import { getPuppeteerLaunchOptions } from '../utils/puppeteerRuntime.js';

const launchPdfBrowser = async () => {
    const launchOptions = getPuppeteerLaunchOptions();

    if (!launchOptions.executablePath) {
        console.warn('Bundled Chromium executable was not found. Falling back to Puppeteer managed browser resolution.');
    }

    return puppeteer.launch(launchOptions);
};

/**
 * Convert any image buffer (SVG, WebP, etc.) to a PNG buffer by rendering
 * it inside a headless Chromium page and taking a screenshot.
 * This is the most reliable approach when node-canvas lacks SVG support.
 *
 * @param {Buffer} imageBuffer  - Raw image bytes (e.g. SVG)
 * @param {string} mimeType     - MIME type of the input (e.g. 'image/svg+xml')
 * @param {number} [width=595]  - Target width in px (A4 @ 72dpi)
 * @param {number} [height=842] - Target height in px
 * @returns {Promise<Buffer|null>}
 */
const convertImageToPngViaPuppeteer = async (imageBuffer, mimeType, width = 595, height = 842) => {
    let browser = null;
    try {
        const launchOptions = getPuppeteerLaunchOptions();
        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        await page.setViewport({ width, height });

        // Build a data-URL for the image so we don't need the filesystem
        const base64 = imageBuffer.toString('base64');
        const dataUrl = `data:${mimeType};base64,${base64}`;

        // Render the image stretched to fill the entire viewport
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
        `, { waitUntil: 'networkidle0' });

        const pngBuffer = await page.screenshot({
            type: 'png',
            clip: { x: 0, y: 0, width, height },
            omitBackground: true,
        });

        console.log('[bg-pdf] SVG→PNG conversion via Puppeteer succeeded.', { width, height, pngSize: pngBuffer?.length ?? 0 });
        return pngBuffer;
    } catch (err) {
        console.error('[bg-pdf] SVG→PNG Puppeteer conversion failed:', err?.message || err);
        return null;
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
};

const renderOfflineHtmlOnPage = async (page, htmlContent, waitUntil = 'networkidle0') => {
    return loadOfflineHtmlIntoPage(page, htmlContent, {
        waitUntil,
        logContext: 'final-offline-pdf-render',
    });
};

const parseNumericValue = (value, fallback = 0) => {
    const parsedValue = Number.parseFloat(value);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const DEFAULT_PDF_FONT_FAMILY = "Arial";
const PDF_FONT_STACKS = Object.freeze({
    "Arial": '"Arial", sans-serif',
    "Segoe UI": '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
    "Calibri": 'Calibri, "Segoe UI", sans-serif',
    "Verdana": 'Verdana, Geneva, sans-serif',
    "Tahoma": 'Tahoma, Geneva, sans-serif',
    "Trebuchet MS": '"Trebuchet MS", Helvetica, sans-serif',
    "Georgia": 'Georgia, "Times New Roman", serif',
    "Times New Roman": '"Times New Roman", Times, serif',
    "Garamond": 'Garamond, Georgia, serif',
    "Courier New": '"Courier New", Courier, monospace',
});

const resolvePdfFontStack = (selectedFontFamily) => {
    const normalizedFontFamily = String(selectedFontFamily || "").trim();
    return PDF_FONT_STACKS[normalizedFontFamily] || PDF_FONT_STACKS[DEFAULT_PDF_FONT_FAMILY];
};

const buildPdfBodyDocument = ({
    cssContent,
    htmlContent,
    selectedFontSize,
    selectedFontFamily,
    RowSpacing,
    HighLow,
    HLinred,
    BoldRow,
    hideCategories,
    hideTableHeadings,
    backgroundImageUrl,
    disableBackgroundImage,
    checkBox,
}) => {
    const safeCss = sanitizePdfCss(cssContent);
    const safeMarkup = sanitizePdfMarkup(htmlContent);
    const fontSize = parseNumericValue(selectedFontSize, 12);
    const rowSpacing = parseNumericValue(RowSpacing, 7) / 2;
    const showHighLow = HighLow ? 'block' : 'none';
    const abnormalResultColor = HLinred ? 'red' : 'inherit';
    const boldWeight = BoldRow ? 'bold' : '400';
    const fontStack = resolvePdfFontStack(selectedFontFamily);
    const categoryDisplay = hideCategories ? 'none' : 'block';

    // When a background image is present, we intentionally do NOT set it via CSS.
    // Instead we tell Puppeteer to produce a transparent PDF (omitBackground:true)
    // so that pdf-lib can draw the image behind the PDF content layer without the
    // content's opaque white background covering it.
    // If there is NO background image we still need the page to be transparent
    // so that any consumer of the buffer can control the appearance.
    const shouldApplyBackground = Boolean(backgroundImageUrl && !disableBackgroundImage && !checkBox);
    const backgroundStyle = `
        html, body, .middle, .container, .container2, .container-format1, .container22, .report-page, .report-container {
            background-color: transparent !important;
            background-image: none !important;
        }
    `;

    return [
        '<!DOCTYPE html>',
        '<html>',
        '<head>',
        '<meta charset="utf-8" />',
        '<style>',
        '*{margin:0;padding:0;box-sizing:border-box;}',
        backgroundStyle,
        safeCss,
        '.wrong i, .delete-btn i { display: none; }',
        'h2 { margin: 0 !important; padding: 0 !important; }',
        '.headings { margin-top: 0 !important; margin-bottom: 0 !important; }',
        `html, body, body * { font-family: ${fontStack} !important; }`,
        `.middle { font-size: ${fontSize}px !important; }`,
        `.middle td, .middle th, .middle p, .middle span, .middle div, .middle li, .middle label, .middle small, .middle strong, .middle b, .middle em, .middle a { font-size: ${fontSize}px !important; }`,
        `td { padding-top: ${rowSpacing}px !important; padding-bottom: ${rowSpacing}px !important; }`,
        `td .HL span, td .HL .high-low-marker { display: ${showHighLow}; }`,
        `.headings > h3, .headings > .category-heading { display: ${categoryDisplay} !important; }`,
        `.headings > h4, .headings > .table-heading { display: ${hideTableHeadings ? 'none' : 'block'} !important; }`,
        `.abnormal-result-row .high-low > span:last-child, .abnormal-result-row .high-low .result-value, .abnormal-result-row .HL span, .abnormal-result-row .HL .high-low-marker, .BoldRow .high-low > span:last-child, .BoldRow .high-low .result-value, .BoldRow .HL span, .BoldRow .HL .high-low-marker { color: ${abnormalResultColor} !important; }`,
        `.BoldRow { font-weight: ${boldWeight} !important; }`,
        '.deletion { display: none !important; }',
        'td.wrong { display: none !important; }',
        '.details-row, .details-row * { font-size: 10px !important; }',
        '.methods, .methods * { font-size: 8px !important; color: #565656 !important; margin-top: 2px !important; }',
        '</style>',
        '</head>',
        '<body>',
        '<div class="middle">',
        safeMarkup,
        '</div>',
        '</body>',
        '</html>',
    ].join('\n');
};

const buildPdfHeaderTemplate = async ({
    format3,
    headermargin,
    showInvest,
    header,
    selectedFontSize,
    selectedFontFamily,
}) => {
    const safeHeader = sanitizePdfMarkup(header);
    const headerMarginValue = parseNumericValue(headermargin, 2.8);
    const fontSize = parseNumericValue(selectedFontSize, 12);
    const fontStack = resolvePdfFontStack(selectedFontFamily);

    return rewriteHtmlForOfflinePdf([
        '<!DOCTYPE html>',
        '<html>',
        '<head>',
        '<meta charset="utf-8" />',
        '<style>',
        '*{margin:0;padding:0;box-sizing:border-box;}',
        `.pdf-header-div { width: ${format3 ? '100%' : '95%'}; margin: 0 auto; border: ${format3 ? 'none' : '1px solid black'}; margin-top: ${format3 ? '0' : headerMarginValue}cm !important; }`,
        `.report-details-innerDiv2 { width: ${format3 ? '95%' : '100%'} !important; font-size: ${fontSize}px !important; margin-top: ${format3 ? headerMarginValue : '0'}cm !important; border: none !important; }`,
        `.pdf-header-div, .pdf-header-div td, .pdf-header-div th, .pdf-header-div p, .pdf-header-div span, .pdf-header-div div, .pdf-header-div label, .pdf-header-div small, .pdf-header-div strong { font-family: ${fontStack} !important; font-size: ${fontSize}px !important; }`,
        '.pdf-header-div .branding strong, .pdf-header-div .branding span, .pdf-header-div .branding .poweredby, .pdf-header-div .branding .occusoft { font-size: 6px !important; line-height: 1.1 !important; }',
        '.pdf-header-div .hdr-powered { font-size: 10px !important; line-height: 1.1 !important; }',
        `#investDiv { display: ${showInvest ? 'flex' : 'none'} !important; }`,
        '.time-div { width: 40% !important; }',
        '</style>',
        '</head>',
        '<body>',
        '<div class="pdf-header-div">',
        safeHeader,
        '</div>',
        '</body>',
        '</html>',
    ].join('\n'));
};

const buildPdfFooterTemplate = async ({
    cssContent,
    footer,
    footermarginPx,
    LeftsignPd = 0,
    Rightsignpd = 0,
    selectedFontSize,
    selectedFontFamily,
}) => {
    const safeCss = sanitizePdfCss(cssContent);
    const safeFooter = sanitizePdfMarkup(footer);
    const leftPadding = parseNumericValue(LeftsignPd, 0);
    const rightPadding = parseNumericValue(Rightsignpd, 0);
    const fontSize = parseNumericValue(selectedFontSize, 12);
    const fontStack = resolvePdfFontStack(selectedFontFamily);

    return rewriteHtmlForOfflinePdf([
        '<!DOCTYPE html>',
        '<html>',
        '<head>',
        '<meta charset="utf-8" />',
        '<style>',
        '*{margin:0;padding:0;box-sizing:border-box;}',
        safeCss,
        `.pdf-footer-div { width: 92%; display: flex; justify-content: center; font-size: ${fontSize}px !important; font-weight: 450; text-align: center; margin: 0 auto; padding-left: ${leftPadding}cm; padding-right: ${rightPadding}cm; margin-bottom: ${footermarginPx}px; }`,
        `.pdf-footer-div, .pdf-footer-div td, .pdf-footer-div th, .pdf-footer-div p, .pdf-footer-div span, .pdf-footer-div div, .pdf-footer-div label, .pdf-footer-div small, .pdf-footer-div strong { font-family: ${fontStack} !important; font-size: ${fontSize}px !important; }`,
        '</style>',
        '</head>',
        '<body>',
        '<div class="pdf-footer-div">',
        safeFooter,
        '</div>',
        '</body>',
        '</html>',
    ].join('\n'));
};

const adjustPdfMargins = async (pdfBuffer, marginRight, marginLeft) => {
    marginRight = marginRight || 0;
    marginLeft = marginLeft || 0;

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();

    for (const page of pages) {
        const { width, height } = page.getSize();
        const newWidth = width - marginLeft - marginRight;
        const scaleFactor = newWidth / width;

        if (newWidth <= 0) {
            throw new Error("Margins are too large for the page width!");
        }

        page.scaleContent(scaleFactor, scaleFactor);
        const translateX = marginLeft;
        const translateY = (height - height * scaleFactor) / 2;
        page.translateContent(translateX, translateY);
    }

    return pdfDoc.save();
};

const addBackgroundToPdf = async (inputPdfBuffer, backgroundImageUrl) => {
    console.log('[bg-pdf] addBackgroundToPdf called', {
        hasInputBuffer: Boolean(inputPdfBuffer),
        inputBufferLength: inputPdfBuffer?.length ?? 0,
        backgroundUrlType: !backgroundImageUrl ? 'none'
            : backgroundImageUrl.startsWith('data:') ? `data-url(${backgroundImageUrl.slice(0, 40)}...)`
            : backgroundImageUrl.startsWith('http') ? `remote-url(${backgroundImageUrl.slice(0, 80)})`
            : `path-or-other(${String(backgroundImageUrl).slice(0, 80)})`,
        backgroundUrlLength: backgroundImageUrl?.length ?? 0,
    });

    if (!inputPdfBuffer) {
        console.error('[bg-pdf] Input PDF buffer is null or undefined — cannot compose background.');
        return null;
    }

    if (!backgroundImageUrl) {
        console.log('[bg-pdf] No background image URL provided — returning original PDF buffer unchanged.');
        return inputPdfBuffer;
    }

    try {
        // ── Step 1: load the source (transparent) Puppeteer PDF ──────────────
        let inputPdfDoc;
        try {
            inputPdfDoc = await PDFDocument.load(inputPdfBuffer);
            console.log('[bg-pdf] Source PDF loaded successfully. Pages:', inputPdfDoc.getPageCount());
        } catch (loadErr) {
            console.error('[bg-pdf] Failed to load input PDF buffer:', loadErr?.message || loadErr);
            return inputPdfBuffer;
        }

        const outputPdfDoc = await PDFDocument.create();
        let backgroundImage = null;

        // ── Step 2: resolve the background image asset ────────────────────────
        let backgroundAsset;
        try {
            backgroundAsset = await readAssetAsBuffer(backgroundImageUrl);
        } catch (assetErr) {
            console.error('[bg-pdf] readAssetAsBuffer threw an error:', assetErr?.message || assetErr);
        }

        if (!backgroundAsset?.buffer) {
            console.warn('[bg-pdf] Background image asset could not be resolved.', {
                urlPrefix: String(backgroundImageUrl || '').slice(0, 80),
                urlLength: backgroundImageUrl?.length ?? 0,
            });
            console.warn('[bg-pdf] Returning original PDF without background.');
            return inputPdfBuffer;
        }

        console.log('[bg-pdf] Background asset resolved.', {
            mimeType: backgroundAsset.mimeType,
            bufferLength: backgroundAsset.buffer.length,
        });

        // ── Step 3: embed the image into the output PDF document ──────────────
        // pdf-lib only supports PNG and JPG natively.
        // SVG, WebP, BMP, GIF and any unknown format must be rasterized first.
        const mimeStr = String(backgroundAsset.mimeType || '').toLowerCase();
        const isPng  = mimeStr.includes('png');
        const isJpg  = mimeStr.includes('jpeg') || mimeStr.includes('jpg');
        const isSvg  = mimeStr.includes('svg');
        const needsConversion = !isPng && !isJpg; // SVG, WebP, GIF, unknown...

        // Determine page dimensions from the first PDF page (points → px at 72dpi = same value)
        const firstPageForSize = inputPdfDoc.getPages()[0];
        const pgW = Math.round(firstPageForSize.getWidth());
        const pgH = Math.round(firstPageForSize.getHeight());

        let workingBuffer = backgroundAsset.buffer;
        let workingIsPng  = isPng;

        if (needsConversion) {
            console.log(`[bg-pdf] MIME type "${mimeStr}" is not directly supported by pdf-lib. Converting to PNG via Puppeteer...`);
            const converted = await convertImageToPngViaPuppeteer(backgroundAsset.buffer, backgroundAsset.mimeType, pgW, pgH);
            if (converted) {
                workingBuffer = converted;
                workingIsPng  = true;
                console.log('[bg-pdf] Conversion to PNG succeeded. Buffer size:', workingBuffer.length);
            } else {
                console.error('[bg-pdf] Conversion failed — background image will not be applied.');
                return inputPdfBuffer;
            }
        }

        try {
            if (workingIsPng) {
                backgroundImage = await outputPdfDoc.embedPng(workingBuffer);
                console.log('[bg-pdf] PNG embedded successfully.');
            } else {
                backgroundImage = await outputPdfDoc.embedJpg(workingBuffer);
                console.log('[bg-pdf] JPG embedded successfully.');
            }
        } catch (embedErr) {
            // Last resort: try the other format, then Puppeteer PNG conversion
            console.warn('[bg-pdf] Direct embed failed:', embedErr?.message || embedErr, '— trying alternate strategies...');
            try {
                backgroundImage = await outputPdfDoc.embedPng(workingBuffer);
                console.log('[bg-pdf] Fallback embedPng succeeded.');
            } catch {
                try {
                    backgroundImage = await outputPdfDoc.embedJpg(workingBuffer);
                    console.log('[bg-pdf] Fallback embedJpg succeeded.');
                } catch {
                    // Final attempt: Puppeteer rasterization regardless of format
                    console.warn('[bg-pdf] All direct embeds failed. Trying Puppeteer rasterization as last resort...');
                    const lastResort = await convertImageToPngViaPuppeteer(backgroundAsset.buffer, backgroundAsset.mimeType, pgW, pgH);
                    if (lastResort) {
                        try {
                            backgroundImage = await outputPdfDoc.embedPng(lastResort);
                            console.log('[bg-pdf] Last-resort Puppeteer PNG embed succeeded.');
                        } catch (finalErr) {
                            console.error('[bg-pdf] Even last-resort embed failed:', finalErr?.message || finalErr);
                            return inputPdfBuffer;
                        }
                    } else {
                        console.error('[bg-pdf] All embedding strategies exhausted — returning PDF without background.');
                        return inputPdfBuffer;
                    }
                }
            }
        }

        if (!backgroundImage) {
            console.warn('[bg-pdf] backgroundImage is null after all embed attempts — returning original PDF.');
            return inputPdfBuffer;
        }

        // ── Step 4: compose pages — background first, then transparent PDF content ──
        const sourcePages = inputPdfDoc.getPages();
        if (sourcePages.length === 0) {
            console.error('[bg-pdf] Source PDF has no pages.');
            return inputPdfBuffer;
        }

        const pageWidth = sourcePages[0].getWidth();
        const pageHeight = sourcePages[0].getHeight();
        console.log('[bg-pdf] Composing', sourcePages.length, 'pages at', pageWidth, 'x', pageHeight);

        for (let i = 0; i < sourcePages.length; i++) {
            const newPage = outputPdfDoc.addPage([pageWidth, pageHeight]);

            // Draw background image first (behind content)
            newPage.drawImage(backgroundImage, {
                x: 0,
                y: 0,
                width: pageWidth,
                height: pageHeight,
            });

            // Embed the Puppeteer-generated page (transparent) and draw it on top
            let copiedPage;
            try {
                [copiedPage] = await outputPdfDoc.embedPages([inputPdfDoc.getPages()[i]]);
            } catch (embedPageErr) {
                console.error(`[bg-pdf] Failed to embed page ${i}:`, embedPageErr?.message || embedPageErr);
                return null;
            }

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

        const finalBuffer = await outputPdfDoc.save();
        console.log('[bg-pdf] Background composition complete. Final buffer size:', finalBuffer.length);
        return finalBuffer;
    } catch (error) {
        console.error('[bg-pdf] Unexpected error in addBackgroundToPdf:', {
            message: error?.message || String(error),
            stack: error?.stack || '',
        });
        return null;
    }
};

const offlinePdfGeneratorController = async (params) => {
    let {
        pdfformat, layerone, showInvest, BoldRow, HLinred, HighLow, RowSpacing,
        selectedFontSize, selectedFontFamily, hideCategories, hideTableHeadings, reportId, htmlContent,
        cssContent, header, footer, backgroundImageUrl, disableBackgroundImage, checkBox, headermargin, footermargin, marginRight,
        marginLeft, investigationmargin, LeftsignPd, Rightsignpd, res
    } = params || {};

    investigationmargin = parseNumericValue(investigationmargin, 40) + 20;
    const format3 = pdfformat === "reportFormat3";
    const cmToPx = (cm) => cm * 37.795;

    let headermarginPx = 0;
    let footermarginPx = 0;
    let marginRightPx = 0;
    let marginLeftPx = 0;

    if (marginRight || marginLeft) {
        marginRightPx = cmToPx(parseNumericValue(marginRight, 0));
        marginLeftPx = cmToPx(parseNumericValue(marginLeft, 0));
    }

    headermarginPx = cmToPx(parseNumericValue(headermargin, 2.8));
    footermarginPx = cmToPx(parseNumericValue(footermargin, 1));

    const rawBg = backgroundImageUrl ||
        params?.backgroundImage ||
        params?.bgImage ||
        params?.backgroundImg ||
        params?.imageUrl ||
        params?.templateImage ||
        params?.template ||
        params?.fileInputLab ||
        params?.background ||
        "";
    const cleanBgUrl = String(rawBg || "").trim().replace(/[\r\n\s]+/g, "");

    const shouldDisableBackground = Boolean(disableBackgroundImage || checkBox);
    const effectiveBgUrl = shouldDisableBackground ? "" : cleanBgUrl;

    // Log the effective background URL details so failures are easy to diagnose.
    console.log('[offline-pdf] Starting PDF generation', {
        reportId,
        pdfformat,
        shouldDisableBackground,
        effectiveBgUrlType: !effectiveBgUrl ? 'none'
            : effectiveBgUrl.startsWith('data:') ? `data-url(len=${effectiveBgUrl.length})`
            : effectiveBgUrl.startsWith('http') ? `remote-url(${effectiveBgUrl.slice(0, 80)})`
            : `local-path(${effectiveBgUrl.slice(0, 80)})`,
        effectiveBgUrlLength: effectiveBgUrl?.length ?? 0,
    });

    try {
        const browser = await launchPdfBrowser();
        const page = await browser.newPage();
        let cleanupPageContent = async () => { };

        try {
            // When a background image will be applied by pdf-lib, we render the
            // Puppeteer page with a fully transparent background so that the
            // pdf-lib background layer can show through underneath the content.
            // We always pass an empty backgroundImageUrl to buildPdfBodyDocument
            // so CSS never sets a background-image (which would conflict).
            const contentWithCssAndImage = buildPdfBodyDocument({
                cssContent,
                htmlContent,
                selectedFontSize,
                selectedFontFamily,
                RowSpacing,
                HighLow,
                HLinred,
                BoldRow,
                hideCategories,
                hideTableHeadings,
                backgroundImageUrl: '', // always empty — pdf-lib handles the bg
                disableBackgroundImage: true, // prevent CSS bg
                checkBox,
            });

            cleanupPageContent = await renderOfflineHtmlOnPage(page, contentWithCssAndImage);
            console.log('[offline-pdf] HTML rendered into Puppeteer page.');

            const offlineHeaderTemplate = await buildPdfHeaderTemplate({
                format3,
                headermargin,
                showInvest,
                header,
                selectedFontSize,
                selectedFontFamily,
            });

            const offlineFooterTemplate = await buildPdfFooterTemplate({
                cssContent,
                footer,
                footermarginPx,
                LeftsignPd,
                Rightsignpd,
                selectedFontSize,
                selectedFontFamily,
            });

            // omitBackground: true makes Puppeteer produce a PDF with a
            // transparent page background instead of the default white fill.
            // This is the key fix — without it, the white background painted by
            // Chromium covers the image drawn by pdf-lib below the content layer.
            const pdfOptions = {
                format: 'A4',
                printBackground: true,
                omitBackground: Boolean(effectiveBgUrl), // transparent when bg image present
                displayHeaderFooter: true,
                headerTemplate: offlineHeaderTemplate,
                footerTemplate: offlineFooterTemplate,
                margin: {
                    top: `${headermarginPx + (format3 ? ((investigationmargin * 1.10) + (layerone ? (investigationmargin < 110 ? 75 : 15) : (investigationmargin < 160 ? 55 : 0))) : ((investigationmargin * 0.90) + (layerone ? 10 : 0)))}px`,
                    bottom: '175px',
                    left: '10px',
                    right: '10px',
                },
            };

            console.log('[offline-pdf] Calling page.pdf() with omitBackground =', pdfOptions.omitBackground);
            const pdfBuffer = await page.pdf(pdfOptions);
            console.log('[offline-pdf] page.pdf() complete. Buffer size:', pdfBuffer?.length ?? 0);

            let finalPdfBuffer;
            if (effectiveBgUrl) {
                console.log('[offline-pdf] Applying background image via pdf-lib...');
                finalPdfBuffer = await addBackgroundToPdf(pdfBuffer, effectiveBgUrl);
                if (!finalPdfBuffer) {
                    console.error('[offline-pdf] addBackgroundToPdf returned null — falling back to original PDF without background.');
                    finalPdfBuffer = pdfBuffer;
                } else {
                    console.log('[offline-pdf] Background applied successfully. Final buffer size:', finalPdfBuffer.length);
                }
            } else {
                console.log('[offline-pdf] No background image — using raw Puppeteer PDF.');
                finalPdfBuffer = pdfBuffer;
            }

            const finalpdfbufferwithmargin = await adjustPdfMargins(finalPdfBuffer, marginRightPx, marginLeftPx);
            console.log('[offline-pdf] Margin adjustment complete. Sending response.');

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="offline_report.pdf"');
            res.setHeader('Content-Length', finalpdfbufferwithmargin.length);
            res.end(finalpdfbufferwithmargin);
        } finally {
            await cleanupPageContent().catch(() => { });
            await browser.close().catch(() => { });
        }
    } catch (error) {
        console.error('[offline-pdf] Error generating offline PDF:', {
            message: error?.message || String(error),
            stack: error?.stack || '',
            reportId,
        });
        res.status(500).send('Error generating offline PDF');
    }
};

export { offlinePdfGeneratorController };
