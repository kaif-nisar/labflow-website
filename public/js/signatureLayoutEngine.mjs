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
  minHeightPx: 44,
  maxHeightPx: 210,
  defaultWidthPct: 28,
  defaultHeightPx: 84,
  minStageHeightPx: 92,
  maxStageHeightPx: 320,
});

export const DEFAULT_SIGNATURE_SLOTS = Object.freeze({
  lab: Object.freeze({ xPct: 0, yPx: 10, widthPct: 28, heightPx: 84 }),
  doc1: Object.freeze({ xPct: 36, yPx: 10, widthPct: 28, heightPx: 84 }),
  doc2: Object.freeze({ xPct: 72, yPx: 10, widthPct: 28, heightPx: 84 }),
});

export const DEFAULT_SIGNATURE_LAYOUT = Object.freeze({
  version: 1,
  isCustom: false,
  slots: DEFAULT_SIGNATURE_SLOTS,
});

const clampNum = (value, min, max, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
};

const round2 = (value) => Math.round(value * 100) / 100;

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
    slots,
  };
}

export function scaleSignatureSlotUniformly(rawSlot, scaleRatio = 1, fallbackSlot = DEFAULT_SIGNATURE_SLOTS.doc1) {
  const current = normalizeSignatureSlotRect(rawSlot, fallbackSlot);
  const ratio = clampNum(scaleRatio, 0.55, 2.2, 1);
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

export function computeSlotScaleFactor(slot) {
  const s = normalizeSignatureSlotRect(slot);
  const widthRatio = s.widthPct / SIGNATURE_LAYOUT_BOUNDS.defaultWidthPct;
  const heightRatio = s.heightPx / SIGNATURE_LAYOUT_BOUNDS.defaultHeightPx;
  return round2(clampNum(Math.min(Math.max(widthRatio, 0.72), heightRatio * 1.06), 0.68, 1.75, 1));
}

export function computeSignatureSlotStyleMetrics(slot, baseFontSizePx = 10.5) {
  const s = normalizeSignatureSlotRect(slot);
  const base = clampNum(baseFontSizePx, 8, 18, 10.5);
  const scaleFactor = computeSlotScaleFactor(s);
  const textFontPx = round2(clampNum(base * scaleFactor, 7.5, 17, base));
  const nameFontPx = round2(clampNum(base * scaleFactor, 7.8, 17.5, base));
  const roleFontPx = round2(clampNum((base - 1.5) * scaleFactor, 7, 15, base - 1.5));
  const gapPx = Math.round(clampNum(3 * scaleFactor, 2, 7, 3));
  const reservedTextPx = Math.max(22, Math.round(textFontPx * 2.9 + 8));
  const imgMaxHeightPx = Math.max(20, s.heightPx - reservedTextPx);

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
  { minHeightPx = SIGNATURE_LAYOUT_BOUNDS.minStageHeightPx } = {}
) {
  const layout = normalizeSignatureLayout(rawLayout);
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
  layout,
  visibility = { lab: true, doc1: true, doc2: true },
  baseFontSizePx = 10.5,
} = {}) {
  const normalized = normalizeSignatureLayout(layout);
  if (!normalized.isCustom) return "";

  const stageHeightPx = computeSignatureStageHeightPx(normalized, visibility);
  const rules = [
    `${containerSelector} { position: relative !important; display: block !important; width: 100% !important; min-height: ${stageHeightPx}px !important; height: ${stageHeightPx}px !important; }`,
  ];

  for (const key of SIGNATURE_SLOT_KEYS) {
    const isVisible = visibility[key] !== false;
    const m = computeSignatureSlotStyleMetrics(normalized.slots[key], baseFontSizePx);
    const sel = `${containerSelector} ${slotSelector}[data-sig-slot="${key}"]`;

    if (!isVisible) {
      rules.push(`${sel} { display: none !important; }`);
      continue;
    }

    rules.push(
      `${sel} { position: absolute !important; left: ${m.xPct}% !important; top: ${m.yPx}px !important; width: ${m.widthPct}% !important; max-width: none !important; min-width: 0 !important; height: ${m.heightPx}px !important; margin: 0 !important; padding: 2px 4px !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: flex-end !important; text-align: center !important; flex: none !important; box-sizing: border-box !important; overflow: visible !important; }`,
      `${sel} .rf-sig-img-wrap, ${sel} .oh5-sign-img-wrap, ${sel} .ps-doc-sig-img-wrap { flex: 1 1 auto !important; min-height: 0 !important; width: 100% !important; height: auto !important; max-height: ${m.imgMaxHeightPx}px !important; display: flex !important; align-items: flex-end !important; justify-content: center !important; margin-bottom: ${m.gapPx}px !important; overflow: hidden !important; }`,
      `${sel} img, ${sel} .oh5-sign-img { max-width: 100% !important; max-height: ${m.imgMaxHeightPx}px !important; width: auto !important; height: auto !important; object-fit: contain !important; display: block !important; margin: 0 auto !important; }`,
      `${sel} .textspan, ${sel} .oh5-sign-cred { flex: 0 0 auto !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; text-align: center !important; font-size: ${m.textFontPx}px !important; line-height: 1.24 !important; white-space: pre-line !important; word-break: break-word !important; }`,
      `${sel} .oh5-sign-name { font-size: ${m.nameFontPx}px !important; line-height: 1.22 !important; }`,
      `${sel} .oh5-sign-role { font-size: ${m.roleFontPx}px !important; line-height: 1.22 !important; }`
    );
  }

  return rules.join("\n");
}

