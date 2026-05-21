(() => {
    const fieldHelp = {
        franchiseName: "यह client/tenant का display नाम है जो portal में दिखाई देगा।",
        fullName: "Primary owner/admin का पूरा नाम।",
        email: "Login और notifications के लिए email ID।",
        phoneNo: "Support/OTP संपर्क के लिए mobile number।",
        username: "Unique login ID. Duplicate नहीं होना चाहिए।",
        password: "पहले login के लिए password set होता है।",
        state: "Address और location level reporting के लिए state।",
        district: "District level mapping में मदद करता है।",
        pincode: "Postal validation और billing map के लिए।",
        address: "Client का full correspondence address।",
        referral: "Referral source track करने के लिए optional code।",
        rentAmount: "Monthly base pricing value।",
        quaterlyRentAmount: "Quarterly price catalog value।",
        yearlyRentAmount: "Yearly price catalog value।",
        leaseTerms: "Default plan type (monthly/quaterly/yearly) तय करता है।",
        activeForDays: "अगर days डालें तो portal fixed days तक active रहेगा।",
        customExpiryDate: "Specific expiry date/time manually set करने के लिए।",
        graceMonths: "Expiry के बाद extra months access दें।",
        graceDays: "Expiry के बाद extra days access दें।",
        graceHours: "Fine control के लिए extra hours दें।",
        graceNote: "Grace का reason/remark audit के लिए।",
        format1: "PDF Template 1 selection।",
        format2: "PDF Template 2 selection।",
        format3: "PDF Template 3 selection।",
        printsetting: "Enable होने पर print settings user side दिखेंगी।",
        testdatabase: "Enable होने पर test database options visible होंगी।",
        randomResult: "Enable होने पर random result feature दिखेगा।"
    };

    function attachFieldHelp() {
        Object.entries(fieldHelp).forEach(([fieldId, helpText]) => {
            const label = document.querySelector(`label[for="${fieldId}"]`);
            if (!label || label.querySelector(".field-help-icon")) return;

            const parent = label.closest(".form-group") || label.parentElement;
            if (!parent) return;

            const icon = document.createElement("span");
            icon.className = "field-help-icon";
            icon.textContent = "i";
            icon.setAttribute("aria-label", "Field help");

            const tip = document.createElement("div");
            tip.className = "field-help-tip";
            tip.textContent = helpText;

            icon.addEventListener("mouseenter", () => {
                document.querySelectorAll(".field-help-tip.show").forEach((el) => el.classList.remove("show"));
                tip.classList.add("show");
            });
            icon.addEventListener("mouseleave", () => tip.classList.remove("show"));
            icon.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isVisible = tip.classList.contains("show");
                document.querySelectorAll(".field-help-tip.show").forEach((el) => el.classList.remove("show"));
                if (!isVisible) tip.classList.add("show");
            });

            label.appendChild(icon);
            parent.appendChild(tip);
        });

        document.addEventListener("click", () => {
            document.querySelectorAll(".field-help-tip.show").forEach((el) => el.classList.remove("show"));
        });
    }

    attachFieldHelp();

    // Select Model Logic
    const modelCards = document.querySelectorAll('.model-card');
    const rentDetails = document.getElementById('rentDetails');
    let selectedLayer = null;

    // Kisi element ko select karo
    const myDiv = document.querySelector(".format1");
    const myDiv2 = document.querySelector(".format2");
    const myDiv3 = document.querySelector(".format3");
    const myDiv4 = document.querySelector(".format4");

    // Format1 wala background set karo
    myDiv.style.backgroundImage = `url("${BASE_URL}/images/format2.png")`;

    // Ya format2 wala background set karo
    myDiv2.style.backgroundImage = `url("${BASE_URL}/images/format3.png")`;

    // Ya format2 wala background set karo
    myDiv3.style.backgroundImage = `url("${BASE_URL}/images/format1.png")`;

    // New clinical style format (reportFormat4)
    if (myDiv4) {
        myDiv4.style.backgroundImage = `url("${BASE_URL}/images/format4.png"), linear-gradient(#f3f3f3, #e8e8e8)`;
        myDiv4.style.backgroundSize = "cover";
    }


    modelCards.forEach(card => {
        card.addEventListener('click', () => {
            // Remove selection from all cards
            modelCards.forEach(c => c.classList.remove('selected'));

            // Select clicked card
            card.classList.add('selected');
            selectedLayer = card.getAttribute('data-layer');

            // Show rent details with smooth animation
            rentDetails.style.display = 'block';
            rentDetails.style.animation = 'fadeIn 0.5s ease';
        });
    });

    // Assign Button Logic
    const assignButton = document.getElementById('assignButton');
    assignButton.addEventListener('click', async () => {
        const franchiseName = document.getElementById('franchiseName').value;
        const fullName = document.getElementById('fullName').value;
        const email = document.getElementById('email').value;
        const phoneNo = document.getElementById('phoneNo').value;
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const state = document.getElementById('state').value;
        const district = document.getElementById('district').value;
        const pincode = document.getElementById('pincode').value;
        const address = document.getElementById('address').value;
        const rentAmount = document.getElementById('rentAmount').value;
        const quaterlyRentAmount = document.getElementById('quaterlyRentAmount').value;
        const yearlyRentAmount = document.getElementById('yearlyRentAmount').value;
        const leaseTerms = document.getElementById('leaseTerms').value;
        const activeForDays = document.getElementById('activeForDays').value;
        const customExpiryDate = document.getElementById('customExpiryDate').value;
        const graceMonths = document.getElementById('graceMonths').value;
        const graceDays = document.getElementById('graceDays').value;
        const graceHours = document.getElementById('graceHours').value;
        const graceNote = document.getElementById('graceNote').value;
        const referralCodeProvided = document.getElementById('referral').value;
        const pdfFormat = document.querySelector('input[name="format"]:checked').value;
        const showprintsetting = document.getElementById('printsetting').checked;
        const showtestdatabase = document.getElementById('testdatabase').checked;
        const showRandomBtn = document.getElementById('randomResult').checked;

        if (franchiseName && rentAmount && leaseTerms && selectedLayer && fullName && email && phoneNo && username && password && state && district && pincode && address && pdfFormat) {
            // Prepare payload for backend
            const payload = {
                name: franchiseName,
                modelType: `${selectedLayer}layer`,
                code: `FRANCHISE-${Date.now()}`, // Unique code for the franchise
                adminDetails: {
                    email,
                    username,
                    password,
                },
                subscriptionPlan: {
                    planType: leaseTerms,
                    startDate: new Date(),
                    price: rentAmount,
                    activeForDays: Number(activeForDays || 0),
                    endDate: customExpiryDate || undefined,
                    prices: {
                        monthly: Number(rentAmount || 0),
                        quaterly: Number(quaterlyRentAmount || 0),
                        yearly: Number(yearlyRentAmount || 0),
                    },
                    gracePeriod: {
                        months: Number(graceMonths || 0),
                        days: Number(graceDays || 0),
                        hours: Number(graceHours || 0),
                        note: graceNote || "",
                    },
                    paymentStatus: "paid",
                },
                addressDetails: {
                    fullName,
                    phoneNo,
                    state,
                    district,
                    pinCode: pincode,
                    address,
                    pdfFormat,
                    showprintsetting,
                    showtestdatabase,
                    showRandomBtn
                },
                referralCodeProvided
            };

            try {
                // Send data to backend
                const response = await fetch(`${BASE_URL}/api/v1/user/tenants`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                });

                const result = await response.json();

                if (response.ok) {
                    alert(`Franchise Model Assigned Successfully:
         Layer: ${selectedLayer} Layer Model
         Name: ${franchiseName}
         Monthly Rent: ₹${rentAmount}
         Lease Terms: ${leaseTerms} Months`);
                    // console.log(result);
                } else {
                    alert(`Error: ${result.message}`);
                }
            } catch (error) {
                alert(error.message);
            }
        } else {
            alert('Please complete all fields and select a model');
        }
    });

    // Add custom animation
    const style = document.createElement('style');
    style.innerHTML = `
@keyframes fadeIn {
 from { opacity: 0; transform: translateY(20px); }
 to { opacity: 1; transform: translateY(0); }
}
`;
    document.head.appendChild(style);

})();
