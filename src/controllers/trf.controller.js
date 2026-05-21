import bwipjs from "bwip-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { newBooking } from "../models/NewBooking.model.js";
import { testSchema } from "../models/newTest.model.js";
import { addPannel } from "../models/AddPannel.model.js";
import { Package } from "../models/addPackage.model.js";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN_X = 30;
const PAGE_MARGIN_TOP = 34;
const PAGE_MARGIN_BOTTOM = 34;
const CONTENT_WIDTH = A4_WIDTH - (PAGE_MARGIN_X * 2);
const TABLE_COLUMNS = [
    { key: "department", label: "Department", width: 108, align: "left" },
    { key: "investigation", label: "Investigation", width: 170, align: "left" },
    { key: "sampleType", label: "Sample Type", width: 84, align: "left" },
    { key: "barcode", label: "Barcode", width: 108, align: "center" },
    { key: "patientSign", label: "Patient Sign", width: 65, align: "center" }
];

const BORDER_COLOR = rgb(0.17, 0.17, 0.17);
const LIGHT_BORDER_COLOR = rgb(0.42, 0.42, 0.42);
const TEXT_COLOR = rgb(0.08, 0.08, 0.08);
const HEADER_FILL = rgb(0.96, 0.96, 0.96);

const canManageBookingsAcrossTenant = (req) => (
    req.user.role === "admin"
    || (req.user.role === "staff" && req.user.permissions?.canManageBookings)
);

const getEffectiveBookingUserId = (req) => (
    req.user.role === "staff" ? req.user.parentUser : req.user._id
);

const buildBookingAccessQuery = (req, bookingId) => {
    const query = {
        tenantId: req.user.tenantId._id,
        bookingId
    };

    if (!canManageBookingsAcrossTenant(req)) {
        query.createdBy = getEffectiveBookingUserId(req);
    }

    return query;
};

const safeText = (value, fallback = "--") => {
    const normalized = String(value ?? "").trim();
    return normalized || fallback;
};

const normalizeName = (value) => String(value || "").trim().toLowerCase();

const formatDateTime = (dateValue, timeValue = "") => {
    const rawDate = dateValue ? new Date(dateValue) : null;

    if (!rawDate || Number.isNaN(rawDate.getTime())) {
        return [safeText(dateValue, ""), safeText(timeValue, "")]
            .filter(Boolean)
            .join(" ")
            .trim() || "--";
    }

    const datePart = rawDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });

    let timePart = "";
    if (timeValue) {
        const parsedTime = new Date(`1970-01-01T${timeValue}`);
        timePart = Number.isNaN(parsedTime.getTime())
            ? String(timeValue)
            : parsedTime.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
            });
    } else {
        timePart = rawDate.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        });
    }

    return `${datePart} ${timePart}`.trim();
};

const formatAgeGender = (ageValue, gender) => {
    const text = String(ageValue || "").trim();
    const [amountRaw = "", unitRaw = "years"] = text.split(/\s+/);
    const amount = Number.parseInt(amountRaw, 10);
    let years = 0;
    let months = 0;
    let days = 0;
    const unit = String(unitRaw || "years").toLowerCase();

    if (Number.isFinite(amount) && amount >= 0) {
        if (unit.startsWith("month")) {
            months = amount;
        } else if (unit.startsWith("day")) {
            days = amount;
        } else {
            years = amount;
        }
    }

    return `${years}Y ${months}M ${days}D, ${safeText(gender)}`;
};

const sanitizeFilenamePart = (value) => (
    String(value || "")
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
        .replace(/\s+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60) || "Patient"
);

const getDepartmentLabel = (category) => {
    if (typeof category === "string") {
        return safeText(category, "GENERAL");
    }

    if (category && typeof category === "object") {
        return safeText(category.category || category.name || category.label, "GENERAL");
    }

    return "GENERAL";
};

const truncateText = (value, maxLength = 42) => {
    const text = safeText(value, "");
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
};

