import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { customization } from '../models/printsetting.model.js';
import { invoices } from '../models/invoicepdf.model.js';
import { certificates } from '../models/certificate.model.js';
import { defaultpdfsetting } from '../models/defaultpdfsettings.model.js';
import { doctorsign } from '../models/labinchargesign.model.js';
import { Template } from '../models/template.model.js';
import {
    convertImageToPngBuffer,
    loadOfflineHtmlIntoPage,
    readAssetAsBuffer,
    rewriteHtmlForOfflinePdf,
    sanitizePdfCss,
    sanitizePdfMarkup,
} from '../utils/pdfOfflineAssets.js';
import { doesLocalFileExist, normalizeStoredUploadUrl } from '../utils/localStorage.js';
import { getPuppeteerLaunchOptions } from '../utils/puppeteerRuntime.js';
import { generateFormat5PdfBuffer } from './reportFormat5Pdf.controller.js';
import {
    buildLegacyAbnormalHighlightCss,
    normalizeLegacyPdfBodyHtml,
} from '../utils/pdfAbnormalHighlight.js';
import {
    generateFormat1PagePdf,
    isReportFormat1,
} from '../utils/pdfFormat1Helpers.js';
import {
    applySignatureLayoutToFooterHtml,
    resolveEffectiveSignatureLayout,
} from '../utils/pdfSignatureLayout.js';
import {
    computeSignatureStageHeightPx,
    normalizeSignatureLayout,
} from '../../public/js/signatureLayoutEngine.mjs';

// second try=====================================================================

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
        logContext: 'final-pdf-render',
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

const DEFAULT_PDF_PREFERENCES = Object.freeze({
    headermargin: "2.8",
    footermargin: "1",
    marginRight: "0",
    marginLeft: "0",
    LeftsignPd: "0",
    Rightsignpd: "0",
    investigationmargin: 40,
    showInvest: true,
    BoldRow: true,
    HLinred: true,
    HighLow: true,
    RowSpacing: 7,
    selectedFontSize: 12,
    selectedFontFamily: DEFAULT_PDF_FONT_FAMILY,
    hideCategories: false,
    hideTableHeadings: false,
});

const DEFAULT_FORMAT5_PREFERENCES = Object.freeze({
    BoldRow: true,
    HLinred: true,
    HighLow: true,
    RowSpacing: 1,
    selectedFontSize: 10.5,
    showInvest: true,
});

const resolveNumericPref = (...vals) => {
    for (const v of vals) {
        if (v !== undefined && v !== null && v !== "") {
            const parsed = Number(v);
            if (Number.isFinite(parsed)) return parsed;
        }
    }
    return undefined;
};

const resolveFormatAwarePreferences = ({
    pdfformat,
    reqBody = {},
    gettingcustomization = null,
    defaultpdfsetting = null,
    doctorsignDoc = null,
}) => {
    const resolvedSignatureLayout = resolveEffectiveSignatureLayout({
        reqBody,
        doctorsignDoc,
        defaultpdfsetting,
        customizationDoc: gettingcustomization,
    });
    const isFormat5 = pdfformat === "reportFormat5";
    const explicitUserSaved = Boolean(
        reqBody.explicitPrintSettingsSave ||
        reqBody.persistCustomization ||
        gettingcustomization?.hasUserSavedPrintSettings ||
        defaultpdfsetting?.hasUserSavedPrintSettings
    );

    if (isFormat5) {
        return {
            showInvest: true,
            BoldRow: explicitUserSaved
                ? (reqBody.BoldRow ?? gettingcustomization?.BoldRow ?? defaultpdfsetting?.BoldRow ?? DEFAULT_FORMAT5_PREFERENCES.BoldRow)
                : (reqBody.BoldRow ?? DEFAULT_FORMAT5_PREFERENCES.BoldRow),
            HLinred: explicitUserSaved
                ? (reqBody.HLinred ?? gettingcustomization?.HLinred ?? defaultpdfsetting?.HLinred ?? DEFAULT_FORMAT5_PREFERENCES.HLinred)
                : (reqBody.HLinred ?? DEFAULT_FORMAT5_PREFERENCES.HLinred),
            HighLow: explicitUserSaved
                ? (reqBody.HighLow ?? gettingcustomization?.HighLow ?? defaultpdfsetting?.HighLow ?? DEFAULT_FORMAT5_PREFERENCES.HighLow)
                : (reqBody.HighLow ?? DEFAULT_FORMAT5_PREFERENCES.HighLow),
            RowSpacing: resolveNumericPref(
                reqBody.RowSpacing,
                explicitUserSaved ? gettingcustomization?.RowSpacing : undefined,
                explicitUserSaved ? defaultpdfsetting?.RowSpacing : undefined,
                DEFAULT_FORMAT5_PREFERENCES.RowSpacing
            ),
            selectedFontSize: resolveNumericPref(
                reqBody.selectedFontSize,
                explicitUserSaved ? gettingcustomization?.selectedFontSize : undefined,
                explicitUserSaved ? defaultpdfsetting?.selectedFontSize : undefined,
                DEFAULT_FORMAT5_PREFERENCES.selectedFontSize
            ),
            selectedFontFamily:
                reqBody.selectedFontFamily ||
                gettingcustomization?.selectedFontFamily ||
                defaultpdfsetting?.selectedFontFamily ||
                DEFAULT_PDF_FONT_FAMILY,
            hideCategories:
                reqBody.hideCategories ??
                gettingcustomization?.hideCategories ??
                defaultpdfsetting?.hideCategories ??
                DEFAULT_PDF_PREFERENCES.hideCategories,
            hideTableHeadings:
                reqBody.hideTableHeadings ??
                gettingcustomization?.hideTableHeadings ??
                defaultpdfsetting?.hideTableHeadings ??
                DEFAULT_PDF_PREFERENCES.hideTableHeadings,
            headermargin:
                reqBody.headermargin ??
                gettingcustomization?.headermargin ??
                defaultpdfsetting?.headermargin ??
                DEFAULT_PDF_PREFERENCES.headermargin,
            footermargin:
                reqBody.footermargin ??
                gettingcustomization?.footermargin ??
                defaultpdfsetting?.footermargin ??
                DEFAULT_PDF_PREFERENCES.footermargin,
            marginRight:
                reqBody.marginRight ??
                gettingcustomization?.marginRight ??
                defaultpdfsetting?.marginRight ??
                DEFAULT_PDF_PREFERENCES.marginRight,
            marginLeft:
                reqBody.marginLeft ??
                gettingcustomization?.marginLeft ??
                defaultpdfsetting?.marginLeft ??
                DEFAULT_PDF_PREFERENCES.marginLeft,
            LeftsignPd:
                reqBody.LeftsignPd ??
                gettingcustomization?.LeftsignPd ??
                defaultpdfsetting?.LeftsignPd ??
                DEFAULT_PDF_PREFERENCES.LeftsignPd,
            Rightsignpd:
                reqBody.Rightsignpd ??
                gettingcustomization?.Rightsignpd ??
                defaultpdfsetting?.Rightsignpd ??
                DEFAULT_PDF_PREFERENCES.Rightsignpd,
            investigationmargin: resolveNumericPref(
                reqBody.investigationmargin,
                gettingcustomization?.investigationmargin,
                defaultpdfsetting?.investigationmargin,
                DEFAULT_PDF_PREFERENCES.investigationmargin
            ),
            signatureLayout: resolvedSignatureLayout,
        };
    }

    const isExplicitInvestSetting = Boolean(
        reqBody.showInvestExplicit
        || reqBody.explicitPrintSettingsSave
        || reqBody.persistCustomization
        || defaultpdfsetting?.showInvestExplicit
        || gettingcustomization?.showInvestExplicit
    );

    return {
        showInvest: reqBody.showInvest !== undefined
            ? reqBody.showInvest
            : (isExplicitInvestSetting
                ? (defaultpdfsetting?.showInvest ?? gettingcustomization?.showInvest ?? DEFAULT_PDF_PREFERENCES.showInvest)
                : DEFAULT_PDF_PREFERENCES.showInvest),
        showInvestExplicit: isExplicitInvestSetting,
        BoldRow: explicitUserSaved
            ? (reqBody.BoldRow ?? defaultpdfsetting?.BoldRow ?? gettingcustomization?.BoldRow ?? DEFAULT_PDF_PREFERENCES.BoldRow)
            : (reqBody.BoldRow ?? DEFAULT_PDF_PREFERENCES.BoldRow),
        HLinred: explicitUserSaved
            ? (reqBody.HLinred ?? defaultpdfsetting?.HLinred ?? gettingcustomization?.HLinred ?? DEFAULT_PDF_PREFERENCES.HLinred)
            : (reqBody.HLinred ?? DEFAULT_PDF_PREFERENCES.HLinred),
        HighLow: explicitUserSaved
            ? (reqBody.HighLow ?? defaultpdfsetting?.HighLow ?? gettingcustomization?.HighLow ?? DEFAULT_PDF_PREFERENCES.HighLow)
            : (reqBody.HighLow ?? DEFAULT_PDF_PREFERENCES.HighLow),
        RowSpacing: resolveNumericPref(reqBody.RowSpacing, defaultpdfsetting?.RowSpacing, gettingcustomization?.RowSpacing, DEFAULT_PDF_PREFERENCES.RowSpacing),
        selectedFontSize: resolveNumericPref(reqBody.selectedFontSize, defaultpdfsetting?.selectedFontSize, gettingcustomization?.selectedFontSize, DEFAULT_PDF_PREFERENCES.selectedFontSize),
        selectedFontFamily: reqBody.selectedFontFamily || defaultpdfsetting?.selectedFontFamily || gettingcustomization?.selectedFontFamily || DEFAULT_PDF_FONT_FAMILY,
        hideCategories: defaultpdfsetting?.hideCategories ?? gettingcustomization?.hideCategories ?? DEFAULT_PDF_PREFERENCES.hideCategories,
        hideTableHeadings: defaultpdfsetting?.hideTableHeadings ?? gettingcustomization?.hideTableHeadings ?? DEFAULT_PDF_PREFERENCES.hideTableHeadings,
        headermargin: defaultpdfsetting?.headermargin || gettingcustomization?.headermargin || DEFAULT_PDF_PREFERENCES.headermargin,
        footermargin: defaultpdfsetting?.footermargin || gettingcustomization?.footermargin || DEFAULT_PDF_PREFERENCES.footermargin,
        marginRight: defaultpdfsetting?.marginRight || gettingcustomization?.marginRight || DEFAULT_PDF_PREFERENCES.marginRight,
        marginLeft: defaultpdfsetting?.marginLeft || gettingcustomization?.marginLeft || DEFAULT_PDF_PREFERENCES.marginLeft,
        LeftsignPd: defaultpdfsetting?.LeftsignPd ?? gettingcustomization?.LeftsignPd ?? DEFAULT_PDF_PREFERENCES.LeftsignPd,
        Rightsignpd: defaultpdfsetting?.Rightsignpd ?? gettingcustomization?.Rightsignpd ?? DEFAULT_PDF_PREFERENCES.Rightsignpd,
        investigationmargin: resolveNumericPref(defaultpdfsetting?.investigationmargin, gettingcustomization?.investigationmargin, DEFAULT_PDF_PREFERENCES.investigationmargin),
        signatureLayout: resolvedSignatureLayout,
    };
};