export function applySignatureLayoutToContainer(
  containerEl,
  rawLayout,
  { baseFontSizePx = 10.5, visibility = null } = {}
) {
  if (!containerEl) return false;
  const layout = normalizeSignatureLayout(rawLayout);
  if (!layout.isCustom) {
    containerEl.classList.remove("rf-sig-custom-stage");
    containerEl.style.position = "";
    containerEl.style.display = "";
    containerEl.style.flex = "";
    containerEl.style.width = "";
    containerEl.style.minWidth = "";
    containerEl.style.height = "";
    containerEl.style.minHeight = "";
    return false;
  }

  const slotNodes = Array.from(containerEl.querySelectorAll("[data-sig-slot]"));
  const effectiveVisibility = { lab: true, doc1: true, doc2: true };

  slotNodes.forEach((el) => {
    const key = el.getAttribute("data-sig-slot");
    if (!SIGNATURE_SLOT_KEYS.includes(key)) return;
    const isHidden = visibility && visibility[key] !== undefined
      ? !visibility[key]
      : (el.style.display === "none" || el.classList.contains("oh5-sign-hidden"));
    effectiveVisibility[key] = !isHidden;
  });

  const stageHeightPx = computeSignatureStageHeightPx(layout, effectiveVisibility);
  containerEl.classList.add("rf-sig-custom-stage");
  containerEl.style.setProperty("position", "relative", "important");
  containerEl.style.setProperty("display", "block", "important");
  if (containerEl.classList.contains("oh5-signatures")) {
    containerEl.style.setProperty("flex", "1 1 0", "important");
    containerEl.style.setProperty("width", "auto", "important");
    containerEl.style.setProperty("min-width", "0", "important");
  } else {
    containerEl.style.setProperty("width", "100%", "important");
  }
  containerEl.style.setProperty("min-height", `${stageHeightPx}px`, "important");
  containerEl.style.setProperty("height", `${stageHeightPx}px`, "important");

  slotNodes.forEach((el) => {
    const key = el.getAttribute("data-sig-slot");
    if (!SIGNATURE_SLOT_KEYS.includes(key)) return;
    if (!effectiveVisibility[key]) {
      el.style.setProperty("display", "none", "important");
      return;
    }

    const m = computeSignatureSlotStyleMetrics(layout.slots[key], baseFontSizePx);
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
      cred.style.setProperty("line-height", "1.24", "important");
    }

    const nameEl = el.querySelector(".oh5-sign-name");
    if (nameEl) nameEl.style.setProperty("font-size", `${m.nameFontPx}px`, "important");
    const roleEl = el.querySelector(".oh5-sign-role");
    if (roleEl) roleEl.style.setProperty("font-size", `${m.roleFontPx}px`, "important");
  });

  return true;
}
