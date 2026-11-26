import * as cheerio from "cheerio";
import { evaluateClinicalReferenceFlag } from "../../public/js/clinicalRangeEvaluator.mjs";

const extractDemographicsFromHtml = (rawHeaderHtml = "") => {
  const cleaned = String(rawHeaderHtml || "").trim();
  if (!cleaned) return { patientGender: "", patientAge: "" };
  try {
    const $ = cheerio.load(cleaned, null, false);
    const text = $.root().text().replace(/\s+/g, " ").trim();
    let patientGender = "";
    let patientAge = "";

    const genderMatch = text.match(/\b(male|female)\b/i);
    if (genderMatch) patientGender = genderMatch[1];

    const ageMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:years?|yrs?|y|months?|mos?|m|days?|d)\b/i);
    if (ageMatch) patientAge = ageMatch[0];
    else {
      const slashAge = text.match(/Age\s*(?:\/\s*Sex)?\s*:\s*(\d+)\s*(?:\/|\||,)/i);
      if (slashAge) patientAge = slashAge[1];
    }

    return { patientGender, patientAge };
  } catch {
    return { patientGender: "", patientAge: "" };
  }
};

/**
 * Evaluates and normalizes legacy Formats 1-4 (`test-table` / `sec-tbl`) result rows so:
 * - Normal rows remain unhighlighted with clean normal weight (`400`) and empty marker
 * - Out-of-range / abnormal rows receive cohesive `.BoldRow.abnormal-result-row` classes + H/L markers
 */
export const normalizeLegacyPdfBodyHtml = ({
  htmlContent = "",
  header = "",
  HighLow = true,
  HLinred = true,
  BoldRow = true,
}) => {
  const rawHtml = String(htmlContent || "");
  if (!rawHtml.trim()) return rawHtml;

  const $ = cheerio.load(rawHtml, null, false);
  const $rows = $("table.test-table tbody tr, table.sec-tbl tbody tr");
  if (!$rows.length) return rawHtml;

  const { patientGender, patientAge } = extractDemographicsFromHtml(header);
  const showHighLow = Boolean(HighLow);
  const showRed = Boolean(HLinred);
  const showBold = Boolean(BoldRow);

  $rows.each((_, el) => {
    const $tr = $(el);
    if (
      $tr.hasClass("multi-parameter-heading-row") ||
      $tr.hasClass("deletion") ||
      $tr.find(".documented-content, .sec-doc, .interpretation, .remark-row, .remark-cell, .details-row").length > 0 ||
      $tr.children("td[colspan]").length > 0
    ) {
      return;
    }

    const visibleTds = $tr
      .children("td")
      .toArray()
      .filter((td) => !$(td).hasClass("wrong") && !$(td).hasClass("deletion"));

    if (visibleTds.length < 3) return;

    const $nameCell = $(visibleTds[0]);
    const $valCell = $(visibleTds[1]);
    const $refCell = visibleTds[3] ? $(visibleTds[3]) : null;

    $nameCell.addClass("is-first-visible-col");

    const $existingMarker = $valCell.find(".high-low-marker, .hl-tag").first();
    const existingFlag = $existingMarker.text().trim() || $tr.attr("data-flag") || "";

    const $valClone = $valCell.clone();
    $valClone.find(".HL, .high-low-marker, .hl-tag").remove();
    const $resSpan = $valCell.find(".result-value").first();
    const valText = ($resSpan.length ? $resSpan.text() : $valClone.text()).trim();
    const refText = $refCell ? $refCell.text().trim() : "";
    const testName = $nameCell.text().trim();

    const rowStyle = ($tr.attr("style") || "").toLowerCase();
    const dbHint =
      $tr.hasClass("BoldRow") ||
      $tr.hasClass("abnormal-result-row") ||
      $tr.hasClass("row-abn") ||
      $tr.attr("data-abnormal") === "1" ||
      /font-weight\s*:\s*(?:bold|[6-9]\d\d)/.test(rowStyle) ||
      Boolean(existingFlag);

    const evalRes = evaluateClinicalReferenceFlag({
      value: valText,
      reference: refText,
      testName,
      gender: patientGender,
      age: patientAge,
      referenceType: $tr.attr("data-ref-type") || "",
      dbIsAbnormal: dbHint,
      dbFlag: existingFlag,
    });

    // Clean inline bold style from tr/tds so CSS classes control weight deterministically
    if ($tr.attr("style")) {
      const nextStyle = $tr.attr("style").replace(/font-weight\s*:[^;]+;?/gi, "").trim();
      if (nextStyle) $tr.attr("style", nextStyle);
      else $tr.removeAttr("style");
    }

    const isSecTbl = $tr.closest("table").hasClass("sec-tbl");
    $tr.removeClass("BoldRow abnormal-result-row row-abn is-bold-row is-red-row is-normal-row");

    if (evalRes.isAbnormal) {
      $tr.addClass("BoldRow abnormal-result-row");
      if (isSecTbl) $tr.addClass("row-abn");
      if (showBold) $tr.addClass("is-bold-row");
      if (showRed) $tr.addClass("is-red-row");
      $tr.attr("data-abnormal", "1");
      $tr.attr("data-flag", evalRes.flag || "");

      const flag = showHighLow ? (evalRes.flag || "") : "";
      if (isSecTbl) {
        $valCell.find(".hl-tag").remove();
        if (flag) {
          $valCell.prepend(`<span class="hl-tag">${flag}</span>`);
        }
      } else {
        const $hl = $valCell.find(".HL").first();
        if ($hl.length) {
          $hl.html(flag ? `<span class="high-low-marker">${flag}</span>` : "");
        } else if (flag) {
          $valCell.prepend(`<div class="HL"><span class="high-low-marker">${flag}</span></div>`);
        }
      }
    } else {
      $tr.addClass("is-normal-row");
      $tr.attr("data-abnormal", "0");
      $tr.attr("data-flag", "");
      if (isSecTbl) {
        $valCell.find(".hl-tag").remove();
      } else {
        const $hl = $valCell.find(".HL").first();
        if ($hl.length) $hl.empty();
        else $valCell.find(".high-low-marker").remove();
      }
    }
  });

  return $.html();
};

