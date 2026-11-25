/**
 * ============================================================================
 * REPORT FORMAT 5 — EXECUTIVE CLINICAL DIAGNOSTIC PDF CONTROLLER
 * ============================================================================
 * File: src/controllers/reportFormat5Pdf.controller.js
 *
 * Key Guarantees:
 *   - Converts ALL images inside running headerTemplate and footerTemplate
 *     strictly to inline Base64 data URIs (`inlineImagesAsDataUris`) using
 *     `readAssetAsBuffer` so Puppeteer NEVER drops signature/QR/barcode images
 *     behind `file://` sandbox restrictions.
 *   - Clean Doctor / Lab In-Charge signatures WITHOUT underline rule bars.
 *   - Wide, crisp rectangular Code-128 header barcode (`152px x 18px`).
 *   - Investigations always visible inside Right header column under timestamps.
 *   - Centered column wrappers with left-aligned row text & aligned H/L rail.
 * ============================================================================
 */

import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  loadOfflineHtmlIntoPage,
  readAssetAsBuffer,
  rewriteHtmlForOfflinePdf,
} from "../utils/pdfOfflineAssets.js";
import { getPuppeteerLaunchOptions } from "../utils/puppeteerRuntime.js";

const DEFAULT_BASE_SIDE_PX = 28;
const CM_TO_PX = 37.7952755906;

export const parseNumericValue = (value, fallback, limits = {}) => {
  const num = typeof value === "number" ? value : Number.parseFloat(String(value ?? "").trim());
  if (!Number.isFinite(num)) return fallback;
  let bounded = num;
  if (limits.min !== undefined) bounded = Math.max(limits.min, bounded);
  if (limits.max !== undefined) bounded = Math.min(limits.max, bounded);
  return bounded;
};

export const parseBooleanSetting = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const low = value.trim().toLowerCase();
    if (low === "true" || low === "1" || low === "yes") return true;
    if (low === "false" || low === "0" || low === "no") return false;
  }
  return fallback;
};

export const resolvePdfFontStack = (selectedFontFamily) => {
  const normalized = String(selectedFontFamily || "").trim();
  if (!normalized || /inter|segoe|arial|helvetica/i.test(normalized)) {
    return "'Segoe UI', 'Liberation Sans', Arial, Helvetica, sans-serif";
  }
  if (/times|georgia|garamond/i.test(normalized)) {
    return `${normalized}, "Liberation Serif", "Times New Roman", Times, serif`;
  }
  if (/courier/i.test(normalized)) {
    return `"Courier New", "Liberation Mono", Courier, monospace`;
  }
  return `${normalized}, 'Segoe UI', Arial, sans-serif`;
};

const escapeHtml = (value = "") =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Converts every <img src="..."> inside a headerTemplate or footerTemplate fragment
 * into a self-contained Base64 data URI via readAssetAsBuffer, removing broken images
 * cleanly instead of rendering Chromium broken-image placeholders or alt error text.
 */
export const inlineImagesAsDataUris = async (htmlMarkup = "") => {
  const raw = String(htmlMarkup || "");
  if (!raw.trim() || !/<img\b/i.test(raw)) return raw;

  const $ = cheerio.load(raw, null, false);
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
      const isSupportedImageMime = !rawMime || /^(?:image\/|application\/octet-stream)/i.test(rawMime);
      if (asset?.buffer && asset.buffer.length > 0 && isSupportedImageMime) {
        const mime = /^image\//i.test(rawMime) ? rawMime : "image/png";
        $img.attr("src", `data:${mime};base64,${asset.buffer.toString("base64")}`);
      } else {
        // Fallback: if unresolved or non-image (e.g. text/html) asset cannot be loaded cleanly, omit broken img
        $img.remove();
      }
    } catch {
      $img.remove();
    }
  }

  return $.html();
};

const formatSignatureCredentialHtml = (rawText = "") => {
  const cleaned = String(rawText ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:p|div|span|strong|b|em|i)[^>]*>/gi, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!cleaned.length) return "";
  const [primaryLine, ...subLines] = cleaned;
  const primaryHtml = `<span class="oh5-sign-name">${escapeHtml(primaryLine)}</span>`;
  const subHtml = subLines.length
    ? `<span class="oh5-sign-role">${subLines.map(escapeHtml).join("<br>")}</span>`
    : "";
  return `${primaryHtml}${subHtml}`;
};

export const computeFormat5RowSpacingPx = (rowSpacingValue) => {
  const units = parseNumericValue(rowSpacingValue, 1, { min: 0, max: 12 });
  return units <= 0 ? 0 : Number((0.5 + (units - 1) * 0.7).toFixed(2));
};

