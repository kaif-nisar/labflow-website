// Global variables
let userId;
let role;
let username;
let userRole;
let user;
let BASE_URL = window.location.origin;
let subscriptionServerOffsetMs = 0;
let subscriptionCountdownInterval = null;
let subscriptionStatusInterval = null;
let subscriptionBannerDismissed = false;
let subscriptionBannerExpanded = false;
let subscriptionBannerPositionObserversInstalled = false;
let subscriptionBannerLastLayout = null;
let pageTransitionSequence = 0;
let activePageTransitionSession = null;
let isPageFetchTrackingInstalled = false;

function normalizeGlobalId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return normalizeGlobalId(value._id);
  if (typeof value === "object" && value.id) return normalizeGlobalId(value.id);
  return String(value);
}

function syncAdminGlobals() {
  window.userId = normalizeGlobalId(userId || user?.parentUser || user?._id);
  window.role = role || "";
  window.username = username || "";
  window.userRole = userRole || "";
  window.user = user || null;
  window.BASE_URL = BASE_URL || window.location.origin;
}

function getPortalSubscriptionState(currentUser = user) {
  const tenantSubscription = currentUser?.tenantId?.subscriptionPlan;
  if (tenantSubscription && typeof tenantSubscription.isActive === "boolean") {
    return tenantSubscription;
  }

  return currentUser?.subscription || null;
}

function isPortalSubscriptionLocked(currentUser = user) {
  return getPortalSubscriptionState(currentUser)?.isActive === false;
}

function syncSubscriptionServerClock(serverDateHeaderOrIso) {
  if (!serverDateHeaderOrIso) return;
  const serverTime = new Date(serverDateHeaderOrIso).getTime();
  if (Number.isFinite(serverTime)) {
    subscriptionServerOffsetMs = serverTime - Date.now();
  }
}

function subscriptionNow() {
  return Date.now() + subscriptionServerOffsetMs;
}

function getSubscriptionEffectiveEndDate(subscription) {
  return (
    subscription?.effectiveEndDate ||
    subscription?.gracePeriod?.graceUntil ||
    subscription?.endDate ||
    null
  );
}