const resolvePdfFontStack = (selectedFontFamily) => {
    const normalizedFontFamily = String(selectedFontFamily || "").trim();
    return PDF_FONT_STACKS[normalizedFontFamily] || PDF_FONT_STACKS[DEFAULT_PDF_FONT_FAMILY];
};

const buildPdfBodyDocument = ({
    cssContent,
    htmlContent,
    header = "",
    selectedFontSize,
    selectedFontFamily,
    RowSpacing,
    HighLow = true,
    HLinred = true,
    BoldRow = true,
    hideCategories,
    hideTableHeadings,
}) => {
    const safeCss = sanitizePdfCss(cssContent);
    const highLowResolved = HighLow !== undefined ? Boolean(HighLow) : true;
    const hlInRedResolved = HLinred !== undefined ? Boolean(HLinred) : true;
    const boldRowResolved = BoldRow !== undefined ? Boolean(BoldRow) : true;
    const safeMarkup = normalizeLegacyPdfBodyHtml({
        htmlContent: sanitizePdfMarkup(htmlContent),
        header,
        HighLow: highLowResolved,
        HLinred: hlInRedResolved,
        BoldRow: boldRowResolved,
    });
    const fontSize = parseNumericValue(selectedFontSize, 12);
    const rowSpacing = parseNumericValue(RowSpacing, 7) / 2;
    const fontStack = resolvePdfFontStack(selectedFontFamily);
    const categoryDisplay = hideCategories ? 'none' : 'block';
    const abnormalHighlightCss = buildLegacyAbnormalHighlightCss({
        HighLow: highLowResolved,
        HLinred: hlInRedResolved,
        BoldRow: boldRowResolved,
    });

    return [
        '<!DOCTYPE html>',
        '<html>',
        '<head>',
        '<meta charset="utf-8" />',
        '<style>',
        '*{margin:0;padding:0;box-sizing:border-box;}',
        safeCss,
        '.wrong i, .delete-btn i { display: none; }',
        'h2 { margin: 0 !important; padding: 0 !important; }',
        '.headings { margin-top: 0 !important; margin-bottom: 0 !important; text-align: center !important; width: 100% !important; }',
        `html, body, body * { font-family: ${fontStack} !important; }`,
        `.middle { font-size: ${fontSize}px !important; }`,
        `.middle td, .middle th, .middle p, .middle span, .middle div, .middle li, .middle label, .middle small, .middle strong, .middle b, .middle em, .middle a { font-size: ${fontSize}px !important; }`,
        `td { padding-top: ${rowSpacing}px !important; padding-bottom: ${rowSpacing}px !important; }`,
        `.headings > h3, .headings > .category-heading, .headings h3, .category-heading { display: ${categoryDisplay} !important; text-align: center !important; width: 100% !important; margin: 0 auto !important; }`,
        `.headings > h4, .headings > .table-heading, .headings h4, .table-heading { display: ${hideTableHeadings ? 'none' : 'block'} !important; text-align: center !important; width: 100% !important; margin: 0 auto !important; }`,
        abnormalHighlightCss,
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
    signatureLayout = null,
    showlab,
    showdoctorfirst,
    showdoctorsecond,
}) => {
    const safeCss = sanitizePdfCss(cssContent);
    const safeFooter = sanitizePdfMarkup(footer);
    const leftPadding = parseNumericValue(LeftsignPd, 0);
    const rightPadding = parseNumericValue(Rightsignpd, 0);
    const fontSize = parseNumericValue(selectedFontSize, 12);
    const fontStack = resolvePdfFontStack(selectedFontFamily);
    const sigResult = applySignatureLayoutToFooterHtml({
        rawFooterHtml: safeFooter,
        signatureLayout,
        baseFontSizePx: fontSize,
        isFormat5: false,
        showLab: showlab,
        showDoc1: showdoctorfirst,
        showDoc2: showdoctorsecond,
    });
    const resolvedFooter = sigResult.footerHtml || safeFooter;

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
        sigResult.layoutCss || '',
        '</style>',
        '</head>',
        '<body>',
        '<div class="pdf-footer-div">',
        resolvedFooter,
        '</div>',
        '</body>',
        '</html>',
    ].join('\n'));
};

const hasReadableBackgroundAsset = async (assetReference) => {
    const normalizedAssetReference = normalizeStoredUploadUrl(assetReference) || assetReference;
    if (!normalizedAssetReference) {
        return false;
    }

    if (!/^https?:\/\//i.test(String(normalizedAssetReference).trim())) {
        return doesLocalFileExist(normalizedAssetReference);
    }

    try {
        const backgroundAsset = await readAssetAsBuffer(normalizedAssetReference);
        return Boolean(backgroundAsset?.buffer);
    } catch {
        return false;
    }
};

