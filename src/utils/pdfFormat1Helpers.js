import * as cheerio from "cheerio";
import {
  loadOfflineHtmlIntoPage,
  readAssetAsBuffer,
  rewriteHtmlForOfflinePdf,
  sanitizePdfCss,
  sanitizePdfMarkup,
} from "./pdfOfflineAssets.js";
import {
  buildLegacyAbnormalHighlightCss,
  normalizeLegacyPdfBodyHtml,
} from "./pdfAbnormalHighlight.js";
import { applySignatureLayoutToFooterHtml } from "./pdfSignatureLayout.js";

export const FORMAT1_HEADER_FONT_SIZE_PX = 10;
const FORMAT1_SIDE_PAD_PX = 28;
const DEFAULT_PDF_FONT_FAMILY = "Arial";

const PDF_FONT_STACKS = Object.freeze({
  Arial: '"Arial", "Helvetica Neue", Helvetica, sans-serif',
  "Segoe UI": '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  Calibri: 'Calibri, "Segoe UI", sans-serif',
  Verdana: "Verdana, Geneva, sans-serif",
  Tahoma: "Tahoma, Geneva, sans-serif",
  "Trebuchet MS": '"Trebuchet MS", Helvetica, sans-serif',
  Georgia: 'Georgia, "Times New Roman", serif',
  "Times New Roman": '"Times New Roman", Times, serif',
  Garamond: "Garamond, Georgia, serif",
  "Courier New": '"Courier New", Courier, monospace',
});

export const parseNumericPref = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const resolveFormat1FontStack = (selectedFontFamily) => {
  const normalized = String(selectedFontFamily || "").trim();
  return PDF_FONT_STACKS[normalized] || PDF_FONT_STACKS[DEFAULT_PDF_FONT_FAMILY];
};

export const computeFormat1RowPadY = (rowSpacingValue) => {
  const units = parseNumericPref(rowSpacingValue, 7);
  if (units <= 0) return 2;
  if (units <= 5) {
    return Number((2.8 + (units - 1) * 1.15).toFixed(2));
  }
  return Number(Math.max(3.5, Math.min(10, units / 2)).toFixed(2));
};

/**
 * Identifies whether a PDF generation request targets Report Format 1.
 */
export const isReportFormat1 = ({
  pdfformat = "",
  format3 = false,
  header = "",
  htmlContent = "",
  cssContent = "",
} = {}) => {
  const normalized = String(pdfformat || "").trim();
  if (normalized === "reportFormat1") return true;
  if (
    format3 ||
    ["reportFormat", "reportFormat3", "reportFormat4", "reportFormat5"].includes(normalized)
  ) {
    return false;
  }
  const combined = `${header || ""}\n${htmlContent || ""}\n${cssContent || ""}`;
  if (/oh5-|sec-tbl|sec-hdr|format1-right3/i.test(combined)) {
    return false;
  }
  return /rf1-header-card|container-format1|format1left2|format1-right2/i.test(combined);
};

/**
 * Inlines every <img src="..."> inside headerTemplate/footerTemplate into Base64
 * data URIs so Chromium's sandboxed print header/footer never drops file:// images.
 */
export const inlineTemplateImagesAsDataUris = async (htmlMarkup = "") => {
  const raw = String(htmlMarkup || "");
  if (!raw.trim() || !/<img\b/i.test(raw)) return raw;

  const $ = cheerio.load(raw, { decodeEntities: false });
  const imgs = $("img").toArray();

  for (const el of imgs) {
    const $img = $(el);
    const src = String($img.attr("src") || "").trim();
    if (!src) {
      $img.remove();
      continue;
    }
    if (src.startsWith("data:")) continue;

    try {
      const asset = await readAssetAsBuffer(src);
      const rawMime = String(asset?.mimeType || "").trim();
      const isSupportedImageMime =
        !rawMime || /^(?:image\/|application\/octet-stream)/i.test(rawMime);
      if (asset?.buffer && asset.buffer.length > 0 && isSupportedImageMime) {
        const mime = /^image\//i.test(rawMime) ? rawMime : "image/png";
        $img.attr("src", `data:${mime};base64,${asset.buffer.toString("base64")}`);
      } else {
        $img.remove();
      }
    } catch {
      $img.remove();
    }
  }

  return $.html();
};

const stripInlineFontSize = (styleAttr = "") =>
  String(styleAttr || "")
    .replace(/(?:^|;)\s*font-size\s*:[^;]+;?/gi, ";")
    .replace(/;{2,}/g, ";")
    .replace(/^;|;$/g, "")
    .trim();