const drawText = (page, text, x, y, options = {}) => {
    page.drawText(String(text ?? ""), {
        x,
        y,
        size: options.size ?? 9,
        font: options.font,
        color: options.color ?? TEXT_COLOR
    });
};

const drawLabelValue = (page, labelFont, valueFont, label, value, x, y, labelWidth, valueWidth) => {
    drawText(page, label, x, y, { font: labelFont, size: 9 });
    const renderedValue = truncateText(value, Math.max(18, Math.floor(valueWidth / 5.5)));
    drawText(page, renderedValue, x + labelWidth, y, { font: valueFont, size: 9 });
};

const buildTestMetadataLookup = async (booking) => {
    const tableData = Array.isArray(booking?.tableData) ? booking.tableData : [];
    const testIds = new Set();
    const panelIds = new Set();
    const packageIds = new Set();

    tableData.forEach((row) => {
        const ids = Array.isArray(row?.ids) ? row.ids : [];
        ids.forEach((entry) => {
            const id = entry?.id?.toString?.() || String(entry?.id || "").trim();
            if (!id) return;

            if (entry.collectionName === "testSchema") testIds.add(id);
            if (entry.collectionName === "addPannel") panelIds.add(id);
            if (entry.collectionName === "Package") packageIds.add(id);
        });
    });

    const [tests, panels, packages] = await Promise.all([
        testIds.size
            ? testSchema.find({ _id: { $in: Array.from(testIds) } }).select("Name category sampleType").lean()
            : Promise.resolve([]),
        panelIds.size
            ? addPannel.find({ _id: { $in: Array.from(panelIds) } }).select("name category sample_types tests testsId").populate("testsId", "Name category sampleType").lean()
            : Promise.resolve([]),
        packageIds.size
            ? Package.find({ _id: { $in: Array.from(packageIds) } }).select("packageName testIds pannelIds").populate("testIds", "Name category sampleType").populate({
                path: "pannelIds",
                select: "name category sample_types tests testsId",
                populate: {
                    path: "testsId",
                    select: "Name category sampleType"
                }
            }).lean()
            : Promise.resolve([])
    ]);

    return {
        testsById: new Map(tests.map((item) => [String(item._id), item])),
        panelsById: new Map(panels.map((item) => [String(item._id), item])),
        packagesById: new Map(packages.map((item) => [String(item._id), item]))
    };
};

const expandPanelInvestigations = (panel, fallbackSampleType) => {
    const nestedTests = Array.isArray(panel?.testsId) ? panel.testsId : [];
    if (nestedTests.length > 0) {
        return nestedTests.map((test) => ({
            department: getDepartmentLabel(test?.category || panel?.category),
            investigation: safeText(test?.Name, safeText(panel?.name)),
            sampleType: safeText(fallbackSampleType || test?.sampleType, "Sample")
        }));
    }

    const tests = Array.isArray(panel?.tests) ? panel.tests : [];
    if (tests.length > 0) {
        return tests.map((name) => ({
            department: getDepartmentLabel(panel?.category),
            investigation: safeText(name, safeText(panel?.name)),
            sampleType: safeText(fallbackSampleType || panel?.sample_types?.[0], "Sample")
        }));
    }

    return [{
        department: getDepartmentLabel(panel?.category),
        investigation: safeText(panel?.name),
        sampleType: safeText(fallbackSampleType || panel?.sample_types?.[0], "Sample")
    }];
};

const expandPackageInvestigations = (pkg, fallbackSampleType) => {
    const investigations = [];
    const normalizedSampleType = normalizeName(fallbackSampleType);

    (Array.isArray(pkg?.testIds) ? pkg.testIds : []).forEach((test) => {
        if (normalizedSampleType && normalizeName(test?.sampleType) && normalizeName(test.sampleType) !== normalizedSampleType) {
            return;
        }

        investigations.push({
            department: getDepartmentLabel(test?.category),
            investigation: safeText(test?.Name),
            sampleType: safeText(fallbackSampleType || test?.sampleType, "Sample")
        });
    });

    (Array.isArray(pkg?.pannelIds) ? pkg.pannelIds : []).forEach((panel) => {
        const panelSampleTypes = Array.isArray(panel?.sample_types) ? panel.sample_types.map(normalizeName) : [];
        if (normalizedSampleType && panelSampleTypes.length > 0 && !panelSampleTypes.includes(normalizedSampleType)) {
            return;
        }

        investigations.push(...expandPanelInvestigations(panel, fallbackSampleType));
    });

    if (investigations.length > 0) {
        return investigations;
    }

    return [{
        department: "GENERAL",
        investigation: safeText(pkg?.packageName),
        sampleType: safeText(fallbackSampleType, "Sample")
    }];
};