const resolveUsableBackgroundImageUrl = async (tenantId, preferredUrl) => {
    const normalizedPreferredUrl = normalizeStoredUploadUrl(preferredUrl);
    if (normalizedPreferredUrl && await hasReadableBackgroundAsset(normalizedPreferredUrl)) {
        return normalizedPreferredUrl;
    }

    if (!tenantId) {
        return "";
    }

    const templateDocs = await Template.find({ tenantId }).sort({ _id: -1 }).lean();
    for (const templateDoc of templateDocs) {
        const normalizedTemplateUrl = normalizeStoredUploadUrl(templateDoc.template);
        const normalizedPublicId = normalizedTemplateUrl
            ? normalizedTemplateUrl.replace(/^\/uploads\//, "")
            : String(templateDoc.public_id || "").trim().replace(/^\/?uploads\//, "");

        if (normalizedTemplateUrl && await hasReadableBackgroundAsset(normalizedPublicId || normalizedTemplateUrl)) {
            return normalizedTemplateUrl;
        }
    }

    return "";
};

const adjustPdfMargins = async (pdfBuffer, marginRight, marginLeft) => {
    // Parse margins with default value
    marginRight = marginRight || 0;
    marginLeft = marginLeft || 0;


    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();

    for (const page of pages) {
        const { width, height } = page.getSize();

        // Calculate the new dimensions
        const newWidth = width - marginLeft - marginRight;
        const scaleFactor = newWidth / width;

        if (newWidth <= 0) {
            throw new Error("Margins are too large for the page width!");
        }

        // Scale content proportionally
        page.scaleContent(scaleFactor, scaleFactor);

        // Translate content to respect margins
        const translateX = marginLeft;
        const translateY = (height - height * scaleFactor) / 2; // Center vertically
        page.translateContent(translateX, translateY);

    }

    // Save the adjusted PDF
    const modifiedPdfBuffer = await pdfDoc.save();
    return modifiedPdfBuffer;
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
            console.warn('Background image could not be resolved, returning the original PDF buffer.');
            return inputPdfBuffer;
        }

        try {
            if (backgroundAsset.mimeType?.includes('png')) {
                backgroundImage = await outputPdfDoc.embedPng(backgroundAsset.buffer);
            } else {
                backgroundImage = await outputPdfDoc.embedJpg(backgroundAsset.buffer);
            }
        } catch (jpgError) {
            try {
                backgroundImage = await outputPdfDoc.embedPng(backgroundAsset.buffer);
            } catch (pngError) {
                console.error('Failed to embed background image:', pngError);
                return inputPdfBuffer;
            }
        }

        const pages = inputPdfDoc.getPages();
        const pageWidth = pages[0].getWidth();
        const pageHeight = pages[0].getHeight();

        for (let i = 0; i < pages.length; i++) {
            const newPage = outputPdfDoc.addPage([pageWidth, pageHeight]);

            // Draw the background image if available
            if (backgroundImage) {
                newPage.drawImage(backgroundImage, {
                    x: 0,
                    y: 0,
                    width: pageWidth,
                    height: pageHeight,
                });
            }

            // Copy the current page from the input PDF
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

        const pdfBytes = await outputPdfDoc.save();
        return pdfBytes;
    } catch (error) {
        console.error('Error adding background to PDF:', error);
        return null;
    }
};

const pdfgeneratorcontroller2 = async ({ pdfformat, layerone, showInvest, showInvestExplicit = false, BoldRow, HLinred, HighLow, RowSpacing,
    selectedFontSize, selectedFontFamily, hideCategories, hideTableHeadings, reportId, htmlContent,
    cssContent, header, footer, backgroundImageUrl, headermargin, footermargin, marginRight,
    marginLeft, investigationmargin, showlab, showdoctorfirst,
    showdoctorsecond, fileInputLab, fileInputDoctorleft, fileInputDoctorright, fileInputLabtext,
    fileInputDoctorlefttext, fileInputDoctorrighttext, LeftsignPd, Rightsignpd, signatureLayout = null, explicitPrintSettingsSave = false, skipCustomizationSave = false, isSelectivePrint = false, res }) => {

    const rawInvestigationMargin = investigationmargin;
    investigationmargin = parseNumericValue(investigationmargin, 40) + 20;

    const format3 = pdfformat === "reportFormat3" ? true : false;

    const cmToPx = (cm) => cm * 37.795;

    let headermarginPx = 0;
    let footermarginPx = 0;
    let marginRightPx = 0;
    let marginLeftPx = 0;

    // Conversion from cm to px
    if (marginRight || marginLeft) {
        marginRightPx = cmToPx(parseNumericValue(marginRight, 0));
        marginLeftPx = cmToPx(parseNumericValue(marginLeft, 0));
    }

    headermarginPx = cmToPx(parseNumericValue(headermargin, 2.8));
    footermarginPx = cmToPx(parseNumericValue(footermargin, 1));

    try {
        let browser = null;
        let cleanupPageContent = async () => { };

        try {
            let finalpdfbufferwithmargin;

            if (pdfformat === "reportFormat5") {
                finalpdfbufferwithmargin = await generateFormat5PdfBuffer({
                    htmlContent,
                    cssContent,
                    header,
                    footer,
                    backgroundImageUrl,
                    headermargin,
                    footermargin,
                    marginRight,
                    marginLeft,
                    investigationmargin: rawInvestigationMargin,
                    LeftsignPd,
                    Rightsignpd,
                    selectedFontSize,
                    selectedFontFamily,
                    RowSpacing,
                    HighLow,
                    HLinred,
                    BoldRow,
                    showInvest,
                    hideCategories,
                    hideTableHeadings,
                    showlab,
                    showdoctorfirst,
                    showdoctorsecond,
                    fileInputLab,
                    fileInputDoctorleft,
                    fileInputDoctorright,
                    fileInputLabtext,
                    fileInputDoctorlefttext,
                    fileInputDoctorrighttext,
                    layerone,
                    signatureLayout,
                }, {
                    launchPdfBrowser,
                    addBackgroundToPdf,
                });
            } else {
                browser = await launchPdfBrowser();
                const page = await browser.newPage();

                const useFormat1Engine = isReportFormat1({
                    pdfformat,
                    format3,
                    header,
                    htmlContent,
                    cssContent,
                });

                let pdfBuffer;
                if (useFormat1Engine) {
                    pdfBuffer = await generateFormat1PagePdf({
                        page,
                        htmlContent,
                        cssContent,
                        header,
                        footer,
                        selectedFontSize,
                        selectedFontFamily,
                        RowSpacing,
                        HighLow,
                        HLinred,
                        BoldRow,
                        hideCategories,
                        hideTableHeadings,
                        headermargin,
                        footermarginPx,
                        LeftsignPd,
                        Rightsignpd,
                        showInvest,
                        layerone,
                        omitBackground: false,
                        signatureLayout,
                        showlab,
                        showdoctorfirst,
                        showdoctorsecond,
                    });
                } else {
                    const contentWithCssAndImage = buildPdfBodyDocument({
                        cssContent,
                        htmlContent,
                        header,
                        selectedFontSize,
                        selectedFontFamily,
                        RowSpacing,
                        HighLow,
                        HLinred,
                        BoldRow,
                        hideCategories,
                        hideTableHeadings,
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
                        signatureLayout,
                        showlab,
                        showdoctorfirst,
                        showdoctorsecond,
                    });

                    const normalizedSig = normalizeSignatureLayout(signatureLayout);
                    const dynamicBottomPx = normalizedSig.isCustom
                        ? Math.max(175, computeSignatureStageHeightPx(normalizedSig, {
                            lab: showlab !== false,
                            doc1: showdoctorfirst !== false,
                            doc2: showdoctorsecond !== false,
                        }) + footermarginPx + 45)
                        : 175;

                    pdfBuffer = await page.pdf({
                        format: 'A4',
                        printBackground: true,
                        displayHeaderFooter: true,
                        headerTemplate: offlineHeaderTemplate,
                        footerTemplate: offlineFooterTemplate,
                        margin: {
                            top: `${headermarginPx + (format3 ? ((investigationmargin * 1.10) + (layerone ? (investigationmargin < 110 ? 75 : 15) : (investigationmargin < 160 ? 55 : 0))) : ((investigationmargin * 0.90) + (layerone ? 10 : 0)))}px`,
                            bottom: `${dynamicBottomPx}px`,
                            left: '10px',
                            right: '10px',
                        },
                    });
                }

                const finalPdfBuffer = await addBackgroundToPdf(pdfBuffer, backgroundImageUrl);

                if (!finalPdfBuffer) {
                    console.error('Final PDF buffer is null');
                    res.status(500).send('Failed to generate final PDF');
                    return;
                }

                finalpdfbufferwithmargin = await adjustPdfMargins(finalPdfBuffer, marginRightPx, marginLeftPx);
            }

            const shouldSkipCustomizationSave = Boolean(skipCustomizationSave || isSelectivePrint);

            if (!shouldSkipCustomizationSave) {
                // Dynamically build the update object
                const updateData = {
                    showInvest: showInvest,
                    showInvestExplicit: Boolean(explicitPrintSettingsSave || showInvestExplicit),
                    BoldRow: BoldRow,
                    HLinred: HLinred,
                    HighLow: HighLow,
                    RowSpacing: parseNumericValue(RowSpacing, pdfformat === "reportFormat5" ? 1 : 7),
                    selectedFontSize: parseNumericValue(selectedFontSize, pdfformat === "reportFormat5" ? 10.5 : 12),
                    selectedFontFamily: selectedFontFamily || DEFAULT_PDF_FONT_FAMILY,
                    hideCategories: Boolean(hideCategories),
                    hideTableHeadings: Boolean(hideTableHeadings),
                    reportId: reportId,
                    htmlContent: htmlContent,
                    cssContent: cssContent,
                    header: header,
                    footer: footer,
                    headermargin: headermargin,
                    footermargin: footermargin,
                    marginRight: marginRight,
                    marginLeft: marginLeft,
                    LeftsignPd: LeftsignPd,
                    Rightsignpd: Rightsignpd,
                    investigationmargin: investigationmargin,
                    showlab: showlab,
                    showdoctorfirst: showdoctorfirst,
                    showdoctorsecond: showdoctorsecond,
                    fileInputLab: fileInputLab,
                    fileInputDoctorleft: fileInputDoctorleft,
                    fileInputDoctorright: fileInputDoctorright,
                    fileInputLabtext: fileInputLabtext,
                    fileInputDoctorlefttext: fileInputDoctorlefttext,
                    fileInputDoctorrighttext: fileInputDoctorrighttext,
                    ...(signatureLayout !== undefined && signatureLayout !== null
                        ? { signatureLayout: normalizeSignatureLayout(signatureLayout) }
                        : {}),
                    updatedAt: new Date()
                };

                if (explicitPrintSettingsSave) {
                    updateData.hasUserSavedPrintSettings = true;
                    updateData.showInvestExplicit = true;
                }

                // Add backgroundImageUrl to the update object only if it is not empty
                if (backgroundImageUrl) {
                    updateData.backgroundImageUrl = normalizeStoredUploadUrl(backgroundImageUrl) || backgroundImageUrl;
                }

                // Save the path to the database
                await customization.findOneAndUpdate(
                    { reportId: reportId },
                    updateData,
                    {
                        new: true,
                        upsert: true,
                    }
                );
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="final_report.pdf"');
            res.setHeader('Content-Length', finalpdfbufferwithmargin.length);
            res.end(finalpdfbufferwithmargin);
        } finally {
            await cleanupPageContent().catch(() => { });
            if (browser) {
                await browser.close().catch(() => { });
            }
        }

    } catch (error) {
        console.error('Error generating final PDF:', {
            message: error?.message || String(error),
            stack: error?.stack || '',
            reportId,
        });
        res.status(500).send('Error generating final PDF');
    }
}

const getpdfcontroller = async (req, res) => {

    const { value1, reportId, checkBox, disableBackgroundImage, htmlContent, cssContent, header, footer, backgroundImageUrl,
        headermargin, footermargin, marginRight, marginLeft, selectedFontSize, RowSpacing, HighLow,
        selectedFontFamily, hideCategories, hideTableHeadings, HLinred, BoldRow, showInvest, DownloadPdf, investigationmargin, showlab, showdoctorfirst,
        showdoctorsecond, fileInputLab, fileInputDoctorleft, fileInputDoctorright, fileInputLabtext,
        fileInputDoctorlefttext, fileInputDoctorrighttext, bookingId, LeftsignPd, Rightsignpd } = req.body;

    const effectiveReportId = String(value1 || reportId || "").trim();
    if (!effectiveReportId) {
        return res.status(400).json({ message: 'Report ID (value1/reportId) is required to generate PDF' });
    }

    const requestedFormat = String(req.body.pdfformat || req.body.pdfFormat || "").trim();
    const tid = req.user.tenantId._id;
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }

    const assignedFormat = req.user.role === "admin"
        ? req.user.pdfFormat
        : (req.user.createdBy?.pdfFormat || req.user.tenantId?.adminDetails?.userId?.pdfFormat || req.user.pdfFormat);
    const pdfformat = requestedFormat === "reportFormat5"
        ? "reportFormat5"
        : (assignedFormat || requestedFormat || "reportFormat1");

    try {
        // Attempt to fetch data from the database
        const [gettingcustomization, doctorsignDoc] = await Promise.all([
            customization.findOne({ reportId: effectiveReportId }),
            doctorsign.findOne({ tenantId: tid }).select('signatureLayout').lean(),
        ]);
        const explicitPrintSettingsSave = Boolean(
            req.body.persistCustomization || req.body.explicitPrintSettingsSave
        );
        const isSelectivePrintRequest = Boolean(
            req.body.skipCustomizationSave || req.body.isSelectivePrint
        );
        const shouldPersistDefaultSettings =
            !isSelectivePrintRequest && (pdfformat !== "reportFormat5" || explicitPrintSettingsSave);

        const defaultSettingDoc = shouldPersistDefaultSettings
            ? await saveOrUpdatePdfSetting({
                tenantId: tid,
                createdBy: userId,
                headermargin,
                footermargin,
                marginRight,
                marginLeft,
                investigationmargin,
                showInvest,
                BoldRow,
                HLinred,
                HighLow,
                RowSpacing,
                selectedFontSize,
                selectedFontFamily,
                hideCategories,
                hideTableHeadings,
                LeftsignPd,
                Rightsignpd,
                ...(req.body.signatureLayout !== undefined
                    ? { signatureLayout: req.body.signatureLayout ? normalizeSignatureLayout(req.body.signatureLayout) : null }
                    : {}),
                hasUserSavedPrintSettings: explicitPrintSettingsSave ? true : undefined,
                showInvestExplicit: explicitPrintSettingsSave ? true : undefined,
            })
            : await saveOrUpdatePdfSetting({ tenantId: tid, createdBy: userId });

        const resolvedPrefs = resolveFormatAwarePreferences({
            pdfformat,
            reqBody: req.body,
            gettingcustomization,
            defaultpdfsetting: defaultSettingDoc,
            doctorsignDoc,
        });

        const mergedValues = {
            pdfformat,
            ...resolvedPrefs,
            reportId: effectiveReportId,
            bookingId: bookingId || gettingcustomization?.bookingId || "",
            htmlContent: htmlContent || gettingcustomization?.htmlContent || "",
            cssContent: cssContent || gettingcustomization?.cssContent || "",
            header: header || gettingcustomization?.header || "",
            footer: footer || gettingcustomization?.footer || "",
            backgroundImageUrl: (checkBox || DownloadPdf) ? "" : (backgroundImageUrl || gettingcustomization?.backgroundImageUrl || ""),
            showlab: showlab ?? gettingcustomization?.showlab ?? false,
            showdoctorfirst: showdoctorfirst ?? gettingcustomization?.showdoctorfirst ?? true,
            showdoctorsecond: showdoctorsecond ?? gettingcustomization?.showdoctorsecond ?? true,
            fileInputLab: fileInputLab || gettingcustomization?.fileInputLab || "",
            fileInputDoctorleft: fileInputDoctorleft || gettingcustomization?.fileInputDoctorleft || "",
            fileInputDoctorright: fileInputDoctorright || gettingcustomization?.fileInputDoctorright || "",
            fileInputLabtext: fileInputLabtext || gettingcustomization?.fileInputLabtext || "",
            fileInputDoctorlefttext: fileInputDoctorlefttext || gettingcustomization?.fileInputDoctorlefttext || "",
            fileInputDoctorrighttext: fileInputDoctorrighttext || gettingcustomization?.fileInputDoctorrighttext || "",
            explicitPrintSettingsSave,
            skipCustomizationSave: isSelectivePrintRequest,
            isSelectivePrint: isSelectivePrintRequest,
            res
        };

        if (req.user.tenantId.modelType === "1layer") {
            mergedValues.layerone = true;
            if (!["reportFormat1", "reportFormat5"].includes(pdfformat)) {
                mergedValues.showInvest = false;
            } else if (!mergedValues.showInvestExplicit && req.body.showInvest === undefined) {
                mergedValues.showInvest = true;
            }
        }

        const shouldDisableResolvedBackground = Boolean(disableBackgroundImage || checkBox);
        mergedValues.backgroundImageUrl = shouldDisableResolvedBackground
            ? ""
            : await resolveUsableBackgroundImageUrl(
                tid,
                mergedValues.backgroundImageUrl
            );

        // Generate the PDF with merged values
        await pdfgeneratorcontroller2(mergedValues);

    } catch (error) {
        console.error('Error fetching PDF:', error.message);
        res.status(500).json({ message: 'Error fetching PDF', error: error.message });
    }
};

const saveOrUpdatePdfSetting = async ({
    tenantId,
    createdBy,
    headermargin,
    footermargin,
    marginRight,
    marginLeft,
    investigationmargin,
    showInvest,
    showInvestExplicit,
    BoldRow,
    HLinred,
    HighLow,
    RowSpacing,
    selectedFontSize,
    selectedFontFamily,
    hideCategories,
    hideTableHeadings,
    LeftsignPd,
    Rightsignpd,
    signatureLayout,
    hasUserSavedPrintSettings
}) => {
    try {


        // tenantId के आधार पर रिकॉर्ड खोजें
        let existingSetting = await defaultpdfsetting.findOne({ tenantId });

        if (!existingSetting) {
            // अगर नहीं मिला तो नया डॉक्यूमेंट बनाएँ
            const newSetting = await defaultpdfsetting.create({
                tenantId,
                createdBy,
                headermargin,
                footermargin,
                marginRight,
                marginLeft,
                investigationmargin,
                showInvest,
                ...(showInvestExplicit !== undefined ? { showInvestExplicit } : {}),
                BoldRow,
                HLinred,
                HighLow,
                RowSpacing,
                selectedFontSize,
                selectedFontFamily,
                hideCategories,
                hideTableHeadings,
                LeftsignPd,
                Rightsignpd,
                ...(signatureLayout !== undefined ? { signatureLayout } : {}),
                ...(hasUserSavedPrintSettings !== undefined ? { hasUserSavedPrintSettings } : {}),
            });

            return newSetting;
        } else {
            // अगर मिला तो सिर्फ बदले हुए फ़ील्ड्स अपडेट करें
            let isChanged = false;

            const fields = {
                headermargin,
                footermargin,
                marginRight,
                marginLeft,
                investigationmargin,
                showInvest,
                showInvestExplicit,
                BoldRow,
                HLinred,
                HighLow,
                RowSpacing,
                selectedFontSize,
                selectedFontFamily,
                hideCategories,
                hideTableHeadings,
                LeftsignPd,
                Rightsignpd,
                signatureLayout,
                hasUserSavedPrintSettings
            };

            for (let key in fields) {
                if (fields[key] !== undefined) {
                    const prevVal = existingSetting[key];
                    const nextVal = fields[key];
                    const isDiff = (nextVal && typeof nextVal === 'object') || (prevVal && typeof prevVal === 'object')
                        ? JSON.stringify(prevVal ?? null) !== JSON.stringify(nextVal ?? null)
                        : nextVal !== prevVal;
                    if (!(key in existingSetting.toObject()) || isDiff) {
                        existingSetting[key] = nextVal;
                        isChanged = true;
                    }
                }
            }

            if (isChanged) {
                await existingSetting.save();
                return existingSetting;
            } else {
                return existingSetting;
            }
        }
    } catch (error) {
        console.error(error.message);
        throw new Error("Server Error");

    }
};

// Backend API endpoint for merging PDFs
const mergePdfsController = async (req, res) => {
    const { reportIds, checkBox } = req.body;

    if (!reportIds || !Array.isArray(reportIds) || reportIds.length < 2) {
        return res.status(400).json({
            message: 'Please provide at least 2 report IDs to merge'
        });
    }

    try {
        // Create a new PDF document
        const mergedPdf = await PDFDocument.create();

        const doctorsignDoc = await doctorsign.findOne({ tenantId: req.user.tenantId._id }).select('signatureLayout').lean();

        // Loop through each reportId and generate PDF
        for (let reportId of reportIds) {
            try {
                // Fetch customization for this report
                const gettingcustomization = await customization.findOne({ reportId });

                const tid = req.user.tenantId._id;
                let userId;
                if (req.user.role === 'staff') {
                    userId = req.user.parentUser;
                } else {
                    userId = req.user._id;
                }

                const defaultpdfsetting = await saveOrUpdatePdfSetting({
                    tenantId: tid,
                    createdBy: userId,
                });

                const mergedSignatureLayout = resolveEffectiveSignatureLayout({
                    doctorsignDoc,
                    defaultpdfsetting,
                    customizationDoc: gettingcustomization,
                });

                // Prepare merged values
                const mergedValues = {
                    showInvest: defaultpdfsetting?.showInvest ?? gettingcustomization?.showInvest ?? DEFAULT_PDF_PREFERENCES.showInvest,
                    BoldRow: defaultpdfsetting?.BoldRow ?? gettingcustomization?.BoldRow ?? DEFAULT_PDF_PREFERENCES.BoldRow,
                    HLinred: defaultpdfsetting?.HLinred ?? gettingcustomization?.HLinred ?? DEFAULT_PDF_PREFERENCES.HLinred,
                    HighLow: defaultpdfsetting?.HighLow ?? gettingcustomization?.HighLow ?? DEFAULT_PDF_PREFERENCES.HighLow,
                    RowSpacing: defaultpdfsetting?.RowSpacing || gettingcustomization?.RowSpacing || DEFAULT_PDF_PREFERENCES.RowSpacing,
                    selectedFontSize: defaultpdfsetting?.selectedFontSize || gettingcustomization?.selectedFontSize || DEFAULT_PDF_PREFERENCES.selectedFontSize,
                    selectedFontFamily: defaultpdfsetting?.selectedFontFamily || gettingcustomization?.selectedFontFamily || DEFAULT_PDF_PREFERENCES.selectedFontFamily,
                    hideCategories: defaultpdfsetting?.hideCategories ?? gettingcustomization?.hideCategories ?? DEFAULT_PDF_PREFERENCES.hideCategories,
                    hideTableHeadings: defaultpdfsetting?.hideTableHeadings ?? gettingcustomization?.hideTableHeadings ?? DEFAULT_PDF_PREFERENCES.hideTableHeadings,
                    reportId: reportId,
                    htmlContent: gettingcustomization?.htmlContent || "",
                    cssContent: gettingcustomization?.cssContent || "",
                    header: gettingcustomization?.header || "",
                    footer: gettingcustomization?.footer || "",
                    backgroundImageUrl: checkBox ? "" : (gettingcustomization?.backgroundImageUrl || ""),
                    headermargin: defaultpdfsetting?.headermargin || gettingcustomization?.headermargin || DEFAULT_PDF_PREFERENCES.headermargin,
                    footermargin: defaultpdfsetting?.footermargin || gettingcustomization?.footermargin || DEFAULT_PDF_PREFERENCES.footermargin,
                    marginRight: defaultpdfsetting?.marginRight || gettingcustomization?.marginRight || DEFAULT_PDF_PREFERENCES.marginRight,
                    marginLeft: defaultpdfsetting?.marginLeft || gettingcustomization?.marginLeft || DEFAULT_PDF_PREFERENCES.marginLeft,
                    LeftsignPd: defaultpdfsetting?.LeftsignPd ?? gettingcustomization?.LeftsignPd ?? DEFAULT_PDF_PREFERENCES.LeftsignPd,
                    Rightsignpd: defaultpdfsetting?.Rightsignpd ?? gettingcustomization?.Rightsignpd ?? DEFAULT_PDF_PREFERENCES.Rightsignpd,
                    investigationmargin: defaultpdfsetting?.investigationmargin || gettingcustomization?.investigationmargin || DEFAULT_PDF_PREFERENCES.investigationmargin,
                    signatureLayout: mergedSignatureLayout,
                    showlab: gettingcustomization?.showlab ?? false,
                    showdoctorfirst: gettingcustomization?.showdoctorfirst ?? true,
                    showdoctorsecond: gettingcustomization?.showdoctorsecond ?? true,
                    fileInputLab: gettingcustomization?.fileInputLab || "",
                    fileInputDoctorleft: gettingcustomization?.fileInputDoctorleft || "",
                    fileInputDoctorright: gettingcustomization?.fileInputDoctorright || "",
                    fileInputLabtext: gettingcustomization?.fileInputLabtext || "",
                    fileInputDoctorlefttext: gettingcustomization?.fileInputDoctorlefttext || "",
                    fileInputDoctorrighttext: gettingcustomization?.fileInputDoctorrighttext || "",
                };

                // Generate individual PDF buffer
                const pdfBuffer = await generateSinglePdfBuffer(mergedValues, req.user);

                // Load the PDF
                const pdf = await PDFDocument.load(pdfBuffer);

                // Copy all pages from this PDF to the merged PDF
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach((page) => {
                    mergedPdf.addPage(page);
                });

            } catch (error) {
                console.error(`Error processing report ${reportId}:`, error);
                // Continue with other reports even if one fails
            }
        }

        // Save the merged PDF
        const mergedPdfBytes = await mergedPdf.save();

        // Send the merged PDF as response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="merged_reports.pdf"');
        res.setHeader('Content-Length', mergedPdfBytes.length);
        res.end(Buffer.from(mergedPdfBytes));

    } catch (error) {
        console.error('Error merging PDFs:', error);
        res.status(500).json({
            message: 'Error merging PDFs',
            error: error.message
        });
    }
};

// Helper function to generate single PDF buffer
async function generateSinglePdfBuffer(mergedValues, user) {

    let pdfformat;
    if (user.role === "admin") {
        pdfformat = user.pdfFormat;
    } else {
        pdfformat = user.createdBy?.pdfFormat || user.tenantId?.adminDetails?.userId?.pdfFormat || user.pdfFormat;
    }

    const format3 = pdfformat === "reportFormat3" ? true : false;
    const layerone = user.tenantId.modelType === "1layer";

    if (layerone && !["reportFormat1", "reportFormat5"].includes(pdfformat)) {
        mergedValues.showInvest = false;
    }

    if (pdfformat === "reportFormat5") {
        return generateFormat5PdfBuffer({
            ...mergedValues,
            layerone,
        }, {
            launchPdfBrowser,
            addBackgroundToPdf,
        });
    }

    const cmToPx = (cm) => cm * 37.795;

    const headermarginPx = cmToPx(parseNumericValue(mergedValues.headermargin, 2.8));
    const footermarginPx = cmToPx(parseNumericValue(mergedValues.footermargin, 1));
    const marginRightPx = mergedValues.marginRight ? cmToPx(parseNumericValue(mergedValues.marginRight, 0)) : 0;
    const marginLeftPx = mergedValues.marginLeft ? cmToPx(parseNumericValue(mergedValues.marginLeft, 0)) : 0;

    const browser = await launchPdfBrowser();
    const page = await browser.newPage();
    let cleanupPageContent = async () => { };

    try {
        const useFormat1Engine = isReportFormat1({
            pdfformat: pdfformat || mergedValues.pdfformat,
            format3,
            header: mergedValues.header,
            htmlContent: mergedValues.htmlContent,
            cssContent: mergedValues.cssContent,
        });

        let pdfBuffer;
        if (useFormat1Engine) {
            pdfBuffer = await generateFormat1PagePdf({
                page,
                htmlContent: mergedValues.htmlContent,
                cssContent: mergedValues.cssContent,
                header: mergedValues.header,
                footer: mergedValues.footer,
                selectedFontSize: mergedValues.selectedFontSize,
                selectedFontFamily: mergedValues.selectedFontFamily,
                RowSpacing: mergedValues.RowSpacing,
                HighLow: mergedValues.HighLow,
                HLinred: mergedValues.HLinred,
                BoldRow: mergedValues.BoldRow,
                hideCategories: mergedValues.hideCategories,
                hideTableHeadings: mergedValues.hideTableHeadings,
                headermargin: mergedValues.headermargin,
                footermarginPx,
                LeftsignPd: mergedValues.LeftsignPd,
                Rightsignpd: mergedValues.Rightsignpd,
                showInvest: mergedValues.showInvest,
                layerone,
                omitBackground: false,
                signatureLayout: mergedValues.signatureLayout || null,
                showlab: mergedValues.showlab,
                showdoctorfirst: mergedValues.showdoctorfirst,
                showdoctorsecond: mergedValues.showdoctorsecond,
            });
        } else {
            const contentWithCssAndImage = buildPdfBodyDocument({
                cssContent: mergedValues.cssContent,
                htmlContent: mergedValues.htmlContent,
                header: mergedValues.header,
                selectedFontSize: mergedValues.selectedFontSize,
                selectedFontFamily: mergedValues.selectedFontFamily,
                hideCategories: mergedValues.hideCategories,
                hideTableHeadings: mergedValues.hideTableHeadings,
                RowSpacing: mergedValues.RowSpacing,
                HighLow: mergedValues.HighLow,
                HLinred: mergedValues.HLinred,
                BoldRow: mergedValues.BoldRow,
            });

            cleanupPageContent = await renderOfflineHtmlOnPage(page, contentWithCssAndImage);

            const offlineHeaderTemplate = await buildPdfHeaderTemplate({
                format3,
                headermargin: mergedValues.headermargin,
                showInvest: mergedValues.showInvest,
                header: mergedValues.header,
                selectedFontSize: mergedValues.selectedFontSize,
                selectedFontFamily: mergedValues.selectedFontFamily,
            });

            const offlineFooterTemplate = await buildPdfFooterTemplate({
                cssContent: mergedValues.cssContent,
                footer: mergedValues.footer,
                footermarginPx,
                LeftsignPd: mergedValues.LeftsignPd,
                Rightsignpd: mergedValues.Rightsignpd,
                selectedFontSize: mergedValues.selectedFontSize,
                selectedFontFamily: mergedValues.selectedFontFamily,
                signatureLayout: mergedValues.signatureLayout || null,
                showlab: mergedValues.showlab,
                showdoctorfirst: mergedValues.showdoctorfirst,
                showdoctorsecond: mergedValues.showdoctorsecond,
            });

            const normalizedMergedSig = normalizeSignatureLayout(mergedValues.signatureLayout);
            const mergedBottomPx = normalizedMergedSig.isCustom
                ? Math.max(175, computeSignatureStageHeightPx(normalizedMergedSig, {
                    lab: mergedValues.showlab !== false,
                    doc1: mergedValues.showdoctorfirst !== false,
                    doc2: mergedValues.showdoctorsecond !== false,
                }) + footermarginPx + 45)
                : 175;

            pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                displayHeaderFooter: true,
                headerTemplate: offlineHeaderTemplate,
                footerTemplate: offlineFooterTemplate,
                margin: {
                    top: `${headermarginPx + (format3 ? ((mergedValues.investigationmargin * 1.10) + (layerone ? (mergedValues.investigationmargin < 110 ? 75 : 15) : (mergedValues.investigationmargin < 160 ? 55 : 0))) : ((mergedValues.investigationmargin * 0.90) + (layerone ? 10 : 0)))}px`,
                    bottom: `${mergedBottomPx}px`,
                    left: '10px',
                    right: '10px'
                },
            });
        }

        const finalPdfBuffer = await addBackgroundToPdf(pdfBuffer, mergedValues.backgroundImageUrl);
        if (!finalPdfBuffer) {
            throw new Error('Failed to generate the final PDF buffer.');
        }

        return adjustPdfMargins(finalPdfBuffer, marginRightPx, marginLeftPx);
    } finally {
        await cleanupPageContent().catch(() => { });
        await browser.close().catch(() => { });
    }
}


