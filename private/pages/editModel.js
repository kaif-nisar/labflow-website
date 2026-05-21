(async function () {
  const fieldHelp = {
    fullName: "Owner/admin का पूरा नाम।",
    username: "Login username, बदलने पर next login में नया username use होगा।",
    email: "Alerts और account communication के लिए email।",
    role: "Account role type. यहां admin fixed रहता है।",
    phoneNo: "Client का primary contact number।",
    state: "State-level mapping के लिए।",
    district: "District-level mapping के लिए।",
    pinCode: "Postal location validation के लिए।",
    address: "Complete address record के लिए।",
    wallet: "Wallet balance manual adjustment के लिए।",
    status: "Active/Inactive से account access control होता है।",
    planType: "Default subscription plan type।",
    price: "Current active subscription price।",
    monthlyPrice: "Monthly catalog price value।",
    quaterlyPrice: "Quarterly catalog price value।",
    yearlyPrice: "Yearly catalog price value।",
    activeForDays: "Fixed days based activation period।",
    customExpiryDate: "Manual expiry date/time override।",
    extendFromCurrent: "Yes: current expiry से आगे extend, No: now से reset।",
    graceMonths: "Expiry के बाद extra months।",
    graceDays: "Expiry के बाद extra days।",
    graceHours: "Expiry के बाद extra hours।",
    graceNote: "Grace reason लिखने के लिए।",
    paymentStatus: "Paid/Unpaid status tracking।",
    paymentAmount: "Cash/manual payment amount record।",
    paymentMethod: "Manual payment source type।",
    manualActivate: "Payment receive होने पर manual activation toggle।",
    format1: "PDF Template 1 selection।",
    format2: "PDF Template 2 selection।",
    format3: "PDF Template 3 selection।",
    printsetting: "User side print settings visibility।",
    testdatabase: "User side test database visibility।",
    randomResult: "Random result option visibility।"
  };

  function attachFieldHelp() {
    const floatingTip = document.createElement("div");
    floatingTip.style.position = "fixed";
    floatingTip.style.zIndex = "999999";
    floatingTip.style.maxWidth = "280px";
    floatingTip.style.padding = "8px 9px";
    floatingTip.style.borderRadius = "8px";
    floatingTip.style.background = "#0f172a";
    floatingTip.style.color = "#e2e8f0";
    floatingTip.style.border = "1px solid #334155";
    floatingTip.style.fontSize = "12px";
    floatingTip.style.lineHeight = "1.35";
    floatingTip.style.boxShadow = "0 10px 24px rgba(2,6,23,0.32)";
    floatingTip.style.pointerEvents = "none";
    floatingTip.style.display = "none";
    document.body.appendChild(floatingTip);

    const showTip = (target, text) => {
      if (!text) return;
      floatingTip.textContent = text;
      floatingTip.style.display = "block";
      const rect = target.getBoundingClientRect();
      const top = Math.max(8, rect.bottom + 8);
      const left = Math.max(8, Math.min(window.innerWidth - 300, rect.left - 6));
      floatingTip.style.top = `${top}px`;
      floatingTip.style.left = `${left}px`;
    };

    const hideTip = () => {
      floatingTip.style.display = "none";
      floatingTip.textContent = "";
    };

    Object.entries(fieldHelp).forEach(([fieldId, helpText]) => {
      const label = document.querySelector(`label[for="${fieldId}"]`);
      if (!label || label.querySelector(".field-help-icon")) return;

      const parent = label.closest(".form-group") || label.closest(".form-group-edit") || label.parentElement;
      if (!parent) return;

      const icon = document.createElement("span");
      icon.className = "field-help-icon";
      icon.textContent = "i";
      icon.setAttribute("aria-label", "Field help");

      icon.addEventListener("mouseenter", () => {
        showTip(icon, helpText);
      });
      icon.addEventListener("mouseleave", hideTip);
      icon.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (floatingTip.style.display === "block" && floatingTip.textContent === helpText) {
          hideTip();
        } else {
          showTip(icon, helpText);
        }
      });

      label.appendChild(icon);
    });

    document.addEventListener("click", () => {
      hideTip();
    });
    window.addEventListener("resize", hideTip);
    window.addEventListener("scroll", hideTip, true);
  }

  attachFieldHelp();

  // Get modelId from URL
  const urlParams = new URLSearchParams(window.location.search);
  const tenantId = urlParams.get('modelId'); // yahi aapke user ki id hai
  if (!tenantId) return;

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

  // Naya clinical layout preview
  if (myDiv4) myDiv4.style.backgroundImage = `url("${BASE_URL}/images/format4.png"), linear-gradient(#f3f3f3,#e8e8e8)`;

  // Fetch user/admin details and pre-fill form
  try {
    const res = await fetch(`/api/v1/user/tenants-model/${tenantId}`);
    const { data } = await res.json();
    // console.log(data)
    document.getElementById('fullName').value = data.adminDetails.userId.fullName || '';
    document.getElementById('username').value = data.adminDetails.userId.username || '';
    document.getElementById('email').value = data.adminDetails.userId.email || '';
    document.getElementById('role').value = data.adminDetails.userId.role || 'admin';
    document.getElementById('phoneNo').value = data.adminDetails.userId.phoneNo || '';
    document.getElementById('state').value = data.adminDetails.userId.state || '';
    document.getElementById('district').value = data.adminDetails.userId.district || '';
    document.getElementById('pinCode').value = data.adminDetails.userId.pinCode || '';
    document.getElementById('address').value = data.adminDetails.userId.address || '';
    document.getElementById('wallet').value = data.adminDetails.userId.bookingWallet || 0;
    document.getElementById('status').value = data.adminDetails.userId.isActive ? 'true' : 'false';
    document.getElementById('status').value = data.adminDetails.userId.isActive ? 'true' : 'false';
    document.getElementById('printsetting').checked = data.adminDetails.userId.showprintsetting;
    document.getElementById('testdatabase').checked = data.adminDetails.userId.showtestdatabase;
    document.getElementById('randomResult').checked = data.adminDetails.userId.showRandomBtn;

    if (data.adminDetails.userId.pdfFormat === "reportFormat3") {
      document.getElementById('format1').checked = true;
    } else if (data.adminDetails.userId.pdfFormat === "reportFormat1") {
      document.getElementById('format2').checked = true;
    } else if (data.adminDetails.userId.pdfFormat === "reportFormat4") {
      document.getElementById('format4').checked = true;
    } else {
      document.getElementById('format3').checked = true;
    }

    // Subscription Info
    document.getElementById('planType').value = data.subscriptionPlan?.planType || 'monthly';
    document.getElementById('price').value = data.subscriptionPlan?.price || 0;
    document.getElementById('paymentStatus').value = data.subscriptionPlan?.paymentStatus || 'paid';
    document.getElementById('monthlyPrice').value = data.planCatalog?.monthly?.price || data.subscriptionPlan?.price || 0;
    document.getElementById('quaterlyPrice').value = data.planCatalog?.quaterly?.price || 0;
    document.getElementById('yearlyPrice').value = data.planCatalog?.yearly?.price || 0;
    document.getElementById('activeForDays').value = data.subscriptionPlan?.durationDays || '';
    document.getElementById('graceMonths').value = data.subscriptionPlan?.gracePeriod?.months || 0;
    document.getElementById('graceDays').value = data.subscriptionPlan?.gracePeriod?.days || 0;
    document.getElementById('graceHours').value = data.subscriptionPlan?.gracePeriod?.hours || 0;
    document.getElementById('graceNote').value = data.subscriptionPlan?.gracePeriod?.note || '';
    if (data.subscriptionPlan?.endDate) {
      const dt = new Date(data.subscriptionPlan.endDate);
      if (!Number.isNaN(dt.getTime())) {
        const offset = dt.getTimezoneOffset();
        const local = new Date(dt.getTime() - offset * 60000).toISOString().slice(0, 16);
        document.getElementById('customExpiryDate').value = local;
      }
    }
  } catch (err) {
    alert('Failed to load user details');
  }
  document.getElementById("adminEditForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const formData = new FormData(this);
    const data = Object.fromEntries(formData.entries());

    data.pdfFormat = document.querySelector('input[name="format"]:checked').value;
    data.showprintsetting = document.getElementById('printsetting').checked;
    data.showtestdatabase = document.getElementById('testdatabase').checked;
    data.showRandomBtn = document.getElementById('randomResult').checked;

    console.log("data:", data);

    // Convert string "true"/"false" to boolean
    data.isActive = data.status === "true";
    delete data.status;

    // Optional: Attach `tenantId`, `_id`, or `refreshToken` if needed

    try {
      const response = await fetch(`/api/v1/user/update-model/${tenantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
              ...data,
              paymentAmount: Number(document.getElementById('paymentAmount').value || 0),
              paymentMethod: document.getElementById('paymentMethod').value || 'manual',
              manualActivate: document.getElementById('manualActivate').checked,
              planType: document.getElementById('planType').value,
              price: Number(document.getElementById('price').value || 0),
              monthlyPrice: Number(document.getElementById('monthlyPrice').value || 0),
              quaterlyPrice: Number(document.getElementById('quaterlyPrice').value || 0),
              yearlyPrice: Number(document.getElementById('yearlyPrice').value || 0),
              activeForDays: Number(document.getElementById('activeForDays').value || 0),
              customExpiryDate: document.getElementById('customExpiryDate').value || null,
              extendFromCurrent: document.getElementById('extendFromCurrent').value === 'true',
              graceMonths: Number(document.getElementById('graceMonths').value || 0),
              graceDays: Number(document.getElementById('graceDays').value || 0),
              graceHours: Number(document.getElementById('graceHours').value || 0),
              graceNote: document.getElementById('graceNote').value || "",
              paymentStatus: document.getElementById('paymentStatus').value
            }),
          });

      const result = await response.json();
      alert(result.message || "Updated successfully!");
    } catch (err) {
      console.error("Update failed", err);
      alert("Update failed. Check console.");
    }
  });
})();

