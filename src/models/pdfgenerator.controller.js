import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import fetch from 'node-fetch'; // Import node-fetch to handle fetching images
import { fileURLToPath } from 'url'; // Import fileURLToPath for ES Modules
import { PDFDocument } from 'pdf-lib';
import { customization } from '../models/printsetting.model.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { invoices } from '../models/invoicepdf.model.js';
import { certificates } from '../models/certificate.model.js';
import { defaultpdfsetting } from '../models/defaultpdfsettings.model.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);

// second try=====================================================================

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

    try {
        const inputPdfDoc = await PDFDocument.load(inputPdfBuffer);

        const outputPdfDoc = await PDFDocument.create();

        let backgroundImage = null;

        if (backgroundImageUrl) {
            // Fetch and embed the background image if URL is provided
            const fetchImageAsBase64FromUrl = async (url) => {
                try {
                    const response = await fetch(url);
                    const buffer = await response.buffer();
                    return buffer.toString('base64');
                } catch (error) {
                    console.error('Error fetching background image:', error);
                    return null;
                }
            };

            const backgroundImageBase64 = await fetchImageAsBase64FromUrl(backgroundImageUrl);
            if (!backgroundImageBase64) {
            } else {
                try {
                    backgroundImage = await outputPdfDoc.embedJpg(Buffer.from(backgroundImageBase64, 'base64'));
                } catch (err) {
                    console.warn('Failed to embed JPG image, trying PNG');
                    try {
                        backgroundImage = await outputPdfDoc.embedPng(Buffer.from(backgroundImageBase64, 'base64'));
                    } catch (pngError) {
                        console.error('Failed to embed PNG image:', pngError);
                        backgroundImage = null;
                    }
                }
            }
        } else {
            console.log('No background image URL provided, proceeding with blank background');
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

// Function to convert image URL to Base64
const convertImageToBase64 = async (imageUrl) => {
    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        return buffer.toString('base64');
    } catch (error) {
        console.error('Error fetching image:', error);
        return null;
    }
};

// Function to process HTML and convert all images to Base64
const convertImagesInHtmlToBase64 = async (htmlContent) => {
    const $ = cheerio.load(htmlContent);  // Load HTML content using cheerio
    const images = $('img');  // Select all <img> tags

    // Iterate over each <img> tag
    for (let i = 0; i < images.length; i++) {
        const img = $(images[i]);
        const imageUrl = img.attr('src');  // Get the 'src' attribute of the image

        // Convert image to Base64 if the src is an image URL
        if (imageUrl && !imageUrl.startsWith('data:image')) {
            const base64Image = await convertImageToBase64(imageUrl);
            if (base64Image) {
                // Update the 'src' attribute with the Base64 string
                img.attr('src', `data:image/png;base64,${base64Image}`);
            }
        }
    }

    // Return updated HTML with Base64 images
    return $.html();
};

const pdfgeneratorcontroller2 = async ({ pdfformat, layerone, showInvest, BoldRow, HLinred, HighLow, RowSpacing,
    selectedFontSize, reportId, htmlContent,
    cssContent, header, footer, backgroundImageUrl, headermargin, footermargin, marginRight,
    marginLeft, investigationmargin, showlab, showdoctorfirst,
    showdoctorsecond, fileInputLab, fileInputDoctorleft, fileInputDoctorright, fileInputLabtext,
    fileInputDoctorlefttext, fileInputDoctorrighttext, res }) => {

    investigationmargin = parseFloat(investigationmargin) + 20;

    const format3 = pdfformat === "reportFormat3" ? true : false;

    const cmToPx = (cm) => cm * 37.795;

    let headermarginPx;
    let footermarginPx;
    let marginRightPx;
    let marginLeftPx;

    // Conversion from cm to px
    if (marginRight || marginLeft) {
        marginRightPx = cmToPx(parseFloat(marginRight));
        marginLeftPx = cmToPx(parseFloat(marginLeft));
    }

    headermarginPx = cmToPx(parseFloat(headermargin));
    footermarginPx = cmToPx(parseFloat(footermargin));

    const imageUrls = [fileInputDoctorleft, fileInputLab, fileInputDoctorright];

    const getMimeTypeFromUrl = (url) => {
        if (url?.endsWith(".jpg") || url?.endsWith(".jpeg")) return "image/jpeg";
        if (url?.endsWith(".png")) return "image/png";
        if (url?.endsWith(".webp")) return "image/webp";
        return "image/*";
    };

    const mimeTypes = imageUrls.map(getMimeTypeFromUrl);

    const convertToBase64 = async (imageUrl) => {
        try {
            if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("http")) {
                throw new Error(`Invalid image URL: ${imageUrl}`);
            }
            const response = await fetch(imageUrl);
            const buffer = await response.arrayBuffer();
            return Buffer.from(buffer).toString('base64');
        } catch (error) {
            console.error(`Failed to convert image: ${error.message}`);
            return null;
        }
    };

    const base64Images = await Promise.all(imageUrls.map(convertToBase64));


    try {
        const browser = await puppeteer.launch({
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu"
            ]
        });
        
        const page = await browser.newPage();

        const contentWithCssAndImage = `
            <html>
                <head>
                    <style>
                     *{
                                margin: 0px;
                                padding: 0px;
                                box-sizing: border-box;
                            }
                        ${cssContent}
                        .wrong i, .delete-btn i {
                            display: none;
                        }
                        h2 {
                        margin: 0 !important;
                        padding: 0 !important;
                        }
                        .headings {
                        margin-top: 0 !important;
                        margin-bottom: 0px !important;
                        }
                        tr,th {
                            font-size: ${selectedFontSize}px !important;
                        }
                        td {
                            padding-top: ${parseFloat(RowSpacing) / 2}px !important;
                            padding-bottom: ${parseFloat(RowSpacing) / 2}px !important;
                        }
                        td .HL span {
                        display: ${HighLow ? 'block' : 'none'};
                        }
                        .high-low span{
                        color: ${HLinred ? 'red' : 'black'} !important;
                        }
                        .BoldRow {
                        font-weight: ${BoldRow ? 'bold' : '400'} !important; 
                        }
                        .deletion {
                        display: none !important;
                        }
                        td.wrong {
                        display: none !important;
                        }
                        .details-row {
                            font-size: 10px !important;
                        }
                        .methods {
                            font-size: 8px !important;
                            color: #565656 !important;
                            margin-top: 2px !important;
                        }
                    </style>
                </head>
                <body>
                    <div class="middle">
                    ${htmlContent}
                    </div>
                </body>
            </html>`;

        await page.setContent(contentWithCssAndImage, { waitUntil: 'networkidle0' });


        const pdfBuffer = await page.pdf({
            format: 'A4',
            displayHeaderFooter: true,
            headerTemplate: `
                <html>
                    <head>
                        <style>
                            *{
                                margin: 0px;
                                padding: 0px;
                                box-sizing: border-box;
                            }
                            .pdf-header-div, .pdf-header-div * {
                                margin-bottom: 0 !important;
                            }
                            .pdf-header-div {
                                width: ${format3 ? "100%" : "95%"}; 
                                margin:  0 auto;
                                border: ${(format3) ? "none" : "1px solid black"};
                                margin-top: 0cm !important;
                            }
                            .report-details, .report-details * {
                                margin-top: 0 !important;
                            }
                            .report-details-innerDiv2 {
                            width: ${format3 ? "95%" : "100%"} !important;
                            font-size: 12px;
                            margin-top: ${headermargin}cm !important;
                            border: none !important;
                            }
                            #investDiv {
                            display: ${showInvest ? 'flex' : 'none'} !important;
                            }
                            .time-div {
                                width: 40% !important;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="pdf-header-div"> 
                        ${header}
                    </div>
                    </body>
                </html>`,
            footerTemplate: `
                <html>
                    <head>
                        <style>
                         *{
                                margin: 0px;
                                padding: 0px;
                                box-sizing: border-box;
                            }
                            ${cssContent}
                            .pdf-footer-div {
                            width: 92%; 
                            display: flex;
                            justify-content: center;
                            font-size: 12px; 
                            font-weight: 450; 
                            text-align: center; 
                            margin: 0px auto;
                            margin-bottom: ${footermarginPx}px;
                            }
                        </style>
                    </head>
                    <body>
                <div class="pdf-footer-div">
                    ${footer}
                </div>
                    </body>
                </html>`,
            margin: { top: `${headermarginPx + (format3 ? ((investigationmargin * 1.10) + (layerone ? (investigationmargin < 110 ? 75 : 15) : (investigationmargin < 160 ? 55 : 0))) : ((investigationmargin * 0.90) + (layerone ? 10 : 0)))}px`, bottom: '175px', left: `10px`, right: `10px` },
        });

        await browser.close();

        const finalPdfBuffer = await addBackgroundToPdf(pdfBuffer, backgroundImageUrl);

        if (!finalPdfBuffer) {
            console.error('Final PDF buffer is null');
            res.status(500).send('Failed to generate final PDF');
            return;
        }

        const finalpdfbufferwithmargin = await adjustPdfMargins(finalPdfBuffer, marginRightPx, marginLeftPx);

        console.log(headermargin, footermargin);
        // Dynamically build the update object
        const updateData = {
            showInvest: showInvest,
            BoldRow: BoldRow,
            HLinred: HLinred,
            HighLow: HighLow,
            RowSpacing: parseFloat(RowSpacing),
            selectedFontSize: parseFloat(selectedFontSize),
            reportId: reportId,
            htmlContent: htmlContent,
            cssContent: cssContent,
            header: header,
            footer: footer,
            headermargin: headermargin,
            footermargin: footermargin,
            marginRight: marginRight,
            marginLeft: marginLeft,
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
            updateData.backgroundImageUrl = backgroundImageUrl;
        }

        // Save the path to the database
        const getcustomization = await customization.findOneAndUpdate(
            { reportId: reportId }, // Or use some identifier
            updateData,
            {
                new: true,  // Return the updated document
                upsert: true, // Create new record if it doesn't exist
            }
        );


        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="final_report.pdf"');
        res.setHeader('Content-Length', finalpdfbufferwithmargin.length);
        res.end(finalpdfbufferwithmargin);

    } catch (error) {
        console.error('Error generating final PDF:', error.message);
        res.status(500).send('Error generating final PDF');
    }
}