export const prepareFormat5FooterHtml = async ({
  rawFooterHtml = "",
  showlab = false,
  showdoctorfirst = true,
  showdoctorsecond = true,
  fileInputLab = "",
  fileInputDoctorleft = "",
  fileInputDoctorright = "",
  fileInputLabtext = "",
  fileInputDoctorlefttext = "",
  fileInputDoctorrighttext = "",
  LeftsignPd = 0,
  Rightsignpd = 0,
}) => {
  const isLabVisible = parseBooleanSetting(showlab, false);
  const isDoc1Visible = parseBooleanSetting(showdoctorfirst, true);
  const isDoc2Visible = parseBooleanSetting(showdoctorsecond, true);

  const hasFooterMarkup = String(rawFooterHtml || "").trim().length > 0;
  const $ = cheerio.load(
    hasFooterMarkup
      ? rawFooterHtml
      : `<div class="oh5-footer-wrap">
          <div class="oh5-footer-top-row">
            <div class="oh5-qr-block" id="qrBlock"></div>
            <div class="signatures oh5-signatures">
              <div class="oh5-sign-slot" id="labInchargeSign"></div>
              <div class="oh5-sign-slot" id="firstDoctorSign"></div>
              <div class="oh5-sign-slot" id="secondDoctorSign"></div>
            </div>
          </div>
         </div>`,
    null,
    false
  );

  // Strip any legacy underline bars under signatures
  $(".oh5-sign-rule").remove();

  const leftPadCm = parseNumericValue(LeftsignPd, 0, { min: 0, max: 6 });
  const rightPadCm = parseNumericValue(Rightsignpd, 0, { min: 0, max: 6 });
  if (leftPadCm || rightPadCm) {
    $(".signatures, .oh5-signatures").attr(
      "style",
      `padding-left:${leftPadCm}cm;padding-right:${rightPadCm}cm;`
    );
  }

  const syncSlot = ({ selectors, visible, imgUrl, credentialText, altText }) => {
    let $slot = null;
    for (const selector of selectors) {
      const candidate = $(selector).first();
      if (candidate.length) {
        $slot = candidate;
        break;
      }
    }
    if (!$slot || !$slot.length) return;

    if (!visible) {
      $slot.attr("style", "display: none !important;");
      $slot.addClass("oh5-sign-hidden");
      return;
    }

    $slot.removeClass("oh5-sign-hidden");
    $slot.attr("style", "display: flex;");

    const existingImgSrc = $slot.find("img").first().attr("src") || "";
    const resolvedImgSrc = String(imgUrl || existingImgSrc || "").trim();
    const existingCredHtml = $slot.find(".oh5-sign-cred, p").first().text()?.trim() || "";
    const resolvedCredText = String(credentialText || existingCredHtml || "").trim();

    const imgHtml = resolvedImgSrc
      ? `<div class="oh5-sign-img-wrap"><img src="${escapeHtml(resolvedImgSrc)}" alt="${escapeHtml(altText)}" class="oh5-sign-img" /></div>`
      : `<div class="oh5-sign-img-wrap oh5-sign-img-empty"></div>`;

    const credInner = formatSignatureCredentialHtml(resolvedCredText);
    const credHtml = credInner ? `<div class="oh5-sign-cred">${credInner}</div>` : `<div class="oh5-sign-cred"></div>`;
    $slot.html(`${imgHtml}${credHtml}`);
  };

  syncSlot({
    selectors: ["#labInchargeSign", ".lab-incharge-sign", ".oh5-sign-lab"],
    visible: isLabVisible,
    imgUrl: fileInputLab,
    credentialText: fileInputLabtext,
    altText: "Lab In-Charge Signature",
  });
  syncSlot({
    selectors: ["#firstDoctorSign", ".first-doctor-sign", ".oh5-sign-doc1"],
    visible: isDoc1Visible,
    imgUrl: fileInputDoctorleft,
    credentialText: fileInputDoctorlefttext,
    altText: "Authorized Pathologist Signature",
  });
  syncSlot({
    selectors: ["#secondDoctorSign", ".second-doctor-sign", ".oh5-sign-doc2"],
    visible: isDoc2Visible,
    imgUrl: fileInputDoctorright,
    credentialText: fileInputDoctorrighttext,
    altText: "Second Signatory Signature",
  });

  const $qrBlock = $("#qrBlock, .oh5-qr-block").first();
  const $qrImg = $("#qrimg, img.oh5-qr-img").first();
  if ($qrImg.length && $qrImg.attr("src")) {
    $qrImg.addClass("oh5-qr-img");
    if ($qrBlock.length) {
      $qrBlock.html(`
        ${$qrImg.toString()}
        <div class="oh5-qr-caption"><span class="oh5-qr-title">Scan to Verify</span></div>
      `);
    }
  } else if ($qrBlock.length) {
    $qrBlock.attr("style", "display: none !important;");
  }

  $(".no-print").remove();
  return inlineImagesAsDataUris($.html());
};

export const prepareFormat5HeaderHtml = async (rawHeaderHtml = "", options = {}) => {
  const cleanedRaw = String(rawHeaderHtml || "").trim();
  if (!cleanedRaw) return "";

  const { specimenBarcode = "", specimenType = "", specimenBarcodeImg = "" } = options;
  const $ = cheerio.load(cleanedRaw, null, false);
  $(".no-print, .edit-icon, .oh5-edit-hint").remove();
  $("[contenteditable]").removeAttr("contenteditable");

  // Always force all 4 specimen timestamps & Investigations visible regardless of layer/Print Setting flags
  $(".oh5-ts-item").removeClass("forhide").removeAttr("style");
  $("#investDiv, .oh5-header-invest").removeClass("is-hidden-invest");

  if (specimenBarcode) {
    const $label = $("#oh5HeaderBarcodeLabel, [data-field='specimenBarcode']").first();
    if ($label.length) $label.text(specimenBarcode);

    const $specCell = $("#oh5HeaderSpecimenVal").first();
    if ($specCell.length) {
      const specDisplay = specimenType
        ? `${specimenType} (${specimenBarcode})`
        : `Barcode: ${specimenBarcode}`;
      $specCell.text(specDisplay);
    }
  }

  if (specimenBarcodeImg) {
    const $img = $("#barcodeImage").first();
    if ($img.length) $img.attr("src", specimenBarcodeImg);
  }

  return inlineImagesAsDataUris($.html());
};

