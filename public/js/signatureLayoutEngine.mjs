/**
 * ============================================================================
 * LABFLOW INTERACTIVE SIGNATURE LAYOUT ENGINE (ISOMORPHIC ESM)
 * ============================================================================
 * Shared between Browser UI (`printsetting.js`, `reportAction.shared.js`,
 * `reportFormat*.js`) and Node PDF Engines (`pdfFormat1Helpers.js`,
 * `reportFormat5Pdf.controller.js`, `pdfgenerator.controller.js`,
 * `offlinePdfGenerator.controller.js`).
 *
 * Coordinate model (printable signature stage):
 *   - xPct     : 0..88   (% of signature stage width from left edge)
 *   - yPx      : 0..170  (CSS px from top edge of signature stage)
 *   - widthPct : 12..75  (% of signature stage width; xPct + widthPct <= 100)
 *   - heightPx : 44..210 (CSS px height of the signature box)
 * ============================================================================
 */

export const SIGNATURE_SLOT_KEYS = Object.freeze(["lab", "doc1", "doc2"]);

export const SIGNATURE_LAYOUT_BOUNDS = Object.freeze({
  minXPct: 0,
  maxXPct: 88,
  minYPx: 0,
  maxYPx: 170,
  minWidthPct: 12,
  maxWidthPct: 75,
  minHeightPx: 36,
  maxHeightPx: 210,
  defaultWidthPct: 28,
  defaultHeightPx: 84,
  minStageHeightPx: 52,
  maxStageHeightPx: 320,
});

export const FOOTER_BOX_BOUNDS = Object.freeze({
  minXPct: 0,
  maxXPct: 60,
  minWidthPct: 40,
  maxWidthPct: 100,
  minHeightPx: 52,
  maxHeightPx: 260,
  defaultXPct: 0,
  defaultWidthPct: 100,
  defaultHeightPx: 100,
});

export const DEFAULT_FOOTER_BOX = Object.freeze({
  isCustom: false,
  xPct: FOOTER_BOX_BOUNDS.defaultXPct,
  widthPct: FOOTER_BOX_BOUNDS.defaultWidthPct,
  heightPx: FOOTER_BOX_BOUNDS.defaultHeightPx,
});

export const DEFAULT_SIGNATURE_SLOTS = Object.freeze({
  lab: Object.freeze({ xPct: 0, yPx: 10, widthPct: 28, heightPx: 84 }),
  doc1: Object.freeze({ xPct: 36, yPx: 10, widthPct: 28, heightPx: 84 }),
  doc2: Object.freeze({ xPct: 72, yPx: 10, widthPct: 28, heightPx: 84 }),
});

export const DEFAULT_SIGNATURE_LAYOUT = Object.freeze({
  version: 1,
  isCustom: false,
  footer: DEFAULT_FOOTER_BOX,
  slots: DEFAULT_SIGNATURE_SLOTS,
});

const clampNum = (value, min, max, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
};

const round2 = (value) => Math.round(value * 100) / 100;

export function normalizeFooterBox(rawFooter = {}) {
  const src = rawFooter && typeof rawFooter === "object" ? rawFooter : {};
  const widthPct = round2(
    clampNum(
      src.widthPct ?? src.wPct ?? src.width,
      FOOTER_BOX_BOUNDS.minWidthPct,
      FOOTER_BOX_BOUNDS.maxWidthPct,
      DEFAULT_FOOTER_BOX.widthPct
    )
  );
  const maxAllowedX = Math.max(0, round2(100 - widthPct));
  const xPct = round2(
    clampNum(
      src.xPct ?? src.x ?? src.leftPct,
      FOOTER_BOX_BOUNDS.minXPct,
      maxAllowedX,
      Math.min(DEFAULT_FOOTER_BOX.xPct, maxAllowedX)
    )
  );
  const heightPx = Math.round(
    clampNum(
      src.heightPx ?? src.hPx ?? src.height,
      FOOTER_BOX_BOUNDS.minHeightPx,
      FOOTER_BOX_BOUNDS.maxHeightPx,
      DEFAULT_FOOTER_BOX.heightPx
    )
  );

  return {
    isCustom: Boolean(src.isCustom),
    xPct,
    widthPct,
    heightPx,
  };
}