function formatSubscriptionCountdown(endDate) {
  const diff = new Date(endDate).getTime() - subscriptionNow();
  if (diff <= 0) return "00d 00h 00m 00s";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return `${String(days).padStart(2, "0")}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function formatSubscriptionBannerCountdown(endDate) {
  const diff = getSubscriptionRemainingMs(endDate);
  const totalHours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return `${String(totalHours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function getSubscriptionDaysLeft(endDate) {
  const diff = new Date(endDate).getTime() - subscriptionNow();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getSubscriptionRemainingMs(endDate) {
  return Math.max(0, new Date(endDate).getTime() - subscriptionNow());
}

function getSubscriptionSignedRemainingMs(endDate) {
  return new Date(endDate).getTime() - subscriptionNow();
}

function getSubscriptionSeverity(endDate) {
  const diffMs = getSubscriptionRemainingMs(endDate);
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours <= 6) return "critical";
  if (diffHours <= 48) return "danger";
  return "warning";
}

function formatSubscriptionDisplayDate(dateLike) {
  if (!dateLike) return "--";
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "--";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatSubscriptionShortCountdown(endDate) {
  const diff = getSubscriptionRemainingMs(endDate);
  const totalHours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return `${String(totalHours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function getSubscriptionPlanLabel(subscription) {
  if (!subscription) return "Active Plan";
  if (subscription.planName) return subscription.planName;
  if (subscription.planDuration && subscription.planLayer) {
    return `${subscription.planDuration} • ${subscription.planLayer}`;
  }
  if (subscription.planDuration) return String(subscription.planDuration);
  if (subscription.planLayer) return `Layer ${subscription.planLayer}`;
  if (subscription.durationDays) return `${subscription.durationDays} Days Plan`;
  return "Active Plan";
}

function getSubscriptionStatusLabel(subscription) {
  if (!subscription) return "Unavailable";
  if (subscription.isActive === false) return "Expired";
  if (subscription.paymentStatus) return String(subscription.paymentStatus).replace(/^\w/, (ch) => ch.toUpperCase());
  return "Active";
}

function getSubscriptionReminderCopy(daysLeft, severity) {
  if (severity === "expired") {
    return "Your subscription has expired. Renew now to restore uninterrupted access to the portal.";
  }
  if (severity === "critical") {
    return "Final renewal window is running. Renew now to avoid an immediate service interruption.";
  }
  if (severity === "danger") {
    return "Less than 48 hours remain. Please renew now to keep bookings and reports running smoothly.";
  }
  return `Your subscription is in its final ${daysLeft} day(s). A timely renewal will prevent portal interruption.`;
}

function installPageFetchTracking() {
  if (isPageFetchTrackingInstalled || typeof window.fetch !== "function") return;

  const originalFetch = window.fetch.bind(window);
  isPageFetchTrackingInstalled = true;

  window.fetch = function trackedPageFetch(input, init) {
    const session = activePageTransitionSession;
    const isSilent = Boolean(init && init.__topLoaderSilent);

    if (!session || isSilent) {
      return originalFetch(input, init);
    }

    session.pendingFetches += 1;
    return Promise.resolve(originalFetch(input, init)).finally(() => {
      session.pendingFetches = Math.max(0, session.pendingFetches - 1);
      session.lastActivityAt = performance.now();
    });
  };
}

function sanitizePreviewIds(root) {
  if (!(root instanceof HTMLElement)) return;
  root.removeAttribute("id");
  root.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
}

function createPagePreview(container) {
  if (!(container instanceof HTMLElement)) return null;

  const preview = container.cloneNode(true);
  sanitizePreviewIds(preview);
  preview.setAttribute("aria-hidden", "true");
  preview.dataset.pagePreview = "true";
  preview.style.position = "absolute";
  preview.style.inset = "0";
  preview.style.zIndex = "2";
  preview.style.pointerEvents = "none";
  preview.style.overflow = "hidden";
  preview.style.background = "inherit";
  preview.style.opacity = "1";
  preview.style.visibility = "visible";
  preview.style.transition = "opacity 160ms ease";
  return preview;
}

function removePagePreview(container) {
  container?.querySelectorAll('[data-page-preview="true"]').forEach((node) => node.remove());
}

function createHiddenPageBuildContainer(liveContainer) {
  if (!(liveContainer instanceof HTMLElement) || !liveContainer.parentElement) {
    return null;
  }

  const rect = liveContainer.getBoundingClientRect();
  const staging = document.createElement("div");
  staging.className = liveContainer.className;
  staging.id = liveContainer.id;
  staging.dataset.stagingContentBox = "true";
  staging.setAttribute("aria-hidden", "true");
  staging.style.position = "fixed";
  staging.style.left = "-200vw";
  staging.style.top = "0";
  staging.style.width = `${Math.max(320, Math.round(rect.width || liveContainer.offsetWidth || 320))}px`;
  staging.style.maxWidth = `${Math.max(320, Math.round(rect.width || liveContainer.offsetWidth || 320))}px`;
  staging.style.visibility = "hidden";
  staging.style.pointerEvents = "none";
  staging.style.opacity = "0";
  staging.style.zIndex = "-1";
  staging.style.overflow = "hidden";

  liveContainer.parentElement.insertBefore(staging, liveContainer);
  return staging;
}

function destroyHiddenPageBuildContainer(staging) {
  if (staging instanceof HTMLElement) {
    staging.remove();
  }
}

function swapBuiltPageIntoLiveContainer(staging, liveContainer) {
  if (!(staging instanceof HTMLElement) || !(liveContainer instanceof HTMLElement)) {
    return;
  }

  liveContainer.innerHTML = "";
  const fragment = document.createDocumentFragment();
  while (staging.firstChild) {
    fragment.appendChild(staging.firstChild);
  }
  liveContainer.appendChild(fragment);
}

function prepareContainerForHiddenBuild(container) {
  if (!(container instanceof HTMLElement)) return () => {};

  removePagePreview(container);
  const preview = createPagePreview(container);
  const previousPosition = container.style.position;
  const previousVisibility = container.style.visibility;
  const previousPointerEvents = container.style.pointerEvents;

  if (!previousPosition) {
    container.style.position = "relative";
  }
  if (preview) {
    container.appendChild(preview);
  }

  container.style.visibility = "hidden";
  container.style.pointerEvents = "none";

  return () => {
    removePagePreview(container);
    container.style.visibility = previousVisibility;
    container.style.pointerEvents = previousPointerEvents;
    container.style.position = previousPosition;
  };
}

function waitForAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForPageStability(container, session, options = {}) {
  const quietWindowMs = options.quietWindowMs || 260;
  const timeoutMs = options.timeoutMs || 12000;
  const startedAt = performance.now();
  let lastMutationAt = performance.now();

  const observer = new MutationObserver(() => {
    lastMutationAt = performance.now();
    if (session) {
      session.lastActivityAt = lastMutationAt;
    }
  });

  if (container instanceof HTMLElement) {
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
  }

  try {
    while (performance.now() - startedAt < timeoutMs) {
      await waitForAnimationFrame();
      await waitForAnimationFrame();

      const now = performance.now();
      const noPendingFetches = !session || session.pendingFetches === 0;
      const domQuiet = now - lastMutationAt >= quietWindowMs;

      if (noPendingFetches && domQuiet) {
        await waitForAnimationFrame();
        return true;
      }
    }
  } finally {
    observer.disconnect();
  }

  return false;
}

function positionSubscriptionBanner() {
  const container = document.getElementById("content-box");
  const portal = document.getElementById("subscription-alert-portal");
  if (!container || !portal) return;

  const topbar = document.getElementById("top-navbar");
  const rect = container.getBoundingClientRect();
  const computed = window.getComputedStyle(container);
  const leftInset = parseFloat(computed.paddingLeft) || 0;
  const rightInset = parseFloat(computed.paddingRight) || 0;
  const usableWidth = Math.max(280, rect.width - leftInset - rightInset);
  const centerX = rect.left + (rect.width / 2);
  const topbarHeight = topbar?.getBoundingClientRect?.().height || 0;
  const preferredTop = topbarHeight + 10;
  const nextTop = Math.max(12, preferredTop);
  const hasStableRect = rect.width >= 320 && rect.height > 0;
  const isCenterWithinViewport = centerX >= (usableWidth / 2) && centerX <= (window.innerWidth - (usableWidth / 2));

  if (!hasStableRect || !isCenterWithinViewport) {
    if (subscriptionBannerLastLayout) {
      portal.style.left = subscriptionBannerLastLayout.left;
      portal.style.width = subscriptionBannerLastLayout.width;
      portal.style.top = subscriptionBannerLastLayout.top;
      portal.style.transform = "translateX(-50%)";
    }
    return;
  }

  subscriptionBannerLastLayout = {
    left: `${Math.max(0, centerX)}px`,
    width: `${Math.max(280, usableWidth)}px`,
    top: `${nextTop}px`
  };

  portal.style.left = subscriptionBannerLastLayout.left;
  portal.style.width = subscriptionBannerLastLayout.width;
  portal.style.top = subscriptionBannerLastLayout.top;
  portal.style.transform = "translateX(-50%)";
}

function syncSubscriptionBannerPosition(frames = 8) {
  let remainingFrames = Math.max(1, frames);

  const updatePosition = () => {
    positionSubscriptionBanner();
    remainingFrames -= 1;
    if (remainingFrames > 0) {
      requestAnimationFrame(updatePosition);
    }
  };

  requestAnimationFrame(updatePosition);
}

function installSubscriptionBannerPositionTracking() {
  if (subscriptionBannerPositionObserversInstalled) return;

  const contentBox = document.getElementById("content-box");
  const topbar = document.getElementById("top-navbar");
  if (!contentBox) return;

  subscriptionBannerPositionObserversInstalled = true;

  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(() => {
      syncSubscriptionBannerPosition(6);
    });

    resizeObserver.observe(contentBox);
    if (topbar) {
      resizeObserver.observe(topbar);
    }
  }

  contentBox.addEventListener("transitionend", () => syncSubscriptionBannerPosition(6));
  window.addEventListener("scroll", positionSubscriptionBanner, { passive: true });
}

function setSubscriptionBannerExpanded(isExpanded) {
  subscriptionBannerExpanded = Boolean(isExpanded);
  const bar = document.querySelector("#subscription-alert-portal #subscription-alert-bar");
  const toggleButton = document.querySelector("#subscription-alert-expand");
  if (!bar) return;

  bar.classList.toggle("is-expanded", subscriptionBannerExpanded);
  if (toggleButton) {
    toggleButton.setAttribute("aria-expanded", subscriptionBannerExpanded ? "true" : "false");
    toggleButton.innerHTML = subscriptionBannerExpanded
      ? `<span>Hide</span>
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
           <path d="m18 15-6-6-6 6"></path>
         </svg>`
      : `<span>Details</span>
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
           <path d="m6 9 6 6 6-6"></path>
         </svg>`;
  }
}

function ensureSubscriptionBannerShell() {
  const container = document.getElementById("content-box");
  if (!container || !document.body) return null;

  if (!document.getElementById("subscription-alert-style")) {
    const style = document.createElement("style");
    style.id = "subscription-alert-style";
    style.textContent = `
      .subscription-alert-portal {
        position: fixed;
        top: 0;
        z-index: 2147483000;
        pointer-events: none;
        max-width: 100%;
        overflow: hidden;
        display: flex;
        justify-content: center;
        align-items: flex-start;
      }
      .subscription-alert-bar {
        display: none;
        pointer-events: auto;
        position: relative;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        margin: 0 auto;
        border-radius: 20px;
        overflow: hidden;
        color: #17324d;
        background: linear-gradient(135deg, rgba(255, 247, 214, 0.99), rgba(255, 230, 166, 0.96));
        border: 1px solid rgba(227, 159, 28, 0.72);
        box-shadow:
          0 26px 60px rgba(168, 112, 7, 0.24),
          inset 0 1px 0 rgba(255,255,255,0.75);
        backdrop-filter: blur(18px);
        transform: translateX(0) translateY(-10px) scale(0.985);
        opacity: 0;
        min-height: 72px;
        max-height: 72px;
        transition:
          opacity 0.28s ease,
          transform 0.28s ease,
          box-shadow 0.28s ease,
          border-color 0.28s ease,
          max-height 0.28s ease;
      }
      .subscription-alert-bar.is-dismissing {
        opacity: 0 !important;
        transform: translate3d(var(--dismiss-x, 0), var(--dismiss-y, 0), 0) scale(0.82) !important;
      }
      .subscription-alert-bar.is-visible {
        opacity: 1;
        transform: translateX(0) translateY(0) scale(1);
      }
      .subscription-alert-bar.is-expanded {
        max-height: min(78vh, 520px);
      }
      .subscription-alert-bar::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,0.75), transparent 38%),
          linear-gradient(135deg, rgba(255,255,255,0.22), transparent 52%);
        pointer-events: none;
      }
      .subscription-alert-bar[data-severity="warning"] {
        border-color: rgba(232, 167, 19, 0.88);
        box-shadow: 0 26px 54px rgba(196, 141, 18, 0.26);
      }
      .subscription-alert-bar[data-severity="danger"] {
        border-color: rgba(241, 142, 88, 0.84);
        background: linear-gradient(135deg, rgba(255, 240, 228, 0.99), rgba(255, 208, 172, 0.96));
        box-shadow: 0 28px 58px rgba(208, 110, 48, 0.3);
      }
      .subscription-alert-bar[data-severity="critical"] {
        border-color: rgba(230, 93, 93, 0.88);
        background: linear-gradient(135deg, rgba(255, 235, 235, 0.99), rgba(255, 194, 194, 0.96));
        box-shadow: 0 30px 66px rgba(195, 68, 68, 0.34);
        animation: subscriptionAlertPulse 2.15s ease-in-out infinite;
      }
      .subscription-alert-shell {
        position: relative;
        z-index: 1;
        display: grid;
        gap: 0;
        width: 100%;
      }
      .subscription-alert-summary {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        min-height: 72px;
        padding: 12px 16px;
        min-width: 0;
      }
      .subscription-alert-summaryMain {
        min-width: 0;
        display: grid;
        gap: 6px;
      }
      .subscription-alert-head {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        min-width: 0;
      }
      .subscription-alert-summaryMain {
        width: 100%;
      }
      .subscription-alert-titleWrap {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        width: 100%;
      }
      .subscription-alert-icon {
        width: 42px;
        height: 42px;
        flex: 0 0 42px;
        border-radius: 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(145deg, rgba(255,255,255,0.96), rgba(244,248,255,0.88));
        border: 1px solid rgba(211, 222, 237, 0.95);
        box-shadow: 0 10px 24px rgba(43, 68, 96, 0.12);
      }
      .subscription-alert-icon svg {
        width: 22px;
        height: 22px;
        color: #b87a16;
      }
      .subscription-alert-bar[data-severity="danger"] .subscription-alert-icon svg {
        color: #c46232;
      }
      .subscription-alert-bar[data-severity="critical"] .subscription-alert-icon svg {
        color: #c14444;
      }
      .subscription-alert-kicker {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #8e5700;
      }
      .subscription-alert-bar[data-severity="danger"] .subscription-alert-kicker {
        color: #9d4f27;
      }
      .subscription-alert-bar[data-severity="critical"] .subscription-alert-kicker {
        color: #a73d3d;
      }
      .subscription-alert-kicker[data-mode="countdown"] {
        text-transform: none;
        letter-spacing: 0.04em;
        font-variant-numeric: tabular-nums;
        font-size: clamp(20px, 2vw, 28px);
        font-weight: 800;
        line-height: 1;
      }
      .subscription-alert-kicker.is-expired {
        color: #c14444 !important;
        font-size: 15px;
        line-height: 1.2;
      }
      .subscription-alert-heading {
        font-size: 15px;
        font-weight: 700;
        line-height: 1.2;
        color: #12304b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .subscription-alert-scroll {
        min-width: 0;
        width: 100%;
        justify-self: stretch;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .subscription-alert-scroll::-webkit-scrollbar {
        display: none;
      }
      .subscription-alert-track {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 10px;
        width: 100%;
        padding-bottom: 2px;
      }
      .subscription-alert-inlineChip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 34px;
        padding: 7px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.72);
        border: 1px solid rgba(214, 162, 44, 0.54);
        white-space: nowrap;
        color: #294765;
      }
      .subscription-alert-inlineChip--wide {
        width: auto;
        justify-content: space-between;
      }
      .subscription-alert-inlineChip--wide .subscription-alert-inlineValue {
        text-align: right;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .subscription-alert-inlineLabel {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #74869b;
      }
      .subscription-alert-inlineValue {
        font-size: 12px;
        font-weight: 700;
        color: #13314b;
      }
      .subscription-alert-inlineChip.is-emphasis {
        background: linear-gradient(135deg, rgba(255,255,255,0.96), rgba(255,238,238,0.92));
        border-color: rgba(214, 92, 92, 0.35);
      }
      .subscription-alert-inlineChip.is-emphasis .subscription-alert-inlineLabel {
        color: #a14b4b;
      }
      .subscription-alert-inlineChip.is-emphasis .subscription-alert-inlineValue {
        color: #692626;
      }
      .subscription-alert-actionsInline {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 0 0 auto;
        justify-self: end;
        margin-left: auto;
      }
      .subscription-alert-expand,
      .subscription-alert-close {
        min-width: 40px;
        height: 40px;
        padding: 0 12px;
        flex: 0 0 auto;
        border: 0;
        border-radius: 12px;
        background: rgba(255,255,255,0.78);
        color: #5f738b;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        cursor: pointer;
        box-shadow: inset 0 0 0 1px rgba(212, 222, 233, 0.84);
        transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
      }
      .subscription-alert-expand:hover,
      .subscription-alert-close:hover {
        background: rgba(255,255,255,0.98);
        color: #334b67;
        transform: translateY(-1px);
      }
      .subscription-alert-expand span {
        font-size: 12px;
        font-weight: 700;
      }
      .subscription-alert-expand svg,
      .subscription-alert-close svg {
        width: 18px;
        height: 18px;
      }
      .subscription-alert-details {
        display: grid;
        gap: 12px;
        min-width: 0;
        padding: 0 16px 16px;
        max-height: calc(min(78vh, 520px) - 92px);
        overflow-y: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .subscription-alert-details::-webkit-scrollbar {
        display: none;
      }
      .subscription-alert-bar:not(.is-expanded) .subscription-alert-details {
        display: none;
      }
      .subscription-alert-bar.is-expanded .subscription-alert-details {
        display: grid;
      }
      .subscription-alert-detailsPanel {
        display: grid;
        gap: 12px;
        padding: 16px;
        border-radius: 16px;
        background: linear-gradient(160deg, rgba(245,249,255,0.96), rgba(236,243,250,0.86));
        border: 1px solid rgba(208, 220, 234, 0.95);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.88);
      }
      .subscription-alert-statusRow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      .subscription-alert-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255,255,255,0.88);
        border: 1px solid rgba(215, 224, 236, 0.95);
        font-size: 12px;
        font-weight: 700;
        color: #36506b;
      }
      .subscription-alert-pillDot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #d09b31;
        box-shadow: 0 0 0 6px rgba(208, 155, 49, 0.12);
      }
      .subscription-alert-bar[data-severity="danger"] .subscription-alert-pillDot {
        background: #d47848;
        box-shadow: 0 0 0 6px rgba(212, 120, 72, 0.12);
      }
      .subscription-alert-bar[data-severity="critical"] .subscription-alert-pillDot {
        background: #d04b4b;
        box-shadow: 0 0 0 6px rgba(208, 75, 75, 0.14);
      }
      .subscription-alert-timerCard {
        display: grid;
        gap: 8px;
        padding: 16px 18px;
        border-radius: 16px;
        background: linear-gradient(145deg, rgba(255,255,255,0.98), rgba(255,244,204,0.92));
        border: 1px solid rgba(222, 166, 29, 0.5);
      }
      .subscription-alert-timerLabel {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #87611e;
      }
      .subscription-alert-timerValue {
        font-size: clamp(24px, 2.4vw, 34px);
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.03em;
        color: #ac6500;
        font-variant-numeric: tabular-nums;
        overflow-wrap: anywhere;
      }
      .subscription-alert-bar[data-severity="critical"] .subscription-alert-timerValue {
        color: #b83d3d;
      }
      .subscription-alert-timerHint {
        font-size: 13px;
        color: #6d5e45;
        line-height: 1.45;
      }
      .subscription-alert-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        width: 100%;
      }
      .subscription-alert-cta,
      .subscription-alert-secondary {
        min-height: 42px;
        padding: 11px 14px;
        border-radius: 12px;
        border: 0;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      }
      .subscription-alert-cta {
        flex: 1 1 220px;
        color: #fff;
        background: linear-gradient(135deg, #2570e8, #1c58c8);
        box-shadow: 0 14px 30px rgba(37, 112, 232, 0.24);
      }
      .subscription-alert-secondary {
        flex: 1 1 200px;
        color: #39506c;
        background: rgba(255,255,255,0.88);
        border: 1px solid rgba(213, 223, 234, 0.95);
      }
      .subscription-alert-cta:hover,
      .subscription-alert-secondary:hover {
        transform: translateY(-1px);
      }
      .subscription-alert-bar[data-severity="critical"] .subscription-alert-cta {
        background: linear-gradient(135deg, #d45f5f, #b83d3d);
        box-shadow: 0 14px 30px rgba(184, 61, 61, 0.28);
      }
      .subscription-alert-footerNote {
        font-size: 12px;
        line-height: 1.45;
        color: #6d7f96;
      }
      .subscription-alert-contactCard {
        display: grid;
        gap: 10px;
        padding: 14px 16px;
        border-radius: 16px;
        background: linear-gradient(135deg, rgba(255, 244, 244, 0.98), rgba(255, 233, 233, 0.94));
        border: 1px solid rgba(219, 92, 92, 0.2);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
      }
      .subscription-alert-contactLead {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #b64040;
      }
      .subscription-alert-contactTitle {
        font-size: 14px;
        font-weight: 700;
        color: #6d2222;
      }
      .subscription-alert-contactGrid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .subscription-alert-contactItem {
        display: grid;
        gap: 4px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(255,255,255,0.82);
        border: 1px solid rgba(214, 194, 194, 0.75);
      }
      .subscription-alert-contactItemLabel {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #8a5a5a;
      }
      .subscription-alert-contactItemValue {
        font-size: 13px;
        font-weight: 700;
        color: #4c1f1f;
        overflow-wrap: anywhere;
      }
      .subscription-alert-hidden {
        display: none !important;
      }
      @media (max-width: 768px) {
        .subscription-alert-portal {
          max-width: 100%;
        }
        .subscription-alert-bar {
          width: 100%;
          min-height: 64px;
          max-height: 64px;
          border-radius: 16px;
        }
        .subscription-alert-bar.is-expanded {
          max-height: min(80vh, 560px);
        }
        .subscription-alert-summary {
          grid-template-columns: auto minmax(0, 1fr) auto;
          min-height: 64px;
          padding: 8px 12px;
          gap: 8px;
        }
        .subscription-alert-actionsInline {
          grid-column: auto;
          justify-content: flex-end;
          margin-left: auto;
        }
        .subscription-alert-titleWrap {
          gap: 8px;
        }
        .subscription-alert-heading {
          font-size: 14px;
        }
        .subscription-alert-icon {
          width: 36px;
          height: 36px;
          flex-basis: 36px;
        }
        .subscription-alert-expand,
        .subscription-alert-close {
          min-width: 36px;
          height: 36px;
          padding: 0 10px;
          border-radius: 10px;
        }
        .subscription-alert-expand span {
          display: none;
        }
        .subscription-alert-details {
          padding: 0 12px 12px;
        }
      }
      @media (max-width: 520px) {
        .subscription-alert-summary {
          grid-template-columns: auto minmax(0, 1fr) auto;
        }
        .subscription-alert-actionsInline {
          display: none;
        }
        .subscription-alert-track {
          width: max-content;
          min-width: 100%;
        }
        .subscription-alert-contactGrid {
          grid-template-columns: 1fr;
        }
        .subscription-alert-statusRow,
        .subscription-alert-actions {
          flex-direction: column;
          align-items: stretch;
        }
        .subscription-alert-cta,
        .subscription-alert-secondary {
          width: 100%;
        }
        .subscription-alert-side {
          padding: 14px;
        }
      }
      @keyframes subscriptionAlertPulse {
        0%, 100% {
          box-shadow: 0 22px 54px rgba(195, 68, 68, 0.24);
        }
        50% {
          box-shadow: 0 24px 64px rgba(195, 68, 68, 0.34);
        }
      }
    `;
    document.head.appendChild(style);
  }

  let portal = document.getElementById("subscription-alert-portal");
  if (portal) return portal.querySelector("#subscription-alert-bar");

  portal = document.createElement("div");
  portal.id = "subscription-alert-portal";
  portal.className = "subscription-alert-portal";
  portal.innerHTML = `
    <div id="subscription-alert-bar" class="subscription-alert-bar" role="status" aria-live="polite">
      <div class="subscription-alert-shell">
        <div class="subscription-alert-summary">
          <div class="subscription-alert-head">
            <div class="subscription-alert-titleWrap">
              <div class="subscription-alert-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 9v4"></path>
                  <path d="M12 17h.01"></path>
                  <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"></path>
                </svg>
              </div>
            <div class="subscription-alert-summaryMain">
                <div class="subscription-alert-kicker" id="subscription-alert-kicker">0 Days Left</div>
                <div class="subscription-alert-heading" id="subscription-alert-heading">Subscription reminder</div>
              </div>
            </div>
          </div>
          <div class="subscription-alert-scroll">
            <div class="subscription-alert-track">
              <span class="subscription-alert-inlineChip subscription-alert-inlineChip--wide">
                <span class="subscription-alert-inlineLabel">Expiry</span>
                <span class="subscription-alert-inlineValue" id="subscription-end-date-inline">--</span>
              </span>
              <span class="subscription-alert-inlineChip subscription-alert-hidden" id="subscription-contact-whatsapp-chip">
                <span class="subscription-alert-inlineLabel">WhatsApp</span>
                <span class="subscription-alert-inlineValue" id="subscription-contact-whatsapp-inline">9520976242</span>
              </span>
              <span class="subscription-alert-inlineChip subscription-alert-hidden" id="subscription-contact-email-chip">
                <span class="subscription-alert-inlineLabel">Email</span>
                <span class="subscription-alert-inlineValue" id="subscription-contact-email-inline">qodex786@gmail.com</span>
              </span>
            </div>
          </div>
          <div class="subscription-alert-actionsInline">
            <button type="button" class="subscription-alert-expand" id="subscription-alert-expand" aria-label="Expand subscription details" aria-expanded="false">
              <span>Details</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="m6 9 6 6 6-6"></path>
              </svg>
            </button>
            <button type="button" class="subscription-alert-close" id="subscription-alert-close" aria-label="Dismiss subscription alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M18 6 6 18"></path>
                <path d="m6 6 12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="subscription-alert-details">
          <div class="subscription-alert-detailsPanel">
            <div class="subscription-alert-statusRow">
              <div class="subscription-alert-pill">
                <span class="subscription-alert-pillDot"></span>
                <span id="subscription-warning-status">0 Days Left</span>
              </div>
              <div class="subscription-alert-pill">
                <span id="subscription-end-date">--</span>
              </div>
            </div>
            <div class="subscription-alert-timerCard">
              <div class="subscription-alert-timerLabel" id="subscription-timer-label">Expiry Overview</div>
              <div class="subscription-alert-timerValue" id="subscription-timer-value">00h 00m 00s</div>
              <div class="subscription-alert-timerHint" id="subscription-alert-subtext"></div>
              <div class="subscription-alert-timerHint" id="subscription-timer-hint"></div>
            </div>
            <div class="subscription-alert-actions">
              <button type="button" class="subscription-alert-cta" id="subscription-recharge-btn">Renew Subscription</button>
              <button type="button" class="subscription-alert-secondary" id="subscription-view-details-btn">Review Status</button>
            </div>
            <div class="subscription-alert-footerNote" id="subscription-alert-footerNote"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(portal);
  installSubscriptionBannerPositionTracking();
  syncSubscriptionBannerPosition(10);

  const dismiss = () => {
    subscriptionBannerDismissed = true;
    hideSubscriptionBanner();
  };

  const dismissWithDirection = (x, y) => {
    subscriptionBannerDismissed = true;
    if (banner) {
      banner.classList.add("is-dismissing");
      banner.style.setProperty("--dismiss-x", `${x}px`);
      banner.style.setProperty("--dismiss-y", `${y}px`);
      window.setTimeout(() => {
        hideSubscriptionBanner();
        banner.classList.remove("is-dismissing");
        banner.style.removeProperty("--dismiss-x");
        banner.style.removeProperty("--dismiss-y");
      }, 280);
      return;
    }
    hideSubscriptionBanner();
  };

  portal.querySelector("#subscription-recharge-btn")?.addEventListener("click", () => {
    showSubscriptionModal();
  });
  portal.querySelector("#subscription-view-details-btn")?.addEventListener("click", () => {
    showSubscriptionModal();
  });
  portal.querySelector("#subscription-alert-close")?.addEventListener("click", dismiss);
  portal.querySelector("#subscription-alert-expand")?.addEventListener("click", () => {
    setSubscriptionBannerExpanded(!subscriptionBannerExpanded);
  });

  const banner = portal.querySelector("#subscription-alert-bar");
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartedAt = 0;

  const handleSwipeStart = (event) => {
    const point = event.touches?.[0];
    if (!point) return;
    if (event.target.closest("button, a, input, textarea, select, label")) {
      touchStartedAt = 0;
      return;
    }
    touchStartX = point.clientX;
    touchStartY = point.clientY;
    touchStartedAt = Date.now();
  };

  const handleSwipeEnd = (event) => {
    if (!touchStartedAt) return;
    const point = event.changedTouches?.[0];
    if (!point) return;
    const deltaX = point.clientX - touchStartX;
    const deltaY = point.clientY - touchStartY;
    const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
    const elapsed = Date.now() - touchStartedAt;
    const dominantHorizontal = Math.abs(deltaX) >= Math.abs(deltaY);
    const primaryDistance = dominantHorizontal ? Math.abs(deltaX) : Math.abs(deltaY);
    touchStartedAt = 0;
    if (distance >= 96 && primaryDistance >= 82 && elapsed <= 750) {
      dismissWithDirection(dominantHorizontal ? deltaX * 1.5 : 0, dominantHorizontal ? 0 : deltaY * 1.5);
    }
  };

  banner?.addEventListener("touchstart", handleSwipeStart, { passive: true });
  banner?.addEventListener("touchend", handleSwipeEnd, { passive: true });

  return banner;
}

function hideSubscriptionBanner() {
  const bar = document.querySelector("#subscription-alert-portal #subscription-alert-bar");
  if (bar) {
    bar.style.display = "none";
    bar.classList.remove("is-visible");
  }
  subscriptionBannerExpanded = false;
  if (subscriptionCountdownInterval) {
    clearInterval(subscriptionCountdownInterval);
    subscriptionCountdownInterval = null;
  }
}

function renderSubscriptionBanner(subscription) {
  const bar = ensureSubscriptionBannerShell();
  const endDate = getSubscriptionEffectiveEndDate(subscription);

  if (!bar || !endDate || subscriptionBannerDismissed) {
    hideSubscriptionBanner();
    return;
  }

  const daysLeft = getSubscriptionDaysLeft(endDate);
  const remainingMs = getSubscriptionSignedRemainingMs(endDate);
  const isExpired = remainingMs <= 0 || subscription?.isActive === false;

  if (!isExpired && daysLeft > 7) {
    hideSubscriptionBanner();
    return;
  }

  if (subscriptionCountdownInterval) {
    clearInterval(subscriptionCountdownInterval);
    subscriptionCountdownInterval = null;
  }

  const severity = isExpired ? "expired" : getSubscriptionSeverity(endDate);
  const reminderCopy = getSubscriptionReminderCopy(daysLeft, severity);
  const timerValue = bar.querySelector("#subscription-timer-value");
  const timerLabel = bar.querySelector("#subscription-timer-label");
  const timerHint = bar.querySelector("#subscription-timer-hint");
  const heading = bar.querySelector("#subscription-alert-heading");
  const subtext = bar.querySelector("#subscription-alert-subtext");
  const kicker = bar.querySelector("#subscription-alert-kicker");
  const warningStatus = bar.querySelector("#subscription-warning-status");
  const footerNote = bar.querySelector("#subscription-alert-footerNote");
  const endDateNode = bar.querySelector("#subscription-end-date");
  const endDateInlineNode = bar.querySelector("#subscription-end-date-inline");
  const contactEmailChip = bar.querySelector("#subscription-contact-email-chip");
  const contactWhatsappChip = bar.querySelector("#subscription-contact-whatsapp-chip");

  if (!timerValue || !timerLabel || !timerHint || !heading || !subtext || !kicker || !warningStatus || !footerNote || !endDateNode) {
    return;
  }

  bar.dataset.severity = isExpired ? "critical" : severity;
  endDateNode.textContent = `Expires ${formatSubscriptionDisplayDate(endDate)}`;
  if (endDateInlineNode) endDateInlineNode.textContent = formatSubscriptionDisplayDate(endDate);
  subtext.textContent = reminderCopy;
  kicker.dataset.mode = "countdown";
  kicker.classList.toggle("is-expired", isExpired);
  contactEmailChip?.classList.toggle("subscription-alert-hidden", !isExpired);
  contactWhatsappChip?.classList.toggle("subscription-alert-hidden", !isExpired);
  contactEmailChip?.classList.toggle("is-emphasis", isExpired);
  contactWhatsappChip?.classList.toggle("is-emphasis", isExpired);

  if (isExpired) {
    heading.textContent = "Subscription has expired";
    warningStatus.textContent = "Expired";
  } else if (severity === "critical") {
    heading.textContent = "Subscription is in its final hours";
    warningStatus.textContent = `${daysLeft} Day(s) Left`;
  } else if (severity === "danger") {
    heading.textContent = "Subscription is about to expire";
    warningStatus.textContent = `${daysLeft} Day(s) Left`;
  } else {
    heading.textContent = "Subscription expiry is approaching";
    warningStatus.textContent = `${daysLeft} Day(s) Left`;
  }

  const paintBannerSummary = () => {
    const remainingDays = getSubscriptionDaysLeft(endDate);
    kicker.textContent = formatSubscriptionBannerCountdown(endDate);
    warningStatus.textContent = `${remainingDays} Day(s) Left`;
  };

  if (isExpired) {
    kicker.textContent = "Your subscription has been expired.";
    timerLabel.textContent = "Subscription Expired";
    timerValue.textContent = "Your subscription has been expired.";
    timerHint.textContent = `Contact for instant renewal and restore access immediately.`;
    footerNote.innerHTML = `
      <div class="subscription-alert-contactCard">
        <div class="subscription-alert-contactLead">Immediate Support</div>
        <div class="subscription-alert-contactTitle">Contact for instant renewal</div>
        <div class="subscription-alert-contactGrid">
          <div class="subscription-alert-contactItem">
            <span class="subscription-alert-contactItemLabel">Email</span>
            <span class="subscription-alert-contactItemValue">qodex786@gmail.com</span>
          </div>
          <div class="subscription-alert-contactItem">
            <span class="subscription-alert-contactItemLabel">WhatsApp</span>
            <span class="subscription-alert-contactItemValue">9520976242</span>
          </div>
        </div>
      </div>
    `;
  } else if (getSubscriptionRemainingMs(endDate) <= 48 * 60 * 60 * 1000) {
    const paint = () => {
      paintBannerSummary();
      timerValue.textContent = formatSubscriptionShortCountdown(endDate);
      timerHint.textContent = `Live countdown is running until ${formatSubscriptionDisplayDate(endDate)}.`;
    };
    timerLabel.textContent = "Live Countdown";
    footerNote.textContent = `Refresh-safe tracking is active. The timer follows server time and will continue from the correct remaining duration after reload.`;
    paint();
    subscriptionCountdownInterval = setInterval(paint, 1000);
  } else {
    kicker.textContent = `${daysLeft} Day(s) Left`;
    timerLabel.textContent = "Remaining";
    timerValue.textContent = `${daysLeft} day(s)`;
    timerHint.textContent = `Expiry scheduled for ${formatSubscriptionDisplayDate(endDate)}.`;
    footerNote.textContent = `Refresh-safe tracking is active. The timer follows server time and will continue from the correct remaining duration after reload.`;
    subscriptionCountdownInterval = setInterval(() => {
      const refreshedDaysLeft = getSubscriptionDaysLeft(endDate);
      kicker.textContent = `${refreshedDaysLeft} Day(s) Left`;
      warningStatus.textContent = `${refreshedDaysLeft} Day(s) Left`;
    }, 60000);
  }

  positionSubscriptionBanner();
  bar.style.display = "flex";
  setSubscriptionBannerExpanded(subscriptionBannerExpanded);
  requestAnimationFrame(() => {
    bar.classList.add("is-visible");
  });
  syncSubscriptionBannerPosition(10);
}

async function refreshSubscriptionBanner() {
  try {
    const response = await fetch(`${BASE_URL}/api/v1/user/check-subscription`, {
      method: "POST",
      credentials: "include",
      __topLoaderSilent: true
    });
    syncSubscriptionServerClock(response.headers.get("date"));
    if (!response.ok) return;
    const payload = await response.json();
    renderSubscriptionBanner(payload?.subscription || getPortalSubscriptionState(user));
  } catch (error) {
    console.error("Subscription banner refresh failed:", error);
  }
}

syncAdminGlobals();

// Select elements
const helpDiv = document.querySelector(".help-div");
const helpPopup = document.getElementById("helpPopup");
const closeHelpBtn = document.getElementById("closeHelpBtn");

// Show popup when Help is clicked
helpDiv.addEventListener("click", () => {
  if (helpPopup.style.display === "block") {
    helpPopup.style.display = "none";
  } else {
    helpPopup.style.display = "block";
  }
});

// Also hide if clicking outside the popup
window.addEventListener("click", (e) => {
  if (e.target === helpPopup) {
    helpPopup.style.display = "none";
  }
});


function notifications() {
  const toggleBtn = document.querySelector('#toggleNotifications');
  const notificationContainer = document.querySelector('#notificationContainer');

  toggleBtn.addEventListener('click', () => {

    const isShown = notificationContainer.classList.toggle('show');
    toggleBtn.setAttribute('aria-expanded', isShown);
    if (isShown) {
      // Move focus to the notification container for accessibility
      notificationContainer.focus();
    } else {
      // Return focus to the toggle button
      toggleBtn.focus();
    }
  });
}
notifications();

// Toggle sidebar functionality
function toggleSidebar() {
  let sidebar = document.getElementById("left-navbar");
  let mainContent = document.getElementById("content-box");
  sidebar.classList.toggle("hidden");
  mainContent.classList.toggle("collapsed");
}

// Toggle submenu items
function toggleSubItems(id) {
  var subItems = document.getElementById(id);
  var toggleItem = subItems.previousElementSibling;

  // Toggle the visibility of the sub-items
  if (subItems.style.display === "block") {
    subItems.style.display = "none";
  } else {
    subItems.style.display = "block";
  }
  // Toggle the class for the rotation of the toggle symbol
  toggleItem.classList.toggle("expanded");
}

// Logout functionality
function logout() {
  fetch(`${BASE_URL}/api/v1/user/logout`, {
    method: "POST",
    credentials: "include",
  })
    .then((response) => {
      if (response.ok) {
        localStorage.clear();
        sessionStorage.clear();
        console.log("Logout successful");
        window.location.href = `${BASE_URL}/franchiseelogin.html`;
      } else {
        throw new Error("Logout failed");
      }
    })
    .catch((error) => {
      console.error("Error:", error);
    });
}

// Menu configuration based on user roles and tenant layers
const menuConfig = {
  // First layer admin - hide franchisee sections
  admin1layer: {
    hidden: [
      "Add_franchisse", "List_franchisse", "Accounts",
      "Assign_price", "Bulk_pricing", "Transfer_pricing",
      "Assign_credit", "Credit_history"
    ],
  },
  // Second layer admin - show all franchisee sections
  admin2layer: {
    hidden: [],
  },
  // Third layer admin - show all franchisee sections
  admin3layer: {
    hidden: [],
  },
  // Fourth layer admin - show all franchisee sections
  admin4layer: {
    hidden: [],
  },
  franchisee: {
    // All sections visible for franchisee
    hidden: [],
  },
  staff: {
    // Hide management sections for staff
    hidden: [
      "Add_staff", "List_staff", "Add_lab",
      "List_lab", "Add_doctor", "List_doctor",
    ],
  },
};

/**
 * Apply staff permissions to hide/show menu items and pages
 * @param {Object} user - User object with permissions
 */
function applyStaffPermissions(user) {
  // Only apply for staff role
  if (user.role !== 'staff') {
    console.log('Not a staff user, skipping permission checks');
    return;
  }

  console.log('Applying staff permissions:', user.permissions);

  const permissions = user.permissions || {};

  // Helper function to hide elements by data-page attribute
  function hidePageElements(pageName) {
    const elements = document.querySelectorAll(`[data-page="${pageName}"]`);
    elements.forEach(elem => {
      const parentLi = elem.closest('li');
      if (parentLi) {
        parentLi.style.display = 'none';
      }
    });
  }

  // Helper function to hide sections by ID
  function hideSectionById(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
      section.style.display = 'none';
      // Also hide the parent toggle button
      const parentItem = section.previousElementSibling;
      if (parentItem && parentItem.tagName === 'LI') {
        parentItem.style.display = 'none';
      }
    }
  }

  // Helper function to hide booking section headings
  function hideBookingSection(sectionName) {
    const headings = document.querySelectorAll('.booking-inner span.book_po');
    headings.forEach(heading => {
      if (heading.textContent.includes(sectionName)) {
        const bookingSection = heading.closest('.booking');
        if (bookingSection) {
          bookingSection.style.display = 'none';
        }
      }
    });
  }

  // ==========================================
  // 1. canManageBookings Permission
  // ==========================================
  if (!permissions.canManageBookings) {
    console.log('Hiding booking-related elements');
    
    // Hide samples page
    hidePageElements('samples');
    
    // Hide new booking page
    hidePageElements('new_booking');
    
    // Hide cancel booking page
    hidePageElements('cancel_booking');
    
    // Hide cancelled bookings page
    hidePageElements('cancelled');
    
    // Hide manage booking section
    hideSectionById('manageBooking');
    
    // Hide generate bill section
    hideSectionById('subItems2');
    hidePageElements('generatebill');
    
    // Hide samples dropdown section (subItem001)
    hideSectionById('subItem001');
    
    // Hide top navbar booking button
    const topNavBookingBtns = document.querySelectorAll('.top-navbar [data-page="new_booking"]');
    topNavBookingBtns.forEach(btn => {
      const parentLi = btn.closest('li');
      if (parentLi) parentLi.style.display = 'none';
    });
  }

  // ==========================================
  // 2. canViewReports Permission
  // ==========================================
  if (!permissions.canViewReports) {
    console.log('Hiding reports-related elements');
    
    // Hide cases page
    hidePageElements('allcases');
    
    // Hide samples page
    hidePageElements('samples');
    
    // Hide top navbar cases button
    const topNavCasesBtns = document.querySelectorAll('.top-navbar [data-page="allcases"]');
    topNavCasesBtns.forEach(btn => {
      const parentLi = btn.closest('li');
      if (parentLi) parentLi.style.display = 'none';
    });
    
    // Hide top navbar samples button
    const topNavSamplesBtns = document.querySelectorAll('.top-navbar [data-page="samples"]');
    topNavSamplesBtns.forEach(btn => {
      const parentLi = btn.closest('li');
      if (parentLi) parentLi.style.display = 'none';
    });
  }

  // ==========================================
  // 3. canManageUsers Permission
  // ==========================================
  if (!permissions.canManageUsers) {
    console.log('Hiding user management elements');
    
    // Hide My Franchisee section and all sub-options
    hideSectionById('subItems-b');
    hidePageElements('Add_franchisse');
    hidePageElements('List_franchisse');
    hidePageElements('Accounts');
    
    // Hide Franchisee Price section
    hideSectionById('subItems-c');
    hidePageElements('Assign_price');
    hidePageElements('Bulk_pricing');
    
    // Hide Franchisee Credits section
    hideSectionById('subItems-d');
    hidePageElements('Assign_credit');
    hidePageElements('assignTarget');
    hidePageElements('Credit_history');
    
    // Hide MY FRANCHISEE heading
    hideBookingSection('MY FRANCHISEE');
    
    // Hide orders page
    hidePageElements('Allorders');
    const topNavOrdersBtns = document.querySelectorAll('.top-navbar [data-page="Allorders"]');
    topNavOrdersBtns.forEach(btn => {
      const parentLi = btn.closest('li');
      if (parentLi) parentLi.style.display = 'none';
    });
    
    // Hide My Staff section and all sub-options
    hideSectionById('subItems-e');
    hidePageElements('Add_staff');
    hidePageElements('List_staff');
    hidePageElements('staffActivity');
    
    // Hide STAFF heading
    hideBookingSection('STAFF');
    
    // Hide Manage Doctors section
    hideSectionById('subItems5');
    hidePageElements('Add_doctor');
    hidePageElements('List_doctor');
    
    // Hide Manage Lab section
    hideSectionById('subItems6');
    hidePageElements('Add_lab');
    hidePageElements('List_lab');
    
    // Hide Manage Inventory section and all sub-options
    hideSectionById('subItems7');
    hidePageElements('inventory');
    hidePageElements('Addproduct');
  }

  // ==========================================
  // 4. canManagePayments Permission
  // ==========================================
  if (!permissions.canManagePayments) {
    console.log('Hiding payment-related elements');
    
    // Hide track ledger page
    hidePageElements('fullLedger');
    
    // Hide expense section
    hideSectionById('subItems8');
    hidePageElements('addexpense');
    hidePageElements('expense');
    
    // Hide budget category page
    hidePageElements('budgetCategory');
    
    // Hide remaining days page
    hidePageElements('refferDashboard');
    
    // Hide Franchisee Credits section
    hideSectionById('subItems-d');
    hidePageElements('Assign_credit');
    hidePageElements('assignTarget');
    hidePageElements('Credit_history');
    
    // Hide Expense heading
    hideBookingSection('Expense');
  }

  // ==========================================
  // 5. canManageTest Permission
  // ==========================================
  if (!permissions.canManageTest) {
    console.log('Hiding test management elements');
    
    // Hide Test Database section and all sub-options
    const testDatabaseSection = document.getElementById('testdatabase');
    if (testDatabaseSection) {
      testDatabaseSection.style.display = 'none';
    }
    
    hideSectionById('subItem');
    hidePageElements('test');
    hidePageElements('addTestDocument');
    hidePageElements('testPackage');
    hidePageElements('testPanels');
    hidePageElements('category');
  }

  console.log('Staff permissions applied successfully');
}