const buildTrfRows = async (booking) => {
    const metadata = await buildTestMetadataLookup(booking);
    const rows = [];
    const seenRows = new Set();
    const tableData = Array.isArray(booking?.tableData) ? booking.tableData : [];

    tableData.forEach((row) => {
        const fallbackSampleType = safeText(row?.typeOfSample, "Sample");
        const barcodeNumber = safeText(row?.barcodeId || row?.confirmBarcodeId, "");
        const investigations = [];
        const ids = Array.isArray(row?.ids) ? row.ids : [];

        ids.forEach((entry) => {
            const id = entry?.id?.toString?.() || String(entry?.id || "").trim();
            if (!id) return;

            if (entry.collectionName === "testSchema") {
                const test = metadata.testsById.get(id);
                if (test) {
                    investigations.push({
                        department: getDepartmentLabel(test.category),
                        investigation: safeText(test.Name),
                        sampleType: safeText(fallbackSampleType || test.sampleType, "Sample")
                    });
                }
                return;
            }

            if (entry.collectionName === "addPannel") {
                const panel = metadata.panelsById.get(id);
                if (panel) {
                    investigations.push(...expandPanelInvestigations(panel, fallbackSampleType));
                }
                return;
            }

            if (entry.collectionName === "Package") {
                const pkg = metadata.packagesById.get(id);
                if (pkg) {
                    investigations.push(...expandPackageInvestigations(pkg, fallbackSampleType));
                }
            }
        });

        if (investigations.length === 0) {
            const rawNames = String(row?.testName || "")
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean);

            rawNames.forEach((name) => {
                investigations.push({
                    department: "GENERAL",
                    investigation: name,
                    sampleType: fallbackSampleType
                });
            });
        }

        investigations.forEach((item) => {
            const uniqueKey = [
                normalizeName(item.department),
                normalizeName(item.investigation),
                normalizeName(item.sampleType),
                barcodeNumber
            ].join("__");

            if (seenRows.has(uniqueKey)) {
                return;
            }

            seenRows.add(uniqueKey);
            rows.push({
                department: safeText(item.department, "GENERAL"),
                investigation: safeText(item.investigation),
                sampleType: safeText(item.sampleType, "Sample"),
                barcode: barcodeNumber,
                patientSign: ""
            });
        });
    });

    if (rows.length > 0) {
        return rows;
    }

    return [{
        department: "GENERAL",
        investigation: safeText(booking?.selectedItems?.[0]?.itemName || booking?.patientName),
        sampleType: safeText(booking?.tableData?.[0]?.typeOfSample, "Sample"),
        barcode: safeText(booking?.tableData?.[0]?.barcodeId, ""),
        patientSign: ""
    }];
};

const createBarcodeBuffer = async (barcodeNumber) => {
    if (!barcodeNumber) {
        return null;
    }

    return bwipjs.toBuffer({
        bcid: "code128",
        text: String(barcodeNumber),
        scale: 2,
        height: 12,
        includetext: false,
        backgroundcolor: "FFFFFF"
    });
};

