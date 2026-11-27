/* ==========================================================================
   Catalog Studio Engine
   Shared API adapter, slot-preserving reorder math, drag/jump/nudge engines,
   modals (Confirm / Sample Type / Unit), and toast notifications.
   ========================================================================== */
(function (globalScope) {
  "use strict";

  const ROOT_MODES = {
    admin: {
      portalPrefix: "/admin/admin.html",
      endpoints: {
        testsList: "/api/v1/user/test-database-tenant",
        testOne: (id) => `/api/v1/user/test-found?Name=${encodeURIComponent(id)}`,
        testCreate: "/api/v1/user/make-test-tenant",
        testEdit: "/api/v1/user/test-edit-tenant",
        testReorder: "/api/v1/user/editTestOrder",
        testDelete: "/api/v1/user/delete-tests",
        categories: "/api/v1/user/category-list-tenant",
        units: "/api/v1/user/get-units-tenant",
        unitAdd: "/api/v1/user/add-unit-tenant",
        samples: "/api/v1/user/fetchsample-tenant",
        sampleAdd: "/api/v1/user/addsample-tenant",
        panelsList: "/api/v1/user/all-pannels-tenant",
        panelOne: (id) => `/api/v1/user/one-Pannel/${encodeURIComponent(id)}`,
        panelCreate: "/api/v1/user/add-panels-tenant",
        panelEdit: (id) => `/api/v1/user/edit-Pannel-tenant/${encodeURIComponent(id)}`,
        panelReorder: "/api/v1/user/updatePannelOrder",
        panelDelete: "/api/v1/user/delete-panels",
        packagesList: "/api/v1/user/all-packages-tenant",
        packageOne: (id) => `/api/v1/user/one-Package/${encodeURIComponent(id)}`,
        packageCreate: "/api/v1/user/add-package-tenant",
        packageEdit: (id) => `/api/v1/user/edit-Package-tenant/${encodeURIComponent(id)}`,
        packageReorder: "/api/v1/user/updatePackageOrder",
        packageDelete: "/api/v1/user/delete-packages"
      }
    },
    superAdmin: {
      portalPrefix: "/superAdmin/superAdmin.html",
      endpoints: {
        testsList: "/api/v1/user/test-database",
        testOne: (id) => `/api/v1/user/test-found?Name=${encodeURIComponent(id)}`,
        testCreate: "/api/v1/user/make-test",
        testEdit: "/api/v1/user/test-edit",
        testReorder: "/api/v1/user/editTestOrdersuper",
        testDelete: "/api/v1/user/delete-tests",
        categories: "/api/v1/user/category-list",
        units: "/api/v1/user/get-units",
        unitAdd: "/api/v1/user/add-unit",
        samples: "/api/v1/user/fetchsample",
        sampleAdd: "/api/v1/user/addsample",
        panelsList: "/api/v1/user/all-pannels",
        panelOne: (id) => `/api/v1/user/one-Pannel/${encodeURIComponent(id)}`,
        panelCreate: "/api/v1/user/add-panels",
        panelEdit: (id) => `/api/v1/user/edit-Pannel/${encodeURIComponent(id)}`,
        panelReorder: "/api/v1/user/updatePannelOrdersuper",
        panelDelete: "/api/v1/user/delete-panels",
        packagesList: "/api/v1/user/all-packages",
        packageOne: (id) => `/api/v1/user/one-Package/${encodeURIComponent(id)}`,
        packageCreate: "/api/v1/user/add-package",
        packageEdit: (id) => `/api/v1/user/edit-Package/${encodeURIComponent(id)}`,
        packageReorder: "/api/v1/user/updatePackageOrdersuper",
        packageDelete: "/api/v1/user/delete-packages"
      }
    }
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function formatCurrency(value) {
    const num = toNumber(value, 0);
    try {
      return (
        "₹" +
        new Intl.NumberFormat("en-IN", {
          minimumFractionDigits: num % 1 === 0 ? 0 : 2,
          maximumFractionDigits: 2
        }).format(num)
      );
    } catch (_) {
      return `₹${num}`;
    }
  }

  function debounce(fn, delay = 180) {
    let timer = null;
    const wrapped = function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn.apply(this, args);
      }, delay);
    };
    wrapped.cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    return wrapped;
  }

  function getApiMap(portalMode) {
    return (ROOT_MODES[portalMode] || ROOT_MODES.admin).endpoints;
  }

  function normalizeListResponse(payload, keys = ["tests", "panels", "packages", "data", "categories", "units"]) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    for (const key of keys) {
      if (Array.isArray(payload[key])) return payload[key];
    }
    if (payload.data && typeof payload.data === "object") {
      for (const key of keys) {
        if (Array.isArray(payload.data[key])) return payload.data[key];
      }
    }
    return [];
  }

  function getErrorMessage(payload, fallback = "Unable to complete the request. Please try again.") {
    if (!payload) return fallback;
    if (typeof payload === "string") return payload;
    return payload.message || payload.error || payload?.data?.message || fallback;
  }

  async function apiJson(url, options = {}) {
    const { body, headers = {}, ...rest } = options;
    const fetchOptions = {
      credentials: "include",
      cache: "no-store",
      ...rest,
      headers: { ...headers }
    };

    if (body !== undefined && body !== null) {
      if (typeof body === "string" || body instanceof FormData) {
        fetchOptions.body = body;
      } else {
        fetchOptions.body = JSON.stringify(body);
        if (!fetchOptions.headers["Content-Type"]) {
          fetchOptions.headers["Content-Type"] = "application/json";
        }
      }
    }

    const response = await fetch(url, fetchOptions);
    const contentType = response.headers.get("content-type") || "";
    let payload = null;
    if (contentType.includes("application/json")) {
      payload = await response.json().catch(() => null);
    } else {
      const text = await response.text().catch(() => "");
      try {
        payload = text ? JSON.parse(text) : null;
      } catch (_) {
        payload = text ? { message: text } : null;
      }
    }

    if (!response.ok) {
      const err = new Error(getErrorMessage(payload, `Request failed (${response.status})`));
      err.status = response.status;
      err.payload = payload;
      throw err;
    }

    return payload;
  }

  function getQueryParam(key) {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get(key) || "";
  }

  function navigate(portalMode, page, params = {}) {
    const { Name = null, _id = null, name = null } = params;
    if (typeof window !== "undefined" && typeof window.loadPage === "function") {
      if (window.spaRouter && window.spaRouter.currentPageLoaded === page) {
        window.spaRouter.currentPageLoaded = null;
      }
      window.loadPage(page, Name, _id, null, name);
      return;
    }

    const modeCfg = ROOT_MODES[portalMode] || ROOT_MODES.admin;
    const nextParams = new URLSearchParams();
    nextParams.set("page", page);
    if (Name) nextParams.set("Name", Name);
    if (_id) nextParams.set("_id", _id);
    if (name) nextParams.set("name", name);
    window.location.href = `${modeCfg.portalPrefix}?${nextParams.toString()}`;
  }

  /* ---------- Toasts & Modals ---------- */

  function ensureToastHost() {
    let host = document.getElementById("cs-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "cs-toast-host";
      host.className = "cs-toast-host";
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(message, type = "info", duration = 3600) {
    if (typeof document === "undefined") return;
    const host = ensureToastHost();
    const el = document.createElement("div");
    el.className = `cs-toast cs-toast--${type}`;

    const iconClass =
      type === "success"
        ? "fa-circle-check"
        : type === "error"
        ? "fa-circle-exclamation"
        : type === "warning"
        ? "fa-triangle-exclamation"
        : "fa-circle-info";

    el.innerHTML = `
      <i class="fa-solid ${iconClass} cs-toast-icon" aria-hidden="true"></i>
      <div class="cs-toast-msg">${escapeHtml(message)}</div>
      <button type="button" class="cs-btn cs-btn-ghost cs-btn-xs" aria-label="Dismiss notification">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    const dismiss = () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    };

    el.querySelector("button")?.addEventListener("click", dismiss);
    host.appendChild(el);

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }
  }

  function removeExistingModal(id) {
    const existing = document.getElementById(id);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  function confirmDialog({
    title = "Confirm Action",
    message = "Are you sure you want to continue?",
    confirmText = "Confirm",
    cancelText = "Cancel",
    danger = false
  } = {}) {
    return new Promise((resolve) => {
      const modalId = "cs-confirm-modal";
      removeExistingModal(modalId);

      const backdrop = document.createElement("div");
      backdrop.id = modalId;
      backdrop.className = "cs-modal-backdrop";
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");

      backdrop.innerHTML = `
        <div class="cs-modal">
          <div class="cs-modal-head">
            <h3 class="cs-modal-title">${escapeHtml(title)}</h3>
            <button type="button" class="cs-icon-btn" data-cs-close aria-label="Close dialog">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div class="cs-modal-body">
            <p style="margin:0; font-size:13.5px; color:var(--cs-text-secondary); line-height:1.55;">
              ${escapeHtml(message)}
            </p>
          </div>
          <div class="cs-modal-foot">
            <button type="button" class="cs-btn cs-btn-secondary cs-btn-sm" data-cs-cancel>${escapeHtml(cancelText)}</button>
            <button type="button" class="cs-btn ${danger ? "cs-btn-danger" : "cs-btn-primary"} cs-btn-sm" data-cs-confirm>
              ${escapeHtml(confirmText)}
            </button>
          </div>
        </div>
      `;

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", onKeyDown);
        removeExistingModal(modalId);
        resolve(result);
      };

      const onKeyDown = (e) => {
        if (e.key === "Escape") finish(false);
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        }
      };

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) finish(false);
      });
      backdrop.querySelector("[data-cs-close]")?.addEventListener("click", () => finish(false));
      backdrop.querySelector("[data-cs-cancel]")?.addEventListener("click", () => finish(false));
      backdrop.querySelector("[data-cs-confirm]")?.addEventListener("click", () => finish(true));

      document.body.appendChild(backdrop);
      document.addEventListener("keydown", onKeyDown);
      backdrop.querySelector("[data-cs-confirm]")?.focus();
    });
  }

  async function openSampleTypeModal({ portalMode = "admin", onCreated } = {}) {
    const api = getApiMap(portalMode);
    const modalId = "cs-sample-modal";
    removeExistingModal(modalId);

    const backdrop = document.createElement("div");
    backdrop.id = modalId;
    backdrop.className = "cs-modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    backdrop.innerHTML = `
      <div class="cs-modal cs-modal-lg">
        <div class="cs-modal-head">
          <div>
            <h3 class="cs-modal-title">Add Sample Type</h3>
            <p class="cs-card-desc">Create a reusable specimen type for tests and collection instructions.</p>
          </div>
          <button type="button" class="cs-icon-btn" data-cs-close aria-label="Close modal">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <form data-cs-sample-form>
          <div class="cs-modal-body">
            <div class="cs-field">
              <label class="cs-label" for="cs-sample-name-input">Sample Type Name<span class="cs-required">*</span></label>
              <input
                type="text"
                id="cs-sample-name-input"
                class="cs-input"
                placeholder="e.g., EDTA Whole Blood, Serum, Fluoride Plasma, Urine"
                autocomplete="off"
                maxlength="80"
                required
              />
              <span class="cs-error-text" data-cs-sample-error style="display:none;"></span>
            </div>

            <div style="margin-top:16px;">
              <div class="cs-label-row" style="margin-bottom:6px;">
                <span class="cs-label">Existing Sample Types</span>
                <span class="cs-hint" data-cs-sample-count>Loading...</span>
              </div>
              <div class="cs-sample-chip-list" data-cs-sample-chips></div>
            </div>
          </div>
          <div class="cs-modal-foot">
            <button type="button" class="cs-btn cs-btn-secondary cs-btn-sm" data-cs-cancel>Cancel</button>
            <button type="submit" class="cs-btn cs-btn-primary cs-btn-sm" data-cs-submit>
              <i class="fa-solid fa-plus"></i> Save Sample Type
            </button>
          </div>
        </form>
      </div>
    `;

    const close = () => {
      document.removeEventListener("keydown", onKeyDown);
      removeExistingModal(modalId);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") close();
    };

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    backdrop.querySelector("[data-cs-close]")?.addEventListener("click", close);
    backdrop.querySelector("[data-cs-cancel]")?.addEventListener("click", close);

    document.body.appendChild(backdrop);
    document.addEventListener("keydown", onKeyDown);

    const inputEl = backdrop.querySelector("#cs-sample-name-input");
    const errEl = backdrop.querySelector("[data-cs-sample-error]");
    const chipsEl = backdrop.querySelector("[data-cs-sample-chips]");
    const countEl = backdrop.querySelector("[data-cs-sample-count]");
    const submitBtn = backdrop.querySelector("[data-cs-submit]");
    inputEl?.focus();

    let existingSamples = [];

    const renderChips = () => {
      if (!chipsEl || !countEl) return;
      countEl.textContent = `${existingSamples.length} available`;
      if (existingSamples.length === 0) {
        chipsEl.innerHTML = `<span class="cs-hint">No sample types saved yet.</span>`;
        return;
      }
      chipsEl.innerHTML = existingSamples
        .map((s) => `<span class="cs-badge cs-badge-neutral">${escapeHtml(s.Name || s.name || s)}</span>`)
        .join("");
    };

    try {
      const res = await apiJson(api.samples);
      existingSamples = normalizeListResponse(res, ["data", "samples"]);
      renderChips();
    } catch (_) {
      if (countEl) countEl.textContent = "Unable to load";
    }

    backdrop.querySelector("[data-cs-sample-form]")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rawName = String(inputEl?.value || "").trim();
      errEl.style.display = "none";
      inputEl?.classList.remove("is-invalid");

      if (!rawName) {
        errEl.textContent = "Please enter a sample type name.";
        errEl.style.display = "block";
        inputEl?.classList.add("is-invalid");
        return;
      }

      const duplicate = existingSamples.some(
        (s) => String(s.Name || s.name || s).trim().toLowerCase() === rawName.toLowerCase()
      );
      if (duplicate) {
        errEl.textContent = `"${rawName}" already exists in your sample catalog.`;
        errEl.style.display = "block";
        inputEl?.classList.add("is-invalid");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

      try {
        await apiJson(api.sampleAdd, {
          method: "POST",
          body: { Name: rawName }
        });
        const refreshed = await apiJson(api.samples).catch(() => null);
        const latestSamples = refreshed ? normalizeListResponse(refreshed, ["data", "samples"]) : [...existingSamples, { Name: rawName }];
        toast(`Sample type "${rawName}" added successfully.`, "success");
        if (typeof onCreated === "function") {
          onCreated(rawName, latestSamples);
        }
        close();
      } catch (error) {
        errEl.textContent = error.message || "Failed to save sample type.";
        errEl.style.display = "block";
        inputEl?.classList.add("is-invalid");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<i class="fa-solid fa-plus"></i> Save Sample Type`;
        }
      }
    });
  }

  async function openUnitModal({ portalMode = "admin", onCreated } = {}) {
    const api = getApiMap(portalMode);
    const modalId = "cs-unit-modal";
    removeExistingModal(modalId);

    const backdrop = document.createElement("div");
    backdrop.id = modalId;
    backdrop.className = "cs-modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    backdrop.innerHTML = `
      <div class="cs-modal">
        <div class="cs-modal-head">
          <div>
            <h3 class="cs-modal-title">Add Measurement Unit</h3>
            <p class="cs-card-desc">Add a unit for numeric test parameters (e.g., mg/dL, g/dL, U/L).</p>
          </div>
          <button type="button" class="cs-icon-btn" data-cs-close aria-label="Close modal">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <form data-cs-unit-form>
          <div class="cs-modal-body">
            <div class="cs-field">
              <label class="cs-label" for="cs-unit-name-input">Unit Label<span class="cs-required">*</span></label>
              <input
                type="text"
                id="cs-unit-name-input"
                class="cs-input"
                placeholder="e.g., mg/dL, IU/mL, cells/cumm, %"
                autocomplete="off"
                maxlength="40"
                required
              />
              <span class="cs-error-text" data-cs-unit-error style="display:none;"></span>
            </div>
            <div style="margin-top:14px;">
              <div class="cs-label-row" style="margin-bottom:6px;">
                <span class="cs-label">Existing Units</span>
                <span class="cs-hint" data-cs-unit-count>Loading...</span>
              </div>
              <div class="cs-sample-chip-list" data-cs-unit-chips style="max-height:130px; overflow-y:auto;"></div>
            </div>
          </div>
          <div class="cs-modal-foot">
            <button type="button" class="cs-btn cs-btn-secondary cs-btn-sm" data-cs-cancel>Cancel</button>
            <button type="submit" class="cs-btn cs-btn-primary cs-btn-sm" data-cs-submit>
              <i class="fa-solid fa-plus"></i> Save Unit
            </button>
          </div>
        </form>
      </div>
    `;

    const close = () => {
      document.removeEventListener("keydown", onKeyDown);
      removeExistingModal(modalId);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") close();
    };

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    backdrop.querySelector("[data-cs-close]")?.addEventListener("click", close);
    backdrop.querySelector("[data-cs-cancel]")?.addEventListener("click", close);

    document.body.appendChild(backdrop);
    document.addEventListener("keydown", onKeyDown);

    const inputEl = backdrop.querySelector("#cs-unit-name-input");
    const errEl = backdrop.querySelector("[data-cs-unit-error]");
    const chipsEl = backdrop.querySelector("[data-cs-unit-chips]");
    const countEl = backdrop.querySelector("[data-cs-unit-count]");
    const submitBtn = backdrop.querySelector("[data-cs-submit]");
    inputEl?.focus();

    let existingUnits = [];
    try {
      const res = await apiJson(api.units);
      existingUnits = normalizeListResponse(res, ["units", "data"]);
      if (countEl) countEl.textContent = `${existingUnits.length} available`;
      if (chipsEl) {
        chipsEl.innerHTML =
          existingUnits.length > 0
            ? existingUnits.map((u) => `<span class="cs-badge cs-badge-neutral">${escapeHtml(u.unit || u.name || u)}</span>`).join("")
            : `<span class="cs-hint">No units saved yet.</span>`;
      }
    } catch (_) {
      if (countEl) countEl.textContent = "Unable to load";
    }

    backdrop.querySelector("[data-cs-unit-form]")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rawUnit = String(inputEl?.value || "").trim();
      errEl.style.display = "none";
      inputEl?.classList.remove("is-invalid");

      if (!rawUnit) {
        errEl.textContent = "Please enter a unit label.";
        errEl.style.display = "block";
        inputEl?.classList.add("is-invalid");
        return;
      }

      const duplicate = existingUnits.some(
        (u) => String(u.unit || u.name || u).trim().toLowerCase() === rawUnit.toLowerCase()
      );
      if (duplicate) {
        errEl.textContent = `Unit "${rawUnit}" already exists.`;
        errEl.style.display = "block";
        inputEl?.classList.add("is-invalid");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

      try {
        await apiJson(api.unitAdd, {
          method: "POST",
          body: { unit: rawUnit }
        });
        const refreshed = await apiJson(api.units).catch(() => null);
        const latestUnits = refreshed ? normalizeListResponse(refreshed, ["units", "data"]) : [...existingUnits, { unit: rawUnit }];
        toast(`Unit "${rawUnit}" added successfully.`, "success");
        if (typeof onCreated === "function") {
          onCreated(rawUnit, latestUnits);
        }
        close();
      } catch (error) {
        errEl.textContent = error.message || "Failed to add unit.";
        errEl.style.display = "block";
        inputEl?.classList.add("is-invalid");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<i class="fa-solid fa-plus"></i> Save Unit`;
        }
      }
    });
  }

  /* ---------- Pure Reorder Logic ---------- */

  /**
   * Moves `movedId` to `targetVisibleIndex` within `visibleIds`, then maps the
   * updated visible sequence back into the exact positions originally held by
   * `visibleIds` in `fullIds` so filtered-out rows never lose their slots.
   */
  function computeSlotPreservingReorder(fullIds, visibleIds, movedId, targetVisibleIndex) {
    const cleanFull = fullIds.map(String);
    const cleanVisible = visibleIds.map(String);
    const targetId = String(movedId);

    const fromVisibleIdx = cleanVisible.indexOf(targetId);
    if (fromVisibleIdx === -1) {
      return { fullIds: cleanFull, visibleIds: cleanVisible, changed: false };
    }

    const boundedTarget = Math.max(0, Math.min(cleanVisible.length - 1, Number(targetVisibleIndex)));
    if (!Number.isFinite(boundedTarget) || boundedTarget === fromVisibleIdx) {
      return { fullIds: cleanFull, visibleIds: cleanVisible, changed: false };
    }

    const slotPositions = [];
    const visibleSet = new Set(cleanVisible);
    for (let i = 0; i < cleanFull.length; i++) {
      if (visibleSet.has(cleanFull[i])) {
        slotPositions.push(i);
      }
    }

    if (slotPositions.length !== cleanVisible.length) {
      return { fullIds: cleanFull, visibleIds: cleanVisible, changed: false };
    }

    const nextVisible = [...cleanVisible];
    const [removed] = nextVisible.splice(fromVisibleIdx, 1);
    nextVisible.splice(boundedTarget, 0, removed);

    const nextFull = [...cleanFull];
    for (let i = 0; i < slotPositions.length; i++) {
      nextFull[slotPositions[i]] = nextVisible[i];
    }

    return {
      fullIds: nextFull,
      visibleIds: nextVisible,
      changed: true
    };
  }

  function buildNormalizedSequence(fullIds, previousOrderById = new Map()) {
    const allUpdates = [];
    const diffUpdates = [];

    fullIds.forEach((rawId, idx) => {
      const id = String(rawId);
      const nextOrder = idx + 1;
      const entry = { id, order: nextOrder };
      allUpdates.push(entry);
      if (Number(previousOrderById.get(id)) !== nextOrder) {
        diffUpdates.push(entry);
      }
    });

    return { allUpdates, diffUpdates };
  }

  /* ---------- DOM Reorder Engines ---------- */

  function attachTableReorderEngine({
    scrollContainer,
    tbody,
    getFullIds,
    getVisibleIds,
    onMove,
    onPositionCommit
  }) {
    if (!tbody) return () => {};

    let draggingId = null;
    let pointerY = 0;
    let rafScrollId = null;

    const clearDropIndicators = () => {
      tbody.querySelectorAll("tr.cs-drop-above, tr.cs-drop-below, tr.cs-row-dragging").forEach((row) => {
        row.classList.remove("cs-drop-above", "cs-drop-below", "cs-row-dragging");
        row.draggable = false;
      });
    };

    const stopAutoScroll = () => {
      if (rafScrollId !== null) {
        cancelAnimationFrame(rafScrollId);
        rafScrollId = null;
      }
    };

    const tickAutoScroll = () => {
      if (!draggingId) {
        rafScrollId = null;
        return;
      }

      const edge = 56;
      const speed = 10;
      if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
        const rect = scrollContainer.getBoundingClientRect();
        if (pointerY > rect.top && pointerY < rect.top + edge) {
          scrollContainer.scrollTop -= speed;
        } else if (pointerY < rect.bottom && pointerY > rect.bottom - edge) {
          scrollContainer.scrollTop += speed;
        }
      } else {
        if (pointerY < edge) window.scrollBy(0, -speed);
        else if (pointerY > window.innerHeight - edge) window.scrollBy(0, speed);
      }

      rafScrollId = requestAnimationFrame(tickAutoScroll);
    };

    const onPointerDown = (e) => {
      const handle = e.target.closest(".cs-drag-handle");
      if (!handle || !tbody.contains(handle)) return;
      const row = handle.closest("tr[data-id]");
      if (row) row.draggable = true;
    };

    const onPointerUp = () => {
      if (!draggingId) {
        tbody.querySelectorAll("tr[data-id]").forEach((row) => {
          row.draggable = false;
        });
      }
    };

    const onDragStart = (e) => {
      const row = e.target.closest("tr[data-id]");
      if (!row || !row.draggable) {
        e.preventDefault();
        return;
      }
      draggingId = String(row.getAttribute("data-id") || "");
      if (!draggingId) return;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", draggingId);
      }
      requestAnimationFrame(() => row.classList.add("cs-row-dragging"));
      if (rafScrollId === null) {
        rafScrollId = requestAnimationFrame(tickAutoScroll);
      }
    };

    const onDragOver = (e) => {
      if (!draggingId) return;
      e.preventDefault();
      pointerY = e.clientY;
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

      const targetRow = e.target.closest("tr[data-id]");
      tbody.querySelectorAll("tr.cs-drop-above, tr.cs-drop-below").forEach((r) => {
        if (r !== targetRow) r.classList.remove("cs-drop-above", "cs-drop-below");
      });
      if (!targetRow) return;

      const targetId = String(targetRow.getAttribute("data-id") || "");
      if (!targetId || targetId === draggingId) {
        targetRow.classList.remove("cs-drop-above", "cs-drop-below");
        return;
      }

      const rect = targetRow.getBoundingClientRect();
      const insertAfter = e.clientY >= rect.top + rect.height / 2;
      targetRow.classList.toggle("cs-drop-below", insertAfter);
      targetRow.classList.toggle("cs-drop-above", !insertAfter);
    };

    const onDrop = (e) => {
      if (!draggingId) return;
      e.preventDefault();

      const targetRow = e.target.closest("tr[data-id]");
      const dropBelow = targetRow?.classList.contains("cs-drop-below");
      const targetId = targetRow ? String(targetRow.getAttribute("data-id") || "") : "";
      const sourceId = draggingId;

      stopAutoScroll();
      clearDropIndicators();
      draggingId = null;

      if (!targetId || targetId === sourceId) return;

      const visibleIds = getVisibleIds();
      const fromIdx = visibleIds.indexOf(sourceId);
      let toIdx = visibleIds.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return;

      if (dropBelow && fromIdx > toIdx) toIdx += 1;
      else if (!dropBelow && fromIdx < toIdx) toIdx -= 1;

      if (typeof onMove === "function") {
        onMove(sourceId, toIdx);
      }
    };

    const onDragEnd = () => {
      stopAutoScroll();
      clearDropIndicators();
      draggingId = null;
    };

    const onClick = (e) => {
      const nudgeBtn = e.target.closest(".cs-nudge-btn[data-dir]");
      if (nudgeBtn && tbody.contains(nudgeBtn)) {
        const row = nudgeBtn.closest("tr[data-id]");
        const id = row ? String(row.getAttribute("data-id") || "") : "";
        const dir = nudgeBtn.getAttribute("data-dir");
        const visibleIds = getVisibleIds();
        const curIdx = visibleIds.indexOf(id);
        if (curIdx === -1) return;
        const nextIdx = dir === "up" ? curIdx - 1 : curIdx + 1;
        if (nextIdx >= 0 && nextIdx < visibleIds.length && typeof onMove === "function") {
          onMove(id, nextIdx);
        }
        return;
      }

      const pill = e.target.closest(".cs-order-pill[data-id]");
      if (pill && tbody.contains(pill)) {
        const id = String(pill.getAttribute("data-id") || "");
        const visibleIds = getVisibleIds();
        const fullIds = getFullIds();
        const maxPos = visibleIds.length === fullIds.length ? fullIds.length : visibleIds.length;
        const currentPos = Math.max(1, visibleIds.indexOf(id) + 1);

        const input = document.createElement("input");
        input.type = "number";
        input.min = "1";
        input.max = String(maxPos);
        input.value = String(currentPos);
        input.className = "cs-order-input";
        input.setAttribute("aria-label", `Jump position 1 to ${maxPos}`);

        let committed = false;
        const restore = () => {
          if (input.parentNode) input.replaceWith(pill);
        };
        const commit = () => {
          if (committed) return;
          committed = true;
          const val = parseInt(input.value, 10);
          restore();
          if (Number.isFinite(val) && val >= 1) {
            const targetIdx = Math.max(0, Math.min(maxPos - 1, val - 1));
            if (typeof onPositionCommit === "function") {
              onPositionCommit(id, targetIdx);
            } else if (typeof onMove === "function") {
              onMove(id, targetIdx);
            }
          }
        };

        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            commit();
          } else if (ev.key === "Escape") {
            committed = true;
            restore();
          }
        });
        input.addEventListener("blur", commit);

        pill.replaceWith(input);
        input.focus();
        input.select();
      }
    };

    const onKeyDown = (e) => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      const row = e.target.closest("tr[data-id]");
      if (!row || !tbody.contains(row)) return;
      e.preventDefault();
      const id = String(row.getAttribute("data-id") || "");
      const visibleIds = getVisibleIds();
      const idx = visibleIds.indexOf(id);
      if (idx === -1) return;
      const nextIdx = e.key === "ArrowUp" ? idx - 1 : idx + 1;
      if (nextIdx >= 0 && nextIdx < visibleIds.length && typeof onMove === "function") {
        onMove(id, nextIdx);
      }
    };

    tbody.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    tbody.addEventListener("dragstart", onDragStart);
    tbody.addEventListener("dragover", onDragOver);
    tbody.addEventListener("drop", onDrop);
    tbody.addEventListener("dragend", onDragEnd);
    tbody.addEventListener("click", onClick);
    tbody.addEventListener("keydown", onKeyDown);

    return () => {
      stopAutoScroll();
      tbody.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      tbody.removeEventListener("dragstart", onDragStart);
      tbody.removeEventListener("dragover", onDragOver);
      tbody.removeEventListener("drop", onDrop);
      tbody.removeEventListener("dragend", onDragEnd);
      tbody.removeEventListener("click", onClick);
      tbody.removeEventListener("keydown", onKeyDown);
    };
  }

  /**
   * Reorder engine for non-table card/chip lists (Test Parameters, Selected Panel Tests, Selected Package Items).
   */
  function attachListReorderEngine({
    container,
    itemSelector = "[data-reorder-id]",
    handleSelector = ".cs-drag-handle",
    onReorder
  }) {
    if (!container) return () => {};

    let draggingId = null;

    const getOrderedIds = () =>
      Array.from(container.querySelectorAll(itemSelector))
        .map((el) => String(el.getAttribute("data-reorder-id") || ""))
        .filter(Boolean);

    const clearMarkers = () => {
      container.querySelectorAll(itemSelector).forEach((el) => {
        el.classList.remove("cs-drop-above", "cs-drop-below", "cs-row-dragging");
        el.draggable = false;
      });
    };

    const onPointerDown = (e) => {
      const handle = e.target.closest(handleSelector);
      if (!handle || !container.contains(handle)) return;
      const item = handle.closest(itemSelector);
      if (item) item.draggable = true;
    };

    const onPointerUp = () => {
      if (!draggingId) {
        container.querySelectorAll(itemSelector).forEach((el) => {
          el.draggable = false;
        });
      }
    };

    const onDragStart = (e) => {
      const item = e.target.closest(itemSelector);
      if (!item || !item.draggable) {
        e.preventDefault();
        return;
      }
      draggingId = String(item.getAttribute("data-reorder-id") || "");
      if (!draggingId) return;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", draggingId);
      }
      requestAnimationFrame(() => item.classList.add("cs-row-dragging"));
    };

    const onDragOver = (e) => {
      if (!draggingId) return;
      e.preventDefault();
      const target = e.target.closest(itemSelector);
      container.querySelectorAll(itemSelector).forEach((el) => {
        if (el !== target) el.classList.remove("cs-drop-above", "cs-drop-below");
      });
      if (!target) return;
      const targetId = String(target.getAttribute("data-reorder-id") || "");
      if (!targetId || targetId === draggingId) {
        target.classList.remove("cs-drop-above", "cs-drop-below");
        return;
      }
      const rect = target.getBoundingClientRect();
      const after = e.clientY >= rect.top + rect.height / 2;
      target.classList.toggle("cs-drop-below", after);
      target.classList.toggle("cs-drop-above", !after);
    };

    const onDrop = (e) => {
      if (!draggingId) return;
      e.preventDefault();
      const target = e.target.closest(itemSelector);
      const after = target?.classList.contains("cs-drop-below");
      const targetId = target ? String(target.getAttribute("data-reorder-id") || "") : "";
      const sourceId = draggingId;

      clearMarkers();
      draggingId = null;

      if (!targetId || targetId === sourceId) return;
      const ids = getOrderedIds();
      const fromIdx = ids.indexOf(sourceId);
      let toIdx = ids.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return;

      if (after && fromIdx > toIdx) toIdx += 1;
      else if (!after && fromIdx < toIdx) toIdx -= 1;

      const next = [...ids];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      if (typeof onReorder === "function") onReorder(next, sourceId);
    };

    const onDragEnd = () => {
      clearMarkers();
      draggingId = null;
    };

    container.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    container.addEventListener("dragstart", onDragStart);
    container.addEventListener("dragover", onDragOver);
    container.addEventListener("drop", onDrop);
    container.addEventListener("dragend", onDragEnd);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("dragstart", onDragStart);
      container.removeEventListener("dragover", onDragOver);
      container.removeEventListener("drop", onDrop);
      container.removeEventListener("dragend", onDragEnd);
    };
  }

  globalScope.CatalogStudio = Object.freeze({
    escapeHtml,
    toNumber,
    formatCurrency,
    debounce,
    getApiMap,
    normalizeListResponse,
    getErrorMessage,
    apiJson,
    getQueryParam,
    navigate,
    toast,
    confirmDialog,
    openSampleTypeModal,
    openUnitModal,
    reorderMath: Object.freeze({
      computeSlotPreservingReorder,
      buildNormalizedSequence
    }),
    attachTableReorderEngine,
    attachListReorderEngine
  });
})(typeof window !== "undefined" ? window : globalThis);
