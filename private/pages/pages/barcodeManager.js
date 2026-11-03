(function initBarcodeStudioPage() {
    'use strict';

    const root = document.getElementById('bcs-app');
    if (!root) return;

    function ensureBarcodeEngineLoaded() {
        if (window.LabFlowBarcode && window.LabFlowBarcode.__version === 2) {
            return Promise.resolve(window.LabFlowBarcode);
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `/js/barcodePrintEngine.js?v=2`;
            script.onload = () => resolve(window.LabFlowBarcode);
            script.onerror = () => reject(new Error('Failed to load Barcode Print Engine'));
            document.head.appendChild(script);
        });
    }

    const state = {
        activeTab: 'generate',
        settings: null,
        resolvedHeaderName: 'Pathology Lab',
        canEditGlobalSettings: false,
        assignableCenters: [],
        genStartPosition: 1,
        autoRememberSlot: false,
        showCutLines: true,
        lastGeneratedResult: null,
        batches: [],
        poolItems: [],
        poolPage: 1,
        poolLimit: 50,
        poolTotal: 0,
        activeBatchFilterId: '',
        activeBatchFilterCode: '',
        selectedPoolBarcodes: new Set(),
    };

    function escapeHtml(val) {
        return String(val ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    let toastTimer = null;
    function showToast(msg, isError = false) {
        const el = document.getElementById('bcs-toast');
        if (!el) return;
        el.style.display = 'flex';
        el.style.background = isError ? '#b91c1c' : '#0f172a';
        el.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i> <span>${escapeHtml(msg)}</span>`;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            el.style.display = 'none';
        }, 3800);
    }

    function formatShortDate(dt) {
        if (!dt) return '—';
        const d = new Date(dt);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function switchTab(tabId) {
        state.activeTab = tabId;
        root.querySelectorAll('.bcs-tab-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        root.querySelectorAll('.bcs-panel').forEach((panel) => {
            panel.classList.toggle('active', panel.id === `bcs-panel-${tabId}`);
        });

        if (tabId === 'batches') {
            loadBatchesAndKpis();
        } else if (tabId === 'tracker') {
            loadPool();
            setTimeout(() => {
                document.getElementById('bcs-scan-input')?.focus();
            }, 80);
        } else if (tabId === 'settings') {
            refreshCalibrationPreview();
        }
    }

    function getCurrentPreset(engine) {
        const presetId = document.getElementById('bcs-gen-preset')?.value || engine.DEFAULT_PRESET_ID || 'a4_full_65';
        return engine.PAPER_PRESETS[presetId] || engine.PAPER_PRESETS.a4_full_65;
    }

    function rebuildQuantityPillsForPreset(preset) {
        const qtyPillsEl = document.getElementById('bcs-qty-pills');
        const fillSheetBtn = document.getElementById('bcs-fill-exact-sheet-btn');
        const genBtn = document.getElementById('bcs-generate-print-btn');
        const demoBtn = document.getElementById('bcs-test-one-btn');
        const currentQty = Number.parseInt(document.getElementById('bcs-gen-qty')?.value, 10) || 65;

        if (!qtyPillsEl) return;

        if (preset.type === 'a4') {
            if (fillSheetBtn) fillSheetBtn.style.display = 'inline-flex';
            if (genBtn) genBtn.innerHTML = `<i class="fas fa-print"></i> Generate &amp; Print Full Sheet (Verified)`;
            if (demoBtn) demoBtn.innerHTML = `<i class="fas fa-ruler-combined"></i> Alignment &amp; Margin Test`;

            const perSheet = preset.cols * preset.rows;
            const sheetCounts = [1, 2, 3, 5];
            const pills = [];
            const seen = new Set();

            for (const mult of sheetCounts) {
                const q = Math.min(500, perSheet * mult);
                if (seen.has(q)) continue;
                seen.add(q);
                const label = q === perSheet * mult
                    ? `${mult} Full Sheet${mult > 1 ? 's' : ''} (${q})`
                    : `Max Batch (${q})`;
                pills.push(
                    `<button type="button" class="bcs-pill ${currentQty === q ? 'active' : ''}" data-qty="${q}">${escapeHtml(label)}</button>`
                );
            }
            qtyPillsEl.innerHTML = pills.join('');
        } else {
            if (fillSheetBtn) fillSheetBtn.style.display = 'none';
            if (genBtn) genBtn.innerHTML = `<i class="fas fa-print"></i> Generate &amp; Print Roll`;
            if (demoBtn) demoBtn.innerHTML = `<i class="fas fa-scroll"></i> Demo Print Roll (6)`;

            const rollQtys = [20, 50, 100, 200, 500];
            qtyPillsEl.innerHTML = rollQtys
                .map(
                    (q) =>
                        `<button type="button" class="bcs-pill ${currentQty === q ? 'active' : ''}" data-qty="${q}">${q} Roll Labels</button>`
                )
                .join('');
        }
    }

    function syncPrinterModeUi(engine, autoAdjustQtyToFullSheet = false) {
        const preset = getCurrentPreset(engine);
        const isA4 = preset.type === 'a4';

        // Mode Cards
        root.querySelectorAll('#bcs-printer-mode-cards .bcs-mode-card').forEach((card) => {
            card.classList.toggle('active', card.dataset.mode === (isA4 ? 'a4' : 'thermal'));
        });

        // Quick A4 Pills visibility & active highlight
        const quickA4Bar = document.getElementById('bcs-quick-a4-presets');
        if (quickA4Bar) {
            quickA4Bar.style.display = isA4 ? 'flex' : 'none';
            quickA4Bar.querySelectorAll('.bcs-pill').forEach((pill) => {
                pill.classList.toggle('active', pill.dataset.preset === preset.id);
            });
        }

        // Cut lines default sync
        const cutChk = document.getElementById('bcs-gen-cutlines');
        if (cutChk && isA4) {
            state.showCutLines = Boolean(preset.fullBleedGrid);
            cutChk.checked = state.showCutLines;
        }

        if (autoAdjustQtyToFullSheet) {
            const qtyInput = document.getElementById('bcs-gen-qty');
            const copies = Math.max(1, Number.parseInt(document.getElementById('bcs-gen-copies')?.value, 10) || 1);
            if (qtyInput) {
                if (isA4) {
                    const remainingOnFirstSheet = Math.max(1, preset.cols * preset.rows - (state.genStartPosition - 1));
                    qtyInput.value = String(Math.max(1, Math.floor(remainingOnFirstSheet / copies)));
                } else {
                    qtyInput.value = '50';
                }
            }
        }

        rebuildQuantityPillsForPreset(preset);
    }

    function populatePresetDropdowns(engine) {
        const genSelect = document.getElementById('bcs-gen-preset');
        const setSelect = document.getElementById('bcs-set-preset');
        const savedLocal = engine.loadLocalPrefs();
        const fallback = engine.DEFAULT_PRESET_ID || 'a4_full_65';
        const defaultPreset = engine.PAPER_PRESETS[savedLocal.paperPreset]
            ? savedLocal.paperPreset
            : engine.PAPER_PRESETS[state.settings?.defaultPaperPreset]
              ? state.settings.defaultPaperPreset
              : fallback;

        if (genSelect) {
            genSelect.innerHTML = engine.buildPresetOptgroupsHtml(defaultPreset);
            genSelect.value = defaultPreset;
        }
        if (setSelect) {
            const setPresetVal = engine.PAPER_PRESETS[state.settings?.defaultPaperPreset]
                ? state.settings.defaultPaperPreset
                : fallback;
            setSelect.innerHTML = engine.buildPresetOptgroupsHtml(setPresetVal);
            setSelect.value = setPresetVal;
        }

        state.autoRememberSlot = Boolean(savedLocal.autoAdvanceA4Slot);
        const autoChk = document.getElementById('bcs-gen-auto-slot');
        if (autoChk) autoChk.checked = state.autoRememberSlot;

        const chosenPresetObj = engine.PAPER_PRESETS[defaultPreset] || engine.PAPER_PRESETS.a4_full_65;
        state.genStartPosition = state.autoRememberSlot && chosenPresetObj.type === 'a4'
            ? engine.getSavedA4NextSlot(defaultPreset)
            : 1;
        state.showCutLines = savedLocal.showCutLines !== undefined
            ? Boolean(savedLocal.showCutLines)
            : Boolean(chosenPresetObj.fullBleedGrid);

        const cutChk = document.getElementById('bcs-gen-cutlines');
        if (cutChk) cutChk.checked = state.showCutLines;

        // Initialize exact full-sheet quantity on initial load
        const qtyInput = document.getElementById('bcs-gen-qty');
        if (qtyInput && chosenPresetObj.type === 'a4') {
            const slotsLeft = Math.max(1, chosenPresetObj.cols * chosenPresetObj.rows - (state.genStartPosition - 1));
            qtyInput.value = String(slotsLeft);
        }

        syncPrinterModeUi(engine, false);
    }

    function populateSettingsForm() {
        const s = state.settings || {};
        const setVal = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.value = v;
        };
        const setChk = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.checked = Boolean(v);
        };

        setVal('bcs-set-prefix', s.prefix || '');
        setVal('bcs-set-digits', s.minDigits || 7);
        setVal('bcs-set-header', s.customHeaderName || '');
        setVal('bcs-set-preset', s.defaultPaperPreset || 'a4_full_65');
        setVal('bcs-set-copies', s.defaultCopies || 1);
        setVal('bcs-gen-copies', String(s.defaultCopies || 1));

        setChk('bcs-set-showPatient', s.showPatientName !== false);
        setChk('bcs-set-showVac', s.showVacutainerGuide !== false);
        setChk('bcs-set-showTests', s.showTests !== false);
        setChk('bcs-set-showDate', s.showDateTime !== false);
        setChk('bcs-set-showLab', s.showLabName !== false);
        setChk('bcs-set-autoPrompt', Boolean(s.autoPromptAfterBooking));
        setChk('bcs-set-restrictCenter', Boolean(s.restrictCenterOwnership));

        const cal = s.calibration || {};
        setVal('bcs-cal-top', cal.topOffsetMm ?? 0);
        setVal('bcs-cal-left', cal.leftOffsetMm ?? 0);
        setVal('bcs-cal-width', cal.barWidth ?? 1.5);
        setVal('bcs-cal-height', cal.barcodeHeightMm ?? 10.5);
        setVal('bcs-cal-font', cal.fontScale ?? 1);

        const centerSelect = document.getElementById('bcs-gen-center');
        const centerWrap = document.getElementById('bcs-assign-center-wrap');
        if (centerSelect) {
            if (!state.assignableCenters || state.assignableCenters.length === 0) {
                if (centerWrap) centerWrap.style.display = 'none';
            } else {
                if (centerWrap) centerWrap.style.display = 'block';
                centerSelect.innerHTML =
                    `<option value="">Main Lab / Any Collection Center</option>` +
                    state.assignableCenters
                        .map(
                            (c) =>
                                `<option value="${escapeHtml(c._id)}">${escapeHtml(c.name)} (${escapeHtml(c.role)})</option>`
                        )
                        .join('');
            }
        }

        const saveBtn = document.getElementById('bcs-save-settings-btn');
        const permNote = document.getElementById('bcs-settings-perm-note');
        if (!state.canEditGlobalSettings) {
            if (saveBtn) saveBtn.style.display = 'none';
            if (permNote) permNote.style.display = 'block';
        } else {
            if (saveBtn) saveBtn.style.display = 'inline-flex';
            if (permNote) permNote.style.display = 'none';
        }
    }

    function renderA4OffsetGrid() {
        const engine = window.LabFlowBarcode;
        if (!engine) return;
        const preset = getCurrentPreset(engine);
        const hintEl = document.getElementById('bcs-gen-preset-hint');
        const dimsEl = document.getElementById('bcs-preview-dims');
        const boxEl = document.getElementById('bcs-gen-a4-box');
        const gridEl = document.getElementById('bcs-gen-a4-grid');
        const posInput = document.getElementById('bcs-gen-start-pos');
        const fillRemBtn = document.getElementById('bcs-fill-remaining-btn');

        if (hintEl) hintEl.textContent = preset.shortDesc;
        if (dimsEl) dimsEl.textContent = `${preset.labelWidthMm} × ${preset.labelHeightMm} mm`;

        if (preset.type !== 'a4') {
            if (boxEl) boxEl.style.display = 'none';
            return;
        }
        if (boxEl) boxEl.style.display = 'block';

        const total = preset.cols * preset.rows;
        if (state.genStartPosition > total) state.genStartPosition = 1;
        if (posInput) {
            posInput.max = String(total);
            posInput.value = String(state.genStartPosition);
        }

        const remainingSlots = Math.max(1, total - (state.genStartPosition - 1));
        if (fillRemBtn) {
            if (state.genStartPosition > 1) {
                fillRemBtn.style.display = 'inline-flex';
                fillRemBtn.textContent = `Fill Remaining ${remainingSlots} Slots`;
            } else {
                fillRemBtn.style.display = 'none';
            }
        }

        const qty = Math.max(1, Number.parseInt(document.getElementById('bcs-gen-qty')?.value, 10) || total);
        const copies = Math.max(1, Number.parseInt(document.getElementById('bcs-gen-copies')?.value, 10) || 1);
        const endPrintSlot = state.genStartPosition + qty * copies - 1;

        if (gridEl) {
            gridEl.style.gridTemplateColumns = `repeat(${preset.cols}, minmax(0, 1fr))`;
            const cells = [];
            for (let i = 1; i <= total; i += 1) {
                const cls = i < state.genStartPosition
                    ? 'bcs-a4-slot skipped'
                    : i === state.genStartPosition
                      ? 'bcs-a4-slot start'
                      : i <= endPrintSlot
                        ? 'bcs-a4-slot will-print'
                        : 'bcs-a4-slot';
                cells.push(`<div class="${cls}" data-pos="${i}" title="Click to start printing at sticker #${i}">${i}</div>`);
            }
            gridEl.innerHTML = cells.join('');
        }
    }

    async function refreshGeneratorPreview() {
        const engine = window.LabFlowBarcode;
        if (!engine) return;

        const preset = getCurrentPreset(engine);
        const presetId = preset.id;
        const qty = Math.max(1, Number.parseInt(document.getElementById('bcs-gen-qty')?.value, 10) || 65);
        const copies = Math.max(1, Number.parseInt(document.getElementById('bcs-gen-copies')?.value, 10) || 1);
        const sampleHint = String(document.getElementById('bcs-gen-sample-hint')?.value || '').trim();
        const centerSel = document.getElementById('bcs-gen-center');
        const centerLabel = centerSel && centerSel.value
            ? centerSel.options[centerSel.selectedIndex]?.text?.replace(/\s*\([^)]*\)\s*$/, '') || ''
            : '';

        renderA4OffsetGrid();
        rebuildQuantityPillsForPreset(preset);

        const prefix = (state.settings?.prefix || '').toUpperCase();
        const digits = state.settings?.minDigits || 7;
        const sampleCode = `${prefix}${String(100001).padStart(digits, '0')}`;

        const sampleItem = {
            labelType: 'preprinted',
            barcode: sampleCode,
            sampleHint,
            vacutainer: sampleHint ? engine.resolveVacutainerMeta(sampleHint) : null,
            assignedToName: centerLabel,
            headerName: state.resolvedHeaderName,
        };

        const totalPhysicalStickers = qty * copies;

        const sheetMapEl = document.getElementById('bcs-sheet-map-preview');
        if (sheetMapEl && typeof engine.renderSheetSimulationHtml === 'function') {
            sheetMapEl.innerHTML = engine.renderSheetSimulationHtml({
                paperPreset: presetId,
                totalStickers: totalPhysicalStickers,
                startPosition: state.genStartPosition,
            });
        }

        const previewEl = document.getElementById('bcs-gen-live-preview');
        if (previewEl) {
            previewEl.innerHTML = await engine.renderPreviewCardHtml(sampleItem, {
                paperPreset: presetId,
                showLabName: state.settings?.showLabName !== false,
                showVacutainerGuide: state.settings?.showVacutainerGuide !== false,
                barWidth: state.settings?.calibration?.barWidth || 1.5,
                barcodeHeightMm: state.settings?.calibration?.barcodeHeightMm || 10.5,
                fontScale: state.settings?.calibration?.fontScale || 1,
            });
        }

        const summaryEl = document.getElementById('bcs-gen-summary-line');
        if (summaryEl) {
            if (preset.type === 'a4') {
                const perPage = preset.cols * preset.rows;
                const slotsUsed = totalPhysicalStickers + Math.max(0, state.genStartPosition - 1);
                const pagesCount = Math.max(1, Math.ceil(slotsUsed / perPage));
                summaryEl.textContent = `${qty} unique codes × ${copies} = ${totalPhysicalStickers} stickers on ${pagesCount} A4 Page(s) (${perPage} per sheet)`;
            } else {
                const rowsCount = Math.ceil(totalPhysicalStickers / preset.cols);
                summaryEl.textContent = `${qty} unique codes × ${copies} = ${totalPhysicalStickers} stickers • ${rowsCount} thermal roll step(s)`;
            }
        }
    }

    async function refreshCalibrationPreview() {
        const engine = window.LabFlowBarcode;
        if (!engine) return;
        const calStage = document.getElementById('bcs-cal-preview');
        if (!calStage) return;

        const prefix = String(document.getElementById('bcs-set-prefix')?.value || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9-]/g, '');
        const digits = Math.min(12, Math.max(5, Number.parseInt(document.getElementById('bcs-set-digits')?.value, 10) || 7));
        const customHead = String(document.getElementById('bcs-set-header')?.value || '').trim();
        const presetId = document.getElementById('bcs-set-preset')?.value || 'a4_full_65';

        const demoPatientSticker = {
            labelType: 'patient_tube',
            barcode: `${prefix}${String(100042).padStart(digits, '0')}`,
            patientName: 'RAHUL SHARMA',
            ageGender: '34/M',
            sampleType: 'EDTA Whole Blood',
            vacutainer: engine.resolveVacutainerMeta('EDTA'),
            testsText: 'CBC, ESR, HbA1c',
            dateTimeText: '02 Nov 10:15 AM',
            bookingId: 'BK9042',
            headerName: customHead || state.resolvedHeaderName,
        };

        calStage.innerHTML = await engine.renderPreviewCardHtml(demoPatientSticker, {
            paperPreset: presetId,
            showPatientName: document.getElementById('bcs-set-showPatient')?.checked ?? true,
            showAgeGender: document.getElementById('bcs-set-showPatient')?.checked ?? true,
            showSampleType: true,
            showVacutainerGuide: document.getElementById('bcs-set-showVac')?.checked ?? true,
            showTests: document.getElementById('bcs-set-showTests')?.checked ?? true,
            showDateTime: document.getElementById('bcs-set-showDate')?.checked ?? true,
            showLabName: document.getElementById('bcs-set-showLab')?.checked ?? true,
            barWidth: Number(document.getElementById('bcs-cal-width')?.value) || 1.5,
            barcodeHeightMm: Number(document.getElementById('bcs-cal-height')?.value) || 10.5,
            fontScale: Number(document.getElementById('bcs-cal-font')?.value) || 1,
        });
    }

    async function loadSettingsAndInit(engine) {
        const data = await engine.fetchSettings(true);
        state.settings = data.settings || {};
        state.resolvedHeaderName = data.resolvedHeaderName || 'Pathology Lab';
        state.canEditGlobalSettings = Boolean(data.canEditGlobalSettings);
        state.assignableCenters = data.assignableCenters || [];

        populatePresetDropdowns(engine);
        populateSettingsForm();
        await refreshGeneratorPreview();
    }

    async function loadBatchesAndKpis() {
        try {
            const search = String(document.getElementById('bcs-batch-search')?.value || '').trim();
            const qs = new URLSearchParams({ limit: '40' });
            if (search) qs.set('search', search);

            const res = await fetch(`/api/v1/user/barcodes/batches?${qs.toString()}`, {
                credentials: 'include',
            });
            const data = await res.json();
            if (!res.ok || !data?.success) return;

            const kpi = data.kpi || {};
            const setTxt = (id, v) => {
                const el = document.getElementById(id);
                if (el) el.textContent = v;
            };
            setTxt('bcs-kpi-total', (kpi.total || 0).toLocaleString('en-IN'));
            setTxt('bcs-kpi-unused', (kpi.unused || 0).toLocaleString('en-IN'));
            setTxt('bcs-kpi-used', (kpi.used || 0).toLocaleString('en-IN'));
            setTxt('bcs-kpi-void', (kpi.void || 0).toLocaleString('en-IN'));
            setTxt('bcs-kpi-batches', `${kpi.batchesCount || 0} batches generated`);

            state.batches = data.batches || [];
            renderBatchesTable();
        } catch (err) {
            console.error('loadBatchesAndKpis error:', err);
        }
    }

    function renderBatchesTable() {
        const tbody = document.getElementById('bcs-batches-tbody');
        if (!tbody) return;

        if (!state.batches.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;padding:34px;color:#64748b;">
                        No pre-printed barcode batches yet. Use Tab 1 to generate your first zero-waste A4 sheet!
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = state.batches
            .map((b) => {
                const counts = b.counts || { unused: b.quantity, used: 0, void: 0 };
                const usedPct = Math.min(100, Math.round(((counts.used || 0) / Math.max(1, b.quantity)) * 100));
                return `
                    <tr>
                        <td>
                            <div style="font-weight:800;color:#1e40af;">${escapeHtml(b.batchCode)}</div>
                            <div style="font-size:11px;color:#64748b;">${escapeHtml(b.paperPreset || '')}</div>
                        </td>
                        <td>
                            <div style="font-family:monospace;font-weight:700;">${escapeHtml(b.startBarcode)} → ${escapeHtml(b.endBarcode)}</div>
                            <div style="font-size:11px;color:#64748b;">${b.copiesPerBarcode || 1}× copy per code</div>
                        </td>
                        <td>
                            <div style="font-size:12px;font-weight:700;">
                                <span style="color:#059669;">${counts.unused || 0} Ready</span> •
                                <span style="color:#2563eb;">${counts.used || 0} Used</span>
                                ${counts.void ? ` • <span style="color:#dc2626;">${counts.void} Void</span>` : ''}
                            </div>
                            <div class="bcs-progress-track">
                                <div class="bcs-progress-fill" style="width:${usedPct}%;"></div>
                            </div>
                        </td>
                        <td>${escapeHtml(b.assignedToName || 'Main Lab (Any)')}</td>
                        <td>
                            ${b.sampleHint ? `<span class="bcs-status-pill bcs-status-used">${escapeHtml(b.sampleHint)}</span> ` : ''}
                            <span style="font-size:12px;color:#475569;">${escapeHtml(b.notes || '—')}</span>
                        </td>
                        <td style="font-size:12px;color:#475569;">
                            <div>${escapeHtml(formatShortDate(b.createdAt))}</div>
                            <div style="font-size:11px;color:#94a3b8;">by ${escapeHtml(b.createdByName || 'Staff')}</div>
                        </td>
                        <td>
                            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                                ${counts.unused > 0 ? `
                                    <button type="button" class="bcs-btn bcs-btn-emerald bcs-btn-sm" data-batch-reprint="${b._id}" data-only-unused="true" title="Print only the ${counts.unused} unused barcodes onto current sheet layout">
                                        <i class="fas fa-print"></i> Unused (${counts.unused})
                                    </button>
                                ` : ''}
                                <button type="button" class="bcs-btn bcs-btn-outline bcs-btn-sm" data-batch-reprint="${b._id}" data-only-unused="false" title="Reprint entire batch onto current sheet layout">
                                    <i class="fas fa-redo"></i> Full
                                </button>
                                <button type="button" class="bcs-btn bcs-btn-outline bcs-btn-sm" data-batch-inspect="${b._id}" data-batch-code="${escapeHtml(b.batchCode)}" title="Inspect all barcodes in this batch">
                                    <i class="fas fa-list"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            })
            .join('');
    }

    async function reprintBatch(batchId, onlyUnused = false) {
        try {
            const engine = await ensureBarcodeEngineLoaded();
            const res = await fetch(
                `/api/v1/user/barcodes/batches/${encodeURIComponent(batchId)}?onlyUnused=${onlyUnused}&markReprinted=true`,
                { credentials: 'include' }
            );
            const data = await res.json();
            if (!res.ok || !data?.success) {
                throw new Error(data?.message || 'Unable to load batch barcodes.');
            }
            if (!data.barcodes || data.barcodes.length === 0) {
                showToast('No printable barcodes remain in this selection.', true);
                return;
            }

            // Always prefer the currently selected Sheet/Roll preset in Tab 1 so old 1-up batches also reprint cleanly onto Full A4 Sheets!
            const presetId = document.getElementById('bcs-gen-preset')?.value || engine.DEFAULT_PRESET_ID || 'a4_full_65';
            const preset = engine.PAPER_PRESETS[presetId] || engine.PAPER_PRESETS.a4_full_65;
            const items = data.barcodes.map((b) => ({
                labelType: 'preprinted',
                barcode: b.barcode,
                sampleHint: b.sampleHint || '',
                vacutainer: b.vacutainer || (b.sampleHint ? engine.resolveVacutainerMeta(b.sampleHint) : null),
                assignedToName: b.assignedToName || '',
                headerName: data.headerName || state.resolvedHeaderName,
                copies: data.batch?.copiesPerBarcode || 1,
            }));

            await engine.printLabels(items, {
                paperPreset: presetId,
                startPosition: preset.type === 'a4' ? state.genStartPosition : 1,
                showCutLines: state.showCutLines,
                showLabName: state.settings?.showLabName !== false,
                showVacutainerGuide: state.settings?.showVacutainerGuide !== false,
                topOffsetMm: state.settings?.calibration?.topOffsetMm || 0,
                leftOffsetMm: state.settings?.calibration?.leftOffsetMm || 0,
                barWidth: state.settings?.calibration?.barWidth || 1.5,
                barcodeHeightMm: state.settings?.calibration?.barcodeHeightMm || 10.5,
                fontScale: state.settings?.calibration?.fontScale || 1,
            });
            showToast(`Sent ${items.length} barcode(s) to ${preset.name}!`);
        } catch (err) {
            showToast(err.message || 'Reprint failed', true);
        }
    }

    async function loadPool() {
        try {
            const search = String(document.getElementById('bcs-scan-input')?.value || '').trim();
            const status = String(document.getElementById('bcs-pool-status')?.value || '').trim();
            const qs = new URLSearchParams({
                page: String(state.poolPage),
                limit: String(state.poolLimit),
            });
            if (search) qs.set('search', search);
            if (status) qs.set('status', status);
            if (state.activeBatchFilterId) qs.set('batchId', state.activeBatchFilterId);

            const clearBtn = document.getElementById('bcs-clear-filter-btn');
            if (clearBtn) {
                clearBtn.style.display = state.activeBatchFilterId ? 'inline-flex' : 'none';
                if (state.activeBatchFilterCode) {
                    clearBtn.textContent = `Clear Batch: ${state.activeBatchFilterCode}`;
                }
            }

            const res = await fetch(`/api/v1/user/barcodes/pool?${qs.toString()}`, {
                credentials: 'include',
            });
            const data = await res.json();
            if (!res.ok || !data?.success) return;

            state.poolItems = data.items || [];
            state.poolTotal = data.total || 0;
            state.selectedPoolBarcodes.clear();
            updateBulkVoidButton();

            renderScanSpotlight(data.exactScanMatch, search);
            renderPoolTable();
        } catch (err) {
            console.error('loadPool error:', err);
        }
    }

    function renderScanSpotlight(match, rawSearch) {
        const box = document.getElementById('bcs-scan-spotlight');
        if (!box) return;
        if (!rawSearch || !match) {
            box.style.display = 'none';
            box.innerHTML = '';
            return;
        }

        box.style.display = 'block';
        const statusBadge = match.poolStatus === 'unused'
            ? `<span class="bcs-status-pill bcs-status-unused"><i class="fas fa-check-circle"></i> UNUSED — Ready for Booking</span>`
            : match.poolStatus === 'void'
              ? `<span class="bcs-status-pill bcs-status-void"><i class="fas fa-ban"></i> VOID / DAMAGED</span>`
              : `<span class="bcs-status-pill bcs-status-used"><i class="fas fa-user-check"></i> MAPPED TO PATIENT</span>`;

        const bookingHtml = match.booking
            ? `
                <div style="margin-top:10px;padding-top:10px;border-top:1px solid #bfdbfe;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div>
                        <div style="font-size:14px;font-weight:800;color:#0f172a;">
                            ${escapeHtml(match.booking.patientName)} ${match.booking.ageGender ? `(${escapeHtml(match.booking.ageGender)})` : ''}
                            • <span style="color:#2563eb;">Booking #${escapeHtml(match.booking.bookingId)}</span>
                            • <span style="text-transform:uppercase;font-size:11.5px;">[${escapeHtml(match.booking.status)}]</span>
                        </div>
                        <div style="font-size:12.5px;color:#334155;margin-top:2px;">
                            <strong>Tube:</strong> ${escapeHtml(match.booking.sampleTypes || 'Sample')} |
                            <strong>Tests:</strong> ${escapeHtml(match.booking.tests || '—')} |
                            <strong>Center:</strong> ${escapeHtml(match.booking.centerName || 'Main Lab')}
                        </div>
                    </div>
                    <button type="button" class="bcs-btn bcs-btn-primary bcs-btn-sm" data-print-booking="${escapeHtml(match.booking.bookingId)}" data-filter-code="${escapeHtml(match.barcode)}">
                        <i class="fas fa-print"></i> Reprint Patient Tube Label
                    </button>
                </div>
            `
            : `<div style="margin-top:6px;font-size:12.5px;color:#475569;">Not yet linked to any patient booking. Batch: <strong>${escapeHtml(match.batchCode || 'N/A')}</strong> ${match.assignedToName ? `• Assigned Center: <strong>${escapeHtml(match.assignedToName)}</strong>` : ''}</div>`;

        box.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="font-family:monospace;font-size:18px;font-weight:900;color:#1e3a8a;">${escapeHtml(match.barcode)}</span>
                    ${statusBadge}
                </div>
                <span style="font-size:11.5px;color:#475569;">Instant Tube Custody Result</span>
            </div>
            ${bookingHtml}
        `;
    }

    function renderPoolTable() {
        const tbody = document.getElementById('bcs-pool-tbody');
        const pageInfo = document.getElementById('bcs-pool-page-info');
        const prevBtn = document.getElementById('bcs-pool-prev');
        const nextBtn = document.getElementById('bcs-pool-next');
        if (!tbody) return;

        if (pageInfo) {
            const from = state.poolTotal === 0 ? 0 : (state.poolPage - 1) * state.poolLimit + 1;
            const to = Math.min(state.poolTotal, state.poolPage * state.poolLimit);
            pageInfo.textContent = `Showing ${from}–${to} of ${state.poolTotal} pre-printed barcodes`;
        }
        if (prevBtn) prevBtn.disabled = state.poolPage <= 1;
        if (nextBtn) nextBtn.disabled = state.poolPage * state.poolLimit >= state.poolTotal;

        if (!state.poolItems.length) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:#64748b;">No pre-printed barcodes match your filter.</td></tr>`;
            return;
        }

        tbody.innerHTML = state.poolItems
            .map((item) => {
                const pill = item.status === 'unused'
                    ? `<span class="bcs-status-pill bcs-status-unused">Unused</span>`
                    : item.status === 'used'
                      ? `<span class="bcs-status-pill bcs-status-used">Used</span>`
                      : `<span class="bcs-status-pill bcs-status-void">Void</span>`;

                const mappingHtml = item.status === 'used'
                    ? `
                        <div style="font-weight:700;">${escapeHtml(item.patientName || 'Patient')} ${item.patientAgeGender ? `(${escapeHtml(item.patientAgeGender)})` : ''}</div>
                        <div style="font-size:11.5px;color:#2563eb;">#${escapeHtml(item.usedInBookingId)} • ${escapeHtml(item.sampleType || '')}</div>
                    `
                    : item.status === 'void'
                      ? `<span style="font-size:12px;color:#b91c1c;">${escapeHtml(item.voidReason || 'Damaged')}</span>`
                      : `<span style="font-size:12px;color:#94a3b8;">Available for scan</span>`;

                const actionsHtml = item.status === 'unused'
                    ? `
                        <button type="button" class="bcs-btn bcs-btn-outline bcs-btn-sm" data-single-preprint="${escapeHtml(item.barcode)}" data-sample-hint="${escapeHtml(item.sampleHint || '')}" title="Print this blank tube barcode">
                            <i class="fas fa-print"></i>
                        </button>
                        <button type="button" class="bcs-btn bcs-btn-danger bcs-btn-sm" data-void-code="${escapeHtml(item.barcode)}" title="Mark damaged/void">
                            <i class="fas fa-ban"></i>
                        </button>
                    `
                    : item.status === 'used' && item.usedInBookingId
                      ? `
                        <button type="button" class="bcs-btn bcs-btn-primary bcs-btn-sm" data-print-booking="${escapeHtml(item.usedInBookingId)}" data-filter-code="${escapeHtml(item.barcode)}">
                            <i class="fas fa-print"></i> Label
                        </button>
                    `
                      : item.status === 'void'
                        ? `
                        <button type="button" class="bcs-btn bcs-btn-outline bcs-btn-sm" data-restore-code="${escapeHtml(item.barcode)}">
                            <i class="fas fa-undo"></i> Restore
                        </button>
                    `
                        : '';

                return `
                    <tr>
                        <td>
                            ${item.status === 'unused' ? `<input type="checkbox" class="bcs-pool-row-chk" value="${escapeHtml(item.barcode)}">` : ''}
                        </td>
                        <td style="font-family:monospace;font-weight:800;font-size:13.5px;">${escapeHtml(item.barcode)}</td>
                        <td>${pill}</td>
                        <td>
                            <div style="font-weight:600;font-size:12px;">${escapeHtml(item.batchCode || '—')}</div>
                            ${item.sampleHint ? `<div style="font-size:11px;color:#64748b;">${escapeHtml(item.sampleHint)}</div>` : ''}
                        </td>
                        <td style="font-size:12.5px;">${escapeHtml(item.assignedToName || 'Main Lab')}</td>
                        <td>${mappingHtml}</td>
                        <td style="font-size:12px;color:#64748b;">${escapeHtml(formatShortDate(item.usedAt || item.updatedAt))}</td>
                        <td><div style="display:flex;gap:5px;">${actionsHtml}</div></td>
                    </tr>
                `;
            })
            .join('');
    }

    function updateBulkVoidButton() {
        const btn = document.getElementById('bcs-bulk-void-btn');
        if (!btn) return;
        const count = state.selectedPoolBarcodes.size;
        btn.style.display = count > 0 ? 'inline-flex' : 'none';
        btn.innerHTML = `<i class="fas fa-ban"></i> Void Selected (${count})`;
    }

    async function toggleVoidBarcodes(barcodes, action = 'void') {
        try {
            let reason = 'Damaged / Misprinted sticker';
            if (action === 'void') {
                const input = window.prompt('Reason for marking barcode(s) VOID / Damaged:', reason);
                if (input === null) return;
                reason = input.trim() || reason;
            }
            const res = await fetch('/api/v1/user/barcodes/void', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ barcodes, action, reason }),
            });
            const data = await res.json();
            if (!res.ok || !data?.success) {
                throw new Error(data?.message || 'Action failed');
            }
            showToast(data.message || 'Updated barcode status.');
            loadPool();
            loadBatchesAndKpis();
        } catch (err) {
            showToast(err.message || 'Unable to update barcode', true);
        }
    }

    function exportPoolCsv() {
        if (!state.poolItems.length) {
            showToast('No rows to export.', true);
            return;
        }
        const headers = ['Barcode', 'Status', 'BatchCode', 'SampleHint', 'AssignedCenter', 'BookingId', 'PatientName', 'SampleType', 'UpdatedAt'];
        const lines = [headers.join(',')];
        for (const r of state.poolItems) {
            const vals = [
                r.barcode,
                r.status,
                r.batchCode,
                r.sampleHint,
                r.assignedToName || 'Main Lab',
                r.usedInBookingId,
                r.patientName,
                r.sampleType,
                r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
            ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`);
            lines.push(vals.join(','));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `LabFlow_Barcodes_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function fillExactFullSheetQuantity() {
        const engine = window.LabFlowBarcode;
        if (!engine) return;
        const preset = getCurrentPreset(engine);
        if (preset.type !== 'a4') return;

        const copies = Math.max(1, Number.parseInt(document.getElementById('bcs-gen-copies')?.value, 10) || 1);
        const totalPerSheet = preset.cols * preset.rows;
        const currentQty = Math.max(1, Number.parseInt(document.getElementById('bcs-gen-qty')?.value, 10) || totalPerSheet);
        const currentTotalSlots = (state.genStartPosition - 1) + currentQty * copies;
        const targetPages = Math.max(1, Math.ceil(currentTotalSlots / totalPerSheet));
        const exactStickersNeeded = targetPages * totalPerSheet - (state.genStartPosition - 1);
        const exactUniqueCodes = Math.min(500, Math.max(1, Math.floor(exactStickersNeeded / copies)));

        const qtyInput = document.getElementById('bcs-gen-qty');
        if (qtyInput) qtyInput.value = String(exactUniqueCodes);
        refreshGeneratorPreview();
        showToast(`Adjusted to ${exactUniqueCodes} barcodes so 100% of ${targetPages} A4 sheet(s) is filled with zero empty slots!`);
    }

    function bindEvents() {
        // Tab Switching
        root.querySelectorAll('.bcs-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        document.getElementById('bcs-jump-scan-btn')?.addEventListener('click', () => switchTab('tracker'));
        document.getElementById('bcs-refresh-btn')?.addEventListener('click', async () => {
            const engine = await ensureBarcodeEngineLoaded();
            await loadSettingsAndInit(engine);
            await loadBatchesAndKpis();
            if (state.activeTab === 'tracker') await loadPool();
            showToast('Refreshed barcode pool & settings.');
        });

        // Printer Mode Cards (A4 Full Sheet vs Thermal Roll)
        document.getElementById('bcs-printer-mode-cards')?.addEventListener('click', (e) => {
            const card = e.target.closest('.bcs-mode-card');
            if (!card) return;
            const engine = window.LabFlowBarcode;
            if (!engine) return;
            const genSelect = document.getElementById('bcs-gen-preset');
            if (!genSelect) return;

            if (card.dataset.mode === 'a4') {
                genSelect.value = 'a4_full_65';
                state.genStartPosition = state.autoRememberSlot ? engine.getSavedA4NextSlot('a4_full_65') : 1;
            } else {
                genSelect.value = 'thermal_50x25_2up';
                state.genStartPosition = 1;
            }
            engine.saveLocalPrefs({ paperPreset: genSelect.value });
            syncPrinterModeUi(engine, true);
            refreshGeneratorPreview();
        });

        // Quick A4 Grid Density Pills
        document.getElementById('bcs-quick-a4-presets')?.addEventListener('click', (e) => {
            const pill = e.target.closest('.bcs-pill');
            if (!pill) return;
            const engine = window.LabFlowBarcode;
            if (!engine) return;
            const presetId = pill.dataset.preset;
            const genSelect = document.getElementById('bcs-gen-preset');
            if (genSelect && engine.PAPER_PRESETS[presetId]) {
                genSelect.value = presetId;
                state.genStartPosition = state.autoRememberSlot ? engine.getSavedA4NextSlot(presetId) : 1;
                engine.saveLocalPrefs({ paperPreset: presetId });
                syncPrinterModeUi(engine, true);
                refreshGeneratorPreview();
            }
        });

        // Quantity Quick Pills
        document.getElementById('bcs-qty-pills')?.addEventListener('click', (e) => {
            const pill = e.target.closest('.bcs-pill');
            if (!pill) return;
            const qtyInput = document.getElementById('bcs-gen-qty');
            if (qtyInput) qtyInput.value = pill.dataset.qty;
            refreshGeneratorPreview();
        });

        // Fill Exact Full Sheet Button
        document.getElementById('bcs-fill-exact-sheet-btn')?.addEventListener('click', fillExactFullSheetQuantity);

        // Fresh Sheet (#1) & Fill Remaining Slots on Half-Used Sheet
        document.getElementById('bcs-fresh-sheet-btn')?.addEventListener('click', () => {
            const engine = window.LabFlowBarcode;
            state.genStartPosition = 1;
            if (engine) {
                const preset = getCurrentPreset(engine);
                engine.setSavedA4NextSlot(preset.id, 1);
                const copies = Math.max(1, Number.parseInt(document.getElementById('bcs-gen-copies')?.value, 10) || 1);
                const qtyInput = document.getElementById('bcs-gen-qty');
                if (qtyInput && preset.type === 'a4') {
                    qtyInput.value = String(Math.max(1, Math.floor((preset.cols * preset.rows) / copies)));
                }
            }
            refreshGeneratorPreview();
        });

        document.getElementById('bcs-fill-remaining-btn')?.addEventListener('click', () => {
            const engine = window.LabFlowBarcode;
            if (!engine) return;
            const preset = getCurrentPreset(engine);
            const copies = Math.max(1, Number.parseInt(document.getElementById('bcs-gen-copies')?.value, 10) || 1);
            const remSlots = Math.max(1, preset.cols * preset.rows - (state.genStartPosition - 1));
            const qtyInput = document.getElementById('bcs-gen-qty');
            if (qtyInput) qtyInput.value = String(Math.max(1, Math.floor(remSlots / copies)));
            refreshGeneratorPreview();
        });

        document.getElementById('bcs-gen-cutlines')?.addEventListener('change', (e) => {
            state.showCutLines = Boolean(e.target.checked);
            window.LabFlowBarcode?.saveLocalPrefs({ showCutLines: state.showCutLines });
        });

        document.getElementById('bcs-gen-auto-slot')?.addEventListener('change', (e) => {
            state.autoRememberSlot = Boolean(e.target.checked);
            window.LabFlowBarcode?.saveLocalPrefs({ autoAdvanceA4Slot: state.autoRememberSlot });
        });

        // Sample Hint Quick Pills
        document.getElementById('bcs-sample-pills')?.addEventListener('click', (e) => {
            const pill = e.target.closest('.bcs-pill');
            if (!pill) return;
            root.querySelectorAll('#bcs-sample-pills .bcs-pill').forEach((p) => p.classList.remove('active'));
            pill.classList.add('active');
            const input = document.getElementById('bcs-gen-sample-hint');
            if (input) input.value = pill.dataset.sample || '';
            refreshGeneratorPreview();
        });

        ['bcs-gen-qty', 'bcs-gen-copies', 'bcs-gen-sample-hint', 'bcs-gen-center'].forEach((id) => {
            document.getElementById(id)?.addEventListener('input', refreshGeneratorPreview);
            document.getElementById(id)?.addEventListener('change', refreshGeneratorPreview);
        });

        document.getElementById('bcs-gen-preset')?.addEventListener('change', (e) => {
            const engine = window.LabFlowBarcode;
            if (!engine) return;
            const nextId = e.target.value;
            const nextPreset = engine.PAPER_PRESETS[nextId] || engine.PAPER_PRESETS.a4_full_65;
            state.genStartPosition = state.autoRememberSlot && nextPreset.type === 'a4'
                ? engine.getSavedA4NextSlot(nextId)
                : 1;
            engine.saveLocalPrefs({ paperPreset: nextId });
            syncPrinterModeUi(engine, true);
            refreshGeneratorPreview();
        });

        document.getElementById('bcs-gen-start-pos')?.addEventListener('input', (e) => {
            state.genStartPosition = Math.max(1, Number.parseInt(e.target.value, 10) || 1);
            refreshGeneratorPreview();
        });

        document.getElementById('bcs-gen-a4-grid')?.addEventListener('click', (e) => {
            const cell = e.target.closest('.bcs-a4-slot');
            if (!cell) return;
            state.genStartPosition = Number(cell.dataset.pos) || 1;
            refreshGeneratorPreview();
        });

        // Printer Alignment & Margins Test Sheet (strictly for checking paper margins without clinical barcode use)
        document.getElementById('bcs-test-one-btn')?.addEventListener('click', async () => {
            try {
                const engine = await ensureBarcodeEngineLoaded();
                const preset = getCurrentPreset(engine);
                const sampleHint = String(document.getElementById('bcs-gen-sample-hint')?.value || '').trim();
                const vacMeta = sampleHint ? engine.resolveVacutainerMeta(sampleHint) : null;
                const demoCount = preset.type === 'a4'
                    ? Math.max(1, preset.cols * preset.rows - (state.genStartPosition - 1))
                    : Math.max(6, preset.cols * 4);

                const demoItems = [];
                for (let i = 1; i <= demoCount; i += 1) {
                    demoItems.push({
                        labelType: 'preprinted',
                        barcode: `ALIGN-${String(i).padStart(3, '0')}`,
                        sampleHint: 'ALIGNMENT TEST',
                        vacutainer: vacMeta,
                        headerName: state.resolvedHeaderName,
                        assignedToName: 'SAMPLE ONLY',
                        copies: 1,
                    });
                }

                await engine.printLabels(demoItems, {
                    paperPreset: preset.id,
                    startPosition: state.genStartPosition,
                    showCutLines: state.showCutLines,
                    showLabName: state.settings?.showLabName !== false,
                    showVacutainerGuide: state.settings?.showVacutainerGuide !== false,
                    topOffsetMm: state.settings?.calibration?.topOffsetMm || 0,
                    leftOffsetMm: state.settings?.calibration?.leftOffsetMm || 0,
                    barWidth: state.settings?.calibration?.barWidth || 1.5,
                    barcodeHeightMm: state.settings?.calibration?.barcodeHeightMm || 10.5,
                    fontScale: state.settings?.calibration?.fontScale || 1,
                });
                showToast('Margin alignment test page sent to printer. For real tube barcodes, click "Generate & Print Full Sheet".');
            } catch (err) {
                showToast(err.message || 'Alignment test print failed', true);
            }
        });

        // Generate & Print Real Batch
        document.getElementById('bcs-generate-print-btn')?.addEventListener('click', async () => {
            const btn = document.getElementById('bcs-generate-print-btn');
            if (!btn || btn.disabled) return;
            const origHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Generating Full Sheet...`;

            try {
                const engine = await ensureBarcodeEngineLoaded();
                const preset = getCurrentPreset(engine);
                const quantity = Math.min(500, Math.max(1, Number.parseInt(document.getElementById('bcs-gen-qty')?.value, 10) || 65));
                const copiesPerBarcode = Math.min(10, Math.max(1, Number.parseInt(document.getElementById('bcs-gen-copies')?.value, 10) || 1));
                const paperPreset = preset.id;
                const sampleHint = String(document.getElementById('bcs-gen-sample-hint')?.value || '').trim();
                const assignedToUserId = document.getElementById('bcs-gen-center')?.value || '';
                const notes = String(document.getElementById('bcs-gen-notes')?.value || '').trim();

                const res = await fetch('/api/v1/user/barcodes/generate-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        quantity,
                        copiesPerBarcode,
                        paperPreset,
                        sampleHint,
                        assignedToUserId,
                        notes,
                    }),
                });
                const data = await res.json();
                if (!res.ok || !data?.success) {
                    throw new Error(data?.message || 'Failed to generate barcode batch');
                }

                const printItems = (data.barcodes || []).map((b) => ({
                    labelType: 'preprinted',
                    barcode: b.barcode,
                    sampleHint: b.sampleHint || '',
                    vacutainer: b.vacutainer || (b.sampleHint ? engine.resolveVacutainerMeta(b.sampleHint) : null),
                    assignedToName: b.assignedToName || '',
                    headerName: data.headerName || state.resolvedHeaderName,
                    copies: copiesPerBarcode,
                }));

                const printOptions = {
                    paperPreset,
                    startPosition: state.genStartPosition,
                    showCutLines: state.showCutLines,
                    showLabName: state.settings?.showLabName !== false,
                    showVacutainerGuide: state.settings?.showVacutainerGuide !== false,
                    topOffsetMm: state.settings?.calibration?.topOffsetMm || 0,
                    leftOffsetMm: state.settings?.calibration?.leftOffsetMm || 0,
                    barWidth: state.settings?.calibration?.barWidth || 1.5,
                    barcodeHeightMm: state.settings?.calibration?.barcodeHeightMm || 10.5,
                    fontScale: state.settings?.calibration?.fontScale || 1,
                };

                state.lastGeneratedResult = { printItems, printOptions, batch: data.batch };

                const lastCard = document.getElementById('bcs-last-batch-card');
                const lastInfo = document.getElementById('bcs-last-batch-info');
                if (lastCard && lastInfo && data.batch) {
                    lastCard.style.display = 'block';
                    lastInfo.textContent = `${data.batch.batchCode}: ${data.batch.startBarcode} → ${data.batch.endBarcode} (${data.batch.quantity} unique barcodes on ${preset.name})`;
                }

                if (preset.type === 'a4' && state.autoRememberSlot) {
                    const nextSlot = engine.setSavedA4NextSlot(
                        paperPreset,
                        state.genStartPosition + quantity * copiesPerBarcode
                    );
                    state.genStartPosition = nextSlot;
                }

                await loadBatchesAndKpis();
                await refreshGeneratorPreview();
                await engine.printLabels(printItems, printOptions);
                const toastMsg = data.collisionsSkipped > 0
                    ? `Generated & sent ${printItems.length} barcodes (${data.batch?.batchCode})! (${data.collisionsSkipped} busy database numbers safely bypassed & replaced with fresh barcodes).`
                    : `Generated & sent ${printItems.length} barcodes (${data.batch?.batchCode})! (100% collision-free in your database).`;
                showToast(toastMsg);
            } catch (err) {
                showToast(err.message || 'Batch generation failed', true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        });

        document.getElementById('bcs-reprint-last-btn')?.addEventListener('click', async () => {
            if (!state.lastGeneratedResult) return;
            await window.LabFlowBarcode?.printLabels(
                state.lastGeneratedResult.printItems,
                state.lastGeneratedResult.printOptions
            );
        });

        document.getElementById('bcs-tabprint-last-btn')?.addEventListener('click', async () => {
            if (!state.lastGeneratedResult) return;
            await window.LabFlowBarcode?.printLabels(state.lastGeneratedResult.printItems, {
                ...state.lastGeneratedResult.printOptions,
                openInNewTab: true,
            });
        });

        // Batch Table Actions
        document.getElementById('bcs-batch-search-btn')?.addEventListener('click', loadBatchesAndKpis);
        document.getElementById('bcs-batch-search')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') loadBatchesAndKpis();
        });

        document.getElementById('bcs-batches-tbody')?.addEventListener('click', (e) => {
            const reprintBtn = e.target.closest('[data-batch-reprint]');
            if (reprintBtn) {
                reprintBatch(reprintBtn.dataset.batchReprint, reprintBtn.dataset.onlyUnused === 'true');
                return;
            }
            const inspectBtn = e.target.closest('[data-batch-inspect]');
            if (inspectBtn) {
                state.activeBatchFilterId = inspectBtn.dataset.batchInspect;
                state.activeBatchFilterCode = inspectBtn.dataset.batchCode || '';
                state.poolPage = 1;
                switchTab('tracker');
            }
        });

        // Tracker / Scanner Tab
        document.getElementById('bcs-scan-btn')?.addEventListener('click', () => {
            state.poolPage = 1;
            loadPool();
        });
        document.getElementById('bcs-scan-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                state.poolPage = 1;
                loadPool();
            }
        });
        document.getElementById('bcs-pool-status')?.addEventListener('change', () => {
            state.poolPage = 1;
            loadPool();
        });
        document.getElementById('bcs-clear-filter-btn')?.addEventListener('click', () => {
            state.activeBatchFilterId = '';
            state.activeBatchFilterCode = '';
            state.poolPage = 1;
            loadPool();
        });

        document.getElementById('bcs-pool-prev')?.addEventListener('click', () => {
            if (state.poolPage > 1) {
                state.poolPage -= 1;
                loadPool();
            }
        });
        document.getElementById('bcs-pool-next')?.addEventListener('click', () => {
            if (state.poolPage * state.poolLimit < state.poolTotal) {
                state.poolPage += 1;
                loadPool();
            }
        });

        document.getElementById('bcs-pool-check-all')?.addEventListener('change', (e) => {
            const checked = e.target.checked;
            state.selectedPoolBarcodes.clear();
            root.querySelectorAll('.bcs-pool-row-chk').forEach((chk) => {
                chk.checked = checked;
                if (checked) state.selectedPoolBarcodes.add(chk.value);
            });
            updateBulkVoidButton();
        });

        document.getElementById('bcs-pool-tbody')?.addEventListener('change', (e) => {
            const chk = e.target.closest('.bcs-pool-row-chk');
            if (!chk) return;
            if (chk.checked) state.selectedPoolBarcodes.add(chk.value);
            else state.selectedPoolBarcodes.delete(chk.value);
            updateBulkVoidButton();
        });

        document.getElementById('bcs-bulk-void-btn')?.addEventListener('click', () => {
            if (state.selectedPoolBarcodes.size === 0) return;
            toggleVoidBarcodes(Array.from(state.selectedPoolBarcodes), 'void');
        });

        document.getElementById('bcs-export-csv-btn')?.addEventListener('click', exportPoolCsv);

        // Delegated clicks inside tracker spotlight + table
        document.getElementById('bcs-panel-tracker')?.addEventListener('click', async (e) => {
            const printBookingBtn = e.target.closest('[data-print-booking]');
            if (printBookingBtn) {
                const engine = await ensureBarcodeEngineLoaded();
                engine.openBookingPrintModal({
                    bookingIds: [printBookingBtn.dataset.printBooking],
                    filterBarcode: printBookingBtn.dataset.filterCode || '',
                });
                return;
            }

            const singlePreBtn = e.target.closest('[data-single-preprint]');
            if (singlePreBtn) {
                const engine = await ensureBarcodeEngineLoaded();
                const hint = singlePreBtn.dataset.sampleHint || '';
                const preset = getCurrentPreset(engine);
                await engine.printLabels(
                    [
                        {
                            labelType: 'preprinted',
                            barcode: singlePreBtn.dataset.singlePreprint,
                            sampleHint: hint,
                            vacutainer: hint ? engine.resolveVacutainerMeta(hint) : null,
                            headerName: state.resolvedHeaderName,
                            copies: 1,
                        },
                    ],
                    {
                        paperPreset: preset.id,
                        startPosition: preset.type === 'a4' ? state.genStartPosition : 1,
                        showCutLines: state.showCutLines,
                        showLabName: state.settings?.showLabName !== false,
                        showVacutainerGuide: state.settings?.showVacutainerGuide !== false,
                        topOffsetMm: state.settings?.calibration?.topOffsetMm || 0,
                        leftOffsetMm: state.settings?.calibration?.leftOffsetMm || 0,
                        barWidth: state.settings?.calibration?.barWidth || 1.5,
                        barcodeHeightMm: state.settings?.calibration?.barcodeHeightMm || 10.5,
                        fontScale: state.settings?.calibration?.fontScale || 1,
                    }
                );
                return;
            }

            const voidBtn = e.target.closest('[data-void-code]');
            if (voidBtn) {
                toggleVoidBarcodes([voidBtn.dataset.voidCode], 'void');
                return;
            }

            const restoreBtn = e.target.closest('[data-restore-code]');
            if (restoreBtn) {
                toggleVoidBarcodes([restoreBtn.dataset.restoreCode], 'restore');
            }
        });

        // Settings & Calibration Tab
        [
            'bcs-set-prefix',
            'bcs-set-digits',
            'bcs-set-header',
            'bcs-set-preset',
            'bcs-set-showPatient',
            'bcs-set-showVac',
            'bcs-set-showTests',
            'bcs-set-showDate',
            'bcs-set-showLab',
            'bcs-cal-width',
            'bcs-cal-height',
            'bcs-cal-font',
        ].forEach((id) => {
            document.getElementById(id)?.addEventListener('input', refreshCalibrationPreview);
            document.getElementById(id)?.addEventListener('change', refreshCalibrationPreview);
        });

        document.getElementById('bcs-cal-test-btn')?.addEventListener('click', async () => {
            const engine = await ensureBarcodeEngineLoaded();
            const presetId = document.getElementById('bcs-set-preset')?.value || 'a4_full_65';
            await engine.printLabels(
                [
                    {
                        labelType: 'patient_tube',
                        barcode: 'CAL100042',
                        patientName: 'RAHUL SHARMA',
                        ageGender: '34/M',
                        sampleType: 'EDTA',
                        vacutainer: engine.resolveVacutainerMeta('EDTA'),
                        testsText: 'CBC, ESR, HbA1c',
                        dateTimeText: '02 Nov 10:15',
                        headerName: document.getElementById('bcs-set-header')?.value || state.resolvedHeaderName,
                        copies: 1,
                    },
                ],
                {
                    paperPreset: presetId,
                    showPatientName: document.getElementById('bcs-set-showPatient')?.checked ?? true,
                    showAgeGender: document.getElementById('bcs-set-showPatient')?.checked ?? true,
                    showSampleType: true,
                    showVacutainerGuide: document.getElementById('bcs-set-showVac')?.checked ?? true,
                    showTests: document.getElementById('bcs-set-showTests')?.checked ?? true,
                    showDateTime: document.getElementById('bcs-set-showDate')?.checked ?? true,
                    showLabName: document.getElementById('bcs-set-showLab')?.checked ?? true,
                    topOffsetMm: Number(document.getElementById('bcs-cal-top')?.value) || 0,
                    leftOffsetMm: Number(document.getElementById('bcs-cal-left')?.value) || 0,
                    barWidth: Number(document.getElementById('bcs-cal-width')?.value) || 1.5,
                    barcodeHeightMm: Number(document.getElementById('bcs-cal-height')?.value) || 10.5,
                    fontScale: Number(document.getElementById('bcs-cal-font')?.value) || 1,
                }
            );
        });

        document.getElementById('bcs-save-settings-btn')?.addEventListener('click', async () => {
            try {
                const payload = {
                    prefix: document.getElementById('bcs-set-prefix')?.value || '',
                    minDigits: Number(document.getElementById('bcs-set-digits')?.value) || 7,
                    customHeaderName: document.getElementById('bcs-set-header')?.value || '',
                    defaultPaperPreset: document.getElementById('bcs-set-preset')?.value || 'a4_full_65',
                    defaultCopies: Number(document.getElementById('bcs-set-copies')?.value) || 1,
                    showPatientName: Boolean(document.getElementById('bcs-set-showPatient')?.checked),
                    showAgeGender: Boolean(document.getElementById('bcs-set-showPatient')?.checked),
                    showVacutainerGuide: Boolean(document.getElementById('bcs-set-showVac')?.checked),
                    showTests: Boolean(document.getElementById('bcs-set-showTests')?.checked),
                    showDateTime: Boolean(document.getElementById('bcs-set-showDate')?.checked),
                    showLabName: Boolean(document.getElementById('bcs-set-showLab')?.checked),
                    autoPromptAfterBooking: Boolean(document.getElementById('bcs-set-autoPrompt')?.checked),
                    restrictCenterOwnership: Boolean(document.getElementById('bcs-set-restrictCenter')?.checked),
                    calibration: {
                        topOffsetMm: Number(document.getElementById('bcs-cal-top')?.value) || 0,
                        leftOffsetMm: Number(document.getElementById('bcs-cal-left')?.value) || 0,
                        barWidth: Number(document.getElementById('bcs-cal-width')?.value) || 1.5,
                        barcodeHeightMm: Number(document.getElementById('bcs-cal-height')?.value) || 10.5,
                        fontScale: Number(document.getElementById('bcs-cal-font')?.value) || 1,
                    },
                };

                const res = await fetch('/api/v1/user/barcodes/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (!res.ok || !data?.success) {
                    throw new Error(data?.message || 'Failed to save barcode settings');
                }
                state.settings = data.settings;
                state.resolvedHeaderName = data.resolvedHeaderName || state.resolvedHeaderName;
                window.LabFlowBarcode?.invalidateSettingsCache();
                window.LabFlowBarcode?.saveLocalPrefs({ paperPreset: payload.defaultPaperPreset });
                const genSelect = document.getElementById('bcs-gen-preset');
                if (genSelect) genSelect.value = payload.defaultPaperPreset;
                if (window.LabFlowBarcode) syncPrinterModeUi(window.LabFlowBarcode, true);
                await refreshGeneratorPreview();
                showToast('Global barcode settings & calibration saved!');
            } catch (err) {
                showToast(err.message || 'Could not save settings', true);
            }
        });
    }

    (async function boot() {
        try {
            bindEvents();
            const engine = await ensureBarcodeEngineLoaded();
            await Promise.all([
                loadSettingsAndInit(engine),
                loadBatchesAndKpis(),
            ]);
        } catch (err) {
            console.error('Barcode Studio boot error:', err);
            showToast('Failed to initialize Barcode Studio.', true);
        }
    })();
})();