/**
 * Normalizes Format 1 header markup (both current and legacy saved headers)
 * so overlapping `.format1-rightcover` boxes and inline font sizes are removed.
 */
export const normalizeFormat1HeaderMarkup = (rawHeader = "") => {
  const safeHeader = sanitizePdfMarkup(rawHeader);
  if (!safeHeader.trim()) return safeHeader;

  const $ = cheerio.load(safeHeader, { decodeEntities: false });
  $(".wrong, .delete-btn, .deletion").remove();

  // Strip any inline font-size from header elements so the 10px lock cannot be bypassed
  $("*").each((_, el) => {
    const $el = $(el);
    const styleAttr = $el.attr("style");
    if (styleAttr && /font-size/i.test(styleAttr)) {
      const cleanedStyle = stripInlineFontSize(styleAttr);
      if (cleanedStyle) $el.attr("style", cleanedStyle);
      else $el.removeAttr("style");
    }
  });

  // Migrate legacy `.format1-rightcover` accession text into `.rf1-barcode-band`
  const $rightCover = $(".format1-rightcover").first();
  if ($rightCover.length) {
    const accessionText = $rightCover.text().replace(/\s+/g, " ").trim();
    const $right2 = $(".format1-right2").first();
    const $barcodeImg = $right2.find("#barcodeImage").first();
    if ($right2.length && !$right2.find(".rf1-barcode-band").length) {
      const $firstRegDiv = $barcodeImg.closest(".format1-registered-div2");
      const imgHtml = $barcodeImg.length ? $.html($barcodeImg) : "";
      const bandHtml = `
        <div class="rf1-barcode-band">
          <div class="barcode-div2"><div class="barcode2"><div id="barcodeContainer2">${imgHtml}</div></div></div>
          ${accessionText ? `<span class="rf1-accession-id">${accessionText}</span>` : ""}
        </div>`;
      if ($firstRegDiv.length) {
        $firstRegDiv.replaceWith(bandHtml);
      } else {
        $right2.prepend(bandHtml);
      }
    }
    $rightCover.remove();
  }

  // Ensure Patient Name carries `.rf1-patient-name` styling class
  const $patientValue = $(".format1left2 .format1-infor-div").first().find(".value").first();
  if ($patientValue.length) {
    $patientValue.addClass("rf1-patient-name");
  }

  // Ensure `#investDiv` always sits neatly under timestamps in `.format1-right2` (even for legacy saved headers)
  // and clear any stale inline display:none persisted by older 1layer saves.
  const $right2 = $(".format1-right2").first();
  const $investDiv = $("#investDiv").first();
  if ($investDiv.length) {
    $investDiv.removeClass("forhide format1-infor-div").addClass("rf1-header-invest");
    const invStyle = String($investDiv.attr("style") || "")
      .replace(/(?:^|;)\s*display\s*:[^;]+;?/gi, ";")
      .replace(/;{2,}/g, ";")
      .replace(/^;|;$/g, "")
      .trim();
    if (invStyle) $investDiv.attr("style", invStyle);
    else $investDiv.removeAttr("style");

    $investDiv.find(".format1-tags").first().removeClass("format1-tags").addClass("rf1-invest-label");
    $investDiv.find(".value").first().removeClass("value").addClass("rf1-invest-value");
    if ($right2.length && !$right2.find("#investDiv").length) {
      $right2.append($investDiv);
    }
  }

  return $.html();
};

/**
 * Normalizes Format 1 body tables (fresh or legacy saved DB HTML) for consistent
 * 4-column widths, aligned Result + H/L rail, and valid tbody nesting.
 */