const getpdfcontroller = async (req, res) => {

    const { value1, checkBox, htmlContent, cssContent, header, footer, backgroundImageUrl,
        headermargin, footermargin, marginRight, marginLeft, selectedFontSize, RowSpacing, HighLow,
        HLinred, BoldRow, showInvest, DownloadPdf, investigationmargin, showlab, showdoctorfirst,
        showdoctorsecond, fileInputLab, fileInputDoctorleft, fileInputDoctorright, fileInputLabtext,
        fileInputDoctorlefttext, fileInputDoctorrighttext, bookingId } = req.body;

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

        console.log(headermargin, footermargin);
        const defaultpdfsetting = await saveOrUpdatePdfSetting({
            tenantId: tid,
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
        })

        let mergedValues;

        console.log("Database Values:", defaultpdfsetting)
        if (checkBox || DownloadPdf) {
            // Define fallback logic to prioritize database values first
            mergedValues = {
                pdfformat: pdfformat,
                showInvest: defaultpdfsetting?.showInvest ?? gettingcustomization?.showInvest ?? true, // Updated logic     
                BoldRow: defaultpdfsetting?.BoldRow ?? gettingcustomization?.BoldRow ?? true, // Updated logic     
                HLinred: defaultpdfsetting?.HLinred ?? gettingcustomization?.HLinred ?? false, // Updated logic     
                HighLow: defaultpdfsetting?.HighLow ?? gettingcustomization?.HighLow ?? false, // Updated logic     
                RowSpacing: defaultpdfsetting?.RowSpacing || gettingcustomization?.RowSpacing || 7,
                selectedFontSize: defaultpdfsetting.selectedFontSize || gettingcustomization.selectedFontSize || 12,
                reportId: value1,
                bookingId: bookingId || gettingcustomization?.bookingId || "",
                htmlContent: htmlContent || gettingcustomization?.htmlContent || "", // Priority: Database > Request > Default
                cssContent: cssContent || gettingcustomization?.cssContent || "",
                header: header || gettingcustomization?.header || "",
                footer: footer || gettingcustomization?.footer || "",
                backgroundImageUrl: "",
                headermargin: defaultpdfsetting?.headermargin || gettingcustomization?.headermargin || "2.8",
                footermargin: defaultpdfsetting?.footermargin || gettingcustomization?.footermargin || "1",
                marginRight: defaultpdfsetting?.marginRight || gettingcustomization?.marginRight || "0",
                marginLeft: defaultpdfsetting?.marginLeft || gettingcustomization?.marginLeft || "0",
                investigationmargin: defaultpdfsetting?.investigationmargin || gettingcustomization?.investigationmargin || 40,
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
                showInvest: defaultpdfsetting?.showInvest ?? gettingcustomization?.showInvest ?? true, // Updated logic     
                BoldRow: defaultpdfsetting?.BoldRow ?? gettingcustomization?.BoldRow ?? true, // Updated logic     
                HLinred: defaultpdfsetting?.HLinred ?? gettingcustomization?.HLinred ?? false, // Updated logic     
                HighLow: defaultpdfsetting?.HighLow ?? gettingcustomization?.HighLow ?? false, // Updated logic     
                RowSpacing: defaultpdfsetting?.RowSpacing || gettingcustomization?.RowSpacing || 7,
                selectedFontSize: defaultpdfsetting.selectedFontSize || gettingcustomization.selectedFontSize || 12,
                reportId: value1,
                bookingId: bookingId || gettingcustomization?.bookingId || "",
                htmlContent: htmlContent || gettingcustomization?.htmlContent || "", // Priority: Database > Request > Default
                cssContent: cssContent || gettingcustomization?.cssContent || "",
                header: header || gettingcustomization?.header || "",
                footer: footer || gettingcustomization?.footer || "",
                backgroundImageUrl: backgroundImageUrl || gettingcustomization?.backgroundImageUrl || "",
                headermargin: defaultpdfsetting?.headermargin || gettingcustomization?.headermargin || "2.8",
                footermargin: defaultpdfsetting?.footermargin || gettingcustomization?.footermargin || "1",
                marginRight: defaultpdfsetting?.marginRight || gettingcustomization?.marginRight || "0",
                marginLeft: defaultpdfsetting?.marginLeft || gettingcustomization?.marginLeft || "0",
                investigationmargin: defaultpdfsetting?.investigationmargin || gettingcustomization?.investigationmargin || 40,
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

        // Generate the PDF with merged values
        await pdfgeneratorcontroller2(mergedValues);

    } catch (error) {
        console.error('Error fetching PDF:', error.message);
        res.status(500).json({ message: 'Error fetching PDF', error: error.message });
    }
};

const saveOrUpdatePdfSetting = async ({
    tenantId,
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
}) => {
    try {


        // tenantId के आधार पर रिकॉर्ड खोजें
        let existingSetting = await defaultpdfsetting.findOne({ tenantId });

        if (!existingSetting) {
            // अगर नहीं मिला तो नया डॉक्यूमेंट बनाएँ
            const newSetting = await defaultpdfsetting.create({
                tenantId,
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
            };

            for (let key in fields) {
                if (
                    fields[key] !== undefined &&
                    fields[key] !== existingSetting[key]
                ) {
                    existingSetting[key] = fields[key];
                    isChanged = true;
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
                });

                // Prepare merged values
                const mergedValues = {
                    showInvest: defaultpdfsetting?.showInvest ?? gettingcustomization?.showInvest ?? true,
                    BoldRow: defaultpdfsetting?.BoldRow ?? gettingcustomization?.BoldRow ?? true,
                    HLinred: defaultpdfsetting?.HLinred ?? gettingcustomization?.HLinred ?? false,
                    HighLow: defaultpdfsetting?.HighLow ?? gettingcustomization?.HighLow ?? false,
                    RowSpacing: defaultpdfsetting?.RowSpacing || gettingcustomization?.RowSpacing || 7,
                    selectedFontSize: defaultpdfsetting?.selectedFontSize || gettingcustomization?.selectedFontSize || 12,
                    reportId: reportId,
                    htmlContent: gettingcustomization?.htmlContent || "",
                    cssContent: gettingcustomization?.cssContent || "",
                    header: gettingcustomization?.header || "",
                    footer: gettingcustomization?.footer || "",
                    backgroundImageUrl: checkBox ? "" : (gettingcustomization?.backgroundImageUrl || ""),
                    headermargin: defaultpdfsetting?.headermargin || gettingcustomization?.headermargin || "2.8",
                    footermargin: defaultpdfsetting?.footermargin || gettingcustomization?.footermargin || "1",
                    marginRight: defaultpdfsetting?.marginRight || gettingcustomization?.marginRight || "0",
                    marginLeft: defaultpdfsetting?.marginLeft || gettingcustomization?.marginLeft || "0",
                    investigationmargin: defaultpdfsetting?.investigationmargin || gettingcustomization?.investigationmargin || 40,
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

    const headermarginPx = cmToPx(parseFloat(mergedValues.headermargin));
    const footermarginPx = cmToPx(parseFloat(mergedValues.footermargin));
    const marginRightPx = mergedValues.marginRight ? cmToPx(parseFloat(mergedValues.marginRight)) : 0;
    const marginLeftPx = mergedValues.marginLeft ? cmToPx(parseFloat(mergedValues.marginLeft)) : 0;

    const browser = await puppeteer.launch({});
    const page = await browser.newPage();

    const contentWithCssAndImage = `
        <html>
            <head>
                <style>
                    *{
                        margin: 0px;
                        padding: 0px;
                        box-sizing: border-box;
                    }
                    ${mergedValues.cssContent}
                    .wrong i, .delete-btn i {
                        display: none;
                    }
                    h2 {
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .headings {
                        margin-top: 0 !important;
                        margin-bottom: 0px !important;
                    }
                    tr,th {
                        font-size: ${mergedValues.selectedFontSize}px !important;
                    }
                    td {
                        padding-top: ${parseFloat(mergedValues.RowSpacing) / 2}px !important;
                        padding-bottom: ${parseFloat(mergedValues.RowSpacing) / 2}px !important;
                    }
                    td .HL span {
                        display: ${mergedValues.HighLow ? 'block' : 'none'};
                    }
                    .high-low span{
                        color: ${mergedValues.HLinred ? 'red' : 'black'} !important;
                    }
                    .BoldRow {
                        font-weight: ${mergedValues.BoldRow ? 'bold' : '400'} !important; 
                    }
                    .deletion {
                        display: none !important;
                    }
                    td.wrong {
                        display: none !important;
                    }
                    .details-row {
                        font-size: 10px !important;
                    }
                    .methods {
                        font-size: 8px !important;
                        color: #565656 !important;
                        margin-top: 2px !important;
                    }
                </style>
            </head>
            <body>
                <div class="middle">
                ${mergedValues.htmlContent}
                </div>
            </body>
        </html>`;

    await page.setContent(contentWithCssAndImage, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
        format: 'A4',
        displayHeaderFooter: true,
        headerTemplate: `
            <html>
                <head>
                    <style>
                        *{
                            margin: 0px;
                            padding: 0px;
                            box-sizing: border-box;
                        }
                        .pdf-header-div, .pdf-header-div * {
                            margin-bottom: 0 !important;
                        }
                        .pdf-header-div {
                            width: ${format3 ? "100%" : "95%"}; 
                            margin: 0 auto;
                            border: ${format3 ? "none" : "1px solid black"};
                            margin-top: 0cm !important;
                        }
                        .report-details, .report-details * {
                            margin-top: 0 !important;
                        }
                        .report-details-innerDiv2 {
                            width: ${format3 ? "95%" : "100%"} !important;
                            font-size: 12px;
                            margin-top: ${mergedValues.headermargin}cm !important;
                            border: none !important;
                        }
                        #investDiv {
                            display: ${mergedValues.showInvest ? 'flex' : 'none'}
                            }
                        .time-div {
                            width: 40% !important;
                        }
                    </style>
                </head>
                <body>
                    <div class="pdf-header-div"> 
                    ${mergedValues.header}
                </div>
                </body>
            </html>`,
        footerTemplate: `
            <html>
                <head>
                    <style>
                        *{
                            margin: 0px;
                            padding: 0px;
                            box-sizing: border-box;
                        }
                        ${mergedValues.cssContent}
                        .pdf-footer-div {
                            width: 92%; 
                            display: flex;
                            justify-content: center;
                            font-size: 12px; 
                            font-weight: 450; 
                            text-align: center; 
                            margin: 0px auto;
                            margin-bottom: ${footermarginPx}px;
                        }
                    </style>
                </head>
                <body>
            <div class="pdf-footer-div">
                ${mergedValues.footer}
            </div>
                </body>
            </html>`,
        margin: {
            top: `${headermarginPx + (format3 ? ((mergedValues.investigationmargin * 1.10) + (layerone ? (mergedValues.investigationmargin < 110 ? 75 : 15) : (mergedValues.investigationmargin < 160 ? 55 : 0))) : ((mergedValues.investigationmargin * 0.90) + (layerone ? 10 : 0)))}px`,
            bottom: '175px',
            left: `10px`,
            right: `10px`
        },
    });

    await browser.close();

    // Add background if needed
    const finalPdfBuffer = await addBackgroundToPdf(pdfBuffer, mergedValues.backgroundImageUrl);

    // Adjust margins
    const finalpdfbufferwithmargin = await adjustPdfMargins(finalPdfBuffer, marginRightPx, marginLeftPx);

    return finalpdfbufferwithmargin;
}


const getpdfcontrolleruser = async (req, res) => {

    const { value1, checkBox, htmlContent, cssContent, header, footer, backgroundImageUrl,
        headermargin, footermargin, marginRight, marginLeft, selectedFontSize, RowSpacing, HighLow,
        HLinred, BoldRow, showInvest, DownloadPdf, investigationmargin, showlab, showdoctorfirst,
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
                showInvest: showInvest ?? gettingcustomization?.showInvest ?? false, // Updated logic     
                BoldRow: BoldRow ?? gettingcustomization?.BoldRow ?? false, // Updated logic     
                HLinred: HLinred ?? gettingcustomization?.HLinred ?? false, // Updated logic     
                HighLow: HighLow ?? gettingcustomization?.HighLow ?? false, // Updated logic     
                RowSpacing: RowSpacing || gettingcustomization.RowSpacing || 7,
                selectedFontSize: selectedFontSize || gettingcustomization.selectedFontSize || 12,
                reportId: value1,
                htmlContent: htmlContent || gettingcustomization?.htmlContent || "", // Priority: Database > Request > Default
                cssContent: cssContent || gettingcustomization?.cssContent || "",
                header: header || gettingcustomization?.header || "",
                footer: footer || gettingcustomization?.footer || "",
                backgroundImageUrl: "",
                headermargin: headermargin || gettingcustomization?.headermargin || "2.8",
                footermargin: footermargin || gettingcustomization?.footermargin || "1",
                marginRight: marginRight || gettingcustomization?.marginRight || "0",
                marginLeft: marginLeft || gettingcustomization?.marginLeft || "0",
                investigationmargin: investigationmargin || gettingcustomization?.investigationmargin || 40,
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
                showInvest: showInvest ?? gettingcustomization?.showInvest ?? false, // Updated logic     
                BoldRow: BoldRow ?? gettingcustomization?.BoldRow ?? false, // Updated logic     
                HLinred: HLinred ?? gettingcustomization?.HLinred ?? false, // Updated logic     
                HighLow: HighLow ?? gettingcustomization?.HighLow ?? false, // Updated logic     
                RowSpacing: RowSpacing || gettingcustomization.RowSpacing || 8,
                selectedFontSize: selectedFontSize || gettingcustomization.selectedFontSize || 12,
                reportId: value1,
                htmlContent: htmlContent || gettingcustomization?.htmlContent || "", // Priority: Database > Request > Default
                cssContent: cssContent || gettingcustomization?.cssContent || "",
                header: header || gettingcustomization?.header || "",
                footer: footer || gettingcustomization?.footer || "",
                backgroundImageUrl: backgroundImageUrl || gettingcustomization?.backgroundImageUrl || "",
                headermargin: headermargin || gettingcustomization?.headermargin || "2.8",
                footermargin: footermargin || gettingcustomization?.footermargin || "1",
                marginRight: marginRight || gettingcustomization?.marginRight || "0",
                marginLeft: marginLeft || gettingcustomization?.marginLeft || "0",
                investigationmargin: investigationmargin || gettingcustomization?.investigationmargin || 40,
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
        reportId, htmlContent, cssContent, header, footer, backgroundImageUrl,
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
            return console.log('pdf data not found in database')
        }

        // Find the document by reportId
        const customizationData = await customization.findOne({ reportId: reportId });

        if (!customizationData) {
            return res.status(404).json({ message: "No customization found for the given Report ID" });
        }

        // Return the found document
        return res.status(200).json(customizationData);
    } catch (error) {
        console.error("Error fetching customization data:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const invoicepdfgenerator = async (req, res) => {
    let { invoiceHtml, invoicecss, billnumber, bookingId, generatedBy, billingPrice } = req.body;

    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Viewport set karein
        await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });

        const contentwithhtmlcss = `
        <html>
        <head>
        <style>
        ${invoicecss}
        </style>
        </head>
        <body>
        ${invoiceHtml}
        </body>
        </html>`;

        await page.setContent(contentwithhtmlcss, { waitUntil: 'load' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
        });

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
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        const contentwithhtmlcss = `
        <html>
        <head>
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

        await page.setContent(contentwithhtmlcss, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            landscape: true,
            margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
        });

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