// Function to check and hide print setting button on page load
// Call this function after loading any page
function checkAndHidePrintSettingButton(user) {
  if (user.role === 'staff' && user.permissions && !user.permissions.canManageTest) {
    const observer = new MutationObserver((mutations) => {
      const printSettingBtn = document.getElementById('printsettingbutton');
      if (printSettingBtn) {
        printSettingBtn.style.display = 'none';
        console.log('Print setting button hidden by observer');
      }
    });

    // Observe the content box for changes
    const contentBox = document.getElementById('content-box');
    if (contentBox) {
      observer.observe(contentBox, {
        childList: true,
        subtree: true
      });
    }
  }
}

// Verify token and extract user role with admin layer
async function verifyAccessToken() {
  try {
    const response = await fetch(`${BASE_URL}/api/verify-token`, {
      method: "GET",
      credentials: "include",
    });
    syncSubscriptionServerClock(response.headers.get("date"));

    if (!response.ok) {
      console.error("Authentication failed");
      localStorage.clear();
      sessionStorage.clear();
      return false;
    }

    const data = await response.json();
    if (data.user.role === "staff") {
      userId = data.user.parentUser;
      username = data.user.username;
      role = data.user.createdBy.role;
      userRole = data.user.role;
      user = data.user;
      document.getElementById('logo').src = user.tenantId.logo || '/images/logoLabFlow.svg';
      console.log("Staff user role:");
      usericon(user);

    }

    else {
      console.log("User role:");
      userId = data.user._id;
      username = data.user.username;
      role = data.user.role;
      userRole = data.user.role;
      user = data.user;
      document.getElementById('logo').src = user.tenantId.logo || '/images/logoLabFlow.svg';
      usericon(user);

    }
    // console.log("userdetails:", user);

    // Check if the user is an admin and extract the layer if available
    // If adminLayer is not provided in the API response, we can check localStorage
    // Or you can modify your backend to include this information
    if (role === "admin") {
      // Try to get adminLayer from localStorage or API response
      const adminLayer = data.user.tenantId.modelType;
      console.log("Admin layer:", adminLayer);
      role = `admin${adminLayer}`;
    }

    syncAdminGlobals();

    // console.log("User role with layer:", role);

    // Initialize menu based on the role
    initializeMenu(role);
    console.log("Menu initialized for role:", data);
    
    // Apply staff permissions if user is staff
    if (userRole === 'staff') {
      applyStaffPermissions(user);
      // Start observer for print setting button
      checkAndHidePrintSettingButton(user);
    }
    
    // Portal lock should follow tenant subscription status, same as other franchise portals.
    try {
      renderSubscriptionBanner(getPortalSubscriptionState(data.user));
      if (isPortalSubscriptionLocked(data.user)) {
        showSubscriptionModal();
      } else {
        hideSubscriptionModal();
      }
    } catch (e) {
      console.warn('Subscription check failed', e);
    }

    return data.isAuthorized;
  } catch (error) {
    console.error("Error verifying token:", error);
    return false;
  }
}