export const prepareFormat5BodyHtml = ({
  rawBodyHtml = "",
  showCategory = true,
  showTestHeading = true,
  HighLow = true,
}) => {
  const $ = cheerio.load(String(rawBodyHtml || ""), null, false);

  $(".no-print, .oh5-edit-hint, .edit-badge, .skeleton-box, colgroup").remove();
  $("[contenteditable]").removeAttr("contenteditable");
  $(".cell-edit").each((_, el) => {
    $(el).removeAttr("tabindex title data-placeholder");
  });

  $("tr.deletion, .deletion").each((_, el) => {
    const $el = $(el);
    if ($el.is("tr")) $el.remove();
    else {
      const parentRow = $el.closest("tr");
      parentRow.length ? parentRow.remove() : $el.remove();
    }
  });

  $("td.wrong").each((_, el) => {
    const $td = $(el);
    const $tr = $td.closest("tr");
    if ($td.text().trim() === "" && $tr.find("td").length > 1) {
      $td.remove();
    }
  });

  if (!parseBooleanSetting(showCategory, true)) {
    $(".section-heading-main, .oh5-category-banner, .headings").remove();
  }

  if (!parseBooleanSetting(showTestHeading, true)) {
    $(".section-heading-sub, .oh5-profile-banner, .oh5-profile-title-row").remove();
  }

  if (!parseBooleanSetting(HighLow, true)) {
    $(".HL, .oh5-flag-badge").remove();
  } else {
    $(".HL").each((_, el) => {
      const $hl = $(el);
      if (!$hl.find(".oh5-flag-badge").length) {
        const txt = $hl.text().trim();
        if (txt) $hl.html(`<span class="oh5-flag-badge">${escapeHtml(txt)}</span>`);
        else $hl.remove();
      }
    });
  }

  $(".interpretation, .oh5-interpretation-card, .moreDetails, .oh5-remarks-card").each((_, el) => {
    const $card = $(el);
    const textLen = $card.text().replace(/\u00a0/g, " ").trim().length;
    const hasMedia = $card.find("img, table, ul, ol").length > 0;
    if (textLen === 0 && !hasMedia) $card.remove();
  });

  const $firstBreak = $(".page-break, .oh5-page-break").first();
  if ($firstBreak.length) {
    const hasPrecedingContent = $firstBreak.prevAll().toArray().some((node) => {
      const $node = $(node);
      return $node.text().trim().length > 0 || $node.find("table, tr, img").length > 0;
    });
    if (!hasPrecedingContent) $firstBreak.remove();
  }

  return $.html();
};

export const splitBodyBySpecimenGroups = (cleanedBodyHtml = "") => {
  const $ = cheerio.load(cleanedBodyHtml, null, false);
  const topNodes = $.root().children().toArray();
  const groups = [];
  let currentGroup = null;

  const finishGroup = (grp) => {
    if (!grp) return;
    const $wrap = cheerio.load("<div></div>", null, false);
    const $container = $wrap("div");
    grp.nodes.forEach((n) => $container.append($(n).clone()));
    $container.children().first().removeClass("page-break oh5-page-break-before");
    groups.push({
      barcode: grp.barcode,
      sampleType: grp.sampleType,
      barcodeImg: grp.barcodeImg,
      html: $container.html() || "",
    });
  };

  topNodes.forEach((node) => {
    const $node = $(node);
    const isSection = $node.hasClass("section") || $node.hasClass("oh5-category-section");
    if (isSection) {
      const bCode = String($node.attr("data-specimen-barcode") || "").trim();
      const bType = String($node.attr("data-specimen-type") || "").trim();
      const bImg = String($node.attr("data-specimen-barcode-img") || "").trim();

      if (!currentGroup) {
        currentGroup = { barcode: bCode, sampleType: bType, barcodeImg: bImg, nodes: [node] };
      } else if (bCode && currentGroup.barcode && bCode !== currentGroup.barcode) {
        finishGroup(currentGroup);
        currentGroup = { barcode: bCode, sampleType: bType, barcodeImg: bImg, nodes: [node] };
      } else {
        if (!currentGroup.barcode && bCode) {
          currentGroup.barcode = bCode;
          currentGroup.sampleType = bType;
          currentGroup.barcodeImg = bImg;
        }
        currentGroup.nodes.push(node);
      }
    } else {
      if (!currentGroup) {
        currentGroup = { barcode: "", sampleType: "", barcodeImg: "", nodes: [node] };
      } else {
        currentGroup.nodes.push(node);
      }
    }
  });

  finishGroup(currentGroup);
  if (!groups.length) {
    return [{ barcode: "", sampleType: "", barcodeImg: "", html: cleanedBodyHtml }];
  }
  return groups;
};

