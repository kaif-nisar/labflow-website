const BASE_URL = window.location.origin;
const API_BASE = `${BASE_URL}/api/v1/user`;

let serverTimeOffsetMs = 0;
let countdownInterval = null;
let latestSubscription = null;
let latestRechargeOptions = null;

const hide = document.getElementById("hide-search");
const show = document.getElementById("show-search");

hide.addEventListener("click", function () {
  const searchDiv = document.querySelector(".search-bar-div");
  searchDiv.style.width = "0px";
});
show.addEventListener("click", function () {
  const searchDiv = document.querySelector(".search-bar-div");
  searchDiv.style.width = "18rem";
});

document.getElementById("fullscreen-button").addEventListener("click", function () {
  const icon = document.getElementById("logo1");
  if (document.fullscreenElement) {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();

    icon.classList.remove("fa-compress");
    icon.classList.add("fa-expand");
    return;
  }

  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  else if (document.documentElement.mozRequestFullScreen) document.documentElement.mozRequestFullScreen();
  else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();
  else if (document.documentElement.msRequestFullscreen) document.documentElement.msRequestFullscreen();

  icon.classList.add("fa-compress");
  icon.classList.remove("fa-expand");
});

function getAuthToken() {
  return localStorage.getItem("token") || sessionStorage.getItem("token") || "";
}

function syncServerClock(serverDateHeaderOrISO) {
  if (!serverDateHeaderOrISO) return;
  const serverTime = new Date(serverDateHeaderOrISO).getTime();
  if (Number.isFinite(serverTime)) {
    serverTimeOffsetMs = serverTime - Date.now();
  }
}

function nowFromServer() {
  return Date.now() + serverTimeOffsetMs;
}

function formatCurrency(amount) {
  return `INR ${Number(amount || 0).toLocaleString("en-IN")}`;
}

function getDaysRemaining(endDate) {
  const remaining = new Date(endDate).getTime() - nowFromServer();
  return Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24)));
}

function getSubscriptionExpiryDate(subscription) {
  return subscription?.effectiveEndDate || subscription?.endDate || null;
}

function getGraceSummary(subscription) {
  const grace = subscription?.gracePeriod;
  if (!grace || !grace.isEnabled) return "";
  const parts = [];
  if (Number(grace.months || 0) > 0) parts.push(`${grace.months} month`);
  if (Number(grace.days || 0) > 0) parts.push(`${grace.days} day`);
  if (Number(grace.hours || 0) > 0) parts.push(`${grace.hours} hour`);
  return parts.length ? `Grace: ${parts.join(" + ")}` : "";
}