export function normalizeSignatureSlotRect(rawSlot = {}, fallbackSlot = DEFAULT_SIGNATURE_SLOTS.doc1) {
  const fb = fallbackSlot || DEFAULT_SIGNATURE_SLOTS.doc1;
  const widthPct = round2(
    clampNum(
      rawSlot?.widthPct ?? rawSlot?.wPct ?? rawSlot?.width,
      SIGNATURE_LAYOUT_BOUNDS.minWidthPct,
      SIGNATURE_LAYOUT_BOUNDS.maxWidthPct,
      fb.widthPct
    )
  );
  const maxAllowedX = Math.max(0, round2(100 - widthPct));
  const xPct = round2(
    clampNum(rawSlot?.xPct ?? rawSlot?.x ?? rawSlot?.leftPct, 0, maxAllowedX, Math.min(fb.xPct, maxAllowedX))
  );
  const heightPx = Math.round(
    clampNum(
      rawSlot?.heightPx ?? rawSlot?.hPx ?? rawSlot?.height,
      SIGNATURE_LAYOUT_BOUNDS.minHeightPx,
      SIGNATURE_LAYOUT_BOUNDS.maxHeightPx,
      fb.heightPx
    )
  );
  const yPx = Math.round(
    clampNum(
      rawSlot?.yPx ?? rawSlot?.y ?? rawSlot?.topPx,
      SIGNATURE_LAYOUT_BOUNDS.minYPx,
      SIGNATURE_LAYOUT_BOUNDS.maxYPx,
      fb.yPx
    )
  );

  return { xPct, yPx, widthPct, heightPx };
}

export function normalizeSignatureLayout(rawLayout) {
  let source = rawLayout;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) source = null;
    else {
      try {
        source = JSON.parse(trimmed);
      } catch {
        source = null;
      }
    }
  }

  if (!source || typeof source !== "object") {
    return {
      version: 1,
      isCustom: false,
      footer: { ...DEFAULT_FOOTER_BOX },
      slots: {
        lab: { ...DEFAULT_SIGNATURE_SLOTS.lab },
        doc1: { ...DEFAULT_SIGNATURE_SLOTS.doc1 },
        doc2: { ...DEFAULT_SIGNATURE_SLOTS.doc2 },
      },
    };
  }

  const rawSlots = source.slots && typeof source.slots === "object" ? source.slots : source;
  const slots = {
    lab: normalizeSignatureSlotRect(rawSlots?.lab, DEFAULT_SIGNATURE_SLOTS.lab),
    doc1: normalizeSignatureSlotRect(rawSlots?.doc1, DEFAULT_SIGNATURE_SLOTS.doc1),
    doc2: normalizeSignatureSlotRect(rawSlots?.doc2, DEFAULT_SIGNATURE_SLOTS.doc2),
  };

  return {
    version: 1,
    isCustom: Boolean(source.isCustom),
    footer: normalizeFooterBox(source.footer),
    slots,
  };
}

export function hasCustomFooterOrSignatureLayout(rawLayout) {
  const norm = normalizeSignatureLayout(rawLayout);
  return Boolean(norm.isCustom || norm.footer?.isCustom);
}