const buildFormat5HeaderTemplateCss = ({
  headermarginPx,
  horizontalLeftPx,
  horizontalRightPx,
  baseFontSizePx,
  fontStack,
}) => `
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html, body {
    width: 100%;
    font-family: ${fontStack};
    color: #0f172a;
    font-size: ${Math.max(9, baseFontSizePx - 1)}px;
    line-height: 1.25;
    background: transparent;
  }
  .oh5-header-shell {
    width: 100%;
    padding: ${headermarginPx}px ${horizontalRightPx}px 0 ${horizontalLeftPx}px;
  }
  .oh5-header-card {
    width: 100%;
    border: 1px solid #d5dde7;
    border-top: 2px solid #2b4c7e;
    border-radius: 4px;
    background-color: #f9fbfd;
    padding: 6px 10px;
  }
  .oh5-header-top-band {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-bottom: 4.5px;
    margin-bottom: 4.5px;
    border-bottom: 1px solid #e6ecf2;
  }
  .oh5-patient-identity {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .oh5-patient-name {
    font-size: ${Math.min(14, baseFontSizePx + 2)}px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.01em;
    text-transform: uppercase;
  }
  .oh5-age-gender {
    font-size: ${Math.max(8.8, baseFontSizePx - 1.2)}px;
    font-weight: 600;
    color: #2b4c7e;
    background: #e8eef5;
    padding: 1px 7px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .oh5-uhid-pill {
    font-size: ${Math.max(8.5, baseFontSizePx - 1.5)}px;
    font-weight: 600;
    color: #475569;
    background: #ffffff;
    border: 1px solid #d5dde7;
    padding: 1px 6px;
    border-radius: 3px;
    white-space: nowrap;
  }
  .oh5-barcode-box {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .oh5-barcode-img-slot img,
  #barcodeImage {
    width: 112px !important;
    height: 20px !important;
    max-width: 118px;
    object-fit: fill;
    image-rendering: crisp-edges;
    display: block;
  }
  .oh5-accession-badge {
    text-align: right;
    line-height: 1.15;
  }
  .oh5-accession-label {
    display: block;
    font-size: 7.2px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    font-weight: 600;
  }
  .oh5-accession-id {
    display: block;
    font-size: ${Math.max(9.8, baseFontSizePx - 0.5)}px;
    font-weight: 700;
    color: #1e3a5f;
    font-variant-numeric: tabular-nums;
  }
  .oh5-header-grid {
    display: grid;
    grid-template-columns: 0.94fr 1.06fr;
    gap: 0 12px;
    align-items: stretch;
  }
  .oh5-patient-col {
    padding-right: 10px;
    border-right: 1px solid #e6ecf2;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }
  .oh5-specimen-col {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 3px;
  }
  .oh5-meta-table {
    width: 100%;
    border-collapse: collapse;
  }
  .oh5-meta-table td {
    padding: 1px 2px;
    vertical-align: top;
    font-size: ${Math.max(8.8, baseFontSizePx - 1.3)}px;
    line-height: 1.24;
  }
  .oh5-meta-label {
    width: 72px;
    font-weight: 600;
    color: #475569;
    white-space: nowrap;
  }
  .oh5-meta-sep {
    width: 7px;
    color: #64748b;
    text-align: center;
  }
  .oh5-meta-val {
    color: #0f172a;
    font-weight: 500;
    word-break: break-word;
  }
  .oh5-ts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 10px;
    padding-bottom: 3px;
    border-bottom: 1px dashed #d5dde7;
  }
  .oh5-ts-item {
    font-size: ${Math.max(8.5, baseFontSizePx - 1.7)}px;
    line-height: 1.22;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .oh5-ts-lbl {
    font-weight: 600;
    color: #475569;
    margin-right: 3px;
  }
  .oh5-header-invest,
  #investDiv {
    display: flex !important;
    align-items: baseline;
    gap: 5px;
    font-size: ${Math.max(8.6, baseFontSizePx - 1.5)}px;
    line-height: 1.25;
    padding-top: 1px;
    flex-wrap: wrap;
  }
  .oh5-invest-label {
    font-weight: 700;
    color: #0f766e;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .oh5-invest-value {
    color: #0f172a;
    font-weight: 600;
    word-break: break-word;
    overflow-wrap: anywhere;
    flex: 1 1 auto;
  }
`;

const buildFormat5FooterTemplateCss = ({
  footermarginPx,
  horizontalLeftPx,
  horizontalRightPx,
  baseFontSizePx,
  fontStack,
}) => `
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html, body {
    width: 100%;
    font-family: ${fontStack};
    color: #0f172a;
    font-size: 9px;
    background: transparent;
  }
  .oh5-footer-shell {
    width: 100%;
    padding: 4px ${horizontalRightPx}px ${footermarginPx}px ${horizontalLeftPx}px;
  }
  .oh5-footer-wrap {
    width: 100%;
    border-top: 1px solid #d5dde7;
    padding-top: 5px;
  }
  .oh5-footer-top-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
  }
  .oh5-qr-block {
    width: 76px;
    max-width: 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 2px;
    padding: 3px 4px;
    border: 1px solid #e6ecf2;
    border-radius: 4px;
    background: #f9fbfd;
    flex-shrink: 0;
  }
  .oh5-qr-block img,
  #qrimg {
    width: 44px;
    height: 44px;
    display: block;
    object-fit: contain;
    background: #ffffff;
  }
  .oh5-qr-caption { width: 100%; line-height: 1.15; }
  .oh5-qr-title {
    display: block;
    font-size: 6.8px;
    font-weight: 700;
    color: #1e3a5f;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    white-space: nowrap;
  }
  .signatures,
  .oh5-signatures {
    flex: 1;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    gap: 14px;
    min-height: 54px;
  }
  .oh5-sign-slot,
  .lab-incharge-sign,
  .first-doctor-sign,
  .second-doctor-sign {
    flex: 1;
    max-width: 190px;
    min-width: 105px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .oh5-sign-img-wrap {
    height: 36px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    margin-bottom: 3px;
  }
  .oh5-sign-img {
    max-height: 35px;
    max-width: 125px;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
  }
  .oh5-sign-cred { line-height: 1.22; }
  .oh5-sign-name {
    display: block;
    font-size: ${Math.max(8.5, Math.min(10.5, baseFontSizePx - 1.3))}px;
    font-weight: 700;
    color: #0f172a;
  }
  .oh5-sign-role {
    display: block;
    font-size: 7.8px;
    color: #475569;
    font-weight: 500;
  }
  .oh5-footer-bottom-meta {
    margin-top: 4px;
    padding-top: 3px;
    border-top: 1px solid #e6ecf2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 7.8px;
    color: #64748b;
  }
  .oh5-page-counter {
    font-weight: 600;
    color: #334155;
    font-variant-numeric: tabular-nums;
  }
`;