function formatCountdown(endDate) {
  const diff = new Date(endDate).getTime() - nowFromServer();
  if (diff <= 0) return "00d 00h 00m 00s";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return `${String(days).padStart(2, "0")}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

async function apiRequest(path, options = {}) {
  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });
  syncServerClock(response.headers.get("date"));

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

function ensureUiShell() {
  if (document.getElementById("subscription-alert-bar")) return;

  const styles = document.createElement("style");
  styles.textContent = `
    body { padding-top: 0; }
    .subscription-alert-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 3000;
      display: none;
      padding: 10px 16px;
      color: #102a43;
      background: linear-gradient(90deg, #fff4cc 0%, #ffe8a3 100%);
      border-bottom: 1px solid #ffd666;
      font-family: Arial, sans-serif;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .subscription-alert-content { font-size: 14px; font-weight: 600; }
    .subscription-alert-actions button {
      border: 0;
      border-radius: 6px;
      background: #0052cc;
      color: #fff;
      cursor: pointer;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 600;
    }
    .subscription-lock-screen {
      position: fixed;
      inset: 0;
      background: rgba(7, 24, 43, 0.86);
      z-index: 3200;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .subscription-lock-card {
      max-width: 520px;
      width: 100%;
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      font-family: Arial, sans-serif;
    }
    .subscription-lock-card h2 { margin: 0 0 8px; color: #0f172a; }
    .subscription-lock-card p { margin: 0 0 16px; color: #334155; }
    .subscription-lock-card button {
      border: 0;
      border-radius: 8px;
      padding: 10px 14px;
      font-weight: 700;
      background: #0052cc;
      color: #fff;
      cursor: pointer;
    }
    .recharge-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 3100;
      padding: 16px;
    }
    .recharge-modal {
      width: 100%;
      max-width: 700px;
      background: #fff;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(2, 6, 23, 0.24);
      font-family: Arial, sans-serif;
    }
    .recharge-modal header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 18px;
      border-bottom: 1px solid #e2e8f0;
    }
    .recharge-modal h3 { margin: 0; font-size: 18px; color: #0f172a; }
    .recharge-close {
      border: 0;
      background: transparent;
      font-size: 20px;
      cursor: pointer;
      color: #334155;
    }
    .recharge-modal-content { padding: 16px 18px 20px; }
    .plan-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(150px, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }
    .plan-card {
      border: 1px solid #dbeafe;
      border-radius: 10px;
      padding: 12px;
      cursor: pointer;
      background: #f8fbff;
    }
    .plan-card.active {
      border-color: #2563eb;
      background: #eff6ff;
      box-shadow: inset 0 0 0 1px #2563eb;
    }
    .plan-card h4 { margin: 0 0 4px; font-size: 14px; color: #0f172a; text-transform: capitalize; }
    .plan-card .price { margin: 0; color: #0b4bc3; font-weight: 700; }
    .recharge-hint {
      margin: 0 0 14px;
      color: #475569;
      font-size: 13px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px;
    }
    .recharge-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
    }
    .recharge-actions button {
      border: 0;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 700;
      padding: 10px 14px;
    }
    .btn-secondary { background: #e2e8f0; color: #0f172a; }
    .btn-primary { background: #0052cc; color: #fff; }
    .recharge-status {
      margin-top: 8px;
      font-size: 13px;
      color: #334155;
      min-height: 18px;
    }
    @media (max-width: 760px) {
      .plan-grid { grid-template-columns: 1fr; }
      .subscription-alert-bar { flex-direction: column; align-items: flex-start; }
    }
  `;
  document.head.appendChild(styles);

  const alertBar = document.createElement("div");
  alertBar.id = "subscription-alert-bar";
  alertBar.className = "subscription-alert-bar";
  alertBar.innerHTML = `
    <div class="subscription-alert-content" id="subscription-alert-content"></div>
    <div class="subscription-alert-actions">
      <button id="subscription-recharge-btn">Recharge Now</button>
    </div>
  `;
  document.body.appendChild(alertBar);

  const lockScreen = document.createElement("div");
  lockScreen.id = "subscription-lock-screen";
  lockScreen.className = "subscription-lock-screen";
  lockScreen.innerHTML = `
    <div class="subscription-lock-card">
      <h2>Subscription Expired</h2>
      <p>Your portal is locked. Recharge to restore full access.</p>
      <button id="lock-screen-recharge-btn">Recharge & Activate</button>
    </div>
  `;
  document.body.appendChild(lockScreen);

  const modalOverlay = document.createElement("div");
  modalOverlay.id = "recharge-modal-overlay";
  modalOverlay.className = "recharge-modal-overlay";
  modalOverlay.innerHTML = `
    <div class="recharge-modal">
      <header>
        <h3>Recharge & Upgrade Plan</h3>
        <button class="recharge-close" id="recharge-modal-close" aria-label="Close">&times;</button>
      </header>
      <div class="recharge-modal-content">
        <p class="recharge-hint" id="recharge-hint">Loading plan details...</p>
        <div class="plan-grid" id="recharge-plan-grid"></div>
        <div class="recharge-actions">
          <button class="btn-secondary" id="recharge-cancel-btn">Cancel</button>
          <button class="btn-primary" id="recharge-pay-btn">Pay Now</button>
        </div>
        <div class="recharge-status" id="recharge-status"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);

  document.getElementById("subscription-recharge-btn").addEventListener("click", openRechargeModal);
  document.getElementById("lock-screen-recharge-btn").addEventListener("click", openRechargeModal);
  document.getElementById("recharge-modal-close").addEventListener("click", closeRechargeModal);
  document.getElementById("recharge-cancel-btn").addEventListener("click", closeRechargeModal);
  document.getElementById("recharge-pay-btn").addEventListener("click", startRechargePayment);
}

function showStatus(message) {
  const node = document.getElementById("recharge-status");
  if (node) node.textContent = message || "";
}

function renderAlertBar(subscription) {
  const bar = document.getElementById("subscription-alert-bar");
  const content = document.getElementById("subscription-alert-content");
  const expiryDate = getSubscriptionExpiryDate(subscription);
  if (!bar || !content || !expiryDate) return;

  const daysLeft = getDaysRemaining(expiryDate);
  const graceSummary = getGraceSummary(subscription);
  if (daysLeft > 7) {
    bar.style.display = "none";
    return;
  }

  if (daysLeft <= 1) {
    content.textContent = `Your subscription expires soon: ${formatCountdown(expiryDate)}${graceSummary ? ` | ${graceSummary}` : ""}`;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      content.textContent = `Your subscription expires soon: ${formatCountdown(expiryDate)}${graceSummary ? ` | ${graceSummary}` : ""}`;
    }, 1000);
  } else {
    if (countdownInterval) clearInterval(countdownInterval);
    content.textContent = `Your subscription expires in ${daysLeft} day(s). Recharge now to avoid interruption.${graceSummary ? ` ${graceSummary}` : ""}`;
  }
  bar.style.display = "flex";
}

function renderLockScreen(shouldLock) {
  const lock = document.getElementById("subscription-lock-screen");
  if (!lock) return;
  lock.style.display = shouldLock ? "flex" : "none";
}

async function refreshSubscriptionUi() {
  try {
    const response = await apiRequest("/check-subscription", { method: "POST" });
    latestSubscription = response?.subscription || null;
    const isActive = Boolean(response?.isActive);
    renderAlertBar(latestSubscription);
    renderLockScreen(!isActive);
  } catch (error) {
    console.error("Subscription status check failed:", error.message);
  }
}

function closeRechargeModal() {
  const modal = document.getElementById("recharge-modal-overlay");
  if (modal) modal.style.display = "none";
}

function renderRechargePlans(data) {
  latestRechargeOptions = data;
  const grid = document.getElementById("recharge-plan-grid");
  const hint = document.getElementById("recharge-hint");
  if (!grid || !hint) return;

  const plans = data?.availablePlans || [];
  const defaultPlan = data?.defaultSelectedPlan || data?.currentPlan || "yearly";
  const minimumPlan = data?.minimumRechargePlan || "yearly";

  hint.textContent = `Current plan: ${data?.currentPlan || "NA"} | Minimum recharge: ${minimumPlan}. Default selected plan is your current plan.`;
  grid.innerHTML = "";

  plans.forEach((plan) => {
    const item = document.createElement("div");
    item.className = "plan-card";
    item.dataset.plan = plan.planType;
    item.innerHTML = `
      <h4>${plan.planType}</h4>
      <p class="price">${formatCurrency(plan.amount)}</p>
      <small>${plan.durationMonths} month(s)</small>
    `;

    if (plan.planType === defaultPlan) {
      item.classList.add("active");
    }
    item.addEventListener("click", () => {
      document.querySelectorAll(".plan-card").forEach((card) => card.classList.remove("active"));
      item.classList.add("active");
      showStatus("");
    });
    grid.appendChild(item);
  });
}

async function openRechargeModal() {
  try {
    const modal = document.getElementById("recharge-modal-overlay");
    if (modal) modal.style.display = "flex";
    showStatus("Loading recharge options...");

    const data = await apiRequest("/recharge-options", { method: "GET" });
    if (data?.serverTime) syncServerClock(data.serverTime);
    renderRechargePlans(data);
    showStatus("");
  } catch (error) {
    showStatus(error.message || "Unable to load recharge options");
  }
}

async function loadRazorpayScript() {
  if (window.Razorpay) return true;
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "/vendor/razorpay/checkout.stub.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

async function startRechargePayment() {
  try {
    const selectedCard = document.querySelector(".plan-card.active");
    const selectedPlan = selectedCard?.dataset?.plan;
    if (!selectedPlan) {
      showStatus("Please select a plan.");
      return;
    }

    showStatus("Creating payment order...");
    const orderPayload = await apiRequest("/create-order", {
      method: "POST",
      body: JSON.stringify({ planType: selectedPlan })
    });
    const orderId = String(orderPayload?.order?.id || "");
    if (orderPayload?.gatewayMode === "mock" || orderId.includes("_mock_")) {
      showStatus("Payment gateway not configured on server. Contact admin.");
      return;
    }

    const scriptReady = await loadRazorpayScript();
    if (!scriptReady || !window.Razorpay) {
      showStatus("Razorpay SDK failed to load.");
      return;
    }

    const keyId = orderPayload?.razorpayKeyId || latestRechargeOptions?.razorpayKeyId || "";
    if (!keyId) {
      showStatus("Razorpay key is missing. Contact admin.");
      return;
    }

    const options = {
      key: keyId,
      amount: orderPayload.order.amount,
      currency: orderPayload.order.currency || "INR",
      name: "Subscription Recharge",
      description: `Plan: ${orderPayload?.selectedPlan?.planType || selectedPlan}`,
      order_id: orderId,
      prefill: {
        name: orderPayload?.user?.name || "",
        email: orderPayload?.user?.email || "",
        contact: orderPayload?.user?.phone || ""
      },
      notes: {
        planType: orderPayload?.selectedPlan?.planType || selectedPlan
      },
      theme: { color: "#0052CC" },
      handler: async function (response) {
        try {
          showStatus("Verifying payment...");
          await apiRequest("/verify-payment", {
            method: "POST",
            body: JSON.stringify(response)
          });
          showStatus("Payment successful. Subscription activated.");
          closeRechargeModal();
          await refreshSubscriptionUi();
        } catch (error) {
          showStatus(`Verification failed: ${error.message}`);
        }
      },
      modal: {
        ondismiss: function () {
          showStatus("Payment cancelled.");
        }
      }
    };

    const razorpay = new window.Razorpay(options);
    razorpay.open();
  } catch (error) {
    showStatus(error.message || "Unable to start payment.");
  }
}

function fillOnlinePaymentPanel() {
  const mount = document.getElementById("online-payment-dynamic");
  if (!mount) return;

  const currentPlan = latestRechargeOptions?.currentPlan || latestSubscription?.planDuration || "NA";
  const expiry = getSubscriptionExpiryDate(latestSubscription);
  const endDate = expiry ? new Date(expiry).toLocaleString() : "NA";
  const daysLeft = expiry ? getDaysRemaining(expiry) : "-";
  const graceSummary = getGraceSummary(latestSubscription);

  mount.innerHTML = `
    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#f8fafc;">
      <p style="margin:0 0 6px;"><strong>Current Plan:</strong> ${currentPlan}</p>
      <p style="margin:0 0 6px;"><strong>Expiry:</strong> ${endDate}</p>
      <p style="margin:0 0 6px;"><strong>Days Left:</strong> ${daysLeft}</p>
      ${graceSummary ? `<p style="margin:0;"><strong>${graceSummary}</strong></p>` : ""}
    </div>
    <div style="margin-top:12px;">
      <button id="open-recharge-from-panel" style="border:0;background:#0052cc;color:#fff;padding:10px 14px;border-radius:8px;cursor:pointer;font-weight:700;">
        Recharge / Upgrade Plan
      </button>
    </div>
  `;
}

function wireDynamicPageActions() {
  fillOnlinePaymentPanel();
  const openBtn = document.getElementById("open-recharge-from-panel");
  if (openBtn) {
    openBtn.addEventListener("click", openRechargeModal);
  }
}

function tp() {
  const toggle = document.getElementById("toggle");
  const rightCon = document.getElementById("right-container");
  const isSet = toggle.classList.toggle("hide");
  if (isSet) {
    rightCon.style.width = "100vw";
    rightCon.style.marginLeft = "0vw";
    return;
  }
  rightCon.style.width = "80vw";
  rightCon.style.marginLeft = "18.5vw";
}

function toggleSubItems(id) {
  const subItems = document.getElementById(id);
  const toggleItem = subItems.previousElementSibling;
  if (subItems.style.display === "block") subItems.style.display = "none";
  else subItems.style.display = "block";
  toggleItem.classList.toggle("expanded");
}

function loadContent(url) {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.onload = function () {
    if (xhr.status >= 200 && xhr.status < 300) {
      document.getElementById("right-container").innerHTML = xhr.responseText;
      wireDynamicPageActions();
      return;
    }
    document.getElementById("right-container").innerHTML = "Error loading content.";
  };
  xhr.send();
}

window.onload = async function () {
  ensureUiShell();
  const savedContent = localStorage.getItem("savedContent");
  if (savedContent) {
    // Keep existing behavior.
  } else {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "Dashboard.html", true);
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        document.getElementById("right-container").innerHTML = xhr.responseText;
        wireDynamicPageActions();
        return;
      }
      document.getElementById("right-container").innerHTML = "Error loading content.";
    };
    xhr.send();
  }

  await refreshSubscriptionUi();
  setInterval(refreshSubscriptionUi, 60 * 1000);
};

window.loadContent = loadContent;
window.tp = tp;
window.toggleSubItems = toggleSubItems;