const getpdfcontrolleruser = async (req, res) => {

    const { value1, reportId, checkBox, disableBackgroundImage, htmlContent, cssContent, header, footer, backgroundImageUrl,
        headermargin, footermargin, marginRight, marginLeft, selectedFontSize, RowSpacing, HighLow,
        selectedFontFamily, hideCategories, hideTableHeadings, HLinred, BoldRow, showInvest, DownloadPdf, investigationmargin, showlab, showdoctorfirst,
        showdoctorsecond, fileInputLab, fileInputDoctorleft, fileInputDoctorright, fileInputLabtext,
        fileInputDoctorlefttext, fileInputDoctorrighttext, pdfFormat, pdfformat, layerOne } = req.body;

    const effectiveReportId = String(value1 || reportId || "").trim();
    if (!effectiveReportId) {
        return res.status(400).json({ message: 'Report ID (value1/reportId) is required to generate PDF' });
    }

    try {
        // Attempt to fetch data from the database
        const gettingcustomization = await customization.findOne({ reportId: effectiveReportId });
        const [tenantDefaultSettings, doctorsignDoc] = gettingcustomization?.tenantId
            ? await Promise.all([
                defaultpdfsetting.findOne({ tenantId: gettingcustomization.tenantId }).lean(),
                doctorsign.findOne({ tenantId: gettingcustomization.tenantId }).select('signatureLayout').lean(),
            ])
            : [null, null];
        const resolvedPdfFormat = pdfformat || pdfFormat || gettingcustomization?.pdfformat || gettingcustomization?.pdfFormat || "reportFormat1";
        const isFormat5User = resolvedPdfFormat === "reportFormat5";
        const explicitUserSaved = Boolean(
            gettingcustomization?.hasUserSavedPrintSettings || tenantDefaultSettings?.hasUserSavedPrintSettings
        );
        const explicitInvestChoice = Boolean(
            req.body?.showInvestExplicit
            || gettingcustomization?.showInvestExplicit
            || tenantDefaultSettings?.showInvestExplicit
        );
        const resolvedFormat5Prefs = isFormat5User
            ? resolveFormatAwarePreferences({
                pdfformat: resolvedPdfFormat,
                reqBody: req.body,
                gettingcustomization,
                defaultpdfsetting: tenantDefaultSettings,
                doctorsignDoc,
            })
            : null;
        const userEffectiveSigLayout = resolveEffectiveSignatureLayout({
            reqBody: req.body,
            doctorsignDoc,
            defaultpdfsetting: tenantDefaultSettings,
            customizationDoc: gettingcustomization,
        });

        let mergedValues;

        if (isFormat5User && resolvedFormat5Prefs) {
            mergedValues = {
                pdfformat: resolvedPdfFormat,
                pdfFormat: resolvedPdfFormat,
                ...resolvedFormat5Prefs,
                reportId: effectiveReportId,
                htmlContent: htmlContent || gettingcustomization?.htmlContent || "",
                cssContent: cssContent || gettingcustomization?.cssContent || "",
                header: header || gettingcustomization?.header || "",
                footer: footer || gettingcustomization?.footer || "",
                backgroundImageUrl: (checkBox || DownloadPdf) ? "" : (backgroundImageUrl || gettingcustomization?.backgroundImageUrl || ""),
                showlab: showlab ?? gettingcustomization?.showlab ?? false,
                showdoctorfirst: showdoctorfirst ?? gettingcustomization?.showdoctorfirst ?? true,
                showdoctorsecond: showdoctorsecond ?? gettingcustomization?.showdoctorsecond ?? true,
                fileInputLab: fileInputLab || gettingcustomization?.fileInputLab || "",
                fileInputDoctorleft: fileInputDoctorleft || gettingcustomization?.fileInputDoctorleft || "",
                fileInputDoctorright: fileInputDoctorright || gettingcustomization?.fileInputDoctorright || "",
                fileInputLabtext: fileInputLabtext || gettingcustomization?.fileInputLabtext || "",
                fileInputDoctorlefttext: fileInputDoctorlefttext || gettingcustomization?.fileInputDoctorlefttext || "",
                fileInputDoctorrighttext: fileInputDoctorrighttext || gettingcustomization?.fileInputDoctorrighttext || "",
                explicitPrintSettingsSave: explicitUserSaved,
                res,
            };
        } else if (checkBox || DownloadPdf) {
            // Define fallback logic to prioritize database values first
            mergedValues = {
                pdfformat: resolvedPdfFormat,
                pdfFormat: resolvedPdfFormat,
                showInvest: showInvest !== undefined
                    ? showInvest
                    : (explicitInvestChoice
                        ? (gettingcustomization?.showInvest ?? tenantDefaultSettings?.showInvest ?? DEFAULT_PDF_PREFERENCES.showInvest)
                        : DEFAULT_PDF_PREFERENCES.showInvest),
                showInvestExplicit: explicitInvestChoice,
                BoldRow: explicitUserSaved
                    ? (BoldRow ?? gettingcustomization?.BoldRow ?? tenantDefaultSettings?.BoldRow ?? DEFAULT_PDF_PREFERENCES.BoldRow)
                    : (BoldRow ?? DEFAULT_PDF_PREFERENCES.BoldRow),
                HLinred: explicitUserSaved
                    ? (HLinred ?? gettingcustomization?.HLinred ?? tenantDefaultSettings?.HLinred ?? DEFAULT_PDF_PREFERENCES.HLinred)
                    : (HLinred ?? DEFAULT_PDF_PREFERENCES.HLinred),
                HighLow: explicitUserSaved
                    ? (HighLow ?? gettingcustomization?.HighLow ?? tenantDefaultSettings?.HighLow ?? DEFAULT_PDF_PREFERENCES.HighLow)
                    : (HighLow ?? DEFAULT_PDF_PREFERENCES.HighLow),
                RowSpacing: RowSpacing || gettingcustomization?.RowSpacing || tenantDefaultSettings?.RowSpacing || DEFAULT_PDF_PREFERENCES.RowSpacing,
                selectedFontSize: selectedFontSize || gettingcustomization?.selectedFontSize || tenantDefaultSettings?.selectedFontSize || DEFAULT_PDF_PREFERENCES.selectedFontSize,
                selectedFontFamily: selectedFontFamily || gettingcustomization?.selectedFontFamily || tenantDefaultSettings?.selectedFontFamily || DEFAULT_PDF_PREFERENCES.selectedFontFamily,
                hideCategories: hideCategories ?? gettingcustomization?.hideCategories ?? tenantDefaultSettings?.hideCategories ?? DEFAULT_PDF_PREFERENCES.hideCategories,
                hideTableHeadings: hideTableHeadings ?? gettingcustomization?.hideTableHeadings ?? tenantDefaultSettings?.hideTableHeadings ?? DEFAULT_PDF_PREFERENCES.hideTableHeadings,
                reportId: effectiveReportId,
                htmlContent: htmlContent || gettingcustomization?.htmlContent || "", // Priority: Database > Request > Default
                cssContent: cssContent || gettingcustomization?.cssContent || "",
                header: header || gettingcustomization?.header || "",
                footer: footer || gettingcustomization?.footer || "",
                backgroundImageUrl: "",
                headermargin: headermargin || gettingcustomization?.headermargin || tenantDefaultSettings?.headermargin || DEFAULT_PDF_PREFERENCES.headermargin,
                footermargin: footermargin || gettingcustomization?.footermargin || tenantDefaultSettings?.footermargin || DEFAULT_PDF_PREFERENCES.footermargin,
                marginRight: marginRight || gettingcustomization?.marginRight || tenantDefaultSettings?.marginRight || DEFAULT_PDF_PREFERENCES.marginRight,
                marginLeft: marginLeft || gettingcustomization?.marginLeft || tenantDefaultSettings?.marginLeft || DEFAULT_PDF_PREFERENCES.marginLeft,
                LeftsignPd: gettingcustomization?.LeftsignPd ?? tenantDefaultSettings?.LeftsignPd ?? DEFAULT_PDF_PREFERENCES.LeftsignPd,
                Rightsignpd: gettingcustomization?.Rightsignpd ?? tenantDefaultSettings?.Rightsignpd ?? DEFAULT_PDF_PREFERENCES.Rightsignpd,
                investigationmargin: investigationmargin || gettingcustomization?.investigationmargin || tenantDefaultSettings?.investigationmargin || DEFAULT_PDF_PREFERENCES.investigationmargin,
                showlab: showlab ?? gettingcustomization?.showlab ?? false,
                showdoctorfirst: showdoctorfirst ?? gettingcustomization?.showdoctorfirst ?? true,
                showdoctorsecond: showdoctorsecond ?? gettingcustomization?.showdoctorsecond ?? true,
                fileInputLab: fileInputLab || gettingcustomization?.fileInputLab || "",
                fileInputDoctorleft: fileInputDoctorleft || gettingcustomization?.fileInputDoctorleft || "",
                fileInputDoctorright: fileInputDoctorright || gettingcustomization?.fileInputDoctorright || "",
                fileInputLabtext: fileInputLabtext || gettingcustomization?.fileInputLabtext || "",
                fileInputDoctorlefttext: fileInputDoctorlefttext || gettingcustomization?.fileInputDoctorlefttext || "",
                fileInputDoctorrighttext: fileInputDoctorrighttext || gettingcustomization?.fileInputDoctorrighttext || "",
                signatureLayout: userEffectiveSigLayout,
                res
            };
        } else {
            // Define fallback logic to prioritize database values first
            mergedValues = {
                pdfformat: resolvedPdfFormat,
                pdfFormat: resolvedPdfFormat,
                showInvest: showInvest !== undefined
                    ? showInvest
                    : (explicitInvestChoice
                        ? (gettingcustomization?.showInvest ?? tenantDefaultSettings?.showInvest ?? DEFAULT_PDF_PREFERENCES.showInvest)
                        : DEFAULT_PDF_PREFERENCES.showInvest),
                showInvestExplicit: explicitInvestChoice,
                BoldRow: explicitUserSaved
                    ? (BoldRow ?? gettingcustomization?.BoldRow ?? tenantDefaultSettings?.BoldRow ?? DEFAULT_PDF_PREFERENCES.BoldRow)
                    : (BoldRow ?? DEFAULT_PDF_PREFERENCES.BoldRow),
                HLinred: explicitUserSaved
                    ? (HLinred ?? gettingcustomization?.HLinred ?? tenantDefaultSettings?.HLinred ?? DEFAULT_PDF_PREFERENCES.HLinred)
                    : (HLinred ?? DEFAULT_PDF_PREFERENCES.HLinred),
                HighLow: explicitUserSaved
                    ? (HighLow ?? gettingcustomization?.HighLow ?? tenantDefaultSettings?.HighLow ?? DEFAULT_PDF_PREFERENCES.HighLow)
                    : (HighLow ?? DEFAULT_PDF_PREFERENCES.HighLow),
                RowSpacing: RowSpacing || gettingcustomization?.RowSpacing || tenantDefaultSettings?.RowSpacing || DEFAULT_PDF_PREFERENCES.RowSpacing,
                selectedFontSize: selectedFontSize || gettingcustomization?.selectedFontSize || tenantDefaultSettings?.selectedFontSize || DEFAULT_PDF_PREFERENCES.selectedFontSize,
                selectedFontFamily: selectedFontFamily || gettingcustomization?.selectedFontFamily || tenantDefaultSettings?.selectedFontFamily || DEFAULT_PDF_PREFERENCES.selectedFontFamily,
                hideCategories: hideCategories ?? gettingcustomization?.hideCategories ?? tenantDefaultSettings?.hideCategories ?? DEFAULT_PDF_PREFERENCES.hideCategories,
                hideTableHeadings: hideTableHeadings ?? gettingcustomization?.hideTableHeadings ?? tenantDefaultSettings?.hideTableHeadings ?? DEFAULT_PDF_PREFERENCES.hideTableHeadings,
                reportId: effectiveReportId,
                htmlContent: htmlContent || gettingcustomization?.htmlContent || "", // Priority: Database > Request > Default
                cssContent: cssContent || gettingcustomization?.cssContent || "",
                header: header || gettingcustomization?.header || "",
                footer: footer || gettingcustomization?.footer || "",
                backgroundImageUrl: backgroundImageUrl || gettingcustomization?.backgroundImageUrl || "",
                headermargin: headermargin || gettingcustomization?.headermargin || tenantDefaultSettings?.headermargin || DEFAULT_PDF_PREFERENCES.headermargin,
                footermargin: footermargin || gettingcustomization?.footermargin || tenantDefaultSettings?.footermargin || DEFAULT_PDF_PREFERENCES.footermargin,
                marginRight: marginRight || gettingcustomization?.marginRight || tenantDefaultSettings?.marginRight || DEFAULT_PDF_PREFERENCES.marginRight,
                marginLeft: marginLeft || gettingcustomization?.marginLeft || tenantDefaultSettings?.marginLeft || DEFAULT_PDF_PREFERENCES.marginLeft,
                LeftsignPd: gettingcustomization?.LeftsignPd ?? tenantDefaultSettings?.LeftsignPd ?? DEFAULT_PDF_PREFERENCES.LeftsignPd,
                Rightsignpd: gettingcustomization?.Rightsignpd ?? tenantDefaultSettings?.Rightsignpd ?? DEFAULT_PDF_PREFERENCES.Rightsignpd,
                investigationmargin: investigationmargin || gettingcustomization?.investigationmargin || tenantDefaultSettings?.investigationmargin || DEFAULT_PDF_PREFERENCES.investigationmargin,
                showlab: showlab ?? gettingcustomization?.showlab ?? false,
                showdoctorfirst: showdoctorfirst ?? gettingcustomization?.showdoctorfirst ?? true,
                showdoctorsecond: showdoctorsecond ?? gettingcustomization?.showdoctorsecond ?? true,
                fileInputLab: fileInputLab || gettingcustomization?.fileInputLab || "",
                fileInputDoctorleft: fileInputDoctorleft || gettingcustomization?.fileInputDoctorleft || "",
                fileInputDoctorright: fileInputDoctorright || gettingcustomization?.fileInputDoctorright || "",
                fileInputLabtext: fileInputLabtext || gettingcustomization?.fileInputLabtext || "",
                fileInputDoctorlefttext: fileInputDoctorlefttext || gettingcustomization?.fileInputDoctorlefttext || "",
                fileInputDoctorrighttext: fileInputDoctorrighttext || gettingcustomization?.fileInputDoctorrighttext || "",
                signatureLayout: userEffectiveSigLayout,
                res
            };
        }

        if (layerOne === "1layer") {
            mergedValues.layerone = true;
            if (!["reportFormat1", "reportFormat5"].includes(resolvedPdfFormat)) {
                mergedValues.showInvest = false;
            } else if (!explicitInvestChoice && showInvest === undefined) {
                mergedValues.showInvest = true;
            }
        }

        const shouldDisableResolvedBackground = Boolean(disableBackgroundImage || checkBox);
        mergedValues.backgroundImageUrl = shouldDisableResolvedBackground
            ? ""
            : await resolveUsableBackgroundImageUrl(
                gettingcustomization?.tenantId,
                mergedValues.backgroundImageUrl
            );

        // Generate the PDF with merged values
        await pdfgeneratorcontroller2(mergedValues);

    } catch (error) {
        console.error('Error fetching PDF:', error.message);
        res.status(500).json({ message: 'Error fetching PDF', error: error.message });
    }
};

