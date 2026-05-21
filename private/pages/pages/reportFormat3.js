
(async function () {
    async function ensureReportActionHelpersLoaded() {
        if (window.ReportActionHelpers) {
            return window.ReportActionHelpers;
        }

        if (typeof window.loadScript === 'function') {
            await window.loadScript(`pages/pages/reportAction.shared.js?t=${Date.now()}`);
            return window.ReportActionHelpers || {};
        }

        const existingScript = document.querySelector('script[data-report-action-helper="true"]');
        if (existingScript) {
            await new Promise((resolve, reject) => {
                existingScript.addEventListener('load', resolve, { once: true });
                existingScript.addEventListener('error', reject, { once: true });
                setTimeout(resolve, 1500);
            });
            return window.ReportActionHelpers || {};
        }

        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `pages/pages/reportAction.shared.js?t=${Date.now()}`;
            script.async = false;
            script.dataset.reportActionHelper = 'true';
            script.onload = resolve;
            script.onerror = () => reject(new Error('reportAction.shared.js could not be loaded'));
            document.body.appendChild(script);
        });

        return window.ReportActionHelpers || {};
    }

    await ensureReportActionHelpersLoaded();
    const urlParams = await new URLSearchParams(window.location.search);
    let value1 = await urlParams.get('value1');
    let report = await fetchreport();
    const backgroundImageUrl = await fetchTemplateImages();
    value1 = report._id;
    const baseUrl = `${BASE_URL}/pages/pages/download_reports.html`;
    localStorage.setItem('myKey', value1);
    localStorage.setItem('bookingId', report.bookingId);
    localStorage.setItem('pdfformat', user.pdfFormat);
    const urlWithParam = `${baseUrl}?value=${encodeURIComponent(value1)}&id=${encodeURIComponent(user.tenantId._id)}`;
    const { labinchargeinfo, sign } = await fetchLabSignAndSetInputs();
    let activeSendPdfBlobUrl = null;
    const reportActionHelpers = window.ReportActionHelpers || {};
    const downloadPdfButton = document.getElementById('downloadPDF');
    const emailReportButton = document.getElementById('sendReport');
    const printReportButton = document.getElementById('BrowserPrint');
    const emailStatusMessage = document.getElementById('emailStatusMessage');

    const normalizeActionCounters = (counters) =>
        reportActionHelpers.normalizeCounters ? reportActionHelpers.normalizeCounters(counters) : (counters || {});

    const normalizeActionHistory = (history) =>
        reportActionHelpers.normalizeActionHistory ? reportActionHelpers.normalizeActionHistory(history) : (history || {});

    function syncActionButtons(actionState = report) {
        const mergedActionState = reportActionHelpers.mergeQueuedActionStats
            ? reportActionHelpers.mergeQueuedActionStats({
                reportId: value1,
                bookingId: report.bookingId,
                actionCounters: actionState?.actionCounters ?? actionState ?? report.actionCounters,
                actionHistory: actionState?.actionHistory ?? report.actionHistory,
            })
            : {
                actionCounters: actionState?.actionCounters ?? actionState ?? report.actionCounters,
                actionHistory: actionState?.actionHistory ?? report.actionHistory,
            };

        report.actionCounters = normalizeActionCounters(mergedActionState.actionCounters);
        report.actionHistory = normalizeActionHistory(mergedActionState.actionHistory);
        if (reportActionHelpers.applyActionCounts) {
            reportActionHelpers.applyActionCounts({
                downloadButton: downloadPdfButton,
                emailButton: emailReportButton,
                printButton: printReportButton,
                counters: report.actionCounters,
                actionHistory: report.actionHistory
            });
        }
    }

    function setEmailStatus(message = "", type = "info") {
        if (reportActionHelpers.setStatus) {
            reportActionHelpers.setStatus(emailStatusMessage, message, type);
        }
    }

    async function trackSuccessfulAction(action) {
        if (!reportActionHelpers.trackAction) return null;
        try {
            const clientActionId = reportActionHelpers.createActionRequestId
                ? reportActionHelpers.createActionRequestId(action)
                : `${action}-${Date.now()}`;
            const tracked = await reportActionHelpers.trackAction({
                reportId: value1,
                bookingId: report.bookingId,
                action,
                clientActionId,
                currentCounters: report.actionCounters,
                currentHistory: report.actionHistory,
            });
            if (tracked?.actionCounters || tracked?.actionHistory) syncActionButtons(tracked);
            return tracked;
        } catch (error) {
            console.warn(`Unable to track ${action}:`, error);
            return null;
        }
    }

    function resolveDefaultEmail() {
        if (reportActionHelpers.resolveDoctorEmail) {
            return reportActionHelpers.resolveDoctorEmail(report);
        }
        return report?.contactDefaults?.email || report?.savedDoctorEmail || "";
    }

    syncActionButtons(report);

    async function fetchdoctorsandlabsign() {
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/getDoctorsSign`);


            if (!response.ok) {
                console.log("doctor sign is not available");
                return;
            }

            const doctorsdata = await response.json();

            const renderSlot = (flag, src, text) => `
                <div class="left-sign" style="display:${flag ? 'block' : 'none'}; text-align:center;">
                    ${src ? `<img src="${src}" width="100" height="40" />` : `<div style="height:40px;width:100px;"></div>`}
                    <div class="textspan">${text || ''}</div>
                </div>`;

            const signoffdiv = document.querySelector('.signed-off-div');
            signoffdiv.innerHTML = '';
            const div = document.createElement('div');
            div.className = 'signed-off-div2';
            div.innerHTML = `
            ${renderSlot(doctorsdata.showfirstdoctorsign, doctorsdata.firstdoctorsign || "", doctorsdata.firstdoctorsigninfo)}
            ${renderSlot(doctorsdata.showlabinchargesign, doctorsdata.labinchargesign || "", doctorsdata.labinchargeinfo)}
            ${renderSlot(doctorsdata.showseconddoctorsign, doctorsdata.seconddoctorsign || "", doctorsdata.seconddoctorsigninfo)}
            `;
            signoffdiv.appendChild(div);

        } catch (error) {
            console.log(error.message);
        }
    }

    await fetchdoctorsandlabsign();

    // Ye function ek hi jagah handle karega chahe single image ho ya multiple
    async function convertImagesToBase64(selector = '.signed-off-div2 img') {
        const images = document.querySelectorAll(selector); // selector ke hisaab se sabhi images nikalna

        if (images.length === 0) {
            console.warn("Koi image nahi mila is selector ke andar:", selector);
            return;
        }

        try {
            // Har image ko base64 me convert karke uska src update karna
            for (let img of images) {
                img.src = await imageToBase64(img.src);
            }
            console.log(`${images.length} image(s) Base64 me convert ho gaye!`);
        } catch (error) {
            console.error("Error converting images:", error);
        }
    }

    // Image URL ko Base64 string me convert karne wala helper function
    async function imageToBase64(url) {
        const response = await fetch(url);
        const blob = await response.blob();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
        });
    }

    // Example function call
    // 1. Agar multiple images hain ek container me
    await convertImagesToBase64('.signed-off-div2 img');

    async function qrcodegenerator() {
        const button = document.getElementById('button');

        try {
            const response = await fetch(`/api/v1/user/generate-qr`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ link: urlWithParam }),
            });

            if (!response.ok) throw new Error('Failed to generate QR code.');

            const data = await response.json();

            const qrCodeImage = document.getElementById('qrimg');
            qrCodeImage.src = data.qrCode;
            qrCodeImage.style.display = 'block';
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to generate QR code.');
        }
    }

    // ==============================second sending code================================

    document.getElementById('PDFsettinganchr').addEventListener('click', async (event) => {
        event.preventDefault();
        const settingsButton = document.getElementById('PDFsetting');
        const loader = settingsButton?.closest('.downloadDiv')?.querySelector('#loadingOverlay');
        if (loader) loader.style.display = 'flex';
        if (settingsButton) settingsButton.disabled = true;
        // Collecting the required data
        const htmlContent = document.querySelector('.container2').outerHTML;
        const cssContent = document.getElementById('stying').innerHTML;
        const header = document.querySelector('.report-details').outerHTML;
        const footer = document.querySelector('.signed-off-div').outerHTML;
        const investigationmargin = countLines();
        console.log("investigationmargin:", investigationmargin);

        try {
            // Sending data to the backend
            const response = await fetch(`/api/v1/user/adding-pdf-data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    labinchargesign: report.showLabIncharge,
                    htmlContent,
                    cssContent,
                    header,
                    footer,
                    reportId: value1,
                    backgroundImageUrl,
                    investigationmargin
                }),
            });

            if (!response.ok) throw new Error('Data not saved');

            // If the response is OK, allow navigation
            window.location.href = document.getElementById('PDFsettinganchr').href;

        } catch (error) {
            console.error('Error generating PDF:', error);
        } finally {
            if (loader) loader.style.display = 'none';
            if (settingsButton) settingsButton.disabled = false;
        }
    });


    async function sendReport() {
        const sendReportButton = document.getElementById('sendReport');
        const popupModal = document.getElementById('popupModal');
        const closeButton = document.querySelector('.close-button');
        const inputField = document.getElementById('inputField');
        const contactInput = document.getElementById('contactInput');
        const sendButton = document.getElementById('sendButton');
        const iframe = document.getElementById('pdfFrame');
        const openPdfButton = document.getElementById('openPdfButton');

        sendReportButton.addEventListener('click', async (e) => {
            const button = e.currentTarget;
            const loader = button.closest(".downloadDiv")?.querySelector("#loadingOverlay");

            if (!loader) {
                console.error("Loading overlay not found");
                return;
            }

            //saving pdf data into database
            const htmlContent = document.querySelector('.container2').outerHTML;
            const cssContent = document.getElementById('stying').innerHTML;
            const header = document.querySelector('.report-details').outerHTML;
            const footer = document.querySelector('.signed-off-div').outerHTML;
            const investigationmargin = countLines();

            try {
                loader.style.display = 'flex';
                button.disabled = true;
                setEmailStatus();
                const response = await fetch(`/api/v1/user/adding-pdf-data`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        labinchargesign: report.showLabIncharge, htmlContent, cssContent, header,
                        footer, reportId: value1, backgroundImageUrl, investigationmargin
                    }),
                });

                if (!response.ok) throw new Error('data not saved');

                console.log("data added successfully");

            } catch (error) {
                console.error('Error generating PDF:', error);
            }

            try {
                const response = await fetch(`/api/v1/user/get-pdf`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ value1, bookingId: report.bookingId }),
                });

                if (!response.ok) throw new Error('PDF generation failed');
                popupModal.style.display = 'block';
                const pdfBlob = await response.blob();
                if (activeSendPdfBlobUrl) URL.revokeObjectURL(activeSendPdfBlobUrl);
                activeSendPdfBlobUrl = URL.createObjectURL(pdfBlob);
                iframe.src = activeSendPdfBlobUrl;
                inputField.style.display = 'flex';
                contactInput.value = resolveDefaultEmail();
                contactInput.placeholder = 'Enter Email Address';
                contactInput.focus();
            } catch (error) {
                alert('Error generating PDF. Please try again.');
                popupModal.style.display = 'none';
            } finally {
                loader.style.display = 'none';
                button.disabled = false;
            }
        });

        closeButton.addEventListener('click', () => {
            popupModal.style.display = 'none';
            setEmailStatus();
        });

        window.addEventListener('click', (event) => {
            if (event.target === popupModal) {
                popupModal.style.display = 'none';
                setEmailStatus();
            }
        });

        sendButton.onclick = async () => {
            const email = contactInput.value.trim();
            if (!email) {
                setEmailStatus('Please enter a valid email address.', 'error');
                return;
            }
            if (!iframe.src) {
                setEmailStatus('PDF preview ready nahi hai. Please try again.', 'error');
                return;
            }

            sendButton.disabled = true;
            setEmailStatus('Email bheja ja raha hai...', 'info');
            try {
                const payload = await reportActionHelpers.sendPdfByEmail({
                    email,
                    pdfUrl: iframe.src,
                    report
                });
                if (payload?.actionCounters || payload?.actionHistory) syncActionButtons(payload);
                setEmailStatus(payload?.message || 'Email sent successfully.', 'success');
            } catch (error) {
                setEmailStatus(error?.message || 'Internet weak hai, email send nahi hua. Please try again.', 'error');
            } finally {
                sendButton.disabled = false;
            }
        };

        openPdfButton.addEventListener('click', () => {
            if (!iframe.src) {
                setEmailStatus('Preview PDF abhi ready nahi hai.', 'error');
                return;
            }
            window.open(iframe.src, '_blank');
        });
    }

    async function fetchreport() {
        try {
            const response = await fetch(`/api/v1/user/ReportData`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ value1 })
            });

            if (!response.ok) {
                throw new Error("something went wrong")
            }

            // Wait for the response to be parsed as JSON
            return await response.json();

        } catch (error) {
            console.log(error)
        }
    }
    function formatDateTime(timestamp) {
        const date = new Date(timestamp);

        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Ensure 2-digit month
        const day = date.getDate().toString().padStart(2, '0');

        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const amPm = hours >= 12 ? 'PM' : 'AM';

        hours = (hours % 12 || 12).toString().padStart(2, '0'); // Ensure 2-digit hour format

        return `${day}-${month}-${year} <span>${hours}:${minutes} ${amPm}</span>`;
    }

    async function populateHeader() {
        document.getElementById("booking-registeration-number").innerText = report.reg_id;
        console.log("localstorage:", localStorage)
        const booking = JSON.parse(localStorage.getItem('booking'));

        const patientdetails = document.createElement("div");
        patientdetails.classList.add("report-details-innerDiv2");
        patientdetails.innerHTML = `<div class="format1left2">
                <div class="format1-infor-div fixedheightdiv"><div class="format1-tags"><strong>Patient Name:</strong></div><div class="value"><strong>${report.patientName}</strong></div></div>
                <div class="format1-infor-div fixedheightdiv"><div class="format1-tags"><strong>Age / Sex:</strong></div> <div class="value"><strong>${report.year} / ${report.gender}</strong></div></div>
                <div class="format1-infor-div fixedheightdiv"><div class="format1-tags"><strong>Referred By:</strong></div> <div class="value"><strong>${report.doctorName}</strong></div></div>
                <div class="format1-infor-div fixedheightdiv"><div class="format1-tags"><strong>Reg. no:</strong></div> <div class="value"><strong>${report.bookingId}</strong></div></div>
                <div class="format1-infor-div forhide fixedheightdiv"><div class="format1-tags"><strong>Lab Name:</strong></div> <div class="value"><strong>${report.labName}</strong></div></div>
                <div class="format1-infor-div forhide" id="investDiv"><div class="format1-tags"><strong>Investigations:</strong></div> <div class="value"><span id="investigationarray">
                ${report?.uniquetestArray} </span></div></div>
            </div>
            <div class="format1-right2">
                <div>
                    <div class="format1-registered-div2">
                        <div class="format1-registeration-tag2"><strong>Registered on:</strong></div>
                        <div class="format1-time-div">${formatDateTime(new Date(report.date).toISOString().split('T')[0] + "T" + report.time)}</div>
                        </div>
                        <div class="format1-registered-div2 forhide">
                            <div class="format1-registeration-tag2"><strong>Collected on:</strong></div>
                            <div class="format1-time-div">${formatDateTime(report.collectedOn)}</div>
                        </div>
                    <div class="format1-registered-div2 forhide">
                        <div class="format1-registeration-tag2"><strong>Received on:</strong></div>
                        <div class="format1-time-div">${formatDateTime(report.receivedOn)}</div>
                    </div>
                    <div class="format1-registered-div2">
                        <div class="format1-registeration-tag2"><strong>Reported on:</strong></div>
                        <div class="format1-time-div">${formatDateTime(report.reportedOn)}</div>
                    </div>
                </div>
            </div>
            <div class="format1-right3">
                <div class="barcode-div2">
                    <div class="barcode2">
                        <div id="barcodeContainer2">
                            <img id="barcodeImage" alt="Generated Barcode" />
                        </div>
                    </div>
                    <div style="text-align: center;"><strong>Barcodes</strong></div>
                    <div class="barcodenumersdiv">
                    ${booking?.acceptedbarcode?.join(",")?.split(',')}
                    </div>
                </div>
            </div>
            `;

        const reportdetails = document.querySelector(".report-details");
        reportdetails.appendChild(patientdetails);
    }
    console.log(`this is report.time ${new Date(report.date).toISOString().split('T')[0]}T${report.time}`, "this is receivedOn:", report.receivedOn);

    await populateHeader();
    await qrcodegenerator();

    async function barcodegenerator() {

        const booking = JSON.parse(localStorage.getItem('booking'));
        try {
            const response = await fetch(`/api/v1/user/generate-barcode?nonumber=${true}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ number: booking.acceptedbarcode[0] || booking.bookingId}),
            });

            if (response.ok) {
                const data = await response.json();
                document.getElementById("barcodeImage").src = data.barcode; // Display the barcode image
            } else {
                alert("Failed to generate barcode!");
            }
        } catch (error) {
            console.error("Error generating barcode:", error);
            alert("An error occurred. Please try again.");
        }
    }

    barcodegenerator();


    function renderData(data) {
        const container = document.getElementById("tables-container"); // Main container
        container.innerHTML = ""; // Clear existing content

        // Iterate through each category
        data.CategoryAndTest.forEach((categoryData, index) => {
            // Create section for the category
            const section = document.createElement("div");
            section.className = "section";
            if (data.categorizedPDF && index > 0) {
                section.classList.add("page-break");
            }

            const headings = document.createElement("div");
            headings.classList.add("headings");

            // Add delete button to `h2`
            const deleteH2Button = document.createElement("span");
            deleteH2Button.innerHTML = `<i class="fa-sharp fa-solid fa-xmark" title="Delete Entire category section"></i>`;
            deleteH2Button.className = "delete-btn";
            deleteH2Button.classList.add('wrong');

            // Add category heading with delete button
            const categoryHeading = document.createElement("h2");
            categoryHeading.textContent = categoryData.category;
            categoryHeading.appendChild(deleteH2Button);
            headings.appendChild(categoryHeading);

            // Add delete button to `h3` if it exists
            let titleHeading = null;
            // Add delete functionality to `h3`
            if (categoryData.category !== categoryData.title) {
                const deleteH3Button = document.createElement("span");
                deleteH3Button.innerHTML = `<i class="fa-sharp fa-solid fa-xmark" title="Delete Pannel"></i>`;
                deleteH3Button.className = "delete-btn";

                if (!categoryData.title.includes('Unknown Title')) {
                    titleHeading = document.createElement("h3");
                    titleHeading.classList.add("category-heading");
                    titleHeading.textContent = categoryData.title;
                    titleHeading.appendChild(deleteH3Button);
                    headings.appendChild(titleHeading);
                }

                deleteH3Button.addEventListener("click", () => {
                    // Delete the `h3` heading
                    titleHeading.remove();

                    // Delete the associated table (if exists)
                    const parentTable = section.querySelector("table");
                    parentTable?.remove();
                });
            }


            section.appendChild(headings);

            // Create a table for tests
            const table = document.createElement("table");
            table.className = "test-table";

            // Table header
            const thead = document.createElement("thead");
            thead.innerHTML = `
                <tr>
                    <th class="deletion"></th>
                    <th>Test Name</th>
                    <th class="valuecell">Value</th>
                    <th>Unit</th>
                    <th>Reference</th>
                </tr>
            `;
            table.appendChild(thead);

            // Table body
            const tbody = document.createElement("tbody");

            categoryData.tests.forEach((test, rowIndex) => {
                let testRow;
                
                if (test.testName) {
                    testRow = document.createElement("tr");

                    if (test.pagebreak) {
                        testRow.classList.add('page-break');
                    }

                    let isBold = Boolean(test.isBold || test.isAbnormal);
                    let testNameSuffix = "";
                    const refType = (test.referenceType || "").toLowerCase();

                    if (test.reference && refType !== "text") {
                        const referenceParts = test.reference.split(" - ");
                        if (referenceParts.length === 2) {
                            const lowerLimit = parseFloat(referenceParts[0]);
                            const upperLimit = parseFloat(referenceParts[1]);
                            const testValue = parseFloat(test.value);

                            if (!isNaN(lowerLimit) && !isNaN(upperLimit) && !isNaN(testValue)) {
                                if (testValue < lowerLimit) {
                                    isBold = true;
                                    testNameSuffix = "L";
                                } else if (testValue > upperLimit) {
                                    isBold = true;
                                    testNameSuffix = "H";
                                }
                            }
                        }
                    }

                    if (typeof test.value === "string" && test.value.toLowerCase().includes("positive")) {
                        isBold = true;
                    }

                    if (isBold) {
                        testRow.style.fontWeight = "bold";
                        testRow.classList.add('BoldRow', 'abnormal-result-row');
                    }

                    // ✅ FIXED: Documented test with proper colspan
                    if (test.isDocumented) {
                        testRow.innerHTML = `
                    <td class="wrong">
                        <span class="delete-row-icon" title="Delete Row">
                            <i class="fa-sharp fa-solid fa-xmark"></i>
                        </span>
                    </td>
                    <td colspan="4" style="padding: 0; border: none;">
                        <div class="documented-content">
                            ${test.testName || ""}
                        </div>
                    </td>
                `;
                    } else {
                        // ✅ Regular test row
                        testRow.innerHTML = `
                    <td class="wrong">
                        <span class="delete-row-icon" title="Delete Row">
                            <i class="fa-sharp fa-solid fa-xmark"></i>
                        </span>
                    </td>
                    ${test.testName || ""}
                    <td class="high-low">
                        <div class="HL"><span class="high-low-marker">${testNameSuffix}</span></div>
                        <span class="result-value">${test.value || ""}</span>
                    </td>
                    <td>${test.unit || ""}</td>
                    <td>${test.reference || ""}</td>
                `;
                    }

                    tbody.appendChild(testRow);
                }


                // ✅ Remark row
                if (test.remark) {
                    const remarkRow = document.createElement("tr");
                    const remarkCellEmpty = document.createElement("td");
                    remarkCellEmpty.classList.add("wrong");

                    const remarkCell = document.createElement("td");
                    remarkCell.colSpan = 4;
                    remarkCell.className = "remark-row";
                    remarkCell.innerHTML = `<div>Remark:</div> <span>${test.remark}</span>`;

                    remarkRow.appendChild(remarkCellEmpty);
                    remarkRow.appendChild(remarkCell);
                    tbody.appendChild(remarkRow);
                }

                // ✅ FIXED: Details row (can contain CKEditor content)
                if (test.details) {
                    const detailsRow = document.createElement("tr");

                    const detailsCellEmpty = document.createElement("td");
                    detailsCellEmpty.classList.add("wrong");

                    const detailsCell = document.createElement("td");
                    detailsCell.colSpan = 4;
                    detailsCell.className = "details-row";

                    // ✅ Wrap details in documented-content div for proper isolation
                    detailsCell.innerHTML = `
        <div class="documented-content">
            ${test.details}
        </div>
    `;

                    detailsRow.appendChild(detailsCellEmpty);
                    detailsRow.appendChild(detailsCell);

                    // ✅ Remove any unwanted spacing/margins
                    detailsRow.style.margin = "0";
                    detailsRow.style.padding = "0";

                    tbody.appendChild(detailsRow);
                }

                // Delete functionality
                const deleteIcon = testRow?.querySelector(".delete-row-icon");
                if (deleteIcon) {
                    deleteIcon.addEventListener("click", () => {
                        const currentRow = deleteIcon.closest("tr");
                        let nextRow = currentRow.nextElementSibling;

                        if (nextRow && nextRow.querySelector(".remark-row")) {
                            nextRow.remove();
                            nextRow = currentRow.nextElementSibling;
                        }
                        if (nextRow && nextRow.querySelector(".details-row")) {
                            nextRow.remove();
                        }

                        currentRow.remove();
                    });
                }
            });


            // Render additional information (advice, notes, remarks, interpretation)
            if (categoryData.advice) {
                const detailsRow = document.createElement("tr");
                const detailsCellpre = document.createElement("td");
                detailsCellpre.colSpan = 4;
                detailsCellpre.className = "advice";
                detailsCellpre.innerHTML = `<div>Advice:</div> <span>${categoryData.advice}</span>`;
                detailsRow.appendChild(detailsCellpre);
                tbody.appendChild(detailsRow);
            }

            if (categoryData.notes) {
                const detailsRow = document.createElement("tr");
                const detailsCellpre = document.createElement("td");
                detailsCellpre.colSpan = 4;
                detailsCellpre.className = "notes";
                detailsCellpre.innerHTML = `<div>Notes:</div> <span>${categoryData.notes}</span>`;
                detailsRow.appendChild(detailsCellpre);
                tbody.appendChild(detailsRow);
            }

            if (categoryData.remarks) {
                const detailsRow = document.createElement("tr");
                const detailsCellpre = document.createElement("td");
                detailsCellpre.colSpan = 4;
                detailsCellpre.className = "remarks";
                detailsCellpre.innerHTML = `<div>Remarks:</div> <span>${categoryData.remarks}</span>`;
                detailsRow.appendChild(detailsCellpre);
                tbody.appendChild(detailsRow);
            }

            table.appendChild(tbody);

            if (categoryData.interpretation) {
                const detailsRow = document.createElement("tr");
                const detailsCellpre = document.createElement("td");
                detailsCellpre.colSpan = 4;
                const interpretation = document.createElement("div");
                interpretation.className = "interpretation";
                interpretation.innerHTML = `<p style="font-weight: bold;">Interpretation</p> ${categoryData.interpretation}`;
                detailsCellpre.appendChild(interpretation);
                detailsRow.appendChild(detailsCellpre);
                table.appendChild(detailsRow);
            }

            section.appendChild(table);

            // Add delete functionality for `h2`
            deleteH2Button.addEventListener("click", () => {
                section.remove(); // Delete the whole section
            });


            // Append the section to the container
            container.appendChild(section);
        });

        // Add additional details if available
        if (data.MoreDetails) {
            const MoreDetails = document.createElement("div");
            MoreDetails.className = "moreDetails";
            MoreDetails.innerHTML = `<span>Additional Findings :-</span><br> <div>${data.MoreDetails}</div>`;
            container.appendChild(MoreDetails);
        }
    }


    // Call the function to render the data
    renderData(report);

    async function fetchTemplateImages() {
        try {
            const response = await fetch(`/api/v1/user/templates`, { method: "POST" }); // Update URL as per your backend
            const data = await response.json();

            if (data.urls && Array.isArray(data.urls)) {
                const imageurl = data.urls[0].template;
                return imageurl;
            } else {
                console.error('No URLs found:', data);
            }
        } catch (error) {
            console.error('Error fetching template images:', error);
        }
    };

    // await convertAllImagesToBase64();
    await signoffdivfunction();
    downloadpdffunction();

    function countLines() {
        const span = document.querySelector(".report-details");
        const totallines = span.offsetHeight;
        return totallines;
    }

    async function signoffdivfunction() {
        if (report.signOff) {
            // Select all buttons with the class 'click'
            const targetButtons = document.querySelectorAll(".click");

            // Remove the 'sign' class from each button
            targetButtons.forEach(button => {
                if (button.classList.contains("sign")) {
                    button.classList.remove("sign");
                }
            });
        }

        document.getElementById("signOff").addEventListener("click", async function (e) {
            const button = e.currentTarget;
            const loader = button.closest(".downloadDiv")?.querySelector("#loadingOverlay");

            if (!loader) {
                console.error("Loading overlay not found");
                return;
            }

            loader.style.display = 'flex';
            button.disabled = true;

            // Select all target buttons
            const targetButtons = document.querySelectorAll(".click");

            // Toggle class for each target button
            targetButtons.forEach(button => {
                button.classList.toggle("sign");
            });
            //saving pdf data into database
            const htmlContent = document.querySelector('.container2').outerHTML;
            const cssContent = document.getElementById('stying').innerHTML;
            const investigationmargin = countLines();
            const header = document.querySelector('.report-details').outerHTML;
            const footer = document.querySelector('.signed-off-div').outerHTML;

            const updateData = {
                htmlContent, cssContent,
                header, footer, reportId: value1, backgroundImageUrl, investigationmargin,
                bookingId: report.bookingId,
                isdocumented: report.isdocumented
            }

            try {
                const response = await fetch(`${BASE_URL}/api/v1/user/getDoctorsSign`);

                // Check if the response is okay
                if (!response.ok) {
                    throw new Error('Failed to fetch data from API');
                }

                // Parse the response JSON
                const data = await response.json();
                console.log(data);

                if (!report.signOff) {
                    console.log("report sign off false");

                    updateData.showlab = data.showfirstdoctorsign;
                    updateData.showdoctorfirst = data.showfirstdoctorsign;
                    updateData.showdoctorsecond = data.showseconddoctorsign;
                    updateData.fileInputLab = data.labinchargesign;
                    updateData.fileInputDoctorleft = data.firstdoctorsign;
                    updateData.fileInputDoctorright = data.seconddoctorsign;
                    updateData.fileInputLabtext = data.labinchargeinfo;
                    updateData.fileInputDoctorlefttext = data.firstdoctorsigninfo;
                    updateData.fileInputDoctorrighttext = data.seconddoctorsigninfo;
                }
            } catch (error) {
                console.log(error.message);

            }

            // Check if any button has the 'sign' class
            const anyButtonHasSign = Array.from(targetButtons).some(button => button.classList.contains('sign'));
            let signoff

            if (anyButtonHasSign) {
                signoff = false;
            } else {
                signoff = true;
            }

            try {
                const response = await fetch(`/api/v1/user/editReportsignofffield`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ value1, signoff }),
                });

                if (!response.ok) throw new Error('signoff field no updated');

            } catch (error) {
                console.error('Error generating PDF:', error);
            }
            console.log("updateData is:", updateData);

            try {
                const response = await fetch(`/api/v1/user/adding-pdf-data`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(updateData),
                });

                if (!response.ok) throw new Error('data not saved');
                console.log("pdf data saved successfully");

                await updatebookingisreportreadyfield(report.bookingId);

            } catch (error) {
                console.error('Error generating PDF:', error);
            } finally {
                loader.style.display = 'none';
                button.disabled = false;
            }
        });
    }

    async function updatebookingisreportreadyfield(bookingid) {
        try {
            const response = await fetch(`/api/v1/user/CompleteBookingcontroller`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookingid }),
            });
            if (!response.ok) {
                console.log("status not updated");
            }

        } catch (error) {
            console.log(error)
        }
    }

    async function fetchLabSignAndSetInputs() {
        try {
            // Send a POST request to the API with value1 in the request body
            const response = await fetch(`/api/v1/user/getDoctorsSign`);

            // Check if the response is okay
            if (!response.ok) {
                console.log('Failed to fetch data from API');
            }

            // Parse the response JSON
            const data = await response.json();

            if (data) {
                return {
                    labinchargeinfo: data.labinchargeinfo,
                    sign: data.labinchargesign
                };
            }
            return {
                labinchargeinfo: null,
                sign: null
            };

        } catch (error) {
            console.error('Error fetching data and setting inputs:', error.message);
        }
    };

    // -----------------------------------new pdf generator--------------------------------------
    async function downloadpdffunction({ labinchargesign = null, checkBox = false, labinchargeinfo = "",
        backgroundImageUrl = null, headermargin, footermargin, marginRight, marginLeft,
        labinchargesignurl = null, selectedFontSize, RowSpacing, HighLow, HLinred: HLinred,
        BoldRow, showInvest, DownloadPdf = true } = {}) {
        document.getElementById('downloadPDF').addEventListener('click', async (e) => {
            const button = e.currentTarget;
            const loader = button.closest(".downloadDiv")?.querySelector("#loadingOverlay");

            if (!loader) {
                console.error("Loading overlay not found");
                return;
            }

            loader.style.display = 'flex';
            button.disabled = true;


            //saving pdf data into database
            const htmlContent = document.querySelector('.container2').outerHTML;
            const cssContent = document.getElementById('stying').innerHTML;
            const header = document.querySelector('.report-details').outerHTML;
            const footer = document.querySelector('.signed-off-div').outerHTML;
            const investigationmargin = countLines();


            try {
                const response = await fetch(`/api/v1/user/adding-pdf-data`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        labinchargesign: report.showLabIncharge, htmlContent,
                        cssContent, header, footer, reportId: value1, backgroundImageUrl, investigationmargin
                    }),
                });

                if (!response.ok) throw new Error('data not saved');

                console.log("labinchargesign edited successfully");

            } catch (error) {
                console.error('Error generating PDF:', error);
            }

            try {
                const response = await fetch(`/api/v1/user/get-pdf`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        value1, labinchargesign, checkBox, backgroundImageUrl,
                        headermargin, footermargin, marginRight, marginLeft, labinchargeinfo: labinchargeinfo,
                        labinchargesignurl: sign, selectedFontSize, RowSpacing, HighLow, HLinred,
                        BoldRow, showInvest, DownloadPdf, bookingId: report.bookingId
                    }),
                });

                if (!response.ok) throw new Error('PDF generation failed');

                // Creating blob from response
                const pdfBlob = await response.blob();

                // Creating a download link for the PDF
                const safeName = (report.patientName || 'Patient')
                    .replace(/[^a-zA-Z0-9\u0900-\u097F\s]/g, '').trim().replace(/\s+/g, '_');
                const safeId = (report.bookingId || '').replace(/[^a-zA-Z0-9]/g, '');
                const link = document.createElement('a');
                link.href = window.URL.createObjectURL(pdfBlob);
                link.download = `${safeName}-${safeId}.pdf`;
                link.click();
                trackSuccessfulAction('downloadPdf');
                await updatebookingisreportreadyfield(report.bookingId);

            } catch (error) {
                console.error('Error generating PDF:', error);
            } finally {
                loader.style.display = 'none';
                button.disabled = false;
            }
        });
    }

    // Function to Print a Specific Area
    document.getElementById('BrowserPrint').addEventListener('click', function (e) {
        const button = e.currentTarget;
        const loader = button.closest('.downloadDiv')?.querySelector('#loadingOverlay');
        if (loader) loader.style.display = 'flex';
        button.disabled = true;
        try {
            const printArea = document.getElementById('container').innerHTML;
            const cssContent = document.getElementById('stying').innerHTML;
            const printWindow = window.open('', '_blank');
            if (!printWindow) throw new Error('Popup blocked');
            printWindow.document.open();
            printWindow.document.write(`
                <html>
                <head>
                    <title>Print Report</title>
                    <style>
                        ${cssContent}
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        .container { width: 100%; }
                        .header { text-align: center; }
                        .barcode-div { margin-top: 20px; text-align: center; }
                    </style>
                </head>
                <body onload="window.print(); window.close();">
                    ${printArea}
                </body>
                </html>
            `);
            printWindow.document.close();
            trackSuccessfulAction('printDialog');
        } catch (error) {
            console.error('Error opening print preview:', error);
        } finally {
            if (loader) loader.style.display = 'none';
            button.disabled = false;
        }
    });


    window.addEventListener('beforeunload', () => {
        if (activeSendPdfBlobUrl) URL.revokeObjectURL(activeSendPdfBlobUrl);
        activeSendPdfBlobUrl = null;
    });

    await sendReport();

    function hidecontent() {
        if (user.showprintsetting === false) {
            document.getElementById('printsettingbutton').style.display = "none";
        }
        if (user.tenantId.modelType === "1layer") {
            const contents = document.querySelectorAll('.forhide');
            contents.forEach(elem => {
                elem.style.display = "none";
            })
        }
    }
    hidecontent();
})();

