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

    function openEditBookingPage(booking, row) {
        saveBookingToLocalStorage(booking, row);
        loadPage('editbooking', booking.bookingId);
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

    function displayBookings(bookings) {
        const tableBody = document.getElementById("tbody");
        tableBody.innerHTML = "";

        if (!bookings.length) {
            tableBody.innerHTML = `<tr><td colspan="7">No bookings found for selected filters.</td></tr>`;
            return;
        }

        bookings.forEach((booking) => {
            if (booking.status === "cancelled" || booking.status === "On Hold") {
                return;
            }

            const row = document.createElement("tr");

            // Unique test names
            const testNamesArray = [...new Set(
                booking.tableData.flatMap(obj => obj.testName.split(",").map(name => name.trim()))
            )];
            const uniqueTestNames = testNamesArray.join(", ");

            // Set custom attributes
            row.setAttribute("data-test-names", uniqueTestNames);
            row.setAttribute("age", booking.year);
            row.setAttribute("gender", booking.gender);
            row.setAttribute("data-booking-id", booking.bookingId);
            row.setAttribute("data-patient-phone", booking.patientPhone);
            row.setAttribute("data-lab-name", booking.labName);
            row.setAttribute("data-updated-at", booking.updatedAt);
            row.setAttribute("data-created-by", booking.createdBy);
            row.setAttribute("data-booking", JSON.stringify(booking));

            // Status-based background color
            let baseColor = booking.status === 'completed'
                ? 'rgba(0, 128, 0, 0.342)'
                : booking.status === 'pending'
                    ? 'rgba(141, 92, 2, 0.333)'
                    : booking.status === 'Hold'
                        ? 'rgba(120, 32, 0, 0.356)'
                        : 'rgba(0, 143, 143, 0.333)';

            // Add LIS gradient if data is present
            if (booking.isLisPresent) {
                row.style.background = `linear-gradient(to right, rgba(138, 43, 226, 0.4) 0%, rgba(138, 43, 226, 0.15) 8px, ${baseColor} 8px)`;
            } else {
                row.style.backgroundColor = baseColor;
            }

            // Create barcode HTML with LIS indicators
            let barcodeHtml = '';
            if (booking.barcodeDetails && booking.barcodeDetails.length > 0) {
                barcodeHtml = booking.barcodeDetails.map(detail => {
                    const icon = detail.isLisPresent 
                        ? '<i class="fa-solid fa-circle-check" style="color: #28a745; margin-right: 3px;"></i>' 
                        : '<i class="fa-solid fa-circle-xmark" style="color: #dc3545; margin-right: 3px;"></i>';
                    
                    return `<span style="display: inline-flex; align-items: center; margin: 2px 4px 2px 0; white-space: nowrap;" title="${detail.isLisPresent ? 'LIS data available' : 'LIS data not available'}">${icon}${detail.barcode}</span>`;
                }).join('');
            } else {
                barcodeHtml = Array.isArray(booking.acceptedbarcode) ? booking.acceptedbarcode.join(" ") : "";
            }

            // HTML for row - ✅ REMOVED onclick from three dots icon
            if (booking.isreportready) {
                const amountOrBarcodeCell = islayerone
                    ? `<td style="text-align: right; font-weight: 500;">₹ ${(booking.total || 0).toFixed(2)}</td>`
                    : `<td style="white-space: normal;">${barcodeHtml}</td>`;

                row.innerHTML = `
                <td class="reg-no">${booking.bookingId}</td>
                <td>${formatBookingDateTime(booking.date, booking.time)}</td>
                <td>${booking.patientName}</td>
                <td>${islayerone ? (booking.doctorName || "") : (booking.createdbyuser || "")}</td>
                ${amountOrBarcodeCell}
                <td><button class="status-btn">${booking.status}</button></td>
                <td class="actions">
                    <div class="enter-result">
                        <a data-page="reportFormat" class="edit-report"><i class="fa-solid fa-pen-to-square"></i> View report</a>
                    </div>
                    <i class="fas fa-ellipsis-h more-options" title="More Actions"></i>
                    <div class="allcases-dropdown-menu" style="display: none;">
                        <a data-page="labreport" class="download-report" target="_blank"><i class="fa-solid fa-pen-to-square"></i> Enter result</a>
                        <a class="action-btn generate-bill-btn"><i class="fa-solid fa-file-invoice"></i> Generate Bill</a>
                        <a class="action-btn edit-booking" target="_blank"><i class="fa-solid fa-file-pen"></i> Edit Booking</a>
                        <a class="action-btn hold-btn" target="_blank"><i class="fa-solid fa-hands-holding"></i> Hold</a>
                        <a class="action-btn clinical-btn" target="_blank"><i class="fa-solid fa-house-chimney-medical"></i> clinical</a>
                    </div>
                </td>`;
            } else {
                const amountOrBarcodeCell = islayerone
                    ? `<td style="text-align: right; font-weight: 500;">₹ ${(booking.total || 0).toFixed(2)}</td>`
                    : `<td style="white-space: normal;">${barcodeHtml}</td>`;

                row.innerHTML = `
                <td class="reg-no">${booking.bookingId}</td>
                <td>${formatBookingDateTime(booking.date, booking.time)}</td>
                <td>${booking.patientName}</td>
                <td>${islayerone ? (booking.doctorName || "") : (booking.createdbyuser || "")}</td>
                ${amountOrBarcodeCell}
                <td><button class="status-btn">${booking.status}</button></td>
                <td class="actions">
                    <div class="enter-result">
                        <a data-page="labreport" class="view-bill"><i class="fa-solid fa-pen-to-square"></i> Enter result</a>
                    </div>
                    <i class="fas fa-ellipsis-h more-options" title="More Actions"></i>
                    <div class="allcases-dropdown-menu" style="display: none;">
                        <a class="action-btn edit-booking" target="_blank"><i class="fa-solid fa-file-pen"></i> Edit Booking</a>
                        <a class="action-btn generate-bill-btn"><i class="fa-solid fa-file-invoice"></i> Generate Bill</a>
                        <a class="action-btn hold-btn" target="_blank"><i class="fa-solid fa-hands-holding"></i> Hold</a>
                        <a class="action-btn clinical-btn" target="_blank"><i class="fa-solid fa-house-chimney-medical"></i> clinical</a>
                        <a class="action-btn cancel-btn" target="_blank"><i class="fa-solid fa-rectangle-xmark"></i> Cancel</a>
                    </div>
                </td>`;
            }

            tableBody.appendChild(row);
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
        const cancelAction = booking.isreportready
            ? ""
            : `<a class="action-btn cancel-btn" target="_blank"><i class="fa-solid fa-rectangle-xmark"></i> Cancel</a>`;

        return `
            <div class="case-action-group">
                ${primaryAction}
                ${secondaryAction}
                <button type="button" class="more-options" title="More Actions" aria-label="More Actions">
                    <i class="fas fa-ellipsis-h"></i>
                </button>
                <div class="allcases-dropdown-menu" style="display: none;">
                    <a class="action-btn generate-bill-btn"><i class="fa-solid fa-file-invoice"></i> Generate Bill</a>
                    <button type="button" class="action-btn generate-trf-btn"><i class="fa-solid fa-receipt"></i> Generate TRF</button>
                    <a class="action-btn edit-booking" target="_blank"><i class="fa-solid fa-file-pen"></i> Edit Booking</a>
                    <a class="action-btn hold-btn" target="_blank"><i class="fa-solid fa-hands-holding"></i> Hold</a>
                    <a class="action-btn clinical-btn" target="_blank"><i class="fa-solid fa-house-chimney-medical"></i> Clinical</a>
                    ${cancelAction}
                </div>
            </div>
        `;
    }

    function displayBookings(bookings) {
        const tableBody = document.getElementById("tbody");
        if (!tableBody) return;

        tableBody.innerHTML = "";

        if (!Array.isArray(bookings) || bookings.length === 0) {
            setTableState("No bookings found for selected filters.");
            return;
        }

        let renderedRows = 0;

        bookings.forEach((booking) => {
            if (!booking || booking.status === "cancelled" || booking.status === "On Hold") {
                return;
            }

            const row = document.createElement("tr");
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
                <td class="reg-no">${booking.bookingId || "--"}</td>
                <td class="booking-date-cell">${bookingDateTime}</td>
                <td>${booking.patientName || "--"}</td>
                <td>${islayerone ? (booking.doctorName || "--") : (booking.createdbyuser || "--")}</td>
                ${amountOrBarcodeCell}
                <td><button class="status-btn">${booking.status || "pending"}</button></td>
                <td class="actions">${buildActionCell(booking)}</td>`;

            tableBody.appendChild(row);
            renderedRows += 1;
        });

        if (renderedRows === 0) {
            setTableState("No bookings found for selected filters.");
        }
    }

    // Event delegation for table actions
    const tableBody = document.getElementById("tbody");
    if (tableBody && !tableBody.dataset.actionsBound) {
        tableBody.dataset.actionsBound = "true";
        tableBody.addEventListener("click", async function (e) {
            e.stopImmediatePropagation();
            e.preventDefault();
            const target = e.target.closest("a, button, .more-options");
            if (!target) return;

            // ✅ NEW: Handle three dots dropdown toggle
            if (target.classList.contains("more-options")) {
                const dropdown = target.nextElementSibling;
                if (dropdown && dropdown.classList.contains("allcases-dropdown-menu")) {
                    // Close all other dropdowns first
                    document.querySelectorAll(".allcases-dropdown-menu").forEach(dd => {
                        if (dd !== dropdown) dd.style.display = "none";
                    });
                    // Toggle current dropdown
                    dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
                }
                return;
            }

            const row = target.closest("tr");
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
                saveBookingToLocalStorage(booking, row);
                window.location.href = `${BASE_URL}/admin/admin.html?page=labreport`;
            }
            else if (target.classList.contains("edit-booking")) {
                openEditBookingPage(booking, row);
            }
            else if (target.classList.contains("hold-btn")) {
                const confirmation = window.confirm("Are you want to update the status as 'Hold'");
                if (!confirmation) return;

                await updatebookingStatus(bookingId, "Hold");

                if (user.tenantId.modelType !== "1layer") {
                    showPopup(bookingId, createdBy);
                    await fetchMessages(bookingId);
                }

                await fetchBookings(currentPage);
            }
            else if (target.classList.contains("clinical-btn")) {
                const confirmation = window.confirm("Are you want to update the status as 'clinical'");
                if (!confirmation) return;

                await updatebookingStatus(bookingId, "clinical");

                if (user.tenantId.modelType !== "1layer") {
                    showPopup(bookingId, createdBy);
                    await fetchMessages(bookingId);
                }

                await fetchBookings(currentPage);
            }
            else if (target.classList.contains("cancel-btn")) {
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
                        if (user.tenantId.modelType !== "1layer") {
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

                    if (error.message.includes('Network')) {
                        errorMessage += 'Please check your internet connection.';
                    } else if (error.message.includes('timeout')) {
                        errorMessage += 'Request timed out. Please try again.';
                    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                        errorMessage += 'Session expired. Please login again.';
                    } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
                        errorMessage += 'You do not have permission to cancel this booking.';
                    } else if (error.message.includes('404')) {
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
            else if (target.classList.contains("generate-bill-btn")) {
                const booking = JSON.parse(row.getAttribute("data-booking"));
                generateBillPDF(booking, target);
            }
            else if (target.classList.contains("generate-trf-btn")) {
                const bookingIdForTrf = booking?.bookingId || row.getAttribute("data-booking-id");
                if (!bookingIdForTrf) {
                    alert("Booking ID not found for this case.");
                    return;
                }

                const dropdown = target.closest(".allcases-dropdown-menu");
                if (dropdown) {
                    dropdown.style.display = "none";
                }

                const trfUrl = `${BASE_URL}/api/v1/user/bookings/${encodeURIComponent(bookingIdForTrf)}/trf-slip`;
                const newWindow = window.open(trfUrl, "_blank", "noopener,noreferrer");
            }
        });

        // ✅ NEW: Close dropdowns when clicking outside
        if (!document.body.dataset.allCasesDropdownBound) {
            document.body.dataset.allCasesDropdownBound = "true";
            document.addEventListener("click", (event) => {
            if (!event.target.closest(".more-options") && !event.target.closest(".allcases-dropdown-menu")) {
                document.querySelectorAll(".allcases-dropdown-menu").forEach((dropdown) => {
                    dropdown.style.display = "none";
                });
            }
            });
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
            console.log(error)
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
        if (!messagesDiv) return;

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
        const regId = row.cells[0].innerText;
        localStorage.setItem("booking", JSON.stringify(booking));
        localStorage.setItem("regId", JSON.stringify(regId));
        sessionStorage.setItem("booking", JSON.stringify(booking));
        sessionStorage.setItem("regId", JSON.stringify(regId));
    }

    function getInvoiceCSS() {
        return `
        * {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .container-pdf {
            max-width: 800px;
            margin: 0 auto;
            border: 1px solid #ccc;
            padding: 20px;
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

    function generateInvoiceHTML(booking) {
        // Get test names
        const testNamesArray = [...new Set(
            booking.tableData.flatMap(obj => obj.testName.split(",").map(name => name.trim()))
        )];

        // Create test table rows
        let testTableRows = '';
        testNamesArray.forEach((test, index) => {
            testTableRows += `<tr><td>${index + 1}</td><td>${test}</td></tr>`;
        });

        // Format date and time
        const bookingDate = new Date(booking.date).toLocaleDateString();
        const bookingTime = new Date("1970-01-01T" + booking.time)
            .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        // Get lab logo if available
        const logoImg = user.tenantId?.logo ? `<img id="bill-logo" src="${user.tenantId.logo}" style="width: 250px; height: 125px;">` : '';

        // Build HTML
        const html = `
        <div class="container-pdf">
            <div class="header upper-header">
                <div>
                    <h1>INVOICE</h1>
                    <p>#Bill${booking._id}</p>
                    <p>Invoice Date: ${new Date().toLocaleDateString()}</p>
                </div>
                <div class="image-div">
                    ${logoImg}
                </div>
            </div>
            <div class="patient-details">
                <div style="display: flex; justify-content: space-between;">
                    <div>
                        <p><strong>Patient Details :</strong></p>
                        <p class="blue">${booking.patientName}</p>
                        <p>${booking.year} | ${booking.gender}</p>
                    </div>
                    <div style="text-align: right;">
                        <p><strong>Booking Id : ${booking.bookingId}</strong></p>
                        <p>Booking Time : ${bookingDate} ${bookingTime}</p>
                    </div>
                </div>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Test Name</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${testTableRows}
                    </tbody>
                </table>
            </div>
            <div style="background-color: white; border-radius: 8px;">
                <div class="header">
                    <h1>Grand Total</h1>
                    <span>₹ ${booking.total ? booking.total.toFixed(2) : '0.00'}</span>
                </div>
                <p class="note">** No refund is available after booking.</p>
                <div class="stamp">
                    <span>This Bill is Generated by www.LabFlow</span>
                </div>
            </div>
        </div>
        `;

        return html;
    }

    async function generateBillPDF(booking, button) {
        try {
            // Validate required fields
            if (!booking.bookingId || !booking.total) {
                alert('Missing booking information. Cannot generate bill.');
                return;
            }

            // Show loading state
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fa-solid fa-spinner"></i> Generating...';
            button.disabled = true;

            // Generate invoice HTML and CSS
            const invoiceHtml = generateInvoiceHTML(booking);
            const invoicecss = getInvoiceCSS();
            const billnumber = `#Bill${booking._id}`;

            // Call API
            const response = await fetch(`${BASE_URL}/api/v1/user/invoicepdfgenerator`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    invoiceHtml,
                    billnumber,
                    bookingId: booking.bookingId,
                    invoicecss,
                    billingPrice: Number(booking.total),
                    generatedBy: userId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Get PDF as blob
            const pdfblob = await response.blob();
            if (pdfblob.size === 0) {
                throw new Error('Empty PDF received');
            }

            // Create download URL and trigger download
            const pdfUrl = URL.createObjectURL(pdfblob);
            const anchor = document.createElement("a");
            anchor.href = pdfUrl;
            anchor.download = `${booking.patientName}-invoice.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);

            // Optional: Update bill generated flag
            try {
                await fetch(`${BASE_URL}/api/v1/user/updategeneratedbillvariable/${booking.bookingId}`);
            } catch (err) {
                console.log('Could not update bill generated flag:', err);
            }

            // Close dropdown
            const dropdown = button.closest(".allcases-dropdown-menu");
            if (dropdown) dropdown.style.display = "none";

            // Show success message
            showSuccessNotification('Bill generated successfully');

        } catch (error) {
            console.error('Error generating bill:', error);
            alert(`Error generating bill: ${error.message}`);
        } finally {
            // Restore button state
            button.innerHTML = '<i class="fa-solid fa-file-invoice"></i> Generate Bill';
            button.disabled = false;
        }
    }

    function showSuccessNotification(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 12px 20px;
            border-radius: 5px;
            z-index: 9999;
            animation: slideIn 0.3s ease-in-out;
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    function setupEventListeners() {
        const nextBtn = document.getElementById("next");
        const prevBtn = document.getElementById("previous");
        const searchBtn = document.getElementById("search-btn");
        const clearBtn = document.getElementById("clearfield");
        const rejectBtn = document.getElementById('rejectBtn');

        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                if (currentPage < totalPages) fetchBookings(currentPage + 1);
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                if (currentPage > 1) fetchBookings(currentPage - 1);
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener("click", () => {
                fetchBookings(1);
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener("click", () => {
                const regNoEl = document.getElementById("reg-no");
                const patientNameEl = document.getElementById("patient-name");
                const genderEl = document.getElementById("gender");
                const patientPhoneEl = document.getElementById("patient-phone");
                const barcodeEl = document.getElementById("barcode");
                const labNameEl = document.getElementById("lab-name");
                const statusEl = document.getElementById("status");
                const franchiseeEl = document.getElementById("franchisee");
                const startDateEl = document.getElementById("start-date");
                const endDateEl = document.getElementById("end-date");

                if (regNoEl) regNoEl.value = "";
                if (patientNameEl) patientNameEl.value = "";
                if (genderEl) genderEl.value = "";
                if (patientPhoneEl) patientPhoneEl.value = "";
                if (barcodeEl) barcodeEl.value = "";
                if (labNameEl) labNameEl.value = "";
                if (statusEl) statusEl.value = "";
                if (franchiseeEl) franchiseeEl.value = "";
                if (startDateEl) startDateEl.value = "";
                if (endDateEl) endDateEl.value = "";

                fetchBookings(1);
            });
        }

        // Add Enter key listeners to all filter inputs
        const filterIds = [
            'reg-no', 'patient-name', 'franchisee', 'gender',
            'patient-phone', 'barcode', 'lab-name', 'status',
            'start-date', 'end-date'
        ];

        filterIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        if (validateDateRange()) {
                            fetchBookings(1);
                        }
                    }
                });
            }
        });

        if (sendMessageBtn) {
            sendMessageBtn.addEventListener("click", async function () {
                const Input = document.getElementById("messageInput");
                if (!Input) return;

                const messageInput = Input.value.trim();
                const receiver = Input.getAttribute('data-created-by');
                const bookingId = Input.getAttribute('data-booking-id');

                if (!messageInput) {
                    return alert('message field is empty');
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

                    const responseData = await response.json();
                    alert('message sent successfully');
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

        if (closePopupBtn) {
            closePopupBtn.addEventListener("click", closePopup);
        }

        if (rejectBtn) {
            rejectBtn.addEventListener('click', async function () {
                const messageInput = document.getElementById("messageInput");
                if (!messageInput) return;

                const bookingId = messageInput.getAttribute('data-booking-id');
                if (bookingId) {
                    await rejectBooking(bookingId);
                }
            });
        }
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