export function scaleSignatureSlotUniformly(rawSlot, scaleRatio = 1, fallbackSlot = DEFAULT_SIGNATURE_SLOTS.doc1) {
  const current = normalizeSignatureSlotRect(rawSlot, fallbackSlot);
  const ratio = clampNum(scaleRatio, 0.48, 2.2, 1);
  const nextWidth = clampNum(
    DEFAULT_SIGNATURE_SLOTS.doc1.widthPct * ratio,
    SIGNATURE_LAYOUT_BOUNDS.minWidthPct,
    SIGNATURE_LAYOUT_BOUNDS.maxWidthPct,
    current.widthPct
  );
  const nextHeight = clampNum(
    DEFAULT_SIGNATURE_SLOTS.doc1.heightPx * ratio,
    SIGNATURE_LAYOUT_BOUNDS.minHeightPx,
    SIGNATURE_LAYOUT_BOUNDS.maxHeightPx,
    current.heightPx
  );
  const centerX = current.xPct + current.widthPct / 2;
  const nextX = clampNum(centerX - nextWidth / 2, 0, Math.max(0, 100 - nextWidth), current.xPct);

  return normalizeSignatureSlotRect(
    {
      xPct: nextX,
      yPx: current.yPx,
      widthPct: nextWidth,
      heightPx: nextHeight,
    },
    fallbackSlot
  );
}

export function fitSlotsToStageHeight(
  rawSlots,
  stageHeightPx,
  visibility = { lab: true, doc1: true, doc2: true }
) {
  const safeStageH = Math.round(
    clampNum(stageHeightPx, FOOTER_BOX_BOUNDS.minHeightPx, SIGNATURE_LAYOUT_BOUNDS.maxStageHeightPx, DEFAULT_FOOTER_BOX.heightPx)
  );
  const availH = Math.max(38, safeStageH - 4);
  let maxBottom = 0;

  for (const key of SIGNATURE_SLOT_KEYS) {
    if (visibility[key] === false) continue;
    const s = rawSlots?.[key];
    if (!s) continue;
    maxBottom = Math.max(maxBottom, s.yPx + s.heightPx);
  }

  if (maxBottom <= availH || maxBottom <= 0) {
    return {
      lab: { ...rawSlots.lab },
      doc1: { ...rawSlots.doc1 },
      doc2: { ...rawSlots.doc2 },
    };
  }

  const ratio = availH / maxBottom;
  const fitted = {};
  for (const key of SIGNATURE_SLOT_KEYS) {
    const s = rawSlots[key];
    let h = Math.max(SIGNATURE_LAYOUT_BOUNDS.minHeightPx, Math.min(availH, Math.floor(s.heightPx * ratio)));
    let y = Math.max(0, Math.floor(s.yPx * ratio));
    if (y + h > availH) {
      y = Math.max(0, availH - h);
    }
    fitted[key] = { ...s, yPx: y, heightPx: h };
  }
  return fitted;
}

export function computeSlotScaleFactor(slot, { footerWidthPct = 100 } = {}) {
  const s = normalizeSignatureSlotRect(slot);
  const widthScale = clampNum(footerWidthPct, FOOTER_BOX_BOUNDS.minWidthPct, 100, 100) / 100;
  const widthRatio = (s.widthPct * widthScale) / SIGNATURE_LAYOUT_BOUNDS.defaultWidthPct;
  const heightRatio = s.heightPx / SIGNATURE_LAYOUT_BOUNDS.defaultHeightPx;
  return round2(clampNum(Math.min(Math.max(widthRatio, 0.62), heightRatio * 1.06), 0.56, 1.75, 1));
}

export function computeSignatureSlotStyleMetrics(slot, baseFontSizePx = 10.5, { footerWidthPct = 100 } = {}) {
  const s = normalizeSignatureSlotRect(slot);
  const base = clampNum(baseFontSizePx, 8, 18, 10.5);
  const scaleFactor = computeSlotScaleFactor(s, { footerWidthPct });
  const textFontPx = round2(clampNum(base * scaleFactor, 6.8, 17, base));
  const nameFontPx = round2(clampNum(base * scaleFactor, 7.0, 17.5, base));
  const roleFontPx = round2(clampNum((base - 1.5) * scaleFactor, 6.4, 15, base - 1.5));
  const gapPx = Math.round(clampNum(3 * scaleFactor, 1, 7, 3));
  const reservedTextPx = Math.max(18, Math.round(textFontPx * 2.6 + 6));
  const imgMaxHeightPx = Math.max(14, s.heightPx - reservedTextPx);

  return {
    ...s,
    scaleFactor,
    textFontPx,
    nameFontPx,
    roleFontPx,
    gapPx,
    imgMaxHeightPx,
  };
}

