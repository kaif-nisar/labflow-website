
let allRows = []; // ✅ Store all rows for search functionality

// ============= Utility Functions =============

function getLast24HoursDate() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return yesterday.toISOString().split('T')[0];
}

function getTodayDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

function setDefaultDates() {
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    startDateInput.value = getLast24HoursDate();
    endDateInput.value = getTodayDate();
}

// ============= FIXED: Fetch Bookings with Loader =============
async function fetchBookings(startDate = '', endDate = '', franchiseeId = '') {
    console.log('Fetching with franchiseeId:', franchiseeId);

    if (!franchiseeId) {
        franchiseeId = userId;
    }

    const tableBody = document.querySelector('.table-container tbody');
    const loader = document.querySelector('#loader1');

    let query = `?startDate=${startDate}&endDate=${endDate}`;
    if (franchiseeId) {
        query += `&franchiseeId=${franchiseeId}`;
    }

    try {
        // ✅ Show loader
        loader.style.display = 'flex';

        const response = await fetch(`${BASE_URL}/api/v1/user/all-bookings${query}`);
        if (!response.ok) throw new Error('Failed to fetch bookings');

        const result = await response.json();
        console.log('API Response:', result);

        // ✅ Handle different response structures
        let bookings = [];

        if (Array.isArray(result)) {
            bookings = result;
        } else if (result.data && Array.isArray(result.data)) {
            bookings = result.data;
        } else if (result.bookings && Array.isArray(result.bookings)) {
            bookings = result.bookings;
        } else {
            console.log('No bookings data found');
            bookings = [];
        }

        // ✅ Clear table
        tableBody.innerHTML = '';

        // ✅ Show "No data" message if empty
        if (bookings.length === 0) {
            tableBody.innerHTML = `
                        <tr>
                            <td colspan="7" style="padding: 20px; text-align: center; color: #666;">
                                <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 10px; display: block;"></i>
                                No bookings found
                            </td>
                        </tr>
                    `;
            allRows = [];
            return;
        }

        const fragment = document.createDocumentFragment();

        bookings.forEach((booking, index) => {
            const tests = Array.isArray(booking.tableData)
                ? booking.tableData.map(test => `${test.testName} (${test.typeOfSample}) - ${test.barcodeId}`).join('<br>')
                : 'No tests available';

            const sampleId = Array.isArray(booking.tableData) && booking.tableData[0]?.barcodeId
                ? booking.tableData[0].barcodeId
                : 'N/A';

            const row = document.createElement('tr');

            let rowColor;
            switch (booking.status) {
                case 'On Hold':
                    rowColor = 'rgba(255, 0, 0, 0.1)';
                    break;
                case 'pending':
                    rowColor = 'rgba(255, 165, 0, 0.1)';
                    break;
                case 'completed':
                    rowColor = 'rgba(0, 255, 0, 0.1)';
                    break;
                default:
                    rowColor = 'transparent';
            }

            row.style.backgroundColor = rowColor;

            row.innerHTML = `
                        <td>${index + 1}</td>
                        <td><a href="#" class="download-link" data-booking-id="${booking.bookingId}">${booking.bookingId}</a></td>
                        <td>${booking.patientName}</td>
                        <td>${booking.gender} (${booking.year})</td>
                        <td>${tests}</td>
                        <td>
                            <div style="font-family:monospace;font-size:12.5px;">${Array.isArray(booking.tableData) ? Array.from(new Set(booking.tableData.map(t => t.barcodeId).filter(Boolean))).join(', ') || 'N/A' : (sampleId || 'N/A')}</div>
                            <button type="button" class="lf-row-print-barcodes" data-booking-id="${booking.bookingId}" style="margin-top:4px;display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:6px;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;font-size:11.5px;font-weight:700;cursor:pointer;" title="Print Sample Tube Barcode Stickers">
                                <i class="fas fa-barcode"></i> Print Labels
                            </button>
                        </td>
                        <td style="font-weight: bold;">${booking.status}</td>
                    `;
            fragment.appendChild(row);
        });

        tableBody.appendChild(fragment);

        // ✅ Update allRows for search functionality
        allRows = Array.from(tableBody.querySelectorAll('tr'));

    } catch (error) {
        console.error('Error fetching bookings:', error);
        tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" style="padding: 20px; text-align: center; color: #dc3545;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 10px; display: block;"></i>
                            Failed to load bookings. Please check your connection.
                        </td>
                    </tr>
                `;
        allRows = [];
    } finally {
        // ✅ Hide loader
        loader.style.display = 'none';
    }
}

// ============= FIXED: Sub-franchisee Function =============
async function subfranchisee() {
    try {
        const response = await fetch(`${BASE_URL}/api/v1/user/get-super-franchisee?userId=${userId}`, {
            method: "GET"
        });

        if (!response.ok) {
            console.log('Sub-franchisees not available, skipping...');
            return;
        }

        const allsubfran = await response.json();
        const subFranchiseeSelect = document.getElementById('franchisee-select');

        let subFranchisees = [];

        if (Array.isArray(allsubfran)) {
            subFranchisees = allsubfran;
        } else if (allsubfran.message && Array.isArray(allsubfran.message)) {
            subFranchisees = allsubfran.message;
        } else if (allsubfran.data && Array.isArray(allsubfran.data)) {
            subFranchisees = allsubfran.data;
        }

        if (subFranchisees.length === 0) {
            console.log('No sub-franchisees found');
            return;
        }

        subFranchisees.forEach(subfran => {
            const testElement = document.createElement('option');
            testElement.classList.add('subFranchisee-option');
            testElement.setAttribute("data-id", subfran._id);
            testElement.innerText = subfran.fullName || subfran.name || 'Unknown';
            subFranchiseeSelect.appendChild(testElement);
        });

    } catch (error) {
        console.log('Sub-franchisees could not be loaded, continuing...');
    }
}

// ============= PDF Download Function =============
document.querySelector(".table-container").addEventListener("click", async function (event) {
    const target = event.target;
    const anchor = target.closest("a.download-link");

    if (anchor) {
        event.preventDefault();
        const bookingId = anchor.getAttribute('data-booking-id');
        const row = anchor.closest('tr');
        const patientName = row.cells[2].textContent.trim();

        const loader = document.querySelector('#loader1');

        try {
            loader.style.display = 'flex';

            // Fetch report data
            const reportResponse = await fetch(`${BASE_URL}/api/v1/user/ReportData`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ value1: bookingId })
            });

            if (!reportResponse.ok) throw new Error('Failed to fetch report data');

            const patientDetails = await reportResponse.json();

            // Generate PDF
            const pdfResponse = await fetch(`${BASE_URL}/api/v1/user/get-pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    value1: patientDetails._id,
                    checkBox: true
                })
            });

            if (!pdfResponse.ok) throw new Error('PDF generation failed');

            const pdfBlob = await pdfResponse.blob();
            const pdfUrl = URL.createObjectURL(pdfBlob);

            const link = document.createElement('a');
            link.href = pdfUrl;
            link.download = `${patientName}_Report.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(pdfUrl);

        } catch (error) {
            console.error('Error downloading report:', error);
            alert('Failed to download report. Please try again.');
        } finally {
            loader.style.display = 'none';
        }
    }
});

// ============= Initialize =============
(async function loadBookings() {
    setDefaultDates();
    await subfranchisee();

    const startDate = getLast24HoursDate();
    const endDate = getTodayDate();
    await fetchBookings(startDate, endDate);
})();

// ============= Search Button =============
async function openSubFranBookingBarcodes(bookingIds) {
    const cleanIds = Array.from(new Set((bookingIds || []).map(id => String(id || '').trim()).filter(Boolean)));
    if (!cleanIds.length) return;
    const ensureScript = (src) => new Promise((resolve) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
    });
    if (typeof window.JsBarcode !== 'function') await ensureScript('/vendor/jsbarcode/JsBarcode.all.min.js');
    if (!window.LabFlowBarcode || window.LabFlowBarcode.__version !== 2) await ensureScript('/js/barcodePrintEngine.js?v=2');
    if (window.LabFlowBarcode && typeof window.LabFlowBarcode.openBookingPrintModal === 'function') {
        window.LabFlowBarcode.openBookingPrintModal({
            title: cleanIds.length === 1 ? `Print Sample Tube Labels — #${cleanIds[0]}` : `Bulk Print Tube Labels (${cleanIds.length} Bookings)`,
            bookingIds: cleanIds
        });
    }
}