export const normalizeFormat1BodyMarkup = (rawBody = "") => {
  const safeBody = sanitizePdfMarkup(rawBody);
  if (!safeBody.trim()) return safeBody;

  const $ = cheerio.load(safeBody, { decodeEntities: false });

  // Strip interactive delete controls and explicit pixel column width overrides
  $(".wrong, .delete-btn, .deletion").remove();
  $("table.test-table colgroup").remove();

  $("table.test-table").each((_, tableEl) => {
    const $table = $(tableEl);
    const $theadThs = $table.find("thead tr").first().find("th");
    $theadThs.each((idx, thEl) => {
      const $th = $(thEl);
      $th.removeAttr("width");
      $th.css("width", "");
      if (idx === 0) $th.addClass("col-test");
      else if (idx === 1) $th.addClass("valuecell col-val");
      else if (idx === 2) $th.addClass("col-unit");
      else if (idx === 3) $th.addClass("col-ref");
    });

    // Move direct `table > tr` (e.g. legacy interpretation row) inside tbody
    let $tbody = $table.children("tbody").first();
    if (!$tbody.length) {
      $tbody = $("<tbody></tbody>");
      $table.append($tbody);
    }
    $table.children("tr").each((_, trEl) => {
      $tbody.append(trEl);
    });

    $tbody.children("tr").each((_, trEl) => {
      const $tr = $(trEl);
      const $tds = $tr.children("td");
      if ($tds.length === 1 && $tds.first().attr("colspan")) {
        $tds.first().attr("colspan", "4");
        return;
      }
      if ($tds.length >= 4) {
        const $nameTd = $tds.eq(0).addClass("test-name");
        const $valTd = $tds.eq(1).addClass("high-low");
        $tds.eq(2).addClass("unit-cell");
        $tds.eq(3).addClass("reference-cell");

        if (!$nameTd.attr("class")) $nameTd.addClass("test-name");

        if (!$valTd.find(".rf1-result-wrap").length) {
          const $hl = $valTd.find(".HL").first();
          const $marker = $valTd.find(".high-low-marker").first();
          const markerText = $marker.text().trim() || $hl.text().trim() || $tr.attr("data-flag") || "";
          const $valSpan = $valTd.find(".result-value").first();
          let valText = "";
          if ($valSpan.length) {
            valText = $valSpan.html() ?? $valSpan.text();
          } else {
            const $clone = $valTd.clone();
            $clone.find(".HL, .high-low-marker").remove();
            valText = $clone.text();
          }
          $valTd.html(
            `<div class="rf1-result-wrap"><span class="result-value">${valText}</span><div class="HL">${
              markerText ? `<span class="high-low-marker">${markerText}</span>` : ""
            }</div></div>`
          );
        }
      }
    });
  });

  // Normalize bottom End-Report divider class
  $(".container22 > h3").each((_, hEl) => {
    const $h = $(hEl);
    if (/end\s*report/i.test($h.text())) {
      $h.addClass("rf1-end-report");
    }
  });

  return $.html();
};