export function computeSignatureStageHeightPx(
  rawLayout,
  visibility = { lab: true, doc1: true, doc2: true },
  { minHeightPx = 92 } = {}
) {
  const layout = normalizeSignatureLayout(rawLayout);
  if (layout.footer?.isCustom) {
    return layout.footer.heightPx;
  }

  let maxBottom = 0;

  for (const key of SIGNATURE_SLOT_KEYS) {
    if (visibility[key] === false) continue;
    const slot = layout.slots[key];
    if (!slot) continue;
    maxBottom = Math.max(maxBottom, slot.yPx + slot.heightPx);
  }

  if (maxBottom <= 0) {
    return Math.round(minHeightPx);
  }

  return Math.round(
    clampNum(
      Math.max(minHeightPx, maxBottom + 6),
      SIGNATURE_LAYOUT_BOUNDS.minStageHeightPx,
      SIGNATURE_LAYOUT_BOUNDS.maxStageHeightPx,
      minHeightPx
    )
  );
}

export function buildCustomSignatureStageCss({
  containerSelector = ".signed-off-div2",
  slotSelector = ".left-sign",
  footerWrapSelector = null,
  layout,
  visibility = { lab: true, doc1: true, doc2: true },
  baseFontSizePx = 10.5,
} = {}) {
  const normalized = normalizeSignatureLayout(layout);
  const hasCustomSlots = Boolean(normalized.isCustom);
  const hasCustomFooter = Boolean(normalized.footer?.isCustom);
  if (!hasCustomSlots && !hasCustomFooter) return "";

  const f = normalized.footer;
  const stageHeightPx = computeSignatureStageHeightPx(normalized, visibility);
  const rules = [];

  if (footerWrapSelector) {
    if (hasCustomFooter) {
      rules.push(
        `${footerWrapSelector} { width: ${f.widthPct}% !important; margin-left: ${f.xPct}% !important; margin-right: 0 !important; box-sizing: border-box !important; }`
      );
      if (stageHeightPx < 70) {
        rules.push(
          `${footerWrapSelector} .oh5-qr-block { padding: 2px 3px !important; gap: 1px !important; }`,
          `${footerWrapSelector} .oh5-qr-block img, ${footerWrapSelector} #qrimg { width: 34px !important; height: 34px !important; }`
        );
      }
    }
  }

  if (hasCustomSlots) {
    const fittedSlots = fitSlotsToStageHeight(normalized.slots, stageHeightPx, visibility);
    const widthAndAlignCss = !footerWrapSelector && hasCustomFooter
      ? `width: ${f.widthPct}% !important; margin-left: ${f.xPct}% !important; margin-right: 0 !important;`
      : (!footerWrapSelector ? `width: 100% !important;` : `width: 100% !important;`);

    rules.push(
      `${containerSelector} { position: relative !important; display: block !important; ${widthAndAlignCss} min-height: ${stageHeightPx}px !important; height: ${stageHeightPx}px !important; box-sizing: border-box !important; overflow: hidden !important; }`
    );

    for (const key of SIGNATURE_SLOT_KEYS) {
      const isVisible = visibility[key] !== false;
      const m = computeSignatureSlotStyleMetrics(fittedSlots[key], baseFontSizePx, { footerWidthPct: f.widthPct });
      const sel = `${containerSelector} ${slotSelector}[data-sig-slot="${key}"]`;

      if (!isVisible) {
        rules.push(`${sel} { display: none !important; }`);
        continue;
      }

      rules.push(
        `${sel} { position: absolute !important; left: ${m.xPct}% !important; top: ${m.yPx}px !important; width: ${m.widthPct}% !important; max-width: none !important; min-width: 0 !important; height: ${m.heightPx}px !important; margin: 0 !important; padding: 2px 4px !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: flex-end !important; text-align: center !important; flex: none !important; box-sizing: border-box !important; overflow: visible !important; }`,
        `${sel} .rf-sig-img-wrap, ${sel} .oh5-sign-img-wrap, ${sel} .ps-doc-sig-img-wrap { flex: 1 1 auto !important; min-height: 0 !important; width: 100% !important; height: auto !important; max-height: ${m.imgMaxHeightPx}px !important; display: flex !important; align-items: flex-end !important; justify-content: center !important; margin-bottom: ${m.gapPx}px !important; overflow: hidden !important; }`,
        `${sel} .rf-sig-spacer { max-height: ${m.imgMaxHeightPx}px !important; height: ${Math.min(35, m.imgMaxHeightPx)}px !important; width: auto !important; }`,
        `${sel} img, ${sel} .oh5-sign-img { max-width: 100% !important; max-height: ${m.imgMaxHeightPx}px !important; width: auto !important; height: auto !important; object-fit: contain !important; display: block !important; margin: 0 auto !important; }`,
        `${sel} .textspan, ${sel} .oh5-sign-cred { flex: 0 0 auto !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; text-align: center !important; font-size: ${m.textFontPx}px !important; line-height: 1.22 !important; white-space: pre-line !important; word-break: break-word !important; }`,
        `${sel} .oh5-sign-name { font-size: ${m.nameFontPx}px !important; line-height: 1.2 !important; }`,
        `${sel} .oh5-sign-role { font-size: ${m.roleFontPx}px !important; line-height: 1.2 !important; }`
      );
    }
  } else if (hasCustomFooter) {
    // Only footer container dimensions (width / height / left offset) were customized; keep flex layout cleanly scaled inside stageHeightPx
    const flexSlotH = Math.max(38, stageHeightPx - 4);
    const flexM = computeSignatureSlotStyleMetrics(
      { xPct: 0, yPx: 2, widthPct: 28, heightPx: flexSlotH },
      baseFontSizePx,
      { footerWidthPct: f.widthPct }
    );
    const flexContainerPosCss = !footerWrapSelector
      ? `width: ${f.widthPct}% !important; margin-left: ${f.xPct}% !important; margin-right: 0 !important;`
      : `width: auto !important;`;

    rules.push(
      `${containerSelector} { ${flexContainerPosCss} min-height: ${stageHeightPx}px !important; height: ${stageHeightPx}px !important; max-height: ${stageHeightPx}px !important; display: flex !important; align-items: flex-end !important; justify-content: space-between !important; gap: 10px !important; box-sizing: border-box !important; overflow: hidden !important; }`,
      `${containerSelector} ${slotSelector} { min-width: 0 !important; max-height: ${stageHeightPx}px !important; padding: 1px 3px !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: flex-end !important; text-align: center !important; box-sizing: border-box !important; }`,
      `${containerSelector} ${slotSelector}[style*="display: none"], ${containerSelector} ${slotSelector}[style*="display:none"], ${containerSelector} ${slotSelector}.oh5-sign-hidden { display: none !important; }`,
      `${containerSelector} ${slotSelector} .rf-sig-img-wrap, ${containerSelector} ${slotSelector} .oh5-sign-img-wrap, ${containerSelector} ${slotSelector} .ps-doc-sig-img-wrap { flex: 1 1 auto !important; min-height: 0 !important; width: 100% !important; height: auto !important; max-height: ${flexM.imgMaxHeightPx}px !important; display: flex !important; align-items: flex-end !important; justify-content: center !important; margin-bottom: ${flexM.gapPx}px !important; overflow: hidden !important; }`,
      `${containerSelector} ${slotSelector} .rf-sig-spacer { max-height: ${flexM.imgMaxHeightPx}px !important; height: ${Math.min(35, flexM.imgMaxHeightPx)}px !important; width: auto !important; }`,
      `${containerSelector} ${slotSelector} img, ${containerSelector} ${slotSelector} .oh5-sign-img { max-width: 100% !important; max-height: ${flexM.imgMaxHeightPx}px !important; width: auto !important; height: auto !important; object-fit: contain !important; display: block !important; margin: 0 auto !important; }`,
      `${containerSelector} ${slotSelector} .textspan, ${containerSelector} ${slotSelector} .oh5-sign-cred { flex: 0 0 auto !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; text-align: center !important; font-size: ${flexM.textFontPx}px !important; line-height: 1.2 !important; white-space: pre-line !important; word-break: break-word !important; }`,
      `${containerSelector} ${slotSelector} .oh5-sign-name { font-size: ${flexM.nameFontPx}px !important; line-height: 1.2 !important; }`,
      `${containerSelector} ${slotSelector} .oh5-sign-role { font-size: ${flexM.roleFontPx}px !important; line-height: 1.2 !important; }`
    );
  }

  return rules.join("\n");
}