const drawStaticHeader = (page, fonts, booking) => {
    const leftX = PAGE_MARGIN_X;
    const topY = A4_HEIGHT - PAGE_MARGIN_TOP;
    const title = "TRF (Test Requisition Form)";

    page.drawRectangle({
        x: leftX,
        y: PAGE_MARGIN_BOTTOM,
        width: CONTENT_WIDTH,
        height: A4_HEIGHT - PAGE_MARGIN_TOP - PAGE_MARGIN_BOTTOM,
        borderColor: BORDER_COLOR,
        borderWidth: 0.8
    });

    const titleWidth = fonts.bold.widthOfTextAtSize(title, 15);
    drawText(page, title, leftX + ((CONTENT_WIDTH - titleWidth) / 2), topY - 18, {
        font: fonts.bold,
        size: 15
    });

    const infoBoxTop = topY - 32;
    const infoBoxHeight = 72;
    const infoBoxBottom = infoBoxTop - infoBoxHeight;
    const rightColumnX = leftX + (CONTENT_WIDTH / 2) + 8;

    page.drawRectangle({
        x: leftX,
        y: infoBoxBottom,
        width: CONTENT_WIDTH,
        height: infoBoxHeight,
        borderColor: BORDER_COLOR,
        borderWidth: 0.8
    });

    page.drawLine({
        start: { x: leftX + (CONTENT_WIDTH / 2), y: infoBoxBottom },
        end: { x: leftX + (CONTENT_WIDTH / 2), y: infoBoxTop },
        thickness: 0.6,
        color: LIGHT_BORDER_COLOR
    });

    const lineStartY = infoBoxTop - 14;
    const rowGap = 14;

    drawLabelValue(page, fonts.bold, fonts.regular, "Patient Name :", safeText(booking.patientName), leftX + 10, lineStartY, 76, 160);
    drawLabelValue(page, fonts.bold, fonts.regular, "Age/Gender :", formatAgeGender(booking.year, booking.gender), leftX + 10, lineStartY - rowGap, 76, 160);
    drawLabelValue(page, fonts.bold, fonts.regular, "Referred By :", safeText(booking.savedDoctor || booking.doctorName), leftX + 10, lineStartY - (rowGap * 2), 76, 160);
    drawLabelValue(page, fonts.bold, fonts.regular, "Phone No. :", safeText(booking.patientPhone), leftX + 10, lineStartY - (rowGap * 3), 76, 160);

    drawLabelValue(page, fonts.bold, fonts.regular, "Patient ID :", safeText(booking.bookingId), rightColumnX, lineStartY, 70, 150);
    drawLabelValue(page, fonts.bold, fonts.regular, "Billing Date :", formatDateTime(booking.createdAt || booking.date, booking.createdAt ? "" : booking.time), rightColumnX, lineStartY - rowGap, 70, 150);

    return infoBoxBottom - 14;
};

const drawTableHeader = (page, fonts, startY) => {
    let currentX = PAGE_MARGIN_X;
    const headerHeight = 24;

    TABLE_COLUMNS.forEach((column) => {
        page.drawRectangle({
            x: currentX,
            y: startY - headerHeight,
            width: column.width,
            height: headerHeight,
            borderColor: BORDER_COLOR,
            borderWidth: 0.7,
            color: HEADER_FILL
        });

        const textWidth = fonts.bold.widthOfTextAtSize(column.label, 8.7);
        drawText(page, column.label, currentX + Math.max(5, (column.width - textWidth) / 2), startY - 15.5, {
            font: fonts.bold,
            size: 8.7
        });

        currentX += column.width;
    });

    return startY - headerHeight;
};

const drawRowBorders = (page, y, height) => {
    let currentX = PAGE_MARGIN_X;
    TABLE_COLUMNS.forEach((column) => {
        page.drawRectangle({
            x: currentX,
            y: y - height,
            width: column.width,
            height,
            borderColor: LIGHT_BORDER_COLOR,
            borderWidth: 0.55
        });
        currentX += column.width;
    });
};