export const buildFormat1PdfHeaderTemplate = async ({
  headermargin,
  showInvest = true,
  header = "",
  selectedFontFamily = DEFAULT_PDF_FONT_FAMILY,
  layerone = false,
} = {}) => {
  const headerMarginCm = parseNumericPref(headermargin, 2.8);
  const headermarginPx = Math.round(headerMarginCm * 37.7952755906);
  const fontStack = resolveFormat1FontStack(selectedFontFamily);
  const normalizedHeader = normalizeFormat1HeaderMarkup(header);
  const showInvestResolved = showInvest !== false && showInvest !== "false";

  const fragment = [
    "<style>",
    "* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }",
    `.rf1-pdf-header-shell { width: 100%; padding: ${headermarginPx}px ${FORMAT1_SIDE_PAD_PX}px 0 ${FORMAT1_SIDE_PAD_PX}px; font-family: ${fontStack}; font-size: ${FORMAT1_HEADER_FONT_SIZE_PX}px !important; color: #0f172a; background: transparent; }`,
    ".pdf-header-div, .report-details { width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; }",
    `.pdf-header-div, .pdf-header-div *, .report-details, .report-details *, .report-details-innerDiv2, .report-details-innerDiv2 * {
      font-family: ${fontStack} !important;
      font-size: ${FORMAT1_HEADER_FONT_SIZE_PX}px !important;
      line-height: 1.32 !important;
    }`,
    ".report-details-innerDiv2 { width: 100% !important; display: flex !important; align-items: stretch !important; justify-content: space-between !important; border: 1px solid #cbd5e1 !important; border-top: 2.5px solid #1e3a5f !important; border-radius: 4px !important; background: #f8fafc !important; overflow: hidden !important; }",
    ".format1left2 { flex: 1.05 1 0 !important; min-width: 0 !important; width: auto !important; padding: 8px 12px !important; display: flex !important; flex-direction: column !important; justify-content: center !important; gap: 3px !important; }",
    ".format1-infor-div { display: flex !important; align-items: flex-start !important; gap: 6px !important; padding: 0 !important; margin: 0 !important; max-width: 100% !important; width: 100% !important; }",
    ".fixedheightdiv { max-width: 100% !important; width: 100% !important; }",
    ".format1-tags { width: 80px !important; min-width: 80px !important; flex-shrink: 0 !important; font-weight: 600 !important; color: #475569 !important; white-space: nowrap !important; }",
    ".format1-infor-div .value { flex: 1 1 auto !important; min-width: 0 !important; color: #0f172a !important; font-weight: 500 !important; word-break: break-word !important; overflow-wrap: anywhere !important; }",
    ".rf1-patient-name { font-weight: 700 !important; color: #0f172a !important; text-transform: uppercase; }",
    ".format1-right2 { position: static !important; transform: none !important; left: auto !important; top: auto !important; height: auto !important; flex: 1.08 0 282px !important; width: auto !important; border-left: 1px solid #cbd5e1 !important; padding: 8px 12px !important; display: flex !important; flex-direction: column !important; justify-content: center !important; gap: 3px !important; background: #ffffff !important; }",
    ".rf1-barcode-band { display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 8px !important; padding-bottom: 4px !important; margin-bottom: 2px !important; border-bottom: 1px dashed #cbd5e1 !important; }",
    ".barcode-div2, .barcode2, #barcodeContainer2 { display: flex !important; align-items: center !important; margin: 0 !important; padding: 0 !important; border: none !important; background: transparent !important; }",
    "#barcodeImage { display: block !important; width: 112px !important; height: 22px !important; object-fit: fill !important; margin: 0 !important; background: transparent !important; }",
    ".rf1-accession-id { font-weight: 700 !important; color: #1e3a5f !important; white-space: nowrap !important; font-variant-numeric: tabular-nums !important; }",
    ".format1-registered-div2 { width: 100% !important; display: flex !important; align-items: baseline !important; gap: 6px !important; padding: 0 !important; margin: 0 !important; }",
    ".format1-registeration-tag2 { width: 76px !important; min-width: 76px !important; flex-shrink: 0 !important; font-weight: 600 !important; color: #475569 !important; display: block !important; white-space: nowrap !important; }",
    ".format1-time-div { flex: 1 1 auto !important; width: auto !important; display: flex !important; align-items: baseline !important; justify-content: space-between !important; gap: 6px !important; color: #0f172a !important; white-space: nowrap !important; font-variant-numeric: tabular-nums !important; }",
    ".rf1-header-invest { width: 100% !important; display: flex !important; align-items: flex-start !important; gap: 6px !important; padding-top: 4px !important; margin-top: 2px !important; border-top: 1px dashed #cbd5e1 !important; }",
    ".rf1-invest-label { width: 76px !important; min-width: 76px !important; flex-shrink: 0 !important; font-weight: 700 !important; color: #0f766e !important; white-space: nowrap !important; }",
    ".rf1-invest-value { flex: 1 1 auto !important; min-width: 0 !important; color: #0f172a !important; font-weight: 600 !important; word-break: break-word !important; overflow-wrap: anywhere !important; }",
    ".click.qr-div { position: static !important; right: auto !important; top: auto !important; flex: 0 0 90px !important; border-left: 1px solid #cbd5e1 !important; padding: 6px 6px !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 2px !important; background: #f8fafc !important; text-align: center !important; }",
    ".click.qr-div.sign, .sign { display: none !important; }",
    "#qrimg { width: 56px !important; height: 56px !important; object-fit: contain !important; display: block !important; margin: 0 auto !important; background: #ffffff !important; }",
    ".branding { display: flex !important; flex-direction: column !important; align-items: center !important; text-align: center !important; color: #475569 !important; }",
    layerone ? ".forhide { display: none !important; }" : '.forhide[style*="display: none"], .forhide[style*="display:none"] { display: none !important; }',
    `#investDiv { display: ${showInvestResolved ? "flex" : "none"} !important; }`,
    "</style>",
    '<div class="rf1-pdf-header-shell" id="rf1PdfHeaderRoot">',
    `<div class="pdf-header-div">${normalizedHeader}</div>`,
    "</div>",
  ].join("\n");

  const offlineHtml = await rewriteHtmlForOfflinePdf(fragment);
  return inlineTemplateImagesAsDataUris(offlineHtml);
};

