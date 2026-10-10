async function allcases() {

    let BASE_URL = window.location.origin;
    const islayerone = user?.tenantId?.modelType === "1layer" || user?.role === "LAYER_1_ADMIN" || window.role === "admin1layer";
    const limit = 100;
    const filterIds = [
        "reg-no",
        "patient-name",
        "franchisee",
        "gender",
        "patient-phone",
        "barcode",
        "lab-name",
        "status",
        "start-date",
        "end-date"
    ];
    const currencyFormatter = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    // Safe DOM updates with null checks
    const labelForChange = document.getElementById('labelforchange');
    const tableColFour = document.getElementById('tablecolfour');
    const tableColFive = document.getElementById('tablecolfive');
    const layeredInput = document.getElementById('layeredinput');

    if (labelForChange) labelForChange.textContent = islayerone ? "Doctor" : "Franchisee";
    if (tableColFour) tableColFour.textContent = islayerone ? "Doctor" : "Franchisee";
    if (tableColFive) tableColFive.textContent = islayerone ? "Amount" : "Received Barcodes";
    if (layeredInput) layeredInput.style.display = islayerone ? "none" : "";

    let currentPage = 1;
    let totalPages = 1;
    let intervalId;
    let filterDebounceTimer;

    // Clean up any stale invoice modal on body from prior page view
    const staleModal = document.querySelector("body > #invoiceCustomizerModal");
    const containerModal = document.querySelector(".container-allcases #invoiceCustomizerModal");
    if (staleModal && containerModal && staleModal !== containerModal) {
        staleModal.remove();
    }

    // Global variables for popup with null checks
    const popup = document.getElementById("messagePopup");
    const overlay = document.getElementById("popupOverlay");
    const sendMessageBtn = document.getElementById("sendMessage");
    const closePopupBtn = document.getElementById("closePopup");
    const messagesDiv = document.getElementById("messages");

    function showLoader() {
        const loader = document.querySelector(".loader");
        if (loader) {
            loader.style.display = "flex";
        }
    }

    function hideLoader() {
        const loader = document.querySelector(".loader");
        if (loader) {
            loader.style.display = "none";
        }
    }

    // ============================================================
    // REPORT DOWNLOAD & MERGE FUNCTIONALITY
    // ============================================================
    const DOWNLOAD_ELIGIBLE_STATUSES = ['completed', 'partially completed', 'partial completed', 'partial', 'partially ready'];
    const LETTERHEAD_STORAGE_KEY = 'allReportsLetterheadPreference';
    let isBulkDownloading = false;
    let cancelBulkDownload = false;

    function showAppToast(message, type = "success") {
        const existing = document.querySelectorAll(".app-toast");
        existing.forEach(t => t.remove());
        const toast = document.createElement("div");
        toast.className = `app-toast ${type}`;
        const icon = type === "error" ? "fa-circle-exclamation" : (type === "info" ? "fa-circle-info" : "fa-circle-check");
        toast.innerHTML = `<i class="fas ${icon}" style="margin-right: 8px;"></i><span>${escapeHtml(message)}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.transition = "opacity 0.3s ease, transform 0.3s ease";
            toast.style.opacity = "0";
            toast.style.transform = "translateY(-10px)";
            setTimeout(() => toast.remove(), 350);
        }, 3600);
    }

    // Premium Industry-Level Report Download Buffer
    const ReportDownloadBuffer = {
        overlay: null,
        titleEl: null,
        metaEl: null,
        bookingTag: null,
        bookingIdEl: null,
        patientTag: null,
        patientNameEl: null,
        statusTextEl: null,
        barEl: null,
        countTextEl: null,
        percentTextEl: null,
        cancelBtn: null,
        cancelHandler: null,
        autoHideTimeout: null,

        init() {
            this.overlay = document.getElementById("reportDownloadOverlay");
            if (!this.overlay) return;
            this.titleEl = document.getElementById("reportBufferTitle");
            this.metaEl = document.getElementById("reportBufferMeta");
            this.bookingTag = document.getElementById("reportBufferBookingTag");
            this.bookingIdEl = document.getElementById("reportBufferBookingId");
            this.patientTag = document.getElementById("reportBufferPatientTag");
            this.patientNameEl = document.getElementById("reportBufferPatientName");
            this.statusTextEl = document.getElementById("reportBufferStatusText");
            this.barEl = document.getElementById("reportBufferBar");
            this.countTextEl = document.getElementById("reportBufferCountText");
            this.percentTextEl = document.getElementById("reportBufferPercentText");
            this.cancelBtn = document.getElementById("reportBufferCancelBtn");

            if (this.cancelBtn) {
                this.cancelBtn.onclick = (e) => {
                    e.preventDefault();
                    if (typeof this.cancelHandler === 'function') {
                        this.cancelHandler();
                    }
                };
            }
        },

        show({ title = 'Generating Clinical Report', bookingId = '', patientName = '', status = 'Fetching patient diagnostics...', percent = null, total = null, current = null, canCancel = false, onCancel = null } = {}) {
            if (this.autoHideTimeout) {
                clearTimeout(this.autoHideTimeout);
                this.autoHideTimeout = null;
            }
            if (!this.overlay) this.init();
            if (!this.overlay) return;

            this.cancelHandler = onCancel;
            if (this.titleEl) this.titleEl.textContent = title;

            let hasMeta = false;
            if (this.bookingTag && this.bookingIdEl) {
                if (bookingId) {
                    this.bookingIdEl.textContent = bookingId;
                    this.bookingTag.style.display = "inline-flex";
                    hasMeta = true;
                } else {
                    this.bookingTag.style.display = "none";
                }
            }
            if (this.patientTag && this.patientNameEl) {
                if (patientName) {
                    this.patientNameEl.textContent = patientName;
                    this.patientTag.style.display = "inline-flex";
                    hasMeta = true;
                } else {
                    this.patientTag.style.display = "none";
                }
            }
            if (this.metaEl) this.metaEl.style.display = hasMeta ? "inline-flex" : "none";

            this.update({ status, percent, total, current });

            if (this.cancelBtn) {
                this.cancelBtn.style.display = canCancel ? "inline-flex" : "none";
                this.cancelBtn.innerHTML = '<i class="fas fa-circle-stop"></i> Cancel Download';
                this.cancelBtn.disabled = false;
            }

            this.overlay.style.display = "flex";
            void this.overlay.offsetWidth;
            this.overlay.classList.add("is-visible");
        },

        update({ title, bookingId, patientName, status, percent = null, total = null, current = null } = {}) {
            if (!this.overlay) return;
            if (title && this.titleEl) this.titleEl.textContent = title;
            if (bookingId && this.bookingIdEl) this.bookingIdEl.textContent = bookingId;
            if (patientName && this.patientNameEl) this.patientNameEl.textContent = patientName;
            if (status && this.statusTextEl) this.statusTextEl.textContent = status;

            if (this.barEl) {
                if (typeof percent === 'number' && !isNaN(percent)) {
                    this.barEl.classList.remove('indeterminate');
                    this.barEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;
                    if (this.percentTextEl) this.percentTextEl.textContent = `${Math.round(percent)}%`;
                } else {
                    this.barEl.classList.add('indeterminate');
                    this.barEl.style.width = '45%';
                    if (this.percentTextEl) this.percentTextEl.textContent = '';
                }
            }

            if (this.countTextEl) {
                if (typeof current === 'number' && typeof total === 'number' && total > 0) {
                    this.countTextEl.textContent = `Processing ${current} of ${total}...`;
                } else {
                    this.countTextEl.textContent = 'Please wait...';
                }
            }
        },

        hide(delay = 300) {
            if (!this.overlay) return;
            if (this.autoHideTimeout) clearTimeout(this.autoHideTimeout);
            this.autoHideTimeout = setTimeout(() => {
                if (this.overlay) {
                    this.overlay.classList.remove("is-visible");
                    setTimeout(() => {
                        if (this.overlay && !this.overlay.classList.contains("is-visible")) {
                            this.overlay.style.display = "none";
                        }
                    }, 260);
                }
            }, delay);
        }
    };

    function isDownloadEligible(status) {
        const s = String(status || '').trim().toLowerCase();
        return DOWNLOAD_ELIGIBLE_STATUSES.includes(s);
    }

    function getLetterheadPreference() {
        try {
            const saved = localStorage.getItem(LETTERHEAD_STORAGE_KEY);
            if (saved === 'with' || saved === 'without') return saved;
        } catch (e) { }
        return 'without';
    }

    function setLetterheadPreference(value) {
        const safeValue = value === 'with' ? 'with' : 'without';
        try {
            localStorage.setItem(LETTERHEAD_STORAGE_KEY, safeValue);
        } catch (e) { }
        syncLetterheadUI(safeValue);
    }

    function syncLetterheadUI(value) {
        const seg = document.getElementById('allcases-letterhead-seg');
        if (!seg) return;
        seg.querySelectorAll('.seg-option').forEach(btn => {
            const active = btn.getAttribute('data-value') === value;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function getReportFilename(patientName, bookingId) {
        let cleanName = String(patientName || '')
            .normalize('NFKC')
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[. ]+$/g, '');

        if (!cleanName || cleanName === '-' || cleanName.toUpperCase() === 'N/A' || cleanName.toUpperCase() === 'UNDEFINED') {
            cleanName = bookingId ? `Report_${bookingId}` : 'Report';
        }
        return `${cleanName}.pdf`;
    }

    async function fetchReportData(value1) {
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/ReportData`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ value1 })
            });
            if (!response.ok) throw new Error('Failed to fetch report data');
            return await response.json();
        } catch (error) {
            console.error('Error fetching report:', error);
            return null;
        }
    }

    async function autogeneratingpdf({ value1 = '', startDate = '', patientname, bookingId = '', skipLoader = true } = {}) {
        try {
            if (!skipLoader) showLoader();

            const response = await fetch(`${BASE_URL}/api/v1/user/get-pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    value1,
                    checkBox: startDate === 'with' ? false : true,
                    bookingId,
                    auditAction: 'DOWNLOAD'
                })
            });

            if (!response.ok) throw new Error('PDF generation failed');

            const pdfBlob = await response.blob();
            const pdfUrl = URL.createObjectURL(pdfBlob);

            const link = document.createElement('a');
            link.href = pdfUrl;
            link.download = getReportFilename(patientname, bookingId);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(pdfUrl), 500);

            try {
                if (bookingId && window.ReportPrintAudit && typeof window.ReportPrintAudit.updateBadges === 'function') {
                    window.ReportPrintAudit.updateBadges(bookingId, { isPrinted: true });
                }
            } catch (e) { /* ignore */ }

            return true;
        } catch (error) {
            console.error('Error generating PDF:', error);
            return false;
        } finally {
            if (!skipLoader) hideLoader();
        }
    }

    // Single report download triggered by clicking Booking ID badge
    async function downloadSingleReport(badgeElement) {
        if (!badgeElement || badgeElement.classList.contains('is-loading')) return;

        const row = badgeElement.closest('tr');
        const bookingId = badgeElement.getAttribute('data-booking-id') || (row ? row.getAttribute('data-booking-id') : '') || badgeElement.textContent.trim();
        const rowStatus = badgeElement.getAttribute('data-status') || (row ? row.getAttribute('data-status') : '');

        // Check eligibility
        if (!isDownloadEligible(rowStatus)) {
            showAppToast('Download not available: Only Completed and Partially Completed reports can be downloaded.', 'error');
            return;
        }

        const patientName = badgeElement.getAttribute('data-patient-name') || (row ? row.getAttribute('data-patient-name') : '');
        const originalHTML = badgeElement.innerHTML;
        badgeElement.classList.add('is-loading');
        badgeElement.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Generating...</span>`;

        ReportDownloadBuffer.show({
            title: 'Generating Clinical Report',
            bookingId: bookingId,
            patientName: patientName,
            status: 'Fetching patient diagnostics & test data...',
            percent: 25
        });

        try {
            const patientDetails = await fetchReportData(bookingId);
            if (!patientDetails || !patientDetails._id) {
                throw new Error('No report data returned for this booking.');
            }

            const resolvedPatientName = patientDetails.patientName || patientDetails.PatientName || patientName || ('Report_' + bookingId);
            const letterPadOption = getLetterheadPreference();

            ReportDownloadBuffer.update({
                patientName: resolvedPatientName,
                status: 'Applying letterhead, digital signatures & generating PDF...',
                percent: 70
            });

            const success = await autogeneratingpdf({
                value1: patientDetails._id,
                bookingId: bookingId,
                startDate: letterPadOption,
                patientname: resolvedPatientName,
                skipLoader: true
            });

            if (!success) throw new Error('PDF generation failed on server.');

            ReportDownloadBuffer.update({
                status: 'Report ready! Saving to your downloads...',
                percent: 100
            });
            ReportDownloadBuffer.hide(500);

            showAppToast(`Report downloaded successfully for ${resolvedPatientName}!`, 'success');
        } catch (error) {
            console.error(`Error downloading report for booking ${bookingId}:`, error);
            ReportDownloadBuffer.hide(100);
            showAppToast(`Download failed for booking ${bookingId}. Please try again.`, 'error');
        } finally {
            badgeElement.classList.remove('is-loading');
            badgeElement.innerHTML = originalHTML;
        }
    }

    async function downloadReportForBooking(bookingId, patientName, skipLoader = true) {
        try {
            const patientDetails = await fetchReportData(bookingId);
            const letterPadOption = getLetterheadPreference();

            if (!patientDetails || !patientDetails._id) {
                console.error('Could not find report data for', bookingId);
                showAppToast(`Report data not found for booking ${bookingId}`, 'error');
                return false;
            }

            const resolvedPatientName = patientDetails.patientName || patientDetails.PatientName || patientName || ('Report_' + bookingId);

            return await autogeneratingpdf({
                value1: patientDetails._id,
                bookingId: bookingId,
                startDate: letterPadOption,
                patientname: resolvedPatientName,
                skipLoader: skipLoader
            });
        } catch (error) {
            console.error(`Error downloading report for booking ${bookingId}:`, error);
            return false;
        }
    }

    function setBulkDownloadBtnState(iconClass, labelText) {
        const downloadBtn = document.getElementById('downloadSelectedCases');
        if (!downloadBtn) return;
        const icon = downloadBtn.querySelector('i');
        const label = document.getElementById('downloadSelectedCasesLabel');
        if (icon) icon.className = iconClass;
        if (label) label.textContent = labelText;
    }

    async function downloadSelectedReports() {
        const downloadBtn = document.getElementById('downloadSelectedCases');
        if (!downloadBtn) return;

        // If currently downloading, toggle cancel
        if (isBulkDownloading) {
            cancelBulkDownload = true;
            setBulkDownloadBtnState('fas fa-spinner fa-spin', 'Stopping...');
            ReportDownloadBuffer.update({ status: 'Stopping download after current report...' });
            return;
        }

        const checkedBoxes = document.querySelectorAll('#tbody .case-checkbox:checked');
        if (!checkedBoxes.length) {
            showAppToast('Please select at least one booking to download.', 'error');
            return;
        }

        const itemsToDownload = Array.from(checkedBoxes).map(cb => {
            const row = cb.closest('tr');
            const badge = row ? row.querySelector('.booking-id-badge') : null;
            return {
                bookingId: cb.getAttribute('data-booking-id') || (badge ? badge.getAttribute('data-booking-id') : ''),
                patientName: badge ? badge.getAttribute('data-patient-name') : '',
                status: row ? row.getAttribute('data-status') : ''
            };
        }).filter(item => item.bookingId && isDownloadEligible(item.status));

        if (!itemsToDownload.length) {
            showAppToast('None of the selected bookings are eligible for download. Only Completed and Partially Completed reports can be downloaded.', 'error');
            return;
        }

        isBulkDownloading = true;
        cancelBulkDownload = false;
        downloadBtn.classList.add('is-downloading');
        setBulkDownloadBtnState('fas fa-stop', `Stop Download (0/${itemsToDownload.length})`);

        ReportDownloadBuffer.show({
            title: 'Downloading Selected Reports',
            total: itemsToDownload.length,
            current: 1,
            percent: 5,
            status: `Starting download of ${itemsToDownload.length} report(s)...`,
            canCancel: true,
            onCancel: () => {
                cancelBulkDownload = true;
                ReportDownloadBuffer.update({ status: 'Stopping download...' });
            }
        });

        try {
            for (let i = 0; i < itemsToDownload.length; i++) {
                if (cancelBulkDownload) {
                    showAppToast('Download stopped by user.', 'info');
                    break;
                }

                const item = itemsToDownload[i];
                const pct = Math.round(((i) / itemsToDownload.length) * 100);

                setBulkDownloadBtnState('fas fa-spinner fa-spin', `Downloading (${i + 1}/${itemsToDownload.length})… Click to Stop`);
                ReportDownloadBuffer.update({
                    bookingId: item.bookingId,
                    patientName: item.patientName,
                    current: i + 1,
                    total: itemsToDownload.length,
                    percent: Math.max(10, pct),
                    status: `Downloading (${i + 1}/${itemsToDownload.length}): ${item.patientName || item.bookingId}...`
                });

                await downloadReportForBooking(item.bookingId, item.patientName, true);
            }

            if (!cancelBulkDownload) {
                ReportDownloadBuffer.update({
                    percent: 100,
                    status: `All ${itemsToDownload.length} report(s) downloaded successfully!`
                });
                ReportDownloadBuffer.hide(600);
                showAppToast(`All ${itemsToDownload.length} report(s) downloaded successfully!`, 'success');
            } else {
                ReportDownloadBuffer.hide(300);
            }
        } finally {
            ReportDownloadBuffer.hide(300);
            isBulkDownloading = false;
            cancelBulkDownload = false;
            downloadBtn.classList.remove('is-downloading');
            setBulkDownloadBtnState('fas fa-download', 'Download Selected');
            updateCasesSelectionState();
        }
    }

    async function mergeSelectedReports() {
        const checkedBoxes = document.querySelectorAll('#tbody .case-checkbox:checked');
        const selectedItems = Array.from(checkedBoxes).map(cb => {
            const row = cb.closest('tr');
            const badge = row ? row.querySelector('.booking-id-badge') : null;
            return {
                bookingId: cb.getAttribute('data-booking-id') || (badge ? badge.getAttribute('data-booking-id') : ''),
                status: row ? row.getAttribute('data-status') : ''
            };
        }).filter(item => item.bookingId && isDownloadEligible(item.status));

        if (selectedItems.length < 2) {
            showAppToast('Please select at least two eligible bookings to merge.', 'error');
            return;
        }

        ReportDownloadBuffer.show({
            title: 'Merging Clinical Reports',
            total: selectedItems.length,
            current: 1,
            percent: 15,
            status: `Preparing to merge ${selectedItems.length} reports into unified PDF...`
        });

        try {
            const reportIds = [];
            for (let i = 0; i < selectedItems.length; i++) {
                const item = selectedItems[i];
                ReportDownloadBuffer.update({
                    current: i + 1,
                    total: selectedItems.length,
                    percent: Math.round(15 + (i / selectedItems.length) * 45),
                    status: `Fetching report ${i + 1} of ${selectedItems.length} (${item.bookingId})...`
                });
                const patientDetails = await fetchReportData(item.bookingId);
                if (patientDetails && patientDetails._id) {
                    reportIds.push(patientDetails._id);
                }
            }

            if (reportIds.length < 2) {
                throw new Error('Not enough valid reports available to merge.');
            }

            ReportDownloadBuffer.update({
                percent: 75,
                status: `Merging ${reportIds.length} reports into unified PDF...`
            });

            const letterPadOption = getLetterheadPreference();
            const response = await fetch(`${BASE_URL}/api/v1/user/merge-pdfs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    reportIds: reportIds,
                    checkBox: letterPadOption === 'with' ? false : true
                })
            });

            if (!response.ok) throw new Error('PDF merge failed on server');

            ReportDownloadBuffer.update({
                percent: 95,
                status: 'Assembling merged PDF file...'
            });

            const pdfBlob = await response.blob();
            const pdfUrl = URL.createObjectURL(pdfBlob);

            const link = document.createElement('a');
            link.href = pdfUrl;
            link.download = `Merged_Reports_${Date.now()}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(pdfUrl), 500);

            ReportDownloadBuffer.update({
                percent: 100,
                status: `Successfully merged ${reportIds.length} reports!`
            });
            ReportDownloadBuffer.hide(600);

            showAppToast(`Successfully merged ${reportIds.length} reports!`, 'success');
        } catch (error) {
            console.error('Error merging reports:', error);
            ReportDownloadBuffer.hide(200);
            showAppToast('Merge failed. Please try again.', 'error');
        }
    }

    function updateCasesSelectionState() {
        const checkedBoxes = document.querySelectorAll('#tbody .case-checkbox:checked');
        const allEnabledBoxes = document.querySelectorAll('#tbody .case-checkbox:not(:disabled)');
        const selectAllCheckbox = document.getElementById('selectAllCases');
        const selectedCount = checkedBoxes.length;

        // Update select all checkbox
        if (selectAllCheckbox) {
            if (allEnabledBoxes.length === 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
                selectAllCheckbox.disabled = true;
            } else {
                selectAllCheckbox.disabled = false;
                if (selectedCount === 0) {
                    selectAllCheckbox.checked = false;
                    selectAllCheckbox.indeterminate = false;
                } else if (selectedCount === allEnabledBoxes.length) {
                    selectAllCheckbox.checked = true;
                    selectAllCheckbox.indeterminate = false;
                } else {
                    selectAllCheckbox.checked = false;
                    selectAllCheckbox.indeterminate = true;
                }
            }
        }

        // Update selection count badge
        const countBadge = document.getElementById('casesSelectedCount');
        const countNum = document.getElementById('casesSelectedNum');
        if (countBadge && countNum) {
            if (selectedCount > 0) {
                countBadge.style.display = 'inline-flex';
                countNum.textContent = selectedCount;
            } else {
                countBadge.style.display = 'none';
            }
        }

        // Update Download button label
        const downloadLabel = document.getElementById('downloadSelectedCasesLabel');
        if (downloadLabel && !isBulkDownloading) {
            downloadLabel.textContent = selectedCount > 0 ? `Download Selected (${selectedCount})` : 'Download Selected';
        }

        // Update Merge button visibility (visible when 2 or more selected)
        const mergeBtn = document.getElementById('mergeSelectedCases');
        const mergeLabel = document.getElementById('mergeSelectedCasesLabel');
        if (mergeBtn) {
            if (selectedCount >= 2) {
                mergeBtn.style.display = 'inline-flex';
                if (mergeLabel) mergeLabel.textContent = `Merge Reports (${selectedCount})`;
            } else {
                mergeBtn.style.display = 'none';
            }
        }
    }

    function openEditBookingPage(booking, row) {
        saveBookingToLocalStorage(booking, row);
        loadPage('editbooking', booking.bookingId, booking._id);
    }

    function getFilterElements() {
        return {
            regNo: document.getElementById("reg-no"),
            patientName: document.getElementById("patient-name"),
            gender: document.getElementById("gender"),
            patientPhone: document.getElementById("patient-phone"),
            labName: document.getElementById("lab-name"),
            status: document.getElementById("status"),
            franchisee: document.getElementById("franchisee"),
            barcode: document.getElementById("barcode"),
            startDate: document.getElementById("start-date"),
            endDate: document.getElementById("end-date")
        };
    }

    function setTableState(message, className = "table-state-row") {
        const tableBody = document.getElementById("tbody");
        if (!tableBody) return;

        const columnCount = document.querySelectorAll("#bookings-table thead th").length || 7;
        tableBody.innerHTML = `<tr class="${className}"><td colspan="${columnCount}">${message}</td></tr>`;
    }

    function setSearchLoadingState(isLoading) {
        const searchBtn = document.getElementById("search-btn");
        const table = document.getElementById("bookings-table");
        if (searchBtn) {
            searchBtn.disabled = isLoading;
            searchBtn.textContent = isLoading ? "Searching..." : "Search";
        }
        if (table) {
            table.setAttribute("aria-busy", String(isLoading));
        }
    }

    function resetFilters() {
        const elements = getFilterElements();
        Object.values(elements).forEach((element) => {
            if (element) {
                element.value = "";
            }
        });
    }

    function validateDateRange(showAlert = true) {
        const { startDate, endDate } = getFilterElements();

        if (!startDate || !endDate) return true;

        if (startDate.value && endDate.value && new Date(startDate.value) > new Date(endDate.value)) {
            if (showAlert) {
                alert("Start date cannot be greater than End date");
            }
            return false;
        }

        return true;
    }

    function buildFilters() {
        const elements = getFilterElements();
        const doctorOrFranchiseeValue = elements.franchisee?.value.trim() || "";

        return {
            regNo: elements.regNo?.value.trim() || "",
            patientName: elements.patientName?.value.trim() || "",
            gender: elements.gender?.value.trim() || "",
            patientPhone: elements.patientPhone?.value.trim() || "",
            labName: elements.labName?.value.trim() || "",
            status: elements.status?.value.trim() || "",
            franchisee: islayerone ? "" : doctorOrFranchiseeValue,
            doctorName: islayerone ? doctorOrFranchiseeValue : "",
            barcode: elements.barcode?.value.trim() || "",
            startDate: elements.startDate?.value || "",
            endDate: elements.endDate?.value || ""
        };
    }

    function triggerSearch(page = 1, debounceMs = 0) {
        if (filterDebounceTimer) {
            clearTimeout(filterDebounceTimer);
        }

        if (debounceMs > 0) {
            filterDebounceTimer = setTimeout(() => {
                fetchBookings(page);
            }, debounceMs);
            return;
        }

        fetchBookings(page);
    }

    async function fetchBookings(page = 1) {
        currentPage = page;

        if (!validateDateRange()) {
            return;
        }

        const filters = buildFilters();

        try {
            setSearchLoadingState(true);
            setTableState("Loading bookings...", "table-state-row loading-state");
            showLoader();

            const response = await fetch(`${BASE_URL}/api/v1/user/get-bookings?page=${page}&limit=${limit}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(filters)
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(result.message || "Failed to fetch bookings");
            }

            const bookings = Array.isArray(result.bookings) ? result.bookings : [];
            const total = Number(result.total) || 0;
            totalPages = Math.max(1, Math.ceil(total / limit));

            const totalBookingsEl = document.getElementById("totalbookings");
            const totalBarcodesEl = document.getElementById("totalbarcodes");
            const pageCounterEl = document.getElementById("pagecounter");

            if (totalBookingsEl) totalBookingsEl.innerText = `Total bookings received : ${total}`;
            if (pageCounterEl) pageCounterEl.innerHTML = `Page ${currentPage} of ${totalPages}`;
            if (totalBarcodesEl) {
                const barcodeCount = islayerone
                    ? ""
                    : `Barcodes in current view : ${bookings.reduce((count, booking) => {
                        if (Array.isArray(booking.barcodeDetails) && booking.barcodeDetails.length > 0) {
                            return count + booking.barcodeDetails.length;
                        }
                        if (Array.isArray(booking.acceptedbarcode)) {
                            return count + booking.acceptedbarcode.length;
                        }
                        return count;
                    }, 0)}`;
                totalBarcodesEl.innerText = barcodeCount;
            }

            displayBookings(bookings);
            updateCasesSelectionState();
        } catch (error) {
            console.error("Error fetching bookings:", error);
            totalPages = 1;

            const totalBookingsEl = document.getElementById("totalbookings");
            const totalBarcodesEl = document.getElementById("totalbarcodes");
            const pageCounterEl = document.getElementById("pagecounter");

            if (totalBookingsEl) totalBookingsEl.innerText = "Total bookings received : 0";
            if (totalBarcodesEl) totalBarcodesEl.innerText = "";
            if (pageCounterEl) pageCounterEl.innerHTML = "Page 1 of 1";

            setTableState(error.message || "Unable to load bookings right now.", "table-state-row error-state");
            updateCasesSelectionState();
        } finally {
            hideLoader();
            setSearchLoadingState(false);
        }
    }

    function formatBookingDateTime(dateStr, timeStr) {
        const date = new Date(dateStr);

        if (Number.isNaN(date.getTime())) {
            return timeStr ? `${dateStr}, ${timeStr}` : (dateStr || "--");
        }

        const formattedDate = date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });

        const hasEmbeddedTime = typeof dateStr === "string" && /T\d{2}:\d{2}/.test(dateStr);

        if (!timeStr && !hasEmbeddedTime) {
            return formattedDate;
        }

        const formattedTime = timeStr
            ? (() => {
                const time = new Date(`1970-01-01T${timeStr}`);
                return Number.isNaN(time.getTime())
                    ? timeStr
                    : time.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true
                    });
            })()
            : date.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true
            });

        return `${formattedDate}, ${formattedTime}`;
    }

    function formatAmount(amount) {
        return currencyFormatter.format(Number(amount) || 0);
    }

    
    // Floating Portal Popover Management (outside table container so it never clips)
    function closeDropdown() {
        const existing = document.getElementById("allcases-dropdown-popover");
        if (existing) {
            if (existing._trigger) {
                existing._trigger.classList.remove("is-active");
                existing._trigger.setAttribute("aria-expanded", "false");
            }
            existing.remove();
        }
    }

    function positionPopover(popover, triggerBtn, row) {
        if (!popover || !triggerBtn) return;

        const triggerRect = triggerBtn.getBoundingClientRect();
        const menuWidth = popover.offsetWidth;
        const menuHeight = popover.offsetHeight;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        const spaceBelow = viewportHeight - triggerRect.bottom;
        const spaceAbove = triggerRect.top;

        // Is this one of the bottom rows of the table?
        const isLastRow = row ? !row.nextElementSibling : false;
        const isSecondLastRow = row && row.nextElementSibling ? !row.nextElementSibling.nextElementSibling : false;

        // Intelligent placement: flip upwards (dropup) for last rows or if space below is limited
        let openUpwards = false;
        if (spaceBelow < menuHeight + 10) {
            openUpwards = spaceAbove >= menuHeight || spaceAbove > spaceBelow;
        } else if ((isLastRow || isSecondLastRow) && spaceAbove >= menuHeight + 10) {
            openUpwards = true;
        }

        let top;
        let maxHeight = Math.min(380, viewportHeight - 20);

        if (openUpwards) {
            top = triggerRect.top - menuHeight - 4;
            if (top < 10) {
                top = 10;
                maxHeight = Math.max(120, triggerRect.top - 16);
            }
            popover.classList.add("dropup");
            popover.classList.remove("dropdown");
        } else {
            top = triggerRect.bottom + 4;
            if (top + menuHeight > viewportHeight - 10) {
                maxHeight = Math.max(120, viewportHeight - top - 10);
            }
            popover.classList.add("dropdown");
            popover.classList.remove("dropup");
        }

        // Align the popup right next to the three-dots button (right-aligned to trigger button)
        let left = triggerRect.right - menuWidth;

        // If aligning right overflows left viewport, align to trigger's left edge
        if (left < 10) {
            left = triggerRect.left;
        }

        // Ensure popover always stays fully visible inside viewport
        if (left + menuWidth > viewportWidth - 10) {
            left = Math.max(10, viewportWidth - menuWidth - 10);
        }
        if (left < 10) {
            left = 10;
        }

        popover.style.maxHeight = `${Math.round(maxHeight)}px`;
        popover.style.top = `${Math.round(top)}px`;
        popover.style.left = `${Math.round(left)}px`;
    }

    function openDropdownMenu(triggerBtn, row, booking) {
        if (!triggerBtn || !row) return;

        const currentPopover = document.getElementById("allcases-dropdown-popover");
        if (currentPopover && currentPopover._trigger === triggerBtn) {
            closeDropdown();
            return;
        }

        closeDropdown();

        triggerBtn.classList.add("is-active");
        triggerBtn.setAttribute("aria-expanded", "true");

        const bookingId = row.getAttribute("data-booking-id");
        const isReportReady = booking ? booking.isreportready : false;
        const isEligibleForDownload = isDownloadEligible(booking?.status);

        const cancelAction = isReportReady
            ? ""
            : `<button type="button" class="action-btn cancel-btn" data-action="cancel"><i class="fa-solid fa-rectangle-xmark"></i><span>Cancel</span></button>`;

        const downloadAction = isEligibleForDownload
            ? `<button type="button" class="action-btn download-report-btn is-pdf-action" data-action="download-report">
                <i class="fa-solid fa-file-arrow-down"></i>
                <span>Download Report</span>
                <span class="pdf-badge">PDF</span>
            </button>`
            : "";

        const popover = document.createElement("div");
        popover.id = "allcases-dropdown-popover";
        popover.className = "allcases-dropdown-menu allcases-floating-popover";
        popover._trigger = triggerBtn;
        popover._row = row;
        popover.dataset.bookingId = bookingId;

        popover.innerHTML = `
            <button type="button" class="action-btn generate-bill-btn is-pdf-action" data-action="generate-bill">
                <i class="fa-solid fa-file-invoice"></i>
                <span>Generate Bill</span>
                <span class="pdf-badge">PDF</span>
            </button>
            <button type="button" class="action-btn generate-trf-btn is-pdf-action" data-action="generate-trf">
                <i class="fa-solid fa-receipt"></i>
                <span>Generate TRF</span>
                <span class="pdf-badge">PDF</span>
            </button>
            ${downloadAction}
            <div class="dropdown-divider"></div>
            <button type="button" class="action-btn edit-booking" data-action="edit-booking">
                <i class="fa-solid fa-file-pen"></i>
                <span>Edit Booking</span>
            </button>
            <button type="button" class="action-btn hold-btn" data-action="hold">
                <i class="fa-solid fa-hands-holding"></i>
                <span>Hold</span>
            </button>
            <button type="button" class="action-btn clinical-btn" data-action="clinical">
                <i class="fa-solid fa-house-chimney-medical"></i>
                <span>Clinical</span>
            </button>
            ${cancelAction}
        `;

        document.body.appendChild(popover);
        positionPopover(popover, triggerBtn, row);

        popover.addEventListener("click", async (ev) => {
            const item = ev.target.closest("[data-action]");
            if (!item) return;
            ev.preventDefault();
            ev.stopPropagation();

            const action = item.getAttribute("data-action");
            closeDropdown();
            const createdBy = row.getAttribute("data-created-by") || booking?.createdBy;

            if (action === "download-report") {
                const badge = row.querySelector(".booking-id-badge");
                if (badge) {
                    await downloadSingleReport(badge);
                }
            } else if (action === "generate-bill") {
                openInvoiceCustomizerModal(booking);
            } else if (action === "generate-trf") {
                handleGenerateTRF(bookingId);
            } else if (action === "edit-booking") {
                openEditBookingPage(booking, row);
            } else if (action === "hold") {
                await handleHoldBooking(bookingId, createdBy);
            } else if (action === "clinical") {
                await handleClinicalBooking(bookingId, createdBy);
            } else if (action === "cancel") {
                await handleCancelBooking(bookingId, createdBy);
            }
        });
    }

    function buildBarcodeHtml(booking) {
        if (Array.isArray(booking.barcodeDetails) && booking.barcodeDetails.length > 0) {
            return booking.barcodeDetails.map((detail) => {
                const icon = detail.isLisPresent
                    ? '<i class="fa-solid fa-circle-check barcode-icon barcode-icon-success"></i>'
                    : '<i class="fa-solid fa-circle-xmark barcode-icon barcode-icon-failed"></i>';

                return `<span class="barcode-pill" title="${detail.isLisPresent ? "LIS data available" : "LIS data not available"}">${icon}${detail.barcode}</span>`;
            }).join("");
        }

        if (Array.isArray(booking.acceptedbarcode) && booking.acceptedbarcode.length > 0) {
            return booking.acceptedbarcode
                .map((barcode) => `<span class="barcode-pill" title="${barcode}">${barcode}</span>`)
                .join("");
        }

        return '<span class="barcode-empty">No barcode</span>';
    }

    function buildActionCell(booking) {
        const primaryAction = `<a data-page="labreport" class="case-action-btn case-action-primary view-bill"><i class="fa-solid fa-flask-vial"></i><span>Enter Result</span></a>`;
        const secondaryAction = booking.isreportready
            ? `<a data-page="reportFormat" class="case-action-btn case-action-secondary edit-report"><i class="fa-solid fa-file-lines"></i><span>View Report</span></a>`
            : "";

        return `
            <div class="case-action-group">
                ${primaryAction}
                ${secondaryAction}
                <button type="button" class="more-options" title="More Actions" aria-label="More Actions" aria-haspopup="true" aria-expanded="false">
                    <i class="fas fa-ellipsis-h"></i>
                </button>
            </div>
        `;
    }

    function displayBookings(bookings) {
        const tableBody = document.getElementById("tbody");
        if (!tableBody) return;

        tableBody.innerHTML = "";

        if (!Array.isArray(bookings) || bookings.length === 0) {
            setTableState("No bookings found for selected filters.");
            updateCasesSelectionState();
            return;
        }

        let renderedRows = 0;

        bookings.forEach((booking) => {
            if (!booking || booking.status === "cancelled" || booking.status === "On Hold") {
                return;
            }

            const row = document.createElement("tr");
            const eligible = isDownloadEligible(booking.status);
            const patientNameStr = String(booking.patientName || "").trim();

            const tableData = Array.isArray(booking.tableData) ? booking.tableData : [];
            const testNamesArray = [...new Set(
                tableData.flatMap((obj) => String(obj.testName || "")
                    .split(",")
                    .map((name) => name.trim())
                    .filter(Boolean))
            )];
            const uniqueTestNames = testNamesArray.join(", ");

            row.setAttribute("data-test-names", uniqueTestNames);
            row.setAttribute("age", booking.year || "");
            row.setAttribute("gender", booking.gender || "");
            row.setAttribute("data-booking-id", booking.bookingId || "");
            row.setAttribute("data-patient-phone", booking.patientPhone || "");
            row.setAttribute("data-lab-name", booking.labName || "");
            row.setAttribute("data-updated-at", booking.updatedAt || "");
            row.setAttribute("data-created-by", booking.createdBy || "");
            row.setAttribute("data-status", String(booking.status || "").toLowerCase());
            row.setAttribute("data-patient-name", patientNameStr);
            row.setAttribute("data-booking", JSON.stringify(booking));

            const normalizedStatus = String(booking.status || "").toLowerCase();
            const baseColor = normalizedStatus.startsWith("complete")
                ? "rgba(239, 68, 68, 0.11)"
                : normalizedStatus === "pending"
                    ? "rgba(34, 197, 94, 0.11)"
                    : normalizedStatus === "hold" || normalizedStatus === "on hold"
                        ? "rgba(245, 158, 11, 0.12)"
                        : "rgba(59, 130, 246, 0.08)";

            if (booking.isLisPresent) {
                row.style.background = `linear-gradient(to right, rgba(59, 130, 246, 0.18) 0%, rgba(59, 130, 246, 0.06) 8px, ${baseColor} 8px)`;
            } else {
                row.style.backgroundColor = baseColor;
            }

            const bookingDateTime = formatBookingDateTime(
                booking.createdAt || booking.date,
                booking.createdAt ? "" : booking.time
            );

            const amountOrBarcodeCell = islayerone
                ? `<td class="amount-cell">${formatAmount(booking.total)}</td>`
                : `<td class="barcode-cell">${buildBarcodeHtml(booking)}</td>`;

            row.innerHTML = `
                <td style="text-align: center;">
                    <input type="checkbox" class="case-checkbox" data-booking-id="${escapeHtml(booking.bookingId || '')}" aria-label="Select booking ${escapeHtml(booking.bookingId || '')}" ${eligible ? '' : 'disabled'} title="${eligible ? 'Select booking' : 'Report not ready for download (Only Completed and Partially Completed)'}">
                </td>
                <td class="reg-no">
                    <span class="booking-id-badge${eligible ? '' : ' is-not-ready'}" role="button" tabindex="${eligible ? '0' : '-1'}"
                          title="${eligible ? 'Click to Download Report' : 'Report not ready for download (Only Completed and Partially Completed)'}"
                          aria-label="${eligible ? 'Download report for booking ' + escapeHtml(booking.bookingId || '') : 'Report not ready for booking ' + escapeHtml(booking.bookingId || '')}"
                          data-booking-id="${escapeHtml(booking.bookingId || '')}"
                          data-patient-name="${escapeHtml(patientNameStr)}"
                          data-status="${escapeHtml(booking.status || '')}">
                        <i class="fas ${eligible ? 'fa-download' : 'fa-lock'} booking-id-icon" aria-hidden="true"></i>
                        ${escapeHtml(booking.bookingId || '--')}
                        ${eligible ? '' : '<span class="not-ready-tooltip" title="Only Completed and Partially Completed reports can be downloaded"><i class="fas fa-circle-info"></i></span>'}
                    </span>
                </td>
                <td class="booking-date-cell">${bookingDateTime}</td>
                <td>${escapeHtml(booking.patientName || '--')}</td>
                <td>${islayerone ? escapeHtml(booking.doctorName || '--') : escapeHtml(booking.createdbyuser || '--')}</td>
                ${amountOrBarcodeCell}
                <td><button class="status-btn">${escapeHtml(booking.status || 'pending')}</button></td>
                <td class="actions">${buildActionCell(booking)}</td>`;

            tableBody.appendChild(row);
            renderedRows += 1;
        });

        if (renderedRows === 0) {
            setTableState("No bookings found for selected filters.");
        }
        updateCasesSelectionState();
    }

    // Event delegation for table actions
    const tableBody = document.getElementById("tbody");
    if (tableBody && !tableBody.dataset.actionsBound) {
        tableBody.dataset.actionsBound = "true";
        tableBody.addEventListener("click", async function (e) {
            // Handle clicking on Booking ID badge for report download
            const badge = e.target.closest(".booking-id-badge");
            if (badge) {
                e.preventDefault();
                e.stopPropagation();
                await downloadSingleReport(badge);
                return;
            }

            // Handle checkbox click
            if (e.target.classList.contains("case-checkbox")) {
                updateCasesSelectionState();
                return;
            }

            const target = e.target.closest("a, button, .more-options");
            if (!target) return;
            e.stopImmediatePropagation();
            e.preventDefault();

            const row = target.closest("tr");
            if (!row) return;

            // Handle three dots dropdown toggle
            if (target.closest(".more-options")) {
                const triggerBtn = target.closest(".more-options");
                const bookingData = row.getAttribute("data-booking");
                const bookingObj = bookingData ? JSON.parse(bookingData) : null;
                openDropdownMenu(triggerBtn, row, bookingObj);
                return;
            }
            if (!row) return;

            const bookingData = row.getAttribute("data-booking");
            if (!bookingData) return;

            const booking = JSON.parse(bookingData);
            const bookingId = row.getAttribute("data-booking-id");
            const createdBy = row.getAttribute("data-created-by");

            if (target.classList.contains("view-bill")) {
                saveBookingToLocalStorage(booking, row);
                window.location.href = `${BASE_URL}/admin/admin.html?page=labreport`;
            }
            else if (target.classList.contains("edit-report")) {
                saveBookingToLocalStorage(booking, row);
                const url = `${BASE_URL}/admin/admin.html?page=${user.role === "staff" ? user.tenantId.adminDetails.userId.pdfFormat : user.pdfFormat}&value1=${booking.bookingId}`;
                window.location.href = url;
            }
            else if (target.classList.contains("download-report")) {
                const badge = row.querySelector(".booking-id-badge");
                if (badge && !badge.classList.contains("is-not-ready")) {
                    await downloadSingleReport(badge);
                } else {
                    saveBookingToLocalStorage(booking, row);
                    window.location.href = `${BASE_URL}/admin/admin.html?page=labreport`;
                }
            }
            else if (target.classList.contains("edit-booking")) {
                openEditBookingPage(booking, row);
            }
            else if (target.classList.contains("hold-btn")) {
                await handleHoldBooking(bookingId, createdBy);
            }
            else if (target.classList.contains("clinical-btn")) {
                await handleClinicalBooking(bookingId, createdBy);
            }
            else if (target.classList.contains("cancel-btn")) {
                await handleCancelBooking(bookingId, createdBy);
            }
            else if (target.classList.contains("generate-bill-btn")) {
                const bookingToBill = booking || (row.getAttribute("data-booking") ? JSON.parse(row.getAttribute("data-booking")) : null);
                openInvoiceCustomizerModal(bookingToBill);
            }
            else if (target.classList.contains("generate-trf-btn")) {
                handleGenerateTRF(bookingId);
            }
        });

        tableBody.addEventListener("keydown", async function (e) {
            if (e.key === "Enter" || e.key === " ") {
                const badge = e.target.closest(".booking-id-badge");
                if (badge) {
                    e.preventDefault();
                    await downloadSingleReport(badge);
                }
            }
        });

        // Global dropdown click outside and scroll management
        if (window._labflowCleanupDropdown) {
            window._labflowCleanupDropdown();
        }

        const handleDocClick = (event) => {
            const popover = document.getElementById("allcases-dropdown-popover");
            if (!popover) return;
            if (popover.contains(event.target) || (popover._trigger && popover._trigger.contains(event.target))) {
                return;
            }
            closeDropdown();
        };

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                closeDropdown();
            }
        };

        let scrollRafId = null;
        const handleScrollOrResize = (event) => {
            const popover = document.getElementById("allcases-dropdown-popover");
            if (!popover) return;

            if (event && event.target && (event.target === popover || popover.contains(event.target))) {
                return;
            }

            if (scrollRafId) cancelAnimationFrame(scrollRafId);
            scrollRafId = requestAnimationFrame(() => {
                const current = document.getElementById("allcases-dropdown-popover");
                if (!current || !current._trigger) return;

                const triggerRect = current._trigger.getBoundingClientRect();
                if (
                    triggerRect.bottom < 0 ||
                    triggerRect.top > window.innerHeight ||
                    triggerRect.right < 0 ||
                    triggerRect.left > window.innerWidth
                ) {
                    closeDropdown();
                    return;
                }

                positionPopover(current, current._trigger, current._row);
            });
        };

        document.addEventListener("click", handleDocClick, true);
        document.addEventListener("pointerdown", handleDocClick, true);
        document.addEventListener("keydown", handleKeyDown);
        window.addEventListener("scroll", handleScrollOrResize, { capture: true, passive: true });
        window.addEventListener("resize", handleScrollOrResize, { passive: true });

        window._labflowCleanupDropdown = () => {
            document.removeEventListener("click", handleDocClick, true);
            document.removeEventListener("pointerdown", handleDocClick, true);
            document.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("scroll", handleScrollOrResize, { capture: true });
            window.removeEventListener("resize", handleScrollOrResize);
            if (scrollRafId) cancelAnimationFrame(scrollRafId);
            closeDropdown();
            const modalOnBody = document.querySelector("body > #invoiceCustomizerModal");
            if (modalOnBody) modalOnBody.remove();
        };
    }

    function handleGenerateTRF(bookingId) {
        if (!bookingId) {
            alert("Booking ID not found for this case.");
            return;
        }
        const trfUrl = `${BASE_URL}/api/v1/user/bookings/${encodeURIComponent(bookingId)}/trf-slip`;
        window.open(trfUrl, "_blank", "noopener,noreferrer");
    }

    async function handleHoldBooking(bookingId, createdBy) {
        const confirmation = window.confirm("Are you want to update the status as 'Hold'");
        if (!confirmation) return;

        await updatebookingStatus(bookingId, "Hold");

        if (user && user.tenantId && user.tenantId.modelType !== "1layer") {
            showPopup(bookingId, createdBy);
            await fetchMessages(bookingId);
        }

        await fetchBookings(currentPage);
    }

    async function handleClinicalBooking(bookingId, createdBy) {
        const confirmation = window.confirm("Are you want to update the status as 'clinical'");
        if (!confirmation) return;

        await updatebookingStatus(bookingId, "clinical");

        if (user && user.tenantId && user.tenantId.modelType !== "1layer") {
            showPopup(bookingId, createdBy);
            await fetchMessages(bookingId);
        }

        await fetchBookings(currentPage);
    }

    async function handleCancelBooking(bookingId, createdBy) {
        const confirmation = window.confirm("Are you sure you want to cancel this booking?");
        if (!confirmation) return;

        const loadingMsg = document.createElement('div');
        loadingMsg.textContent = 'Processing cancellation...';
        loadingMsg.style.cssText = 'position:fixed;top:20px;right:20px;background:#333;color:#fff;padding:10px 20px;border-radius:5px;z-index:9999';
        document.body.appendChild(loadingMsg);
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/bookings/cancel`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ bookingId })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Server error' }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            const res = await response.json();

            if (res.success || response.ok) {
                if (user && user.tenantId && user.tenantId.modelType !== "1layer") {
                    showPopup(bookingId, createdBy);
                    await fetchMessages(bookingId);
                }
                alert(res.message || 'Booking cancelled successfully');
                await fetchBookings(currentPage);
            } else {
                throw new Error(res.message || 'Failed to cancel booking');
            }

        } catch (error) {
            console.error('Cancellation error:', error.message);

            let errorMessage = 'Failed to cancel booking. ';

            if (error.message && error.message.includes('Network')) {
                errorMessage += 'Please check your internet connection.';
            } else if (error.message && error.message.includes('timeout')) {
                errorMessage += 'Request timed out. Please try again.';
            } else if (error.message && (error.message.includes('401') || error.message.includes('Unauthorized'))) {
                errorMessage += 'Session expired. Please login again.';
            } else if (error.message && (error.message.includes('403') || error.message.includes('Forbidden'))) {
                errorMessage += 'You do not have permission to cancel this booking.';
            } else if (error.message && error.message.includes('404')) {
                errorMessage += 'Booking not found.';
            } else {
                errorMessage += error.message || 'Please try again later.';
            }

            alert(errorMessage);
        } finally {
            if (loadingMsg && loadingMsg.parentNode) {
                loadingMsg.parentNode.removeChild(loadingMsg);
            }
        }
    }

    function showPopup(bookingId, createdBy) {
        if (messagesDiv) messagesDiv.innerHTML = '';

        const messageInput = document.getElementById("messageInput");
        if (messageInput) {
            messageInput.setAttribute("data-created-by", createdBy);
            messageInput.setAttribute("data-booking-id", bookingId);
        }

        if (popup) popup.style.display = "block";
        if (overlay) overlay.style.display = "block";
    }

    async function updatebookingStatus(bookingid, status) {
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/statusBookingcontroller`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookingid, status }),
            });
            if (!response.ok) {
                console.log("status not updated");
            }
        } catch (error) {
            console.log(error);
        }
    }

    async function rejectBooking(bookingId) {
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/reject-booking`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ bookingId })
            });

            const data = await response.json();
            if (response.ok) {
                alert(data.message);
                closePopup();
            } else {
                alert(data.message);
            }
        } catch (error) {
            console.error("Error updating booking status:", error);
            alert("An error occurred. Please try again.");
        }
    }

    async function fetchMessages(bookingId) {
        if (messagesDiv) messagesDiv.innerHTML = '';
        let lastMessageId = null;
        let isFetching = false;

        if (intervalId) {
            clearInterval(intervalId);
        }

        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/getConversationByBookingId`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ bookingId }),
            });

            if (response.ok) {
                const responseData = await response.json();
                console.log("response data:", responseData);
                displayMessages(responseData.conversation.messages);
                if (responseData.conversation.messages.length > 0) {
                    lastMessageId = responseData.conversation.messages[responseData.conversation.messages.length - 1]._id;
                }
            } else {
                console.log("Failed to fetch conversation");
                return;
            }

            intervalId = setInterval(async function () {
                if (isFetching) return;

                isFetching = true;
                try {
                    const response = await fetch(`${BASE_URL}/api/v1/user/getConversationByBookingId`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ bookingId }),
                    });

                    if (!response.ok) {
                        console.log("Failed to fetch conversation");
                        return;
                    }

                    const responseData = await response.json();
                    const newMessages = responseData.conversation.messages.filter(message =>
                        !lastMessageId || message._id > lastMessageId
                    );

                    if (newMessages.length > 0) {
                        displayMessages(newMessages);
                        lastMessageId = newMessages[newMessages.length - 1]._id;
                    }
                } catch (error) {
                    console.error("Error fetching conversation:", error);
                } finally {
                    isFetching = false;
                }
            }, 2000);

        } catch (error) {
            console.error("Error sending message:", error);
        }
    }

    function displayMessages(messages) {
        if (!messagesDiv || !Array.isArray(messages)) return;

        messages.forEach(message => {
            const div = document.createElement('div');
            const textTag = document.createElement('p');

            if (message.senderId === userId) {
                div.className = 'receiverdivs';
                textTag.className = 'receivertext';
            } else {
                div.className = 'senderdivs';
                textTag.className = 'sendertext';
            }

            textTag.textContent = message.message;
            div.appendChild(textTag);
            messagesDiv.appendChild(div);
        });

        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function closePopup() {
        if (intervalId) {
            clearInterval(intervalId);
        }
        if (popup) popup.style.display = "none";
        if (overlay) overlay.style.display = "none";
    }

    function saveBookingToLocalStorage(booking, row) {
        const regId = (row && row.cells && row.cells[0]) ? row.cells[0].innerText.trim() : (booking ? (booking.bookingId || "") : "");
        localStorage.setItem("booking", JSON.stringify(booking));
        localStorage.setItem("regId", JSON.stringify(regId));
        sessionStorage.setItem("booking", JSON.stringify(booking));
        sessionStorage.setItem("regId", JSON.stringify(regId));
    }

    function escapeHtml(str) {
        if (str == null) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getInvoiceCSS() {
        return `
        * {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            box-sizing: border-box;
        }
        .container-pdf {
            max-width: 800px;
            margin: 0 auto;
            border: 1px solid #ccc;
            padding: 20px;
            background: #ffffff;
        }
        .header {
            position: relative;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border: 1px solid #e5e7eb;
            padding: 16px;
            margin-bottom: 16px;
            border-radius: 8px;
        }
        .header h1 {
            font-size: 1.25rem;
            font-weight: bold;
            margin: 0;
        }
        .header span {
            font-size: 1.25rem;
            font-weight: bold;
        }
        .upper-header {
            background-color: #3f4d67;
            color: whitesmoke;
        }
        .upper-header h1,
        .upper-header p {
            color: whitesmoke;
            margin: 5px 0;
        }
        .upper-header img {
            width: 250px;
            height: 125px;
            object-fit: contain;
        }
        .patient-details {
            border-top: 1px solid #ccc;
            padding-top: 20px;
            margin-bottom: 20px;
        }
        .patient-details p {
            margin: 5px 0;
        }
        .patient-details .blue {
            color: #1a73e8;
        }
        .table-container {
            width: 100%;
            margin-bottom: 20px;
            overflow: auto;
        }
        .table-container table {
            width: 100%;
            border-collapse: collapse;
        }
        .table-container th,
        .table-container td {
            border: 1px solid #ccc;
            padding: 10px;
            text-align: center;
        }
        .table-container th {
            background-color: #f9f9f9;
        }
        .note {
            width: 100%;
            text-align: center;
            font-size: 0.875rem;
            margin-bottom: 16px;
        }
        .stamp {
            display: flex;
            justify-content: flex-start;
        }
        .stamp span {
            color: black;
            opacity: 0.7;
            font-size: 0.75rem;
        }
        `;
    }

    function generateInvoiceHTML(data) {
        const showAmounts = Boolean(data.showAmountCol);
        const hasQty = (data.items || []).some(item => Number(item.qty || 1) > 1);

        // Create test/item table rows
        let testTableRows = '';
        (data.items || []).forEach((item, index) => {
            const itemNum = index + 1;
            const itemName = escapeHtml(item.name || `Item ${itemNum}`);
            const itemQty = item.qty || 1;
            const itemAmount = Number(item.amount || item.rate || 0).toFixed(2);

            if (showAmounts) {
                testTableRows += `
                    <tr>
                        <td style="width: 45px; text-align: center;">${itemNum}</td>
                        <td style="text-align: left; padding-left: 14px;">${itemName}</td>
                        ${hasQty ? `<td style="width: 60px; text-align: center;">${itemQty}</td>` : ''}
                        <td style="width: 130px; text-align: right; padding-right: 14px; font-weight: 600;">₹ ${itemAmount}</td>
                    </tr>
                `;
            } else {
                testTableRows += `
                    <tr>
                        <td style="width: 50px; text-align: center;">${itemNum}</td>
                        <td style="text-align: left; padding-left: 14px;">${itemName}</td>
                    </tr>
                `;
            }
        });

        // Table headers matching the chosen format
        const tableHeaderHtml = showAmounts
            ? `<tr>
                <th style="width: 45px; text-align: center;">#</th>
                <th style="text-align: left; padding-left: 14px;">Item / Test Description</th>
                ${hasQty ? `<th style="width: 60px; text-align: center;">Qty</th>` : ''}
                <th style="width: 130px; text-align: right; padding-right: 14px;">Amount</th>
              </tr>`
            : `<tr>
                <th style="width: 50px; text-align: center;">#</th>
                <th style="text-align: left; padding-left: 14px;">Test Name</th>
              </tr>`;

        // Logo / Brand Header
        const branding = data.branding || {};
        const brandType = data.brandType || branding.brandType || (data.logoUrl ? "image" : (branding.labHeading ? "text" : "none"));
        let logoHtml = '';

        if (brandType === "image" && data.logoUrl) {
            logoHtml = `<img id="bill-logo" src="${data.logoUrl}" style="max-width: 250px; max-height: 120px; object-fit: contain; display: block;">`;
        } else if (brandType === "text" || (branding.labHeading && brandType !== "none")) {
            const bg = branding.bgColor || "#ffffff";
            const textColor = branding.textColor || "#0f172a";
            const sloganColor = branding.sloganColor || "#64748b";
            const fontSize = branding.fontSize || 20;
            const sloganSize = branding.sloganSize || 12;
            const heading = branding.labHeading || data.labName || "LabFlow";
            const slogan = branding.labSlogan || "";
            const borderWidth = branding.borderWidth !== undefined ? branding.borderWidth : 1;
            const borderColor = branding.borderColor || "#e2e8f0";

            logoHtml = `
            <div id="bill-brand-box" style="
                width: 250px;
                min-height: 90px;
                padding: 10px 14px;
                box-sizing: border-box;
                background-color: ${bg};
                border: ${borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : 'none'};
                border-radius: 8px;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
                font-family: Arial, sans-serif;
                word-break: break-word;
                line-height: 1.25;
            ">
                <div style="font-size: ${fontSize}px; font-weight: 800; color: ${textColor}; letter-spacing: -0.3px;">
                    ${escapeHtml(heading)}
                </div>
                ${slogan ? `
                <div style="font-size: ${sloganSize}px; font-weight: 500; color: ${sloganColor}; margin-top: 4px;">
                    ${escapeHtml(slogan)}
                </div>` : ''}
            </div>`;
        } else if (data.logoUrl && brandType !== "none") {
            logoHtml = `<img id="bill-logo" src="${data.logoUrl}" style="max-width: 250px; max-height: 120px; object-fit: contain; display: block;">`;
        } else if (data.labName && brandType !== "none") {
            logoHtml = `<div style="font-size: 20px; font-weight: 800; color: whitesmoke;">${escapeHtml(data.labName)}</div>`;
        }

        // Doctor / Phone rows
        const doctorHtml = data.doctorName ? `<p style="color: #64748b; font-size: 0.875rem; margin: 4px 0 0;">Ref By: ${escapeHtml(data.doctorName)}</p>` : '';
        const phoneHtml = data.patientPhone ? `<p style="color: #64748b; font-size: 0.875rem; margin: 4px 0 0;">Contact: ${escapeHtml(data.patientPhone)}</p>` : '';

        // Optional breakdown row if discount or tax was entered
        const subtotal = Number(data.subtotal || data.grandTotal || 0);
        const discount = Number(data.discount || 0);
        const tax = Number(data.tax || 0);
        const grandTotal = Number(data.grandTotal || 0);

        let breakdownHtml = '';
        if (discount > 0 || tax > 0) {
            breakdownHtml = `
                <div style="display: flex; justify-content: flex-end; padding: 12px 16px; font-size: 0.9rem; color: #475467; border: 1px solid #e5e7eb; border-bottom: none; border-radius: 8px 8px 0 0; background: #fafafa;">
                    <div style="min-width: 220px; display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; justify-content: space-between;"><span>Subtotal:</span><span style="font-weight: 600;">₹ ${subtotal.toFixed(2)}</span></div>
                        ${discount > 0 ? `<div style="display: flex; justify-content: space-between; color: #16a34a;"><span>Discount:</span><span>- ₹ ${discount.toFixed(2)}</span></div>` : ''}
                        ${tax > 0 ? `<div style="display: flex; justify-content: space-between; color: #2563eb;"><span>Tax / GST:</span><span>+ ₹ ${tax.toFixed(2)}</span></div>` : ''}
                    </div>
                </div>
            `;
        }

        const html = `
        <div class="container-pdf">
            <div class="header upper-header">
                <div>
                    <h1>INVOICE</h1>
                    <p>${escapeHtml(data.billNumber || '')}</p>
                    <p>Invoice Date: ${escapeHtml(data.invoiceDate || '')}</p>
                </div>
                <div class="image-div">
                    ${logoHtml}
                </div>
            </div>
            <div class="patient-details">
                <div style="display: flex; justify-content: space-between;">
                    <div>
                        <p><strong>Patient Details :</strong></p>
                        <p class="blue">${escapeHtml(data.patientName || '')}</p>
                        <p>${escapeHtml(data.year || '')} | ${escapeHtml(data.gender || '')}</p>
                        ${doctorHtml}
                    </div>
                    <div style="text-align: right;">
                        <p><strong>Booking Id : ${escapeHtml(data.bookingId || '')}</strong></p>
                        <p>Booking Time : ${escapeHtml(data.bookingDateTime || '')}</p>
                        ${phoneHtml}
                    </div>
                </div>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        ${tableHeaderHtml}
                    </thead>
                    <tbody>
                        ${testTableRows}
                    </tbody>
                </table>
            </div>
            <div style="background-color: white; border-radius: 8px;">
                ${breakdownHtml}
                <div class="header" style="${breakdownHtml ? 'border-top-left-radius: 0; border-top-right-radius: 0; margin-top: 0;' : ''}">
                    <h1>Grand Total</h1>
                    <span>₹ ${grandTotal.toFixed(2)}</span>
                </div>
                <p class="note">${escapeHtml(data.note || '** No refund is available after booking.')}</p>
                <div class="stamp">
                    <span>${escapeHtml(data.stamp || 'This Bill is Generated by www.LabFlow')}</span>
                </div>
            </div>
        </div>
        `;

        return html;
    }

    // ================= INVOICE CUSTOMIZER MODAL CONTROLLER =================
    let currentCustomizerBooking = null;
    let initialCustomizerState = null;
    let customizerListenersBound = false;

    function openInvoiceCustomizerModal(booking) {
        if (!booking) {
            alert("No booking details found to customize invoice.");
            return;
        }

        currentCustomizerBooking = booking;

        // Format dates and times
        const bookingDate = new Date(booking.date);
        const formattedBookingDate = !Number.isNaN(bookingDate.getTime())
            ? bookingDate.toLocaleDateString("en-GB")
            : (booking.date ? String(booking.date).split("T")[0] : "");

        const formattedBookingTime = booking.time
            ? new Date("1970-01-01T" + booking.time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
            : "";

        const bookingDateTimeStr = `${formattedBookingDate} ${formattedBookingTime}`.trim() || "--";

        const todayFormatted = new Date().toLocaleDateString("en-GB");

        // Parse items from selectedItems or tableData
        let items = [];
        if (Array.isArray(booking.selectedItems) && booking.selectedItems.length > 0) {
            items = booking.selectedItems.map((si) => ({
                name: si.itemName || "",
                rate: Number(si.price || 0),
                qty: 1
            }));
        } else if (Array.isArray(booking.tableData) && booking.tableData.length > 0) {
            const rawNames = [...new Set(
                booking.tableData.flatMap((obj) => String(obj.testName || "").split(",").map((n) => n.trim())).filter(Boolean)
            )];

            const totalAmount = Number(booking.total || 0);

            if (rawNames.length === 1) {
                items = [{ name: rawNames[0], rate: totalAmount, qty: 1 }];
            } else if (rawNames.length > 1) {
                items = rawNames.map((n, i) => ({
                    name: n,
                    rate: i === 0 ? totalAmount : 0,
                    qty: 1
                }));
            }
        }

        if (items.length === 0) {
            items = [{ name: "Medical Test / Service", rate: Number(booking.total || 0), qty: 1 }];
        }

        const state = {
            billNumber: `#Bill${booking._id || booking.bookingId || ""}`,
            invoiceDate: todayFormatted,
            patientName: booking.patientName || "",
            year: booking.year || "",
            gender: booking.gender || "Male",
            doctorName: booking.doctorName || booking.franchisee || "",
            bookingId: booking.bookingId || "",
            bookingDateTime: bookingDateTimeStr,
            patientPhone: booking.patientPhone || "",
            logoUrl: user?.tenantId?.logo || "",
            labName: booking.labName || user?.tenantId?.name || "LabFlow",
            branding: JSON.parse(JSON.stringify(user?.tenantId?.branding || user?.branding || {})),
            brandType: user?.tenantId?.branding?.brandType || (user?.tenantId?.logo ? "image" : (user?.tenantId?.branding?.labHeading ? "text" : "none")),
            items: items,
            discount: 0,
            taxPercent: 0,
            grandTotal: Number(booking.total || 0),
            note: "** No refund is available after booking.",
            stamp: "This Bill is Generated by www.LabFlow",
            showAmounts: true
        };

        initialCustomizerState = JSON.parse(JSON.stringify(state));
        renderCustomizerModal(state);
    }

    function renderCustomizerModal(state) {
        const modal = document.getElementById("invoiceCustomizerModal");
        if (!modal) return;

        // Move modal directly to document.body to break free from .content-box and #main-content stacking contexts
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }

        // Set Header fields
        const caseBadge = document.getElementById("inv-case-badge");
        if (caseBadge) caseBadge.textContent = `#${state.bookingId || "Case"}`;

        const billInput = document.getElementById("inv-bill-number");
        if (billInput) billInput.value = state.billNumber || "";

        const dateInput = document.getElementById("inv-invoice-date");
        if (dateInput) dateInput.value = state.invoiceDate || "";

        // Brand & Logo Header Customizer Controls
        const modeSelect = document.getElementById("inv-brand-mode-select");
        const toggleEditorBtn = document.getElementById("inv-btn-toggle-brand-editor");
        const editorPanel = document.getElementById("inv-brand-editor-panel");
        const editHeading = document.getElementById("inv-edit-lab-heading");
        const editSlogan = document.getElementById("inv-edit-lab-slogan");
        const headingBadge = document.getElementById("inv-heading-char-badge");
        const sloganBadge = document.getElementById("inv-slogan-char-badge");
        const editBg = document.getElementById("inv-edit-bg-color");
        const editText = document.getElementById("inv-edit-text-color");
        const editSloganCol = document.getElementById("inv-edit-slogan-color");
        const editSize = document.getElementById("inv-edit-font-size");

        const logoImg = document.getElementById("inv-lab-logo");
        const fallbackLab = document.getElementById("inv-lab-fallback-name");
        const textBrandBox = document.getElementById("inv-lab-text-brand-box");

        // Init branding state
        state.branding = state.branding || {};
        if (!state.brandType) {
            state.brandType = state.branding.brandType || (state.logoUrl ? "image" : (state.branding.labHeading ? "text" : "none"));
        }

        if (modeSelect) modeSelect.value = state.brandType || "auto";
        if (editHeading) editHeading.value = state.branding.labHeading || state.labName || "LabFlow";
        if (editSlogan) editSlogan.value = state.branding.labSlogan || "";
        if (editBg) editBg.value = state.branding.bgColor || "#ffffff";
        if (editText) editText.value = state.branding.textColor || "#0f172a";
        if (editSloganCol) editSloganCol.value = state.branding.sloganColor || "#64748b";
        if (editSize) editSize.value = state.branding.fontSize || 20;

        function updateBrandHeaderDisplay() {
            const currentMode = modeSelect ? modeSelect.value : (state.brandType || "auto");
            const headingVal = editHeading ? editHeading.value.trim() : (state.branding.labHeading || state.labName || "LabFlow");
            const sloganVal = editSlogan ? editSlogan.value.trim() : (state.branding.labSlogan || "");
            const bgVal = editBg ? editBg.value : (state.branding.bgColor || "#ffffff");
            const textVal = editText ? editText.value : (state.branding.textColor || "#0f172a");
            const sloganColVal = editSloganCol ? editSloganCol.value : (state.branding.sloganColor || "#64748b");
            const sizeVal = editSize ? parseInt(editSize.value) : (state.branding.fontSize || 20);

            if (headingBadge) headingBadge.textContent = `${headingVal.length}/30`;
            if (sloganBadge) sloganBadge.textContent = `${sloganVal.length}/50`;

            // Sync with state
            state.brandType = currentMode;
            state.branding = {
                ...state.branding,
                brandType: currentMode,
                labHeading: headingVal,
                labSlogan: sloganVal,
                bgColor: bgVal,
                textColor: textVal,
                sloganColor: sloganColVal,
                fontSize: sizeVal
            };

            const effectiveType = currentMode === "auto"
                ? (state.logoUrl ? "image" : (headingVal ? "text" : "none"))
                : currentMode;

            if (effectiveType === "image" && state.logoUrl) {
                if (logoImg) {
                    logoImg.src = state.logoUrl;
                    logoImg.style.display = "block";
                }
                if (fallbackLab) fallbackLab.style.display = "none";
                if (textBrandBox) textBrandBox.style.display = "none";
            } else if (effectiveType === "text" || (headingVal && effectiveType !== "none")) {
                if (logoImg) logoImg.style.display = "none";
                if (fallbackLab) fallbackLab.style.display = "none";
                if (textBrandBox) {
                    textBrandBox.style.display = "flex";
                    textBrandBox.style.flexDirection = "column";
                    textBrandBox.style.justifyContent = "center";
                    textBrandBox.style.alignItems = "center";
                    textBrandBox.style.textAlign = "center";
                    textBrandBox.style.backgroundColor = bgVal;
                    textBrandBox.style.border = "1px solid #cbd5e1";
                    textBrandBox.style.borderRadius = "6px";
                    textBrandBox.style.padding = "8px 12px";
                    textBrandBox.style.minWidth = "220px";
                    textBrandBox.style.maxWidth = "250px";
                    textBrandBox.style.minHeight = "70px";
                    textBrandBox.style.boxSizing = "border-box";
                    textBrandBox.style.wordBreak = "break-word";
                    textBrandBox.innerHTML = `
                        <div style="font-size: ${sizeVal}px; font-weight: 800; color: ${textVal}; line-height: 1.2;">
                            ${escapeHtml(headingVal || state.labName || "LabFlow")}
                        </div>
                        ${sloganVal ? `<div style="font-size: 11px; font-weight: 500; color: ${sloganColVal}; margin-top: 3px;">${escapeHtml(sloganVal)}</div>` : ''}
                    `;
                }
            } else if (effectiveType === "none") {
                if (logoImg) logoImg.style.display = "none";
                if (fallbackLab) fallbackLab.style.display = "none";
                if (textBrandBox) textBrandBox.style.display = "none";
            } else {
                if (logoImg) logoImg.style.display = "none";
                if (textBrandBox) textBrandBox.style.display = "none";
                if (fallbackLab) {
                    fallbackLab.textContent = state.labName || "LabFlow";
                    fallbackLab.style.display = "block";
                }
            }
        }

        if (toggleEditorBtn && editorPanel) {
            toggleEditorBtn.onclick = () => {
                editorPanel.style.display = editorPanel.style.display === "none" ? "block" : "none";
            };
        }

        if (modeSelect) modeSelect.onchange = updateBrandHeaderDisplay;
        if (editHeading) editHeading.oninput = updateBrandHeaderDisplay;
        if (editSlogan) editSlogan.oninput = updateBrandHeaderDisplay;
        if (editBg) editBg.oninput = updateBrandHeaderDisplay;
        if (editText) editText.oninput = updateBrandHeaderDisplay;
        if (editSloganCol) editSloganCol.oninput = updateBrandHeaderDisplay;
        if (editSize) editSize.oninput = updateBrandHeaderDisplay;

        updateBrandHeaderDisplay();

        // Patient Details
        const patientNameInput = document.getElementById("inv-patient-name");
        if (patientNameInput) patientNameInput.value = state.patientName || "";

        const patientYearInput = document.getElementById("inv-patient-year");
        if (patientYearInput) patientYearInput.value = state.year || "";

        const patientGenderSelect = document.getElementById("inv-patient-gender");
        if (patientGenderSelect) patientGenderSelect.value = state.gender || "Male";

        const doctorNameInput = document.getElementById("inv-doctor-name");
        if (doctorNameInput) doctorNameInput.value = state.doctorName || "";

        // Booking Details
        const bookingIdInput = document.getElementById("inv-booking-id");
        if (bookingIdInput) bookingIdInput.value = state.bookingId || "";

        const bookingDateTimeInput = document.getElementById("inv-booking-datetime");
        if (bookingDateTimeInput) bookingDateTimeInput.value = state.bookingDateTime || "";

        const patientPhoneInput = document.getElementById("inv-patient-phone");
        if (patientPhoneInput) patientPhoneInput.value = state.patientPhone || "";

        // Options & Summary
        const showAmountsToggle = document.getElementById("inv-show-amounts-toggle");
        if (showAmountsToggle) showAmountsToggle.checked = Boolean(state.showAmounts);

        const discountInput = document.getElementById("inv-discount-amount");
        if (discountInput) discountInput.value = Number(state.discount || 0).toFixed(2);

        const taxInput = document.getElementById("inv-tax-percent");
        if (taxInput) taxInput.value = Number(state.taxPercent || 0).toFixed(2);

        const grandTotalInput = document.getElementById("inv-grand-total");
        if (grandTotalInput) grandTotalInput.value = Number(state.grandTotal || 0).toFixed(2);

        const noteInput = document.getElementById("inv-note-text");
        if (noteInput) noteInput.value = state.note || "** No refund is available after booking.";

        const stampInput = document.getElementById("inv-stamp-text");
        if (stampInput) stampInput.value = state.stamp || "This Bill is Generated by www.LabFlow";

        // Render Item rows
        const tbody = document.getElementById("inv-items-tbody");
        if (tbody) {
            tbody.innerHTML = "";
            (state.items || []).forEach((item) => {
                addCustomizerItemRow(item.name, item.rate, item.qty);
            });
        }

        // Recalculate totals
        recalculateInvoiceTotals(true);

        // Open modal
        modal.classList.add("is-open");
        document.body.style.overflow = "hidden";

        // Bind customizer global listeners if not yet bound
        if (!customizerListenersBound) {
            bindCustomizerEvents();
            customizerListenersBound = true;
        }
    }

    function addCustomizerItemRow(name = "", rate = 0, qty = 1) {
        const tbody = document.getElementById("inv-items-tbody");
        if (!tbody) return;

        const row = document.createElement("tr");
        const safeRate = Math.max(0, Number(rate) || 0);
        const safeQty = Math.max(1, Number(qty) || 1);
        const rowAmount = safeRate * safeQty;

        row.innerHTML = `
            <td class="inv-item-row-num"></td>
            <td style="text-align: left;">
                <input type="text" class="inv-table-input item-name" placeholder="Enter test, package, or product name..." value="${escapeHtml(name)}">
            </td>
            <td>
                <input type="number" class="inv-table-input num-input item-rate" min="0" step="any" placeholder="0.00" value="${safeRate}">
            </td>
            <td>
                <input type="number" class="inv-table-input num-input item-qty" min="1" step="1" value="${safeQty}">
            </td>
            <td style="text-align: right; padding-right: 14px;">
                <span class="item-amount" style="font-weight: 700; color: #15803d;">₹ ${rowAmount.toFixed(2)}</span>
            </td>
            <td>
                <button type="button" class="inv-row-del-btn" title="Remove this item" aria-label="Remove item">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;

        // Row event listeners for auto-calculation
        const rateInput = row.querySelector(".item-rate");
        const qtyInput = row.querySelector(".item-qty");
        const delBtn = row.querySelector(".inv-row-del-btn");

        const handleRowChange = () => {
            const currentRate = Math.max(0, parseFloat(rateInput.value) || 0);
            const currentQty = Math.max(1, parseFloat(qtyInput.value) || 1);
            const currentTotal = currentRate * currentQty;
            const amountSpan = row.querySelector(".item-amount");
            if (amountSpan) {
                amountSpan.textContent = `₹ ${currentTotal.toFixed(2)}`;
            }
            recalculateInvoiceTotals(false);
        };

        if (rateInput) rateInput.addEventListener("input", handleRowChange);
        if (qtyInput) qtyInput.addEventListener("input", handleRowChange);

        if (delBtn) {
            delBtn.addEventListener("click", () => {
                row.remove();
                renumberCustomizerRows();
                recalculateInvoiceTotals(false);
            });
        }

        tbody.appendChild(row);
        renumberCustomizerRows();
    }

    function renumberCustomizerRows() {
        const rows = document.querySelectorAll("#inv-items-tbody tr");
        rows.forEach((row, index) => {
            const numCell = row.querySelector(".inv-item-row-num");
            if (numCell) {
                numCell.textContent = String(index + 1);
            }
        });

        const countEl = document.getElementById("inv-item-count");
        if (countEl) {
            countEl.textContent = `${rows.length} ${rows.length === 1 ? "item" : "items"}`;
        }
    }

    function recalculateInvoiceTotals(preserveGrandTotal = false) {
        const rows = document.querySelectorAll("#inv-items-tbody tr");
        let subtotal = 0;

        rows.forEach((row) => {
            const rate = Math.max(0, parseFloat(row.querySelector(".item-rate")?.value) || 0);
            const qty = Math.max(1, parseFloat(row.querySelector(".item-qty")?.value) || 1);
            const rowTotal = rate * qty;
            const amountSpan = row.querySelector(".item-amount");
            if (amountSpan) {
                amountSpan.textContent = `₹ ${rowTotal.toFixed(2)}`;
            }
            subtotal += rowTotal;
        });

        const subtotalEl = document.getElementById("inv-calc-subtotal");
        if (subtotalEl) {
            subtotalEl.textContent = subtotal.toFixed(2);
        }

        const discountInput = document.getElementById("inv-discount-amount");
        const taxInput = document.getElementById("inv-tax-percent");
        const grandTotalInput = document.getElementById("inv-grand-total");

        const discount = Math.max(0, parseFloat(discountInput?.value) || 0);
        const taxPercent = Math.max(0, parseFloat(taxInput?.value) || 0);

        const taxable = Math.max(0, subtotal - discount);
        const taxAmount = (taxable * taxPercent) / 100;
        const computedGrandTotal = Math.max(0, taxable + taxAmount);

        if (grandTotalInput && !preserveGrandTotal) {
            grandTotalInput.value = computedGrandTotal.toFixed(2);
        }
    }

    function closeInvoiceCustomizerModal() {
        const modal = document.getElementById("invoiceCustomizerModal");
        if (modal) {
            modal.classList.remove("is-open");
        }
        document.body.style.overflow = "";
    }

    function resetCustomizerToDefault() {
        if (!initialCustomizerState) return;
        renderCustomizerModal(JSON.parse(JSON.stringify(initialCustomizerState)));
    }

    async function handleGenerateCustomizedInvoice() {
        const generateBtn = document.getElementById("inv-btn-generate");
        if (!generateBtn) return;

        // Validation
        const patientName = document.getElementById("inv-patient-name")?.value.trim();
        const bookingId = document.getElementById("inv-booking-id")?.value.trim();

        if (!patientName) {
            alert("Patient Name is required to generate the invoice.");
            document.getElementById("inv-patient-name")?.focus();
            return;
        }

        if (!bookingId) {
            alert("Booking ID is required.");
            document.getElementById("inv-booking-id")?.focus();
            return;
        }

        // Collect items
        const itemRows = document.querySelectorAll("#inv-items-tbody tr");
        const items = [];
        itemRows.forEach((row) => {
            const name = row.querySelector(".item-name")?.value.trim();
            const rate = Math.max(0, parseFloat(row.querySelector(".item-rate")?.value) || 0);
            const qty = Math.max(1, parseFloat(row.querySelector(".item-qty")?.value) || 1);
            if (name) {
                items.push({
                    name,
                    rate,
                    qty,
                    amount: rate * qty
                });
            }
        });

        if (items.length === 0) {
            alert("Please add at least one item or test to generate the invoice.");
            return;
        }

        const billNumber = document.getElementById("inv-bill-number")?.value.trim() || `#Bill${currentCustomizerBooking?._id || bookingId}`;
        const invoiceDate = document.getElementById("inv-invoice-date")?.value.trim() || new Date().toLocaleDateString("en-GB");
        const year = document.getElementById("inv-patient-year")?.value.trim() || "";
        const gender = document.getElementById("inv-patient-gender")?.value || "Male";
        const doctorName = document.getElementById("inv-doctor-name")?.value.trim() || "";
        const bookingDateTime = document.getElementById("inv-booking-datetime")?.value.trim() || "";
        const patientPhone = document.getElementById("inv-patient-phone")?.value.trim() || "";
        const showAmountCol = document.getElementById("inv-show-amounts-toggle")?.checked ?? true;

        const subtotal = Math.max(0, parseFloat(document.getElementById("inv-calc-subtotal")?.textContent) || 0);
        const discount = Math.max(0, parseFloat(document.getElementById("inv-discount-amount")?.value) || 0);
        const taxPercent = Math.max(0, parseFloat(document.getElementById("inv-tax-percent")?.value) || 0);
        const tax = (Math.max(0, subtotal - discount) * taxPercent) / 100;
        const grandTotal = Math.max(0, parseFloat(document.getElementById("inv-grand-total")?.value) || 0);

        const note = document.getElementById("inv-note-text")?.value.trim() || "** No refund is available after booking.";
        const stamp = document.getElementById("inv-stamp-text")?.value.trim() || "This Bill is Generated by www.LabFlow";
        const logoUrl = user?.tenantId?.logo || "";

        // Brand settings from modal state or inputs
        const currentBrandMode = document.getElementById("inv-brand-mode-select")?.value || "auto";
        const currentLabHeading = document.getElementById("inv-edit-lab-heading")?.value.trim() || "";
        const currentLabSlogan = document.getElementById("inv-edit-lab-slogan")?.value.trim() || "";
        const currentBgColor = document.getElementById("inv-edit-bg-color")?.value || "#ffffff";
        const currentTextColor = document.getElementById("inv-edit-text-color")?.value || "#0f172a";
        const currentSloganColor = document.getElementById("inv-edit-slogan-color")?.value || "#64748b";
        const currentFontSize = parseInt(document.getElementById("inv-edit-font-size")?.value) || 20;

        const branding = {
            brandType: currentBrandMode,
            labHeading: currentLabHeading,
            labSlogan: currentLabSlogan,
            bgColor: currentBgColor,
            textColor: currentTextColor,
            sloganColor: currentSloganColor,
            fontSize: currentFontSize
        };

        const originalBtnHtml = generateBtn.innerHTML;
        generateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating PDF...';
        generateBtn.disabled = true;

        try {
            // Generate customized invoice HTML & CSS
            const invoiceHtml = generateInvoiceHTML({
                billNumber,
                invoiceDate,
                patientName,
                year,
                gender,
                doctorName,
                bookingId,
                bookingDateTime,
                patientPhone,
                items,
                showAmountCol,
                subtotal,
                discount,
                tax,
                grandTotal,
                note,
                stamp,
                logoUrl,
                branding,
                brandType: currentBrandMode
            });

            const invoicecss = getInvoiceCSS();

            // Send to server
            const response = await fetch(`${BASE_URL}/api/v1/user/invoicepdfgenerator`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    invoiceHtml,
                    billnumber: billNumber,
                    bookingId: bookingId,
                    invoicecss,
                    billingPrice: Number(grandTotal),
                    generatedBy: userId
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `HTTP error! status: ${response.status}`);
            }

            const pdfblob = await response.blob();
            if (pdfblob.size === 0) {
                throw new Error("Received empty PDF file from server.");
            }

            // Download PDF
            const pdfUrl = URL.createObjectURL(pdfblob);
            const anchor = document.createElement("a");
            anchor.href = pdfUrl;
            anchor.download = `${patientName.replace(/[^a-zA-Z0-9_-]/g, "_")}-invoice.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(pdfUrl);

            // Optional: update bill generated flag
            try {
                await fetch(`${BASE_URL}/api/v1/user/updategeneratedbillvariable/${bookingId}`);
            } catch (flagErr) {
                console.log("Could not update bill generated variable:", flagErr);
            }

            closeInvoiceCustomizerModal();
            closeDropdown();
            showSuccessNotification("Invoice PDF generated and downloaded successfully!");
        } catch (error) {
            console.error("Error generating customized invoice:", error);
            alert(`Failed to generate invoice: ${error.message}`);
        } finally {
            generateBtn.innerHTML = originalBtnHtml;
            generateBtn.disabled = false;
        }
    }

    function bindCustomizerEvents() {
        const modal = document.getElementById("invoiceCustomizerModal");
        if (!modal) return;

        // Close buttons
        const closeTopBtn = document.getElementById("inv-btn-close-modal");
        const cancelBtn = document.getElementById("inv-btn-cancel");
        if (closeTopBtn) closeTopBtn.addEventListener("click", closeInvoiceCustomizerModal);
        if (cancelBtn) cancelBtn.addEventListener("click", closeInvoiceCustomizerModal);

        // Reset buttons
        const resetTopBtn = document.getElementById("inv-btn-reset-top");
        const resetBottomBtn = document.getElementById("inv-btn-reset-bottom");
        if (resetTopBtn) resetTopBtn.addEventListener("click", resetCustomizerToDefault);
        if (resetBottomBtn) resetBottomBtn.addEventListener("click", resetCustomizerToDefault);

        // Add item buttons
        const addTestBtn = document.getElementById("inv-add-test-btn");
        if (addTestBtn) {
            addTestBtn.addEventListener("click", () => {
                addCustomizerItemRow("", 0, 1);
                const lastRow = document.querySelector("#inv-items-tbody tr:last-child .item-name");
                if (lastRow) lastRow.focus();
            });
        }

        const addProductBtn = document.getElementById("inv-add-product-btn");
        if (addProductBtn) {
            addProductBtn.addEventListener("click", () => {
                addCustomizerItemRow("Physical Product", 0, 1);
                const lastRow = document.querySelector("#inv-items-tbody tr:last-child .item-name");
                if (lastRow) {
                    lastRow.focus();
                    lastRow.select();
                }
            });
        }

        // Auto calc button
        const autoCalcBtn = document.getElementById("inv-auto-calc-btn");
        if (autoCalcBtn) {
            autoCalcBtn.addEventListener("click", () => {
                recalculateInvoiceTotals(false);
            });
        }

        // Discount & Tax inputs
        const discountInput = document.getElementById("inv-discount-amount");
        const taxInput = document.getElementById("inv-tax-percent");
        if (discountInput) discountInput.addEventListener("input", () => recalculateInvoiceTotals(false));
        if (taxInput) taxInput.addEventListener("input", () => recalculateInvoiceTotals(false));

        // Generate button
        const generateBtn = document.getElementById("inv-btn-generate");
        if (generateBtn) {
            generateBtn.addEventListener("click", handleGenerateCustomizedInvoice);
        }

        // Close on clicking overlay outside card
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                closeInvoiceCustomizerModal();
            }
        });

        // Close on Escape key
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && modal.classList.contains("is-open")) {
                closeInvoiceCustomizerModal();
            }
        });
    }

    function showSuccessNotification(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #15803d;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: 600;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            z-index: 1000000;
            animation: slideIn 0.3s ease-in-out;
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 3200);
    }

    function setupEventListeners() {
        const nextBtn = document.getElementById("next");
        const prevBtn = document.getElementById("previous");
        const searchBtn = document.getElementById("search-btn");
        const clearBtn = document.getElementById("clearfield");
        const rejectBtn = document.getElementById("rejectBtn");

        if (nextBtn && !nextBtn.dataset.listenerBound) {
            nextBtn.dataset.listenerBound = "true";
            nextBtn.addEventListener("click", () => {
                if (currentPage < totalPages) {
                    fetchBookings(currentPage + 1);
                }
            });
        }

        if (prevBtn && !prevBtn.dataset.listenerBound) {
            prevBtn.dataset.listenerBound = "true";
            prevBtn.addEventListener("click", () => {
                if (currentPage > 1) {
                    fetchBookings(currentPage - 1);
                }
            });
        }

        if (searchBtn && !searchBtn.dataset.listenerBound) {
            searchBtn.dataset.listenerBound = "true";
            searchBtn.addEventListener("click", () => {
                triggerSearch(1);
            });
        }

        if (clearBtn && !clearBtn.dataset.listenerBound) {
            clearBtn.dataset.listenerBound = "true";
            clearBtn.addEventListener("click", () => {
                resetFilters();
                fetchBookings(1);
            });
        }

        filterIds.forEach((id) => {
            const element = document.getElementById(id);
            if (!element || element.dataset.enterBound) return;

            element.dataset.enterBound = "true";
            element.addEventListener("keydown", (event) => {
                if (event.key !== "Enter") return;

                event.preventDefault();
                if (validateDateRange()) {
                    triggerSearch(1, 250);
                }
            });
        });

        if (sendMessageBtn && !sendMessageBtn.dataset.listenerBound) {
            sendMessageBtn.dataset.listenerBound = "true";
            sendMessageBtn.addEventListener("click", async function () {
                const Input = document.getElementById("messageInput");
                if (!Input) return;

                const messageInput = Input.value.trim();
                const receiver = Input.getAttribute("data-created-by");
                const bookingId = Input.getAttribute("data-booking-id");

                if (!messageInput) {
                    return alert("message field is empty");
                }

                try {
                    const response = await fetch(`${BASE_URL}/api/v1/user/saveConversation`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            senderId: userId,
                            receiverId: receiver,
                            bookingId,
                            message: messageInput
                        }),
                    });

                    if (!response.ok) {
                        throw new Error("Failed to send data to API");
                    }

                    await response.json();
                    alert("message sent successfully");
                    displayMessages([{
                        senderId: userId,
                        message: messageInput
                    }]);
                    Input.value = "";
                } catch (error) {
                    console.error("Error sending message:", error);
                }
            });
        }

        if (closePopupBtn && !closePopupBtn.dataset.listenerBound) {
            closePopupBtn.dataset.listenerBound = "true";
            closePopupBtn.addEventListener("click", closePopup);
        }

        if (rejectBtn && !rejectBtn.dataset.listenerBound) {
            rejectBtn.dataset.listenerBound = "true";
            rejectBtn.addEventListener("click", async function () {
                const messageInput = document.getElementById("messageInput");
                if (!messageInput) return;

                const bookingId = messageInput.getAttribute("data-booking-id");
                if (bookingId) {
                    await rejectBooking(bookingId);
                }
            });
        }

        // Select All Checkbox
        const selectAllCheckbox = document.getElementById("selectAllCases");
        if (selectAllCheckbox && !selectAllCheckbox.dataset.listenerBound) {
            selectAllCheckbox.dataset.listenerBound = "true";
            selectAllCheckbox.addEventListener("change", function () {
                const checkboxes = document.querySelectorAll("#tbody .case-checkbox:not(:disabled)");
                checkboxes.forEach(cb => {
                    cb.checked = selectAllCheckbox.checked;
                });
                updateCasesSelectionState();
            });
        }

        // Download Selected Cases Button
        const downloadSelectedBtn = document.getElementById("downloadSelectedCases");
        if (downloadSelectedBtn && !downloadSelectedBtn.dataset.listenerBound) {
            downloadSelectedBtn.dataset.listenerBound = "true";
            downloadSelectedBtn.addEventListener("click", downloadSelectedReports);
        }

        // Merge Selected Cases Button
        const mergeSelectedBtn = document.getElementById("mergeSelectedCases");
        if (mergeSelectedBtn && !mergeSelectedBtn.dataset.listenerBound) {
            mergeSelectedBtn.dataset.listenerBound = "true";
            mergeSelectedBtn.addEventListener("click", mergeSelectedReports);
        }

        // Letterhead Format Toggle
        const letterheadSeg = document.getElementById("allcases-letterhead-seg");
        if (letterheadSeg && !letterheadSeg.dataset.listenerBound) {
            letterheadSeg.dataset.listenerBound = "true";
            syncLetterheadUI(getLetterheadPreference());
            letterheadSeg.addEventListener("click", function (e) {
                const btn = e.target.closest(".seg-option");
                if (!btn) return;
                const value = btn.getAttribute("data-value");
                setLetterheadPreference(value);
            });
        }
    }

    setupEventListeners();
    await fetchBookings(1);
}

async function initialization() {
    const loader = document.querySelector(".loader");
    if (loader) {
        loader.style.display = "flex";
    }
    try {
        await allcases();
    } catch (error) {
        console.log(error);
    } finally {
        if (loader) {
            loader.style.display = "none";
        }
    }
}

initialization();

// ✅ REMOVED: toggleDropdown function - no longer needed
// Dropdown functionality now handled via event delegation

function clearFields() {
    const regNoEl = document.getElementById("reg-no");
    const patientNameEl = document.getElementById("patient-name");
    const genderEl = document.getElementById("gender");
    const patientPhoneEl = document.getElementById("patient-phone");
    const doctorNameEl = document.getElementById("franchisee");
    const barcodeEl = document.getElementById("barcode");
    const labNameEl = document.getElementById("lab-name");
    const statusEl = document.getElementById("status");
    const startDateEl = document.getElementById("start-date");
    const endDateEl = document.getElementById("end-date");

    if (regNoEl) regNoEl.value = "";
    if (patientNameEl) patientNameEl.value = "";
    if (genderEl) genderEl.value = "";
    if (patientPhoneEl) patientPhoneEl.value = "";
    if (doctorNameEl) doctorNameEl.value = "";
    if (barcodeEl) barcodeEl.value = "";
    if (labNameEl) labNameEl.value = "";
    if (statusEl) statusEl.value = "";
    if (startDateEl) startDateEl.value = "";
    if (endDateEl) endDateEl.value = "";

    const tbody = document.getElementById("tbody");
    if (tbody) {
        const rows = tbody.querySelectorAll("tr");
        rows.forEach((row) => (row.style.display = ""));
    }
}