async function usericon(user) {
  const userAvatar = document.getElementById("userAvatar");
  const userPopup = document.getElementById("userPopup");

  if (user.showtestdatabase === false) {
    document.getElementById('testdatabase').style.display = "none";
  }

  if (user.tenantId.modelType === "1layer") {
    const divs = document.querySelectorAll('.forhide');
    divs.forEach(elem => {
      elem.style.display = "none";
    })
  }

  // Toggle popup on avatar click
  userAvatar.addEventListener("click", () => {
    userPopup.style.display = userPopup.style.display === "block" ? "none" : "block";
  });

  // Close popup if click happens outside
  document.addEventListener("click", (e) => {
    if (!userAvatar.contains(e.target) && !userPopup.contains(e.target)) {
      userPopup.style.display = "none";
    }
  });

  // Example logout action
  document.getElementById("logoutBtn").addEventListener("click", () => {
    alert("Logged out!");
    // window.location.href = "/login";
  });

  // Example: Set user data dynamically
  // const user = {
  //   name: "John Doe",
  //   email: "john@example.com",
  //   avatarSmall: "https://i.pravatar.cc/40?img=5",
  //   avatarLarge: "https://i.pravatar.cc/80?img=5"
  // };

  document.getElementById("userName").textContent = user.fullName;
  document.getElementById("userEmail").textContent = user.email;
  document.getElementById("userAvatarImg").src = user.profileimage || '/images/default-avatar.svg';
  document.getElementById("popupAvatar").src = user.profileimage || '/images/default-avatar.svg';
}