export const buildFormat1PdfFooterTemplate = async ({
  cssContent = "",
  footer = "",
  footermarginPx = 38,
  LeftsignPd = 0,
  Rightsignpd = 0,
  selectedFontSize = 12,
  selectedFontFamily = DEFAULT_PDF_FONT_FAMILY,
  signatureLayout = null,
  showlab,
  showdoctorfirst,
  showdoctorsecond,
} = {}) => {
  const safeCss = sanitizePdfCss(cssContent);
  const safeFooter = sanitizePdfMarkup(footer);
  const leftPadding = parseNumericPref(LeftsignPd, 0);
  const rightPadding = parseNumericPref(Rightsignpd, 0);
  const fontSize = Math.max(8, Math.min(20, parseNumericPref(selectedFontSize, 12)));
  const fontStack = resolveFormat1FontStack(selectedFontFamily);
  const sigResult = applySignatureLayoutToFooterHtml({
    rawFooterHtml: safeFooter,
    signatureLayout,
    baseFontSizePx: Math.max(8.5, fontSize - 1),
    isFormat5: false,
    showLab: showlab,
    showDoc1: showdoctorfirst,
    showDoc2: showdoctorsecond,
  });
  const resolvedFooterMarkup = sigResult.footerHtml || safeFooter;

  const fragment = [
    "<style>",
    "* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }",
    safeCss,
    `.rf1-pdf-footer-shell { width: 100%; padding: 6px ${FORMAT1_SIDE_PAD_PX}px ${Math.max(8, footermarginPx)}px ${FORMAT1_SIDE_PAD_PX}px; font-family: ${fontStack}; color: #0f172a; background: transparent; }`,
    `.pdf-footer-div { width: 100% !important; margin: 0 !important; padding-left: ${leftPadding}cm !important; padding-right: ${rightPadding}cm !important; border-top: 1px solid #cbd5e1; padding-top: 6px; font-family: ${fontStack} !important; font-size: ${fontSize}px !important; }`,
    `.pdf-footer-div .signed-off-div { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; box-shadow: none !important; border-radius: 0 !important; background: transparent !important; }`,
    `.pdf-footer-div .signed-off-div2 { width: 100% !important; display: flex !important; justify-content: space-between !important; align-items: flex-end !important; gap: 18px !important; }`,
    `.pdf-footer-div .left-sign { flex: 1 1 0; max-width: 210px; min-width: 110px; text-align: center !important; }`,
    `.pdf-footer-div .left-sign img { max-height: 36px; max-width: 120px; width: auto; height: auto; object-fit: contain; margin: 0 auto 3px auto; display: block; }`,
    `.pdf-footer-div .textspan { width: auto !important; min-width: 0 !important; max-width: 100% !important; text-align: center !important; font-family: ${fontStack} !important; font-size: ${Math.max(8.5, fontSize - 1).toFixed(1)}px !important; line-height: 1.28 !important; white-space: pre-line !important; color: #1e293b !important; }`,
    sigResult.layoutCss || "",
    ".sign { display: none !important; }",
    "</style>",
    '<div class="rf1-pdf-footer-shell" id="rf1PdfFooterRoot">',
    `<div class="pdf-footer-div">${resolvedFooterMarkup}</div>`,
    "</div>",
  ].join("\n");

  const offlineHtml = await rewriteHtmlForOfflinePdf(fragment);
  return inlineTemplateImagesAsDataUris(offlineHtml);
};

