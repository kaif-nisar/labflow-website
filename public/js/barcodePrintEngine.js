/**
 * LabFlow LIS — Universal Pathology Barcode Print & Zero-Waste Sheet Engine
 * Supports:
 *  - Full-Bleed Zero-Waste A4 Sticker / Gum Sheets (40, 48, 56, 65, 80, 84, 100, 120 Barcodes per Page)
 *  - Pre-Cut Factory Die A4 Sheets (NovaJet / Oddy 65L & 84L) with Half-Used Sheet Skip-Peeled Offset
 *  - Auto-Remember Next Empty Sticker Slot on Half-Used A4 Sheets (Zero Page Waste across single bookings)
 *  - Dedicated Thermal Roll Printers (TSC, Zebra, Xprinter, Godex: 50x25, 38x25, 50x38, 1-Up & 2-Up Twin)
 *  - 100% Offline Vector Code-128 SVG via local /vendor/jsbarcode/JsBarcode.all.min.js
 */
(function initLabFlowBarcodeEngine(global) {
    'use strict';

    if (global.LabFlowBarcode && global.LabFlowBarcode.__version === 2) {
        return;
    }

    const DEFAULT_PRESET_ID = 'a4_full_65';
    const LOCAL_PREF_KEY = 'labflow_barcode_print_prefs_v2';
    const A4_NEXT_SLOT_KEY = 'labflow_a4_next_slot_v1';
    const JSBARCODE_SRC = '/vendor/jsbarcode/JsBarcode.all.min.js';

    const PAPER_PRESETS = {
        /* ==================== A4 FULL-SHEET ZERO-WASTE GRIDS ==================== */
        a4_full_65: {
            id: 'a4_full_65',
            group: 'a4_full',
            name: 'A4 Full Sheet — 65 Barcodes (5 × 13) • Zero Waste',
            shortDesc: '41.2 × 22.5 mm • Covers 100% of A4 Sheet (65 Tubes / Page)',
            type: 'a4',
            pageWidthMm: 210,
            pageHeightMm: 297,
            cols: 5,
            rows: 13,
            labelWidthMm: 41.2,
            labelHeightMm: 22.5,
            padTopMm: 1.5,
            padLeftMm: 2.0,
            colGapMm: 0,
            rowGapMm: 0,
            compact: true,
            fullBleedGrid: true,
        },
        a4_full_84: {
            id: 'a4_full_84',
            group: 'a4_full',
            name: 'A4 Full Sheet — 84 Barcodes (4 × 21) • Slim Strips',
            shortDesc: '51.5 × 13.95 mm • Covers 100% of A4 Sheet (84 Vacutainer Strips / Page)',
            type: 'a4',
            pageWidthMm: 210,
            pageHeightMm: 297,
            cols: 4,
            rows: 21,
            labelWidthMm: 51.5,
            labelHeightMm: 13.95,
            padTopMm: 1.5,
            padLeftMm: 2.0,
            colGapMm: 0,
            rowGapMm: 0,
            compact: true,
            slimStrip: true,
            fullBleedGrid: true,
        },
        a4_full_100: {
            id: 'a4_full_100',
            group: 'a4_full',
            name: 'A4 Ultra-Pack — 100 Barcodes (5 × 20) • Zero Waste',
            shortDesc: '41.2 × 14.65 mm • 100 Barcodes on 1 Single A4 Sheet',
            type: 'a4',
            pageWidthMm: 210,
            pageHeightMm: 297,
            cols: 5,
            rows: 20,
            labelWidthMm: 41.2,
            labelHeightMm: 14.65,
            padTopMm: 1.5,
            padLeftMm: 2.0,
            colGapMm: 0,
            rowGapMm: 0,
            compact: true,
            slimStrip: true,
            fullBleedGrid: true,
        },
        a4_full_120: {
            id: 'a4_full_120',
            group: 'a4_full',
            name: 'A4 Max-Saver — 120 Barcodes (6 × 20) • Mini Vial Strips',
            shortDesc: '34.4 × 14.65 mm • Maximum 120 Tube Barcodes on 1 Single A4 Sheet',
            type: 'a4',
            pageWidthMm: 210,
            pageHeightMm: 297,
            cols: 6,
            rows: 20,
            labelWidthMm: 34.4,
            labelHeightMm: 14.65,
            padTopMm: 1.5,
            padLeftMm: 1.8,
            colGapMm: 0,
            rowGapMm: 0,
            compact: true,
            ultraSlim: true,
            fullBleedGrid: true,
        },
        a4_full_80: {
            id: 'a4_full_80',
            group: 'a4_full',
            name: 'A4 Full Sheet — 80 Barcodes (5 × 16) • Zero Waste',
            shortDesc: '41.2 × 18.35 mm • 80 Tube Stickers on 1 Single A4 Sheet',
            type: 'a4',
            pageWidthMm: 210,
            pageHeightMm: 297,
            cols: 5,
            rows: 16,
            labelWidthMm: 41.2,
            labelHeightMm: 18.35,
            padTopMm: 1.5,
            padLeftMm: 2.0,
            colGapMm: 0,
            rowGapMm: 0,
            compact: true,
            fullBleedGrid: true,
        },
        a4_full_56: {
            id: 'a4_full_56',
            group: 'a4_full',
            name: 'A4 Full Sheet — 56 Barcodes (4 × 14) • Zero Waste',
            shortDesc: '51.5 × 21.0 mm • 56 Wide Vacutainer Stickers / Page',
            type: 'a4',
            pageWidthMm: 210,
            pageHeightMm: 297,
            cols: 4,
            rows: 14,
            labelWidthMm: 51.5,
            labelHeightMm: 21.0,
            padTopMm: 1.5,
            padLeftMm: 2.0,
            colGapMm: 0,
            rowGapMm: 0,
            compact: true,
            fullBleedGrid: true,
        },
        a4_full_48: {
            id: 'a4_full_48',
            group: 'a4_full',
            name: 'A4 Patient Sheet — 48 Barcodes (4 × 12) • Full Details',
            shortDesc: '51.5 × 24.4 mm • Ideal for Patient Name + Age + Tests on Full A4',
            type: 'a4',
            pageWidthMm: 210,
            pageHeightMm: 297,
            cols: 4,
            rows: 12,
            labelWidthMm: 51.5,
            labelHeightMm: 24.4,
            padTopMm: 1.5,
            padLeftMm: 2.0,
            colGapMm: 0,
            rowGapMm: 0,
            compact: false,
            fullBleedGrid: true,
        },
        a4_40: {
            id: 'a4_40',
            group: 'a4_full',
            name: 'A4 Full Sheet — 40 Barcodes (4 × 10) • Medium Tube',
            shortDesc: '51.5 × 29.3 mm • Covers 100% of A4 Sheet (40 Labels / Page)',
            type: 'a4',
            pageWidthMm: 210,
            pageHeightMm: 297,
            cols: 4,
            rows: 10,
            labelWidthMm: 51.5,
            labelHeightMm: 29.3,
            padTopMm: 1.5,
            padLeftMm: 2.0,
            colGapMm: 0,
            rowGapMm: 0,
            compact: false,
            fullBleedGrid: true,
        },
        a4_24: {
            id: 'a4_24',
            group: 'a4_full',
            name: 'A4 Full Sheet — 24 Barcodes (3 × 8) • Container / Pouch',
            shortDesc: '68.6 × 36.7 mm • Large Urine / Histopath / Sample Bag Sheet',
            type: 'a4',
            pageWidthMm: 210,
            pageHeightMm: 297,
            cols: 3,
            rows: 8,
            labelWidthMm: 68.6,
            labelHeightMm: 36.7,
            padTopMm: 1.5,
            padLeftMm: 2.1,
            colGapMm: 0,
            rowGapMm: 0,
            compact: false,
            fullBleedGrid: true,
        },

        /* ==================== A4 FACTORY PRE-CUT DIE SHEETS ==================== */
        a4_65: {
            id: 'a4_65',
            group: 'a4_precut',
            name: 'A4 Pre-Cut 65L Die Sheet (NovaJet / Oddy 38.1 × 21.2 mm)',
            shortDesc: '5 × 13 Factory Die-Cut Sheet (10.7 mm Top Margin, 2.5 mm Gap)',
            type: 'a4',
            pageWidthMm: 210,
            pageHeightMm: 297,
            cols: 5,
            rows: 13,
            labelWidthMm: 38.1,
            labelHeightMm: 21.2,
            padTopMm: 10.7,
            padLeftMm: 4.75,
            colGapMm: 2.5,
            rowGapMm: 0,
            compact: true,
            fullBleedGrid: false,
        },
        a4_84: {
            id: 'a4_84',
            group: 'a4_precut',
            name: 'A4 Pre-Cut 84L Die Sheet (Oddy 46 × 11.1 mm)',
            shortDesc: '4 × 21 Factory Pre-Cut Slim Barcode Sheet',
            type: 'a4',
            pageWidthMm: 210,
            pageHeightMm: 297,
            cols: 4,
            rows: 21,
            labelWidthMm: 46,
            labelHeightMm: 11.1,
            padTopMm: 15.5,
            padLeftMm: 8,
            colGapMm: 3.3,
            rowGapMm: 1.5,
            compact: true,
            ultraSlim: true,
            fullBleedGrid: false,
        },

        /* ==================== DEDICATED THERMAL ROLL PRINTERS ==================== */
        thermal_50x25_2up: {
            id: 'thermal_50x25_2up',
            group: 'thermal',
            name: 'Thermal Roll 50 × 25 mm (2-Up Twin — 2 Across)',
            shortDesc: '2-Across Side-by-Side Thermal Roll (104 mm Web • TSC / Zebra)',
            type: 'thermal',
            pageWidthMm: 104,
            pageHeightMm: 25,
            cols: 2,
            rows: 1,
            labelWidthMm: 50,
            labelHeightMm: 25,
            padTopMm: 0,
            padLeftMm: 1,
            colGapMm: 2,
            rowGapMm: 0,
            compact: false,
        },
        thermal_50x25_1up: {
            id: 'thermal_50x25_1up',
            group: 'thermal',
            name: 'Thermal Roll 50 × 25 mm (1-Up Dedicated Roll Only)',
            shortDesc: '2" × 1" Dedicated Single-Column Thermal Barcode Printer ONLY',
            type: 'thermal',
            pageWidthMm: 50,
            pageHeightMm: 25,
            cols: 1,
            rows: 1,
            labelWidthMm: 50,
            labelHeightMm: 25,
            padTopMm: 0,
            padLeftMm: 0,
            colGapMm: 0,
            rowGapMm: 0,
            compact: false,
        },
        thermal_38x25_2up: {
            id: 'thermal_38x25_2up',
            group: 'thermal',
            name: 'Thermal Roll 38 × 25 mm (2-Up Twin Compact Roll)',
            shortDesc: '2-Across Compact Thermal Roll (80 mm Web)',
            type: 'thermal',
            pageWidthMm: 80,
            pageHeightMm: 25,
            cols: 2,
            rows: 1,
            labelWidthMm: 38,
            labelHeightMm: 25,
            padTopMm: 0,
            padLeftMm: 1,
            colGapMm: 2,
            rowGapMm: 0,
            compact: true,
        },
        thermal_38x25_1up: {
            id: 'thermal_38x25_1up',
            group: 'thermal',
            name: 'Thermal Roll 38 × 25 mm (1-Up Small Roll Only)',
            shortDesc: '1.5" × 1" Dedicated Paediatric Thermal Roll Printer ONLY',
            type: 'thermal',
            pageWidthMm: 38,
            pageHeightMm: 25,
            cols: 1,
            rows: 1,
            labelWidthMm: 38,
            labelHeightMm: 25,
            padTopMm: 0,
            padLeftMm: 0,
            colGapMm: 0,
            rowGapMm: 0,
            compact: true,
        },
        thermal_50x38_1up: {
            id: 'thermal_50x38_1up',
            group: 'thermal',
            name: 'Thermal Roll 50 × 38 mm (Large Container Roll Only)',
            shortDesc: '2" × 1.5" Dedicated Container Thermal Printer ONLY',
            type: 'thermal',
            pageWidthMm: 50,
            pageHeightMm: 38,
            cols: 1,
            rows: 1,
            labelWidthMm: 50,
            labelHeightMm: 38,
            padTopMm: 0,
            padLeftMm: 0,
            colGapMm: 0,
            rowGapMm: 0,
            compact: false,
        },
    };

    let jsBarcodePromise = null;
    let cachedTenantSettings = null;

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function loadLocalPrefs() {
        try {
            const raw = global.localStorage.getItem(LOCAL_PREF_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (_e) {
            return {};
        }
    }

    function saveLocalPrefs(patch = {}) {
        try {
            const next = { ...loadLocalPrefs(), ...patch };
            global.localStorage.setItem(LOCAL_PREF_KEY, JSON.stringify(next));
            return next;
        } catch (_e) {
            return patch;
        }
    }

    function getSavedA4NextSlot(presetId) {
        try {
            const raw = global.localStorage.getItem(A4_NEXT_SLOT_KEY);
            const map = raw ? JSON.parse(raw) : {};
            const val = Number.parseInt(map[presetId], 10);
            const preset = PAPER_PRESETS[presetId];
            const maxSlots = preset ? preset.cols * preset.rows : 65;
            if (Number.isFinite(val) && val >= 1 && val <= maxSlots) {
                return val;
            }
            return 1;
        } catch (_e) {
            return 1;
        }
    }

    function setSavedA4NextSlot(presetId, nextSlot) {
        try {
            const raw = global.localStorage.getItem(A4_NEXT_SLOT_KEY);
            const map = raw ? JSON.parse(raw) : {};
            const preset = PAPER_PRESETS[presetId];
            const maxSlots = preset ? preset.cols * preset.rows : 65;
            let normalized = ((Number.parseInt(nextSlot, 10) - 1) % maxSlots) + 1;
            if (!Number.isFinite(normalized) || normalized < 1) normalized = 1;
            map[presetId] = normalized;
            global.localStorage.setItem(A4_NEXT_SLOT_KEY, JSON.stringify(map));
            return normalized;
        } catch (_e) {
            return 1;
        }
    }

    function buildPresetOptgroupsHtml(selectedPresetId = DEFAULT_PRESET_ID) {
        const groups = [
            {
                key: 'a4_full',
                label: '📄 A4 Full Sheet (Laser / Inkjet — 100% Sheet Covered • Zero Waste)',
            },
            {
                key: 'a4_precut',
                label: '📄 A4 Factory Pre-Cut Sticker Sheets (NovaJet / Oddy)',
            },
            {
                key: 'thermal',
                label: '🏷️ Thermal Barcode Roll Printer ONLY (TSC / Zebra / Xprinter)',
            },
        ];

        return groups
            .map((g) => {
                const opts = Object.values(PAPER_PRESETS)
                    .filter((p) => p.group === g.key)
                    .map(
                        (p) =>
                            `<option value="${p.id}" ${p.id === selectedPresetId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
                    )
                    .join('');
                return `<optgroup label="${escapeHtml(g.label)}">${opts}</optgroup>`;
            })
            .join('');
    }

    function ensureJsBarcode() {
        if (typeof global.JsBarcode === 'function') {
            return Promise.resolve(global.JsBarcode);
        }
        if (jsBarcodePromise) {
            return jsBarcodePromise;
        }
        jsBarcodePromise = new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src*="/JsBarcode.all.min.js"]`);
            if (existing && typeof global.JsBarcode === 'function') {
                resolve(global.JsBarcode);
                return;
            }
            const script = document.createElement('script');
            script.src = JSBARCODE_SRC;
            script.async = true;
            script.onload = () => {
                if (typeof global.JsBarcode === 'function') {
                    resolve(global.JsBarcode);
                } else {
                    jsBarcodePromise = null;
                    reject(new Error('JsBarcode loaded without global symbol.'));
                }
            };
            script.onerror = () => {
                jsBarcodePromise = null;
                reject(new Error('Failed to load offline JsBarcode library.'));
            };
            document.head.appendChild(script);
        });
        return jsBarcodePromise;
    }

    function resolveVacutainerMeta(sampleType = '') {
        const raw = String(sampleType || '').trim();
        const lower = raw.toLowerCase();
        if (!raw) return { code: 'SAMPLE', cap: 'TUBE', shortCap: 'TUB', hex: '#475569' };
        if (lower.includes('edta') || lower.includes('whole blood') || lower === 'wb' || lower.includes('lavender') || lower.includes('purple')) {
            return { code: 'EDTA', cap: 'LAVENDER', shortCap: 'LAV', hex: '#7c3aed' };
        }
        if (lower.includes('fluoride') || lower.includes('sugar') || lower.includes('grey') || lower.includes('gray')) {
            return { code: 'FLUORIDE', cap: 'GREY', shortCap: 'GRY', hex: '#475569' };
        }
        if (lower.includes('citrate') || lower.includes('coag') || lower.includes('blue')) {
            return { code: 'CITRATE', cap: 'BLUE', shortCap: 'BLU', hex: '#0284c7' };
        }
        if (lower.includes('heparin') || lower.includes('green')) {
            return { code: 'HEPARIN', cap: 'GREEN', shortCap: 'GRN', hex: '#059669' };
        }
        if (lower.includes('serum') || lower.includes('plain') || lower.includes('clot') || lower.includes('sst') || lower.includes('gel')) {
            return { code: 'SERUM', cap: 'RED/SST', shortCap: 'RED', hex: '#dc2626' };
        }
        if (lower.includes('urine')) {
            return { code: 'URINE', cap: 'CONTAINER', shortCap: 'URN', hex: '#d97706' };
        }
        if (lower.includes('stool') || lower.includes('faeces') || lower.includes('feces')) {
            return { code: 'STOOL', cap: 'CONTAINER', shortCap: 'STL', hex: '#92400e' };
        }
        return {
            code: raw.toUpperCase().slice(0, 11),
            cap: 'STERILE',
            shortCap: 'STR',
            hex: '#0f766e',
        };
    }

    function generateBarcodeSvgMarkup(codeValue, options = {}) {
        const cleanCode = String(codeValue || '').trim();
        if (!cleanCode || typeof global.JsBarcode !== 'function') {
            return `<div style="font-family:monospace;font-weight:700;font-size:10px;text-align:center;">${escapeHtml(cleanCode)}</div>`;
        }

        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        const barWidth = Number(options.barWidth) || 1.5;
        const barHeightPx = Math.max(20, Math.round((Number(options.heightMm) || 10) * 3.78));

        try {
            global.JsBarcode(svg, cleanCode, {
                format: 'CODE128',
                width: barWidth,
                height: barHeightPx,
                displayValue: false,
                margin: 0,
                background: '#ffffff',
                lineColor: '#000000',
            });
            svg.setAttribute('preserveAspectRatio', 'none');
            svg.style.width = '100%';
            svg.style.maxWidth = '100%';
            svg.style.height = `${Number(options.heightMm) || 10}mm`;
            svg.style.display = 'block';
            return svg.outerHTML;
        } catch (_err) {
            return `<div style="font-family:monospace;font-weight:700;font-size:10px;text-align:center;">${escapeHtml(cleanCode)}</div>`;
        }
    }

    function buildSingleStickerInnerHtml(item, preset, config = {}) {
        const isPreprinted = item.labelType === 'preprinted';
        const isMasterBag = item.labelType === 'master_bag';
        const fontScale = Number(config.fontScale) || 1;
        const isSlim = Boolean(preset.ultraSlim || preset.slimStrip);

        const basePt = (preset.ultraSlim ? 5.4 : preset.slimStrip ? 5.9 : preset.compact ? 6.2 : 7.0) * fontScale;
        const titlePt = (preset.ultraSlim ? 6.0 : preset.slimStrip ? 6.4 : preset.compact ? 7.0 : 8.0) * fontScale;
        const codePt = (preset.ultraSlim ? 6.3 : preset.slimStrip ? 6.9 : preset.compact ? 7.4 : 8.4) * fontScale;

        let barcodeHeightMm = Number(config.barcodeHeightMm) || 10.5;
        if (preset.labelHeightMm <= 12.0) {
            barcodeHeightMm = Math.min(barcodeHeightMm, 5.2);
        } else if (preset.labelHeightMm <= 15.2) {
            barcodeHeightMm = Math.min(barcodeHeightMm, isPreprinted ? 7.4 : 6.4);
        } else if (preset.labelHeightMm <= 19.0) {
            barcodeHeightMm = Math.min(barcodeHeightMm, isPreprinted ? 9.2 : 7.4);
        } else if (preset.labelHeightMm <= 23.0) {
            barcodeHeightMm = Math.min(barcodeHeightMm, isPreprinted ? 10.6 : 8.4);
        } else if (preset.labelHeightMm <= 26.0) {
            barcodeHeightMm = Math.min(barcodeHeightMm, isPreprinted ? 12.0 : 9.6);
        } else {
            barcodeHeightMm = Math.min(20, Math.max(barcodeHeightMm, 12.5));
        }

        const svgMarkup = generateBarcodeSvgMarkup(item.barcode, {
            barWidth: config.barWidth || 1.5,
            heightMm: barcodeHeightMm,
        });

        const vac = item.vacutainer || (item.sampleType || item.sampleHint
            ? resolveVacutainerMeta(item.sampleType || item.sampleHint)
            : null);

        if (isSlim) {
            const topMeta = !isPreprinted && config.showPatientName !== false && item.patientName && preset.labelHeightMm >= 13.5
                ? `<div class="lf-row-between" style="font-size:${basePt.toFixed(1)}pt;">
                        <span class="lf-pt-name lf-ellipsis">${escapeHtml(item.patientName)}</span>
                        ${vac ? `<span class="lf-slim-tag">${escapeHtml(vac.shortCap)}</span>` : ''}
                   </div>`
                : '';

            const tag = isPreprinted
                ? (item.sampleHint ? vac?.code : (config.showLabName ? item.headerName : ''))
                : (!topMeta ? (item.patientName || vac?.code || '') : (item.ageGender || vac?.code || ''));

            return `
                <div class="lf-sticker-inner lf-slim">
                    ${topMeta}
                    <div class="lf-svg-wrap">${svgMarkup}</div>
                    <div class="lf-slim-foot" style="font-size:${codePt.toFixed(1)}pt;">
                        <span class="lf-code-num">${escapeHtml(item.barcode)}</span>
                        ${tag ? `<span class="lf-slim-tag">${escapeHtml(String(tag).slice(0, 12))}</span>` : ''}
                    </div>
                </div>
            `;
        }

        if (isPreprinted) {
            const topHeader = config.showLabName && (item.assignedToName || item.headerName)
                ? String(item.assignedToName || item.headerName)
                : '';
            const hintPill = item.sampleHint && vac
                ? `${vac.code}${config.showVacutainerGuide !== false ? `•${vac.shortCap}` : ''}`
                : '';
            return `
                <div class="lf-sticker-inner lf-preprinted">
                    ${(topHeader || hintPill) ? `
                        <div class="lf-row-between" style="font-size:${basePt.toFixed(1)}pt;">
                            <span class="lf-ellipsis lf-lab-head">${escapeHtml(topHeader)}</span>
                            ${hintPill ? `<span class="lf-cap-pill">${escapeHtml(hintPill)}</span>` : ''}
                        </div>
                    ` : ''}
                    <div class="lf-svg-wrap">${svgMarkup}</div>
                    <div class="lf-code-line" style="font-size:${(codePt + 0.5).toFixed(1)}pt;">
                        ${escapeHtml(item.barcode)}
                    </div>
                </div>
            `;
        }

        const showPatient = config.showPatientName !== false;
        const showAgeSex = config.showAgeGender !== false && item.ageGender;
        const showSample = config.showSampleType !== false;
        const showTests = config.showTests !== false && item.testsText;
        const showDate = config.showDateTime !== false && item.dateTimeText;
        const showLab = Boolean(config.showLabName) && item.headerName;
        const showReg = Boolean(config.showBookingId) && item.bookingId;

        const tubeBadge = isMasterBag
            ? 'POUCH / BAG'
            : vac
              ? (config.showVacutainerGuide !== false ? `${vac.code}•${vac.shortCap}` : vac.code)
              : (item.sampleType || 'TUBE');

        const footerLeft = item.barcode;
        const footerRightParts = [];
        if (showReg) footerRightParts.push(`#${item.bookingId}`);
        if (showDate) footerRightParts.push(item.dateTimeText);
        const footerRight = footerRightParts.join(' ');

        return `
            <div class="lf-sticker-inner lf-patient">
                ${showLab && preset.labelHeightMm >= 28 ? `
                    <div class="lf-lab-banner lf-ellipsis" style="font-size:${(basePt - 0.4).toFixed(1)}pt;">
                        ${escapeHtml(item.headerName)}
                    </div>
                ` : ''}
                ${(showPatient || showAgeSex) ? `
                    <div class="lf-row-between lf-pt-line" style="font-size:${titlePt.toFixed(1)}pt;">
                        <span class="lf-pt-name lf-ellipsis">${escapeHtml(showPatient ? (item.patientName || 'Patient') : '')}</span>
                        ${showAgeSex ? `<span class="lf-pt-age">${escapeHtml(item.ageGender)}</span>` : ''}
                    </div>
                ` : ''}
                ${(showSample || showTests) ? `
                    <div class="lf-row-between lf-meta-line" style="font-size:${basePt.toFixed(1)}pt;">
                        ${showSample ? `<span class="lf-cap-pill">${escapeHtml(tubeBadge)}</span>` : ''}
                        ${showTests ? `<span class="lf-tests lf-ellipsis">${escapeHtml(item.testsText)}</span>` : ''}
                    </div>
                ` : ''}
                <div class="lf-svg-wrap">${svgMarkup}</div>
                <div class="lf-row-between lf-foot-line" style="font-size:${basePt.toFixed(1)}pt;">
                    <span class="lf-code-num" style="font-size:${codePt.toFixed(1)}pt;">${escapeHtml(footerLeft)}</span>
                    ${footerRight ? `<span class="lf-date lf-ellipsis">${escapeHtml(footerRight)}</span>` : (showLab ? `<span class="lf-date lf-ellipsis">${escapeHtml(item.headerName)}</span>` : '')}
                </div>
            </div>
        `;
    }

    function expandLabelsWithCopiesAndOffset(items = [], options = {}) {
        const globalCopies = Math.max(1, Number.parseInt(options.copies, 10) || 1);
        const startPosition = Math.max(1, Number.parseInt(options.startPosition, 10) || 1);
        const preset = PAPER_PRESETS[options.paperPreset] || PAPER_PRESETS[DEFAULT_PRESET_ID];

        const slots = [];
        if (preset.type === 'a4' && startPosition > 1) {
            const skipCount = Math.min(preset.cols * preset.rows - 1, startPosition - 1);
            for (let i = 0; i < skipCount; i += 1) {
                slots.push({ __skip: true });
            }
        }

        for (const item of items) {
            const itemCopies = item.copies !== undefined
                ? Math.max(1, Number.parseInt(item.copies, 10) || 1)
                : globalCopies;
            for (let c = 0; c < itemCopies; c += 1) {
                slots.push(item);
            }
        }

        return slots;
    }

    function getSlotPaddingCss(preset) {
        if (preset.cols >= 6) return '0.6mm 1.5mm';
        if (preset.ultraSlim || preset.slimStrip) return '0.7mm 1.9mm';
        if (preset.compact) return '1.0mm 1.9mm';
        return '1.3mm 2.1mm';
    }

    function buildPrintDocumentHtml(items = [], options = {}) {
        const preset = PAPER_PRESETS[options.paperPreset] || PAPER_PRESETS[DEFAULT_PRESET_ID];
        const topOffsetMm = Number(options.topOffsetMm) || 0;
        const leftOffsetMm = Number(options.leftOffsetMm) || 0;
        const showCutLines = options.showCutLines !== undefined
            ? Boolean(options.showCutLines)
            : Boolean(preset.fullBleedGrid);

        const slots = expandLabelsWithCopiesAndOffset(items, options);
        const slotsPerPage = Math.max(1, preset.cols * preset.rows);

        const pages = [];
        for (let idx = 0; idx < slots.length; idx += slotsPerPage) {
            pages.push(slots.slice(idx, idx + slotsPerPage));
        }

        const padTop = Math.max(0, preset.padTopMm + topOffsetMm);
        const padLeft = Math.max(0, preset.padLeftMm + leftOffsetMm);
        const isA4 = preset.type === 'a4';
        const pageSizeRule = isA4
            ? 'A4 portrait'
            : `${preset.pageWidthMm}mm ${preset.pageHeightMm}mm`;
        // Use 296.2mm on A4 so sub-pixel rounding in Chromium never spills onto an extra blank page
        const safePageHeightMm = isA4 ? 296.2 : preset.pageHeightMm;

        const pagesMarkup = pages
            .map((pageSlots, pIdx) => {
                const cells = pageSlots
                    .map((slot) => {
                        if (slot.__skip) {
                            return `<div class="lf-slot lf-slot-skip"></div>`;
                        }
                        return `<div class="lf-slot${showCutLines ? ' lf-slot-cutline' : ''}">${buildSingleStickerInnerHtml(slot, preset, options)}</div>`;
                    })
                    .join('');
                const isLast = pIdx === pages.length - 1;
                return `<section class="lf-print-page${isLast ? ' lf-last-page' : ''}">${cells}</section>`;
            })
            .join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>LabFlow Barcode Sheet (${preset.cols}x${preset.rows})</title>
<style>
    @page {
        size: ${pageSizeRule};
        margin: 0mm !important;
    }
    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
    html, body {
        width: ${preset.pageWidthMm}mm;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        font-family: Arial, Helvetica, sans-serif;
    }
    .lf-print-page {
        width: ${preset.pageWidthMm}mm;
        height: ${safePageHeightMm}mm;
        padding-top: ${padTop.toFixed(2)}mm;
        padding-left: ${padLeft.toFixed(2)}mm;
        display: grid;
        grid-template-columns: repeat(${preset.cols}, ${preset.labelWidthMm}mm);
        grid-auto-rows: ${preset.labelHeightMm}mm;
        align-content: start;
        justify-content: start;
        column-gap: ${preset.colGapMm}mm;
        row-gap: ${preset.rowGapMm}mm;
        overflow: hidden;
        page-break-inside: avoid;
        break-inside: avoid;
        page-break-after: always;
        break-after: page;
    }
    .lf-print-page.lf-last-page {
        page-break-after: avoid !important;
        break-after: avoid !important;
    }
    .lf-slot {
        width: ${preset.labelWidthMm}mm;
        height: ${preset.labelHeightMm}mm;
        padding: ${getSlotPaddingCss(preset)};
        overflow: hidden;
        display: flex;
        align-items: stretch;
        justify-content: stretch;
        background: #ffffff;
        page-break-inside: avoid;
        break-inside: avoid;
    }
    .lf-slot-cutline {
        outline: 0.18mm dashed #cbd5e1;
        outline-offset: -0.09mm;
    }
    .lf-slot-skip {
        visibility: hidden;
    }
    .lf-sticker-inner {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        overflow: hidden;
        color: #000000;
    }
    .lf-row-between {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.8mm;
        width: 100%;
        line-height: 1.1;
        white-space: nowrap;
        overflow: hidden;
    }
    .lf-ellipsis {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .lf-lab-banner, .lf-lab-head {
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
    }
    .lf-pt-name {
        font-weight: 800;
        text-transform: uppercase;
        flex: 1 1 auto;
        min-width: 0;
    }
    .lf-pt-age {
        font-weight: 700;
        flex-shrink: 0;
    }
    .lf-cap-pill {
        font-weight: 800;
        border: 0.25mm solid #000000;
        border-radius: 0.6mm;
        padding: 0.08mm 0.8mm;
        line-height: 1.05;
        flex-shrink: 0;
        letter-spacing: 0.01em;
    }
    .lf-tests {
        font-weight: 600;
        flex: 1 1 auto;
        min-width: 0;
        text-align: right;
    }
    .lf-svg-wrap {
        width: 100%;
        padding: 0.2mm 0.8mm;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1 1 auto;
        min-height: 0;
    }
    .lf-code-num, .lf-code-line {
        font-family: "Courier New", Consolas, monospace;
        font-weight: 800;
        letter-spacing: 0.03em;
        line-height: 1.05;
    }
    .lf-code-line {
        text-align: center;
        width: 100%;
    }
    .lf-date {
        font-weight: 600;
        text-align: right;
        flex: 1 1 auto;
        min-width: 0;
    }
    .lf-slim-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.8mm;
        line-height: 1;
    }
    .lf-slim-tag {
        font-size: 5.2pt;
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
</head>
<body>
${pagesMarkup}
</body>
</html>`;
    }

    async function renderPreviewCardHtml(sampleItem, options = {}) {
        await ensureJsBarcode();
        const preset = PAPER_PRESETS[options.paperPreset] || PAPER_PRESETS[DEFAULT_PRESET_ID];
        const inner = buildSingleStickerInnerHtml(sampleItem, preset, options);
        return `
            <div class="lf-preview-sticker-shell" style="
                width:${preset.labelWidthMm}mm;
                height:${preset.labelHeightMm}mm;
                padding:${getSlotPaddingCss(preset)};
                background:#ffffff;
                color:#000000;
                border:1px dashed #94a3b8;
                border-radius:5px;
                box-shadow:0 6px 18px rgba(15,23,42,0.12);
                font-family:Arial,Helvetica,sans-serif;
                overflow:hidden;
                display:flex;
                flex-shrink:0;
            ">
                <style>
                    .lf-preview-sticker-shell .lf-sticker-inner{width:100%;height:100%;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;color:#000;}
                    .lf-preview-sticker-shell .lf-row-between{display:flex;align-items:center;justify-content:space-between;gap:1mm;width:100%;line-height:1.1;white-space:nowrap;overflow:hidden;}
                    .lf-preview-sticker-shell .lf-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                    .lf-preview-sticker-shell .lf-lab-banner,.lf-preview-sticker-shell .lf-lab-head{font-weight:700;text-transform:uppercase;}
                    .lf-preview-sticker-shell .lf-pt-name{font-weight:800;text-transform:uppercase;flex:1 1 auto;min-width:0;}
                    .lf-preview-sticker-shell .lf-pt-age{font-weight:700;flex-shrink:0;}
                    .lf-preview-sticker-shell .lf-cap-pill{font-weight:800;border:1px solid #000;border-radius:3px;padding:0 3px;line-height:1.05;flex-shrink:0;}
                    .lf-preview-sticker-shell .lf-tests{font-weight:600;flex:1 1 auto;min-width:0;text-align:right;}
                    .lf-preview-sticker-shell .lf-svg-wrap{width:100%;padding:1px 3px;display:flex;align-items:center;justify-content:center;flex:1 1 auto;min-height:0;}
                    .lf-preview-sticker-shell .lf-code-num,.lf-preview-sticker-shell .lf-code-line{font-family:"Courier New",Consolas,monospace;font-weight:800;letter-spacing:0.03em;line-height:1.05;}
                    .lf-preview-sticker-shell .lf-code-line{text-align:center;width:100%;}
                    .lf-preview-sticker-shell .lf-date{font-weight:600;text-align:right;flex:1 1 auto;min-width:0;}
                    .lf-preview-sticker-shell .lf-slim-foot{display:flex;align-items:center;justify-content:space-between;gap:1mm;line-height:1;}
                </style>
                ${inner}
            </div>
        `;
    }

    /**
     * Renders a miniature Full-Sheet A4 Page Map so users can visually confirm
     * that all 40/48/65/84/100/120 barcodes cover 100% of the page with zero waste.
     */
    function renderSheetSimulationHtml(options = {}) {
        const preset = PAPER_PRESETS[options.paperPreset] || PAPER_PRESETS[DEFAULT_PRESET_ID];
        const totalStickers = Math.max(1, Number.parseInt(options.totalStickers, 10) || 65);
        const startPosition = Math.max(1, Number.parseInt(options.startPosition, 10) || 1);

        if (preset.type !== 'a4') {
            const totalRows = Math.ceil(totalStickers / preset.cols);
            const previewRows = Math.min(6, totalRows);
            const rollCells = [];
            let printed = 0;
            for (let r = 0; r < previewRows; r += 1) {
                for (let c = 0; c < preset.cols; c += 1) {
                    printed += 1;
                    const active = printed <= totalStickers;
                    rollCells.push(`
                        <div style="
                            height:24px;
                            border-radius:4px;
                            border:1px solid ${active ? '#3b82f6' : '#cbd5e1'};
                            background:${active ? '#ffffff' : '#f1f5f9'};
                            display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px 4px;
                        ">
                            ${active ? `<div style="width:86%;height:9px;background:repeating-linear-gradient(90deg,#0f172a 0 2px,#fff 2px 3.5px,#0f172a 3.5px 4.5px,#fff 4.5px 6px);"></div><span style="font-size:7px;font-family:monospace;font-weight:800;color:#0f172a;margin-top:1px;">#${printed}</span>` : ''}
                        </div>
                    `);
                }
            }
            return `
                <div style="display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;">
                    <div style="font-size:11px;font-weight:700;color:#92400e;background:#fef3c7;border:1px solid #fde68a;padding:5px 10px;border-radius:8px;text-align:center;width:100%;">
                        <i class="fas fa-exclamation-triangle"></i> Dedicated Thermal Roll Mode (${preset.cols}-Across Roll) — For Normal A4 Printer, select an <strong>A4 Full Sheet</strong> preset!
                    </div>
                    <div style="width:${preset.cols === 2 ? '185px' : '105px'};background:#cbd5e1;padding:8px;border-radius:8px;display:grid;grid-template-columns:repeat(${preset.cols},1fr);gap:5px;">
                        ${rollCells.join('')}
                    </div>
                    <div style="font-size:11px;color:#475569;font-weight:600;">${totalRows} Roll Feed Step(s) • ${totalStickers} Total Stickers</div>
                </div>
            `;
        }

        const cellsPerPage = preset.cols * preset.rows;
        const skippedOnFirst = Math.min(cellsPerPage - 1, Math.max(0, startPosition - 1));
        const totalSlotsNeeded = skippedOnFirst + totalStickers;
        const totalPages = Math.max(1, Math.ceil(totalSlotsNeeded / cellsPerPage));
        const usedOnLastPage = totalSlotsNeeded - (totalPages - 1) * cellsPerPage;
        const emptyOnLastPage = Math.max(0, cellsPerPage - usedOnLastPage);

        // Render Page 1 miniature grid
        const cellNodes = [];
        for (let pos = 1; pos <= cellsPerPage; pos += 1) {
            if (pos <= skippedOnFirst) {
                cellNodes.push(
                    `<div title="Slot #${pos}: Already peeled / skipped" style="background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:1.5px;"></div>`
                );
            } else if (pos <= totalSlotsNeeded) {
                cellNodes.push(
                    `<div title="Slot #${pos}: Barcode Printed" style="background:#ffffff;border:0.5px solid #93c5fd;border-radius:1.5px;display:flex;align-items:center;justify-content:center;padding:1px;">
                        <div style="width:84%;height:62%;background:repeating-linear-gradient(90deg,#0f172a 0 1.4px,#ffffff 1.4px 2.6px,#0f172a 2.6px 3.4px,#ffffff 3.4px 4.5px);opacity:0.88;"></div>
                    </div>`
                );
            } else {
                cellNodes.push(
                    `<div title="Slot #${pos}: Empty unused slot" style="background:#fffbeb;border:0.5px dashed #f59e0b;border-radius:1.5px;"></div>`
                );
            }
        }

        const isZeroWaste = emptyOnLastPage === 0;
        const badgeHtml = isZeroWaste
            ? `<div style="font-size:11.5px;font-weight:800;color:#065f46;background:#d1fae5;border:1px solid #6ee7b7;padding:5px 10px;border-radius:8px;width:100%;text-align:center;">
                    <i class="fas fa-check-circle"></i> 100% Sheet Covered • Zero Paper Waste (${totalPages} A4 Sheet${totalPages > 1 ? 's' : ''} = ${totalStickers} Barcodes)
               </div>`
            : `<div style="font-size:11.5px;font-weight:700;color:#92400e;background:#fef3c7;border:1px solid #fcd34d;padding:5px 10px;border-radius:8px;width:100%;text-align:center;">
                    <i class="fas fa-lightbulb"></i> ${emptyOnLastPage} empty slot(s) left on Sheet ${totalPages} — Add <strong>+${emptyOnLastPage}</strong> barcodes for 100% Full Sheet!
               </div>`;

        return `
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;">
                ${badgeHtml}
                <div style="
                    width:154px;
                    height:218px;
                    background:#ffffff;
                    border:1.5px solid #64748b;
                    border-radius:4px;
                    padding:3px;
                    box-shadow:0 8px 20px rgba(15,23,42,0.14);
                    display:grid;
                    grid-template-columns:repeat(${preset.cols}, minmax(0, 1fr));
                    grid-template-rows:repeat(${preset.rows}, minmax(0, 1fr));
                    gap:1.5px;
                " title="A4 Sheet Miniature (${preset.cols} columns × ${preset.rows} rows = ${cellsPerPage} barcodes per page)">
                    ${cellNodes.join('')}
                </div>
                <div style="font-size:11px;color:#475569;font-weight:700;text-align:center;">
                    Page 1 Map: ${preset.cols} Cols × ${preset.rows} Rows = <strong>${cellsPerPage} Barcodes / A4 Page</strong>
                </div>
            </div>
        `;
    }

    async function printLabels(items = [], options = {}) {
        if (!Array.isArray(items) || items.length === 0) {
            throw new Error('No barcode labels selected to print.');
        }

        await ensureJsBarcode();
        const docHtml = buildPrintDocumentHtml(items, options);

        if (options.openInNewTab) {
            const win = global.open('', '_blank');
            if (win && win.document) {
                win.document.open();
                win.document.write(docHtml);
                win.document.close();
                setTimeout(() => {
                    try {
                        win.focus();
                        win.print();
                    } catch (_e) {}
                }, 180);
                return;
            }
        }

        const oldFrame = document.getElementById('lf-barcode-print-iframe');
        if (oldFrame) {
            oldFrame.remove();
        }

        const iframe = document.createElement('iframe');
        iframe.id = 'lf-barcode-print-iframe';
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
        document.body.appendChild(iframe);

        const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
        frameDoc.open();
        frameDoc.write(docHtml);
        frameDoc.close();

        await new Promise((resolve) => setTimeout(resolve, 160));
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (err) {
            console.error('Iframe print fallback error:', err);
            const fallbackWin = global.open('', '_blank');
            if (fallbackWin && fallbackWin.document) {
                fallbackWin.document.open();
                fallbackWin.document.write(docHtml);
                fallbackWin.document.close();
                fallbackWin.focus();
                fallbackWin.print();
            }
        }

        setTimeout(() => {
            try {
                iframe.remove();
            } catch (_e) {}
        }, 60000);
    }

    async function fetchSettings(force = false) {
        if (cachedTenantSettings && !force) {
            return cachedTenantSettings;
        }
        try {
            const res = await fetch('/api/v1/user/barcodes/settings', {
                method: 'GET',
                credentials: 'include',
            });
            const data = await res.json();
            if (res.ok && data?.success) {
                cachedTenantSettings = data;
                return data;
            }
        } catch (err) {
            console.warn('Could not load server barcode settings, using defaults:', err);
        }
        return {
            settings: {
                defaultPaperPreset: DEFAULT_PRESET_ID,
                defaultCopies: 1,
                showLabName: true,
                showPatientName: true,
                showAgeGender: true,
                showSampleType: true,
                showVacutainerGuide: true,
                showTests: true,
                showDateTime: true,
                showBookingId: false,
                includeMasterBagLabel: false,
                calibration: {
                    topOffsetMm: 0,
                    leftOffsetMm: 0,
                    barWidth: 1.5,
                    barcodeHeightMm: 10.5,
                    fontScale: 1,
                },
            },
            resolvedHeaderName: 'Pathology Lab',
        };
    }

    function invalidateSettingsCache() {
        cachedTenantSettings = null;
    }

    /* ========================================================================
     * UNIVERSAL MODAL FOR PRINTING PATIENT / CASE BARCODES FROM ANY PORTAL PAGE
     * ====================================================================== */
    function ensureModalStyles() {
        if (document.getElementById('lf-barcode-modal-styles')) return;
        const style = document.createElement('style');
        style.id = 'lf-barcode-modal-styles';
        style.textContent = `
            .lf-bc-backdrop {
                position: fixed;
                inset: 0;
                z-index: 99990;
                background: rgba(15, 23, 42, 0.62);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                font-family: Inter, system-ui, -apple-system, sans-serif;
            }
            .lf-bc-dialog {
                width: min(960px, 100%);
                max-height: 92vh;
                background: #ffffff;
                color: #0f172a;
                border-radius: 16px;
                border: 1px solid #e2e8f0;
                box-shadow: 0 24px 64px rgba(15, 23, 42, 0.28);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            html[data-theme="dark"] .lf-bc-dialog {
                background: #0f172a;
                color: #f1f5f9;
                border-color: #1e293b;
            }
            .lf-bc-header {
                padding: 15px 22px;
                border-bottom: 1px solid #e2e8f0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
            }
            html[data-theme="dark"] .lf-bc-header {
                background: #1e293b;
                border-color: #334155;
            }
            .lf-bc-body {
                display: grid;
                grid-template-columns: 1.2fr 1fr;
                gap: 0;
                overflow-y: auto;
                min-height: 0;
                flex: 1 1 auto;
            }
            @media (max-width: 820px) {
                .lf-bc-body {
                    grid-template-columns: 1fr;
                }
            }
            .lf-bc-left {
                padding: 18px 20px;
                border-right: 1px solid #e2e8f0;
                overflow-y: auto;
            }
            html[data-theme="dark"] .lf-bc-left {
                border-color: #1e293b;
            }
            .lf-bc-right {
                padding: 18px 20px;
                background: #f8fafc;
                display: flex;
                flex-direction: column;
                gap: 13px;
            }
            html[data-theme="dark"] .lf-bc-right {
                background: #0b1120;
            }
            .lf-bc-tube-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: 10px 12px;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                margin-bottom: 8px;
                background: #ffffff;
                transition: border-color 0.15s ease;
            }
            html[data-theme="dark"] .lf-bc-tube-row {
                background: #1e293b;
                border-color: #334155;
            }
            .lf-bc-tube-row:hover {
                border-color: #3b82f6;
            }
            .lf-bc-footer {
                padding: 14px 22px;
                border-top: 1px solid #e2e8f0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                background: #ffffff;
                flex-wrap: wrap;
            }
            html[data-theme="dark"] .lf-bc-footer {
                background: #0f172a;
                border-color: #1e293b;
            }
            .lf-bc-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                padding: 9px 16px;
                border-radius: 9px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                border: 1px solid transparent;
                transition: all 0.15s ease;
            }
            .lf-bc-btn-primary {
                background: #2563eb;
                color: #ffffff;
                box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
            }
            .lf-bc-btn-primary:hover {
                background: #1d4ed8;
            }
            .lf-bc-btn-ghost {
                background: transparent;
                border-color: #cbd5e1;
                color: inherit;
            }
            html[data-theme="dark"] .lf-bc-btn-ghost {
                border-color: #334155;
            }
            .lf-bc-select, .lf-bc-input {
                width: 100%;
                padding: 8px 10px;
                border-radius: 8px;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                color: #0f172a;
                font-size: 13px;
            }
            html[data-theme="dark"] .lf-bc-select,
            html[data-theme="dark"] .lf-bc-input {
                background: #1e293b;
                border-color: #334155;
                color: #f8fafc;
            }
            .lf-bc-chip-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 6px;
            }
            .lf-bc-check-pill {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                padding: 6px 8px;
                border-radius: 7px;
                border: 1px solid #e2e8f0;
                background: #ffffff;
                cursor: pointer;
                user-select: none;
            }
            html[data-theme="dark"] .lf-bc-check-pill {
                background: #1e293b;
                border-color: #334155;
            }
            .lf-a4-mini-grid {
                display: grid;
                gap: 3px;
                padding: 8px;
                border-radius: 8px;
                background: #ffffff;
                border: 1px solid #cbd5e1;
                max-height: 145px;
                overflow-y: auto;
            }
            html[data-theme="dark"] .lf-a4-mini-grid {
                background: #1e293b;
                border-color: #334155;
            }
            .lf-a4-cell {
                height: 18px;
                border-radius: 3px;
                font-size: 9px;
                font-weight: 700;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border: 1px solid #cbd5e1;
                background: #eff6ff;
                color: #1e40af;
            }
            .lf-a4-cell.skipped {
                background: #f1f5f9;
                color: #94a3b8;
                text-decoration: line-through;
                border-style: dashed;
            }
            .lf-a4-cell.start-active {
                background: #2563eb;
                color: #ffffff;
                border-color: #1d4ed8;
            }
            .lf-a4-cell.will-print {
                background: #dbeafe;
                color: #1e3a8a;
                border-color: #60a5fa;
            }
        `;
        document.head.appendChild(style);
    }

    async function openBookingPrintModal(params = {}) {
        ensureModalStyles();

        const existingModal = document.getElementById('lf-universal-barcode-modal');
        if (existingModal) existingModal.remove();

        const backdrop = document.createElement('div');
        backdrop.id = 'lf-universal-barcode-modal';
        backdrop.className = 'lf-bc-backdrop';
        backdrop.innerHTML = `
            <div class="lf-bc-dialog" role="dialog" aria-modal="true">
                <div class="lf-bc-header">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:36px;height:36px;border-radius:10px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;">
                            <i class="fas fa-barcode"></i>
                        </div>
                        <div>
                            <div style="font-size:15px;font-weight:700;">${escapeHtml(params.title || 'Print Sample Tube Barcodes')}</div>
                            <div id="lf-bc-subtitle" style="font-size:12px;opacity:0.75;">Preparing tube labels & zero-waste sheet layout...</div>
                        </div>
                    </div>
                    <button type="button" id="lf-bc-close-top" class="lf-bc-btn lf-bc-btn-ghost" style="padding:6px 10px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div id="lf-bc-loading" style="padding:48px 24px;text-align:center;font-size:14px;">
                    <i class="fas fa-circle-notch fa-spin" style="font-size:22px;color:#2563eb;margin-bottom:10px;"></i>
                    <div>Loading tube barcode metadata...</div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        const closeModal = () => {
            document.removeEventListener('keydown', onKeyDown);
            backdrop.remove();
            if (typeof params.onClose === 'function') {
                params.onClose();
            }
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape') closeModal();
        };
        document.addEventListener('keydown', onKeyDown);
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeModal();
        });
        backdrop.querySelector('#lf-bc-close-top')?.addEventListener('click', closeModal);

        try {
            const [settingsData] = await Promise.all([
                fetchSettings(false),
                ensureJsBarcode(),
            ]);

            const serverSettings = settingsData?.settings || {};
            const headerName = settingsData?.resolvedHeaderName || 'Pathology Lab';
            const localPrefs = loadLocalPrefs();

            let baseLabels = [];
            if (Array.isArray(params.rawLabels) && params.rawLabels.length > 0) {
                baseLabels = params.rawLabels.map((lbl, idx) => ({
                    id: lbl.id || `raw_${idx}`,
                    labelType: lbl.labelType || 'patient_tube',
                    bookingId: lbl.bookingId || '',
                    barcode: String(lbl.barcode || '').trim(),
                    patientName: lbl.patientName || '',
                    ageGender: lbl.ageGender || '',
                    sampleType: lbl.sampleType || 'Sample',
                    vacutainer: lbl.vacutainer || resolveVacutainerMeta(lbl.sampleType || lbl.sampleHint || ''),
                    testsText: lbl.testsText || '',
                    dateTimeText: lbl.dateTimeText || '',
                    headerName: lbl.headerName || headerName,
                    selected: true,
                    copies: Math.max(1, Number.parseInt(lbl.copies || localPrefs.copies || serverSettings.defaultCopies, 10) || 1),
                }));
            } else {
                const bookingIds = Array.isArray(params.bookingIds)
                    ? params.bookingIds
                    : params.bookingId
                      ? [params.bookingId]
                      : [];
                const bookingDocIds = Array.isArray(params.bookingDocIds) ? params.bookingDocIds : [];

                const res = await fetch('/api/v1/user/barcodes/booking-labels', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ bookingIds, bookingDocIds }),
                });
                const payload = await res.json();
                if (!res.ok || !payload?.success) {
                    throw new Error(payload?.message || 'Unable to load sample barcodes for this booking.');
                }
                baseLabels = (payload.labels || []).map((lbl) => ({
                    ...lbl,
                    selected: params.filterBarcode
                        ? String(lbl.barcode) === String(params.filterBarcode)
                        : true,
                    copies: Math.max(1, Number.parseInt(localPrefs.copies || serverSettings.defaultCopies, 10) || 1),
                }));
            }

            if (baseLabels.length === 0) {
                throw new Error('No sample barcodes are mapped to this booking yet.');
            }

            const resolvedPreset = PAPER_PRESETS[localPrefs.paperPreset]
                ? localPrefs.paperPreset
                : PAPER_PRESETS[serverSettings.defaultPaperPreset]
                  ? serverSettings.defaultPaperPreset
                  : DEFAULT_PRESET_ID;

            const autoAdvanceSlot = localPrefs.autoAdvanceA4Slot !== false;

            const state = {
                labels: baseLabels,
                paperPreset: resolvedPreset,
                autoAdvanceA4Slot: autoAdvanceSlot,
                startPosition: autoAdvanceSlot ? getSavedA4NextSlot(resolvedPreset) : 1,
                showCutLines: localPrefs.showCutLines !== undefined
                    ? Boolean(localPrefs.showCutLines)
                    : Boolean(PAPER_PRESETS[resolvedPreset]?.fullBleedGrid),
                includeMasterBagLabel: Boolean(
                    localPrefs.includeMasterBagLabel ?? serverSettings.includeMasterBagLabel ?? false
                ),
                showPatientName: localPrefs.showPatientName ?? serverSettings.showPatientName ?? true,
                showAgeGender: localPrefs.showAgeGender ?? serverSettings.showAgeGender ?? true,
                showSampleType: localPrefs.showSampleType ?? serverSettings.showSampleType ?? true,
                showVacutainerGuide: localPrefs.showVacutainerGuide ?? serverSettings.showVacutainerGuide ?? true,
                showTests: localPrefs.showTests ?? serverSettings.showTests ?? true,
                showDateTime: localPrefs.showDateTime ?? serverSettings.showDateTime ?? true,
                showLabName: localPrefs.showLabName ?? serverSettings.showLabName ?? false,
                showBookingId: localPrefs.showBookingId ?? serverSettings.showBookingId ?? false,
                calibration: serverSettings.calibration || {},
            };

            const dialog = backdrop.querySelector('.lf-bc-dialog');
            const loadingEl = backdrop.querySelector('#lf-bc-loading');
            if (loadingEl) loadingEl.remove();

            const uniqueBookingsCount = new Set(baseLabels.map((l) => l.bookingId).filter(Boolean)).size || 1;
            const subtitleEl = backdrop.querySelector('#lf-bc-subtitle');
            if (subtitleEl) {
                subtitleEl.textContent = `${baseLabels.length} sample tube(s) across ${uniqueBookingsCount} booking(s) ready to print`;
            }

            const presetOptionsHtml = buildPresetOptgroupsHtml(state.paperPreset);

            const contentWrapper = document.createElement('div');
            contentWrapper.style.cssText = 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0;';
            contentWrapper.innerHTML = `
                <div class="lf-bc-body">
                    <div class="lf-bc-left">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                            <div style="font-size:13px;font-weight:700;">
                                Sample Tubes (${baseLabels.length})
                            </div>
                            <div style="display:flex;gap:8px;align-items:center;">
                                <button type="button" id="lf-bc-sel-all" style="font-size:11.5px;color:#2563eb;background:none;border:none;cursor:pointer;font-weight:600;">Select All</button>
                                <span style="opacity:0.35;">|</span>
                                <button type="button" id="lf-bc-plus-all" style="font-size:11.5px;color:#059669;background:none;border:none;cursor:pointer;font-weight:600;">+1 Copy All</button>
                            </div>
                        </div>
                        <div id="lf-bc-tubes-list"></div>
                        <label class="lf-bc-check-pill" style="margin-top:10px;border-color:#bfdbfe;background:rgba(37,99,235,0.06);">
                            <input type="checkbox" id="lf-bc-master-bag" ${state.includeMasterBagLabel ? 'checked' : ''}>
                            <span><strong>+1 Zip-Pouch Master Label</strong> per patient (for TRF / outer sample bag)</span>
                        </label>
                    </div>
                    <div class="lf-bc-right">
                        <div>
                            <label style="display:block;font-size:12px;font-weight:700;margin-bottom:5px;">
                                Sheet / Roll Layout (Zero-Waste A4 or Thermal Roll)
                            </label>
                            <select id="lf-bc-preset" class="lf-bc-select">${presetOptionsHtml}</select>
                            <div id="lf-bc-preset-desc" style="font-size:11px;opacity:0.75;margin-top:4px;"></div>
                        </div>

                        <div id="lf-bc-a4-offset-wrap" style="display:none;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px;">
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
                                <label style="font-size:12px;font-weight:800;color:#1e40af;">Start at Sticker # (Zero Sheet Waste)</label>
                                <div style="display:flex;align-items:center;gap:5px;">
                                    <button type="button" id="lf-bc-fresh-sheet" style="font-size:11px;padding:3px 7px;border-radius:5px;border:1px solid #93c5fd;background:#fff;color:#1d4ed8;font-weight:700;cursor:pointer;" title="Reset to Sticker #1 for a brand new A4 sheet">Fresh Sheet (#1)</button>
                                    <input type="number" id="lf-bc-start-pos" min="1" max="120" value="${state.startPosition}" class="lf-bc-input" style="width:64px;padding:4px 6px;text-align:center;font-weight:700;">
                                </div>
                            </div>
                            <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#1e3a8a;margin-bottom:6px;cursor:pointer;">
                                <input type="checkbox" id="lf-bc-auto-slot" ${state.autoAdvanceA4Slot ? 'checked' : ''}>
                                <span><strong>Auto-remember next empty sticker</strong> on this A4 sheet for next patient</span>
                            </label>
                            <div id="lf-bc-a4-grid" class="lf-a4-mini-grid"></div>
                        </div>

                        <div>
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                                <span style="font-size:12px;font-weight:700;">Fields on Sticker</span>
                                <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;">
                                    <input type="checkbox" id="lf-bc-cutlines" ${state.showCutLines ? 'checked' : ''}> Cut Lines
                                </label>
                            </div>
                            <div class="lf-bc-chip-grid">
                                <label class="lf-bc-check-pill"><input type="checkbox" data-field="showPatientName" ${state.showPatientName ? 'checked' : ''}> Patient Name</label>
                                <label class="lf-bc-check-pill"><input type="checkbox" data-field="showAgeGender" ${state.showAgeGender ? 'checked' : ''}> Age / Gender</label>
                                <label class="lf-bc-check-pill"><input type="checkbox" data-field="showSampleType" ${state.showSampleType ? 'checked' : ''}> Tube / Cap Type</label>
                                <label class="lf-bc-check-pill"><input type="checkbox" data-field="showTests" ${state.showTests ? 'checked' : ''}> Short Tests</label>
                                <label class="lf-bc-check-pill"><input type="checkbox" data-field="showDateTime" ${state.showDateTime ? 'checked' : ''}> Date & Time</label>
                                <label class="lf-bc-check-pill"><input type="checkbox" data-field="showBookingId" ${state.showBookingId ? 'checked' : ''}> Booking Reg#</label>
                                <label class="lf-bc-check-pill"><input type="checkbox" data-field="showLabName" ${state.showLabName ? 'checked' : ''}> Lab Header</label>
                                <label class="lf-bc-check-pill"><input type="checkbox" data-field="showVacutainerGuide" ${state.showVacutainerGuide ? 'checked' : ''}> Cap Colour Hint</label>
                            </div>
                        </div>

                        <div>
                            <div style="font-size:12px;font-weight:700;margin-bottom:6px;">Live Sticker Preview (Actual Scale)</div>
                            <div id="lf-bc-live-preview" style="min-height:110px;border-radius:10px;background:#e2e8f0;padding:12px;display:flex;align-items:center;justify-content:center;overflow:auto;"></div>
                        </div>
                    </div>
                </div>
                <div class="lf-bc-footer">
                    <div id="lf-bc-summary-pill" style="font-size:12.5px;font-weight:600;opacity:0.88;"></div>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <button type="button" id="lf-bc-open-tab" class="lf-bc-btn lf-bc-btn-ghost" title="Open printable sheet in a new browser tab">
                            <i class="fas fa-external-link-alt"></i> Print Preview Tab
                        </button>
                        <button type="button" id="lf-bc-cancel" class="lf-bc-btn lf-bc-btn-ghost">Close</button>
                        <button type="button" id="lf-bc-print-now" class="lf-bc-btn lf-bc-btn-primary">
                            <i class="fas fa-print"></i> Print Stickers Now
                        </button>
                    </div>
                </div>
            `;
            dialog.appendChild(contentWrapper);

            const tubesListEl = contentWrapper.querySelector('#lf-bc-tubes-list');
            const presetSelectEl = contentWrapper.querySelector('#lf-bc-preset');
            const presetDescEl = contentWrapper.querySelector('#lf-bc-preset-desc');
            const a4WrapEl = contentWrapper.querySelector('#lf-bc-a4-offset-wrap');
            const a4GridEl = contentWrapper.querySelector('#lf-bc-a4-grid');
            const startPosInput = contentWrapper.querySelector('#lf-bc-start-pos');
            const livePreviewEl = contentWrapper.querySelector('#lf-bc-live-preview');
            const summaryPillEl = contentWrapper.querySelector('#lf-bc-summary-pill');

            const buildFinalSelectedList = () => {
                const chosen = state.labels.filter((l) => l.selected);
                if (!state.includeMasterBagLabel) return chosen;

                const out = [];
                const seenBooking = new Set();
                for (const item of chosen) {
                    out.push(item);
                    const bKey = item.bookingId || item.patientName || item.id;
                    if (!seenBooking.has(bKey)) {
                        seenBooking.add(bKey);
                        const allTestsForBooking = state.labels
                            .filter((x) => (x.bookingId || x.patientName) === bKey)
                            .map((x) => x.testsText)
                            .filter(Boolean)
                            .join(', ');
                        out.push({
                            ...item,
                            id: `${item.id}_master`,
                            labelType: 'master_bag',
                            sampleType: 'POUCH',
                            testsText: allTestsForBooking || item.testsText,
                            copies: 1,
                        });
                    }
                }
                return out;
            };

            const getPrintConfig = () => ({
                paperPreset: state.paperPreset,
                startPosition: state.startPosition,
                showCutLines: state.showCutLines,
                showPatientName: state.showPatientName,
                showAgeGender: state.showAgeGender,
                showSampleType: state.showSampleType,
                showVacutainerGuide: state.showVacutainerGuide,
                showTests: state.showTests,
                showDateTime: state.showDateTime,
                showBookingId: state.showBookingId,
                showLabName: state.showLabName,
                topOffsetMm: state.calibration?.topOffsetMm || 0,
                leftOffsetMm: state.calibration?.leftOffsetMm || 0,
                barWidth: state.calibration?.barWidth || 1.5,
                barcodeHeightMm: state.calibration?.barcodeHeightMm || 10.5,
                fontScale: state.calibration?.fontScale || 1,
            });

            const renderTubesList = () => {
                tubesListEl.innerHTML = state.labels
                    .map((lbl, idx) => {
                        const vac = lbl.vacutainer || resolveVacutainerMeta(lbl.sampleType);
                        return `
                            <div class="lf-bc-tube-row" data-idx="${idx}">
                                <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;flex:1;min-width:0;">
                                    <input type="checkbox" class="lf-tube-chk" data-idx="${idx}" ${lbl.selected ? 'checked' : ''} style="margin-top:3px;">
                                    <div style="min-width:0;flex:1;">
                                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                            <span style="font-family:monospace;font-weight:800;font-size:13px;">${escapeHtml(lbl.barcode)}</span>
                                            <span style="font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:99px;background:${vac.hex}18;color:${vac.hex};border:1px solid ${vac.hex}44;">
                                                ${escapeHtml(vac.code)} • ${escapeHtml(vac.cap)}
                                            </span>
                                        </div>
                                        <div style="font-size:12px;font-weight:600;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                            ${escapeHtml(lbl.patientName || 'Patient')} ${lbl.ageGender ? `(${escapeHtml(lbl.ageGender)})` : ''}
                                        </div>
                                        <div style="font-size:11px;opacity:0.72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                            ${escapeHtml(lbl.testsText || lbl.sampleType || '')}
                                        </div>
                                    </div>
                                </label>
                                <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                                    <button type="button" class="lf-copy-dec lf-bc-btn lf-bc-btn-ghost" data-idx="${idx}" style="padding:3px 8px;font-size:12px;">-</button>
                                    <span style="min-width:22px;text-align:center;font-size:12.5px;font-weight:700;">${lbl.copies}</span>
                                    <button type="button" class="lf-copy-inc lf-bc-btn lf-bc-btn-ghost" data-idx="${idx}" style="padding:3px 8px;font-size:12px;">+</button>
                                </div>
                            </div>
                        `;
                    })
                    .join('');
            };

            const renderA4MiniGrid = () => {
                const preset = PAPER_PRESETS[state.paperPreset] || PAPER_PRESETS[DEFAULT_PRESET_ID];
                presetDescEl.textContent = preset.shortDesc;

                if (preset.type !== 'a4') {
                    a4WrapEl.style.display = 'none';
                    return;
                }
                a4WrapEl.style.display = 'block';
                const totalCells = preset.cols * preset.rows;
                if (state.startPosition > totalCells) state.startPosition = 1;
                startPosInput.max = String(totalCells);
                startPosInput.value = String(state.startPosition);
                a4GridEl.style.gridTemplateColumns = `repeat(${preset.cols}, minmax(0, 1fr))`;

                const finalItems = buildFinalSelectedList();
                const totalToPrint = finalItems.reduce((sum, i) => sum + (Number(i.copies) || 1), 0);
                const endActivePos = state.startPosition + totalToPrint - 1;

                const cellsHtml = [];
                for (let pos = 1; pos <= totalCells; pos += 1) {
                    const cls = pos < state.startPosition
                        ? 'lf-a4-cell skipped'
                        : pos === state.startPosition
                          ? 'lf-a4-cell start-active'
                          : pos <= endActivePos
                            ? 'lf-a4-cell will-print'
                            : 'lf-a4-cell';
                    cellsHtml.push(`<div class="${cls}" data-pos="${pos}" title="Click to start printing at sticker #${pos}">${pos}</div>`);
                }
                a4GridEl.innerHTML = cellsHtml.join('');
            };

            const refreshPreviewAndSummary = async () => {
                const finalItems = buildFinalSelectedList();
                const totalStickers = finalItems.reduce((sum, i) => sum + (Number(i.copies) || 1), 0);
                const preset = PAPER_PRESETS[state.paperPreset] || PAPER_PRESETS[DEFAULT_PRESET_ID];
                if (preset.type === 'a4') {
                    const endSlot = state.startPosition + Math.max(0, totalStickers - 1);
                    const pages = Math.max(1, Math.ceil(endSlot / (preset.cols * preset.rows)));
                    summaryPillEl.textContent = `${totalStickers} Sticker(s) on ${pages} A4 Page(s) • Slots #${state.startPosition}–#${Math.min(preset.cols * preset.rows, endSlot)}`;
                } else {
                    summaryPillEl.textContent = `${totalStickers} Sticker(s) • ${preset.name}`;
                }

                renderA4MiniGrid();

                const previewTarget = finalItems[0] || state.labels[0];
                if (previewTarget) {
                    livePreviewEl.innerHTML = await renderPreviewCardHtml(previewTarget, getPrintConfig());
                }
            };

            renderTubesList();
            await refreshPreviewAndSummary();

            tubesListEl.addEventListener('change', (e) => {
                const chk = e.target.closest('.lf-tube-chk');
                if (!chk) return;
                const idx = Number(chk.dataset.idx);
                if (state.labels[idx]) {
                    state.labels[idx].selected = chk.checked;
                    refreshPreviewAndSummary();
                }
            });

            tubesListEl.addEventListener('click', (e) => {
                const dec = e.target.closest('.lf-copy-dec');
                const inc = e.target.closest('.lf-copy-inc');
                if (!dec && !inc) return;
                const idx = Number((dec || inc).dataset.idx);
                const item = state.labels[idx];
                if (!item) return;
                if (dec) item.copies = Math.max(1, (item.copies || 1) - 1);
                if (inc) item.copies = Math.min(10, (item.copies || 1) + 1);
                renderTubesList();
                refreshPreviewAndSummary();
            });

            contentWrapper.querySelector('#lf-bc-sel-all')?.addEventListener('click', () => {
                const allChecked = state.labels.every((l) => l.selected);
                state.labels.forEach((l) => {
                    l.selected = !allChecked;
                });
                renderTubesList();
                refreshPreviewAndSummary();
            });

            contentWrapper.querySelector('#lf-bc-plus-all')?.addEventListener('click', () => {
                state.labels.forEach((l) => {
                    l.copies = Math.min(10, (l.copies || 1) + 1);
                });
                renderTubesList();
                refreshPreviewAndSummary();
            });

            contentWrapper.querySelector('#lf-bc-master-bag')?.addEventListener('change', (e) => {
                state.includeMasterBagLabel = e.target.checked;
                saveLocalPrefs({ includeMasterBagLabel: state.includeMasterBagLabel });
                refreshPreviewAndSummary();
            });

            presetSelectEl.addEventListener('change', () => {
                state.paperPreset = presetSelectEl.value;
                const p = PAPER_PRESETS[state.paperPreset];
                state.startPosition = state.autoAdvanceA4Slot && p?.type === 'a4'
                    ? getSavedA4NextSlot(state.paperPreset)
                    : 1;
                state.showCutLines = Boolean(p?.fullBleedGrid);
                const cutChk = contentWrapper.querySelector('#lf-bc-cutlines');
                if (cutChk) cutChk.checked = state.showCutLines;
                saveLocalPrefs({ paperPreset: state.paperPreset, showCutLines: state.showCutLines });
                refreshPreviewAndSummary();
            });

            contentWrapper.querySelector('#lf-bc-fresh-sheet')?.addEventListener('click', () => {
                state.startPosition = 1;
                setSavedA4NextSlot(state.paperPreset, 1);
                refreshPreviewAndSummary();
            });

            contentWrapper.querySelector('#lf-bc-auto-slot')?.addEventListener('change', (e) => {
                state.autoAdvanceA4Slot = e.target.checked;
                saveLocalPrefs({ autoAdvanceA4Slot: state.autoAdvanceA4Slot });
            });

            contentWrapper.querySelector('#lf-bc-cutlines')?.addEventListener('change', (e) => {
                state.showCutLines = e.target.checked;
                saveLocalPrefs({ showCutLines: state.showCutLines });
            });

            startPosInput.addEventListener('input', () => {
                const preset = PAPER_PRESETS[state.paperPreset];
                const maxPos = preset ? preset.cols * preset.rows : 65;
                state.startPosition = Math.min(maxPos, Math.max(1, Number.parseInt(startPosInput.value, 10) || 1));
                refreshPreviewAndSummary();
            });

            a4GridEl.addEventListener('click', (e) => {
                const cell = e.target.closest('.lf-a4-cell');
                if (!cell) return;
                state.startPosition = Number(cell.dataset.pos) || 1;
                refreshPreviewAndSummary();
            });

            contentWrapper.querySelectorAll('input[data-field]').forEach((input) => {
                input.addEventListener('change', () => {
                    const key = input.dataset.field;
                    state[key] = input.checked;
                    saveLocalPrefs({ [key]: input.checked });
                    refreshPreviewAndSummary();
                });
            });

            contentWrapper.querySelector('#lf-bc-cancel')?.addEventListener('click', closeModal);

            const executePrint = async (openInNewTab = false) => {
                const finalItems = buildFinalSelectedList();
                if (finalItems.length === 0) {
                    alert('Please select at least one sample tube to print.');
                    return;
                }
                const totalPrinted = finalItems.reduce((sum, i) => sum + (Number(i.copies) || 1), 0);
                await printLabels(finalItems, {
                    ...getPrintConfig(),
                    openInNewTab,
                });

                const preset = PAPER_PRESETS[state.paperPreset];
                if (preset?.type === 'a4' && state.autoAdvanceA4Slot) {
                    setSavedA4NextSlot(state.paperPreset, state.startPosition + totalPrinted);
                }

                if (!openInNewTab) {
                    closeModal();
                }
            };

            contentWrapper.querySelector('#lf-bc-print-now')?.addEventListener('click', () => executePrint(false));
            contentWrapper.querySelector('#lf-bc-open-tab')?.addEventListener('click', () => executePrint(true));
        } catch (err) {
            const loadingEl = backdrop.querySelector('#lf-bc-loading');
            if (loadingEl) {
                loadingEl.innerHTML = `
                    <div style="color:#dc2626;font-weight:700;margin-bottom:8px;">
                        <i class="fas fa-exclamation-triangle"></i> ${escapeHtml(err.message || 'Unable to load barcode labels')}
                    </div>
                    <button type="button" id="lf-bc-err-close">Close</button>
                `;
                loadingEl.querySelector('#lf-bc-err-close')?.addEventListener('click', closeModal);
            }
        }
    }

    global.LabFlowBarcode = {
        __initialized: true,
        __version: 2,
        DEFAULT_PRESET_ID,
        PAPER_PRESETS,
        buildPresetOptgroupsHtml,
        getSavedA4NextSlot,
        setSavedA4NextSlot,
        ensureJsBarcode,
        resolveVacutainerMeta,
        generateBarcodeSvgMarkup,
        buildPrintDocumentHtml,
        renderPreviewCardHtml,
        renderSheetSimulationHtml,
        printLabels,
        fetchSettings,
        invalidateSettingsCache,
        loadLocalPrefs,
        saveLocalPrefs,
        openBookingPrintModal,
    };
})(window);