// Function to initialize menu based on user role and tenant layer
function initializeMenu(userRole) {
  console.log("Initializing menu for role:", userRole);

  // Parse the role to determine if it's admin with layer
  let role = userRole; // Default to admin1 if undefined

  // Check if role is in the menuConfig, otherwise default to admin1
  if (!menuConfig[role]) {
    role = "admin1layer";
  }

  // Extract the layer number from the role (if it's an admin role)
  let layerNumber = 1;
  if (role.startsWith("admin") && role.length > 5) {
    layerNumber = parseInt(role.substring(5)) || 1;
  }

  // Get the hidden items for this role
  const hiddenItems = menuConfig[role]?.hidden || [];
  console.log("Items to hide:", hiddenItems);

  // Hide menu items based on role
  hiddenItems.forEach((itemId) => {
    const menuItems = document.querySelectorAll(`[data-page="${itemId}"]`);
    console.log(`Looking for items with data-page="${itemId}"`, menuItems.length);

    menuItems.forEach((item) => {
      // Find the parent li element
      const parentLi = item.closest("li");
      if (parentLi) {
        parentLi.style.display = "none";
        console.log(`Hidden: ${itemId}`);
      }
    });
  });

  // Only hide franchisee sections for admin1
  if (role === "admin1layer") {
    // Franchisee sections to hide
    const franchiseeSections = [
      "subItems-b", "subItems-c", "subItems-d"
    ];

    // Hide the sections and their headers
    franchiseeSections.forEach(sectionId => {
      const section = document.getElementById(sectionId);
      if (section) {
        section.style.display = "none";
        // Also hide the parent menu item that toggles this section
        const parentItem = section.previousElementSibling;
        if (parentItem && parentItem.tagName === "LI") {
          parentItem.style.display = "none";
        }
      }
    });

    // Also hide the FRANCHISEE heading
    const franchiseeHeadings = document.querySelectorAll('.booking-inner span.book_po');
    franchiseeHeadings.forEach(heading => {
      if (heading.textContent.includes("FRANCHISEE")) {
        const bookingSection = heading.closest('.booking');
        if (bookingSection) {
          bookingSection.style.display = "none";
        }
      }
    });
  } else {
    // For admin2, admin3, admin4, ensure franchisee sections are visible
    const franchiseeSections = [
      "subItems-b", "subItems-c", "subItems-d"
    ];

    franchiseeSections.forEach(sectionId => {
      const section = document.getElementById(sectionId);
      if (section) {
        section.style.display = "none"; // Initially hide, will be toggled when needed
        // Make sure the parent menu item is visible
        const parentItem = section.previousElementSibling;
        if (parentItem && parentItem.tagName === "LI") {
          parentItem.style.display = "block";
          parentItem.style.display = "flex"
        }
      }
    });

    // Make sure the FRANCHISEE heading is visible
    const franchiseeHeadings = document.querySelectorAll('.booking-inner span.book_po');
    franchiseeHeadings.forEach(heading => {
      if (heading.textContent.includes("MY FRANCHISEE")) {
        const bookingSection = heading.closest('.booking');
        if (bookingSection) {
          bookingSection.style.display = "block";
          bookingSection.style.display = "flex";
        }
      }
    });
  }

  // Display username and role with layer information
  const nameElement = document.querySelector(".name_text");
  const roleElement = document.querySelector(".nt1");

  if (nameElement) {
    nameElement.textContent = username || "User";
  }

  if (roleElement) {
    // For admin roles, include the layer number in the display
    if (userRole.startsWith("staff")) {
      roleElement.textContent = `(STAFF - LAYER ${layerNumber})`;
    }
    // For franchisee roles, include the layer number in the display
    else if (userRole.startsWith("admin")) {
      roleElement.textContent = `(ADMIN - LAYER ${layerNumber})`;
    } else {
      // For other roles, just display the role in uppercase
      roleElement.textContent = `(${userRole.toUpperCase()})`;
    }
  }
}

