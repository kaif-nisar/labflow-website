/**
 * Enterprise Print Settings & PDF Customizer Engine
 * Medical Diagnostics & LIS Systems
 * Zero-jank, 0ms live-canvas synchronization & fault-tolerant backend persistence.
 */

(function () {
    'use strict';

    const BASE_URL = window.location.origin;
    const CM_TO_PX = 37.8; // 96 DPI conversion constant (1cm = 37.8px)

    // Central Application State
    const state = {
        letterheadMode: 'digital', // 'digital' | 'preprinted'
        activeLetterheadUrl: '',
        activeLetterheadPublicId: '',
        activeLetterheadId: '',
        pendingTemplateFile: null,

        sigGlobalAlignment: 'space-between',
        pendingLabSignFile: null,
        pendingDoc1SignFile: null,
        pendingDoc2SignFile: null,

        labSignUrl: '',
        labSignPublicId: '',
        doc1SignUrl: '',
        doc1SignPublicId: '',
        doc2SignUrl: '',
        doc2SignPublicId: '',
        docSignRecordId: '',

        currentZoom: 1.0,
        isPdfLoading: false,
        isSaving: false
    };

    // Helper: Toast notification
    function showToast(message, type = 'success') {
        const toast = document.getElementById('psToast');
        const icon = document.getElementById('psToastIcon');
        const msg = document.getElementById('psToastMsg');
        if (!toast || !msg) return;

        toast.className = `ps-toast ${type} is-show`;
        msg.textContent = message;

        if (icon) {
            icon.className = type === 'success' ? 'fa-solid fa-circle-check' :
                             type === 'error' ? 'fa-solid fa-circle-exclamation' :
                             'fa-solid fa-triangle-exclamation';
        }

        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => {
            toast.classList.remove('is-show');
        }, 3500);
    }

    // Helper: Update Top Status Indicator
    function updateStatusIndicator(status, text) {
        const el = document.getElementById('saveStatusIndicator');
        if (!el) return;

        let icon = '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i>';
        if (status === 'saving') {
            icon = '<i class="fa-solid fa-spinner fa-spin" style="color: #2563eb;"></i>';
        } else if (status === 'unsaved') {
            icon = '<i class="fa-solid fa-circle-dot" style="color: #f59e0b;"></i>';
        } else if (status === 'error') {
            icon = '<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i>';
        }

        el.innerHTML = `${icon} <span>${text}</span>`;
    }

    // Helper: Format bytes
    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Helper: URL sanitizer
    function sanitizeUrl(url) {
        if (!url || typeof url !== 'string') return '';
        const trimmed = url.trim();
        if (['null', 'undefined', '[object object]'].includes(trimmed.toLowerCase())) return '';
        return trimmed;
    }

    // Extract doctor display name from designation lines for digital signature
    function extractDoctorDisplayName(text, fallback) {
        if (!text || typeof text !== 'string') return fallback;
        const firstLine = text.split('\n')[0].trim();
        return firstLine.length > 0 ? firstLine : fallback;
    }

    // --- ACCORDION SYSTEM ---
    window.togglePsCard = function (cardId) {
        const card = document.getElementById(cardId);
        if (card) {
            card.classList.toggle('is-open');
        }
    };

    // --- ZOOM & FIT ENGINE ---
    window.adjustZoom = function (delta) {
        state.currentZoom = Math.min(1.4, Math.max(0.35, +(state.currentZoom + delta).toFixed(2)));
        applyZoom();
    };

    window.fitPreviewToWindow = function () {
        const container = document.querySelector('.ps-preview-panel');
        if (!container) return;
        const isMobile = window.innerWidth <= 640;
        const availableWidth = container.clientWidth - (isMobile ? 16 : 48); // accounting for padding
        const targetScale = Math.min(1.0, Math.max(0.20, availableWidth / 794));
        state.currentZoom = +(targetScale.toFixed(2));
        applyZoom();
    };

    function applyZoom() {
        const scaler = document.getElementById('a4Scaler');
        const zoomVal = document.getElementById('zoomPercentage');
        const viewport = document.getElementById('a4ViewportContainer');

        if (scaler) {
            scaler.style.transform = `scale(${state.currentZoom})`;
            scaler.style.transformOrigin = 'top center';
        }
        if (viewport) {
            viewport.style.height = `${Math.ceil(1123 * state.currentZoom) + 30}px`;
        }
        if (zoomVal) {
            zoomVal.textContent = `${Math.round(state.currentZoom * 100)}%`;
        }
    }

    // --- LETTERHEAD MODE & PRESETS ---
    window.setLetterheadMode = function (mode) {
        state.letterheadMode = mode;
        const tabDigital = document.getElementById('tabModeDigital');
        const tabPreprinted = document.getElementById('tabModePreprinted');
        if (tabDigital && tabPreprinted) {
            tabDigital.classList.toggle('is-active', mode === 'digital');
            tabPreprinted.classList.toggle('is-active', mode === 'preprinted');
        }

        const digitalControls = document.getElementById('digitalLetterheadControls');
        if (digitalControls) {
            // Keep controls visible so user can configure stationary or toggle
            digitalControls.style.opacity = mode === 'digital' ? '1' : '0.85';
        }

        updateLiveCanvas();
    };

    window.applyHeaderPreset = function (headerCm, footerCm) {
        const headerInput = document.getElementById('header');
        const footerInput = document.getElementById('footer');
        if (headerInput && headerCm !== null) headerInput.value = headerCm;
        if (footerInput && footerCm !== null) footerInput.value = footerCm;

        // Toggle active chip style
        document.querySelectorAll('.ps-preset-chips .ps-chip').forEach(chip => {
            const isMatch = chip.textContent.includes(`${headerCm}cm`);
            chip.classList.toggle('is-active', isMatch);
        });

        updateLiveCanvas();
    };

    // --- SIGNATURES MATRIX & ALIGNMENT ---
    window.setSigGlobalAlignment = function (align) {
        state.sigGlobalAlignment = align;
        document.querySelectorAll('#sigGlobalAlignmentTabs .ps-tab-item').forEach(tab => {
            tab.classList.toggle('is-active', tab.getAttribute('data-align') === align);
        });
        const grid = document.getElementById('docSignaturesGrid');
        if (grid) {
            grid.style.justifyContent = align;
        }
    };

    window.handleSigSlotToggle = function (slotKey) {
        updateSignaturesLiveCanvas();
    };

    // --- PREVIEW MODE (Live Canvas vs PDF Iframe) ---
    window.switchPreviewMode = function (mode) {
        const btnCanvas = document.getElementById('btnModeCanvas');
        const btnPdf = document.getElementById('btnModePdf');
        const liveSheet = document.getElementById('liveA4Sheet');
        const pdfBox = document.getElementById('pdfPreviewIframeBox');

        if (mode === 'pdf') {
            btnCanvas?.classList.remove('is-active');
            btnPdf?.classList.add('is-active');
            if (liveSheet) liveSheet.style.display = 'none';
            if (pdfBox) pdfBox.classList.add('is-active');
            autogeneratingpdf();
        } else {
            btnPdf?.classList.remove('is-active');
            btnCanvas?.classList.add('is-active');
            if (pdfBox) pdfBox.classList.remove('is-active');
            if (liveSheet) liveSheet.style.display = 'flex';
        }
    };

    // --- LIVE CANVAS SYNCHRONIZATION (0ms Instant DOM Update) ---
    function updateLiveCanvas() {
        const headerCm = parseFloat(document.getElementById('header')?.value) || 0;
        const footerCm = parseFloat(document.getElementById('footer')?.value) || 0;
        const marginLeftCm = parseFloat(document.getElementById('margin-left')?.value) || 0;
        const marginRightCm = parseFloat(document.getElementById('margin-right')?.value) || 0;
        const sigPdLeftCm = parseFloat(document.getElementById('padding-left')?.value) || 0;
        const sigPdRightCm = parseFloat(document.getElementById('padding-right')?.value) || 0;

        const fontFamily = document.getElementById('pdf-font-family')?.value || 'Arial';
        const fontSizePt = parseInt(document.getElementById('pdf-font-size')?.value) || 11;
        const rowSpacing = parseInt(document.getElementById('spacing')?.value) || 1;

        const showAbnormalFlag = document.getElementById('high-low-marker')?.checked ?? true;
        const abnormalInRed = document.getElementById('abnormal-results-red')?.checked ?? true;
        const abnormalInBold = document.getElementById('abnormal-results-bold')?.checked ?? true;
        const showInvestBanner = document.getElementById('show-investigations')?.checked ?? true;
        const hideCategories = document.getElementById('hide-categories')?.checked ?? false;
        const hideTableHeadings = document.getElementById('hide-table-headings')?.checked ?? false;

        const docBody = document.getElementById('docReportBody');
        const sheet = document.getElementById('liveA4Sheet');
        const headerGuide = document.getElementById('preprintedHeaderGuide');
        const footerGuide = document.getElementById('preprintedFooterGuide');
        const headerLabel = document.getElementById('headerGuideLabel');
        const footerLabel = document.getElementById('footerGuideLabel');
        const letterheadOverlay = document.getElementById('letterheadBgOverlay');

        // Font Family & Sizing on Sheet
        if (sheet) {
            sheet.style.fontFamily = fontFamily;
        }
        if (docBody) {
            docBody.style.paddingLeft = `${Math.max(10, Math.round(marginLeftCm * CM_TO_PX))}px`;
            docBody.style.paddingRight = `${Math.max(10, Math.round(marginRightCm * CM_TO_PX))}px`;
            docBody.style.fontSize = `${fontSizePt}pt`;
        }

        // Letterhead Layer vs Pre-printed Spacer
        if (state.letterheadMode === 'digital' && state.activeLetterheadUrl) {
            if (letterheadOverlay) {
                letterheadOverlay.classList.add('is-active');
                letterheadOverlay.style.backgroundImage = `url("${state.activeLetterheadUrl}")`;
            }
            if (headerGuide) {
                headerGuide.style.height = `${Math.round(headerCm * CM_TO_PX)}px`;
                headerGuide.style.background = 'transparent';
                headerGuide.style.borderBottomColor = 'transparent';
                headerGuide.style.color = 'transparent';
            }
            if (footerGuide) {
                footerGuide.style.height = `${Math.round(footerCm * CM_TO_PX)}px`;
                footerGuide.style.background = 'transparent';
                footerGuide.style.borderTopColor = 'transparent';
                footerGuide.style.color = 'transparent';
            }
        } else {
            // Pre-printed stationery mode
            if (letterheadOverlay) {
                letterheadOverlay.classList.remove('is-active');
                letterheadOverlay.style.backgroundImage = 'none';
            }
            if (headerGuide) {
                const headerHeightPx = Math.round(headerCm * CM_TO_PX);
                headerGuide.style.height = `${headerHeightPx}px`;
                headerGuide.style.background = '';
                headerGuide.style.borderBottomColor = '#94a3b8';
                headerGuide.style.color = '#64748b';
                headerGuide.style.display = headerHeightPx > 0 ? 'flex' : 'none';
                if (headerLabel) headerLabel.textContent = `${headerCm.toFixed(1)} cm`;
            }
            if (footerGuide) {
                const footerHeightPx = Math.round(footerCm * CM_TO_PX);
                footerGuide.style.height = `${footerHeightPx}px`;
                footerGuide.style.background = '';
                footerGuide.style.borderTopColor = '#94a3b8';
                footerGuide.style.color = '#64748b';
                footerGuide.style.display = footerHeightPx > 0 ? 'flex' : 'none';
                if (footerLabel) footerLabel.textContent = `${footerCm.toFixed(1)} cm`;
            }
        }

        // Row spacing on parameter table
        const paddingMap = {
            1: '5px 10px',
            2: '8px 10px',
            3: '11px 10px',
            4: '14px 10px',
            5: '17px 10px'
        };
        const cellPadding = paddingMap[rowSpacing] || '6px 10px';
        document.querySelectorAll('#docParametersTable td').forEach(td => {
            td.style.padding = cellPadding;
        });

        // Abnormal highlighting styles
        document.querySelectorAll('.ps-val-abnormal').forEach(el => {
            if (abnormalInRed) {
                el.classList.add('ps-result-abnormal');
            } else {
                el.classList.remove('ps-result-abnormal');
            }
            el.style.fontWeight = abnormalInBold ? '700' : '500';
        });

        document.querySelectorAll('.ps-result-flag').forEach(badge => {
            badge.style.display = showAbnormalFlag ? 'inline-block' : 'none';
        });

        // Banner and Categories
        const banner = document.getElementById('docInvestigationBanner');
        if (banner) banner.style.display = showInvestBanner ? 'block' : 'none';

        const catRows = document.querySelectorAll('.ps-doc-category-row');
        catRows.forEach(row => {
            row.style.display = hideCategories ? 'none' : 'table-row';
        });

        const tableHead = document.getElementById('docTableHead');
        if (tableHead) {
            tableHead.style.display = hideTableHeadings ? 'none' : 'table-header-group';
        }

        // Signature container padding
        const sigContainer = document.getElementById('docSignaturesContainer');
        if (sigContainer) {
            sigContainer.style.paddingLeft = `${Math.round(sigPdLeftCm * CM_TO_PX)}px`;
            sigContainer.style.paddingRight = `${Math.round(sigPdRightCm * CM_TO_PX)}px`;
        }

        // Update signature slots on canvas
        updateSignaturesLiveCanvas();
    }

    // Render signature slots inside the Live Canvas
    function updateSignaturesLiveCanvas() {
        const showLab = document.getElementById('show-lab')?.checked ?? true;
        const showDoc1 = document.getElementById('show-doctor1')?.checked ?? true;
        const showDoc2 = document.getElementById('show-doctor2')?.checked ?? true;

        const labInfoText = document.getElementById('lab-info')?.value || 'Medical Lab Technologist\nB.Sc. MLT, DMLT';
        const doc1InfoText = document.getElementById('firstdoctor-info')?.value || 'Dr. A. Sharma\nMBBS, MD (Pathology)';
        const doc2InfoText = document.getElementById('seconddoctor-info')?.value || 'Dr. R. Mehta\nConsultant Pathologist';

        const slot1 = document.getElementById('docSigSlot1');
        const slot2 = document.getElementById('docSigSlot2');
        const slot3 = document.getElementById('docSigSlot3');

        const text1 = document.getElementById('docSigText1');
        const text2 = document.getElementById('docSigText2');
        const text3 = document.getElementById('docSigText3');

        const wrap1 = document.getElementById('docSigImgWrap1');
        const wrap2 = document.getElementById('docSigImgWrap2');
        const wrap3 = document.getElementById('docSigImgWrap3');

        // Slot 1 (Lab Incharge)
        if (slot1) {
            slot1.style.display = showLab ? 'flex' : 'none';
            if (text1) text1.textContent = labInfoText;
            if (wrap1) {
                if (state.labSignUrl) {
                    wrap1.innerHTML = `<img src="${state.labSignUrl}" class="ps-doc-sig-img" alt="Lab Signature" onerror="window.handleSigImgError(this, 'lab')" />`;
                } else {
                    const fallbackName = extractDoctorDisplayName(labInfoText, 'M. Verma');
                    wrap1.innerHTML = `<div class="ps-doc-digital-signature">${fallbackName}</div>`;
                }
            }
        }

        // Slot 2 (Doctor 1)
        if (slot2) {
            slot2.style.display = showDoc1 ? 'flex' : 'none';
            if (text2) text2.textContent = doc1InfoText;
            if (wrap2) {
                if (state.doc1SignUrl) {
                    wrap2.innerHTML = `<img src="${state.doc1SignUrl}" class="ps-doc-sig-img" alt="Doctor 1 Signature" onerror="window.handleSigImgError(this, 'doc1')" />`;
                } else {
                    const fallbackName = extractDoctorDisplayName(doc1InfoText, 'Dr. A. Sharma');
                    wrap2.innerHTML = `<div class="ps-doc-digital-signature">${fallbackName}</div>`;
                }
            }
        }

        // Slot 3 (Doctor 2)
        if (slot3) {
            slot3.style.display = showDoc2 ? 'flex' : 'none';
            if (text3) text3.textContent = doc2InfoText;
            if (wrap3) {
                if (state.doc2SignUrl) {
                    wrap3.innerHTML = `<img src="${state.doc2SignUrl}" class="ps-doc-sig-img" alt="Doctor 2 Signature" onerror="window.handleSigImgError(this, 'doc2')" />`;
                } else {
                    const fallbackName = extractDoctorDisplayName(doc2InfoText, 'Dr. R. Mehta');
                    wrap3.innerHTML = `<div class="ps-doc-digital-signature">${fallbackName}</div>`;
                }
            }
        }
    }

    // Global image error handler to prevent broken image icons
    window.handleSigImgError = function (imgEl, slotKey) {
        if (!imgEl) return;
        const parent = imgEl.parentElement;
        if (!parent) return;

        let fallbackName = 'Doctor';
        if (slotKey === 'lab') {
            state.labSignUrl = '';
            fallbackName = extractDoctorDisplayName(document.getElementById('lab-info')?.value, 'M. Verma');
        } else if (slotKey === 'doc1') {
            state.doc1SignUrl = '';
            fallbackName = extractDoctorDisplayName(document.getElementById('firstdoctor-info')?.value, 'Dr. A. Sharma');
        } else if (slotKey === 'doc2') {
            state.doc2SignUrl = '';
            fallbackName = extractDoctorDisplayName(document.getElementById('seconddoctor-info')?.value, 'Dr. R. Mehta');
        }

        parent.innerHTML = `<div class="ps-doc-digital-signature">${fallbackName}</div>`;
    };

    // --- FILE INGESTION & DRAG AND DROP ---
    function setupDragAndDrop() {
        // 1. Letterhead Dropzone
        const letterheadDropzone = document.getElementById('letterheadDropzone');
        const letterheadInput = document.getElementById('fileInput');

        if (letterheadDropzone && letterheadInput) {
            ['dragenter', 'dragover'].forEach(event => {
                letterheadDropzone.addEventListener(event, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    letterheadDropzone.classList.add('is-dragover');
                });
            });

            ['dragleave', 'drop'].forEach(event => {
                letterheadDropzone.addEventListener(event, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    letterheadDropzone.classList.remove('is-dragover');
                });
            });

            letterheadDropzone.addEventListener('drop', (e) => {
                const files = e.dataTransfer?.files;
                if (files && files.length > 0) {
                    processLetterheadFile(files[0]);
                }
            });

            letterheadInput.addEventListener('change', (e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                    processLetterheadFile(files[0]);
                }
            });
        }

        // 2. Doctor Signatures Dropzones
        setupSignatureDropzone('dropzoneLabSign', 'lab-sign-file', 'lab');
        setupSignatureDropzone('dropzoneDoc1Sign', 'doctor-left-file', 'doc1');
        setupSignatureDropzone('dropzoneDoc2Sign', 'Doctor-Right-file', 'doc2');
    }

    function setupSignatureDropzone(dropzoneId, inputId, slotKey) {
        const dropzone = document.getElementById(dropzoneId);
        const input = document.getElementById(inputId);
        if (!dropzone || !input) return;

        ['dragenter', 'dragover'].forEach(event => {
            dropzone.addEventListener(event, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('is-dragover');
            });
        });

        ['dragleave', 'drop'].forEach(event => {
            dropzone.addEventListener(event, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('is-dragover');
            });
        });

        dropzone.addEventListener('drop', (e) => {
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                processSignatureFile(files[0], slotKey);
            }
        });

        input.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                processSignatureFile(files[0], slotKey);
            }
        });
    }

    function processLetterheadFile(file) {
        if (!file.type.startsWith('image/')) {
            showToast('Please select a valid image file (PNG, JPG, WEBP).', 'error');
            return;
        }

        state.pendingTemplateFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            state.activeLetterheadUrl = dataUrl;

            // Update Thumbnail Box
            const thumbBox = document.getElementById('letterheadThumbBox');
            const thumbImg = document.getElementById('letterheadThumbImg');
            const thumbName = document.getElementById('letterheadThumbName');
            const thumbSize = document.getElementById('letterheadThumbSize');

            if (thumbBox && thumbImg && thumbName && thumbSize) {
                thumbImg.src = dataUrl;
                thumbName.textContent = file.name;
                thumbSize.textContent = `${formatBytes(file.size)} (Pending upload)`;
                thumbBox.style.display = 'flex';
            }

            setLetterheadMode('digital');
            updateStatusIndicator('unsaved', 'Unsaved changes');
            showToast('Letterhead preview ready. Click "Save Settings" to persist.', 'success');
        };
        reader.readAsDataURL(file);
    }

    function processSignatureFile(file, slotKey) {
        if (!file.type.startsWith('image/')) {
            showToast('Please upload a valid PNG or image file.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            if (slotKey === 'lab') {
                state.pendingLabSignFile = file;
                state.labSignUrl = dataUrl;
                renderSignatureThumb('labSignThumbBox', 'labSignImgdiv', dataUrl, 'Lab Incharge');
            } else if (slotKey === 'doc1') {
                state.pendingDoc1SignFile = file;
                state.doc1SignUrl = dataUrl;
                renderSignatureThumb('firstSignThumbBox', 'firstSignImgdiv', dataUrl, 'Doctor 1');
            } else if (slotKey === 'doc2') {
                state.pendingDoc2SignFile = file;
                state.doc2SignUrl = dataUrl;
                renderSignatureThumb('secondSignThumbBox', 'secondSignImgdiv', dataUrl, 'Doctor 2');
            }

            updateLiveCanvas();
            updateStatusIndicator('unsaved', 'Unsaved signatures');
            showToast('Signature loaded. Click "Save Settings" to persist.', 'success');
        };
        reader.readAsDataURL(file);
    }

    function renderSignatureThumb(boxId, innerDivId, imgUrl, title) {
        const box = document.getElementById(boxId);
        const innerDiv = document.getElementById(innerDivId);
        if (!box || !innerDiv) return;

        innerDiv.innerHTML = `<img src="${imgUrl}" alt="${title}" style="max-height: 48px; max-width: 90px; object-fit: contain; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 2px;" onerror="this.onerror=null;this.style.display='none';" />`;
        box.style.display = 'flex';
    }

    // --- TEMPLATE REMOVAL & SIGNATURE DELETION ---
    function setupDeleteHandlers() {
        // Remove Letterhead
        document.getElementById('btnRemoveTemplate')?.addEventListener('click', () => {
            state.activeLetterheadUrl = '';
            state.pendingTemplateFile = null;
            const fileInput = document.getElementById('fileInput');
            if (fileInput) fileInput.value = '';
            const thumbBox = document.getElementById('letterheadThumbBox');
            if (thumbBox) thumbBox.style.display = 'none';

            updateLiveCanvas();
            showToast('Letterhead template removed from preview.', 'warning');
        });

        // Delete Lab Sign
        document.getElementById('btnDeleteLabSign')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await deleteSignatureSlot('lab');
        });

        // Delete Doc 1 Sign
        document.getElementById('btnDeleteDoc1Sign')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await deleteSignatureSlot('doc1');
        });

        // Delete Doc 2 Sign
        document.getElementById('btnDeleteDoc2Sign')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await deleteSignatureSlot('doc2');
        });
    }

    async function deleteSignatureSlot(slotKey) {
        let publicId = '';
        let urlField = '';
        let publicIdField = '';
        let inputId = '';
        let thumbBoxId = '';
        let innerDivId = '';

        if (slotKey === 'lab') {
            publicId = state.labSignPublicId;
            urlField = 'labinchargesign';
            publicIdField = 'labinchargesignpublicid';
            inputId = 'lab-sign-file';
            thumbBoxId = 'labSignThumbBox';
            innerDivId = 'labSignImgdiv';
        } else if (slotKey === 'doc1') {
            publicId = state.doc1SignPublicId;
            urlField = 'firstdoctorsign';
            publicIdField = 'firstdoctorsignpublicid';
            inputId = 'doctor-left-file';
            thumbBoxId = 'firstSignThumbBox';
            innerDivId = 'firstSignImgdiv';
        } else if (slotKey === 'doc2') {
            publicId = state.doc2SignPublicId;
            urlField = 'seconddoctorsign';
            publicIdField = 'seconddoctorsignpublicid';
            inputId = 'Doctor-Right-file';
            thumbBoxId = 'secondSignThumbBox';
            innerDivId = 'secondSignImgdiv';
        }

        // Reset input and state
        const fileInput = document.getElementById(inputId);
        if (fileInput) fileInput.value = '';
        const thumbBox = document.getElementById(thumbBoxId);
        if (thumbBox) thumbBox.style.display = 'none';
        const innerDiv = document.getElementById(innerDivId);
        if (innerDiv) innerDiv.innerHTML = '';

        if (slotKey === 'lab') {
            state.pendingLabSignFile = null;
            state.labSignUrl = '';
            state.labSignPublicId = '';
        } else if (slotKey === 'doc1') {
            state.pendingDoc1SignFile = null;
            state.doc1SignUrl = '';
            state.doc1SignPublicId = '';
        } else if (slotKey === 'doc2') {
            state.pendingDoc2SignFile = null;
            state.doc2SignUrl = '';
            state.doc2SignPublicId = '';
        }

        updateLiveCanvas();

        // If it was already persisted on backend, trigger API removal
        if (publicId) {
            try {
                updateStatusIndicator('saving', 'Removing signature...');
                const res = await fetch(`${BASE_URL}/api/v1/user/deleteLabInchargeSign`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ publicId, urlfield: urlField, publicIdfield: publicIdField })
                });
                if (res.ok) {
                    showToast('Signature deleted from database successfully.', 'success');
                } else {
                    showToast('Removed from view, but backend reported an issue.', 'warning');
                }
            } catch (err) {
                console.error('Error deleting signature from backend:', err);
                showToast('Removed from interface.', 'warning');
            } finally {
                updateStatusIndicator('saved', 'Ready');
            }
        } else {
            showToast('Signature removed.', 'info');
        }
    }

    // --- API & DATA FETCHING ---
    async function fetchDataAndSetInputs() {
        const reportId = localStorage.getItem('myKey');
        try {
            updateStatusIndicator('saving', 'Loading settings...');
            const response = await fetch(`${BASE_URL}/api/v1/user/getting-pdf-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportId })
            });

            if (!response.ok) throw new Error('Failed to load PDF configuration data');
            const data = await response.json();

            if (data) {
                if (data.headermargin !== undefined) document.getElementById('header').value = data.headermargin;
                if (data.footermargin !== undefined) document.getElementById('footer').value = data.footermargin;
                if (data.marginRight !== undefined) document.getElementById('margin-right').value = data.marginRight;
                if (data.marginLeft !== undefined) document.getElementById('margin-left').value = data.marginLeft;
                if (data.LeftsignPd !== undefined) document.getElementById('padding-left').value = data.LeftsignPd;
                if (data.Rightsignpd !== undefined) document.getElementById('padding-right').value = data.Rightsignpd;

                if (data.selectedFontFamily) document.getElementById('pdf-font-family').value = data.selectedFontFamily;
                if (data.selectedFontSize) document.getElementById('pdf-font-size').value = data.selectedFontSize;
                if (data.RowSpacing !== undefined) document.getElementById('spacing').value = data.RowSpacing;

                if (data.HighLow !== undefined) document.getElementById('high-low-marker').checked = !!data.HighLow;
                if (data.HLinred !== undefined) document.getElementById('abnormal-results-red').checked = !!data.HLinred;
                if (data.BoldRow !== undefined) document.getElementById('abnormal-results-bold').checked = !!data.BoldRow;
                if (data.showInvest !== undefined) document.getElementById('show-investigations').checked = !!data.showInvest;
                if (data.hideCategories !== undefined) document.getElementById('hide-categories').checked = !!data.hideCategories;
                if (data.hideTableHeadings !== undefined) document.getElementById('hide-table-headings').checked = !!data.hideTableHeadings;
            }
        } catch (error) {
            console.warn('Notice: Using default print settings due to fetch fallback:', error.message);
        }
    }

    async function fetchLabSignAndSetInputs() {
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/getDoctorsSign`);
            if (!response.ok) throw new Error('Failed to fetch doctor signatures');

            const data = await response.json();
            if (data) {
                state.docSignRecordId = data._id || '';

                if (data.labinchargeinfo !== undefined) document.getElementById('lab-info').value = data.labinchargeinfo;
                if (data.firstdoctorsigninfo !== undefined) document.getElementById('firstdoctor-info').value = data.firstdoctorsigninfo;
                if (data.seconddoctorsigninfo !== undefined) document.getElementById('seconddoctor-info').value = data.seconddoctorsigninfo;

                if (data.showlabinchargesign !== undefined) document.getElementById('show-lab').checked = !!data.showlabinchargesign;
                if (data.showfirstdoctorsign !== undefined) document.getElementById('show-doctor1').checked = !!data.showfirstdoctorsign;
                if (data.showseconddoctorsign !== undefined) document.getElementById('show-doctor2').checked = !!data.showseconddoctorsign;

                // Lab Sign Image
                state.labSignUrl = sanitizeUrl(data.labinchargesign);
                state.labSignPublicId = data.labinchargesignpublicid || '';
                if (state.labSignUrl) {
                    renderSignatureThumb('labSignThumbBox', 'labSignImgdiv', state.labSignUrl, 'Lab Incharge');
                } else {
                    document.getElementById('labSignThumbBox').style.display = 'none';
                }

                // Doctor 1 Sign Image
                state.doc1SignUrl = sanitizeUrl(data.firstdoctorsign);
                state.doc1SignPublicId = data.firstdoctorsignpublicid || '';
                if (state.doc1SignUrl) {
                    renderSignatureThumb('firstSignThumbBox', 'firstSignImgdiv', state.doc1SignUrl, 'Doctor 1');
                } else {
                    document.getElementById('firstSignThumbBox').style.display = 'none';
                }

                // Doctor 2 Sign Image
                state.doc2SignUrl = sanitizeUrl(data.seconddoctorsign);
                state.doc2SignPublicId = data.seconddoctorsignpublicid || '';
                if (state.doc2SignUrl) {
                    renderSignatureThumb('secondSignThumbBox', 'secondSignImgdiv', state.doc2SignUrl, 'Doctor 2');
                } else {
                    document.getElementById('secondSignThumbBox').style.display = 'none';
                }
            }
        } catch (error) {
            console.warn('Notice: Doctor signature data could not be retrieved:', error.message);
        }
    }

    async function fetchTemplateGallery() {
        const gallery = document.getElementById('images-div');
        const galleryGroup = document.getElementById('templateGalleryGroup');
        if (!gallery) return;

        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/templates`, { method: 'POST' });
            if (!response.ok) return;

            const data = await response.json();
            if (data && Array.isArray(data.urls) && data.urls.length > 0) {
                gallery.innerHTML = '';
                if (galleryGroup) galleryGroup.style.display = 'block';

                data.urls.forEach((item, index) => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'ps-template-item';
                    if (index === 0 && !state.activeLetterheadUrl) {
                        itemDiv.classList.add('is-selected');
                        state.activeLetterheadUrl = item.template;
                        state.activeLetterheadPublicId = item.public_id;
                        state.activeLetterheadId = item._id;
                    }

                    const img = document.createElement('img');
                    img.src = item.template;
                    img.alt = `Template ${index + 1}`;
                    img.loading = 'lazy';

                    const deleteBtn = document.createElement('div');
                    deleteBtn.className = 'ps-template-delete';
                    deleteBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                    deleteBtn.title = 'Delete Template';

                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (!confirm('Are you sure you want to delete this letterhead template?')) return;

                        try {
                            updateStatusIndicator('saving', 'Deleting template...');
                            const delRes = await fetch(`${BASE_URL}/api/v1/user/delete-image`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    templateId: item._id,
                                    url: item.template,
                                    public_id: item.public_id
                                })
                            });
                            if (delRes.ok) {
                                itemDiv.remove();
                                if (state.activeLetterheadUrl === item.template) {
                                    state.activeLetterheadUrl = '';
                                }
                                updateLiveCanvas();
                                showToast('Template deleted successfully.', 'success');
                            } else {
                                showToast('Failed to delete template.', 'error');
                            }
                        } catch (err) {
                            showToast('Error deleting template.', 'error');
                        } finally {
                            updateStatusIndicator('saved', 'Ready');
                        }
                    });

                    itemDiv.appendChild(img);
                    itemDiv.appendChild(deleteBtn);

                    itemDiv.addEventListener('click', () => {
                        document.querySelectorAll('.ps-template-item').forEach(el => el.classList.remove('is-selected'));
                        itemDiv.classList.add('is-selected');
                        state.activeLetterheadUrl = item.template;
                        state.activeLetterheadPublicId = item.public_id;
                        state.activeLetterheadId = item._id;

                        // Display in thumb box
                        const thumbBox = document.getElementById('letterheadThumbBox');
                        const thumbImg = document.getElementById('letterheadThumbImg');
                        const thumbName = document.getElementById('letterheadThumbName');
                        const thumbSize = document.getElementById('letterheadThumbSize');
                        if (thumbBox && thumbImg) {
                            thumbImg.src = item.template;
                            thumbName.textContent = `Template ${index + 1}`;
                            thumbSize.textContent = 'Saved Cloudinary Template';
                            thumbBox.style.display = 'flex';
                        }

                        setLetterheadMode('digital');
                        updateLiveCanvas();
                    });

                    gallery.appendChild(itemDiv);
                });
            } else {
                if (galleryGroup) galleryGroup.style.display = 'none';
            }
        } catch (error) {
            console.warn('Notice: Template gallery unavailable:', error.message);
        }
    }

    // --- OFFICIAL PDF COMPILATION & PREVIEW GENERATOR ---
    async function autogeneratingpdf(customOverrides = {}) {
        const iframe = document.getElementById('pdf-preview');
        const loader = document.getElementById('pdfIframeLoader');
        const bookingId = localStorage.getItem('myKey') || '';
        const withoutLetterhead = document.getElementById('check1')?.checked || false;

        const headermargin = customOverrides.headermargin ?? document.getElementById('header')?.value ?? '2.5';
        const footermargin = customOverrides.footermargin ?? document.getElementById('footer')?.value ?? '1.8';
        const marginRight = customOverrides.marginRight ?? document.getElementById('margin-right')?.value ?? '1.0';
        const marginLeft = customOverrides.marginLeft ?? document.getElementById('margin-left')?.value ?? '1.0';
        const LeftsignPd = customOverrides.LeftsignPd ?? document.getElementById('padding-left')?.value ?? '0.5';
        const Rightsignpd = customOverrides.Rightsignpd ?? document.getElementById('padding-right')?.value ?? '0.5';

        const selectedFontSize = customOverrides.selectedFontSize ?? document.getElementById('pdf-font-size')?.value ?? '11';
        const selectedFontFamily = customOverrides.selectedFontFamily ?? document.getElementById('pdf-font-family')?.value ?? 'Arial';
        const RowSpacing = customOverrides.RowSpacing ?? document.getElementById('spacing')?.value ?? '1';

        const HighLow = customOverrides.HighLow ?? document.getElementById('high-low-marker')?.checked ?? true;
        const HLinred = customOverrides.HLinred ?? document.getElementById('abnormal-results-red')?.checked ?? true;
        const BoldRow = customOverrides.BoldRow ?? document.getElementById('abnormal-results-bold')?.checked ?? true;
        const showInvest = customOverrides.showInvest ?? document.getElementById('show-investigations')?.checked ?? true;
        const hideCategories = customOverrides.hideCategories ?? document.getElementById('hide-categories')?.checked ?? false;
        const hideTableHeadings = customOverrides.hideTableHeadings ?? document.getElementById('hide-table-headings')?.checked ?? false;

        const showlab = document.getElementById('show-lab')?.checked ?? true;
        const showdoctorfirst = document.getElementById('show-doctor1')?.checked ?? true;
        const showdoctorsecond = document.getElementById('show-doctor2')?.checked ?? true;

        const labText = document.getElementById('lab-info')?.value || '';
        const doc1Text = document.getElementById('firstdoctor-info')?.value || '';
        const doc2Text = document.getElementById('seconddoctor-info')?.value || '';

        // Safe image URLs: only pass HTTP(S) links, omit Base64 data strings for lightweight transport
        const safeUrl = (url) => (url && url.startsWith('http')) ? url : '';
        const labImgUrl = safeUrl(state.labSignUrl);
        const doc1ImgUrl = safeUrl(state.doc1SignUrl);
        const doc2ImgUrl = safeUrl(state.doc2SignUrl);
        const bgUrl = withoutLetterhead ? '' : safeUrl(state.activeLetterheadUrl);

        // Build HTML footer for the PDF compiler
        const renderSlotHtml = (visible, img, text) => {
            if (!visible) return '<div style="min-width: 120px;"></div>';
            return `
                <div style="text-align: center; min-width: 120px; max-width: 220px;">
                    ${img ? `<img src="${img}" style="max-height: 44px; max-width: 140px; object-fit: contain;" />` : `<div style="height: 35px;"></div>`}
                    <div style="font-size: 10px; color: #1e293b; margin-top: 4px; white-space: pre-line; border-top: 1px solid #94a3b8; padding-top: 3px;">${text}</div>
                </div>`;
        };

        const footerHtml = `
            <div style="width: 100%; display: flex; justify-content: ${state.sigGlobalAlignment}; align-items: flex-end; padding-left: ${LeftsignPd}cm; padding-right: ${Rightsignpd}cm;">
                ${renderSlotHtml(showlab, labImgUrl, labText)}
                ${renderSlotHtml(showdoctorfirst, doc1ImgUrl, doc1Text)}
                ${renderSlotHtml(showdoctorsecond, doc2ImgUrl, doc2Text)}
            </div>`;

        const payload = {
            value1: bookingId,
            checkBox: withoutLetterhead,
            backgroundImageUrl: bgUrl,
            headermargin,
            footermargin,
            marginRight,
            marginLeft,
            LeftsignPd,
            Rightsignpd,
            selectedFontSize,
            selectedFontFamily,
            RowSpacing,
            HighLow,
            HLinred,
            BoldRow,
            showInvest,
            hideCategories,
            hideTableHeadings,
            showlab,
            showdoctorfirst,
            showdoctorsecond,
            fileInputLab: labImgUrl,
            fileInputDoctorleft: doc1ImgUrl,
            fileInputDoctorright: doc2ImgUrl,
            fileInputLabtext: labText,
            fileInputDoctorlefttext: doc1Text,
            fileInputDoctorrighttext: doc2Text,
            footer: footerHtml,
            persistCustomization: !!customOverrides.persistCustomization
        };

        try {
            if (loader) loader.style.display = 'flex';
            const res = await fetch(`${BASE_URL}/api/v1/user/get-pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('PDF Compiler failed to generate PDF.');

            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            if (iframe) {
                iframe.src = blobUrl;
            }
        } catch (err) {
            console.error('Error generating official PDF:', err);
        } finally {
            if (loader) loader.style.display = 'none';
        }
    }

    // --- FULL CONFIGURATION PERSISTENCE (SAVE ALL SETTINGS) ---
    async function saveAllSettings() {
        if (state.isSaving) return;
        state.isSaving = true;

        const saveBtn = document.getElementById('btnSaveAllSettings');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span class="ps-btn-text-full">Saving...</span><span class="ps-btn-text-short">Saving...</span>';
        }
        updateStatusIndicator('saving', 'Saving configurations...');

        try {
            // 1. Upload Pending Letterhead Template if any
            if (state.pendingTemplateFile) {
                const formData = new FormData();
                formData.append('template', state.pendingTemplateFile);
                formData.append('headermargin', document.getElementById('header')?.value || '2.5');
                formData.append('footermargin', document.getElementById('footer')?.value || '1.8');
                formData.append('marginRight', document.getElementById('margin-right')?.value || '1.0');
                formData.append('marginLeft', document.getElementById('margin-left')?.value || '1.0');

                const uploadRes = await fetch(`${BASE_URL}/api/v1/user/template`, {
                    method: 'POST',
                    body: formData
                });

                if (uploadRes.ok) {
                    const uploadResult = await uploadRes.json();
                    if (uploadResult.url) {
                        state.activeLetterheadUrl = uploadResult.url;
                    }
                    state.pendingTemplateFile = null;
                    await fetchTemplateGallery();
                } else {
                    throw new Error('Letterhead template upload failed.');
                }
            }

            // 2. Upload Pending Doctor Signatures or Info Updates
            const sigFormData = new FormData();
            if (state.pendingLabSignFile) sigFormData.append('labsign', state.pendingLabSignFile);
            if (state.pendingDoc1SignFile) sigFormData.append('firstdoctorsign', state.pendingDoc1SignFile);
            if (state.pendingDoc2SignFile) sigFormData.append('seconddoctorsign', state.pendingDoc2SignFile);

            sigFormData.append('labinchargeinfo', document.getElementById('lab-info')?.value || '');
            sigFormData.append('leftdoctorinfo', document.getElementById('firstdoctor-info')?.value || '');
            sigFormData.append('rightdoctorinfo', document.getElementById('seconddoctor-info')?.value || '');
            sigFormData.append('showlab', document.getElementById('show-lab')?.checked ?? true);
            sigFormData.append('showdoctorfirst', document.getElementById('show-doctor1')?.checked ?? true);
            sigFormData.append('showdoctorsecond', document.getElementById('show-doctor2')?.checked ?? true);
            sigFormData.append('LeftsignPd', document.getElementById('padding-left')?.value || '0.5');
            sigFormData.append('Rightsignpd', document.getElementById('padding-right')?.value || '0.5');

            const sigRes = await fetch(`${BASE_URL}/api/v1/user/uploadDoctorsSign`, {
                method: 'POST',
                body: sigFormData
            });

            if (sigRes.ok) {
                state.pendingLabSignFile = null;
                state.pendingDoc1SignFile = null;
                state.pendingDoc2SignFile = null;
                await fetchLabSignAndSetInputs();
            }

            // 3. Persist General PDF Customization Parameters
            await autogeneratingpdf({ persistCustomization: true });

            updateStatusIndicator('saved', 'All changes saved');
            showToast('All print settings, margins & signatures saved successfully!', 'success');
        } catch (error) {
            console.error('Save settings failure:', error);
            updateStatusIndicator('error', 'Error saving');
            showToast(`Save failed: ${error.message}`, 'error');
        } finally {
            state.isSaving = false;
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span class="ps-btn-text-full">Save Settings</span><span class="ps-btn-text-short">Save</span>';
            }
        }
    }

    // --- EVENT LISTENERS INITIALIZATION ---
    function bindInputListeners() {
        const liveInputs = [
            'header', 'footer', 'margin-left', 'margin-right', 'padding-left', 'padding-right',
            'pdf-font-family', 'pdf-font-size', 'spacing',
            'high-low-marker', 'abnormal-results-red', 'abnormal-results-bold',
            'show-investigations', 'hide-categories', 'hide-table-headings',
            'show-lab', 'show-doctor1', 'show-doctor2'
        ];

        liveInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    updateStatusIndicator('unsaved', 'Unsaved changes');
                    updateLiveCanvas();
                });
                el.addEventListener('change', () => {
                    updateStatusIndicator('unsaved', 'Unsaved changes');
                    updateLiveCanvas();
                });
            }
        });

        // Doctor designation textarea live binding
        ['lab-info', 'firstdoctor-info', 'seconddoctor-info'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    updateStatusIndicator('unsaved', 'Unsaved changes');
                    updateSignaturesLiveCanvas();
                });
            }
        });

        // Without Letterhead Checkbox
        document.getElementById('check1')?.addEventListener('change', (e) => {
            const overlay = document.getElementById('letterheadBgOverlay');
            if (overlay) {
                overlay.style.display = e.target.checked ? 'none' : (state.letterheadMode === 'digital' ? 'block' : 'none');
            }
            if (document.getElementById('pdfPreviewIframeBox')?.classList.contains('is-active')) {
                autogeneratingpdf();
            }
        });

        // Save Button
        document.getElementById('btnSaveAllSettings')?.addEventListener('click', saveAllSettings);

        // Legacy compatibility button clicks
        document.getElementById('uploadTemplate')?.addEventListener('click', saveAllSettings);
        document.getElementById('updateSign')?.addEventListener('click', saveAllSettings);
        document.getElementById('updateGeneral')?.addEventListener('click', saveAllSettings);
        document.getElementById('update-button')?.addEventListener('click', saveAllSettings);

        // Back / Close Navigation Button
        document.getElementById('close-btn')?.addEventListener('click', () => {
            const bookingId = localStorage.getItem('myKey') || '';
            const format = localStorage.getItem('pdfformat') || 'bill';
            window.location.href = `${BASE_URL}/admin/admin.html?page=${format}&value1=${bookingId}`;
        });

        // Window resize & orientation auto-fit
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                fitPreviewToWindow();
            }, 150);
        });

        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                fitPreviewToWindow();
            }, 250);
        });
    }

    // --- APPLICATION BOOTSTRAP ---
    async function init() {
        setupDragAndDrop();
        setupDeleteHandlers();
        bindInputListeners();

        // Load configuration and data from server
        await fetchDataAndSetInputs();
        await fetchLabSignAndSetInputs();
        await fetchTemplateGallery();

        // Calculate initial true-to-scale responsive preview
        fitPreviewToWindow();
        updateLiveCanvas();
        updateStatusIndicator('saved', 'Ready');
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