export const buildFormat5BodyCss = ({
  horizontalLeftPx,
  horizontalRightPx,
  baseFontSizePx,
  rowSpacingPx,
  fontStack,
  HLinred,
  BoldRow,
  showCategoryResolved,
  showTestHeadingResolved,
  hideTableHeadingsResolved = false,
  HighLowResolved,
}) => {
  const abnormalColor = HLinred ? "#b91c1c" : "#0f172a";
  const abnormalBadgeBg = HLinred ? "#fef2f2" : "#f1f5f9";
  const abnormalBadgeBorder = HLinred ? "#fca5a5" : "#cbd5e1";
  const abnormalRowWeight = BoldRow ? "700" : "inherit";
  const subTextSize = Math.max(8, baseFontSizePx - 2).toFixed(1);
  const headerLabelSize = Math.max(8.5, baseFontSizePx - 1.5).toFixed(1);
  const categoryTitleSize = (baseFontSizePx + 1).toFixed(1);
  const profileHeadingSize = baseFontSizePx.toFixed(1);

  return `
    @page { size: A4; }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      background: transparent;
      color: #0f172a;
      font-family: ${fontStack};
      font-size: ${baseFontSizePx}px;
      line-height: 1.18;
      font-variant-numeric: tabular-nums;
    }
    .oh5-doc-body {
      width: 100%;
      padding-left: ${horizontalLeftPx}px;
      padding-right: ${horizontalRightPx}px;
    }
    .oh5-category-section { margin-bottom: 7px; }
    .section-heading-main,
    .oh5-category-banner {
      display: ${showCategoryResolved ? "flex" : "none"} !important;
      align-items: center;
      justify-content: center;
      text-align: center;
      background: #f3f6fa;
      border-top: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
      padding: 3.5px 10px;
      margin: 5px 0 4px 0;
      font-size: ${categoryTitleSize}px;
      font-weight: 700;
      color: #1e3a5f;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      break-after: avoid;
      page-break-after: avoid;
    }
    .oh5-category-section:first-child .section-heading-main,
    .oh5-category-section:first-child .oh5-category-banner {
      margin-top: 0;
    }
    .oh5-profile-banner {
      display: ${showTestHeadingResolved ? "flex" : "none"} !important;
      align-items: center;
      justify-content: center;
      text-align: center;
      background: #fafcfe;
      border-top: 1px solid #e6ecf2;
      border-bottom: 1px solid #d5dde7;
      color: #0f766e;
      font-size: ${profileHeadingSize}px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 3px 10px;
      margin: 4px 0 0 0;
      break-after: avoid;
      page-break-after: avoid;
    }
    .test-table,
    .oh5-results-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
      margin: 0 0 5px 0;
      background: transparent;
    }
    .test-table thead,
    .oh5-results-table thead {
      display: ${hideTableHeadingsResolved ? "none" : "table-header-group"};
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .test-table thead th:nth-child(1),
    .oh5-results-table thead th:nth-child(1) { width: 39%; text-align: left; }
    .test-table thead th:nth-child(2),
    .oh5-results-table thead th:nth-child(2) { width: 22%; text-align: center; }
    .test-table thead th:nth-child(3),
    .oh5-results-table thead th:nth-child(3) { width: 13%; text-align: center; }
    .test-table thead th:nth-child(4),
    .oh5-results-table thead th:nth-child(4) { width: 26%; text-align: center; }
    .test-table thead th,
    .oh5-results-table thead th {
      background: #f9fbfd;
      border-top: 1px solid #d5dde7;
      border-bottom: 1px solid #94a3b8;
      color: #1e3a5f;
      font-size: ${headerLabelSize}px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 4px 8px;
      vertical-align: middle;
    }
    .test-table tbody tr,
    .oh5-results-table tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .test-table tbody td,
    .oh5-results-table tbody td {
      padding: ${rowSpacingPx}px 8px;
      font-size: ${baseFontSizePx}px;
      line-height: 1.18;
      vertical-align: middle;
      color: #0f172a;
      border-bottom: 1px solid #eef2f6;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .section-heading-sub:is(tr),
    .oh5-profile-title-row {
      display: ${showTestHeadingResolved ? "table-row" : "none"} !important;
      background-color: #fafcfe;
      break-after: avoid;
      page-break-after: avoid;
    }
    .section-heading-sub:is(tr) td,
    .oh5-profile-title-row td {
      text-align: center !important;
      font-size: ${profileHeadingSize}px;
      font-weight: 700;
      color: #0f766e;
      padding: 3px 10px !important;
      text-transform: uppercase;
      border-top: 1px solid #e6ecf2;
      border-bottom: 1px solid #d5dde7;
    }
    .parameter-row td:first-child,
    .oh5-param-row td:first-child { padding-left: 16px; }
    .oh5-param-indent {
      display: inline-block;
      border-left: 1.5px solid #d5dde7;
      padding-left: 7px;
    }
    .oh5-test-title,
    .test-name {
      font-weight: 600;
      color: #0f172a;
      font-size: ${baseFontSizePx}px;
    }
    .parameter-row .oh5-test-title,
    .oh5-param-row .oh5-test-title {
      font-weight: 500;
      color: #1e293b;
    }
    .methods,
    .oh5-method-note {
      display: block;
      margin-top: 0.5px;
      font-size: ${subTextSize}px;
      color: #64748b;
      font-style: italic;
      font-weight: 400;
      line-height: 1.12;
    }
    .oh5-col-result-cell,
    .test-table tbody td:nth-child(2) { text-align: center !important; }
    .oh5-unit-cell,
    .test-table tbody td:nth-child(3) {
      text-align: center !important;
      font-size: ${Math.max(8.5, baseFontSizePx - 0.4)}px;
      color: #475569;
    }
    .oh5-ref-block,
    .test-table tbody td:nth-child(4) {
      text-align: center !important;
      font-size: ${Math.max(8.5, baseFontSizePx - 0.5)}px;
      color: #334155;
    }
    .oh5-result-header-inner,
    .oh5-result-wrap {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 24px;
      align-items: center;
      column-gap: 6px;
      width: 112px;
      max-width: 100%;
      margin: 0 auto;
      text-align: left !important;
    }
    .oh5-result-value {
      font-weight: 600;
      color: #0f172a;
      text-align: left !important;
      display: block;
      font-variant-numeric: tabular-nums;
      word-break: break-word;
    }
    .oh5-flag-slot {
      width: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .oh5-unit-header-inner,
    .oh5-unit-inner {
      display: inline-block;
      width: 68px;
      max-width: 100%;
      margin: 0 auto;
      text-align: left !important;
    }
    .oh5-ref-header-inner,
    .oh5-ref-text {
      display: inline-block;
      width: 138px;
      max-width: 100%;
      margin: 0 auto;
      text-align: left !important;
      white-space: pre-line;
      line-height: 1.2;
    }
    .oh5-row--abnormal,
    .BoldRow,
    tr.BoldRow td { font-weight: ${abnormalRowWeight}; }
    .oh5-row--abnormal .oh5-result-value,
    .high-low,
    .oh5-result-value.is-abnormal {
      color: ${abnormalColor} !important;
      font-weight: 700;
    }
    .HL {
      display: ${HighLowResolved ? "inline-flex" : "none"} !important;
      align-items: center;
      justify-content: center;
      border: none !important;
      background: transparent !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    .oh5-flag-badge {
      display: ${HighLowResolved ? "inline-flex" : "none"} !important;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 14px;
      padding: 0;
      border-radius: 3px;
      font-size: ${Math.max(7.5, baseFontSizePx - 2.3)}px;
      font-weight: 700;
      letter-spacing: 0.02em;
      background: ${abnormalBadgeBg};
      color: ${abnormalColor};
      border: 1px solid ${abnormalBadgeBorder};
      line-height: 1;
      text-align: center;
    }
    .documented-content,
    .oh5-documented-card {
      margin: 4px 0 7px 0;
      padding: 6px 10px;
      border: 1px solid #e6ecf2;
      border-radius: 4px;
      background: #ffffff;
      font-size: ${baseFontSizePx}px;
      line-height: 1.38;
      color: #0f172a;
    }
    .documented-content p, .oh5-documented-card p { margin: 0 0 4px 0; }
    .documented-content table, .oh5-documented-card table {
      width: 100%;
      border-collapse: collapse;
      margin: 4px 0;
    }
    .documented-content td, .documented-content th,
    .oh5-documented-card td, .oh5-documented-card th {
      border: 1px solid #d5dde7;
      padding: 3px 6px;
      font-size: ${Math.max(9, baseFontSizePx - 0.5)}px;
    }
    .documented-content ul, .documented-content ol,
    .oh5-documented-card ul, .oh5-documented-card ol {
      padding-left: 18px;
      margin: 3px 0 5px 0;
    }
    .interpretation, .oh5-interpretation-card,
    .moreDetails, .oh5-remarks-card {
      margin: 4px 0 7px 0;
      padding: 5px 9px;
      background: #f9fbfd;
      border: 1px solid #e6ecf2;
      border-left: 2.5px solid #0f766e;
      border-radius: 4px;
      font-size: ${Math.max(8.8, baseFontSizePx - 0.9)}px;
      line-height: 1.34;
      color: #334155;
      text-align: left;
      break-inside: avoid-page;
    }
    .oh5-interpretation-title, .oh5-remarks-title {
      display: block;
      font-size: ${Math.max(8.2, baseFontSizePx - 1.5)}px;
      font-weight: 700;
      color: #0f766e;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 2px;
    }
    .oh5-end-of-report {
      margin: 8px 0 4px 0;
      text-align: center;
      font-size: ${Math.max(8.2, baseFontSizePx - 1.5)}px;
      font-weight: 600;
      letter-spacing: 0.14em;
      color: #64748b;
      text-transform: uppercase;
    }
    .oh5-end-of-report::before, .oh5-end-of-report::after {
      content: "";
      display: inline-block;
      width: 50px;
      height: 1px;
      background: #d5dde7;
      vertical-align: middle;
      margin: 0 10px;
    }
    .page-break, .oh5-page-break {
      page-break-before: always;
      break-before: page;
      height: 0;
      margin: 0;
      padding: 0;
    }
    .cell-edit {
      border: none !important;
      background: transparent !important;
      box-shadow: none !important;
      padding: 0 !important;
    }
  `;
};