export const buildFormat1PdfBodyDocument = ({
  cssContent = "",
  htmlContent = "",
  header = "",
  selectedFontSize = 12,
  selectedFontFamily = DEFAULT_PDF_FONT_FAMILY,
  RowSpacing = 7,
  HighLow = true,
  HLinred = true,
  BoldRow = true,
  hideCategories = false,
  hideTableHeadings = false,
} = {}) => {
  const safeCss = sanitizePdfCss(cssContent);
  const highLowResolved = HighLow !== undefined ? Boolean(HighLow) : true;
  const hlInRedResolved = HLinred !== undefined ? Boolean(HLinred) : true;
  const boldRowResolved = BoldRow !== undefined ? Boolean(BoldRow) : true;

  const fontSize = Math.max(8, Math.min(20, parseNumericPref(selectedFontSize, 12)));
  const rowPadY = computeFormat1RowPadY(RowSpacing);
  const fontStack = resolveFormat1FontStack(selectedFontFamily);
  const categoryDisplay = hideCategories ? "none" : "block";
  const theadDisplay = hideTableHeadings ? "none" : "table-header-group";

  const upgradedMarkup = normalizeFormat1BodyMarkup(htmlContent);
  const normalizedBodyMarkup = normalizeLegacyPdfBodyHtml({
    htmlContent: upgradedMarkup,
    header,
    HighLow: highLowResolved,
    HLinred: hlInRedResolved,
    BoldRow: boldRowResolved,
  });

  const abnormalHighlightCss = buildLegacyAbnormalHighlightCss({
    HighLow: highLowResolved,
    HLinred: hlInRedResolved,
    BoldRow: boldRowResolved,
  });

  const catFontPx = (fontSize + 2).toFixed(1);
  const panelFontPx = (fontSize + 0.8).toFixed(1);
  const theadFontPx = Math.max(9.5, fontSize - 0.5).toFixed(1);
  const metaColFontPx = Math.max(9, fontSize - 0.4).toFixed(1);
  const methodFontPx = Math.max(8, fontSize - 2).toFixed(1);
  const flagFontPx = Math.max(7.5, fontSize - 2.5).toFixed(1);
  const calloutFontPx = Math.max(9, fontSize - 0.5).toFixed(1);

  return [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8" />',
    "<style>",
    "* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }",
    `html, body { width: 100%; background: transparent !important; font-family: ${fontStack} !important; color: #0f172a; font-size: ${fontSize}px; line-height: 1.35; font-variant-numeric: tabular-nums; }`,
    safeCss,
    `html, body, .middle, .container, .container2, .container-format1, .container22 { background-color: transparent !important; background-image: none !important; font-family: ${fontStack} !important; }`,
    `.middle { width: 100% !important; padding: 0 ${FORMAT1_SIDE_PAD_PX}px !important; font-size: ${fontSize}px !important; }`,
    ".middle .container-format1, .middle .container22, .middle .container2 { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; min-width: 0 !important; overflow: visible !important; }",
    ".middle > .container2 > .header, .middle .report-details, .wrong, .wrong i, .delete-btn, .delete-btn i, .deletion { display: none !important; }",
    ".section { margin-bottom: 24px !important; }",
    ".headings { display: flex !important; flex-direction: column !important; gap: 12px !important; margin: 0 0 12px 0 !important; width: 100% !important; text-align: center !important; }",
    `.headings > h3, .headings > .category-heading, .headings h3, .category-heading { display: ${categoryDisplay} !important; width: 100% !important; margin: 0 !important; padding: 6px 14px !important; background: #eff4fa !important; border-top: 1.5px solid #1e3a5f !important; border-bottom: 1px solid #cbd5e1 !important; border-radius: 3px !important; color: #1e3a5f !important; font-size: ${catFontPx}px !important; font-weight: 700 !important; text-transform: uppercase !important; letter-spacing: 0.08em !important; text-align: center !important; break-after: avoid !important; page-break-after: avoid !important; }`,
    `.headings > h4, .headings > .table-heading, .headings h4, .table-heading { display: ${hideTableHeadings ? "none" : "block"} !important; width: 100% !important; margin: 0 !important; padding: 5px 14px !important; background: #f8fafc !important; border: 1px solid #e2e8f0 !important; border-bottom: 1.5px solid #0f766e !important; border-radius: 3px !important; color: #0f766e !important; font-size: ${panelFontPx}px !important; font-weight: 700 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; text-align: center !important; break-after: avoid !important; page-break-after: avoid !important; }`,
    "table.test-table { width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; margin: 0 !important; font-variant-numeric: tabular-nums !important; page-break-inside: auto !important; }",
    `table.test-table thead { display: ${theadDisplay} !important; background-color: #eef2f7 !important; break-inside: avoid !important; page-break-inside: avoid !important; }`,
    `table.test-table thead th { background-color: #eef2f7 !important; color: #1e3a5f !important; font-size: ${theadFontPx}px !important; font-weight: 700 !important; text-transform: uppercase !important; letter-spacing: 0.04em !important; padding: 6px 8px !important; border-top: 1.5px solid #334155 !important; border-bottom: 1.5px solid #334155 !important; text-align: left !important; vertical-align: middle !important; }`,
    "table.test-table th.col-test, table.test-table td.test-name { width: 37% !important; text-align: left !important; word-break: break-word !important; overflow-wrap: break-word !important; }",
    "table.test-table th.valuecell, table.test-table th.col-val, table.test-table td.high-low { width: 22% !important; text-align: left !important; padding-left: 8px !important; }",
    "table.test-table th.col-unit, table.test-table td.unit-cell { width: 14% !important; text-align: left !important; }",
    "table.test-table th.col-ref, table.test-table td.reference-cell { width: 27% !important; text-align: left !important; white-space: pre-line !important; word-break: break-word !important; line-height: 1.3 !important; }",
    "table.test-table tbody { border-bottom: 1.5px solid #334155 !important; }",
    "table.test-table tbody tr { page-break-inside: avoid !important; break-inside: avoid !important; }",
    `table.test-table tbody td { font-size: ${fontSize}px !important; padding: ${rowPadY}px 8px !important; line-height: 1.32 !important; vertical-align: top !important; border-bottom: 1px solid #edf2f7 !important; color: #1e293b; }`,
    "table.test-table tbody tr:last-child td { border-bottom: none !important; }",
    "table.test-table tbody td.test-name { font-weight: 500; color: #0f172a; }",
    "table.test-table tbody td.parameter-name-cell { padding-left: 20px !important; font-weight: 400 !important; }",
    `table.test-table tbody td.unit-cell, table.test-table tbody td.reference-cell { font-size: ${metaColFontPx}px !important; color: #334155; }`,
    ".multi-parameter-heading-row td { padding-top: 6px !important; padding-bottom: 3px !important; background: #fafcfe !important; }",
    "td.multi-parameter-heading-cell { padding-left: 8px !important; }",
    `.multi-parameter-heading-text { font-size: ${fontSize}px !important; font-weight: 700 !important; color: #0f172a !important; text-decoration: none !important; border-bottom: 1px solid #cbd5e1 !important; padding-bottom: 1px !important; }`,
    ".rf1-result-wrap { display: grid !important; grid-template-columns: minmax(0, 1fr) 24px !important; align-items: center !important; column-gap: 6px !important; width: 100% !important; max-width: 145px !important; }",
    `.rf1-result-wrap .result-value { display: block !important; text-align: left !important; font-size: ${fontSize}px !important; word-break: break-word !important; }`,
    ".rf1-result-wrap .HL { width: 22px !important; min-width: 22px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; margin: 0 !important; }",
    ".rf1-result-wrap .HL .high-low-marker { margin-right: 0 !important; }",
    abnormalHighlightCss,
    `table.test-table tbody tr.is-normal-row td, table.test-table tbody tr.is-normal-row .result-value { font-size: ${fontSize}px !important; }`,
    `table.test-table tbody tr.is-normal-row td.unit-cell, table.test-table tbody tr.is-normal-row td.reference-cell { font-size: ${metaColFontPx}px !important; color: #334155 !important; }`,
    "table.test-table tbody td.is-first-visible-col { border-left: 3px solid transparent; padding-left: 8px !important; }",
    "table.test-table tbody tr.abnormal-result-row td.is-first-visible-col, table.test-table tbody tr.BoldRow td.is-first-visible-col { padding-left: 8px !important; }",
    "table.test-table tbody td.parameter-name-cell.is-first-visible-col, table.test-table tbody tr.abnormal-result-row td.parameter-name-cell.is-first-visible-col, table.test-table tbody tr.BoldRow td.parameter-name-cell.is-first-visible-col { padding-left: 20px !important; }",
    `td .HL span.high-low-marker { font-size: ${flagFontPx}px !important; min-width: 18px !important; height: 14px !important; }`,
    ".details-row { padding: 2px 8px 4px 8px !important; }",
    ".details-row .documented-content { padding-left: 10px !important; background: transparent !important; }",
    `.details-row, .details-row * { font-size: ${metaColFontPx}px !important; }`,
    `.methods, .methods * { font-size: ${methodFontPx}px !important; color: #64748b !important; font-style: italic !important; font-weight: 400 !important; line-height: 1.25 !important; }`,
    `td.remark-row, td.notes, td.advice, td.remarks, td.interpretation-cell { padding: 5px 8px !important; font-size: ${calloutFontPx}px !important; }`,
    `.rf1-callout, .interpretation, .moreDetails { font-size: ${calloutFontPx}px !important; line-height: 1.38 !important; }`,
    `.rf1-callout { display: block; padding: 5px 9px; background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid #0f766e; border-radius: 3px; color: #334155; font-style: normal; font-weight: 400; }`,
    `.rf1-callout-label { font-weight: 700; color: #0f766e; margin-right: 6px; text-transform: uppercase; font-size: ${methodFontPx}px !important; }`,
    `.interpretation { padding: 6px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid #1e3a5f; border-radius: 3px; color: #334155; }`,
    `.documented-content { font-size: ${fontSize}px !important; line-height: 1.4 !important; color: #0f172a; }`,
    `.documented-content table { width: 100% !important; border-collapse: collapse !important; margin: 4px 0 !important; }`,
    `.documented-content td, .documented-content th { border: 1px solid #cbd5e1 !important; padding: 4px 6px !important; font-size: ${metaColFontPx}px !important; }`,
    `.rf1-end-report { margin: 14px 0 4px 0 !important; text-align: center !important; font-size: ${methodFontPx}px !important; font-weight: 700 !important; letter-spacing: 0.14em !important; color: #64748b !important; text-transform: uppercase !important; }`,
    "</style>",
    "</head>",
    "<body>",
    `<div class="middle">${normalizedBodyMarkup}</div>`,
    "</body>",
    "</html>",
  ].join("\n");
};