const savingPdfDatacontroller = async (req, res) => {

    if (req.body?.skipCustomizationSave || req.body?.isSelectivePrint) {
        return res.status(200).json({ skipped: true, reason: "selective_print_non_destructive" });
    }

    const tenantId = req.user.tenantId._id;
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }
    const { reportId, htmlContent, cssContent, header, footer, backgroundImageUrl,
        headermargin, footermargin, investigationmargin, showlab, showdoctorfirst,
        showdoctorsecond, fileInputLab, fileInputDoctorleft, fileInputDoctorright, fileInputLabtext,
        fileInputDoctorlefttext, fileInputDoctorrighttext, bookingId } = req.body;

    // Best balance of safety + simplicity
    const vars = {
        reportId, htmlContent, cssContent, header, footer,
        backgroundImageUrl: normalizeStoredUploadUrl(backgroundImageUrl) || backgroundImageUrl,
        headermargin, footermargin, investigationmargin, showlab, showdoctorfirst,
        showdoctorsecond, fileInputLab, fileInputDoctorleft, fileInputDoctorright, fileInputLabtext,
        fileInputDoctorlefttext, fileInputDoctorrighttext, bookingId
    };

    const updateFields = {};
    for (const key in vars) {
        if (vars[key] != null) updateFields[key] = vars[key];
    }
    updateFields.updatedAt = new Date();

    const getcustomization = await customization.findOneAndUpdate(
        {
            reportId: reportId,
            tenantId: tenantId,
            createdBy: userId
        }, // Or use some identifier
        updateFields,
        {
            new: true,  // Return updated document
            upsert: true, // Create new record if it doesn't exist
        }
    );

    await saveOrUpdatePdfSetting({
        tenantId,
        createdBy: userId,
        headermargin,
        footermargin,
        investigationmargin,
    })

    return res.status(200).json(getcustomization)
}

