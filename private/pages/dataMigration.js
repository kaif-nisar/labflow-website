/**
 * Data Migration & Offline Seed Manager Page Script
 */
(function () {
    const API_BASE = "/api/v1/offline-migration";
    let state = {
        collections: [],
        tenants: [],
        selectedCollections: new Set(),
        currentFilter: "all",
        searchQuery: "",
        isLoading: false
    };

    // Elements
    const elements = {
        btnRefresh: document.getElementById("btnRefreshStatus"),
        btnSyncSelected: document.getElementById("btnSyncSelected"),
        btnWipeJunk: document.getElementById("btnWipeJunk"),
        btnPresetMaster: document.getElementById("btnPresetMasterOnly"),
        btnSelectAll: document.getElementById("btnSelectAll"),
        btnDeselectAll: document.getElementById("btnDeselectAll"),
        tenantSelect: document.getElementById("tenantSelect"),
        tenantBadge: document.getElementById("tenantBadge"),
        chkIncludeBaseMaster: document.getElementById("chkIncludeBaseMaster"),
        chkMasterAll: document.getElementById("chkMasterAll"),
        collectionSearch: document.getElementById("collectionSearch"),
        filterChips: document.querySelectorAll(".dm-chip"),
        tableBody: document.getElementById("collectionsTableBody"),
        progressBox: document.getElementById("dmProgressBox"),
        progressText: document.getElementById("dmProgressText"),
        progressFill: document.getElementById("dmProgressFill"),
        progressPercent: document.getElementById("dmProgressPercent"),
        // KPIs
        kpiOnlineCount: document.getElementById("kpiOnlineCount"),
        kpiOnlineSub: document.getElementById("kpiOnlineSub"),
        kpiOfflineSize: document.getElementById("kpiOfflineSize"),
        kpiOfflineDocs: document.getElementById("kpiOfflineDocs"),
        kpiHealthStatus: document.getElementById("kpiHealthStatus"),
        kpiJunkWarning: document.getElementById("kpiJunkWarning"),
        kpiLastBackup: document.getElementById("kpiLastBackup"),
        // Modal
        summaryModal: document.getElementById("summaryModal"),
        summaryModalTitle: document.getElementById("summaryModalTitle"),
        summaryModalBody: document.getElementById("summaryModalBody"),
        btnCloseSummaryModal: document.getElementById("btnCloseSummaryModal"),
        btnOkSummaryModal: document.getElementById("btnOkSummaryModal")
    };

    // Format date string
    function formatDate(isoStr) {
        if (!isoStr) return "Never";
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });
        } catch {
            return isoStr;
        }
    }

    // Set Loading / Progress
    function showProgress(text, percent = 50) {
        if (elements.progressBox) {
            elements.progressBox.style.display = "block";
            elements.progressText.innerText = text;
            elements.progressFill.style.width = `${percent}%`;
            elements.progressPercent.innerText = `${percent}%`;
        }
    }

    function hideProgress() {
        if (elements.progressBox) {
            elements.progressBox.style.display = "none";
            elements.progressFill.style.width = "0%";
            elements.progressPercent.innerText = "0%";
        }
    }

    // Fetch and render data migration status
    async function loadStatus() {
        state.isLoading = true;
        showProgress("Fetching database & offline seed status...", 30);

        try {
            const res = await fetch(`${API_BASE}/status`, {
                headers: { "Accept": "application/json" }
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.message || "Failed to load migration status");
            }

            const info = data.data;
            state.collections = info.collections || [];
            state.tenants = info.tenants || [];

            // Update KPIs
            elements.kpiOnlineCount.innerText = `${info.collections.filter(c => c.existsOnline).length} Cols`;
            elements.kpiOnlineSub.innerText = `${info.totalOnlineDocs.toLocaleString()} total documents`;

            elements.kpiOfflineSize.innerText = info.totalOfflineSize;
            elements.kpiOfflineDocs.innerText = `${info.totalOfflineDocs.toLocaleString()} documents in seed`;

            if (info.junkCollectionsCount === 0) {
                elements.kpiHealthStatus.innerHTML = `<span style="color: #10b981;">Clean</span>`;
                elements.kpiJunkWarning.innerText = "0 junk collections detected. Ready for exe build!";
            } else {
                elements.kpiHealthStatus.innerHTML = `<span style="color: #f59e0b;">Contains Junk</span>`;
                elements.kpiJunkWarning.innerText = `⚠️ ${info.junkCollectionsCount} transactional/junk collections present.`;
            }

            elements.kpiLastBackup.innerText = formatDate(info.manifestCreatedAt);

            // Populate Tenants if not populated
            populateTenantsDropdown();

            // Default selection: if none selected, select recommended master
            if (state.selectedCollections.size === 0) {
                state.collections.forEach(col => {
                    if (col.isMaster && col.existsOnline) {
                        state.selectedCollections.add(col.name);
                    }
                });
            }

            renderTable();
        } catch (err) {
            console.error("Migration status error:", err);
            elements.tableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 30px; color: #ef4444;">
                        <i class="fas fa-exclamation-triangle fa-2x"></i>
                        <div style="margin-top: 10px; font-weight: 600;">Failed to load status: ${err.message}</div>
                    </td>
                </tr>
            `;
        } finally {
            state.isLoading = false;
            hideProgress();
        }
    }

    function populateTenantsDropdown() {
        if (!elements.tenantSelect) return;
        const currentVal = elements.tenantSelect.value;
        elements.tenantSelect.innerHTML = `<option value="">🌐 Global / System Master Data (All Base Tests & Categories)</option>`;

        state.tenants.forEach(tenant => {
            const opt = document.createElement("option");
            opt.value = tenant.tenantId;
            opt.textContent = `🏢 ${tenant.name || 'Unnamed Lab'} (${tenant.code}) - ${tenant.email || 'No email'}`;
            elements.tenantSelect.appendChild(opt);
        });

        if (currentVal) {
            elements.tenantSelect.value = currentVal;
        }
    }

    // Filter collections based on search and chip
    function getFilteredCollections() {
        return state.collections.filter(col => {
            // Category filter
            if (state.currentFilter === "master" && !col.isMaster) return false;
            if (state.currentFilter === "junk" && !col.isTransactional) return false;
            if (state.currentFilter === "outdated" && col.status === "synced") return false;

            // Search query
            if (state.searchQuery) {
                return col.name.toLowerCase().includes(state.searchQuery.toLowerCase());
            }

            return true;
        });
    }

    // Render Collections Table
    function renderTable() {
        const filtered = getFilteredCollections();

        if (filtered.length === 0) {
            elements.tableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px; color: #94a3b8;">
                        <i class="fas fa-search fa-2x"></i>
                        <div style="margin-top: 8px;">No matching collections found</div>
                    </td>
                </tr>
            `;
            return;
        }

        elements.tableBody.innerHTML = filtered.map(col => {
            const isChecked = state.selectedCollections.has(col.name);

            // Badge for Category
            let categoryBadge = "";
            if (col.isMaster) {
                categoryBadge = `<span class="dm-badge dm-badge-master"><i class="fas fa-star"></i> Master</span>`;
            } else if (col.isTransactional) {
                categoryBadge = `<span class="dm-badge dm-badge-junk"><i class="fas fa-exclamation-circle"></i> Junk/Patient</span>`;
            } else {
                categoryBadge = `<span class="dm-badge dm-badge-missing">General</span>`;
            }

            // Badge for Status
            let statusBadge = "";
            if (col.status === "synced") {
                statusBadge = `<span class="dm-badge dm-badge-synced"><i class="fas fa-check"></i> Synced</span>`;
            } else if (col.status === "different") {
                statusBadge = `<span class="dm-badge dm-badge-diff"><i class="fas fa-history"></i> Outdated</span>`;
            } else if (col.status === "missing_offline") {
                statusBadge = `<span class="dm-badge dm-badge-missing">Not in Offline</span>`;
            } else {
                statusBadge = `<span class="dm-badge dm-badge-missing">${col.status}</span>`;
            }

            // Action Buttons
            const syncBtn = `
                <button class="dm-btn dm-btn-outline dm-btn-sm btn-sync-one" data-col="${col.name}" style="padding: 4px 8px; font-size: 11px;" title="Sync only this collection">
                    <i class="fas fa-sync-alt"></i>
                </button>
            `;
            const deleteBtn = col.existsOffline ? `
                <button class="dm-btn dm-btn-danger dm-btn-sm btn-del-one" data-col="${col.name}" style="padding: 4px 8px; font-size: 11px;" title="Delete this collection from offline seed folder">
                    <i class="fas fa-trash-alt"></i>
                </button>
            ` : ``;

            return `
                <tr data-col="${col.name}">
                    <td style="text-align: center;">
                        <input type="checkbox" class="col-checkbox" data-col="${col.name}" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: #4361ee; cursor: pointer;">
                    </td>
                    <td>
                        <strong style="color: #0f172a;">${col.name}</strong>
                    </td>
                    <td>${categoryBadge}</td>
                    <td style="text-align: right; font-weight: 600;">
                        ${col.onlineCount !== null ? col.onlineCount.toLocaleString() : '<span style="color:#94a3b8;">--</span>'}
                    </td>
                    <td style="text-align: right; font-weight: 600;">
                        ${col.offlineCount !== null ? col.offlineCount.toLocaleString() : '<span style="color:#94a3b8;">--</span>'}
                    </td>
                    <td style="text-align: right; color: #64748b; font-size: 12.5px;">
                        ${col.fileSize}
                    </td>
                    <td>${statusBadge}</td>
                    <td style="text-align: center;">
                        <div style="display: flex; gap: 6px; justify-content: center;">
                            ${syncBtn}
                            ${deleteBtn}
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        // Attach Row Checkbox Events
        document.querySelectorAll(".col-checkbox").forEach(cb => {
            cb.addEventListener("change", function () {
                const colName = this.getAttribute("data-col");
                if (this.checked) {
                    state.selectedCollections.add(colName);
                } else {
                    state.selectedCollections.delete(colName);
                }
                updateMasterCheckbox();
            });
        });

        // Attach Individual Sync Events
        document.querySelectorAll(".btn-sync-one").forEach(btn => {
            btn.addEventListener("click", function () {
                const colName = this.getAttribute("data-col");
                executeSync([colName]);
            });
        });

        // Attach Individual Delete Events
        document.querySelectorAll(".btn-del-one").forEach(btn => {
            btn.addEventListener("click", function () {
                const colName = this.getAttribute("data-col");
                executeDeleteSingle(colName);
            });
        });

        updateMasterCheckbox();
    }

    function updateMasterCheckbox() {
        const filtered = getFilteredCollections();
        if (filtered.length === 0) {
            elements.chkMasterAll.checked = false;
            return;
        }
        const allChecked = filtered.every(col => state.selectedCollections.has(col.name));
        elements.chkMasterAll.checked = allChecked;
    }

    // Modal Display Helper
    function showSummaryModal(title, htmlContent) {
        if (!elements.summaryModal) return;
        elements.summaryModalTitle.innerHTML = title;
        elements.summaryModalBody.innerHTML = htmlContent;
        elements.summaryModal.classList.add("active");
    }

    function hideSummaryModal() {
        if (elements.summaryModal) {
            elements.summaryModal.classList.remove("active");
        }
    }

    // Execute Sync / Export
    async function executeSync(collectionsList) {
        if (!collectionsList || collectionsList.length === 0) {
            alert("Kripya kam se kam ek collection select karein sync karne ke liye.");
            return;
        }

        const tenantId = elements.tenantSelect ? elements.tenantSelect.value : "";
        const includeBaseMaster = elements.chkIncludeBaseMaster ? elements.chkIncludeBaseMaster.checked : true;
        const tenantName = tenantId ? (elements.tenantSelect.options[elements.tenantSelect.selectedIndex]?.text || tenantId) : "Global Master (All)";

        const confirmMsg = `Kya aap in ${collectionsList.length} collections ko offline software me export/update karna chahte hain?\n\nTarget Context: ${tenantName}`;
        if (!confirm(confirmMsg)) return;

        showProgress(`Exporting ${collectionsList.length} collections to offline seed...`, 40);

        try {
            const res = await fetch(`${API_BASE}/export`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({
                    collections: collectionsList,
                    tenantId: tenantId || null,
                    includeBaseMaster
                })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || "Failed to export collections");
            }

            const info = data.data;
            const rowsHtml = (info.collections || []).map(c => `
                <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px;">
                    <span><strong>${c.name}</strong> ${c.filterApplied ? '<span style="color:#4361ee; font-size:11px;">(Filtered)</span>' : ''}</span>
                    <span>${c.count.toLocaleString()} docs &bull; <strong>${c.fileSize}</strong></span>
                </div>
            `).join("");

            const summaryHtml = `
                <div class="dm-callout" style="margin-bottom: 16px;">
                    <i class="fas fa-check-circle fa-lg text-success"></i>
                    <div>
                        <strong>Export Successful!</strong>
                        <div style="font-size: 12.5px; margin-top: 2px;">
                            ${info.exportedCount} collections offline seed folder (<code>${info.targetDir}</code>) me update kar diye gaye hain.
                        </div>
                    </div>
                </div>
                <div style="max-height: 250px; overflow-y: auto; margin-bottom: 16px;">
                    ${rowsHtml}
                </div>
                <div style="background: #f8fafc; border-radius: 8px; padding: 12px; font-size: 12.5px; color: #475569;">
                    <i class="fas fa-info-circle text-primary"></i> <strong>Next Step:</strong>
                    Ab aap <code>C:\\Users\\kaifx\\Desktop\\labflowlis.com\\LabflowOfflineexe</code> me <code>npm run build:electron:setup</code> chala sakte hain.
                </div>
            `;

            showSummaryModal(`<i class="fas fa-check-circle text-success"></i> Data Sync Complete`, summaryHtml);
            await loadStatus();
        } catch (err) {
            console.error("Export error:", err);
            alert(`Export failed: ${err.message}`);
        } finally {
            hideProgress();
        }
    }

    // Execute Delete Single Collection
    async function executeDeleteSingle(colName) {
        if (!confirm(`Kya aap collection '${colName}' ko offline seed folder se DELETE karna chahte hain?`)) {
            return;
        }

        showProgress(`Deleting '${colName}' from offline seed...`, 60);

        try {
            const res = await fetch(`${API_BASE}/collection/${encodeURIComponent(colName)}`, {
                method: "DELETE",
                headers: { "Accept": "application/json" }
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || "Failed to delete collection");
            }

            alert(`Collection '${colName}' offline seed backup se successfully delete ho gaya.`);
            await loadStatus();
        } catch (err) {
            console.error("Delete error:", err);
            alert(`Delete failed: ${err.message}`);
        } finally {
            hideProgress();
        }
    }

    // Execute Wipe Junk
    async function executeWipeJunk() {
        const confirmMsg = `⚠️ WARNING:\nKya aap offline seed folder me se sare patient bookings, reports, old test values, aur 180MB customization files ko WIPE/DELETE karna chahte hain?\n\n(Note: Master Tests, Categories, aur Units bilkul safe rahenge!)`;
        if (!confirm(confirmMsg)) return;

        showProgress("Wiping transactional & sensitive junk collections from offline seed...", 50);

        try {
            const res = await fetch(`${API_BASE}/wipe-junk`, {
                method: "DELETE",
                headers: { "Accept": "application/json" }
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || "Failed to wipe junk data");
            }

            const info = data.data;
            const deletedList = (info.deletedCollections || []).map(c => `<li><strong>${c.name}</strong> (${c.size})</li>`).join("");

            const summaryHtml = `
                <div class="dm-callout" style="margin-bottom: 16px;">
                    <i class="fas fa-broom fa-lg text-success"></i>
                    <div>
                        <strong>Junk Data Safely Cleaned!</strong>
                        <div style="font-size: 12.5px; margin-top: 2px;">
                            ${info.count} junk collection(s) delete kiye gaye hain. Total Freed Disk Space: <strong>${info.totalFreed}</strong>.
                        </div>
                    </div>
                </div>
                <div style="font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 8px;">Removed Collections:</div>
                <ul style="font-size: 12.5px; color: #64748b; max-height: 180px; overflow-y: auto; padding-left: 20px;">
                    ${deletedList || '<li>No files needed cleanup</li>'}
                </ul>
                <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 12px; font-size: 12.5px; color: #065f46; margin-top: 14px;">
                    <i class="fas fa-check-circle"></i> Aapka offline seed backup ab bilkul fresh customer installation ke liye tayyar aur light-weight hai!
                </div>
            `;

            showSummaryModal(`<i class="fas fa-broom text-success"></i> Junk Cleanup Complete`, summaryHtml);
            await loadStatus();
        } catch (err) {
            console.error("Wipe junk error:", err);
            alert(`Wipe failed: ${err.message}`);
        } finally {
            hideProgress();
        }
    }

    // Attach Event Listeners
    function attachEvents() {
        // Refresh
        if (elements.btnRefresh) {
            elements.btnRefresh.addEventListener("click", () => loadStatus());
        }

        // Sync Selected
        if (elements.btnSyncSelected) {
            elements.btnSyncSelected.addEventListener("click", () => {
                const list = Array.from(state.selectedCollections);
                executeSync(list);
            });
        }

        // Wipe Junk
        if (elements.btnWipeJunk) {
            elements.btnWipeJunk.addEventListener("click", () => executeWipeJunk());
        }

        // Presets: Recommended Master Data
        if (elements.btnPresetMaster) {
            elements.btnPresetMaster.addEventListener("click", () => {
                state.selectedCollections.clear();
                state.collections.forEach(col => {
                    if (col.isMaster && col.existsOnline) {
                        state.selectedCollections.add(col.name);
                    }
                });
                renderTable();
            });
        }

        // Select All (Visible)
        if (elements.btnSelectAll) {
            elements.btnSelectAll.addEventListener("click", () => {
                getFilteredCollections().forEach(col => {
                    state.selectedCollections.add(col.name);
                });
                renderTable();
            });
        }

        // Deselect All
        if (elements.btnDeselectAll) {
            elements.btnDeselectAll.addEventListener("click", () => {
                getFilteredCollections().forEach(col => {
                    state.selectedCollections.delete(col.name);
                });
                renderTable();
            });
        }

        // Master Header Checkbox
        if (elements.chkMasterAll) {
            elements.chkMasterAll.addEventListener("change", function () {
                const checked = this.checked;
                getFilteredCollections().forEach(col => {
                    if (checked) {
                        state.selectedCollections.add(col.name);
                    } else {
                        state.selectedCollections.delete(col.name);
                    }
                });
                renderTable();
            });
        }

        // Tenant Dropdown change
        if (elements.tenantSelect) {
            elements.tenantSelect.addEventListener("change", function () {
                const isTenant = !!this.value;
                if (elements.tenantBadge) {
                    elements.tenantBadge.innerText = isTenant ? "Tenant Scoped Mode" : "Global Master Mode";
                    elements.tenantBadge.className = isTenant ? "dm-badge dm-badge-diff" : "dm-badge dm-badge-synced";
                }
            });
        }

        // Search Input
        if (elements.collectionSearch) {
            elements.collectionSearch.addEventListener("input", function () {
                state.searchQuery = this.value.trim();
                renderTable();
            });
        }

        // Filter Chips
        elements.filterChips.forEach(chip => {
            chip.addEventListener("click", function () {
                elements.filterChips.forEach(c => c.classList.remove("active"));
                this.classList.add("active");
                state.currentFilter = this.getAttribute("data-filter");
                renderTable();
            });
        });

        // Modal Close
        if (elements.btnCloseSummaryModal) {
            elements.btnCloseSummaryModal.addEventListener("click", hideSummaryModal);
        }
        if (elements.btnOkSummaryModal) {
            elements.btnOkSummaryModal.addEventListener("click", hideSummaryModal);
        }
        if (elements.summaryModal) {
            elements.summaryModal.addEventListener("click", (e) => {
                if (e.target === elements.summaryModal) hideSummaryModal();
            });
        }
    }

    // Initialize
    attachEvents();
    loadStatus();
})();
