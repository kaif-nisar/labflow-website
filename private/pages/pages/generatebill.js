// Global functions for modal
window.openModal = function() {
    let modal = document.getElementById("customModal");
    modal.classList.add("show");
}

window.closeModal = function() {
    let modal = document.getElementById("customModal");
    modal.classList.remove("show");
}

// Close modal when clicking outside
window.onclick = function(event) {
    let modal = document.getElementById("customModal");
    if (event.target === modal) {
        window.closeModal();
    }
}

// Event listener for Enter key
document.addEventListener('keydown', function(event) {
    if (event.key === "Enter") {
        searchbuttonfunction();
    }
});

// Event listener for search button
document.getElementById("search-button").addEventListener('click', function(event) {
    searchbuttonfunction();
});

function renderBillBrandHeader() {
    const imageDiv = document.querySelector('.image-div');
    if (!imageDiv) return;

    const tenant = (typeof user !== 'undefined' && user?.tenantId) ? user.tenantId : {};
    const branding = tenant.branding || {};
    const brandType = branding.brandType || (tenant.logo ? "image" : (branding.labHeading ? "text" : "none"));

    if (brandType === "image" && tenant.logo) {
        imageDiv.innerHTML = `<img id="bill-logo" src="${tenant.logo}" style="max-width: 250px; max-height: 110px; object-fit: contain; display: block;">`;
    } else if (brandType === "text" || (branding.labHeading && brandType !== "none")) {
        const bg = branding.bgColor || "#ffffff";
        const textColor = branding.textColor || "#0f172a";
        const sloganColor = branding.sloganColor || "#64748b";
        const fontSize = branding.fontSize || 20;
        const sloganSize = branding.sloganSize || 12;
        const fontFamily = branding.fontFamily || "Arial, sans-serif";
        const textAlign = branding.textAlign || "center";
        const borderWidth = branding.borderWidth !== undefined ? branding.borderWidth : 1;
        const borderColor = branding.borderColor || "#e2e8f0";
        const heading = branding.labHeading || tenant.name || "LabFlow";
        const slogan = branding.labSlogan || "";

        imageDiv.innerHTML = `
        <div id="bill-brand-box" style="
            width: 250px;
            min-height: 85px;
            padding: 10px 14px;
            box-sizing: border-box;
            background-color: ${bg};
            border: ${borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : 'none'};
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: ${textAlign === 'center' ? 'center' : (textAlign === 'right' ? 'flex-end' : 'flex-start')};
            text-align: ${textAlign};
            font-family: ${fontFamily};
            word-break: break-word;
            line-height: 1.25;
        ">
            <div style="font-size: ${fontSize}px; font-weight: 800; color: ${textColor}; letter-spacing: -0.3px;">
                ${heading}
            </div>
            ${slogan ? `
            <div style="font-size: ${sloganSize}px; font-weight: 500; color: ${sloganColor}; margin-top: 4px;">
                ${slogan}
            </div>` : ''}
        </div>`;
    } else if (tenant.logo && brandType !== "none") {
        imageDiv.innerHTML = `<img id="bill-logo" src="${tenant.logo}" style="max-width: 250px; max-height: 110px; object-fit: contain; display: block;">`;
    } else {
        imageDiv.innerHTML = '';
    }
}

// Initial render
renderBillBrandHeader();