const generateTrfPdfBuffer = async (booking) => {
    const rows = await buildTrfRows(booking);
    const pdfDoc = await PDFDocument.create();
    const fonts = {
        regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    };
    const barcodeCache = new Map();

    const getBarcodeImage = async (barcodeNumber) => {
        if (!barcodeNumber) {
            return null;
        }

        if (!barcodeCache.has(barcodeNumber)) {
            const buffer = await createBarcodeBuffer(barcodeNumber);
            barcodeCache.set(
                barcodeNumber,
                buffer ? await pdfDoc.embedPng(buffer) : null
            );
        }

        return barcodeCache.get(barcodeNumber);
    };

    let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    let cursorY = drawStaticHeader(page, fonts, booking);
    cursorY = drawTableHeader(page, fonts, cursorY);

    for (const row of rows) {
        const rowHeight = 64;
        if (cursorY - rowHeight < PAGE_MARGIN_BOTTOM + 10) {
            page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
            cursorY = drawStaticHeader(page, fonts, booking);
            cursorY = drawTableHeader(page, fonts, cursorY);
        }

        drawRowBorders(page, cursorY, rowHeight);

        let currentX = PAGE_MARGIN_X;
        const textY = cursorY - 18;
        const secondaryTextY = cursorY - 31;

        drawText(page, truncateText(row.department, 20), currentX + 5, textY, { font: fonts.bold, size: 8.3 });
        currentX += TABLE_COLUMNS[0].width;

        drawText(page, truncateText(row.investigation, 28), currentX + 5, textY, { font: fonts.regular, size: 8.3 });
        currentX += TABLE_COLUMNS[1].width;

        drawText(page, truncateText(row.sampleType, 14), currentX + 5, textY, { font: fonts.regular, size: 8.3 });
        currentX += TABLE_COLUMNS[2].width;

        const barcodeImage = await getBarcodeImage(row.barcode);
        if (barcodeImage) {
            const maxWidth = TABLE_COLUMNS[3].width - 14;
            const maxHeight = 20;
            const ratio = Math.min(maxWidth / barcodeImage.width, maxHeight / barcodeImage.height);
            const barcodeWidth = barcodeImage.width * ratio;
            const barcodeHeight = barcodeImage.height * ratio;
            const barcodeX = currentX + ((TABLE_COLUMNS[3].width - barcodeWidth) / 2);
            const barcodeY = cursorY - 10 - barcodeHeight;

            page.drawImage(barcodeImage, {
                x: barcodeX,
                y: barcodeY,
                width: barcodeWidth,
                height: barcodeHeight
            });

            const numberText = safeText(row.barcode, "");
            const numberWidth = fonts.regular.widthOfTextAtSize(numberText, 7.4);
            drawText(page, numberText, currentX + Math.max(5, (TABLE_COLUMNS[3].width - numberWidth) / 2), cursorY - 49, {
                font: fonts.regular,
                size: 7.4
            });
        } else {
            drawText(page, "--", currentX + (TABLE_COLUMNS[3].width / 2) - 5, textY, { font: fonts.regular, size: 8.3 });
        }
        currentX += TABLE_COLUMNS[3].width;

        page.drawLine({
            start: { x: currentX + 9, y: cursorY - 34 },
            end: { x: currentX + TABLE_COLUMNS[4].width - 9, y: cursorY - 34 },
            thickness: 0.5,
            color: LIGHT_BORDER_COLOR
        });

        cursorY -= rowHeight;
    }

    return Buffer.from(await pdfDoc.save());
};

const generateTrfSlipController = async (req, res) => {
    try {
        const bookingId = String(req.params.bookingId || "").trim();
        if (!bookingId) {
            return res.status(400).json({ success: false, message: "Booking ID is required" });
        }

        const booking = await newBooking.findOne(buildBookingAccessQuery(req, bookingId)).lean();
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        const pdfBuffer = await generateTrfPdfBuffer(booking);
        const patientName = sanitizeFilenamePart(booking.patientName);
        const patientId = sanitizeFilenamePart(booking.bookingId);
        const filename = `TRF_${patientName}_${patientId}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
        res.setHeader("Content-Length", String(pdfBuffer.length));
        res.setHeader("Cache-Control", "private, max-age=60");

        return res.status(200).send(pdfBuffer);
    } catch (error) {
        console.error("TRF generation failed:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate TRF slip"
        });
    }
};

export { generateTrfSlipController };