const stampMergedPageNumbers = async (mergedPdfBytes, footerMarginPx, horizontalLeftPx, horizontalRightPx) => {
  const pdfDoc = await PDFDocument.load(mergedPdfBytes);
  const pages = pdfDoc.getPages();
  const total = pages.length;
  if (total === 0) return Buffer.from(mergedPdfBytes);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 7.8;
  const xLeftPts = horizontalLeftPx * 0.75;
  const xRightPts = horizontalRightPx * 0.75;
  const yPts = Math.max(12, footerMarginPx * 0.75 + 6);

  pages.forEach((page, idx) => {
    const { width } = page.getSize();
    const rightLabel = `Page ${idx + 1} of ${total}`;
    const textWidth = fontBold.widthOfTextAtSize(rightLabel, fontSize);

    page.drawText("Report Format: Format 5 (Clinical Standard)", {
      x: xLeftPts,
      y: yPts,
      size: fontSize,
      font: fontRegular,
      color: rgb(0.392, 0.455, 0.545),
    });
    page.drawText(rightLabel, {
      x: Math.max(120, width - xRightPts - textWidth),
      y: yPts,
      size: fontSize,
      font: fontBold,
      color: rgb(0.2, 0.255, 0.333),
    });
  });

  return Buffer.from(await pdfDoc.save());
};