const waitForPageImages = async (page) => {
  try {
    await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll("img"));
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise((resolve) => {
              if (!img.getAttribute("src") || (img.complete && img.naturalWidth > 0)) {
                resolve();
                return;
              }
              const timer = setTimeout(resolve, 2500);
              img.addEventListener("load", () => { clearTimeout(timer); resolve(); }, { once: true });
              img.addEventListener("error", () => { clearTimeout(timer); resolve(); }, { once: true });
            })
        )
      );
    });
  } catch {
    // Non-blocking safeguard
  }
};

/**
 * Generates an aligned, paginated Format 1 A4 PDF buffer with a strictly fixed 10px header.
 */
export const generateFormat1PagePdf = async ({
  page,
  htmlContent = "",
  cssContent = "",
  header = "",
  footer = "",
  selectedFontSize = 12,
  selectedFontFamily = DEFAULT_PDF_FONT_FAMILY,
  RowSpacing = 7,
  HighLow = true,
  HLinred = true,
  BoldRow = true,
  hideCategories = false,
  hideTableHeadings = false,
  headermargin = "2.8",
  footermarginPx = 38,
  LeftsignPd = 0,
  Rightsignpd = 0,
  showInvest = true,
  layerone = false,
  omitBackground = false,
  signatureLayout = null,
  showlab,
  showdoctorfirst,
  showdoctorsecond,
}) => {
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

  const headerTemplate = await buildFormat1PdfHeaderTemplate({
    headermargin,
    showInvest,
    header,
    selectedFontFamily,
    layerone,
  });

  const footerTemplate = await buildFormat1PdfFooterTemplate({
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

  const measureDoc = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;width:794px;">
  <div id="measureHeaderWrap" style="width:794px;">${headerTemplate}</div>
  <div id="measureFooterWrap" style="width:794px;">${footerTemplate}</div>
</body>
</html>`;

  const cleanupMeasure = await loadOfflineHtmlIntoPage(page, measureDoc, {
    waitUntil: "domcontentloaded",
    logContext: "format1-measure",
  });
  await waitForPageImages(page);
  const measured = await page.evaluate(() => {
    const hEl = document.getElementById("measureHeaderWrap");
    const fEl = document.getElementById("measureFooterWrap");
    return {
      headerHeight: hEl ? Math.ceil(hEl.getBoundingClientRect().height) : 0,
      footerHeight: fEl ? Math.ceil(fEl.getBoundingClientRect().height) : 0,
    };
  });
  await cleanupMeasure().catch(() => {});

  const headerMarginPx = Math.round(parseNumericPref(headermargin, 2.8) * 37.7952755906);
  // Chromium places headerTemplate ~20-22px below top margin origin; +52px ensures ~30px crisp whitespace
  // between the Header Card bottom border and the first Main Category banner.
  const safeTopPx = Math.min(560, Math.max(headerMarginPx + 75, measured.headerHeight || headerMarginPx + 115)) + 52;
  const safeBottomPx = Math.min(480, Math.max(footermarginPx + 48, measured.footerHeight || footermarginPx + 75)) + 20;

  const bodyDoc = buildFormat1PdfBodyDocument({
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

  const cleanupBody = await loadOfflineHtmlIntoPage(page, bodyDoc, {
    waitUntil: "domcontentloaded",
    logContext: "format1-body",
  });
  await waitForPageImages(page);

  try {
    return await page.pdf({
      format: "A4",
      printBackground: true,
      omitBackground: Boolean(omitBackground),
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: {
        top: `${safeTopPx}px`,
        bottom: `${safeBottomPx}px`,
        left: "0px",
        right: "0px",
      },
    });
  } finally {
    await cleanupBody().catch(() => {});
  }
};
