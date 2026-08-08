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

    const shouldApplyBackground = Boolean(backgroundImageUrl && !disableBackgroundImage && !checkBox);
    const backgroundStyle = shouldApplyBackground ? `
        html, body, .middle, .container, .container2, .container-format1, .container22, .report-page, .report-container {
            background-color: transparent !important;
        }
        body, .middle, .container, .container2, .container-format1, .report-page, .report-container {
            background-image: url('${backgroundImageUrl}') !important;
            background-size: cover !important;
            background-repeat: no-repeat !important;
            background-position: center top !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
    ` : `
        html, body { background: transparent !important; }
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
    if (!inputPdfBuffer) {
        console.error('Input PDF buffer is null or undefined');
        return null;
    }

    if (!backgroundImageUrl) {
        return inputPdfBuffer;
    }

    try {
        const inputPdfDoc = await PDFDocument.load(inputPdfBuffer);
        const outputPdfDoc = await PDFDocument.create();
        let backgroundImage = null;

        const backgroundAsset = await readAssetAsBuffer(backgroundImageUrl);
        if (!backgroundAsset?.buffer) {
            console.warn('Background image could not be resolved, returning original PDF buffer.');
            return inputPdfBuffer;
        }

        const isPng = backgroundAsset.mimeType?.includes('png');
        try {
            if (isPng) {
                backgroundImage = await outputPdfDoc.embedPng(backgroundAsset.buffer);
            } else {
                backgroundImage = await outputPdfDoc.embedJpg(backgroundAsset.buffer);
            }
        } catch (primaryErr) {
            try {
                if (isPng) {
                    backgroundImage = await outputPdfDoc.embedJpg(backgroundAsset.buffer);
                } else {
                    backgroundImage = await outputPdfDoc.embedPng(backgroundAsset.buffer);
                }
            } catch (fallbackErr) {
                console.warn('Native pdf-lib image embedding failed, attempting canvas conversion to PNG...', fallbackErr?.message || fallbackErr);
                try {
                    const convertedPngBuffer = await convertImageToPngBuffer(backgroundAsset.buffer);
                    if (convertedPngBuffer) {
                        backgroundImage = await outputPdfDoc.embedPng(convertedPngBuffer);
                    }
                } catch (canvasErr) {
                    console.error('Failed to embed background image after canvas conversion:', canvasErr);
                    return inputPdfBuffer;
                }
            }
        }

        const pages = inputPdfDoc.getPages();
        const pageWidth = pages[0].getWidth();
        const pageHeight = pages[0].getHeight();

        for (let i = 0; i < pages.length; i++) {
            const newPage = outputPdfDoc.addPage([pageWidth, pageHeight]);

            if (backgroundImage) {
                newPage.drawImage(backgroundImage, {
                    x: 0,
                    y: 0,
                    width: pageWidth,
                    height: pageHeight,
                });
            }

            const [copiedPage] = await outputPdfDoc.embedPages([inputPdfDoc.getPages()[i]]);
            if (!copiedPage) {
                console.error(`Failed to copy page at index ${i}`);
                return null;
            }

            newPage.drawPage(copiedPage, {
                x: 0,
                y: 0,
                width: pageWidth,
                height: pageHeight,
            });
        }

        return await outputPdfDoc.save();
    } catch (error) {
        console.error('Error adding background to offline PDF:', error);
        return null;
    }
};

const offlinePdfGeneratorController = async ({
    pdfformat, layerone, showInvest, BoldRow, HLinred, HighLow, RowSpacing,
    selectedFontSize, selectedFontFamily, hideCategories, hideTableHeadings, reportId, htmlContent,
    cssContent, header, footer, backgroundImageUrl, disableBackgroundImage, checkBox, headermargin, footermargin, marginRight,
    marginLeft, investigationmargin, LeftsignPd, Rightsignpd, res
}) => {
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

    const shouldDisableBackground = Boolean(disableBackgroundImage || checkBox);
    const effectiveBgUrl = shouldDisableBackground ? "" : (backgroundImageUrl || "");

    try {
        const browser = await launchPdfBrowser();
        const page = await browser.newPage();
        let cleanupPageContent = async () => { };

        try {
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
                backgroundImageUrl: effectiveBgUrl,
                disableBackgroundImage: shouldDisableBackground,
                checkBox,
            });

            cleanupPageContent = await renderOfflineHtmlOnPage(page, contentWithCssAndImage);

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

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                displayHeaderFooter: true,
                headerTemplate: offlineHeaderTemplate,
                footerTemplate: offlineFooterTemplate,
                margin: {
                    top: `${headermarginPx + (format3 ? ((investigationmargin * 1.10) + (layerone ? (investigationmargin < 110 ? 75 : 15) : (investigationmargin < 160 ? 55 : 0))) : ((investigationmargin * 0.90) + (layerone ? 10 : 0)))}px`,
                    bottom: '175px',
                    left: '10px',
                    right: '10px',
                },
            });

            const finalPdfBuffer = await addBackgroundToPdf(pdfBuffer, effectiveBgUrl);

            if (!finalPdfBuffer) {
                console.error('Final PDF buffer is null');
                res.status(500).send('Failed to generate final PDF');
                return;
            }

            const finalpdfbufferwithmargin = await adjustPdfMargins(finalPdfBuffer, marginRightPx, marginLeftPx);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="offline_report.pdf"');
            res.setHeader('Content-Length', finalpdfbufferwithmargin.length);
            res.end(finalpdfbufferwithmargin);
        } finally {
            await cleanupPageContent().catch(() => { });
            await browser.close().catch(() => { });
        }
    } catch (error) {
        console.error('Error generating offline PDF:', {
            message: error?.message || String(error),
            stack: error?.stack || '',
            reportId,
        });
        res.status(500).send('Error generating offline PDF');
    }
};

export { offlinePdfGeneratorController };