(function bindSubFranBarcodeActions() {
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer && !tableContainer.dataset.lfBarcodeBound) {
        tableContainer.dataset.lfBarcodeBound = '1';
        tableContainer.addEventListener('click', function (e) {
            const btn = e.target.closest('.lf-row-print-barcodes');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            const bId = btn.getAttribute('data-booking-id');
            if (bId) openSubFranBookingBarcodes([bId]);
        });
    }
    const searchBtn = document.querySelector('#search-button');
    if (searchBtn && searchBtn.parentElement && !document.getElementById('lf-bulk-print-subfran-btn')) {
        const bulkBtn = document.createElement('button');
        bulkBtn.type = 'button';
        bulkBtn.id = 'lf-bulk-print-subfran-btn';
        bulkBtn.style.cssText = 'background:#4f46e5;color:#fff;padding:0 14px;height:40px;border-radius:6px;font-weight:600;display:inline-flex;align-items:center;gap:6px;border:none;cursor:pointer;white-space:nowrap;';
        bulkBtn.innerHTML = '<i class="fas fa-barcode"></i> Print All Barcodes';
        bulkBtn.addEventListener('click', function () {
            const ids = Array.from(document.querySelectorAll('.table-container tbody tr'))
                .filter(r => r.style.display !== 'none')
                .map(r => r.querySelector('.lf-row-print-barcodes')?.getAttribute('data-booking-id'))
                .filter(Boolean);
            if (!ids.length) {
                alert('No bookings visible to print barcodes.');
                return;
            }
            openSubFranBookingBarcodes(ids);
        });
        searchBtn.insertAdjacentElement('afterend', bulkBtn);
    }
})();

document.querySelector('#search-button').addEventListener('click', function () {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    const franchiseeSelect = document.getElementById('franchisee-select');
    const selectedOption = franchiseeSelect.options[franchiseeSelect.selectedIndex];
    const franchiseeId = selectedOption ? selectedOption.getAttribute('data-id') : null;

    fetchBookings(startDate, endDate, franchiseeId);
});

// ============= Search Functionality =============
const searchInput = document.getElementById('search');
searchInput.addEventListener('input', function (e) {
    const searchTerm = e.target.value.toLowerCase().trim();

    if (!searchTerm) {
        allRows.forEach(row => {
            row.style.display = '';
        });
        return;
    }

    allRows.forEach(row => {
        const cells = Array.from(row.cells);
        const rowText = cells.map(cell => {
            return cell.textContent || cell.innerText;
        }).join(' ').toLowerCase();

        if (rowText.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
});