const waitForPageImagesSafe = async (page) => {
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

export async function generateFormat5PdfBuffer(options = {}, helpers = {}) {
  const {
    launchPdfBrowser,
    addBackgroundToPdf,
  } = helpers;

  const {
    BoldRow = false,
    HLinred = true,
    HighLow = true,
    RowSpacing = 1,
    selectedFontSize = 10.5,
    selectedFontFamily = "",
    htmlContent = "",
    header = "",
    footer = "",
    backgroundImageUrl = "",
    disableBackgroundImage = false,
    checkBox = false,
    headermargin = 2.8,
    footermargin = 1.0,
    marginRight = 0,
    marginLeft = 0,
    LeftsignPd = 0,
    Rightsignpd = 0,
    headerContentGap = 0.7,
    showlab = false,
    showdoctorfirst = true,
    showdoctorsecond = true,
    fileInputLab = "",
    fileInputDoctorleft = "",
    fileInputDoctorright = "",
    fileInputLabtext = "",
    fileInputDoctorlefttext = "",
    fileInputDoctorrighttext = "",
    hideCategories = false,
    hideTableHeadings = false,
    showCategory,
    showTestHeading,
  } = options;

  const cmToPx = (cm) => cm * CM_TO_PX;
  const headerMarginCm = parseNumericValue(headermargin, 2.8, { min: 0, max: 10 });
  const footerMarginCm = parseNumericValue(footermargin, 1.0, { min: 0, max: 6 });
  const marginLeftCm = parseNumericValue(marginLeft, 0, { min: 0, max: 4 });
  const marginRightCm = parseNumericValue(marginRight, 0, { min: 0, max: 4 });
  const headerGapCm = parseNumericValue(headerContentGap, 0.7, { min: 0.1, max: 10 });

  const headermarginPx = Math.round(cmToPx(headerMarginCm));
  const footermarginPx = Math.round(cmToPx(footerMarginCm));
  const headerContentGapPx = Math.round(cmToPx(headerGapCm));
  const horizontalLeftPx = DEFAULT_BASE_SIDE_PX + Math.round(cmToPx(marginLeftCm));
  const horizontalRightPx = DEFAULT_BASE_SIDE_PX + Math.round(cmToPx(marginRightCm));

  const baseFontSizePx = parseNumericValue(selectedFontSize, 10.5, { min: 8, max: 18 });
  const rowSpacingPx = computeFormat5RowSpacingPx(RowSpacing);
  const fontStack = resolvePdfFontStack(selectedFontFamily);

  const showCategoryResolved = showCategory !== undefined
    ? parseBooleanSetting(showCategory, true)
    : !parseBooleanSetting(hideCategories, false);
  const showTestHeadingResolved = showTestHeading !== undefined
    ? parseBooleanSetting(showTestHeading, true)
    : true;
  const hideTableHeadingsResolved = parseBooleanSetting(hideTableHeadings, false);
  const highLowResolved = parseBooleanSetting(HighLow, true);
  const hlInRedResolved = parseBooleanSetting(HLinred, true);
  const boldRowResolved = parseBooleanSetting(BoldRow, false);

  const inlinedFooterInner = await prepareFormat5FooterHtml({
    rawFooterHtml: footer,
    showlab,
    showdoctorfirst,
    showdoctorsecond,
    fileInputLab,
    fileInputDoctorleft,
    fileInputDoctorright,
    fileInputLabtext,
    fileInputDoctorlefttext,
    fileInputDoctorrighttext,
    LeftsignPd,
    Rightsignpd,
  });

  const cleanedBodyHtml = prepareFormat5BodyHtml({
    rawBodyHtml: htmlContent,
    showCategory: showCategoryResolved,
    showTestHeading: showTestHeadingResolved,
    HighLow: highLowResolved,
  });

  const specimenGroups = splitBodyBySpecimenGroups(cleanedBodyHtml);
  const isMultiSpecimen = specimenGroups.length > 1;
  const shouldApplyLetterhead = Boolean(
    !parseBooleanSetting(checkBox, false) &&
    !parseBooleanSetting(disableBackgroundImage, false) &&
    String(backgroundImageUrl || "").trim()
  );

  const headerTemplateCss = buildFormat5HeaderTemplateCss({
    headermarginPx,
    horizontalLeftPx,
    horizontalRightPx,
    baseFontSizePx,
    fontStack,
  });

  const footerTemplateCss = buildFormat5FooterTemplateCss({
    footermarginPx,
    horizontalLeftPx,
    horizontalRightPx,
    baseFontSizePx,
    fontStack,
  });

  const bodyCss = buildFormat5BodyCss({
    horizontalLeftPx,
    horizontalRightPx,
    baseFontSizePx,
    rowSpacingPx,
    fontStack,
    HLinred: hlInRedResolved,
    BoldRow: boldRowResolved,
    showCategoryResolved,
    showTestHeadingResolved,
    hideTableHeadingsResolved,
    HighLowResolved: highLowResolved,
  });

  const footerTemplateHtml = `
    <style>${footerTemplateCss}</style>
    <div class="oh5-footer-shell" id="oh5FooterRoot">
      ${inlinedFooterInner}
      <div class="oh5-footer-bottom-meta">
        ${isMultiSpecimen
          ? `<span>&nbsp;</span><span class="oh5-page-counter">&nbsp;</span>`
          : `<span>Report Format: Format 5 (Clinical Standard)</span><span class="oh5-page-counter">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>`}
      </div>
    </div>
  `;

  const browser = launchPdfBrowser
    ? await launchPdfBrowser()
    : await puppeteer.launch(getPuppeteerLaunchOptions());

  let rawPdfBuffer;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

    const segmentBuffers = [];

    for (const group of specimenGroups) {
      const inlinedHeader = await prepareFormat5HeaderHtml(header, {
        specimenBarcode: group.barcode,
        specimenType: group.sampleType,
        specimenBarcodeImg: group.barcodeImg,
      });

      const headerTemplateHtml = inlinedHeader
        ? `<style>${headerTemplateCss}</style><div class="oh5-header-shell" id="oh5HeaderRoot">${inlinedHeader}</div>`
        : `<div style="height:1px;"></div>`;

      const measurementDoc = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;width:794px;">
  <div id="measureHeaderWrap" style="width:794px;">${headerTemplateHtml}</div>
  <div id="measureFooterWrap" style="width:794px;">${footerTemplateHtml}</div>
</body>
</html>`;

      const cleanupMeasure = await loadOfflineHtmlIntoPage(page, measurementDoc, {
        waitUntil: "domcontentloaded",
        logContext: "reportFormat5-measure",
      });
      await waitForPageImagesSafe(page);
      const measured = await page.evaluate(() => {
        const hEl = document.getElementById("measureHeaderWrap");
        const fEl = document.getElementById("measureFooterWrap");
        return {
          headerHeight: hEl ? Math.ceil(hEl.getBoundingClientRect().height) : 0,
          footerHeight: fEl ? Math.ceil(fEl.getBoundingClientRect().height) : 0,
        };
      });
      await cleanupMeasure().catch(() => {});

      const safeHeaderHeight = inlinedHeader
        ? Math.min(460, Math.max(headermarginPx + 45, measured.headerHeight || headermarginPx + 100))
        : headermarginPx;
      const safeFooterHeight = Math.min(340, Math.max(footermarginPx + 58, measured.footerHeight || footermarginPx + 88));

      const marginTopPx = safeHeaderHeight + headerContentGapPx;
      const marginBottomPx = safeFooterHeight + 10;

      const offlineBodyHtml = await rewriteHtmlForOfflinePdf(group.html);
      const bodyDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${bodyCss}</style>
</head>
<body>
  <div class="oh5-doc-body">
    ${offlineBodyHtml}
  </div>
</body>
</html>`;

      const cleanupBody = await loadOfflineHtmlIntoPage(page, bodyDoc, {
        waitUntil: "domcontentloaded",
        logContext: "reportFormat5-body",
      });
      await waitForPageImagesSafe(page);

      const segBuf = await page.pdf({
        format: "A4",
        printBackground: true,
        omitBackground: shouldApplyLetterhead,
        preferCSSPageSize: false,
        displayHeaderFooter: true,
        headerTemplate: headerTemplateHtml,
        footerTemplate: footerTemplateHtml,
        margin: {
          top: `${marginTopPx}px`,
          bottom: `${marginBottomPx}px`,
          left: "0px",
          right: "0px",
        },
      });
      await cleanupBody().catch(() => {});
      segmentBuffers.push(segBuf);
    }

    if (segmentBuffers.length === 1) {
      rawPdfBuffer = Buffer.from(segmentBuffers[0]);
    } else {
      const mergedDoc = await PDFDocument.create();
      for (const segBytes of segmentBuffers) {
        const segPdf = await PDFDocument.load(segBytes);
        const copiedPages = await mergedDoc.copyPages(segPdf, segPdf.getPageIndices());
        copiedPages.forEach((p) => mergedDoc.addPage(p));
      }
      const savedMerged = await mergedDoc.save();
      rawPdfBuffer = await stampMergedPageNumbers(savedMerged, footermarginPx, horizontalLeftPx, horizontalRightPx);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  if (shouldApplyLetterhead && typeof addBackgroundToPdf === "function") {
    const withBg = await addBackgroundToPdf(rawPdfBuffer, backgroundImageUrl);
    if (withBg) return Buffer.from(withBg);
  }

  return rawPdfBuffer;
}