// --- Subscription modal helpers ---
let __subscriptionHandlers = { keydown: null, click: null };
function showSubscriptionModal() {
  const modal = document.getElementById('subscriptionModal');
  if (!modal) return;

  if (__subscriptionHandlers.keydown) {
    window.removeEventListener('keydown', __subscriptionHandlers.keydown, true);
    __subscriptionHandlers.keydown = null;
  }
  if (__subscriptionHandlers.click) {
    window.removeEventListener('click', __subscriptionHandlers.click, true);
    __subscriptionHandlers.click = null;
  }

  // Show modal and prevent body scroll
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  hideSubscriptionBanner();

  // Prevent closing via outside click or ESC
  __subscriptionHandlers.keydown = function (e) {
    if (modal.style.display !== 'flex' && modal.style.display !== 'block') {
      return;
    }
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Block clicks that are outside modal-content
  __subscriptionHandlers.click = function (e) {
    if (modal.style.display !== 'flex' && modal.style.display !== 'block') {
      return;
    }
    const content = modal.querySelector('.modal-content');
    if (content && !content.contains(e.target)) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  window.addEventListener('keydown', __subscriptionHandlers.keydown, true);
  window.addEventListener('click', __subscriptionHandlers.click, true);

  // Start polling subscription status every 10 seconds
  if (window._subscriptionPollInterval) clearInterval(window._subscriptionPollInterval);
  window._subscriptionPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/verify-token`, { method: 'GET', credentials: 'include', __topLoaderSilent: true });
      if (!res.ok) return; // still not authorized or server error
      const data = await res.json();
      if (!isPortalSubscriptionLocked(data.user)) {
        hideSubscriptionModal();
        // update local user object and UI
        user = data.user;
        document.getElementById('logo').src = user?.tenantId?.logo || '/images/logoLabFlow.svg';
        syncAdminGlobals();
        clearInterval(window._subscriptionPollInterval);
        window._subscriptionPollInterval = null;
      }
    } catch (err) {
      console.warn('Subscription poll error', err);
    }
  }, 10000);
}

function hideSubscriptionModal() {
  const modal = document.getElementById('subscriptionModal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
  if (__subscriptionHandlers.keydown) {
    window.removeEventListener('keydown', __subscriptionHandlers.keydown, true);
    __subscriptionHandlers.keydown = null;
  }
  if (__subscriptionHandlers.click) {
    window.removeEventListener('click', __subscriptionHandlers.click, true);
    __subscriptionHandlers.click = null;
  }
  if (window._subscriptionPollInterval) {
    clearInterval(window._subscriptionPollInterval);
    window._subscriptionPollInterval = null;
  }

  subscriptionBannerDismissed = false;
  renderSubscriptionBanner(getPortalSubscriptionState(user));
}


// Function to check authorization
async function checkAuthorization() {
  const isAuthorized = await verifyAccessToken();

  if (!isAuthorized) {
    window.location.href = `${BASE_URL}/index.html`;
    return false;
  }
  return true;
}

async function fetchNotifications() {
  try {
    const response = await fetch(`${BASE_URL}/api/v1/user/getnewnotificationforadmin`, { __topLoaderSilent: true });
    const data = await response.json();

    console.log("notification data:", data);

    if (!response.ok || data.status === "empty") {
      console.log(data.message);
      return;
    }

    populatemessages(data);
  } catch (error) {
    console.error("Error fetching notifications:", error);
  }

  function populatemessages(data) {
    const alertdiv = document.querySelector('.alert-div');
    const messagescountspan = alertdiv.querySelector("#messageshint");
    const messagescontainer = alertdiv.querySelector("#notificationContainer");

    messagescountspan.textContent = data.length;
    messagescontainer.innerHTML = ""; // ✅ Clear old notifications before adding new ones

    data.forEach((elem) => {
      const div = document.createElement('div');
      div.className = 'notification'; // ✅ FIXED
      div.setAttribute("role", "alert");
      div.setAttribute("data-objId", elem._id);

      div.innerHTML = `
                <span class="deletemsg" style="cursor:pointer;">✖</span>
                <strong>Booking ID:</strong> <span>${elem.relatedbooking?.bookingId || "N/A"}</span><br>
                <strong>Last Message:</strong> <span>${elem.lastMessage?.message || "No message"}</span><br>
                <strong>Patient Name:</strong> <span>${elem.relatedbooking?.patientName || "N/A"}</span><br>
                <strong>Franchisee:</strong> <span>${elem.relatedbooking?.createdBy?.username || "N/A"}</span>
            `;

      const deletebtn = div.querySelector('.deletemsg');

      deletebtn.addEventListener('click', async function () {
        const objId = div.getAttribute("data-objId");
        try {
          const response = await fetch(`${BASE_URL}/api/v1/user/changewatchedstatus/${objId}`);
          if (response.ok) {
            console.log("Conversation updated successfully");
            div.remove();
            if (messagescontainer.children.length === 0) {
              messagescountspan.textContent = "";
              messagescontainer.classList.remove('show');
            } else {
              messagescountspan.textContent = messagescontainer.children.length;
            }
          }
        } catch (error) {
          console.error("Error updating conversation:", error.message);
        }
      });

      messagescontainer.appendChild(div);
    });
  }
}

const DYNAMIC_PAGE_SCRIPT_SELECTOR = 'script[data-dynamic-page-script="true"]';

function pageUsesEditor(container) {
  return Boolean(container?.querySelector('#editor'));
}

// Load page function
async function loadPage(page, Name, _id, BASE_URL, name) {
  console.log("user:", user);
  const transitionId = ++pageTransitionSequence;
  const transitionSession = {
    id: transitionId,
    pendingFetches: 0,
    lastActivityAt: performance.now()
  };
  activePageTransitionSession = transitionSession;
  const routeToken = window.AppTopLoader?.start(`route:${page}`);
  let stagingContainer = null;
  fetchNotifications();

  try {
    const liveContainer = document.querySelector(".content-box:not([data-staging-content-box='true'])") || document.querySelector(".content-box");
    if (!liveContainer) {
      throw new Error("Live content container not found.");
    }

    stagingContainer = createHiddenPageBuildContainer(liveContainer);
    if (!stagingContainer) {
      throw new Error("Unable to create hidden build container.");
    }

    const cacheBust = Date.now();
    const response = await fetch(`pages/pages/${page}.html?t=${cacheBust}`, { __topLoaderSilent: true });
    if (!response.ok) {
      throw new Error(`Failed to load page: ${page}`);
    }

    const html = await response.text();
    clearOldPage();
    stagingContainer.innerHTML = html;

    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set("page", page);
    if (Name) urlParams.set("Name", Name);
    if (_id) urlParams.set("_id", _id);
    if (name) urlParams.set("name", name);
    window.history.pushState({ page }, "", `?${urlParams.toString()}`);

    if (pageUsesEditor(stagingContainer)) {
      await loadScript(`./editor.js`);
    }

    await loadScript(`pages/pages/${page}.js?t=${cacheBust}`);

    if (user && user.role === 'staff') {
      checkAndHidePrintSettingButton(user);
    }

    await waitForPageStability(stagingContainer, transitionSession);

    if (activePageTransitionSession?.id !== transitionId) {
      return;
    }

    swapBuiltPageIntoLiveContainer(stagingContainer, liveContainer);
    ensureSubscriptionBannerShell();
    renderSubscriptionBanner(getPortalSubscriptionState(user));
    positionSubscriptionBanner();

    // Highlight active menu item
    highlightActiveMenuItem(page);
  } catch (error) {
    console.error(error);
  } finally {
    destroyHiddenPageBuildContainer(stagingContainer);
    if (activePageTransitionSession?.id === transitionId) {
      activePageTransitionSession = null;
    }
    if (routeToken) {
      window.AppTopLoader.done(routeToken);
    }
  }
}

window.loadPage = loadPage;

// Helper functions
function clearOldPage() {
  const container = document.querySelector(".content-box[data-staging-content-box='true']") || document.querySelector(".content-box");
  if (window.editor && typeof window.editor.destroy === "function") {
    window.editor.destroy().catch((error) => console.warn("Editor cleanup failed:", error));
    window.editor = null;
  }
  document.querySelectorAll(DYNAMIC_PAGE_SCRIPT_SELECTOR).forEach((script) => {
    if (script.dataset.preserve !== "true") {
      script.remove();
    }
  });
  if (container) {
    container.innerHTML = "";
  }
}

function highlightActiveMenuItem(page) {
  // Remove active class from all menu items
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active");
  });

  // Add active class to current menu item
  const activeItems = document.querySelectorAll(
    `.nav-item[data-page="${page}"]`
  );
  activeItems.forEach((item) => {
    item.classList.add("active");
  });
}

function loadScript(url) {
  if (url === "./editor.js") {
    if (typeof window.editorInit === "function") {
      return Promise.resolve(null);
    }

    if (window.__editorPageScriptPromise) {
      return window.__editorPageScriptPromise;
    }
  }

  const loadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(
      `${DYNAMIC_PAGE_SCRIPT_SELECTOR}[data-script-url="${url}"]`
    );
    if (existingScript) {
      if (url === "./editor.js") {
        resolve(existingScript);
        return;
      }
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = false;
    script.dataset.dynamicPageScript = "true";
    script.dataset.scriptUrl = url;
    if (url === "./editor.js") {
      script.dataset.preserve = "true";
    }
    script.onload = () => {
      if (url === "./editor.js") {
        window.__editorPageScriptPromise = Promise.resolve(script);
      }
      resolve(script);
    };
    script.onerror = () => {
      if (url === "./editor.js") {
        window.__editorPageScriptPromise = null;
      }
      script.remove();
      reject(new Error(`Failed to load script: ${url}`));
    };
    document.body.appendChild(script);
  });

  if (url === "./editor.js") {
    window.__editorPageScriptPromise = loadPromise;
  }

  return loadPromise;
}

window.loadScript = loadScript;

// Function to attach event listeners to menu items
function attachMenuEventListeners() {
  const navItems = document.querySelectorAll(".nav-item");
  let debounceTimeout;

  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();

      // Debounce clicks
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        const page = item.getAttribute("data-page");
        if (page) {
          loadPage(page);
        }
      }, 300); // 300ms debounce delay
    });
  });
}

// Debug function to help troubleshoot admin layers
function debugAdminLayer() {
  // Only run in development or when specifically enabled
  const isDebugMode = localStorage.getItem("debugMode") === "true" ||
    window.location.search.includes("debug=true");

  if (!isDebugMode) return;

  console.log("🔍 DEBUG MODE ACTIVE");

  // Create a debug panel
  const debugPanel = document.createElement("div");
  debugPanel.style.position = "fixed";
  debugPanel.style.bottom = "10px";
  debugPanel.style.right = "10px";
  debugPanel.style.backgroundColor = "rgba(0,0,0,0.8)";
  debugPanel.style.color = "white";
  debugPanel.style.padding = "10px";
  debugPanel.style.borderRadius = "5px";
  debugPanel.style.zIndex = "9999";
  debugPanel.style.fontSize = "12px";
  debugPanel.style.maxWidth = "300px";

  // Add layer selector
  const layerSelector = document.createElement("select");
  layerSelector.innerHTML = `
    <option value="1">Layer 1</option>
    <option value="2">Layer 2</option>
    <option value="3">Layer 3</option>
    <option value="4">Layer 4</option>
  `;

  // Set the current layer
  const currentLayer = localStorage.getItem("superFranchisee") || "2layer";
  layerSelector.value = currentLayer;

  // Add event listener to change layer
  layerSelector.addEventListener("change", (e) => {
    const newLayer = e.target.value;
    localStorage.setItem("superFranchisee", newLayer);

    // Update the UI immediately
    const roleWithLayer = `superFranchisee${newLayer}`;
    initializeMenu(roleWithLayer);

    // Update the debug info
    document.getElementById("current-role").textContent = roleWithLayer;
  });

  // Add debug info and controls
  debugPanel.innerHTML = `
    <div style="margin-bottom:10px;"><strong>Admin Layer Debug</strong></div>
    <div style="margin-bottom:5px;">Current Role: <span id="current-role">${userRole || "unknown"}</span></div>
    <div style="margin-bottom:5px;">Override Layer: </div>
  `;

  // Append the layer selector
  debugPanel.appendChild(layerSelector);

  // Add a button to reload the page
  const reloadButton = document.createElement("button");
  reloadButton.textContent = "Apply & Reload";
  reloadButton.style.marginTop = "10px";
  reloadButton.style.padding = "5px";
  reloadButton.style.width = "100%";
  reloadButton.addEventListener("click", () => {
    window.location.reload();
  });

  debugPanel.appendChild(reloadButton);

  // Add to page
  document.body.appendChild(debugPanel);
}

// Initialize when DOM is fully loaded
document.addEventListener("DOMContentLoaded", async function () {
  installPageFetchTracking();
  ensureSubscriptionBannerShell();
  window.addEventListener("resize", positionSubscriptionBanner);

  // Verify token and initialize user data
  await verifyAccessToken();

  if (subscriptionStatusInterval) {
    clearInterval(subscriptionStatusInterval);
  }
  subscriptionStatusInterval = setInterval(refreshSubscriptionBanner, 60000);
  refreshSubscriptionBanner();

  // Attach UPI screenshot upload handler (if modal present)
  const upiForm = document.getElementById('upiForm');
  if (upiForm) {
    upiForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const fileInput = document.getElementById('upiScreenshot');
      const statusDiv = document.getElementById('upiStatus');
      if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        if (statusDiv) { statusDiv.textContent = 'Please select a screenshot to upload.'; statusDiv.style.color = 'red'; }
        return;
      }
      const formData = new FormData();
      formData.append('screenshot', fileInput.files[0]);
      formData.append('userId', userId || '');
      try {
        if (statusDiv) { statusDiv.textContent = 'Uploading...'; statusDiv.style.color = 'blue'; }
        const res = await fetch(`${BASE_URL}/api/v1/user/upload-upi-screenshot`, {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        if (res.ok) {
          if (statusDiv) { statusDiv.textContent = 'Screenshot uploaded! SuperAdmin will verify and activate your account.'; statusDiv.style.color = 'green'; }
        } else {
          const text = await res.text();
          if (statusDiv) { statusDiv.textContent = 'Upload failed. Try again.'; statusDiv.style.color = 'red'; }
          console.warn('Upload failed', res.status, text);
        }
      } catch (err) {
        if (statusDiv) { statusDiv.textContent = 'Error uploading screenshot.'; statusDiv.style.color = 'red'; }
        console.error('Error uploading screenshot', err);
      }
    });
  }

  // Add event listener to the logout button
  const logoutButton = document.getElementById("logoutButton");
  if (logoutButton) {
    logoutButton.addEventListener("click", logout);
  }

  // Set up event listeners for navbar items
  attachMenuEventListeners();

  // Load page from URL or default to dashboard
  const urlParams = new URLSearchParams(window.location.search);
  const currentPage = urlParams.get("page") || "dashboard";
  loadPage(currentPage);

  // Handle browser back/forward navigation
  window.addEventListener("popstate", (event) => {
    if (event.state) {
      loadPage(event.state.page);
    }
  });

  // Set up sidebar toggle if needed
  const toggleBtn = document.getElementById("toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleSidebar);
  }

  // Initialize debug tools if needed
  debugAdminLayer();
});

function loaderfunction() {
  window.AppTopLoader?.scanLegacyLoaders(document);
}

loaderfunction();