const getCustomizationByReportId = async (req, res) => {
    try {
        // Extract reportId from the request
        const { reportId } = req.body;

        if (!reportId) {
            return res.status(400).json({ message: "Report ID is required" });
        }

        const tenantId = req.user?.tenantId?._id;
        const [customizationData, defaultSettings, doctorsignDoc] = await Promise.all([
            customization.findOne({ reportId: reportId }).lean(),
            tenantId ? defaultpdfsetting.findOne({ tenantId }).lean() : Promise.resolve(null),
            tenantId ? doctorsign.findOne({ tenantId }).select('signatureLayout').lean() : Promise.resolve(null),
        ]);

        const hasSavedCustomFlags = Boolean(
            customizationData?.hasUserSavedPrintSettings || defaultSettings?.hasUserSavedPrintSettings
        );
        const hasExplicitInvestChoice = Boolean(
            customizationData?.showInvestExplicit || defaultSettings?.showInvestExplicit
        );
        const mergedCustomization = {
            ...(customizationData || {}),
            headermargin: customizationData?.headermargin ?? defaultSettings?.headermargin ?? DEFAULT_PDF_PREFERENCES.headermargin,
            footermargin: customizationData?.footermargin ?? defaultSettings?.footermargin ?? DEFAULT_PDF_PREFERENCES.footermargin,
            marginRight: customizationData?.marginRight ?? defaultSettings?.marginRight ?? DEFAULT_PDF_PREFERENCES.marginRight,
            marginLeft: customizationData?.marginLeft ?? defaultSettings?.marginLeft ?? DEFAULT_PDF_PREFERENCES.marginLeft,
            LeftsignPd: customizationData?.LeftsignPd ?? defaultSettings?.LeftsignPd ?? DEFAULT_PDF_PREFERENCES.LeftsignPd,
            Rightsignpd: customizationData?.Rightsignpd ?? defaultSettings?.Rightsignpd ?? DEFAULT_PDF_PREFERENCES.Rightsignpd,
            showInvest: hasExplicitInvestChoice
                ? (customizationData?.showInvest ?? defaultSettings?.showInvest ?? DEFAULT_PDF_PREFERENCES.showInvest)
                : DEFAULT_PDF_PREFERENCES.showInvest,
            showInvestExplicit: hasExplicitInvestChoice,
            BoldRow: hasSavedCustomFlags
                ? (customizationData?.BoldRow ?? defaultSettings?.BoldRow ?? DEFAULT_PDF_PREFERENCES.BoldRow)
                : DEFAULT_PDF_PREFERENCES.BoldRow,
            HLinred: hasSavedCustomFlags
                ? (customizationData?.HLinred ?? defaultSettings?.HLinred ?? DEFAULT_PDF_PREFERENCES.HLinred)
                : DEFAULT_PDF_PREFERENCES.HLinred,
            HighLow: hasSavedCustomFlags
                ? (customizationData?.HighLow ?? defaultSettings?.HighLow ?? DEFAULT_PDF_PREFERENCES.HighLow)
                : DEFAULT_PDF_PREFERENCES.HighLow,
            RowSpacing: customizationData?.RowSpacing ?? defaultSettings?.RowSpacing ?? DEFAULT_PDF_PREFERENCES.RowSpacing,
            selectedFontSize: customizationData?.selectedFontSize ?? defaultSettings?.selectedFontSize ?? DEFAULT_PDF_PREFERENCES.selectedFontSize,
            selectedFontFamily: customizationData?.selectedFontFamily ?? defaultSettings?.selectedFontFamily ?? DEFAULT_PDF_PREFERENCES.selectedFontFamily,
            hideCategories: customizationData?.hideCategories ?? defaultSettings?.hideCategories ?? DEFAULT_PDF_PREFERENCES.hideCategories,
            hideTableHeadings: customizationData?.hideTableHeadings ?? defaultSettings?.hideTableHeadings ?? DEFAULT_PDF_PREFERENCES.hideTableHeadings,
            investigationmargin: customizationData?.investigationmargin ?? defaultSettings?.investigationmargin ?? DEFAULT_PDF_PREFERENCES.investigationmargin,
            signatureLayout: resolveEffectiveSignatureLayout({
                doctorsignDoc,
                defaultpdfsetting: defaultSettings,
                customizationDoc: customizationData,
            }),
            hasUserSavedPrintSettings: hasSavedCustomFlags,
        };

        return res.status(200).json(mergedCustomization);
    } catch (error) {
        console.error("Error fetching customization data:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const invoicepdfgenerator = async (req, res) => {
    let { invoiceHtml, invoicecss, billnumber, bookingId, generatedBy, billingPrice } = req.body;

    try {
        const browser = await launchPdfBrowser();
        const page = await browser.newPage();

        // Viewport set karein
        await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });

        const contentwithhtmlcss = `
        <html>
        <head>
        <meta charset="utf-8" />
        <style>
        ${invoicecss}
        </style>
        </head>
        <body>
        ${invoiceHtml}
        </body>
        </html>`;

        const cleanupPageContent = await renderOfflineHtmlOnPage(page, contentwithhtmlcss, 'load');

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
        });

        await cleanupPageContent();
        await browser.close();

        const document = await invoices.findOneAndUpdate(
            {
                tenantId: req.user.tenantId._id,
                createdBy: req.user._id,
                bookingId: bookingId
            },
            {
                tenantId: req.user.tenantId._id,
                createdBy: req.user._id,
                invoiceCss: invoicecss,
                invoiceHtml: invoiceHtml,
                billNumber: billnumber,
                generatedBy,
                billingPrice,
                bookingId
            },
            {
                new: true,
                upsert: true
            }
        );

        if (!document) {
            return res.status(500).json({ message: "Internal server error" });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="final_report.pdf"');
        res.setHeader('Content-Length', pdfBuffer.length);
        res.end(pdfBuffer);

    } catch (error) {
        console.log(error)
    }

}