export function applySignatureLayoutToContainer(
  containerEl,
  rawLayout,
  { baseFontSizePx = 10.5, visibility = null, footerWrapEl = null } = {}
) {
  if (!containerEl) return false;
  const layout = normalizeSignatureLayout(rawLayout);
  const hasCustomSlots = Boolean(layout.isCustom);
  const hasCustomFooter = Boolean(layout.footer?.isCustom);

  if (!hasCustomSlots && !hasCustomFooter) {
    containerEl.classList.remove("rf-sig-custom-stage", "rf-footer-custom-box");
    containerEl.style.position = "";
    containerEl.style.display = "";
    containerEl.style.flex = "";
    containerEl.style.width = "";
    containerEl.style.minWidth = "";
    containerEl.style.marginLeft = "";
    containerEl.style.marginRight = "";
    containerEl.style.height = "";
    containerEl.style.minHeight = "";
    containerEl.style.maxHeight = "";
    containerEl.style.overflow = "";
    if (footerWrapEl) {
      footerWrapEl.style.width = "";
      footerWrapEl.style.marginLeft = "";
      footerWrapEl.style.marginRight = "";
    }
    return false;
  }

  const slotNodes = Array.from(containerEl.querySelectorAll("[data-sig-slot], .left-sign, .oh5-sign-slot"));
  const effectiveVisibility = { lab: true, doc1: true, doc2: true };

  slotNodes.forEach((el) => {
    const key = el.getAttribute("data-sig-slot");
    if (!SIGNATURE_SLOT_KEYS.includes(key)) return;
    const isHidden = visibility && visibility[key] !== undefined
      ? !visibility[key]
      : (el.style.display === "none" || el.classList.contains("oh5-sign-hidden"));
    effectiveVisibility[key] = !isHidden;
  });

  const f = layout.footer;
  const stageHeightPx = computeSignatureStageHeightPx(layout, effectiveVisibility);

  if (footerWrapEl && hasCustomFooter) {
    footerWrapEl.style.setProperty("width", `${f.widthPct}%`, "important");
    footerWrapEl.style.setProperty("margin-left", `${f.xPct}%`, "important");
    footerWrapEl.style.setProperty("margin-right", "0", "important");
  }

  if (hasCustomSlots) {
    const fittedSlots = fitSlotsToStageHeight(layout.slots, stageHeightPx, effectiveVisibility);
    containerEl.classList.add("rf-sig-custom-stage");
    containerEl.style.setProperty("position", "relative", "important");
    containerEl.style.setProperty("display", "block", "important");
    if (containerEl.classList.contains("oh5-signatures")) {
      containerEl.style.setProperty("flex", "1 1 0", "important");
      containerEl.style.setProperty("width", "auto", "important");
      containerEl.style.setProperty("min-width", "0", "important");
    } else if (hasCustomFooter) {
      containerEl.style.setProperty("width", `${f.widthPct}%`, "important");
      containerEl.style.setProperty("margin-left", `${f.xPct}%`, "important");
      containerEl.style.setProperty("margin-right", "0", "important");
    } else {
      containerEl.style.setProperty("width", "100%", "important");
    }
    containerEl.style.setProperty("min-height", `${stageHeightPx}px`, "important");
    containerEl.style.setProperty("height", `${stageHeightPx}px`, "important");
    containerEl.style.setProperty("overflow", "hidden", "important");

    slotNodes.forEach((el) => {
      const key = el.getAttribute("data-sig-slot");
      if (!SIGNATURE_SLOT_KEYS.includes(key)) return;
      if (!effectiveVisibility[key]) {
        el.style.setProperty("display", "none", "important");
        return;
      }

      const m = computeSignatureSlotStyleMetrics(fittedSlots[key], baseFontSizePx, { footerWidthPct: f.widthPct });
      el.style.setProperty("position", "absolute", "important");
      el.style.setProperty("left", `${m.xPct}%`, "important");
      el.style.setProperty("top", `${m.yPx}px`, "important");
      el.style.setProperty("width", `${m.widthPct}%`, "important");
      el.style.setProperty("max-width", "none", "important");
      el.style.setProperty("min-width", "0", "important");
      el.style.setProperty("height", `${m.heightPx}px`, "important");
      el.style.setProperty("margin", "0", "important");
      el.style.setProperty("padding", "2px 4px", "important");
      el.style.setProperty("display", "flex", "important");
      el.style.setProperty("flex-direction", "column", "important");
      el.style.setProperty("align-items", "center", "important");
      el.style.setProperty("justify-content", "flex-end", "important");
      el.style.setProperty("text-align", "center", "important");
      el.style.setProperty("flex", "none", "important");
      el.style.setProperty("box-sizing", "border-box", "important");

      const imgWrap = el.querySelector(".rf-sig-img-wrap, .oh5-sign-img-wrap, .ps-doc-sig-img-wrap");
      if (imgWrap) {
        imgWrap.style.setProperty("flex", "1 1 auto", "important");
        imgWrap.style.setProperty("min-height", "0", "important");
        imgWrap.style.setProperty("width", "100%", "important");
        imgWrap.style.setProperty("max-height", `${m.imgMaxHeightPx}px`, "important");
        imgWrap.style.setProperty("display", "flex", "important");
        imgWrap.style.setProperty("align-items", "flex-end", "important");
        imgWrap.style.setProperty("justify-content", "center", "important");
        imgWrap.style.setProperty("margin-bottom", `${m.gapPx}px`, "important");
        imgWrap.style.setProperty("overflow", "hidden", "important");
      }

      const spacer = el.querySelector(".rf-sig-spacer");
      if (spacer) {
        spacer.style.setProperty("max-height", `${m.imgMaxHeightPx}px`, "important");
        spacer.style.setProperty("height", `${Math.min(35, m.imgMaxHeightPx)}px`, "important");
      }

      const img = el.querySelector("img");
      if (img) {
        img.style.setProperty("max-width", "100%", "important");
        img.style.setProperty("max-height", `${m.imgMaxHeightPx}px`, "important");
        img.style.setProperty("width", "auto", "important");
        img.style.setProperty("height", "auto", "important");
        img.style.setProperty("object-fit", "contain", "important");
        img.style.setProperty("margin", "0 auto", "important");
      }

      const cred = el.querySelector(".textspan, .oh5-sign-cred");
      if (cred) {
        cred.style.setProperty("flex", "0 0 auto", "important");
        cred.style.setProperty("width", "100%", "important");
        cred.style.setProperty("max-width", "100%", "important");
        cred.style.setProperty("font-size", `${m.textFontPx}px`, "important");
        cred.style.setProperty("line-height", "1.22", "important");
      }

      const nameEl = el.querySelector(".oh5-sign-name");
      if (nameEl) nameEl.style.setProperty("font-size", `${m.nameFontPx}px`, "important");
      const roleEl = el.querySelector(".oh5-sign-role");
      if (roleEl) roleEl.style.setProperty("font-size", `${m.roleFontPx}px`, "important");
    });
  } else if (hasCustomFooter) {
    const flexSlotH = Math.max(38, stageHeightPx - 4);
    const flexM = computeSignatureSlotStyleMetrics(
      { xPct: 0, yPx: 2, widthPct: 28, heightPx: flexSlotH },
      baseFontSizePx,
      { footerWidthPct: f.widthPct }
    );
    containerEl.classList.add("rf-footer-custom-box");
    if (!containerEl.classList.contains("oh5-signatures")) {
      containerEl.style.setProperty("width", `${f.widthPct}%`, "important");
      containerEl.style.setProperty("margin-left", `${f.xPct}%`, "important");
      containerEl.style.setProperty("margin-right", "0", "important");
    }
    containerEl.style.setProperty("min-height", `${stageHeightPx}px`, "important");
    containerEl.style.setProperty("height", `${stageHeightPx}px`, "important");
    containerEl.style.setProperty("max-height", `${stageHeightPx}px`, "important");
    containerEl.style.setProperty("display", "flex", "important");
    containerEl.style.setProperty("align-items", "flex-end", "important");
    containerEl.style.setProperty("justify-content", "space-between", "important");
    containerEl.style.setProperty("gap", "10px", "important");
    containerEl.style.setProperty("overflow", "hidden", "important");

    slotNodes.forEach((el) => {
      const key = el.getAttribute("data-sig-slot");
      if (SIGNATURE_SLOT_KEYS.includes(key) && !effectiveVisibility[key]) {
        el.style.setProperty("display", "none", "important");
        return;
      }
      el.style.setProperty("min-width", "0", "important");
      el.style.setProperty("max-height", `${stageHeightPx}px`, "important");
      el.style.setProperty("padding", "1px 3px", "important");
      el.style.setProperty("display", "flex", "important");
      el.style.setProperty("flex-direction", "column", "important");
      el.style.setProperty("align-items", "center", "important");
      el.style.setProperty("justify-content", "flex-end", "important");
      el.style.setProperty("text-align", "center", "important");

      const imgWrap = el.querySelector(".rf-sig-img-wrap, .oh5-sign-img-wrap, .ps-doc-sig-img-wrap");
      if (imgWrap) {
        imgWrap.style.setProperty("flex", "1 1 auto", "important");
        imgWrap.style.setProperty("min-height", "0", "important");
        imgWrap.style.setProperty("max-height", `${flexM.imgMaxHeightPx}px`, "important");
        imgWrap.style.setProperty("margin-bottom", `${flexM.gapPx}px`, "important");
        imgWrap.style.setProperty("overflow", "hidden", "important");
      }
      const spacer = el.querySelector(".rf-sig-spacer");
      if (spacer) {
        spacer.style.setProperty("max-height", `${flexM.imgMaxHeightPx}px`, "important");
        spacer.style.setProperty("height", `${Math.min(35, flexM.imgMaxHeightPx)}px`, "important");
      }
      const img = el.querySelector("img");
      if (img) {
        img.style.setProperty("max-width", "100%", "important");
        img.style.setProperty("max-height", `${flexM.imgMaxHeightPx}px`, "important");
        img.style.setProperty("width", "auto", "important");
        img.style.setProperty("height", "auto", "important");
        img.style.setProperty("object-fit", "contain", "important");
      }
      const cred = el.querySelector(".textspan, .oh5-sign-cred");
      if (cred) {
        cred.style.setProperty("font-size", `${flexM.textFontPx}px`, "important");
        cred.style.setProperty("line-height", "1.2", "important");
      }
      const nameEl = el.querySelector(".oh5-sign-name");
      if (nameEl) nameEl.style.setProperty("font-size", `${flexM.nameFontPx}px`, "important");
      const roleEl = el.querySelector(".oh5-sign-role");
      if (roleEl) roleEl.style.setProperty("font-size", `${flexM.roleFontPx}px`, "important");
    });
  }

  return true;
}