async function searchbuttonfunction() {
    renderBillBrandHeader();
    const searchValue = document.getElementById('search-input').value.trim();
    const Array = [];

    // Fetch data from your server
    await fetch(`${BASE_URL}/api/v1/user/bookings-search?search=${searchValue}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch data.');
            }
            return response.json();
        })
        .then(data => {
            // Clear previous table rows
            const tableBody = document.getElementById('table-body');
            tableBody.innerHTML = '';

            if (data.bookings && data.bookings.length > 0) {
                const dataset = data.bookings[0];
                dataset.tableData.forEach(elem => {
                    const testnames = elem.testName.split(',');
                    Array.push(...testnames);
                })
                const uiqueArray = [...new Set(Array)];
                const invoicetablebody = document.querySelector('#invoice-table tbody');
                invoicetablebody.innerHTML = '';
                uiqueArray.forEach((elem, index) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `<td>${index + 1}</td>
                                    <td>${elem}</td>`;
                    invoicetablebody.appendChild(row);
                });
                document.querySelector('.ml-auto').textContent = dataset.bookingId;
                document.getElementById('invoiceid').innerText = `#Bill${dataset._id}`;
                document.querySelector('.booking-date').textContent = dataset.date.split('T')[0];
                document.querySelector('.booking-time').textContent = new Date("1970-01-01T" + dataset.time)
                    .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                document.querySelector('.booking-patientName').textContent = dataset.patientName;
                document.querySelector('.booking-total').value = dataset.total;
                document.getElementById('invoice-bookingid').textContent = `Booking Id : ${dataset.bookingId}`;
                document.getElementById('booking-date-time').textContent = `Booking Time : ${dataset.date.split('T')[0]} ${new Date("1970-01-01T" + dataset.time)
                    .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
                document.querySelector('.blue').textContent = dataset.patientName;
                document.querySelector('.invoice-gender').textContent = `${dataset.year} | ${dataset.gender}`;
                document.getElementById('invoice-date-time').textContent = `Invoice Date : ${new Date().toLocaleString().split(",")[0]}`;
                
                // Add rows dynamically
                data.bookings.forEach(booking => {
                    const barcodes = booking.tableData.map(data => data.barcodeId).join(', ') || '';
                    const testNames = booking.tableData.map(data => data.testName).join(', ') || '';

                    // Determine the color for the status
                    let statusColor = '';
                    if (booking.status === 'On Hold') {
                        statusColor = 'red';
                    } else if (booking.status === 'Pending') {
                        statusColor = 'green';
                    } else if (booking.status === 'Final') {
                        statusColor = 'blue';
                    }

                    // Generate Booking ID HTML (with or without a clickable link)
                    const bookingIdHTML = booking.status === 'Final'
                        ? `<a href="/booking/${booking.bookingId}" target="_blank">${booking.bookingId}</a>`
                        : booking.bookingId;

                    const row = `
                        <tr>
                            <td>${bookingIdHTML || ''}</td>
                            <td>${booking.patientName || ''}</td>
                            <td>${barcodes || ''}</td>
                            <td>${booking.doctorName || ''}</td>
                            <td>${uiqueArray || ''}</td>
                            <td>${booking.billGenerated ? 
                                `<a href="#" id="downloadbtnanchor"><button id="downloadBtn"><i class="fa-solid fa-download"></i>Download</button></a>` : 
                                `<button class="generate-bill-btn">Generate Bill</button>`
                            }</td>
                        </tr>
                    `;
                    tableBody.insertAdjacentHTML('beforeend', row);
                });
                
                data.bookings[0].billGenerated ? tableBody.style.display = "none" : tableBody.style.display = "";
                submitbillingprice(dataset);
            } else {
                // No data found
                const noDataRow = `
                    <tr>
                        <td colspan="6">No results found for "${searchValue}".</td>
                    </tr>
                `;
                tableBody.insertAdjacentHTML('beforeend', noDataRow);
            }
        })
        .catch(error => {
            console.error(error);
            alert('An error occurred while fetching data.');
        });
}

// Event delegation for dynamically added "Generate Bill" buttons
document.getElementById('table-body').addEventListener('click', function(e) {
    if (e.target.classList.contains('generate-bill-btn') || 
        e.target.closest('.generate-bill-btn')) {
        window.openModal();
    }
});

async function submitbillingprice(booking) {
    const submitbtn = document.querySelector('.open-modal-btn');
    const downloadbtn = document.getElementById('downloadbtnanchor');
    
    if (downloadbtn) {
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/invoicepdfgenerator`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    bookingId: booking.bookingId,
                })
            });
            const pdfblob = await response.blob();
            const pdfUrl = URL.createObjectURL(pdfblob);
            if (response.ok) {
                downloadbtn.href = pdfUrl;
                downloadbtn.download = `${booking.patientName}-invoice.pdf`;
                document.querySelector('#main-table tbody').style.display = "";
            }
        } catch (error) {
            console.log(error);
        }
    }
    
    submitbtn.addEventListener('click', async function() {
        const generatebillbtn = document.querySelector('.generate-bill-btn');
        if (generatebillbtn) {
            generatebillbtn.innerText = "please wait..";
            generatebillbtn.disabled = true;
        }
        
        const billingprice = document.querySelector(".billingprice").value;
        document.querySelector(".header span").textContent = `Rs ${billingprice}`;
        const invoiceHtml = document.querySelector(".pdf-div").innerHTML;
        const invoicecss = document.getElementById("billcss").innerHTML;
        const billnumber = document.getElementById('invoiceid').innerText;
        
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/invoicepdfgenerator`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    invoiceHtml,
                    billnumber,
                    bookingId: booking.bookingId,
                    invoicecss,
                    billingPrice: Number(billingprice),
                    generatedBy: userId
                })
            });
            const response2 = await fetch(`${BASE_URL}/api/v1/user/updategeneratedbillvariable/${booking.bookingId}`);
            const pdfblob = await response.blob();
            const pdfUrl = URL.createObjectURL(pdfblob);
            
            if (response.ok && response2.ok) {
                const anchor = document.createElement("a");
                anchor.href = pdfUrl;
                anchor.download = `${booking.patientName}-invoice.pdf`;
                document.body.appendChild(anchor);
                anchor.click();
                document.body.removeChild(anchor);
                
                // Close modal after successful generation
                window.closeModal();
            }
        } catch (error) {
            console.log(error);
        } finally {
            if (generatebillbtn) {
                generatebillbtn.innerText = "Generate Bill";
                generatebillbtn.disabled = false;
            }
        }
    });
}