const getAllInvoices = async (req, res) => {
    try {
        let userId;
        if (req.user.role === 'staff') {
            userId = req.user.parentUser
        } else {
            userId = req.user._id
        }

        let query = {
            tenantId: req.user.tenantId._id,
            createdBy: userId
        };

        // Optional start and end date filtering
        const { start, end } = req.query;

        if (start || end) {
            query.createdAt = {};
            if (start) {
                query.createdAt.$gte = new Date(start);
            }
            if (end) {
                // To include the entire end day, set time to end of the day
                const endDate = new Date(end);
                endDate.setHours(23, 59, 59, 999);
                query.createdAt.$lte = endDate;
            }
        }

        const invoicesList = await invoices.find(query).sort({ createdAt: -1 });

        if (invoicesList) {
            for (const invoice of invoicesList) {
                const finalinvoicelist = await invoices.findOne({
                    bookingId: invoice.bookingId
                }).sort({ createdAt: -1 });
            }
        }
        res.status(200).json({
            success: true,
            total: invoicesList.length,
            data: invoicesList
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

const certificatepdfgenerator = async (req, res) => {
    let { pdfHtml, pdfcss, userId } = req.body;

    // const getdoc = await certificates.findOne({ userId })

    // if (getdoc) {
    //     pdfHtml = getdoc.pdfHtml;
    //     pdfcss = getdoc.pdfcss;
    // }

    try {
        const browser = await launchPdfBrowser();
        const page = await browser.newPage();

        const contentwithhtmlcss = `
        <html>
        <head>
        <meta charset="utf-8" />
        <style>
        ${pdfcss}
        .certificatedImgdiv {
        display: flex;
        }
        </style>
        </head>
        <body>
        ${pdfHtml}
        </body>
        </html>`;

        const cleanupPageContent = await renderOfflineHtmlOnPage(page, contentwithhtmlcss);

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            landscape: true,
            margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
        });

        await cleanupPageContent();
        await browser.close();

        // if (!getdoc) {
        //     const document = await certificates.create({
        //         pdfcss: pdfcss,
        //         pdfHtml: pdfHtml,
        //         userId: userId
        //     })
        // }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="final_report.pdf"');
        res.setHeader('Content-Length', pdfBuffer.length);
        res.end(pdfBuffer);

    } catch (error) {
        console.log(error)
    }

}

export {
    pdfgeneratorcontroller2,
    getpdfcontroller,
    savingPdfDatacontroller,
    getCustomizationByReportId,
    invoicepdfgenerator,
    certificatepdfgenerator,
    getAllInvoices,
    getpdfcontrolleruser,
    mergePdfsController

};
