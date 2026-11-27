/* ==========================================================================
   Catalog Studio Page Controllers
   Unified, 100% English controllers for Admin (-tenant) & SuperAdmin portals:
   - Test Database / Add Test / Edit Test / Add Document
   - Panel Database / Add Panel / Edit Panel
   - Package Database / Add Package / Edit Package
   ========================================================================== */
(function (globalScope) {
  "use strict";

  const CS = () => globalScope.CatalogStudio;

  function idOf(item) {
    return String(item?._id || item?.id || "");
  }

  function uniqueStrings(arr) {
    const out = [];
    const seen = new Set();
    for (const raw of arr || []) {
      const val = String(raw || "").trim();
      if (val && !seen.has(val.toLowerCase())) {
        seen.add(val.toLowerCase());
        out.push(val);
      }
    }
    return out;
  }

  function safeArray(val) {
    return Array.isArray(val) ? val : [];
  }

  function getCategoryName(cat) {
    if (!cat) return "";
    if (typeof cat === "string") return cat.trim();
    return String(cat.name || cat.Name || cat.categoryName || cat.category || "").trim();
  }

  function getSampleName(s) {
    if (!s) return "";
    if (typeof s === "string") return s.trim();
    return String(s.Name || s.name || "").trim();
  }

  function getUnitName(u) {
    if (!u) return "";
    if (typeof u === "string") return u.trim();
    return String(u.unit || u.Unit || u.name || "").trim();
  }

  function isBlank(v) {
    return v === undefined || v === null || String(v).trim() === "";
  }

  function setFieldError(el, msgEl, message) {
    if (el) el.classList.toggle("is-invalid", Boolean(message));
    if (msgEl) {
      msgEl.textContent = message || "";
      msgEl.style.display = message ? "block" : "none";
    }
  }

  async function initRichEditor(initialHtml = "") {
    const editorEl = document.getElementById("editor");
    if (!editorEl) return null;

    if (globalScope.editor && globalScope.editor.sourceElement !== editorEl) {
      try {
        await globalScope.editor.destroy();
      } catch (_) {}
      globalScope.editor = null;
    }

    if (!globalScope.editor && typeof globalScope.editorInit === "function") {
      try {
        await globalScope.editorInit();
      } catch (err) {
        console.warn("[CatalogStudioPages] Editor initialization warning:", err);
      }
    }

    if (typeof globalScope.setEditorData === "function" && globalScope.editor) {
      globalScope.setEditorData(initialHtml || "");
    }
    return globalScope.editor || null;
  }

  function readRichEditorHtml() {
    if (typeof globalScope.getEditorData === "function" && globalScope.editor) {
      return String(globalScope.getEditorData() || "");
    }
    return "";
  }

  /* ========================================================================
     1. SHARED DATABASE TABLE CONTROLLER (Tests, Panels, Packages)
     ======================================================================== */

  function createDatabaseController({
    portalMode = "admin",
    entityLabel = "item",
    entityPlural = "items",
    listUrl,
    listKeys = ["data"],
    reorderUrl,
    deleteUrl,
    deletePayloadKey = "ids",
    colCount = 8,
    searchPlaceholderMatch,
    buildMetrics,
    getPrimaryFilterOptions,
    matchesFilters,
    renderRowCells,
    onEdit,
    getAddPageName,
    getExtraCleanup
  }) {
    const {
      escapeHtml,
      apiJson,
      normalizeListResponse,
      toast,
      confirmDialog,
      debounce,
      navigate,
      reorderMath,
      attachTableReorderEngine
    } = CS();

    const root = document.getElementById("cs-page-root");
    if (!root) return Promise.resolve(() => {});

    const tbody = root.querySelector("[data-cs-tbody]");
    const scrollBox = root.querySelector("[data-cs-scroll]");
    const searchInput = root.querySelector("[data-cs-search]");
    const searchClear = root.querySelector("[data-cs-search-clear]");
    const primaryFilterEl = root.querySelector("[data-cs-filter-primary]");
    const secondaryFilterEl = root.querySelector("[data-cs-filter-secondary]");
    const checkAllEl = root.querySelector("[data-cs-check-all]");
    const bulkBarEl = root.querySelector("[data-cs-bulk-bar]");
    const bulkCountEl = root.querySelector("[data-cs-bulk-count]");
    const bulkClearBtn = root.querySelector("[data-cs-bulk-clear]");
    const bulkDeleteBtn = root.querySelector("[data-cs-bulk-delete]");
    const filterBannerEl = root.querySelector("[data-cs-filter-banner]");
    const undoBtn = root.querySelector("[data-cs-undo-btn]");
    const normalizeBtn = root.querySelector("[data-cs-normalize-btn]");
    const syncPillEl = root.querySelector("[data-cs-sync-pill]");
    const footerSummaryEl = root.querySelector("[data-cs-count-summary]");

    let allItems = [];
    let selectedIds = new Set();
    let historyStack = [];
    let saveQueue = Promise.resolve();
    let flashId = "";
    let isDisposed = false;

    const getVisibleItems = () => {
      const q = String(searchInput?.value || "").trim().toLowerCase();
      const f1 = primaryFilterEl ? primaryFilterEl.value : "all";
      const f2 = secondaryFilterEl ? secondaryFilterEl.value : "all";
      return allItems.filter((item) => {
        if (q && searchPlaceholderMatch && !searchPlaceholderMatch(item, q)) return false;
        if (matchesFilters && !matchesFilters(item, f1, f2)) return false;
        return true;
      });
    };

    const isFiltered = () => {
      const q = String(searchInput?.value || "").trim();
      const f1 = primaryFilterEl ? primaryFilterEl.value : "all";
      const f2 = secondaryFilterEl ? secondaryFilterEl.value : "all";
      return Boolean(q) || f1 !== "all" || f2 !== "all";
    };

    const setSyncState = (state, text) => {
      if (!syncPillEl) return;
      syncPillEl.classList.remove("is-saving", "is-error");
      if (state === "saving") syncPillEl.classList.add("is-saving");
      if (state === "error") syncPillEl.classList.add("is-error");
      const textEl = syncPillEl.querySelector("[data-cs-sync-text]") || syncPillEl;
      textEl.textContent = text;
    };

    const refreshUndoUi = () => {
      if (undoBtn) {
        undoBtn.disabled = historyStack.length === 0;
        undoBtn.title = historyStack.length > 0 ? "Undo last order change (Ctrl+Z)" : "Nothing to undo";
      }
    };

    const updateBulkUi = (visibleItems) => {
      const count = selectedIds.size;
      if (bulkBarEl) bulkBarEl.classList.toggle("is-visible", count > 0);
      if (bulkCountEl) bulkCountEl.textContent = `${count} ${count === 1 ? entityLabel : entityPlural} selected`;
      if (checkAllEl) {
        const visibleIds = visibleItems.map(idOf).filter(Boolean);
        const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
        const someChecked = !allChecked && visibleIds.some((id) => selectedIds.has(id));
        checkAllEl.checked = allChecked;
        checkAllEl.indeterminate = someChecked;
      }
    };

    const updateMetricsUi = () => {
      if (typeof buildMetrics === "function") {
        buildMetrics(root, allItems);
      }
      if (typeof getPrimaryFilterOptions === "function" && primaryFilterEl) {
        const currentVal = primaryFilterEl.value || "all";
        const options = getPrimaryFilterOptions(allItems);
        const existingValues = new Set(Array.from(primaryFilterEl.options).map((o) => o.value));
        const nextValues = new Set(["all", ...options]);
        if (
          existingValues.size !== nextValues.size ||
          options.some((o) => !existingValues.has(o))
        ) {
          primaryFilterEl.innerHTML =
            `<option value="all">All Categories</option>` +
            options.map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join("");
          primaryFilterEl.value = nextValues.has(currentVal) ? currentVal : "all";
        }
      }
    };

    const renderTable = () => {
      if (!tbody || isDisposed) return;

      const visible = getVisibleItems();
      const filtered = isFiltered();
      const posByFullId = new Map(allItems.map((it, idx) => [idOf(it), idx + 1]));

      if (searchClear) {
        searchClear.classList.toggle("is-visible", Boolean(searchInput?.value));
      }
      if (filterBannerEl) {
        filterBannerEl.classList.toggle("is-visible", filtered && visible.length > 0);
      }
      if (footerSummaryEl) {
        footerSummaryEl.textContent = filtered
          ? `Showing ${visible.length} of ${allItems.length} ${entityPlural} (Drag grip, nudge ↑↓, or click # to jump)`
          : `Showing all ${allItems.length} ${entityPlural} · Drag grip, nudge ↑↓, or click # to jump position`;
      }

      updateMetricsUi();
      updateBulkUi(visible);
      refreshUndoUi();

      if (visible.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="${colCount}">
              <div class="cs-empty">
                <div class="cs-empty-icon"><i class="fa-regular fa-folder-open"></i></div>
                <h3>${filtered ? `No matching ${entityPlural}` : `No ${entityPlural} found`}</h3>
                <p>${
                  filtered
                    ? "Try clearing or broadening your search and filter criteria."
                    : `Get started by adding your first ${entityLabel} to the catalog.`
                }</p>
                ${
                  filtered
                    ? `<button type="button" class="cs-btn cs-btn-secondary cs-btn-sm" data-cs-reset-filters>
                         <i class="fa-solid fa-rotate-left"></i> Clear Filters
                       </button>`
                    : `<button type="button" class="cs-btn cs-btn-primary cs-btn-sm" data-cs-empty-add>
                         <i class="fa-solid fa-plus"></i> Add ${escapeHtml(entityLabel.replace(/^./, (c) => c.toUpperCase()))}
                       </button>`
                }
              </div>
            </td>
          </tr>
        `;
        return;
      }

      const rowsHtml = visible
        .map((item, visibleIdx) => {
          const id = idOf(item);
          const displayOrder = posByFullId.get(id) || visibleIdx + 1;
          const isChecked = selectedIds.has(id);
          const flashClass = flashId && flashId === id ? " cs-row-flash" : "";
          const selectedClass = isChecked ? " is-selected" : "";
          const upDisabled = visibleIdx === 0 ? "disabled" : "";
          const downDisabled = visibleIdx === visible.length - 1 ? "disabled" : "";

          return `
            <tr data-id="${escapeHtml(id)}" class="${selectedClass}${flashClass}" tabindex="0">
              <td class="cs-col-check">
                <input
                  type="checkbox"
                  class="cs-checkbox"
                  data-cs-row-check="${escapeHtml(id)}"
                  aria-label="Select row ${displayOrder}"
                  ${isChecked ? "checked" : ""}
                />
              </td>
              <td class="cs-col-order">
                <div class="cs-order-cell">
                  <button
                    type="button"
                    class="cs-drag-handle"
                    title="Drag row to reorder"
                    aria-label="Drag handle"
                  >
                    <i class="fa-solid fa-grip-vertical"></i>
                  </button>
                  <button
                    type="button"
                    class="cs-order-pill"
                    data-id="${escapeHtml(id)}"
                    title="Click to jump to a specific position"
                  >#${displayOrder}</button>
                  <div class="cs-nudge-group">
                    <button
                      type="button"
                      class="cs-nudge-btn"
                      data-dir="up"
                      title="Move up (Alt+Up)"
                      aria-label="Move up"
                      ${upDisabled}
                    >
                      <i class="fa-solid fa-chevron-up"></i>
                    </button>
                    <button
                      type="button"
                      class="cs-nudge-btn"
                      data-dir="down"
                      title="Move down (Alt+Down)"
                      aria-label="Move down"
                      ${downDisabled}
                    >
                      <i class="fa-solid fa-chevron-down"></i>
                    </button>
                  </div>
                </div>
              </td>
              ${renderRowCells(item, displayOrder)}
            </tr>
          `;
        })
        .join("");

      tbody.innerHTML = rowsHtml;
      flashId = "";
    };

    const persistOrderSnapshot = (nextItems, movedId, { normalizeAll = false, recordHistory = true } = {}) => {
      const prevSnapshot = [...allItems];
      const prevOrderById = new Map(prevSnapshot.map((it) => [idOf(it), Number(it.order) || 0]));
      const nextIds = nextItems.map(idOf);
      const { allUpdates, diffUpdates } = reorderMath.buildNormalizedSequence(nextIds, prevOrderById);
      const updatesToSend = normalizeAll ? allUpdates : diffUpdates;

      if (updatesToSend.length === 0) return;

      if (recordHistory) {
        historyStack.push(prevSnapshot);
        if (historyStack.length > 15) historyStack.shift();
      }

      const orderById = new Map(allUpdates.map((u) => [u.id, u.order]));
      allItems = nextItems.map((it) => ({
        ...it,
        order: orderById.get(idOf(it)) ?? it.order
      }));
      flashId = movedId || "";
      renderTable();

      saveQueue = saveQueue
        .then(async () => {
          if (isDisposed) return;
          setSyncState("saving", "Saving order...");
          await apiJson(reorderUrl, {
            method: "POST",
            body: { updatedOrder: updatesToSend }
          });
          if (!isDisposed) {
            setSyncState("synced", normalizeAll ? "Sequence normalized" : "Order saved");
          }
        })
        .catch((err) => {
          allItems = prevSnapshot;
          if (recordHistory && historyStack.length > 0) historyStack.pop();
          if (!isDisposed) {
            setSyncState("error", "Sync failed");
            renderTable();
            toast(err.message || `Unable to update ${entityLabel} order.`, "error");
          }
        });
    };

    const handleMove = (movedId, targetVisibleIndex) => {
      const fullIds = allItems.map(idOf);
      const visibleIds = getVisibleItems().map(idOf);
      const result = reorderMath.computeSlotPreservingReorder(fullIds, visibleIds, movedId, targetVisibleIndex);
      if (!result.changed) return;

      const byId = new Map(allItems.map((it) => [idOf(it), it]));
      const nextItems = result.fullIds.map((id) => byId.get(id)).filter(Boolean);
      persistOrderSnapshot(nextItems, movedId, { normalizeAll: false, recordHistory: true });
    };

    const handleUndo = () => {
      if (historyStack.length === 0) return;
      const previous = historyStack.pop();
      persistOrderSnapshot(previous, "", { normalizeAll: true, recordHistory: false });
      toast("Order change reverted.", "info", 2200);
    };

    const deleteItemsByIds = async (idsToDelete) => {
      const cleanIds = uniqueStrings(idsToDelete);
      if (cleanIds.length === 0) return;
      const confirmed = await confirmDialog({
        title: cleanIds.length === 1 ? `Delete ${entityLabel}` : `Delete ${cleanIds.length} ${entityPlural}`,
        message:
          cleanIds.length === 1
            ? `Are you sure you want to permanently remove this ${entityLabel}? This action cannot be undone.`
            : `Are you sure you want to permanently delete ${cleanIds.length} selected ${entityPlural}? This action cannot be undone.`,
        confirmText: cleanIds.length === 1 ? "Delete" : `Delete ${cleanIds.length}`,
        cancelText: "Cancel",
        danger: true
      });
      if (!confirmed) return;

      try {
        await apiJson(deleteUrl, {
          method: "POST",
          body: { [deletePayloadKey]: cleanIds }
        });
        const removedSet = new Set(cleanIds);
        allItems = allItems.filter((it) => !removedSet.has(idOf(it)));
        cleanIds.forEach((id) => selectedIds.delete(id));
        renderTable();
        toast(
          cleanIds.length === 1
            ? `${entityLabel.replace(/^./, (c) => c.toUpperCase())} deleted successfully.`
            : `${cleanIds.length} ${entityPlural} deleted successfully.`,
          "success"
        );
      } catch (err) {
        toast(err.message || `Failed to delete ${entityPlural}.`, "error");
      }
    };

    const debouncedRender = debounce(renderTable, 140);

    const onSearchInput = () => {
      if (searchClear) searchClear.classList.toggle("is-visible", Boolean(searchInput?.value));
      debouncedRender();
    };
    const onClearSearch = () => {
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
      }
      renderTable();
    };
    const onFilterChange = () => renderTable();
    const onCheckAllChange = () => {
      const visibleIds = getVisibleItems().map(idOf);
      if (checkAllEl?.checked) {
        visibleIds.forEach((id) => selectedIds.add(id));
      } else {
        visibleIds.forEach((id) => selectedIds.delete(id));
      }
      renderTable();
    };
    const onBulkClear = () => {
      selectedIds.clear();
      renderTable();
    };
    const onBulkDelete = () => deleteItemsByIds(Array.from(selectedIds));
    const onNormalize = () => {
      if (allItems.length === 0) return;
      persistOrderSnapshot([...allItems], "", { normalizeAll: true, recordHistory: true });
      toast("Display sequence normalized (1..N).", "success", 2400);
    };

    const onTbodyClick = (e) => {
      const resetBtn = e.target.closest("[data-cs-reset-filters]");
      if (resetBtn) {
        if (searchInput) searchInput.value = "";
        if (primaryFilterEl) primaryFilterEl.value = "all";
        if (secondaryFilterEl) secondaryFilterEl.value = "all";
        renderTable();
        return;
      }

      const emptyAddBtn = e.target.closest("[data-cs-empty-add]");
      if (emptyAddBtn && getAddPageName) {
        navigate(portalMode, getAddPageName());
        return;
      }

      const editBtn = e.target.closest("[data-cs-edit-id]");
      if (editBtn) {
        const id = editBtn.getAttribute("data-cs-edit-id");
        const item = allItems.find((it) => idOf(it) === id);
        if (item && onEdit) onEdit(item);
        return;
      }

      const delBtn = e.target.closest("[data-cs-delete-id]");
      if (delBtn) {
        const id = delBtn.getAttribute("data-cs-delete-id");
        if (id) deleteItemsByIds([id]);
      }
    };

    const onTbodyChange = (e) => {
      const cb = e.target.closest("[data-cs-row-check]");
      if (!cb) return;
      const id = cb.getAttribute("data-cs-row-check");
      if (!id) return;
      if (cb.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateBulkUi(getVisibleItems());
      const row = cb.closest("tr");
      if (row) row.classList.toggle("is-selected", cb.checked);
    };

    const onDocKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (historyStack.length > 0) {
        e.preventDefault();
        handleUndo();
      }
    };

    searchInput?.addEventListener("input", onSearchInput);
    searchClear?.addEventListener("click", onClearSearch);
    primaryFilterEl?.addEventListener("change", onFilterChange);
    secondaryFilterEl?.addEventListener("change", onFilterChange);
    checkAllEl?.addEventListener("change", onCheckAllChange);
    bulkClearBtn?.addEventListener("click", onBulkClear);
    bulkDeleteBtn?.addEventListener("click", onBulkDelete);
    undoBtn?.addEventListener("click", handleUndo);
    normalizeBtn?.addEventListener("click", onNormalize);
    tbody?.addEventListener("click", onTbodyClick);
    tbody?.addEventListener("change", onTbodyChange);
    document.addEventListener("keydown", onDocKeyDown);

    const detachReorder = attachTableReorderEngine({
      scrollContainer: scrollBox,
      tbody,
      getFullIds: () => allItems.map(idOf),
      getVisibleIds: () => getVisibleItems().map(idOf),
      onMove: handleMove,
      onPositionCommit: handleMove
    });

    const extraCleanup = typeof getExtraCleanup === "function" ? getExtraCleanup(root) : null;

    const cleanup = () => {
      isDisposed = true;
      debouncedRender.cancel?.();
      detachReorder();
      searchInput?.removeEventListener("input", onSearchInput);
      searchClear?.removeEventListener("click", onClearSearch);
      primaryFilterEl?.removeEventListener("change", onFilterChange);
      secondaryFilterEl?.removeEventListener("change", onFilterChange);
      checkAllEl?.removeEventListener("change", onCheckAllChange);
      bulkClearBtn?.removeEventListener("click", onBulkClear);
      bulkDeleteBtn?.removeEventListener("click", onBulkDelete);
      undoBtn?.removeEventListener("click", handleUndo);
      normalizeBtn?.removeEventListener("click", onNormalize);
      tbody?.removeEventListener("click", onTbodyClick);
      tbody?.removeEventListener("change", onTbodyChange);
      document.removeEventListener("keydown", onDocKeyDown);
      if (typeof extraCleanup === "function") extraCleanup();
    };
    globalScope.cleanupCurrentPage = cleanup;

    const initPromise = (async () => {
      setSyncState("saving", "Loading catalog...");
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="${colCount}" style="padding:32px; text-align:center; color:var(--cs-text-muted);">
              <i class="fa-solid fa-spinner fa-spin" style="margin-right:8px;"></i>Loading ${escapeHtml(entityPlural)}...
            </td>
          </tr>
        `;
      }
      try {
        const res = await apiJson(listUrl, { method: "POST" });
        const rawList = normalizeListResponse(res, listKeys);
        allItems = [...rawList].sort((a, b) => {
          const oa = Number(a?.order) || Number.MAX_SAFE_INTEGER;
          const ob = Number(b?.order) || Number.MAX_SAFE_INTEGER;
          if (oa !== ob) return oa - ob;
          return idOf(a).localeCompare(idOf(b));
        });
        if (!isDisposed) {
          setSyncState("synced", "Synced");
          renderTable();
        }
      } catch (err) {
        if (!isDisposed) {
          setSyncState("error", "Load failed");
          toast(err.message || `Failed to load ${entityPlural}.`, "error");
          if (tbody) {
            tbody.innerHTML = `
              <tr>
                <td colspan="${colCount}">
                  <div class="cs-empty">
                    <div class="cs-empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <h3>Unable to load ${escapeHtml(entityPlural)}</h3>
                    <p>${escapeHtml(err.message || "Please check your connection and try again.")}</p>
                  </div>
                </td>
              </tr>
            `;
          }
        }
      }
      return cleanup;
    })();

    globalScope.subpageReady = initPromise;
    return initPromise;
  }

  /* ---------- Database Initializers ---------- */

  function initTestDatabasePage({ portalMode = "admin" } = {}) {
    const { getApiMap, escapeHtml, formatCurrency, navigate, openSampleTypeModal } = CS();
    const api = getApiMap(portalMode);

    return createDatabaseController({
      portalMode,
      entityLabel: "test",
      entityPlural: "tests",
      listUrl: api.testsList,
      listKeys: ["tests", "data"],
      reorderUrl: api.testReorder,
      deleteUrl: api.testDelete,
      deletePayloadKey: "testIds",
      colCount: 8,
      getAddPageName: () => "addTest",
      searchPlaceholderMatch: (t, q) => {
        const cat = getCategoryName(t.category);
        return (
          String(t.Name || "").toLowerCase().includes(q) ||
          String(t.Short_name || "").toLowerCase().includes(q) ||
          String(t.bookingCode || "").toLowerCase().includes(q) ||
          String(t.sampleType || "").toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q)
        );
      },
      getPrimaryFilterOptions: (items) => uniqueStrings(items.map((t) => getCategoryName(t.category))).sort(),
      matchesFilters: (t, catFilter, typeFilter) => {
        if (catFilter !== "all" && getCategoryName(t.category) !== catFilter) return false;
        if (typeFilter === "document" && !t.isDocumentedTest) return false;
        if (typeFilter === "standard" && Boolean(t.isDocumentedTest)) return false;
        return true;
      },
      buildMetrics: (root, items) => {
        const totalEl = root.querySelector("[data-cs-stat-total]");
        const stdEl = root.querySelector("[data-cs-stat-standard]");
        const docEl = root.querySelector("[data-cs-stat-document]");
        const catEl = root.querySelector("[data-cs-stat-categories]");
        const docCount = items.filter((t) => Boolean(t.isDocumentedTest)).length;
        const cats = uniqueStrings(items.map((t) => getCategoryName(t.category)));
        if (totalEl) totalEl.textContent = String(items.length);
        if (stdEl) stdEl.textContent = String(items.length - docCount);
        if (docEl) docEl.textContent = String(docCount);
        if (catEl) catEl.textContent = String(cats.length);
      },
      renderRowCells: (t) => {
        const id = idOf(t);
        const catName = getCategoryName(t.category) || "Uncategorized";
        const paramCount = safeArray(t.parameters).length;
        const isDoc = Boolean(t.isDocumentedTest);
        const mrp = CS().toNumber(t.Price, 0);
        const net = CS().toNumber(t.final_price, mrp);

        return `
          <td>
            <div class="cs-item-title">
              <span>${escapeHtml(t.Name || "Untitled Test")}</span>
              ${isDoc ? `<span class="cs-badge cs-badge-amber">Document</span>` : ""}
            </div>
            <div class="cs-item-sub">
              ${t.Short_name ? `<span>${escapeHtml(t.Short_name)}</span>` : ""}
              ${t.bookingCode ? `<span class="cs-code-tag">${escapeHtml(t.bookingCode)}</span>` : ""}
              ${t.method ? `<span>Method: ${escapeHtml(t.method)}</span>` : ""}
            </div>
          </td>
          <td><span class="cs-badge cs-badge-neutral">${escapeHtml(catName)}</span></td>
          <td>
            <div class="cs-price-main">${escapeHtml(formatCurrency(net))}</div>
            ${mrp !== net ? `<div class="cs-price-sub">MRP ${escapeHtml(formatCurrency(mrp))}</div>` : ""}
          </td>
          <td><span class="cs-badge cs-badge-blue">${escapeHtml(t.sampleType || "Not set")}</span></td>
          <td>
            ${
              isDoc
                ? `<span class="cs-hint">Rich Text Template</span>`
                : `<span class="cs-badge cs-badge-green">${paramCount} ${paramCount === 1 ? "Param" : "Params"}</span>`
            }
            ${t.tat ? `<div class="cs-price-sub" style="margin-top:3px;">TAT: ${escapeHtml(t.tat)}</div>` : ""}
          </td>
          <td style="text-align:right; white-space:nowrap;">
            <div class="cs-row-actions">
              <button
                type="button"
                class="cs-btn cs-btn-secondary cs-btn-xs"
                data-cs-edit-id="${escapeHtml(id)}"
              >
                <i class="fa-regular fa-pen-to-square"></i> Edit
              </button>
              <button
                type="button"
                class="cs-icon-btn cs-icon-btn--danger"
                style="width:28px; height:26px;"
                data-cs-delete-id="${escapeHtml(id)}"
                title="Delete test"
                aria-label="Delete test"
              >
                <i class="fa-regular fa-trash-can"></i>
              </button>
            </div>
          </td>
        `;
      },
      onEdit: (test) => {
        navigate(portalMode, "editTest", { Name: idOf(test) });
      },
      getExtraCleanup: (root) => {
        const addTestBtn = root.querySelector("[data-cs-add-test]");
        const addDocBtn = root.querySelector("[data-cs-add-document]");
        const addSampleBtn = root.querySelector("[data-cs-add-sample]");
        const onAddTest = () => navigate(portalMode, "addTest");
        const onAddDoc = () => navigate(portalMode, "addTestDocument");
        const onAddSample = () => openSampleTypeModal({ portalMode });

        addTestBtn?.addEventListener("click", onAddTest);
        addDocBtn?.addEventListener("click", onAddDoc);
        addSampleBtn?.addEventListener("click", onAddSample);

        return () => {
          addTestBtn?.removeEventListener("click", onAddTest);
          addDocBtn?.removeEventListener("click", onAddDoc);
          addSampleBtn?.removeEventListener("click", onAddSample);
        };
      }
    });
  }

  function initPanelDatabasePage({ portalMode = "admin" } = {}) {
    const { getApiMap, escapeHtml, formatCurrency, navigate } = CS();
    const api = getApiMap(portalMode);

    return createDatabaseController({
      portalMode,
      entityLabel: "panel",
      entityPlural: "panels",
      listUrl: api.panelsList,
      listKeys: ["panels", "data"],
      reorderUrl: api.panelReorder,
      deleteUrl: api.panelDelete,
      deletePayloadKey: "panelIds",
      colCount: 8,
      getAddPageName: () => "addPanels",
      searchPlaceholderMatch: (p, q) => {
        const cat = getCategoryName(p.category);
        const testNames = safeArray(p.tests).join(" ").toLowerCase();
        const samples = safeArray(p.sample_types).join(" ").toLowerCase();
        return (
          String(p.name || "").toLowerCase().includes(q) ||
          String(p.Short_name || "").toLowerCase().includes(q) ||
          String(p.bookingCode || "").toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q) ||
          testNames.includes(q) ||
          samples.includes(q)
        );
      },
      getPrimaryFilterOptions: (items) => uniqueStrings(items.map((p) => getCategoryName(p.category))).sort(),
      matchesFilters: (p, catFilter) => {
        if (catFilter !== "all" && getCategoryName(p.category) !== catFilter) return false;
        return true;
      },
      buildMetrics: (root, items) => {
        const totalEl = root.querySelector("[data-cs-stat-total]");
        const testsEl = root.querySelector("[data-cs-stat-linked]");
        const avgEl = root.querySelector("[data-cs-stat-avg-fee]");
        const catEl = root.querySelector("[data-cs-stat-categories]");
        const totalTestsCount = items.reduce((acc, p) => acc + Math.max(safeArray(p.testsId).length, safeArray(p.tests).length), 0);
        const avgFee = items.length ? items.reduce((acc, p) => acc + CS().toNumber(p.final_price, 0), 0) / items.length : 0;
        const cats = uniqueStrings(items.map((p) => getCategoryName(p.category)));

        if (totalEl) totalEl.textContent = String(items.length);
        if (testsEl) testsEl.textContent = String(totalTestsCount);
        if (avgEl) avgEl.textContent = formatCurrency(Math.round(avgFee));
        if (catEl) catEl.textContent = String(cats.length);
      },
      renderRowCells: (p) => {
        const id = idOf(p);
        const cat = getCategoryName(p.category) || "General";
        const testNames = uniqueStrings(safeArray(p.tests));
        const preview = testNames.slice(0, 3).join(", ");
        const remaining = testNames.length > 3 ? ` +${testNames.length - 3} more` : "";
        const samples = uniqueStrings(safeArray(p.sample_types));
        const mrp = CS().toNumber(p.price, 0);
        const net = CS().toNumber(p.final_price, mrp);

        return `
          <td>
            <div class="cs-item-title">
              <span>${escapeHtml(p.name || "Untitled Panel")}</span>
            </div>
            <div class="cs-item-sub">
              ${p.Short_name ? `<span>${escapeHtml(p.Short_name)}</span>` : ""}
              ${p.bookingCode ? `<span class="cs-code-tag">${escapeHtml(p.bookingCode)}</span>` : ""}
            </div>
          </td>
          <td><span class="cs-badge cs-badge-neutral">${escapeHtml(cat)}</span></td>
          <td>
            <div class="cs-price-main">${escapeHtml(formatCurrency(net))}</div>
            ${mrp !== net ? `<div class="cs-price-sub">MRP ${escapeHtml(formatCurrency(mrp))}</div>` : ""}
          </td>
          <td>
            <span class="cs-badge cs-badge-green">${testNames.length || safeArray(p.testsId).length} Tests</span>
            ${preview ? `<div class="cs-price-sub" style="margin-top:3px;">${escapeHtml(preview + remaining)}</div>` : ""}
          </td>
          <td>
            <div class="cs-chip-group">
              ${
                samples.length
                  ? samples.slice(0, 2).map((s) => `<span class="cs-badge cs-badge-blue">${escapeHtml(s)}</span>`).join("") +
                    (samples.length > 2 ? `<span class="cs-badge cs-badge-neutral">+${samples.length - 2}</span>` : "")
                  : `<span class="cs-hint">None</span>`
              }
            </div>
          </td>
          <td style="text-align:right; white-space:nowrap;">
            <div class="cs-row-actions">
              <button type="button" class="cs-btn cs-btn-secondary cs-btn-xs" data-cs-edit-id="${escapeHtml(id)}">
                <i class="fa-regular fa-pen-to-square"></i> Edit
              </button>
              <button
                type="button"
                class="cs-icon-btn cs-icon-btn--danger"
                style="width:28px; height:26px;"
                data-cs-delete-id="${escapeHtml(id)}"
                title="Delete panel"
                aria-label="Delete panel"
              >
                <i class="fa-regular fa-trash-can"></i>
              </button>
            </div>
          </td>
        `;
      },
      onEdit: (panel) => {
        navigate(portalMode, "editPanels", { _id: idOf(panel), name: panel.name || "" });
      },
      getExtraCleanup: (root) => {
        const addBtn = root.querySelector("[data-cs-add-panel]");
        const onAdd = () => navigate(portalMode, "addPanels");
        addBtn?.addEventListener("click", onAdd);
        return () => addBtn?.removeEventListener("click", onAdd);
      }
    });
  }

  function initPackageDatabasePage({ portalMode = "admin" } = {}) {
    const { getApiMap, escapeHtml, formatCurrency, navigate } = CS();
    const api = getApiMap(portalMode);

    return createDatabaseController({
      portalMode,
      entityLabel: "package",
      entityPlural: "packages",
      listUrl: api.packagesList,
      listKeys: ["packages", "data"],
      reorderUrl: api.packageReorder,
      deleteUrl: api.packageDelete,
      deletePayloadKey: "packageIds",
      colCount: 8,
      getAddPageName: () => "addPackage",
      searchPlaceholderMatch: (pkg, q) => {
        const itemsText = [...safeArray(pkg.testname), ...safeArray(pkg.pannelname)].join(" ").toLowerCase();
        const sampleText = [...safeArray(pkg.testSample), ...safeArray(pkg.pannelSample)].join(" ").toLowerCase();
        return (
          String(pkg.packageName || "").toLowerCase().includes(q) ||
          String(pkg.bookingCode || "").toLowerCase().includes(q) ||
          String(pkg.packagegender || "").toLowerCase().includes(q) ||
          itemsText.includes(q) ||
          sampleText.includes(q)
        );
      },
      matchesFilters: (pkg, genderFilter) => {
        if (!genderFilter || genderFilter === "all") return true;
        const g = String(pkg.packagegender || "Both").toLowerCase();
        return g === genderFilter.toLowerCase();
      },
      buildMetrics: (root, items) => {
        const totalEl = root.querySelector("[data-cs-stat-total]");
        const avgEl = root.querySelector("[data-cs-stat-avg-fee]");
        const bundlesEl = root.querySelector("[data-cs-stat-components]");
        const avgFee = items.length ? items.reduce((acc, p) => acc + CS().toNumber(p.final_price, 0), 0) / items.length : 0;
        const totalComponents = items.reduce(
          (acc, p) => acc + safeArray(p.testIds).length + safeArray(p.pannelIds).length,
          0
        );

        if (totalEl) totalEl.textContent = String(items.length);
        if (avgEl) avgEl.textContent = formatCurrency(Math.round(avgFee));
        if (bundlesEl) bundlesEl.textContent = String(totalComponents);
      },
      renderRowCells: (pkg) => {
        const id = idOf(pkg);
        const testCount = Math.max(safeArray(pkg.testIds).length, safeArray(pkg.testname).length);
        const panelCount = Math.max(safeArray(pkg.pannelIds).length, safeArray(pkg.pannelname).length);
        const names = [...safeArray(pkg.testname), ...safeArray(pkg.pannelname)].filter(Boolean);
        const preview = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
        const samples = uniqueStrings([...safeArray(pkg.testSample), ...safeArray(pkg.pannelSample)]);
        const mrp = CS().toNumber(pkg.packageFee, 0);
        const net = CS().toNumber(pkg.final_price, mrp);
        const gender = pkg.packagegender || "Both";
        const genderLabel = gender.toLowerCase() === "both" ? "All Genders" : gender;

        return `
          <td>
            <div class="cs-item-title">
              <span>${escapeHtml(pkg.packageName || "Untitled Package")}</span>
            </div>
            <div class="cs-item-sub">
              ${pkg.bookingCode ? `<span class="cs-code-tag">${escapeHtml(pkg.bookingCode)}</span>` : ""}
              <span>${testCount} Tests · ${panelCount} Panels</span>
            </div>
          </td>
          <td><span class="cs-badge cs-badge-neutral">${escapeHtml(genderLabel)}</span></td>
          <td>
            <div class="cs-price-main">${escapeHtml(formatCurrency(net))}</div>
            ${mrp > net ? `<div class="cs-price-sub">MRP ${escapeHtml(formatCurrency(mrp))}</div>` : ""}
          </td>
          <td>
            <span class="cs-badge cs-badge-green">${testCount + panelCount} Items</span>
            ${preview ? `<div class="cs-price-sub" style="margin-top:3px;">${escapeHtml(preview)}</div>` : ""}
          </td>
          <td>
            <div class="cs-chip-group">
              ${
                samples.length
                  ? samples.slice(0, 2).map((s) => `<span class="cs-badge cs-badge-blue">${escapeHtml(s)}</span>`).join("") +
                    (samples.length > 2 ? `<span class="cs-badge cs-badge-neutral">+${samples.length - 2}</span>` : "")
                  : `<span class="cs-hint">None</span>`
              }
            </div>
          </td>
          <td style="text-align:right; white-space:nowrap;">
            <div class="cs-row-actions">
              <button type="button" class="cs-btn cs-btn-secondary cs-btn-xs" data-cs-edit-id="${escapeHtml(id)}">
                <i class="fa-regular fa-pen-to-square"></i> Edit
              </button>
              <button
                type="button"
                class="cs-icon-btn cs-icon-btn--danger"
                style="width:28px; height:26px;"
                data-cs-delete-id="${escapeHtml(id)}"
                title="Delete package"
                aria-label="Delete package"
              >
                <i class="fa-regular fa-trash-can"></i>
              </button>
            </div>
          </td>
        `;
      },
      onEdit: (pkg) => {
        navigate(portalMode, "editPackage", { _id: idOf(pkg), name: pkg.packageName || "" });
      },
      getExtraCleanup: (root) => {
        const addBtn = root.querySelector("[data-cs-add-package]");
        const onAdd = () => navigate(portalMode, "addPackage");
        addBtn?.addEventListener("click", onAdd);
        return () => addBtn?.removeEventListener("click", onAdd);
      }
    });
  }

  /* ========================================================================
     2. SHARED DUAL PICKER & REORDERABLE SELECTION WIDGET
     ======================================================================== */

  function createDualPicker({
    container,
    catalogTitle = "Catalog",
    selectedTitle = "Selected & Order",
    emptySelectedText = "Click items on the left to add them.",
    getItemId,
    getItemName,
    getItemMeta,
    getItemCategory,
    onChange
  }) {
    const { escapeHtml, attachListReorderEngine } = CS();
    let catalogItems = [];
    let selectedIds = [];
    let searchTerm = "";
    let categoryFilter = "all";

    container.innerHTML = `
      <div class="cs-picker-grid">
        <div class="cs-picker-pane">
          <div class="cs-picker-head">
            <div class="cs-picker-head-top">
              <span>${escapeHtml(catalogTitle)}</span>
              <span class="cs-hint" data-dp-avail-count>0 available</span>
            </div>
            <div style="display:flex; gap:6px;">
              <input type="text" class="cs-input" data-dp-search placeholder="Search..." style="min-height:32px; font-size:12px;" />
              <select class="cs-select" data-dp-cat style="min-height:32px; width:135px; font-size:12px;">
                <option value="all">All Categories</option>
              </select>
            </div>
          </div>
          <div class="cs-picker-list" data-dp-catalog-list></div>
        </div>

        <div class="cs-picker-pane">
          <div class="cs-picker-head">
            <div class="cs-picker-head-top">
              <span>${escapeHtml(selectedTitle)} (<span data-dp-selected-count>0</span>)</span>
              <button type="button" class="cs-btn cs-btn-ghost cs-btn-xs" data-dp-clear>Clear All</button>
            </div>
            <div class="cs-hint">Drag handle, click # to jump, or use ↑↓ to set report sequence.</div>
          </div>
          <div class="cs-picker-list" data-dp-selected-list></div>
        </div>
      </div>
    `;

    const searchEl = container.querySelector("[data-dp-search]");
    const catEl = container.querySelector("[data-dp-cat]");
    const availCountEl = container.querySelector("[data-dp-avail-count]");
    const selCountEl = container.querySelector("[data-dp-selected-count]");
    const catalogListEl = container.querySelector("[data-dp-catalog-list]");
    const selectedListEl = container.querySelector("[data-dp-selected-list]");
    const clearBtn = container.querySelector("[data-dp-clear]");

    const itemById = () => {
      const map = new Map();
      catalogItems.forEach((it) => map.set(getItemId(it), it));
      return map;
    };

    const getSelectedObjects = () => {
      const map = itemById();
      return selectedIds.map((id) => map.get(id)).filter(Boolean);
    };

    const notify = () => {
      if (typeof onChange === "function") onChange(getSelectedObjects());
    };

    const renderCatalog = () => {
      const selectedSet = new Set(selectedIds);
      const q = searchTerm.trim().toLowerCase();
      const filtered = catalogItems.filter((it) => {
        const name = String(getItemName(it) || "").toLowerCase();
        const meta = String(getItemMeta(it) || "").toLowerCase();
        const cat = String(getItemCategory(it) || "");
        if (q && !name.includes(q) && !meta.includes(q) && !cat.toLowerCase().includes(q)) return false;
        if (categoryFilter !== "all" && cat !== categoryFilter) return false;
        return true;
      });

      if (availCountEl) availCountEl.textContent = `${filtered.length} shown`;

      if (filtered.length === 0) {
        catalogListEl.innerHTML = `<div class="cs-hint" style="padding:24px; text-align:center;">No matching items found.</div>`;
        return;
      }

      catalogListEl.innerHTML = filtered
        .map((it) => {
          const id = getItemId(it);
          const added = selectedSet.has(id);
          return `
            <div class="cs-picker-item ${added ? "is-added" : ""}" data-dp-toggle-id="${escapeHtml(id)}">
              <div style="min-width:0; flex:1 1 auto;">
                <div style="font-size:12.5px; font-weight:600; color:var(--cs-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  ${escapeHtml(getItemName(it))}
                </div>
                <div class="cs-picker-item-meta">${escapeHtml(getItemMeta(it))}</div>
              </div>
              <button type="button" class="cs-btn ${added ? "cs-btn-primary" : "cs-btn-secondary"} cs-btn-xs">
                ${added ? `<i class="fa-solid fa-check"></i> Added` : `<i class="fa-solid fa-plus"></i> Add`}
              </button>
            </div>
          `;
        })
        .join("");
    };

    const renderSelected = () => {
      const items = getSelectedObjects();
      if (selCountEl) selCountEl.textContent = String(items.length);

      if (items.length === 0) {
        selectedListEl.innerHTML = `<div class="cs-hint" style="padding:24px; text-align:center;">${escapeHtml(emptySelectedText)}</div>`;
        return;
      }

      selectedListEl.innerHTML = items
        .map((it, idx) => {
          const id = getItemId(it);
          return `
            <div class="cs-selected-item" data-reorder-id="${escapeHtml(id)}">
              <div class="cs-selected-left">
                <button type="button" class="cs-drag-handle" title="Drag to reorder" aria-label="Drag handle">
                  <i class="fa-solid fa-grip-vertical"></i>
                </button>
                <button type="button" class="cs-order-pill" data-dp-jump-id="${escapeHtml(id)}" title="Click to jump position">#${idx + 1}</button>
                <div style="min-width:0; flex:1 1 auto;">
                  <div class="cs-selected-name">${escapeHtml(getItemName(it))}</div>
                  <div class="cs-picker-item-meta">${escapeHtml(getItemMeta(it))}</div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:3px; flex-shrink:0;">
                <button type="button" class="cs-nudge-btn" data-dp-move="up" data-id="${escapeHtml(id)}" ${idx === 0 ? "disabled" : ""} title="Move up">
                  <i class="fa-solid fa-chevron-up"></i>
                </button>
                <button type="button" class="cs-nudge-btn" data-dp-move="down" data-id="${escapeHtml(id)}" ${idx === items.length - 1 ? "disabled" : ""} title="Move down">
                  <i class="fa-solid fa-chevron-down"></i>
                </button>
                <button type="button" class="cs-icon-btn cs-icon-btn--danger" style="width:24px; height:24px;" data-dp-remove-id="${escapeHtml(id)}" title="Remove">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>
          `;
        })
        .join("");
    };

    const renderBoth = () => {
      renderCatalog();
      renderSelected();
    };

    const moveSelected = (id, toIdx) => {
      const fromIdx = selectedIds.indexOf(id);
      if (fromIdx === -1) return;
      const bounded = Math.max(0, Math.min(selectedIds.length - 1, toIdx));
      if (bounded === fromIdx) return;
      const next = [...selectedIds];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(bounded, 0, removed);
      selectedIds = next;
      renderBoth();
      notify();
    };

    const onSearch = (e) => {
      searchTerm = e.target.value || "";
      renderCatalog();
    };
    const onCat = (e) => {
      categoryFilter = e.target.value || "all";
      renderCatalog();
    };
    const onCatalogClick = (e) => {
      const row = e.target.closest("[data-dp-toggle-id]");
      if (!row) return;
      const id = row.getAttribute("data-dp-toggle-id");
      if (!id) return;
      const idx = selectedIds.indexOf(id);
      if (idx === -1) selectedIds.push(id);
      else selectedIds.splice(idx, 1);
      renderBoth();
      notify();
    };
    const onSelectedClick = (e) => {
      const removeBtn = e.target.closest("[data-dp-remove-id]");
      if (removeBtn) {
        const id = removeBtn.getAttribute("data-dp-remove-id");
        selectedIds = selectedIds.filter((x) => x !== id);
        renderBoth();
        notify();
        return;
      }

      const moveBtn = e.target.closest("[data-dp-move]");
      if (moveBtn) {
        const id = moveBtn.getAttribute("data-id");
        const dir = moveBtn.getAttribute("data-dp-move");
        const idx = selectedIds.indexOf(id);
        if (idx !== -1) moveSelected(id, dir === "up" ? idx - 1 : idx + 1);
        return;
      }

      const jumpPill = e.target.closest("[data-dp-jump-id]");
      if (jumpPill) {
        const id = jumpPill.getAttribute("data-dp-jump-id");
        const curPos = selectedIds.indexOf(id) + 1;
        const input = document.createElement("input");
        input.type = "number";
        input.min = "1";
        input.max = String(selectedIds.length);
        input.value = String(curPos);
        input.className = "cs-order-input";

        let done = false;
        const commit = () => {
          if (done) return;
          done = true;
          const pos = parseInt(input.value, 10);
          if (input.parentNode) input.replaceWith(jumpPill);
          if (Number.isFinite(pos) && pos >= 1) {
            moveSelected(id, pos - 1);
          }
        };
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            commit();
          } else if (ev.key === "Escape") {
            done = true;
            if (input.parentNode) input.replaceWith(jumpPill);
          }
        });
        input.addEventListener("blur", commit);
        jumpPill.replaceWith(input);
        input.focus();
        input.select();
      }
    };
    const onClear = () => {
      selectedIds = [];
      renderBoth();
      notify();
    };

    searchEl.addEventListener("input", onSearch);
    catEl.addEventListener("change", onCat);
    catalogListEl.addEventListener("click", onCatalogClick);
    selectedListEl.addEventListener("click", onSelectedClick);
    clearBtn.addEventListener("click", onClear);

    const detachListDrag = attachListReorderEngine({
      container: selectedListEl,
      itemSelector: "[data-reorder-id]",
      onReorder: (nextIds) => {
        selectedIds = nextIds;
        renderBoth();
        notify();
      }
    });

    return {
      setCatalog(items) {
        catalogItems = [...(items || [])];
        const cats = uniqueStrings(catalogItems.map(getItemCategory)).sort();
        catEl.innerHTML =
          `<option value="all">All Categories</option>` +
          cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
        renderBoth();
      },
      setSelectedIds(ids) {
        const validSet = new Set(catalogItems.map(getItemId));
        selectedIds = uniqueStrings(ids).filter((id) => validSet.has(id));
        renderBoth();
        notify();
      },
      getSelectedObjects,
      destroy() {
        detachListDrag();
        searchEl.removeEventListener("input", onSearch);
        catEl.removeEventListener("change", onCat);
        catalogListEl.removeEventListener("click", onCatalogClick);
        selectedListEl.removeEventListener("click", onSelectedClick);
        clearBtn.removeEventListener("click", onClear);
      }
    };
  }

  /* ========================================================================
     3. TEST FORM CONTROLLER (Add Test / Edit Test / Add Document)
     ======================================================================== */

  function initTestFormPage({ portalMode = "admin", mode = "add" } = {}) {
    const {
      getApiMap,
      escapeHtml,
      apiJson,
      normalizeListResponse,
      toast,
      confirmDialog,
      navigate,
      getQueryParam,
      formatCurrency,
      openSampleTypeModal,
      openUnitModal,
      attachListReorderEngine
    } = CS();

    const api = getApiMap(portalMode);
    const root = document.getElementById("cs-page-root");
    if (!root) return Promise.resolve(() => {});

    const isEdit = mode === "edit";
    const isDocumentRoute = mode === "document";
    const testId = isEdit ? (getQueryParam("Name") || getQueryParam("_id") || getQueryParam("id")) : "";

    const formEl = root.querySelector("[data-cs-test-form]");
    const nameInput = root.querySelector("#cs-test-name");
    const shortInput = root.querySelector("#cs-test-short");
    const catSelect = root.querySelector("#cs-test-category");
    const sampleSelect = root.querySelector("#cs-test-sample");
    const mrpInput = root.querySelector("#cs-test-mrp");
    const feeInput = root.querySelector("#cs-test-fee");
    const tatInput = root.querySelector("#cs-test-tat");
    const methodInput = root.querySelector("#cs-test-method");
    const instrumentInput = root.querySelector("#cs-test-instrument");
    const hideMethodCheck = root.querySelector("#cs-hide-method-inst");
    const hideInterpCheck = root.querySelector("#cs-hide-interp");
    const docModeToggle = root.querySelector("#cs-doc-mode-toggle");

    const paramsSection = root.querySelector("[data-cs-params-section]");
    const paramListEl = root.querySelector("[data-cs-param-list]");
    const addParamBtn = root.querySelector("[data-cs-add-param]");
    const collapseAllBtn = root.querySelector("[data-cs-collapse-all]");
    const addSampleBtn = root.querySelector("[data-cs-inline-add-sample]");
    const backBtn = root.querySelector("[data-cs-back]");
    const cancelBtn = root.querySelector("[data-cs-cancel]");
    const saveBtns = Array.from(root.querySelectorAll("[data-cs-submit-btn]"));

    const sumNameEl = root.querySelector("[data-cs-sum-name]");
    const sumCatEl = root.querySelector("[data-cs-sum-cat]");
    const sumSampleEl = root.querySelector("[data-cs-sum-sample]");
    const sumPriceEl = root.querySelector("[data-cs-sum-price]");
    const sumParamsEl = root.querySelector("[data-cs-sum-params]");
    const sumModeEl = root.querySelector("[data-cs-sum-mode]");

    let unitOptions = [];
    let clientKeySeq = 1;
    let isDocumentedTest = isDocumentRoute;
    let allCollapsed = false;
    let feeManuallyEdited = isEdit;
    let parameters = [];
    let isDisposed = false;
    let isSubmitting = false;

    const createBlankRange = () => ({
      gender: "Both",
      minAge: "",
      minAgeUnit: "Years",
      maxAge: "",
      maxAgeUnit: "Years",
      lowerValue: "",
      upperValue: ""
    });

    const createBlankParam = () => ({
      _clientKey: `p_${clientKeySeq++}`,
      parameterId: "",
      masterParameterKey: "",
      originalParameterId: "",
      Para_name: "",
      unit: "",
      defaultresult: "",
      forRandom: "",
      lowerRange: "",
      upperRange: "",
      ValueType: "number",
      text: "",
      NormalValue: [createBlankRange()],
      _collapsed: false
    });

    const mapBackendParam = (raw, idx) => ({
      _clientKey: `p_${clientKeySeq++}`,
      parameterId: String(raw?._id || raw?.parameterId || ""),
      masterParameterKey: String(raw?.masterParameterKey || ""),
      originalParameterId: String(raw?.originalParameterId || ""),
      order: idx + 1,
      Para_name: String(raw?.Para_name || ""),
      unit: String(raw?.unit || ""),
      defaultresult: String(raw?.defaultresult || ""),
      forRandom: String(raw?.forRandom || ""),
      lowerRange: String(raw?.lowerRange || ""),
      upperRange: String(raw?.upperRange || ""),
      ValueType: String(raw?.ValueType || "number").toLowerCase(),
      text: String(raw?.text || ""),
      NormalValue:
        Array.isArray(raw?.NormalValue) && raw.NormalValue.length > 0
          ? raw.NormalValue.map((rv) => ({
              gender: rv?.gender || "Both",
              minAge: rv?.minAge ?? "",
              minAgeUnit: rv?.minAgeUnit || "Years",
              maxAge: rv?.maxAge ?? "",
              maxAgeUnit: rv?.maxAgeUnit || "Years",
              lowerValue: rv?.lowerValue ?? "",
              upperValue: rv?.upperValue ?? ""
            }))
          : [createBlankRange()],
      _collapsed: false
    });

    const buildUnitOptionsHtml = (selectedUnit) => {
      const normalizedSelected = String(selectedUnit || "").trim();
      const opts = uniqueStrings([...unitOptions, ...(normalizedSelected ? [normalizedSelected] : [])]);
      return (
        `<option value="">No Unit</option>` +
        opts
          .map(
            (u) =>
              `<option value="${escapeHtml(u)}" ${
                u.toLowerCase() === normalizedSelected.toLowerCase() ? "selected" : ""
              }>${escapeHtml(u)}</option>`
          )
          .join("")
      );
    };

    const syncSummary = () => {
      if (sumNameEl) sumNameEl.textContent = nameInput?.value.trim() || "Untitled Test";
      if (sumCatEl) sumCatEl.textContent = catSelect?.value || "Not selected";
      if (sumSampleEl) sumSampleEl.textContent = sampleSelect?.value || "Not selected";
      if (sumPriceEl) {
        const net = feeInput?.value !== "" ? CS().toNumber(feeInput?.value, 0) : 0;
        const mrp = mrpInput?.value !== "" ? CS().toNumber(mrpInput?.value, 0) : 0;
        sumPriceEl.textContent = mrp > net ? `${formatCurrency(net)} (MRP ${formatCurrency(mrp)})` : formatCurrency(net);
      }
      if (sumParamsEl) {
        sumParamsEl.textContent = isDocumentedTest ? "Document Template" : `${parameters.length} Parameter${parameters.length === 1 ? "" : "s"}`;
      }
      if (sumModeEl) {
        sumModeEl.textContent = isDocumentedTest ? "Rich-Text Document" : "Structured Parameters";
      }
    };

    const renderModeUi = () => {
      if (paramsSection) {
        paramsSection.style.display = isDocumentedTest ? "none" : "block";
      }
      if (docModeToggle) {
        docModeToggle.checked = isDocumentedTest;
      }
      syncSummary();
    };

    const renderParameterCards = () => {
      if (!paramListEl || isDisposed) return;

      if (parameters.length === 0) {
        paramListEl.innerHTML = `
          <div class="cs-empty" style="padding:28px 16px; border:1px dashed var(--cs-border-strong); border-radius:var(--cs-radius-md);">
            <h3 style="margin-bottom:4px;">No parameters added yet</h3>
            <p style="margin-bottom:12px;">Add analytes or switch to Document Mode if this is a narrative report.</p>
            <button type="button" class="cs-btn cs-btn-primary cs-btn-sm" data-cs-empty-add-param>
              <i class="fa-solid fa-plus"></i> Add First Parameter
            </button>
          </div>
        `;
        syncSummary();
        return;
      }

      paramListEl.innerHTML = parameters
        .map((p, idx) => {
          const k = p._clientKey;
          const upDis = idx === 0 ? "disabled" : "";
          const downDis = idx === parameters.length - 1 ? "disabled" : "";
          const isCat = p.ValueType === "categorical";
          const isFormula = p.ValueType === "formula";
          const typeBadgeLabel =
            p.ValueType === "categorical"
              ? "Categorical"
              : p.ValueType === "text"
              ? "Free Text"
              : p.ValueType === "formula"
              ? "Formula"
              : "Numeric";

          return `
            <div class="cs-param-card ${p._collapsed ? "is-collapsed" : ""}" data-reorder-id="${escapeHtml(k)}" data-param-idx="${idx}">
              <div class="cs-param-head">
                <div class="cs-param-head-left">
                  <button type="button" class="cs-drag-handle" title="Drag to reorder parameter" aria-label="Drag handle">
                    <i class="fa-solid fa-grip-vertical"></i>
                  </button>
                  <button type="button" class="cs-order-pill" data-p-jump="${escapeHtml(k)}" title="Click to jump position">#${idx + 1}</button>
                  <span class="cs-param-head-title" data-p-head-name="${escapeHtml(k)}">
                    ${escapeHtml(p.Para_name.trim() || `Parameter ${idx + 1}`)}
                  </span>
                  <span class="cs-badge cs-badge-blue" data-p-head-type="${escapeHtml(k)}">${escapeHtml(typeBadgeLabel)}</span>
                  ${p.unit ? `<span class="cs-badge cs-badge-neutral" data-p-head-unit="${escapeHtml(k)}">${escapeHtml(p.unit)}</span>` : ""}
                </div>
                <div class="cs-param-head-right">
                  <button type="button" class="cs-nudge-btn" data-p-move="up" data-p-key="${escapeHtml(k)}" ${upDis} title="Move parameter up">
                    <i class="fa-solid fa-chevron-up"></i>
                  </button>
                  <button type="button" class="cs-nudge-btn" data-p-move="down" data-p-key="${escapeHtml(k)}" ${downDis} title="Move parameter down">
                    <i class="fa-solid fa-chevron-down"></i>
                  </button>
                  <button type="button" class="cs-icon-btn" style="width:26px; height:24px;" data-p-dup="${escapeHtml(k)}" title="Duplicate parameter">
                    <i class="fa-regular fa-copy"></i>
                  </button>
                  <button type="button" class="cs-icon-btn" style="width:26px; height:24px;" data-p-collapse="${escapeHtml(k)}" title="${p._collapsed ? "Expand" : "Collapse"}">
                    <i class="fa-solid ${p._collapsed ? "fa-chevron-down" : "fa-chevron-up"}"></i>
                  </button>
                  <button type="button" class="cs-icon-btn cs-icon-btn--danger" style="width:26px; height:24px;" data-p-delete="${escapeHtml(k)}" title="Remove parameter">
                    <i class="fa-regular fa-trash-can"></i>
                  </button>
                </div>
              </div>

              <div class="cs-param-body">
                <div class="cs-form-grid cs-form-grid-4">
                  <div class="cs-field cs-col-span-2">
                    <label class="cs-label">Parameter Name<span class="cs-required">*</span></label>
                    <input
                      type="text"
                      class="cs-input"
                      data-p-field="Para_name"
                      data-p-key="${escapeHtml(k)}"
                      value="${escapeHtml(p.Para_name)}"
                      placeholder="e.g., Hemoglobin, Fasting Blood Glucose"
                    />
                  </div>
                  <div class="cs-field">
                    <div class="cs-label-row">
                      <label class="cs-label">Unit</label>
                      <button type="button" class="cs-inline-action" data-p-add-unit="${escapeHtml(k)}">+ Add Unit</button>
                    </div>
                    <select class="cs-select" data-p-field="unit" data-p-key="${escapeHtml(k)}">
                      ${buildUnitOptionsHtml(p.unit)}
                    </select>
                  </div>
                  <div class="cs-field">
                    <label class="cs-label">Result Type</label>
                    <select class="cs-select" data-p-field="ValueType" data-p-key="${escapeHtml(k)}">
                      <option value="number" ${p.ValueType === "number" ? "selected" : ""}>Numeric Range</option>
                      <option value="categorical" ${p.ValueType === "categorical" ? "selected" : ""}>Categorical Options</option>
                      <option value="text" ${p.ValueType === "text" ? "selected" : ""}>Free Text</option>
                      <option value="formula" ${p.ValueType === "formula" ? "selected" : ""}>Formula</option>
                    </select>
                  </div>

                  <div class="cs-field">
                    <label class="cs-label">Default Result</label>
                    <input
                      type="text"
                      class="cs-input"
                      data-p-field="defaultresult"
                      data-p-key="${escapeHtml(k)}"
                      value="${escapeHtml(p.defaultresult)}"
                      placeholder="Optional default"
                    />
                  </div>
                  <div class="cs-field">
                    <label class="cs-label">Default Lower Limit</label>
                    <input
                      type="text"
                      class="cs-input"
                      data-p-field="lowerRange"
                      data-p-key="${escapeHtml(k)}"
                      value="${escapeHtml(p.lowerRange)}"
                      placeholder="e.g., 12.0"
                    />
                  </div>
                  <div class="cs-field">
                    <label class="cs-label">Default Upper Limit</label>
                    <input
                      type="text"
                      class="cs-input"
                      data-p-field="upperRange"
                      data-p-key="${escapeHtml(k)}"
                      value="${escapeHtml(p.upperRange)}"
                      placeholder="e.g., 16.0"
                    />
                  </div>
                  <div class="cs-field">
                    <label class="cs-label">Parameter Note / Comment</label>
                    <input
                      type="text"
                      class="cs-input"
                      data-p-field="text"
                      data-p-key="${escapeHtml(k)}"
                      value="${escapeHtml(p.text)}"
                      placeholder="Short note shown in report"
                    />
                  </div>

                  <div class="cs-field cs-col-span-full" style="display:${isCat ? "flex" : "none"};" data-p-cat-wrap="${escapeHtml(k)}">
                    <label class="cs-label">Preset Categorical Options (comma-separated)</label>
                    <input
                      type="text"
                      class="cs-input"
                      data-p-field="forRandom"
                      data-p-key="${escapeHtml(k)}"
                      value="${escapeHtml(p.forRandom)}"
                      placeholder="e.g., Reactive, Non-Reactive, Equivocal"
                    />
                    <span class="cs-hint">Technicians can pick any option directly from a dropdown during result entry.</span>
                  </div>

                  ${
                    isFormula
                      ? `<div class="cs-col-span-full cs-hint" style="background:var(--cs-accent-soft); padding:8px 11px; border-radius:6px; color:var(--cs-accent);">
                           Formula values are calculated automatically using rules configured in Formula Builder.
                         </div>`
                      : ""
                  }
                </div>

                <div class="cs-ranges-box">
                  <div class="cs-ranges-head">
                    <span class="cs-ranges-title">Age &amp; Gender Reference Ranges (${p.NormalValue.length})</span>
                    <button type="button" class="cs-btn cs-btn-secondary cs-btn-xs" data-p-add-range="${escapeHtml(k)}">
                      <i class="fa-solid fa-plus"></i> Add Reference Range
                    </button>
                  </div>
                  <div style="display:flex; flex-direction:column; gap:8px;">
                    ${p.NormalValue.map((rv, rIdx) => `
                      <div class="cs-range-row" data-r-idx="${rIdx}">
                        <div>
                          <label class="cs-range-cell-label">Gender</label>
                          <select class="cs-select" data-r-field="gender" data-p-key="${escapeHtml(k)}" data-r-idx="${rIdx}">
                            <option value="Both" ${rv.gender === "Both" ? "selected" : ""}>All / Both</option>
                            <option value="Male" ${rv.gender === "Male" ? "selected" : ""}>Male</option>
                            <option value="Female" ${rv.gender === "Female" ? "selected" : ""}>Female</option>
                            <option value="Other" ${rv.gender === "Other" ? "selected" : ""}>Other</option>
                          </select>
                        </div>
                        <div>
                          <label class="cs-range-cell-label">Min Age</label>
                          <input type="text" class="cs-input" data-r-field="minAge" data-p-key="${escapeHtml(k)}" data-r-idx="${rIdx}" value="${escapeHtml(rv.minAge)}" placeholder="0" />
                        </div>
                        <div>
                          <label class="cs-range-cell-label">Min Unit</label>
                          <select class="cs-select" data-r-field="minAgeUnit" data-p-key="${escapeHtml(k)}" data-r-idx="${rIdx}">
                            <option value="Years" ${rv.minAgeUnit === "Years" ? "selected" : ""}>Years</option>
                            <option value="Months" ${rv.minAgeUnit === "Months" ? "selected" : ""}>Months</option>
                            <option value="Days" ${rv.minAgeUnit === "Days" ? "selected" : ""}>Days</option>
                          </select>
                        </div>
                        <div>
                          <label class="cs-range-cell-label">Max Age</label>
                          <input type="text" class="cs-input" data-r-field="maxAge" data-p-key="${escapeHtml(k)}" data-r-idx="${rIdx}" value="${escapeHtml(rv.maxAge)}" placeholder="120" />
                        </div>
                        <div>
                          <label class="cs-range-cell-label">Max Unit</label>
                          <select class="cs-select" data-r-field="maxAgeUnit" data-p-key="${escapeHtml(k)}" data-r-idx="${rIdx}">
                            <option value="Years" ${rv.maxAgeUnit === "Years" ? "selected" : ""}>Years</option>
                            <option value="Months" ${rv.maxAgeUnit === "Months" ? "selected" : ""}>Months</option>
                            <option value="Days" ${rv.maxAgeUnit === "Days" ? "selected" : ""}>Days</option>
                          </select>
                        </div>
                        <div>
                          <label class="cs-range-cell-label">Lower Value</label>
                          <input type="text" class="cs-input" data-r-field="lowerValue" data-p-key="${escapeHtml(k)}" data-r-idx="${rIdx}" value="${escapeHtml(rv.lowerValue)}" placeholder="Low" />
                        </div>
                        <div>
                          <label class="cs-range-cell-label">Upper Value</label>
                          <input type="text" class="cs-input" data-r-field="upperValue" data-p-key="${escapeHtml(k)}" data-r-idx="${rIdx}" value="${escapeHtml(rv.upperValue)}" placeholder="High" />
                        </div>
                        <div>
                          <button
                            type="button"
                            class="cs-icon-btn cs-icon-btn--danger"
                            style="width:30px; height:31px;"
                            data-r-delete="${escapeHtml(k)}:${rIdx}"
                            title="Remove range"
                            ${p.NormalValue.length <= 1 ? "disabled" : ""}
                          >
                            <i class="fa-solid fa-xmark"></i>
                          </button>
                        </div>
                      </div>
                    `).join("")}
                  </div>
                </div>
              </div>
            </div>
          `;
        })
        .join("");

      syncSummary();
    };

    const moveParamByKey = (key, targetIdx) => {
      const fromIdx = parameters.findIndex((p) => p._clientKey === key);
      if (fromIdx === -1) return;
      const bounded = Math.max(0, Math.min(parameters.length - 1, targetIdx));
      if (bounded === fromIdx) return;
      const next = [...parameters];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(bounded, 0, moved);
      parameters = next;
      renderParameterCards();
      const movedCard = paramListEl?.querySelector(`[data-reorder-id="${CSS.escape(key)}"]`);
      if (movedCard) movedCard.classList.add("cs-row-flash");
    };

    const onParamInput = (e) => {
      const pField = e.target.getAttribute("data-p-field");
      const key = e.target.getAttribute("data-p-key");
      if (pField && key) {
        const param = parameters.find((p) => p._clientKey === key);
        if (!param) return;
        param[pField] = e.target.value;
        if (pField === "Para_name") {
          const idx = parameters.indexOf(param);
          const titleEl = paramListEl.querySelector(`[data-p-head-name="${CSS.escape(key)}"]`);
          if (titleEl) titleEl.textContent = e.target.value.trim() || `Parameter ${idx + 1}`;
        } else if (pField === "ValueType") {
          renderParameterCards();
        } else if (pField === "unit") {
          renderParameterCards();
        }
        return;
      }

      const rField = e.target.getAttribute("data-r-field");
      const rKey = e.target.getAttribute("data-p-key");
      const rIdx = Number(e.target.getAttribute("data-r-idx"));
      if (rField && rKey && Number.isInteger(rIdx)) {
        const param = parameters.find((p) => p._clientKey === rKey);
        if (param && param.NormalValue[rIdx]) {
          param.NormalValue[rIdx][rField] = e.target.value;
        }
      }
    };

    const onParamClick = async (e) => {
      if (e.target.closest("[data-cs-empty-add-param]")) {
        parameters.push(createBlankParam());
        renderParameterCards();
        return;
      }

      const moveBtn = e.target.closest("[data-p-move]");
      if (moveBtn) {
        const key = moveBtn.getAttribute("data-p-key");
        const dir = moveBtn.getAttribute("data-p-move");
        const idx = parameters.findIndex((p) => p._clientKey === key);
        if (idx !== -1) moveParamByKey(key, dir === "up" ? idx - 1 : idx + 1);
        return;
      }

      const jumpPill = e.target.closest("[data-p-jump]");
      if (jumpPill) {
        const key = jumpPill.getAttribute("data-p-jump");
        const curPos = parameters.findIndex((p) => p._clientKey === key) + 1;
        const input = document.createElement("input");
        input.type = "number";
        input.min = "1";
        input.max = String(parameters.length);
        input.value = String(curPos);
        input.className = "cs-order-input";

        let done = false;
        const commit = () => {
          if (done) return;
          done = true;
          const pos = parseInt(input.value, 10);
          if (input.parentNode) input.replaceWith(jumpPill);
          if (Number.isFinite(pos) && pos >= 1) moveParamByKey(key, pos - 1);
        };
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            commit();
          } else if (ev.key === "Escape") {
            done = true;
            if (input.parentNode) input.replaceWith(jumpPill);
          }
        });
        input.addEventListener("blur", commit);
        jumpPill.replaceWith(input);
        input.focus();
        input.select();
        return;
      }

      const dupBtn = e.target.closest("[data-p-dup]");
      if (dupBtn) {
        const key = dupBtn.getAttribute("data-p-dup");
        const idx = parameters.findIndex((p) => p._clientKey === key);
        if (idx === -1) return;
        const src = parameters[idx];
        const clone = {
          ...src,
          _clientKey: `p_${clientKeySeq++}`,
          parameterId: "",
          masterParameterKey: "",
          originalParameterId: "",
          Para_name: src.Para_name ? `${src.Para_name} (Copy)` : "",
          NormalValue: src.NormalValue.map((r) => ({ ...r })),
          _collapsed: false
        };
        parameters.splice(idx + 1, 0, clone);
        renderParameterCards();
        return;
      }

      const collapseBtn = e.target.closest("[data-p-collapse]");
      if (collapseBtn) {
        const key = collapseBtn.getAttribute("data-p-collapse");
        const param = parameters.find((p) => p._clientKey === key);
        if (param) {
          param._collapsed = !param._collapsed;
          renderParameterCards();
        }
        return;
      }

      const deleteBtn = e.target.closest("[data-p-delete]");
      if (deleteBtn) {
        const key = deleteBtn.getAttribute("data-p-delete");
        const param = parameters.find((p) => p._clientKey === key);
        if (!param) return;
        if (param.Para_name.trim()) {
          const ok = await confirmDialog({
            title: "Remove Parameter",
            message: `Remove "${param.Para_name.trim()}" from this test?`,
            confirmText: "Remove",
            danger: true
          });
          if (!ok) return;
        }
        parameters = parameters.filter((p) => p._clientKey !== key);
        renderParameterCards();
        return;
      }

      const addUnitBtn = e.target.closest("[data-p-add-unit]");
      if (addUnitBtn) {
        const key = addUnitBtn.getAttribute("data-p-add-unit");
        openUnitModal({
          portalMode,
          onCreated: (newUnit, allUnits) => {
            unitOptions = uniqueStrings(allUnits.map(getUnitName));
            const param = parameters.find((p) => p._clientKey === key);
            if (param) param.unit = newUnit;
            renderParameterCards();
          }
        });
        return;
      }

      const addRangeBtn = e.target.closest("[data-p-add-range]");
      if (addRangeBtn) {
        const key = addRangeBtn.getAttribute("data-p-add-range");
        const param = parameters.find((p) => p._clientKey === key);
        if (param) {
          param.NormalValue.push(createBlankRange());
          renderParameterCards();
        }
        return;
      }

      const delRangeBtn = e.target.closest("[data-r-delete]");
      if (delRangeBtn) {
        const [key, rIdxStr] = String(delRangeBtn.getAttribute("data-r-delete") || "").split(":");
        const rIdx = Number(rIdxStr);
        const param = parameters.find((p) => p._clientKey === key);
        if (param && param.NormalValue.length > 1 && Number.isInteger(rIdx)) {
          param.NormalValue.splice(rIdx, 1);
          renderParameterCards();
        }
      }
    };

    const populateSelect = (selectEl, items, placeholder, valueGetter) => {
      if (!selectEl) return;
      const cur = selectEl.value;
      const vals = uniqueStrings(items.map(valueGetter)).sort();
      selectEl.innerHTML =
        `<option value="">${escapeHtml(placeholder)}</option>` +
        vals.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
      if (cur && vals.includes(cur)) selectEl.value = cur;
    };

    const validateAndSubmit = async (e) => {
      e?.preventDefault?.();
      if (isSubmitting) return;

      const testName = String(nameInput?.value || "").trim();
      const category = String(catSelect?.value || "").trim();
      const sampleType = String(sampleSelect?.value || "").trim();
      const mrpRaw = String(mrpInput?.value || "").trim();
      const feeRaw = String(feeInput?.value || "").trim();

      let firstErrorEl = null;
      const flagErr = (el, selector, msg) => {
        setFieldError(el, root.querySelector(selector), msg);
        if (msg && !firstErrorEl) firstErrorEl = el;
      };

      flagErr(nameInput, '[data-cs-err="name"]', testName ? "" : "Test name is required.");
      flagErr(catSelect, '[data-cs-err="category"]', category ? "" : "Please select a category.");
      flagErr(sampleSelect, '[data-cs-err="sample"]', sampleType ? "" : "Please select a sample type.");

      const numericFee = Number(feeRaw);
      const numericMrp = mrpRaw === "" ? numericFee : Number(mrpRaw);
      flagErr(
        feeInput,
        '[data-cs-err="fee"]',
        feeRaw === "" || !Number.isFinite(numericFee) || numericFee < 0 ? "Enter a valid billing price." : ""
      );
      flagErr(
        mrpInput,
        '[data-cs-err="mrp"]',
        mrpRaw !== "" && (!Number.isFinite(numericMrp) || numericMrp < 0) ? "Enter a valid MRP." : ""
      );

      if (!isDocumentedTest) {
        if (parameters.length === 0) {
          toast("Add at least one parameter or switch to Document Template mode.", "warning");
          return;
        }
        const invalidParam = parameters.find((p) => !String(p.Para_name || "").trim());
        if (invalidParam) {
          toast("Please provide a name for every parameter before saving.", "error");
          const input = paramListEl?.querySelector(
            `[data-p-field="Para_name"][data-p-key="${CSS.escape(invalidParam._clientKey)}"]`
          );
          input?.focus();
          return;
        }
      }

      if (firstErrorEl) {
        firstErrorEl.focus();
        toast("Please complete the highlighted required fields.", "error");
        return;
      }

      const cleanParams = isDocumentedTest
        ? []
        : parameters.map((p, idx) => ({
            ...(p.parameterId ? { _id: p.parameterId, parameterId: p.parameterId } : {}),
            ...(p.masterParameterKey ? { masterParameterKey: p.masterParameterKey } : {}),
            ...(p.originalParameterId ? { originalParameterId: p.originalParameterId } : {}),
            order: idx + 1,
            Para_name: String(p.Para_name || "").trim(),
            unit: String(p.unit || "").trim(),
            defaultresult: String(p.defaultresult || "").trim(),
            forRandom: String(p.forRandom || "").trim(),
            lowerRange: String(p.lowerRange || "").trim(),
            upperRange: String(p.upperRange || "").trim(),
            ValueType: p.ValueType || "number",
            text: String(p.text || "").trim(),
            NormalValue: (p.NormalValue || []).map((rv) => ({
              gender: rv.gender || "Both",
              minAge: String(rv.minAge ?? "").trim(),
              minAgeUnit: rv.minAgeUnit || "Years",
              maxAge: String(rv.maxAge ?? "").trim(),
              maxAgeUnit: rv.maxAgeUnit || "Years",
              lowerValue: String(rv.lowerValue ?? "").trim(),
              upperValue: String(rv.upperValue ?? "").trim()
            }))
          }));

      const payload = {
        ...(isEdit ? { _id: testId } : {}),
        Name: testName,
        Short_name: String(shortInput?.value || "").trim(),
        category,
        Price: Number.isFinite(numericMrp) ? numericMrp : numericFee,
        final_price: numericFee,
        tat: String(tatInput?.value || "").trim(),
        sampleType,
        method: String(methodInput?.value || "").trim(),
        instrument: String(instrumentInput?.value || "").trim(),
        hideMethodInstrument: Boolean(hideMethodCheck?.checked),
        hideInterpretation: Boolean(hideInterpCheck?.checked),
        interpretation: readRichEditorHtml(),
        isDocumentedTest: Boolean(isDocumentedTest),
        parameters: cleanParams
      };

      isSubmitting = true;
      saveBtns.forEach((btn) => {
        btn.disabled = true;
        btn.dataset.origHtml = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
      });

      try {
        await apiJson(isEdit ? api.testEdit : api.testCreate, {
          method: "POST",
          body: payload
        });
        toast(isEdit ? "Test updated successfully." : "Test created successfully.", "success");
        navigate(portalMode, "test");
      } catch (err) {
        toast(err.message || "Failed to save test.", "error");
      } finally {
        isSubmitting = false;
        saveBtns.forEach((btn) => {
          btn.disabled = false;
          if (btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
        });
      }
    };

    const onAddParam = () => {
      parameters.push(createBlankParam());
      renderParameterCards();
      const last = parameters[parameters.length - 1];
      if (last) {
        const input = paramListEl?.querySelector(
          `[data-p-field="Para_name"][data-p-key="${CSS.escape(last._clientKey)}"]`
        );
        input?.focus();
      }
    };

    const onCollapseToggleAll = () => {
      allCollapsed = !allCollapsed;
      parameters.forEach((p) => {
        p._collapsed = allCollapsed;
      });
      if (collapseAllBtn) {
        collapseAllBtn.innerHTML = allCollapsed
          ? `<i class="fa-solid fa-up-right-and-down-left-from-center"></i> Expand All`
          : `<i class="fa-solid fa-down-left-and-up-right-to-center"></i> Collapse All`;
      }
      renderParameterCards();
    };

    const onInlineAddSample = () => {
      openSampleTypeModal({
        portalMode,
        onCreated: (newName, allSamples) => {
          populateSelect(sampleSelect, allSamples, "Select sample type...", getSampleName);
          if (sampleSelect) sampleSelect.value = newName;
          syncSummary();
        }
      });
    };

    const onMrpInput = () => {
      if (!feeManuallyEdited && feeInput && mrpInput) {
        feeInput.value = mrpInput.value;
      }
      syncSummary();
    };
    const onFeeInput = () => {
      feeManuallyEdited = true;
      syncSummary();
    };
    const onDocToggle = () => {
      isDocumentedTest = Boolean(docModeToggle?.checked);
      if (!isDocumentedTest && parameters.length === 0) {
        parameters.push(createBlankParam());
        renderParameterCards();
      }
      renderModeUi();
    };
    const onGoBack = () => navigate(portalMode, "test");

    const detachParamDrag = attachListReorderEngine({
      container: paramListEl,
      itemSelector: "[data-reorder-id]",
      onReorder: (orderedKeys) => {
        const map = new Map(parameters.map((p) => [p._clientKey, p]));
        parameters = orderedKeys.map((k) => map.get(k)).filter(Boolean);
        renderParameterCards();
      }
    });

    formEl?.addEventListener("submit", validateAndSubmit);
    saveBtns.forEach((b) => {
      if (b.type !== "submit") b.addEventListener("click", validateAndSubmit);
    });
    paramListEl?.addEventListener("input", onParamInput);
    paramListEl?.addEventListener("change", onParamInput);
    paramListEl?.addEventListener("click", onParamClick);
    addParamBtn?.addEventListener("click", onAddParam);
    collapseAllBtn?.addEventListener("click", onCollapseToggleAll);
    addSampleBtn?.addEventListener("click", onInlineAddSample);
    mrpInput?.addEventListener("input", onMrpInput);
    feeInput?.addEventListener("input", onFeeInput);
    nameInput?.addEventListener("input", syncSummary);
    catSelect?.addEventListener("change", syncSummary);
    sampleSelect?.addEventListener("change", syncSummary);
    docModeToggle?.addEventListener("change", onDocToggle);
    backBtn?.addEventListener("click", onGoBack);
    cancelBtn?.addEventListener("click", onGoBack);

    const cleanup = () => {
      isDisposed = true;
      detachParamDrag();
      formEl?.removeEventListener("submit", validateAndSubmit);
      saveBtns.forEach((b) => {
        if (b.type !== "submit") b.removeEventListener("click", validateAndSubmit);
      });
      paramListEl?.removeEventListener("input", onParamInput);
      paramListEl?.removeEventListener("change", onParamInput);
      paramListEl?.removeEventListener("click", onParamClick);
      addParamBtn?.removeEventListener("click", onAddParam);
      collapseAllBtn?.removeEventListener("click", onCollapseToggleAll);
      addSampleBtn?.removeEventListener("click", onInlineAddSample);
      mrpInput?.removeEventListener("input", onMrpInput);
      feeInput?.removeEventListener("input", onFeeInput);
      nameInput?.removeEventListener("input", syncSummary);
      catSelect?.removeEventListener("change", syncSummary);
      sampleSelect?.removeEventListener("change", syncSummary);
      docModeToggle?.removeEventListener("change", onDocToggle);
      backBtn?.removeEventListener("click", onGoBack);
      cancelBtn?.removeEventListener("click", onGoBack);
    };
    globalScope.cleanupCurrentPage = cleanup;

    const initPromise = (async () => {
      try {
        const requests = [
          apiJson(api.categories).catch(() => []),
          apiJson(api.samples).catch(() => []),
          apiJson(api.units).catch(() => []),
          isEdit && testId ? apiJson(api.testOne(testId)) : Promise.resolve(null)
        ];

        const [catRes, sampleRes, unitRes, testRes] = await Promise.all(requests);
        if (isDisposed) return cleanup;

        const cats = normalizeListResponse(catRes, ["data", "categories"]);
        const samples = normalizeListResponse(sampleRes, ["data", "samples"]);
        const units = normalizeListResponse(unitRes, ["units", "data"]);
        unitOptions = uniqueStrings(units.map(getUnitName));

        populateSelect(catSelect, cats, "Select category...", getCategoryName);
        populateSelect(sampleSelect, samples, "Select sample type...", getSampleName);

        let initialInterp = "";
        if (isEdit) {
          const test = testRes?.data || testRes?.test || testRes;
          if (!test || !test._id) {
            toast("Requested test could not be found.", "error");
          } else {
            if (nameInput) nameInput.value = test.Name || "";
            if (shortInput) shortInput.value = test.Short_name || "";
            const catVal = getCategoryName(test.category);
            if (catVal && catSelect) {
              if (!Array.from(catSelect.options).some((o) => o.value === catVal)) {
                catSelect.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(catVal)}">${escapeHtml(catVal)}</option>`);
              }
              catSelect.value = catVal;
            }
            const sampleVal = String(test.sampleType || "").trim();
            if (sampleVal && sampleSelect) {
              if (!Array.from(sampleSelect.options).some((o) => o.value === sampleVal)) {
                sampleSelect.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(sampleVal)}">${escapeHtml(sampleVal)}</option>`);
              }
              sampleSelect.value = sampleVal;
            }
            if (mrpInput) mrpInput.value = test.Price ?? "";
            if (feeInput) feeInput.value = test.final_price ?? test.Price ?? "";
            if (tatInput) tatInput.value = test.tat || "";
            if (methodInput) methodInput.value = test.method || "";
            if (instrumentInput) instrumentInput.value = test.instrument || "";
            if (hideMethodCheck) hideMethodCheck.checked = Boolean(test.hideMethodInstrument);
            if (hideInterpCheck) hideInterpCheck.checked = Boolean(test.hideInterpretation);

            isDocumentedTest = Boolean(test.isDocumentedTest);
            initialInterp = test.interpretation || "";

            const rawParams = safeArray(test.parameters).slice().sort((a, b) => (a?.order || 0) - (b?.order || 0));
            parameters = rawParams.map(mapBackendParam);
            if (!isDocumentedTest && parameters.length === 0) {
              parameters = [createBlankParam()];
            }
          }
        } else if (!isDocumentedTest) {
          parameters = [createBlankParam()];
        }

        renderModeUi();
        if (!isDocumentedTest) renderParameterCards();
        syncSummary();
        await initRichEditor(initialInterp);
      } catch (err) {
        toast(err.message || "Error loading test form data.", "error");
      }
      return cleanup;
    })();

    globalScope.subpageReady = initPromise;
    return initPromise;
  }

  /* ========================================================================
     4. PANEL FORM CONTROLLER (Add Panel / Edit Panel)
     ======================================================================== */

  function initPanelFormPage({ portalMode = "admin", mode = "add" } = {}) {
    const {
      getApiMap,
      escapeHtml,
      apiJson,
      normalizeListResponse,
      toast,
      navigate,
      getQueryParam,
      formatCurrency,
      toNumber,
      openSampleTypeModal
    } = CS();

    const api = getApiMap(portalMode);
    const root = document.getElementById("cs-page-root");
    if (!root) return Promise.resolve(() => {});

    const isEdit = mode === "edit";
    const panelId = isEdit ? (getQueryParam("_id") || getQueryParam("id")) : "";

    const formEl = root.querySelector("[data-cs-panel-form]");
    const nameInput = root.querySelector("#cs-panel-name");
    const shortInput = root.querySelector("#cs-panel-short");
    const catSelect = root.querySelector("#cs-panel-category");
    const mrpInput = root.querySelector("#cs-panel-mrp");
    const feeInput = root.querySelector("#cs-panel-fee");
    const hideMethodCheck = root.querySelector("#cs-panel-hide-method");
    const hideTestInterpCheck = root.querySelector("#cs-panel-hide-test-interp");
    const hidePanelInterpCheck = root.querySelector("#cs-panel-hide-panel-interp");
    const pickerHost = root.querySelector("[data-cs-panel-picker]");
    const samplesChipsEl = root.querySelector("[data-cs-panel-samples]");
    const addSampleBtn = root.querySelector("[data-cs-inline-add-sample]");
    const applySumBtn = root.querySelector("[data-cs-apply-sum]");
    const backBtn = root.querySelector("[data-cs-back]");
    const cancelBtn = root.querySelector("[data-cs-cancel]");
    const saveBtns = Array.from(root.querySelectorAll("[data-cs-submit-btn]"));

    const sumNameEl = root.querySelector("[data-cs-sum-name]");
    const sumCountEl = root.querySelector("[data-cs-sum-count]");
    const sumCatalogMrpEl = root.querySelector("[data-cs-sum-catalog-mrp]");
    const sumFeeEl = root.querySelector("[data-cs-sum-fee]");

    let manualSamples = [];
    let currentSelectedTests = [];
    let isDisposed = false;
    let isSubmitting = false;

    const getEffectiveSamples = () => {
      const fromTests = currentSelectedTests.map((t) => t.sampleType).filter(Boolean);
      return uniqueStrings([...fromTests, ...manualSamples]);
    };

    const renderSampleBadges = () => {
      if (!samplesChipsEl) return;
      const samples = getEffectiveSamples();
      if (samples.length === 0) {
        samplesChipsEl.innerHTML = `<span class="cs-hint">Sample types populate automatically when you add tests.</span>`;
        return;
      }
      samplesChipsEl.innerHTML = samples
        .map((s) => {
          const isManual = manualSamples.some((m) => m.toLowerCase() === s.toLowerCase());
          return `
            <span class="cs-badge ${isManual ? "cs-badge-amber" : "cs-badge-blue"}">
              ${escapeHtml(s)}
              ${
                isManual
                  ? `<button type="button" data-remove-sample="${escapeHtml(s)}" style="border:none;background:transparent;color:inherit;cursor:pointer;padding:0 0 0 4px;" aria-label="Remove sample">&times;</button>`
                  : ""
              }
            </span>
          `;
        })
        .join("");
    };

    const syncSummary = () => {
      if (sumNameEl) sumNameEl.textContent = nameInput?.value.trim() || "Untitled Panel";
      if (sumCountEl) sumCountEl.textContent = `${currentSelectedTests.length} Tests`;
      const combinedMrp = currentSelectedTests.reduce((acc, t) => acc + toNumber(t.final_price ?? t.Price, 0), 0);
      if (sumCatalogMrpEl) sumCatalogMrpEl.textContent = formatCurrency(combinedMrp);
      if (sumFeeEl) sumFeeEl.textContent = formatCurrency(toNumber(feeInput?.value, 0));
      renderSampleBadges();
    };

    const picker = createDualPicker({
      container: pickerHost,
      catalogTitle: "Available Tests",
      selectedTitle: "Panel Tests & Print Sequence",
      emptySelectedText: "Select tests from the left catalog to compose this panel.",
      getItemId: idOf,
      getItemName: (t) => t.Name || "Untitled Test",
      getItemMeta: (t) =>
        `${getCategoryName(t.category) || "General"} · ${t.sampleType || "No sample"} · ${formatCurrency(t.final_price ?? t.Price)}`,
      getItemCategory: (t) => getCategoryName(t.category) || "General",
      onChange: (selected) => {
        currentSelectedTests = selected;
        syncSummary();
      }
    });

    const onSampleChipClick = (e) => {
      const btn = e.target.closest("[data-remove-sample]");
      if (!btn) return;
      const val = btn.getAttribute("data-remove-sample");
      manualSamples = manualSamples.filter((s) => s.toLowerCase() !== String(val).toLowerCase());
      renderSampleBadges();
    };

    const onApplySum = () => {
      const sum = currentSelectedTests.reduce((acc, t) => acc + toNumber(t.final_price ?? t.Price, 0), 0);
      if (mrpInput) mrpInput.value = String(sum);
      if (feeInput && !feeInput.value) feeInput.value = String(sum);
      syncSummary();
      toast(`Applied combined catalog value (${formatCurrency(sum)}) to Base MRP.`, "info", 2400);
    };

    const onAddSample = () => {
      openSampleTypeModal({
        portalMode,
        onCreated: (newSample) => {
          manualSamples = uniqueStrings([...manualSamples, newSample]);
          renderSampleBadges();
        }
      });
    };

    const onSubmit = async (e) => {
      e?.preventDefault?.();
      if (isSubmitting) return;

      const pannelname = String(nameInput?.value || "").trim();
      const category = String(catSelect?.value || "").trim();
      const priceVal = Number(mrpInput?.value);
      const feeVal = Number(feeInput?.value);

      let firstErr = null;
      const check = (el, sel, msg) => {
        setFieldError(el, root.querySelector(sel), msg);
        if (msg && !firstErr) firstErr = el;
      };

      check(nameInput, '[data-cs-err="name"]', pannelname ? "" : "Panel name is required.");
      check(catSelect, '[data-cs-err="category"]', category ? "" : "Please select a category.");
      check(mrpInput, '[data-cs-err="mrp"]', isBlank(mrpInput?.value) || !Number.isFinite(priceVal) || priceVal < 0 ? "Enter a valid base price." : "");
      check(feeInput, '[data-cs-err="fee"]', isBlank(feeInput?.value) || !Number.isFinite(feeVal) || feeVal < 0 ? "Enter a valid panel price." : "");

      if (firstErr) {
        firstErr.focus();
        toast("Please fix the highlighted fields.", "error");
        return;
      }

      if (currentSelectedTests.length === 0) {
        toast("Please include at least one test in this panel.", "warning");
        return;
      }

      const interpretationHtml = readRichEditorHtml();
      const payload = {
        pannelname,
        Short_name: String(shortInput?.value || "").trim(),
        shortName: String(shortInput?.value || "").trim(),
        category,
        price: priceVal,
        final_price: feeVal,
        inputarray: currentSelectedTests.map((t) => t.Name),
        testsId: currentSelectedTests.map(idOf),
        sample_types: getEffectiveSamples(),
        hideMethodInstrument: Boolean(hideMethodCheck?.checked),
        hideInterpretation: Boolean(hideTestInterpCheck?.checked),
        hidePanelInterpretation: Boolean(hidePanelInterpCheck?.checked),
        interpretation: interpretationHtml,
        interpretion: interpretationHtml
      };

      isSubmitting = true;
      saveBtns.forEach((btn) => {
        btn.disabled = true;
        btn.dataset.origHtml = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
      });

      try {
        await apiJson(isEdit ? api.panelEdit(panelId) : api.panelCreate, {
          method: "POST",
          body: payload
        });
        toast(isEdit ? "Panel updated successfully." : "Panel created successfully.", "success");
        navigate(portalMode, "testPanels");
      } catch (err) {
        toast(err.message || "Failed to save panel.", "error");
      } finally {
        isSubmitting = false;
        saveBtns.forEach((btn) => {
          btn.disabled = false;
          if (btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
        });
      }
    };

    const onGoBack = () => navigate(portalMode, "testPanels");

    formEl?.addEventListener("submit", onSubmit);
    saveBtns.forEach((b) => {
      if (b.type !== "submit") b.addEventListener("click", onSubmit);
    });
    samplesChipsEl?.addEventListener("click", onSampleChipClick);
    addSampleBtn?.addEventListener("click", onAddSample);
    applySumBtn?.addEventListener("click", onApplySum);
    nameInput?.addEventListener("input", syncSummary);
    feeInput?.addEventListener("input", syncSummary);
    backBtn?.addEventListener("click", onGoBack);
    cancelBtn?.addEventListener("click", onGoBack);

    const cleanup = () => {
      isDisposed = true;
      picker.destroy();
      formEl?.removeEventListener("submit", onSubmit);
      saveBtns.forEach((b) => {
        if (b.type !== "submit") b.removeEventListener("click", onSubmit);
      });
      samplesChipsEl?.removeEventListener("click", onSampleChipClick);
      addSampleBtn?.removeEventListener("click", onAddSample);
      applySumBtn?.removeEventListener("click", onApplySum);
      nameInput?.removeEventListener("input", syncSummary);
      feeInput?.removeEventListener("input", syncSummary);
      backBtn?.removeEventListener("click", onGoBack);
      cancelBtn?.removeEventListener("click", onGoBack);
    };
    globalScope.cleanupCurrentPage = cleanup;

    const initPromise = (async () => {
      try {
        const [catRes, testRes, panelRes] = await Promise.all([
          apiJson(api.categories).catch(() => []),
          apiJson(api.testsList, { method: "POST" }).catch(() => []),
          isEdit && panelId ? apiJson(api.panelOne(panelId), { method: "POST" }) : Promise.resolve(null)
        ]);
        if (isDisposed) return cleanup;

        const cats = uniqueStrings(normalizeListResponse(catRes, ["data", "categories"]).map(getCategoryName)).sort();
        const tests = normalizeListResponse(testRes, ["tests", "data"]).slice().sort((a, b) => (a?.order || 0) - (b?.order || 0));

        if (catSelect) {
          catSelect.innerHTML =
            `<option value="">Select category...</option>` +
            cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
        }

        picker.setCatalog(tests);

        let initialInterp = "";
        if (isEdit && panelRes) {
          if (nameInput) nameInput.value = panelRes.name || "";
          if (shortInput) shortInput.value = panelRes.Short_name || panelRes.shortName || "";
          const catVal = getCategoryName(panelRes.category);
          if (catVal && catSelect) {
            if (!Array.from(catSelect.options).some((o) => o.value === catVal)) {
              catSelect.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(catVal)}">${escapeHtml(catVal)}</option>`);
            }
            catSelect.value = catVal;
          }
          if (mrpInput) mrpInput.value = panelRes.price ?? "";
          if (feeInput) feeInput.value = panelRes.final_price ?? "";
          if (hideMethodCheck) hideMethodCheck.checked = Boolean(panelRes.hideMethodInstrument);
          if (hideTestInterpCheck) hideTestInterpCheck.checked = Boolean(panelRes.hideInterpretation);
          if (hidePanelInterpCheck) hidePanelInterpCheck.checked = Boolean(panelRes.hidePanelInterpretation ?? panelRes.hidepanelinterpretation);

          const selectedIdsFromPanel = safeArray(panelRes.testsId).map((t) => (typeof t === "object" ? idOf(t) : String(t)));
          picker.setSelectedIds(selectedIdsFromPanel);

          const derivedLower = new Set(currentSelectedTests.map((t) => String(t.sampleType || "").toLowerCase()));
          manualSamples = safeArray(panelRes.sample_types).filter((s) => s && !derivedLower.has(String(s).toLowerCase()));
          initialInterp = panelRes.interpretation || panelRes.interpretion || "";
        }

        syncSummary();
        await initRichEditor(initialInterp);
      } catch (err) {
        toast(err.message || "Failed to load panel builder.", "error");
      }
      return cleanup;
    })();

    globalScope.subpageReady = initPromise;
    return initPromise;
  }

  /* ========================================================================
     5. PACKAGE FORM CONTROLLER (Add Package / Edit Package)
     ======================================================================== */

  function initPackageFormPage({ portalMode = "admin", mode = "add" } = {}) {
    const {
      getApiMap,
      escapeHtml,
      apiJson,
      normalizeListResponse,
      toast,
      navigate,
      getQueryParam,
      formatCurrency,
      toNumber
    } = CS();

    const api = getApiMap(portalMode);
    const root = document.getElementById("cs-page-root");
    if (!root) return Promise.resolve(() => {});

    const isEdit = mode === "edit";
    const pkgId = isEdit ? (getQueryParam("_id") || getQueryParam("id")) : "";

    const formEl = root.querySelector("[data-cs-package-form]");
    const nameInput = root.querySelector("#cs-pkg-name");
    const genderSelect = root.querySelector("#cs-pkg-gender");
    const mrpInput = root.querySelector("#cs-pkg-mrp");
    const feeInput = root.querySelector("#cs-pkg-fee");
    const testPickerHost = root.querySelector("[data-cs-pkg-test-picker]");
    const panelPickerHost = root.querySelector("[data-cs-pkg-panel-picker]");
    const applySumBtn = root.querySelector("[data-cs-apply-sum]");
    const backBtn = root.querySelector("[data-cs-back]");
    const cancelBtn = root.querySelector("[data-cs-cancel]");
    const saveBtns = Array.from(root.querySelectorAll("[data-cs-submit-btn]"));

    const sumNameEl = root.querySelector("[data-cs-sum-name]");
    const sumTestsEl = root.querySelector("[data-cs-sum-tests]");
    const sumPanelsEl = root.querySelector("[data-cs-sum-panels]");
    const sumCatalogTotalEl = root.querySelector("[data-cs-sum-catalog-total]");
    const sumOfferEl = root.querySelector("[data-cs-sum-offer]");
    const sumSavingsEl = root.querySelector("[data-cs-sum-savings]");
    const sumSamplesEl = root.querySelector("[data-cs-sum-samples]");

    let selectedTests = [];
    let selectedPanels = [];
    let isDisposed = false;
    let isSubmitting = false;

    const syncSummary = () => {
      const testsSum = selectedTests.reduce((acc, t) => acc + toNumber(t.final_price ?? t.Price, 0), 0);
      const panelsSum = selectedPanels.reduce((acc, p) => acc + toNumber(p.final_price ?? p.price, 0), 0);
      const combined = testsSum + panelsSum;
      const offer = toNumber(feeInput?.value, 0);
      const mrp = toNumber(mrpInput?.value, combined);
      const baseline = mrp > 0 ? mrp : combined;
      const savings = baseline > offer && offer > 0 ? baseline - offer : 0;
      const savingsPct = baseline > 0 && savings > 0 ? Math.round((savings / baseline) * 100) : 0;

      if (sumNameEl) sumNameEl.textContent = nameInput?.value.trim() || "Untitled Package";
      if (sumTestsEl) sumTestsEl.textContent = `${selectedTests.length} (${formatCurrency(testsSum)})`;
      if (sumPanelsEl) sumPanelsEl.textContent = `${selectedPanels.length} (${formatCurrency(panelsSum)})`;
      if (sumCatalogTotalEl) sumCatalogTotalEl.textContent = formatCurrency(combined);
      if (sumOfferEl) sumOfferEl.textContent = formatCurrency(offer);
      if (sumSavingsEl) {
        sumSavingsEl.textContent = savings > 0 ? `${formatCurrency(savings)} (${savingsPct}% off)` : "—";
      }

      if (sumSamplesEl) {
        const samples = uniqueStrings([
          ...selectedTests.map((t) => t.sampleType),
          ...selectedPanels.flatMap((p) => safeArray(p.sample_types))
        ]);
        sumSamplesEl.innerHTML =
          samples.length > 0
            ? samples.map((s) => `<span class="cs-badge cs-badge-blue">${escapeHtml(s)}</span>`).join("")
            : `<span class="cs-hint">No specimens required yet.</span>`;
      }
    };

    const testPicker = createDualPicker({
      container: testPickerHost,
      catalogTitle: "Individual Tests Catalog",
      selectedTitle: "Included Tests & Sequence",
      emptySelectedText: "No individual tests selected yet.",
      getItemId: idOf,
      getItemName: (t) => t.Name || "Untitled Test",
      getItemMeta: (t) =>
        `${getCategoryName(t.category) || "General"} · ${t.sampleType || "No sample"} · ${formatCurrency(t.final_price ?? t.Price)}`,
      getItemCategory: (t) => getCategoryName(t.category) || "General",
      onChange: (items) => {
        selectedTests = items;
        syncSummary();
      }
    });

    const panelPicker = createDualPicker({
      container: panelPickerHost,
      catalogTitle: "Diagnostic Panels Catalog",
      selectedTitle: "Included Panels & Sequence",
      emptySelectedText: "No panels selected yet.",
      getItemId: idOf,
      getItemName: (p) => p.name || "Untitled Panel",
      getItemMeta: (p) =>
        `${getCategoryName(p.category) || "General"} · ${safeArray(p.tests).length || safeArray(p.testsId).length} tests · ${formatCurrency(p.final_price ?? p.price)}`,
      getItemCategory: (p) => getCategoryName(p.category) || "General",
      onChange: (items) => {
        selectedPanels = items;
        syncSummary();
      }
    });

    const onApplySum = () => {
      const combined =
        selectedTests.reduce((acc, t) => acc + toNumber(t.final_price ?? t.Price, 0), 0) +
        selectedPanels.reduce((acc, p) => acc + toNumber(p.final_price ?? p.price, 0), 0);
      if (mrpInput) mrpInput.value = String(combined);
      syncSummary();
      toast(`Applied combined value (${formatCurrency(combined)}) to Package MRP.`, "info", 2400);
    };

    const onSubmit = async (e) => {
      e?.preventDefault?.();
      if (isSubmitting) return;

      const packageName = String(nameInput?.value || "").trim();
      const mrpVal = Number(mrpInput?.value);
      const feeVal = Number(feeInput?.value);
      const packagegender = String(genderSelect?.value || "Both").trim() || "Both";

      let firstErr = null;
      const check = (el, sel, msg) => {
        setFieldError(el, root.querySelector(sel), msg);
        if (msg && !firstErr) firstErr = el;
      };

      check(nameInput, '[data-cs-err="name"]', packageName ? "" : "Package name is required.");
      check(mrpInput, '[data-cs-err="mrp"]', isBlank(mrpInput?.value) || !Number.isFinite(mrpVal) || mrpVal < 0 ? "Enter a valid package MRP." : "");
      check(feeInput, '[data-cs-err="fee"]', isBlank(feeInput?.value) || !Number.isFinite(feeVal) || feeVal < 0 ? "Enter a valid offer price." : "");

      if (firstErr) {
        firstErr.focus();
        toast("Please complete the highlighted required fields.", "error");
        return;
      }

      if (selectedTests.length === 0 && selectedPanels.length === 0) {
        toast("Include at least one test or one panel in the package.", "warning");
        return;
      }

      const payload = {
        packageName,
        packageFee: mrpVal,
        final_price: feeVal,
        packagegender,
        packageGender: packagegender,
        testIds: selectedTests.map(idOf),
        testname: selectedTests.map((t) => t.Name),
        testSample: uniqueStrings(selectedTests.map((t) => t.sampleType)),
        pannelIds: selectedPanels.map(idOf),
        pannelname: selectedPanels.map((p) => p.name),
        pannelSample: uniqueStrings(selectedPanels.flatMap((p) => safeArray(p.sample_types)))
      };

      isSubmitting = true;
      saveBtns.forEach((btn) => {
        btn.disabled = true;
        btn.dataset.origHtml = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
      });

      try {
        await apiJson(isEdit ? api.packageEdit(pkgId) : api.packageCreate, {
          method: "POST",
          body: payload
        });
        toast(isEdit ? "Package updated successfully." : "Package created successfully.", "success");
        navigate(portalMode, "testPackage");
      } catch (err) {
        toast(err.message || "Failed to save package.", "error");
      } finally {
        isSubmitting = false;
        saveBtns.forEach((btn) => {
          btn.disabled = false;
          if (btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
        });
      }
    };

    const onGoBack = () => navigate(portalMode, "testPackage");

    formEl?.addEventListener("submit", onSubmit);
    saveBtns.forEach((b) => {
      if (b.type !== "submit") b.addEventListener("click", onSubmit);
    });
    applySumBtn?.addEventListener("click", onApplySum);
    nameInput?.addEventListener("input", syncSummary);
    mrpInput?.addEventListener("input", syncSummary);
    feeInput?.addEventListener("input", syncSummary);
    backBtn?.addEventListener("click", onGoBack);
    cancelBtn?.addEventListener("click", onGoBack);

    const cleanup = () => {
      isDisposed = true;
      testPicker.destroy();
      panelPicker.destroy();
      formEl?.removeEventListener("submit", onSubmit);
      saveBtns.forEach((b) => {
        if (b.type !== "submit") b.removeEventListener("click", onSubmit);
      });
      applySumBtn?.removeEventListener("click", onApplySum);
      nameInput?.removeEventListener("input", syncSummary);
      mrpInput?.removeEventListener("input", syncSummary);
      feeInput?.removeEventListener("input", syncSummary);
      backBtn?.removeEventListener("click", onGoBack);
      cancelBtn?.removeEventListener("click", onGoBack);
    };
    globalScope.cleanupCurrentPage = cleanup;

    const initPromise = (async () => {
      try {
        const [testRes, panelRes, pkgRes] = await Promise.all([
          apiJson(api.testsList, { method: "POST" }).catch(() => []),
          apiJson(api.panelsList, { method: "POST" }).catch(() => []),
          isEdit && pkgId ? apiJson(api.packageOne(pkgId), { method: "POST" }) : Promise.resolve(null)
        ]);
        if (isDisposed) return cleanup;

        const tests = normalizeListResponse(testRes, ["tests", "data"]).slice().sort((a, b) => (a?.order || 0) - (b?.order || 0));
        const panels = normalizeListResponse(panelRes, ["panels", "data"]).slice().sort((a, b) => (a?.order || 0) - (b?.order || 0));

        testPicker.setCatalog(tests);
        panelPicker.setCatalog(panels);

        if (isEdit && pkgRes) {
          if (nameInput) nameInput.value = pkgRes.packageName || "";
          if (mrpInput) mrpInput.value = pkgRes.packageFee ?? "";
          if (feeInput) feeInput.value = pkgRes.final_price ?? "";
          if (genderSelect) genderSelect.value = pkgRes.packagegender || pkgRes.packageGender || "Both";

          testPicker.setSelectedIds(safeArray(pkgRes.testIds).map((t) => (typeof t === "object" ? idOf(t) : String(t))));
          panelPicker.setSelectedIds(safeArray(pkgRes.pannelIds).map((p) => (typeof p === "object" ? idOf(p) : String(p))));
        }

        syncSummary();
      } catch (err) {
        toast(err.message || "Failed to load package builder.", "error");
      }
      return cleanup;
    })();

    globalScope.subpageReady = initPromise;
    return initPromise;
  }

  globalScope.CatalogStudioPages = Object.freeze({
    initTestDatabasePage,
    initTestFormPage,
    initPanelDatabasePage,
    initPanelFormPage,
    initPackageDatabasePage,
    initPackageFormPage
  });
})(typeof window !== "undefined" ? window : globalThis);