export const buildLegacyAbnormalHighlightCss = ({
  HighLow = true,
  HLinred = true,
  BoldRow = true,
}) => {
  const boldWeight = BoldRow ? "700" : "400";
  const rowBg = HLinred ? "rgba(254, 226, 226, 0.72)" : "rgba(241, 245, 249, 0.90)";
  const rowTextColor = HLinred ? "#7f1d1d" : "#0f172a";
  const valueTextColor = HLinred ? "#b91c1c" : "#0f172a";
  const stripeColor = HLinred ? "#dc2626" : "#1e3a5f";
  const badgeBg = HLinred ? "#fee2e2" : "#e2e8f0";
  const badgeColor = HLinred ? "#991b1b" : "#0f172a";
  const badgeBorder = HLinred ? "#ef4444" : "#94a3b8";

  return `
    /* Reset normal rows strictly to calm normal typography */
    table.test-table tbody tr.is-normal-row td,
    table.test-table tbody tr.is-normal-row td.high-low,
    table.test-table tbody tr.is-normal-row .test-name-cell,
    table.test-table tbody tr.is-normal-row .result-value,
    table.sec-tbl tbody tr.is-normal-row td {
      font-weight: 400 !important;
      color: #1e293b !important;
      background-color: transparent !important;
    }

    table.test-table tbody td.is-first-visible-col {
      border-left: 3px solid transparent;
      padding-left: 6px !important;
    }

    /* Full-row clinical highlight exclusively on abnormal rows */
    tr.abnormal-result-row td,
    tr.BoldRow td,
    tr.row-abn td {
      background-color: ${rowBg} !important;
      color: ${rowTextColor} !important;
      font-weight: ${boldWeight} !important;
    }

    tr.abnormal-result-row td *,
    tr.BoldRow td *,
    tr.row-abn td * {
      font-weight: ${boldWeight} !important;
      color: ${rowTextColor} !important;
    }

    tr.abnormal-result-row td.high-low .result-value,
    tr.BoldRow td.high-low .result-value,
    tr.abnormal-result-row td.high-low > span:last-child,
    tr.BoldRow td.high-low > span:last-child {
      color: ${valueTextColor} !important;
      font-weight: ${boldWeight} !important;
    }

    tr.abnormal-result-row td.is-first-visible-col,
    tr.BoldRow td.is-first-visible-col,
    tr.row-abn td.is-first-visible-col {
      border-left: 3px solid ${stripeColor} !important;
      padding-left: 6px !important;
    }

    tr.abnormal-result-row .methods,
    tr.abnormal-result-row .methods *,
    tr.BoldRow .methods,
    tr.BoldRow .methods * {
      font-weight: 400 !important;
      color: #565656 !important;
    }

    td .HL span.high-low-marker,
    td .hl-tag {
      display: ${HighLow ? "inline-flex" : "none"} !important;
      align-items: center !important;
      justify-content: center !important;
      min-width: 18px;
      height: 15px;
      padding: 0 4px !important;
      margin-right: 4px !important;
      border-radius: 3px !important;
      font-size: 9px !important;
      font-weight: 800 !important;
      line-height: 1 !important;
      background-color: ${badgeBg} !important;
      color: ${badgeColor} !important;
      border: 1px solid ${badgeBorder} !important;
      vertical-align: middle !important;
    }

    td .HL span.high-low-marker:empty,
    td .hl-tag:empty {
      display: none !important;
    }
  `;
};
