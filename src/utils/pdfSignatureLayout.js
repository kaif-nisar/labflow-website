/**
 * ============================================================================
 * SERVER-SIDE PDF SIGNATURE LAYOUT BRIDGE
 * ============================================================================
 * Applies tenant custom draggable/resizable signature layout coordinates cleanly
 * onto both current and legacy saved HTML footers across all Report Formats.
 * ============================================================================
 */

import * as cheerio from "cheerio";
import {
  SIGNATURE_SLOT_KEYS,
  buildCustomSignatureStageCss,
  computeSignatureStageHeightPx,
  normalizeSignatureLayout,
} from "../../public/js/signatureLayoutEngine.mjs";

const parseFooterBool = (val) => {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val === 1;
  if (typeof val === "string") {
    const low = val.trim().toLowerCase();
    if (["true", "1", "yes"].includes(low)) return true;
    if (["false", "0", "no"].includes(low)) return false;
  }
  return undefined;
};

export function resolveEffectiveSignatureLayout({
  reqBody = null,
  doctorsignDoc = null,
  defaultpdfsetting = null,
  customizationDoc = null,
} = {}) {
  const candidates = [
    reqBody?.signatureLayout,
    doctorsignDoc?.signatureLayout,
    defaultpdfsetting?.signatureLayout,
    customizationDoc?.signatureLayout,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return normalizeSignatureLayout(candidate);
    }
    if (candidate && typeof candidate === "object" && (candidate.slots || candidate.footer)) {
      return normalizeSignatureLayout(candidate);
    }
  }

  return normalizeSignatureLayout(null);
}

/**
 * Ensures every signature slot element inside legacy or fresh footer markup
 * carries deterministic `data-sig-slot="lab"|"doc1"|"doc2"` and returns
 * resolved visibility + custom CSS + normalized HTML.
 */
export function applySignatureLayoutToFooterHtml({
  rawFooterHtml = "",
  signatureLayout = null,
  baseFontSizePx = 10.5,
  isFormat5 = false,
  showLab,
  showDoc1,
  showDoc2,
} = {}) {
  const normalizedLayout = normalizeSignatureLayout(signatureLayout);
  const hasCustomSlots = Boolean(normalizedLayout.isCustom);
  const hasCustomFooter = Boolean(normalizedLayout.footer?.isCustom);
  const raw = String(rawFooterHtml || "");

  if (!raw.trim() || (!hasCustomSlots && !hasCustomFooter)) {
    return {
      footerHtml: raw,
      layoutCss: "",
      layout: normalizedLayout,
      stageHeightPx: 0,
      isCustom: false,
      hasCustomSlots: false,
      hasCustomFooter: false,
    };
  }

  const $ = cheerio.load(raw, null, false);

  if (isFormat5) {
    const slotMap = [
      { key: "lab", sel: '#labInchargeSign, .lab-incharge-sign, .oh5-sign-lab, [data-sig-slot="lab"]' },
      { key: "doc1", sel: '#firstDoctorSign, .first-doctor-sign, .oh5-sign-doc1, [data-sig-slot="doc1"]' },
      { key: "doc2", sel: '#secondDoctorSign, .second-doctor-sign, .oh5-sign-doc2, [data-sig-slot="doc2"]' },
    ];
    slotMap.forEach(({ key, sel }) => {
      const $el = $(sel).first();
      if ($el.length) $el.attr("data-sig-slot", key);
    });
  } else {
    const $stage = $(".signed-off-div2").first();
    if ($stage.length) {
      // Tag unannotated legacy `.left-sign` children reliably by matching explicit id/attr or slot order
      const $slots = $stage.children(".left-sign, [data-sig-slot]");
      const explicitKeys = new Set();
      $slots.each((_, node) => {
        const k = $(node).attr("data-sig-slot");
        if (SIGNATURE_SLOT_KEYS.includes(k)) explicitKeys.add(k);
      });

      if (explicitKeys.size < 3 && $slots.length >= 1) {
        // Check legacy Format 1/3/4 order (doc1, lab, doc2) vs Print Settings/Standard order (lab, doc1, doc2)
        const hasQrBetween = $stage.children(".qr-div, .format3qrdiv").length > 0;
        const fallbackOrder = hasQrBetween ? ["lab", "doc1", "doc2"] : ["doc1", "lab", "doc2"];
        let idx = 0;
        $slots.each((_, node) => {
          const $node = $(node);
          const cur = $node.attr("data-sig-slot");
          if (!SIGNATURE_SLOT_KEYS.includes(cur)) {
            $node.attr("data-sig-slot", fallbackOrder[idx] || "doc2");
          }
          idx += 1;
        });
      }

      // Ensure image inside `.left-sign` is wrapped in `.rf-sig-img-wrap` so proportional height flex scaling works
      $stage.children('[data-sig-slot]').each((_, node) => {
        const $slotEl = $(node);
        if (!$slotEl.find(".rf-sig-img-wrap").length) {
          const $img = $slotEl.children("img").first();
          const $spacer = $slotEl.children("div").not(".textspan").first();
          if ($img.length) {
            $img.wrap('<div class="rf-sig-img-wrap"></div>');
          } else if ($spacer.length) {
            $spacer.addClass("rf-sig-img-wrap rf-sig-spacer");
            $spacer.removeAttr("style");
          } else {
            $slotEl.prepend('<div class="rf-sig-img-wrap rf-sig-spacer"></div>');
          }
        }
        // Clear legacy display inline style only on visible slots so CSS rules take cleanly
        $slotEl.removeAttr("width").removeAttr("height");
      });

      // Keep optional inline QR (in legacy Standard reportFormat.js) centered & non-overlapping
      const $inlineQr = $stage.children(".qr-div").first();
      if ($inlineQr.length && hasCustomSlots) {
        $inlineQr.attr("style", "position:absolute;left:50%;transform:translateX(-50%);bottom:2px;z-index:1;");
      }
    }
  }

  const resolveVis = (explicitFlag, slotKey) => {
    const parsedExplicit = parseFooterBool(explicitFlag);
    if (parsedExplicit !== undefined) return parsedExplicit;
    const $el = $(`[data-sig-slot="${slotKey}"]`).first();
    if (!$el.length) return false;
    if ($el.hasClass("oh5-sign-hidden")) return false;
    const inlineStyle = String($el.attr("style") || "").toLowerCase();
    return !/display\s*:\s*none/.test(inlineStyle);
  };

  const visibility = {
    lab: resolveVis(showLab, "lab"),
    doc1: resolveVis(showDoc1, "doc1"),
    doc2: resolveVis(showDoc2, "doc2"),
  };

  const stageHeightPx = computeSignatureStageHeightPx(normalizedLayout, visibility);
  const layoutCss = buildCustomSignatureStageCss({
    containerSelector: isFormat5 ? ".signatures, .oh5-signatures" : ".pdf-footer-div .signed-off-div2",
    slotSelector: isFormat5 ? ".oh5-sign-slot" : ".left-sign",
    footerWrapSelector: isFormat5 ? ".oh5-footer-wrap" : null,
    layout: normalizedLayout,
    visibility,
    baseFontSizePx,
  });

  return {
    footerHtml: $.html(),
    layoutCss,
    layout: normalizedLayout,
    stageHeightPx,
    isCustom: true,
    hasCustomSlots,
    hasCustomFooter,
  };
}
