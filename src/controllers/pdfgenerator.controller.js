import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { customization } from '../models/printsetting.model.js';
import { invoices } from '../models/invoicepdf.model.js';
import { certificates } from '../models/certificate.model.js';
import { defaultpdfsetting } from '../models/defaultpdfsettings.model.js';
import { Template } from '../models/template.model.js';
import {
    loadOfflineHtmlIntoPage,
    readAssetAsBuffer,
    rewriteHtmlForOfflinePdf,
    sanitizePdfCss,
    sanitizePdfMarkup,
} from '../utils/pdfOfflineAssets.js';
import { doesLocalFileExist, normalizeStoredUploadUrl } from '../utils/localStorage.js';
import { getPuppeteerLaunchOptions } from '../utils/puppeteerRuntime.js';

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
    HLinred: false,
    HighLow: true,
    RowSpacing: 7,
    selectedFontSize: 12,
    selectedFontFamily: DEFAULT_PDF_FONT_FAMILY,
    hideCategories: false,
    hideTableHeadings: false,
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

const pdfgeneratorcontroller2 = async ({ pdfformat, layerone, showInvest, BoldRow, HLinred, HighLow, RowSpacing,
    selectedFontSize, selectedFontFamily, hideCategories, hideTableHeadings, reportId, htmlContent,
    cssContent, header, footer, backgroundImageUrl, headermargin, footermargin, marginRight,
    marginLeft, investigationmargin, showlab, showdoctorfirst,
    showdoctorsecond, fileInputLab, fileInputDoctorleft, fileInputDoctorright, fileInputLabtext,
    fileInputDoctorlefttext, fileInputDoctorrighttext, LeftsignPd, Rightsignpd, res }) => {

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

            const finalPdfBuffer = await addBackgroundToPdf(pdfBuffer, backgroundImageUrl);

            if (!finalPdfBuffer) {
                console.error('Final PDF buffer is null');
                res.status(500).send('Failed to generate final PDF');
                return;
            }

            const finalpdfbufferwithmargin = await adjustPdfMargins(finalPdfBuffer, marginRightPx, marginLeftPx);

            // Dynamically build the update object
            const updateData = {
                showInvest: showInvest,
                BoldRow: BoldRow,
                HLinred: HLinred,
                HighLow: HighLow,
                RowSpacing: parseNumericValue(RowSpacing, 7),
                selectedFontSize: parseNumericValue(selectedFontSize, 12),
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
                updatedAt: new Date()
            };

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

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="final_report.pdf"');
            res.setHeader('Content-Length', finalpdfbufferwithmargin.length);
            res.end(finalpdfbufferwithmargin);
        } finally {
            await cleanupPageContent().catch(() => { });
            await browser.close().catch(() => { });
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

    const { value1, checkBox, disableBackgroundImage, htmlContent, cssContent, header, footer, backgroundImageUrl,
        headermargin, footermargin, marginRight, marginLeft, selectedFontSize, RowSpacing, HighLow,
        selectedFontFamily, hideCategories, hideTableHeadings, HLinred, BoldRow, showInvest, DownloadPdf, investigationmargin, showlab, showdoctorfirst,
        showdoctorsecond, fileInputLab, fileInputDoctorleft, fileInputDoctorright, fileInputLabtext,
        fileInputDoctorlefttext, fileInputDoctorrighttext, bookingId, LeftsignPd, Rightsignpd } = req.body;


    let pdfformat;
    const tid = req.user.tenantId._id;
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }

    if (req.user.role === "admin") {
        pdfformat = req.user.pdfFormat;
    } else {
        pdfformat = req.user.createdBy.pdfFormat;
    }

    try {
        // Attempt to fetch data from the database
        const gettingcustomization = await customization.findOne({ reportId: value1 });

        const defaultpdfsetting = await saveOrUpdatePdfSetting({
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
            Rightsignpd
        })

        let mergedValues;

        if (checkBox || DownloadPdf) {
            // Define fallback logic to prioritize database values first
            mergedValues = {
                pdfformat: pdfformat,
                showInvest: defaultpdfsetting?.showInvest ?? gettingcustomization?.showInvest ?? DEFAULT_PDF_PREFERENCES.showInvest,
                BoldRow: defaultpdfsetting?.BoldRow ?? gettingcustomization?.BoldRow ?? DEFAULT_PDF_PREFERENCES.BoldRow,
                HLinred: defaultpdfsetting?.HLinred ?? gettingcustomization?.HLinred ?? DEFAULT_PDF_PREFERENCES.HLinred,
                HighLow: defaultpdfsetting?.HighLow ?? gettingcustomization?.HighLow ?? DEFAULT_PDF_PREFERENCES.HighLow,
                RowSpacing: defaultpdfsetting?.RowSpacing || gettingcustomization?.RowSpacing || DEFAULT_PDF_PREFERENCES.RowSpacing,
                selectedFontSize: defaultpdfsetting?.selectedFontSize || gettingcustomization?.selectedFontSize || DEFAULT_PDF_PREFERENCES.selectedFontSize,
                selectedFontFamily: defaultpdfsetting?.selectedFontFamily || gettingcustomization?.selectedFontFamily || DEFAULT_PDF_PREFERENCES.selectedFontFamily,
                hideCategories: defaultpdfsetting?.hideCategories ?? gettingcustomization?.hideCategories ?? DEFAULT_PDF_PREFERENCES.hideCategories,
                hideTableHeadings: defaultpdfsetting?.hideTableHeadings ?? gettingcustomization?.hideTableHeadings ?? DEFAULT_PDF_PREFERENCES.hideTableHeadings,
                reportId: value1,
                bookingId: bookingId || gettingcustomization?.bookingId || "",
                htmlContent: htmlContent || gettingcustomization?.htmlContent || "", // Priority: Database > Request > Default
                cssContent: cssContent || gettingcustomization?.cssContent || "",
                header: header || gettingcustomization?.header || "",
                footer: footer || gettingcustomization?.footer || "",
                backgroundImageUrl: "",
                headermargin: defaultpdfsetting?.headermargin || gettingcustomization?.headermargin || DEFAULT_PDF_PREFERENCES.headermargin,
                footermargin: defaultpdfsetting?.footermargin || gettingcustomization?.footermargin || DEFAULT_PDF_PREFERENCES.footermargin,
                marginRight: defaultpdfsetting?.marginRight || gettingcustomization?.marginRight || DEFAULT_PDF_PREFERENCES.marginRight,
                marginLeft: defaultpdfsetting?.marginLeft || gettingcustomization?.marginLeft || DEFAULT_PDF_PREFERENCES.marginLeft,
                LeftsignPd: defaultpdfsetting?.LeftsignPd ?? gettingcustomization?.LeftsignPd ?? DEFAULT_PDF_PREFERENCES.LeftsignPd,
                Rightsignpd: defaultpdfsetting?.Rightsignpd ?? gettingcustomization?.Rightsignpd ?? DEFAULT_PDF_PREFERENCES.Rightsignpd,
                investigationmargin: defaultpdfsetting?.investigationmargin || gettingcustomization?.investigationmargin || DEFAULT_PDF_PREFERENCES.investigationmargin,
                showlab: showlab ?? gettingcustomization?.showlab ?? false,
                showdoctorfirst: showdoctorfirst ?? gettingcustomization?.showdoctorfirst ?? true,
                showdoctorsecond: showdoctorsecond ?? gettingcustomization?.showdoctorsecond ?? true,
                fileInputLab: fileInputLab || gettingcustomization?.fileInputLab || "",
                fileInputDoctorleft: fileInputDoctorleft || gettingcustomization?.fileInputDoctorleft || "",
                fileInputDoctorright: fileInputDoctorright || gettingcustomization?.fileInputDoctorright || "",
                fileInputLabtext: fileInputLabtext || gettingcustomization?.fileInputLabtext || "",
                fileInputDoctorlefttext: fileInputDoctorlefttext || gettingcustomization?.fileInputDoctorlefttext || "",
                fileInputDoctorrighttext: fileInputDoctorrighttext || gettingcustomization?.fileInputDoctorrighttext || "",
                res
            };
        } else {
            // Define fallback logic to prioritize database values first
            mergedValues = {
                pdfformat: pdfformat,
                showInvest: defaultpdfsetting?.showInvest ?? gettingcustomization?.showInvest ?? DEFAULT_PDF_PREFERENCES.showInvest,
                BoldRow: defaultpdfsetting?.BoldRow ?? gettingcustomization?.BoldRow ?? DEFAULT_PDF_PREFERENCES.BoldRow,
                HLinred: defaultpdfsetting?.HLinred ?? gettingcustomization?.HLinred ?? DEFAULT_PDF_PREFERENCES.HLinred,
                HighLow: defaultpdfsetting?.HighLow ?? gettingcustomization?.HighLow ?? DEFAULT_PDF_PREFERENCES.HighLow,
                RowSpacing: defaultpdfsetting?.RowSpacing || gettingcustomization?.RowSpacing || DEFAULT_PDF_PREFERENCES.RowSpacing,
                selectedFontSize: defaultpdfsetting?.selectedFontSize || gettingcustomization?.selectedFontSize || DEFAULT_PDF_PREFERENCES.selectedFontSize,
                selectedFontFamily: defaultpdfsetting?.selectedFontFamily || gettingcustomization?.selectedFontFamily || DEFAULT_PDF_PREFERENCES.selectedFontFamily,
                hideCategories: defaultpdfsetting?.hideCategories ?? gettingcustomization?.hideCategories ?? DEFAULT_PDF_PREFERENCES.hideCategories,
                hideTableHeadings: defaultpdfsetting?.hideTableHeadings ?? gettingcustomization?.hideTableHeadings ?? DEFAULT_PDF_PREFERENCES.hideTableHeadings,
                reportId: value1,
                bookingId: bookingId || gettingcustomization?.bookingId || "",
                htmlContent: htmlContent || gettingcustomization?.htmlContent || "", // Priority: Database > Request > Default
                cssContent: cssContent || gettingcustomization?.cssContent || "",
                header: header || gettingcustomization?.header || "",
                footer: footer || gettingcustomization?.footer || "",
                backgroundImageUrl: backgroundImageUrl || gettingcustomization?.backgroundImageUrl || "",
                headermargin: defaultpdfsetting?.headermargin || gettingcustomization?.headermargin || DEFAULT_PDF_PREFERENCES.headermargin,
                footermargin: defaultpdfsetting?.footermargin || gettingcustomization?.footermargin || DEFAULT_PDF_PREFERENCES.footermargin,
                marginRight: defaultpdfsetting?.marginRight || gettingcustomization?.marginRight || DEFAULT_PDF_PREFERENCES.marginRight,
                marginLeft: defaultpdfsetting?.marginLeft || gettingcustomization?.marginLeft || DEFAULT_PDF_PREFERENCES.marginLeft,
                LeftsignPd: defaultpdfsetting?.LeftsignPd ?? gettingcustomization?.LeftsignPd ?? DEFAULT_PDF_PREFERENCES.LeftsignPd,
                Rightsignpd: defaultpdfsetting?.Rightsignpd ?? gettingcustomization?.Rightsignpd ?? DEFAULT_PDF_PREFERENCES.Rightsignpd,

                investigationmargin: defaultpdfsetting?.investigationmargin || gettingcustomization?.investigationmargin || DEFAULT_PDF_PREFERENCES.investigationmargin,
                showlab: showlab ?? gettingcustomization?.showlab ?? false,
                showdoctorfirst: showdoctorfirst ?? gettingcustomization?.showdoctorfirst ?? true,
                showdoctorsecond: showdoctorsecond ?? gettingcustomization?.showdoctorsecond ?? true,
                fileInputLab: fileInputLab || gettingcustomization?.fileInputLab || "",
                fileInputDoctorleft: fileInputDoctorleft || gettingcustomization?.fileInputDoctorleft || "",
                fileInputDoctorright: fileInputDoctorright || gettingcustomization?.fileInputDoctorright || "",
                fileInputLabtext: fileInputLabtext || gettingcustomization?.fileInputLabtext || "",
                fileInputDoctorlefttext: fileInputDoctorlefttext || gettingcustomization?.fileInputDoctorlefttext || "",
                fileInputDoctorrighttext: fileInputDoctorrighttext || gettingcustomization?.fileInputDoctorrighttext || "",
                res
            };
        }

        if (req.user.tenantId.modelType === "1layer") {
            mergedValues.showInvest = false;
            mergedValues.layerone = true;
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
    BoldRow,
    HLinred,
    HighLow,
    RowSpacing,
    selectedFontSize,
    selectedFontFamily,
    hideCategories,
    hideTableHeadings,
    LeftsignPd,
    Rightsignpd
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
                BoldRow,
                HLinred,
                HighLow,
                RowSpacing,
                selectedFontSize,
                selectedFontFamily,
                hideCategories,
                hideTableHeadings,
                LeftsignPd,
                Rightsignpd
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
                BoldRow,
                HLinred,
                HighLow,
                RowSpacing,
                selectedFontSize,
                selectedFontFamily,
                hideCategories,
                hideTableHeadings,
                LeftsignPd,
                Rightsignpd
            };

            for (let key in fields) {
                if (fields[key] !== undefined) {
                    // नई field जो document में exist नहीं करती OR value बदली हो
                    if (!(key in existingSetting.toObject()) || fields[key] !== existingSetting[key]) {
                        existingSetting[key] = fields[key];
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
        pdfformat = user.createdBy.pdfFormat;
    }

    const format3 = pdfformat === "reportFormat3" ? true : false;
    const layerone = user.tenantId.modelType === "1layer";

    if (layerone) {
        mergedValues.showInvest = false;
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
        const contentWithCssAndImage = buildPdfBodyDocument({
            cssContent: mergedValues.cssContent,
            htmlContent: mergedValues.htmlContent,
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
        });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: offlineHeaderTemplate,
            footerTemplate: offlineFooterTemplate,
            margin: {
                top: `${headermarginPx + (format3 ? ((mergedValues.investigationmargin * 1.10) + (layerone ? (mergedValues.investigationmargin < 110 ? 75 : 15) : (mergedValues.investigationmargin < 160 ? 55 : 0))) : ((mergedValues.investigationmargin * 0.90) + (layerone ? 10 : 0)))}px`,
                bottom: '175px',
                left: '10px',
                right: '10px'
            },
        });

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

    const { value1, checkBox, disableBackgroundImage, htmlContent, cssContent, header, footer, backgroundImageUrl,
        headermargin, footermargin, marginRight, marginLeft, selectedFontSize, RowSpacing, HighLow,
        selectedFontFamily, hideCategories, hideTableHeadings, HLinred, BoldRow, showInvest, DownloadPdf, investigationmargin, showlab, showdoctorfirst,
        showdoctorsecond, fileInputLab, fileInputDoctorleft, fileInputDoctorright, fileInputLabtext,
        fileInputDoctorlefttext, fileInputDoctorrighttext, pdfFormat, layerOne } = req.body;

    try {
        // Attempt to fetch data from the database
        const gettingcustomization = await customization.findOne({ reportId: value1 });
        let mergedValues;

        if (checkBox || DownloadPdf) {
            // Define fallback logic to prioritize database values first
            mergedValues = {
                pdfFormat,
                showInvest: showInvest ?? gettingcustomization?.showInvest ?? DEFAULT_PDF_PREFERENCES.showInvest,
                BoldRow: BoldRow ?? gettingcustomization?.BoldRow ?? DEFAULT_PDF_PREFERENCES.BoldRow,
                HLinred: HLinred ?? gettingcustomization?.HLinred ?? DEFAULT_PDF_PREFERENCES.HLinred,
                HighLow: HighLow ?? gettingcustomization?.HighLow ?? DEFAULT_PDF_PREFERENCES.HighLow,
                RowSpacing: RowSpacing || gettingcustomization?.RowSpacing || DEFAULT_PDF_PREFERENCES.RowSpacing,
                selectedFontSize: selectedFontSize || gettingcustomization?.selectedFontSize || DEFAULT_PDF_PREFERENCES.selectedFontSize,
                selectedFontFamily: selectedFontFamily || gettingcustomization?.selectedFontFamily || DEFAULT_PDF_PREFERENCES.selectedFontFamily,
                hideCategories: hideCategories ?? gettingcustomization?.hideCategories ?? DEFAULT_PDF_PREFERENCES.hideCategories,
                hideTableHeadings: hideTableHeadings ?? gettingcustomization?.hideTableHeadings ?? DEFAULT_PDF_PREFERENCES.hideTableHeadings,
                reportId: value1,
                htmlContent: htmlContent || gettingcustomization?.htmlContent || "", // Priority: Database > Request > Default
                cssContent: cssContent || gettingcustomization?.cssContent || "",
                header: header || gettingcustomization?.header || "",
                footer: footer || gettingcustomization?.footer || "",
                backgroundImageUrl: "",
                headermargin: headermargin || gettingcustomization?.headermargin || DEFAULT_PDF_PREFERENCES.headermargin,
                footermargin: footermargin || gettingcustomization?.footermargin || DEFAULT_PDF_PREFERENCES.footermargin,
                marginRight: marginRight || gettingcustomization?.marginRight || DEFAULT_PDF_PREFERENCES.marginRight,
                marginLeft: marginLeft || gettingcustomization?.marginLeft || DEFAULT_PDF_PREFERENCES.marginLeft,
                investigationmargin: investigationmargin || gettingcustomization?.investigationmargin || DEFAULT_PDF_PREFERENCES.investigationmargin,
                showlab: showlab ?? gettingcustomization?.showlab ?? false,
                showdoctorfirst: showdoctorfirst ?? gettingcustomization?.showdoctorfirst ?? true,
                showdoctorsecond: showdoctorsecond ?? gettingcustomization?.showdoctorsecond ?? true,
                fileInputLab: fileInputLab || gettingcustomization?.fileInputLab || "",
                fileInputDoctorleft: fileInputDoctorleft || gettingcustomization?.fileInputDoctorleft || "",
                fileInputDoctorright: fileInputDoctorright || gettingcustomization?.fileInputDoctorright || "",
                fileInputLabtext: fileInputLabtext || gettingcustomization?.fileInputLabtext || "",
                fileInputDoctorlefttext: fileInputDoctorlefttext || gettingcustomization?.fileInputDoctorlefttext || "",
                fileInputDoctorrighttext: fileInputDoctorrighttext || gettingcustomization?.fileInputDoctorrighttext || "",
                res
            };
        } else {
            // Define fallback logic to prioritize database values first
            mergedValues = {
                pdfFormat,
                showInvest: showInvest ?? gettingcustomization?.showInvest ?? DEFAULT_PDF_PREFERENCES.showInvest,
                BoldRow: BoldRow ?? gettingcustomization?.BoldRow ?? DEFAULT_PDF_PREFERENCES.BoldRow,
                HLinred: HLinred ?? gettingcustomization?.HLinred ?? DEFAULT_PDF_PREFERENCES.HLinred,
                HighLow: HighLow ?? gettingcustomization?.HighLow ?? DEFAULT_PDF_PREFERENCES.HighLow,
                RowSpacing: RowSpacing || gettingcustomization?.RowSpacing || DEFAULT_PDF_PREFERENCES.RowSpacing,
                selectedFontSize: selectedFontSize || gettingcustomization?.selectedFontSize || DEFAULT_PDF_PREFERENCES.selectedFontSize,
                selectedFontFamily: selectedFontFamily || gettingcustomization?.selectedFontFamily || DEFAULT_PDF_PREFERENCES.selectedFontFamily,
                hideCategories: hideCategories ?? gettingcustomization?.hideCategories ?? DEFAULT_PDF_PREFERENCES.hideCategories,
                hideTableHeadings: hideTableHeadings ?? gettingcustomization?.hideTableHeadings ?? DEFAULT_PDF_PREFERENCES.hideTableHeadings,
                reportId: value1,
                htmlContent: htmlContent || gettingcustomization?.htmlContent || "", // Priority: Database > Request > Default
                cssContent: cssContent || gettingcustomization?.cssContent || "",
                header: header || gettingcustomization?.header || "",
                footer: footer || gettingcustomization?.footer || "",
                backgroundImageUrl: backgroundImageUrl || gettingcustomization?.backgroundImageUrl || "",
                headermargin: headermargin || gettingcustomization?.headermargin || DEFAULT_PDF_PREFERENCES.headermargin,
                footermargin: footermargin || gettingcustomization?.footermargin || DEFAULT_PDF_PREFERENCES.footermargin,
                marginRight: marginRight || gettingcustomization?.marginRight || DEFAULT_PDF_PREFERENCES.marginRight,
                marginLeft: marginLeft || gettingcustomization?.marginLeft || DEFAULT_PDF_PREFERENCES.marginLeft,
                investigationmargin: investigationmargin || gettingcustomization?.investigationmargin || DEFAULT_PDF_PREFERENCES.investigationmargin,
                showlab: showlab ?? gettingcustomization?.showlab ?? false,
                showdoctorfirst: showdoctorfirst ?? gettingcustomization?.showdoctorfirst ?? true,
                showdoctorsecond: showdoctorsecond ?? gettingcustomization?.showdoctorsecond ?? true,
                fileInputLab: fileInputLab || gettingcustomization?.fileInputLab || "",
                fileInputDoctorleft: fileInputDoctorleft || gettingcustomization?.fileInputDoctorleft || "",
                fileInputDoctorright: fileInputDoctorright || gettingcustomization?.fileInputDoctorright || "",
                fileInputLabtext: fileInputLabtext || gettingcustomization?.fileInputLabtext || "",
                fileInputDoctorlefttext: fileInputDoctorlefttext || gettingcustomization?.fileInputDoctorlefttext || "",
                fileInputDoctorrighttext: fileInputDoctorrighttext || gettingcustomization?.fileInputDoctorrighttext || "",
                res
            };
        }

        if (layerOne === "1layer") {
            mergedValues.showInvest = false;
            mergedValues.layerone = true;
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
        const customizationData = await customization.findOne({ reportId: reportId }).lean();
        const defaultSettings = tenantId
            ? await defaultpdfsetting.findOne({ tenantId }).lean()
            : null;

        const mergedCustomization = {
            ...(customizationData || {}),
            headermargin: customizationData?.headermargin ?? defaultSettings?.headermargin ?? DEFAULT_PDF_PREFERENCES.headermargin,
            footermargin: customizationData?.footermargin ?? defaultSettings?.footermargin ?? DEFAULT_PDF_PREFERENCES.footermargin,
            marginRight: customizationData?.marginRight ?? defaultSettings?.marginRight ?? DEFAULT_PDF_PREFERENCES.marginRight,
            marginLeft: customizationData?.marginLeft ?? defaultSettings?.marginLeft ?? DEFAULT_PDF_PREFERENCES.marginLeft,
            LeftsignPd: customizationData?.LeftsignPd ?? defaultSettings?.LeftsignPd ?? DEFAULT_PDF_PREFERENCES.LeftsignPd,
            Rightsignpd: customizationData?.Rightsignpd ?? defaultSettings?.Rightsignpd ?? DEFAULT_PDF_PREFERENCES.Rightsignpd,
            showInvest: customizationData?.showInvest ?? defaultSettings?.showInvest ?? DEFAULT_PDF_PREFERENCES.showInvest,
            BoldRow: customizationData?.BoldRow ?? defaultSettings?.BoldRow ?? DEFAULT_PDF_PREFERENCES.BoldRow,
            HLinred: customizationData?.HLinred ?? defaultSettings?.HLinred ?? DEFAULT_PDF_PREFERENCES.HLinred,
            HighLow: customizationData?.HighLow ?? defaultSettings?.HighLow ?? DEFAULT_PDF_PREFERENCES.HighLow,
            RowSpacing: customizationData?.RowSpacing ?? defaultSettings?.RowSpacing ?? DEFAULT_PDF_PREFERENCES.RowSpacing,
            selectedFontSize: customizationData?.selectedFontSize ?? defaultSettings?.selectedFontSize ?? DEFAULT_PDF_PREFERENCES.selectedFontSize,
            selectedFontFamily: customizationData?.selectedFontFamily ?? defaultSettings?.selectedFontFamily ?? DEFAULT_PDF_PREFERENCES.selectedFontFamily,
            hideCategories: customizationData?.hideCategories ?? defaultSettings?.hideCategories ?? DEFAULT_PDF_PREFERENCES.hideCategories,
            hideTableHeadings: customizationData?.hideTableHeadings ?? defaultSettings?.hideTableHeadings ?? DEFAULT_PDF_PREFERENCES.hideTableHeadings,
            investigationmargin: customizationData?.investigationmargin ?? defaultSettings?.investigationmargin ?? DEFAULT_PDF_PREFERENCES.investigationmargin,
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
