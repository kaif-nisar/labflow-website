(async function () {
  const normalizeBoolean = (value, fallback = false) => {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    return fallback;
  };

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

  // Ya format3 wala background set karo
  if (myDiv3) myDiv3.style.backgroundImage = `url("${BASE_URL}/images/format1.png")`;

  // New clinical template thumbnail
  if (myDiv4) myDiv4.style.backgroundImage = `url("${BASE_URL}/images/format4.png"), linear-gradient(#f3f3f3,#e8e8e8)`;

  // Fetch user/admin details and pre-fill form
  try {
    const res = await fetch(`/api/v1/user/tenants-model/${tenantId}`);
    const { data } = await res.json();
    console.log(data)
    document.getElementById('fullName').value = data.adminDetails.userId.fullName || '';
    document.getElementById('username').value = data.adminDetails.userId.username || '';
    document.getElementById('email').value = data.adminDetails.userId.email || '';
    document.getElementById('role').value = data.adminDetails.userId.role || 'admin';
    document.getElementById('phoneNo').value = data.adminDetails.userId.phoneNo || '';
    document.getElementById('state').value = data.adminDetails.userId.state || '';
    document.getElementById('district').value = data.adminDetails.userId.district || '';
    document.getElementById('pinCode').value = data.adminDetails.userId.pinCode || '';
    document.getElementById('address').value = data.adminDetails.userId.address || '';
    document.getElementById('wallet').value = data.adminDetails.userId.wallet || 0;
    document.getElementById('status').value = data.adminDetails.userId.isActive ? 'true' : 'false';
    document.getElementById('status').value = data.adminDetails.userId.isActive ? 'true' : 'false';
    document.getElementById('printsetting').checked = data.adminDetails.userId.showprintsetting;
    document.getElementById('testdatabase').checked = data.adminDetails.userId.showtestdatabase;
    document.getElementById('deviceRestriction').checked = normalizeBoolean(data.adminDetails.userId.is_device_restriction_enabled, true);
    document.getElementById('maxAllowedDevices').value = String(data.adminDetails.userId.max_allowed_devices || 1);
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
  } catch (err) {
    alert('Failed to load user details');
  }

  const buildPayload = () => {
    const formData = new FormData(document.getElementById("adminEditForm"));
    const data = Object.fromEntries(formData.entries());

    data.pdfFormat = document.querySelector('input[name="format"]:checked')?.value || "reportFormat1";
    data.showprintsetting = document.getElementById('printsetting').checked;
    data.showtestdatabase = document.getElementById('testdatabase').checked;
    data.is_device_restriction_enabled = document.getElementById('deviceRestriction').checked;
    data.max_allowed_devices = Number(document.getElementById('maxAllowedDevices').value || 1);

    data.isActive = data.status === "true";
    delete data.status;

    return {
      ...data,
      paymentAmount: Number(document.getElementById('paymentAmount').value || 0),
      paymentMethod: document.getElementById('paymentMethod').value || 'manual',
      manualActivate: document.getElementById('manualActivate').checked,
      planType: document.getElementById('planType').value,
      price: Number(document.getElementById('price').value || 0),
      paymentStatus: document.getElementById('paymentStatus').value,
    };
  };

  const submitUpdate = async ({ purgeAllSessions = false } = {}) => {
    try {
      const response = await fetch(`/api/v1/user/update-model/${tenantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildPayload(),
          purgeAllSessions,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Update failed");
      }

      alert(result.message || "Updated successfully!");
      return true;
    } catch (err) {
      console.error("Update failed", err);
      alert(err.message || "Update failed. Check console.");
      return false;
    }
  };

  document.getElementById("adminEditForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    await submitUpdate({ purgeAllSessions: false });
  });

  document.getElementById("purgeSessionsBtn").addEventListener("click", async () => {
    const confirmed = confirm("Purge all active sessions for this tenant? Everyone will be logged out.");
    if (!confirmed) return;
    await submitUpdate({ purgeAllSessions: true });
  });
})();

