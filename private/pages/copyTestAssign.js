// copyTestAssign.js - Enterprise Admin-to-Admin Catalog Assignment Module
(function () {
    'use strict';

    const pageRoot =
        Array.from(document.querySelectorAll('.spa-page-canvas[data-spa-page="copyTestAssign"]')).pop() ||
        document;

    const getEl = (id) =>
        pageRoot instanceof HTMLElement
            ? pageRoot.querySelector(`#${CSS.escape(id)}`) || document.getElementById(id)
            : document.getElementById(id);

    const getAll = (selector) => pageRoot.querySelectorAll(selector);

    const REQUEST_TIMEOUT_MS = 120000;
    const GATEWAY_STATUSES = [502, 503, 504];
    const RETRY_DELAYS_MS = [3000, 8000];

    const CHUNK_SIZES = {
        categoryIds: 100,
        unitIds: 100,
        sampleTypeIds: 100,
        testIds: 25,
        panelIds: 10,
        packageIds: 10
    };

    const ASSIGN_STAGES = [
        { key: 'categoryIds', countKey: 'categories', label: 'categories' },
        { key: 'unitIds', countKey: 'units', label: 'units' },
        { key: 'sampleTypeIds', countKey: 'sampleTypes', label: 'sample types' },
        { key: 'testIds', countKey: 'tests', label: 'tests' },
        { key: 'panelIds', countKey: 'panels', label: 'panels' },
        { key: 'packageIds', countKey: 'packages', label: 'packages' }
    ];

    const emptyCatalog = () => ({
        tests: [],
        panels: [],
        packages: [],
        categories: [],
        units: [],
        sampleTypes: []
    });

    let allAdmins = [];
    let sourceAdminModels = emptyCatalog();
    let targetAdminModels = emptyCatalog();
    let baseUnitIds = [];
    let baseSampleIds = [];
    let baseCategoryIds = [];

    const selectedTests = new Set();
    const selectedPanels = new Set();
    const selectedPackages = new Set();

    let testSearchQuery = '';
    let panelSearchQuery = '';
    let packageSearchQuery = '';
    let isCopying = false;
    let isDestroyed = false;

    const activeControllers = new Set();
    const activeTimers = new Set();

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function escapeRegExp(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function highlightText(text, query) {
        const safe = escapeHtml(text || '');
        if (!query || !query.trim()) return safe;
        const regex = new RegExp(`(${escapeRegExp(query.trim())})`, 'gi');
        return safe.replace(regex, '<mark style="background:#fef08a;padding:1px 2px;border-radius:2px;">$1</mark>');
    }

    function scheduleTimeout(fn, delayMs) {
        const id = window.setTimeout(() => {
            activeTimers.delete(id);
            if (!isDestroyed) fn();
        }, delayMs);
        activeTimers.add(id);
        return id;
    }

    function delay(ms) {
        return new Promise((resolve) => scheduleTimeout(resolve, ms));
    }

    function buildHttpErrorMessage(status, serverMessage, parseFailed) {
        if (GATEWAY_STATUSES.includes(status)) {
            return `Server took too long to answer (HTTP ${status}). Click Assign again to continue safely — already-copied items are skipped.`;
        }
        if (status === 401 || status === 403) {
            return 'Your session expired or you do not have permission for this action. Please log in again.';
        }
        if (serverMessage) return serverMessage;
        if (parseFailed) return `Request failed (HTTP ${status}) with a non-JSON server response.`;
        return `Request failed with status ${status}.`;
    }

    async function fetchJSON(url, options = {}) {
        const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
        const controller = new AbortController();
        activeControllers.add(controller);
        const timer = window.setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                credentials: 'include',
                ...fetchOptions,
                signal: controller.signal
            });
            const rawText = await response.text();
            let parsed = null;
            let parseFailed = false;

            if (rawText) {
                try {
                    parsed = JSON.parse(rawText);
                } catch (_) {
                    parseFailed = true;
                }
            }

            if (!response.ok) {
                const serverMessage = parsed && (parsed.message || parsed.error);
                const err = new Error(buildHttpErrorMessage(response.status, serverMessage, parseFailed));
                err.status = response.status;
                err.retryable = GATEWAY_STATUSES.includes(response.status);
                throw err;
            }

            if (parseFailed) {
                throw new Error('Server returned an unexpected response. Please refresh the page and try again.');
            }

            return parsed || {};
        } catch (error) {
            if (error?.name === 'AbortError') {
                if (isDestroyed) throw error;
                const timeoutErr = new Error(`Server did not respond within ${Math.round(timeoutMs / 1000)} seconds. Please try again.`);
                timeoutErr.retryable = true;
                throw timeoutErr;
            }
            if (error instanceof TypeError) {
                const netErr = new Error('Unable to reach the server. Please check your connection and try again.');
                netErr.retryable = true;
                throw netErr;
            }
            throw error;
        } finally {
            window.clearTimeout(timer);
            activeControllers.delete(controller);
        }
    }

    async function requestJSON(url, options = {}, retries = RETRY_DELAYS_MS.length) {
        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await fetchJSON(url, options);
            } catch (error) {
                if (isDestroyed) throw error;
                lastError = error;
                if (!error || !error.retryable || attempt >= retries) throw error;
                await delay(RETRY_DELAYS_MS[attempt]);
            }
        }
        throw lastError || new Error('Request failed.');
    }

    function formatAdminLabel(admin) {
        const username = admin?.adminDetails?.username || admin?.adminDetails?.userId?.username || '';
        const model = admin?.modelType || '';
        const hasAdminUser = Boolean(admin?.adminDetails?.userId);
        const parts = [admin?.name || 'Unnamed Lab'];
        if (username) parts.push(`@${username}`);
        if (model) parts.push(model);
        if (!hasAdminUser) parts.push('missing admin user');
        return parts.join(' • ');
    }

    function populateSelectOptions(selectEl, filterText, placeholder, disableMissingAdmin = false) {
        if (!selectEl) return;
        const previousVal = selectEl.value;
        const q = String(filterText || '').trim().toLowerCase();

        const filtered = allAdmins.filter((admin) => {
            if (!q) return true;
            const hay = `${admin?.name || ''} ${admin?.adminDetails?.username || ''} ${admin?.adminDetails?.email || ''} ${admin?.modelType || ''}`.toLowerCase();
            return hay.includes(q);
        });

        selectEl.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
        filtered.forEach((admin) => {
            const option = document.createElement('option');
            option.value = admin._id;
            option.textContent = formatAdminLabel(admin);
            if (disableMissingAdmin && !admin?.adminDetails?.userId) {
                option.disabled = true;
            }
            selectEl.appendChild(option);
        });

        if (previousVal && Array.from(selectEl.options).some((opt) => opt.value === previousVal)) {
            selectEl.value = previousVal;
        }
    }

    async function loadAdmins() {
        const countEl = getEl('adminsLoadedCount');
        try {
            const result = await requestJSON('/api/v1/user/get-tenants');
            if (isDestroyed) return;

            allAdmins = (result.data || []).slice().sort((a, b) =>
                String(a?.name || '').localeCompare(String(b?.name || ''))
            );

            populateSelectOptions(
                getEl('sourceAdminSelect'),
                getEl('sourceAdminSearch')?.value,
                'Select source admin...',
                false
            );
            populateSelectOptions(
                getEl('targetAdminSelect'),
                getEl('targetAdminSearch')?.value,
                'Select target admin...',
                true
            );

            if (countEl) {
                countEl.textContent = `${allAdmins.length} tenant(s) available`;
            }
        } catch (error) {
            if (isDestroyed) return;
            console.error('Error loading admins:', error);
            if (countEl) countEl.textContent = 'Failed to load admins';
            showMessage('error', `Failed to load admin list: ${error.message}`);
        }
    }

    async function getAdminModels(adminId) {
        const result = await requestJSON('/api/v1/user/get-admin-assigned-models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminId })
        });

        if (!result?.success) {
            throw new Error(result?.message || 'Unable to load admin catalog.');
        }

        const data = result.data || {};
        return {
            tests: Array.isArray(data.tests) ? data.tests : [],
            panels: Array.isArray(data.panels) ? data.panels : [],
            packages: Array.isArray(data.packages) ? data.packages : [],
            categories: Array.isArray(data.categories) ? data.categories : [],
            units: Array.isArray(data.units) ? data.units : [],
            sampleTypes: Array.isArray(data.sampleTypes) ? data.sampleTypes : []
        };
    }

    async function getAllAddOns() {
        try {
            const result = await requestJSON('/api/v1/user/get-all-addons', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            if (result?.success) {
                baseUnitIds = result.unitIds || [];
                baseSampleIds = result.sampleTypeIds || [];
                baseCategoryIds = result.categoryIds || [];
            }
        } catch (error) {
            if (!isDestroyed) {
                console.error('Error fetching base add-ons:', error);
            }
        }
        updateSelectionSummary();
    }

    function renderAdminSummaryBox(adminId, models, rolePrefix) {
        const previewEl = getEl(`${rolePrefix}ModelsPreview`);
        const chipsEl = getEl(`${rolePrefix}AdminMetaChips`);
        const testEl = getEl(`${rolePrefix}TestsCount`);
        const panelEl = getEl(`${rolePrefix}PanelsCount`);
        const packageEl = getEl(`${rolePrefix}PackagesCount`);
        const addonEl = getEl(`${rolePrefix}AddonCounts`);
        if (!previewEl) return;

        if (!adminId) {
            previewEl.classList.remove('is-visible');
            return;
        }

        const admin = allAdmins.find((a) => String(a._id) === String(adminId));
        if (chipsEl && admin) {
            const uname = admin.adminDetails?.username || admin.adminDetails?.userId?.username || 'N/A';
            const status = admin.status || 'active';
            chipsEl.innerHTML = `
                <span class="aa-meta-chip"><i class="fas fa-user"></i> ${escapeHtml(uname)}</span>
                <span class="aa-meta-chip"><i class="fas fa-layer-group"></i> ${escapeHtml(admin.modelType || '1layer')}</span>
                <span class="aa-meta-chip"><i class="fas fa-circle" style="font-size:0.5rem;color:${status === 'active' ? '#10b981' : '#ef4444'};"></i> ${escapeHtml(status)}</span>
            `;
        }

        const formatBreakdown = (items) => {
            const arr = Array.isArray(items) ? items : [];
            const customCount = arr.filter((item) => String(item?.createdByRole).toLowerCase() === 'admin').length;
            const baseCount = arr.length - customCount;
            if (customCount > 0) {
                return `${arr.length} <span style="font-size:0.68rem;color:#64748b;font-weight:500;">(${baseCount}+${customCount})</span>`;
            }
            return `${arr.length}`;
        };

        if (testEl) testEl.innerHTML = formatBreakdown(models.tests);
        if (panelEl) panelEl.innerHTML = formatBreakdown(models.panels);
        if (packageEl) packageEl.innerHTML = formatBreakdown(models.packages);
        if (addonEl) {
            addonEl.innerHTML = `
                <span><i class="fas fa-folder"></i> ${(models.categories || []).length} Categories</span>
                <span><i class="fas fa-ruler"></i> ${(models.units || []).length} Units</span>
                <span><i class="fas fa-vials"></i> ${(models.sampleTypes || []).length} Sample Types</span>
            `;
        }
        previewEl.classList.add('is-visible');
    }

    function buildTargetLookupSets() {
        const testOrig = new Set();
        const testNames = new Set();
        (targetAdminModels.tests || []).forEach((t) => {
            if (t.originalTestId) testOrig.add(String(t.originalTestId));
            if (t._id) testOrig.add(String(t._id));
            if (t.Name) testNames.add(String(t.Name));
        });

        const panelOrig = new Set();
        const panelNames = new Set();
        (targetAdminModels.panels || []).forEach((p) => {
            if (p.originalPanelId) panelOrig.add(String(p.originalPanelId));
            if (p._id) panelOrig.add(String(p._id));
            if (p.name) panelNames.add(String(p.name));
        });

        const pkgOrig = new Set();
        const pkgNames = new Set();
        (targetAdminModels.packages || []).forEach((pk) => {
            if (pk.originalPackageId) pkgOrig.add(String(pk.originalPackageId));
            if (pk._id) pkgOrig.add(String(pk._id));
            if (pk.packageName) pkgNames.add(String(pk.packageName));
        });

        return { testOrig, testNames, panelOrig, panelNames, pkgOrig, pkgNames };
    }

    function isTestInTarget(test, targetLookup) {
        return Boolean(
            targetLookup.testNames.has(String(test.Name)) ||
            targetLookup.testOrig.has(String(test._id)) ||
            (test.originalTestId && targetLookup.testOrig.has(String(test.originalTestId)))
        );
    }

    function isPanelInTarget(panel, targetLookup) {
        return Boolean(
            targetLookup.panelNames.has(String(panel.name)) ||
            targetLookup.panelOrig.has(String(panel._id)) ||
            (panel.originalPanelId && targetLookup.panelOrig.has(String(panel.originalPanelId)))
        );
    }

    function isPackageInTarget(pkg, targetLookup) {
        return Boolean(
            targetLookup.pkgNames.has(String(pkg.packageName)) ||
            targetLookup.pkgOrig.has(String(pkg._id)) ||
            (pkg.originalPackageId && targetLookup.pkgOrig.has(String(pkg.originalPackageId)))
        );
    }

    function extractCategoryLabel(cat) {
        if (!cat) return '';
        if (typeof cat === 'string') return cat;
        if (Array.isArray(cat)) return extractCategoryLabel(cat[0]);
        if (typeof cat === 'object') return cat.category || cat.name || cat.Name || '';
        return '';
    }

    function updateSelectAllState(checkboxClass, selectAllId) {
        const visible = getAll(`.${checkboxClass}`);
        const checked = getAll(`.${checkboxClass}:checked`);
        const selectAll = getEl(selectAllId);
        if (!selectAll) return;

        if (visible.length === 0 || checked.length === 0) {
            selectAll.indeterminate = false;
            selectAll.checked = false;
        } else if (checked.length === visible.length) {
            selectAll.indeterminate = false;
            selectAll.checked = true;
        } else {
            selectAll.indeterminate = true;
        }
    }

    function updateSelectionSummary() {
        const includeAddOns = getEl('includeAddOns')?.checked !== false;
        const mergedCatCount = new Set([
            ...baseCategoryIds.map(String),
            ...(sourceAdminModels.categories || []).map((c) => String(c._id))
        ]).size;
        const mergedUnitCount = new Set([
            ...baseUnitIds.map(String),
            ...(sourceAdminModels.units || []).map((u) => String(u._id))
        ]).size;
        const mergedSampleCount = new Set([
            ...baseSampleIds.map(String),
            ...(sourceAdminModels.sampleTypes || []).map((s) => String(s._id))
        ]).size;
        const totalAddons = includeAddOns ? mergedCatCount + mergedUnitCount + mergedSampleCount : 0;

        const elTests = getEl('selectedTestsSummary');
        const elPanels = getEl('selectedPanelsSummary');
        const elPackages = getEl('selectedPackagesSummary');
        const elAddons = getEl('selectedAddonsSummary');
        const tMeta = getEl('testsSelectedMeta');
        const pMeta = getEl('panelsSelectedMeta');
        const pkMeta = getEl('packagesSelectedMeta');

        if (elTests) elTests.textContent = `${selectedTests.size} Tests`;
        if (elPanels) elPanels.textContent = `${selectedPanels.size} Panels`;
        if (elPackages) elPackages.textContent = `${selectedPackages.size} Packages`;
        if (elAddons) elAddons.textContent = `${totalAddons} Add-ons (Cat/Unit/Sample)`;
        if (tMeta) tMeta.textContent = `${selectedTests.size} selected`;
        if (pMeta) pMeta.textContent = `${selectedPanels.size} selected`;
        if (pkMeta) pkMeta.textContent = `${selectedPackages.size} selected`;
    }

    function renderCatalogLists() {
        const hasSource = Boolean(getEl('sourceAdminSelect')?.value);
        const hasTarget = Boolean(getEl('targetAdminSelect')?.value);
        const targetLookup = buildTargetLookupSets();

        // 1. Tests
        const testsList = getEl('sourceTestsList');
        const testsBadge = getEl('testsBadge');
        const testsInfo = getEl('testsSearchInfo');
        if (testsList && testsBadge) {
            const tQuery = testSearchQuery.trim().toLowerCase();
            const filteredTests = (sourceAdminModels.tests || []).filter((t) => {
                if (!tQuery) return true;
                const catName = extractCategoryLabel(t.category).toLowerCase();
                return String(t.Name || '').toLowerCase().includes(tQuery) || catName.includes(tQuery);
            });
            testsBadge.textContent = (sourceAdminModels.tests || []).length;

            if (testsInfo) {
                testsInfo.style.display = tQuery ? 'block' : 'none';
                testsInfo.textContent = `Showing ${filteredTests.length} of ${(sourceAdminModels.tests || []).length}`;
            }

            if (!hasSource) {
                testsList.innerHTML = '<div class="aa-empty-box">Select a Source Admin above to view and pick tests.</div>';
            } else if (filteredTests.length === 0) {
                testsList.innerHTML = '<div class="aa-empty-box">No tests found.</div>';
            } else {
                testsList.innerHTML = filteredTests.map((test) => {
                    const idStr = String(test._id);
                    const checked = selectedTests.has(idStr) ? 'checked' : '';
                    const isCustom = String(test.createdByRole || '').toLowerCase() === 'admin';
                    const inTarget = hasTarget && isTestInTarget(test, targetLookup);
                    const catLabel = extractCategoryLabel(test.category);
                    return `
                        <div class="aa-item-row">
                            <input type="checkbox" class="aa-test-cb" data-id="${escapeHtml(idStr)}" ${checked}>
                            <div class="aa-item-main">
                                <div class="aa-item-title" title="${escapeHtml(test.Name)}">${highlightText(test.Name, testSearchQuery)}</div>
                                <div class="aa-item-tags">
                                    <span class="aa-tag ${isCustom ? 'aa-tag--custom' : 'aa-tag--base'}">${isCustom ? 'Admin Custom' : 'SuperAdmin Base'}</span>
                                    ${catLabel ? `<span class="aa-tag" style="background:#f1f5f9;color:#475569;">${escapeHtml(catLabel)}</span>` : ''}
                                    ${inTarget ? '<span class="aa-tag aa-tag--dup">Already in Target</span>' : ''}
                                </div>
                            </div>
                            <span class="aa-item-price">₹${Number(test.Price ?? test.final_price ?? 0)}</span>
                        </div>
                    `;
                }).join('');
            }
            updateSelectAllState('aa-test-cb', 'selectAllTests');
        }

        // 2. Panels
        const panelsList = getEl('sourcePanelsList');
        const panelsBadge = getEl('panelsBadge');
        const panelsInfo = getEl('panelsSearchInfo');
        if (panelsList && panelsBadge) {
            const pQuery = panelSearchQuery.trim().toLowerCase();
            const filteredPanels = (sourceAdminModels.panels || []).filter((p) =>
                !pQuery || String(p.name || '').toLowerCase().includes(pQuery)
            );
            panelsBadge.textContent = (sourceAdminModels.panels || []).length;

            if (panelsInfo) {
                panelsInfo.style.display = pQuery ? 'block' : 'none';
                panelsInfo.textContent = `Showing ${filteredPanels.length} of ${(sourceAdminModels.panels || []).length}`;
            }

            if (!hasSource) {
                panelsList.innerHTML = '<div class="aa-empty-box">Select a Source Admin above to view and pick panels.</div>';
            } else if (filteredPanels.length === 0) {
                panelsList.innerHTML = '<div class="aa-empty-box">No panels found.</div>';
            } else {
                panelsList.innerHTML = filteredPanels.map((panel) => {
                    const idStr = String(panel._id);
                    const checked = selectedPanels.has(idStr) ? 'checked' : '';
                    const isCustom = String(panel.createdByRole || '').toLowerCase() === 'admin';
                    const inTarget = hasTarget && isPanelInTarget(panel, targetLookup);
                    const childCount = Array.isArray(panel.testsId) ? panel.testsId.length : 0;
                    return `
                        <div class="aa-item-row">
                            <input type="checkbox" class="aa-panel-cb" data-id="${escapeHtml(idStr)}" ${checked}>
                            <div class="aa-item-main">
                                <div class="aa-item-title" title="${escapeHtml(panel.name)}">${highlightText(panel.name, panelSearchQuery)}</div>
                                <div class="aa-item-tags">
                                    <span class="aa-tag ${isCustom ? 'aa-tag--custom' : 'aa-tag--base'}">${isCustom ? 'Admin Custom' : 'SuperAdmin Base'}</span>
                                    ${childCount ? `<span class="aa-tag" style="background:#f1f5f9;color:#475569;">${childCount} tests</span>` : ''}
                                    ${inTarget ? '<span class="aa-tag aa-tag--dup">Already in Target</span>' : ''}
                                </div>
                            </div>
                            <span class="aa-item-price">₹${Number(panel.price ?? panel.final_price ?? 0)}</span>
                        </div>
                    `;
                }).join('');
            }
            updateSelectAllState('aa-panel-cb', 'selectAllPanels');
        }

        // 3. Packages
        const packagesList = getEl('sourcePackagesList');
        const packagesBadge = getEl('packagesBadge');
        const packagesInfo = getEl('packagesSearchInfo');
        if (packagesList && packagesBadge) {
            const pkQuery = packageSearchQuery.trim().toLowerCase();
            const filteredPackages = (sourceAdminModels.packages || []).filter((pk) =>
                !pkQuery || String(pk.packageName || '').toLowerCase().includes(pkQuery)
            );
            packagesBadge.textContent = (sourceAdminModels.packages || []).length;

            if (packagesInfo) {
                packagesInfo.style.display = pkQuery ? 'block' : 'none';
                packagesInfo.textContent = `Showing ${filteredPackages.length} of ${(sourceAdminModels.packages || []).length}`;
            }

            if (!hasSource) {
                packagesList.innerHTML = '<div class="aa-empty-box">Select a Source Admin above to view and pick packages.</div>';
            } else if (filteredPackages.length === 0) {
                packagesList.innerHTML = '<div class="aa-empty-box">No packages found.</div>';
            } else {
                packagesList.innerHTML = filteredPackages.map((pkg) => {
                    const idStr = String(pkg._id);
                    const checked = selectedPackages.has(idStr) ? 'checked' : '';
                    const isCustom = String(pkg.createdByRole || '').toLowerCase() === 'admin';
                    const inTarget = hasTarget && isPackageInTarget(pkg, targetLookup);
                    return `
                        <div class="aa-item-row">
                            <input type="checkbox" class="aa-package-cb" data-id="${escapeHtml(idStr)}" ${checked}>
                            <div class="aa-item-main">
                                <div class="aa-item-title" title="${escapeHtml(pkg.packageName)}">${highlightText(pkg.packageName, packageSearchQuery)}</div>
                                <div class="aa-item-tags">
                                    <span class="aa-tag ${isCustom ? 'aa-tag--custom' : 'aa-tag--base'}">${isCustom ? 'Admin Custom' : 'SuperAdmin Base'}</span>
                                    ${inTarget ? '<span class="aa-tag aa-tag--dup">Already in Target</span>' : ''}
                                </div>
                            </div>
                            <span class="aa-item-price">₹${Number(pkg.packageFee ?? pkg.final_price ?? 0)}</span>
                        </div>
                    `;
                }).join('');
            }
            updateSelectAllState('aa-package-cb', 'selectAllPackages');
        }

        updateSelectionSummary();
    }

    function selectAllFromSource() {
        selectedTests.clear();
        selectedPanels.clear();
        selectedPackages.clear();
        (sourceAdminModels.tests || []).forEach((t) => selectedTests.add(String(t._id)));
        (sourceAdminModels.panels || []).forEach((p) => selectedPanels.add(String(p._id)));
        (sourceAdminModels.packages || []).forEach((pk) => selectedPackages.add(String(pk._id)));
        renderCatalogLists();
    }

    function selectOnlyMissingInTarget() {
        if (!getEl('targetAdminSelect')?.value) {
            showMessage('error', 'Select a Target Admin first to filter missing items.');
            return;
        }
        const lookup = buildTargetLookupSets();
        selectedTests.clear();
        selectedPanels.clear();
        selectedPackages.clear();
        (sourceAdminModels.tests || []).forEach((t) => {
            if (!isTestInTarget(t, lookup)) selectedTests.add(String(t._id));
        });
        (sourceAdminModels.panels || []).forEach((p) => {
            if (!isPanelInTarget(p, lookup)) selectedPanels.add(String(p._id));
        });
        (sourceAdminModels.packages || []).forEach((pk) => {
            if (!isPackageInTarget(pk, lookup)) selectedPackages.add(String(pk._id));
        });
        renderCatalogLists();
    }

    async function onSourceAdminChange(adminId) {
        if (!adminId) {
            sourceAdminModels = emptyCatalog();
            selectedTests.clear();
            selectedPanels.clear();
            selectedPackages.clear();
            renderAdminSummaryBox('', sourceAdminModels, 'source');
            renderCatalogLists();
            return;
        }

        const testsList = getEl('sourceTestsList');
        if (testsList) {
            testsList.innerHTML = '<div class="aa-empty-box"><i class="fas fa-spinner fa-spin"></i> Loading source catalog...</div>';
        }

        try {
            sourceAdminModels = await getAdminModels(adminId);
            if (isDestroyed) return;
            renderAdminSummaryBox(adminId, sourceAdminModels, 'source');
            selectAllFromSource();
        } catch (error) {
            if (isDestroyed) return;
            sourceAdminModels = emptyCatalog();
            renderAdminSummaryBox('', sourceAdminModels, 'source');
            renderCatalogLists();
            showMessage('error', `Failed to load source admin catalog: ${error.message}`);
        }
    }

    async function onTargetAdminChange(adminId) {
        if (!adminId) {
            targetAdminModels = emptyCatalog();
            renderAdminSummaryBox('', targetAdminModels, 'target');
            renderCatalogLists();
            return;
        }

        try {
            targetAdminModels = await getAdminModels(adminId);
            if (isDestroyed) return;
            renderAdminSummaryBox(adminId, targetAdminModels, 'target');
            renderCatalogLists();
        } catch (error) {
            if (isDestroyed) return;
            targetAdminModels = emptyCatalog();
            renderAdminSummaryBox('', targetAdminModels, 'target');
            renderCatalogLists();
            showMessage('error', `Failed to load target admin catalog: ${error.message}`);
        }
    }

    function setProgress(percent, label) {
        const wrap = getEl('copyProgressWrap');
        const bar = getEl('copyProgressBar');
        const pctEl = getEl('copyProgressPercent');
        const lblEl = getEl('copyProgressLabel');
        if (!wrap) return;

        if (percent === null) {
            wrap.classList.remove('is-visible');
            return;
        }
        wrap.classList.add('is-visible');
        const clamped = Math.max(0, Math.min(100, Math.round(percent)));
        if (bar) bar.style.width = `${clamped}%`;
        if (pctEl) pctEl.textContent = `${clamped}%`;
        if (lblEl && label) lblEl.textContent = label;
    }

    async function assignModelsInBatches(payload, onProgress) {
        const assignedCounts = {
            tests: 0,
            panels: 0,
            packages: 0,
            categories: 0,
            units: 0,
            sampleTypes: 0,
            formulas: 0
        };
        const sentCounts = {
            tests: 0,
            panels: 0,
            packages: 0,
            categories: 0,
            units: 0,
            sampleTypes: 0
        };

        const totalItems = ASSIGN_STAGES.reduce((sum, stage) => {
            const arr = Array.isArray(payload[stage.key]) ? payload[stage.key] : [];
            return sum + arr.length;
        }, 0);

        let processedItems = 0;
        let isFirstRequest = true;

        for (const stage of ASSIGN_STAGES) {
            const stageIds = Array.isArray(payload[stage.key]) ? payload[stage.key] : [];
            const chunkSize = CHUNK_SIZES[stage.key] || 25;

            for (let index = 0; index < stageIds.length; index += chunkSize) {
                const chunk = stageIds.slice(index, index + chunkSize);

                if (typeof onProgress === 'function') {
                    onProgress({ label: stage.label, processed: processedItems, total: totalItems });
                }

                const requestBody = {
                    franchiseeId: payload.franchiseeId,
                    sourceAdminId: payload.sourceAdminId,
                    [stage.key]: chunk
                };
                if (isFirstRequest && payload.overwriteExisting === true) {
                    requestBody.overwriteExisting = true;
                }
                isFirstRequest = false;

                const result = await requestJSON('/api/v1/user/assign-models', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                const chunkCounts = result.assignedCounts || {};
                Object.keys(assignedCounts).forEach((key) => {
                    assignedCounts[key] += Number(chunkCounts[key] || 0);
                });

                sentCounts[stage.countKey] += chunk.length;
                processedItems += chunk.length;

                if (typeof onProgress === 'function') {
                    onProgress({ label: stage.label, processed: processedItems, total: totalItems });
                }
            }
        }

        // If user checked overwriteExisting and selected 0 items (only wipe), honor it explicitly
        if (isFirstRequest && payload.overwriteExisting === true) {
            await requestJSON('/api/v1/user/assign-models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    franchiseeId: payload.franchiseeId,
                    sourceAdminId: payload.sourceAdminId,
                    overwriteExisting: true
                })
            });
        }

        return { assignedCounts, sentCounts, totalItems };
    }

    function buildCopySummaryHtml(assignedCounts, sentCounts) {
        const labelMap = {
            tests: 'Tests',
            panels: 'Panels',
            packages: 'Packages',
            categories: 'Categories',
            units: 'Units',
            sampleTypes: 'Sample Types'
        };

        const assignedTotal = Object.keys(sentCounts).reduce((sum, key) => sum + (assignedCounts[key] || 0), 0);
        const skippedTotal = Object.keys(sentCounts).reduce(
            (sum, key) => sum + Math.max((sentCounts[key] || 0) - (assignedCounts[key] || 0), 0),
            0
        );

        if (assignedTotal === 0) {
            return `<strong>No new items added.</strong> All ${skippedTotal} selected item(s) already exist on the Target Admin.`;
        }

        const assignedParts = Object.keys(labelMap)
            .filter((key) => (assignedCounts[key] || 0) > 0)
            .map((key) => `<strong>${assignedCounts[key]}</strong> ${labelMap[key]}`);

        if (assignedCounts.formulas > 0) {
            assignedParts.push(`<strong>${assignedCounts.formulas}</strong> Formulas`);
        }

        let summary = `<strong>Assignment Complete!</strong> Copied ${assignedTotal} item(s): ${assignedParts.join(', ')}.`;
        if (skippedTotal > 0) {
            summary += `<br><span style="font-size:0.82rem;opacity:0.9;">Skipped ${skippedTotal} item(s) that were already assigned to this admin.</span>`;
        }
        return summary;
    }

    function showMessage(type, messageHtmlOrText, isRawHtml = false) {
        const successEl = getEl('copySuccess');
        const errorEl = getEl('copyError');
        const successBody = getEl('copySuccessBody');
        const errorBody = getEl('copyErrorBody');
        if (!successEl || !errorEl) return;

        successEl.classList.remove('is-visible');
        errorEl.classList.remove('is-visible');

        const content = isRawHtml ? messageHtmlOrText : escapeHtml(messageHtmlOrText);
        if (type === 'success') {
            if (successBody) successBody.innerHTML = content;
            successEl.classList.add('is-visible');
            successEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            scheduleTimeout(() => successEl.classList.remove('is-visible'), 12000);
        } else {
            if (errorBody) errorBody.innerHTML = content;
            errorEl.classList.add('is-visible');
            errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            scheduleTimeout(() => errorEl.classList.remove('is-visible'), 12000);
        }
    }

    function mergeUniqueIds(baseIds, sourceItems) {
        const seen = new Set();
        const result = [];
        (baseIds || []).forEach((id) => {
            const s = String(id || '').trim();
            if (s && !seen.has(s)) {
                seen.add(s);
                result.push(s);
            }
        });
        (sourceItems || []).forEach((item) => {
            const s = String(item?._id || '').trim();
            if (s && !seen.has(s)) {
                seen.add(s);
                result.push(s);
            }
        });
        return result;
    }

    // Event bindings
    getEl('sourceAdminSearch')?.addEventListener('input', (e) => {
        populateSelectOptions(getEl('sourceAdminSelect'), e.target.value, 'Select source admin...', false);
    });

    getEl('targetAdminSearch')?.addEventListener('input', (e) => {
        populateSelectOptions(getEl('targetAdminSelect'), e.target.value, 'Select target admin...', true);
    });

    getEl('sourceAdminSelect')?.addEventListener('change', (e) => onSourceAdminChange(e.target.value));
    getEl('targetAdminSelect')?.addEventListener('change', (e) => onTargetAdminChange(e.target.value));

    getEl('swapAdminsBtn')?.addEventListener('click', async () => {
        const srcEl = getEl('sourceAdminSelect');
        const tgtEl = getEl('targetAdminSelect');
        if (!srcEl || !tgtEl) return;

        const oldSrc = srcEl.value;
        const oldTgt = tgtEl.value;
        if (!oldSrc && !oldTgt) return;

        if (oldSrc) {
            const targetOpt = Array.from(tgtEl.options).find((o) => o.value === oldSrc);
            if (targetOpt && targetOpt.disabled) {
                showMessage('error', 'Cannot swap: selected source tenant is missing its admin user account.');
                return;
            }
        }

        srcEl.value = oldTgt;
        tgtEl.value = oldSrc;
        await Promise.all([
            onSourceAdminChange(srcEl.value),
            onTargetAdminChange(tgtEl.value)
        ]);
    });

    getEl('testsSearch')?.addEventListener('input', (e) => {
        testSearchQuery = e.target.value;
        renderCatalogLists();
    });

    getEl('panelsSearch')?.addEventListener('input', (e) => {
        panelSearchQuery = e.target.value;
        renderCatalogLists();
    });

    getEl('packagesSearch')?.addEventListener('input', (e) => {
        packageSearchQuery = e.target.value;
        renderCatalogLists();
    });

    getEl('selectAllTests')?.addEventListener('change', function () {
        getAll('.aa-test-cb').forEach((cb) => {
            cb.checked = this.checked;
            if (this.checked) selectedTests.add(cb.dataset.id);
            else selectedTests.delete(cb.dataset.id);
        });
        updateSelectionSummary();
    });

    getEl('selectAllPanels')?.addEventListener('change', function () {
        getAll('.aa-panel-cb').forEach((cb) => {
            cb.checked = this.checked;
            if (this.checked) selectedPanels.add(cb.dataset.id);
            else selectedPanels.delete(cb.dataset.id);
        });
        updateSelectionSummary();
    });

    getEl('selectAllPackages')?.addEventListener('change', function () {
        getAll('.aa-package-cb').forEach((cb) => {
            cb.checked = this.checked;
            if (this.checked) selectedPackages.add(cb.dataset.id);
            else selectedPackages.delete(cb.dataset.id);
        });
        updateSelectionSummary();
    });

    pageRoot.addEventListener('change', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.classList.contains('aa-test-cb')) {
            if (target.checked) selectedTests.add(target.dataset.id);
            else selectedTests.delete(target.dataset.id);
            updateSelectAllState('aa-test-cb', 'selectAllTests');
            updateSelectionSummary();
        } else if (target.classList.contains('aa-panel-cb')) {
            if (target.checked) selectedPanels.add(target.dataset.id);
            else selectedPanels.delete(target.dataset.id);
            updateSelectAllState('aa-panel-cb', 'selectAllPanels');
            updateSelectionSummary();
        } else if (target.classList.contains('aa-package-cb')) {
            if (target.checked) selectedPackages.add(target.dataset.id);
            else selectedPackages.delete(target.dataset.id);
            updateSelectAllState('aa-package-cb', 'selectAllPackages');
            updateSelectionSummary();
        } else if (target.id === 'includeAddOns') {
            updateSelectionSummary();
        }
    });

    getEl('selectAllCatalogBtn')?.addEventListener('click', selectAllFromSource);
    getEl('selectOnlyNewBtn')?.addEventListener('click', selectOnlyMissingInTarget);
    getEl('clearAllCatalogBtn')?.addEventListener('click', () => {
        selectedTests.clear();
        selectedPanels.clear();
        selectedPackages.clear();
        renderCatalogLists();
    });

    getEl('resetSelectionBtn')?.addEventListener('click', () => {
        if (getEl('sourceAdminSearch')) getEl('sourceAdminSearch').value = '';
        if (getEl('targetAdminSearch')) getEl('targetAdminSearch').value = '';
        testSearchQuery = '';
        panelSearchQuery = '';
        packageSearchQuery = '';
        if (getEl('testsSearch')) getEl('testsSearch').value = '';
        if (getEl('panelsSearch')) getEl('panelsSearch').value = '';
        if (getEl('packagesSearch')) getEl('packagesSearch').value = '';
        if (getEl('overwriteExisting')) getEl('overwriteExisting').checked = false;
        if (getEl('includeAddOns')) getEl('includeAddOns').checked = true;
        selectAllFromSource();
    });

    getEl('refreshCatalogsBtn')?.addEventListener('click', async () => {
        await Promise.all([loadAdmins(), getAllAddOns()]);
        const srcId = getEl('sourceAdminSelect')?.value;
        const tgtId = getEl('targetAdminSelect')?.value;
        await Promise.all([
            srcId ? onSourceAdminChange(srcId) : Promise.resolve(),
            tgtId ? onTargetAdminChange(tgtId) : Promise.resolve()
        ]);
    });

    pageRoot.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('[data-close-notice]');
        if (closeBtn) {
            const targetId = closeBtn.getAttribute('data-close-notice');
            if (targetId) getEl(targetId)?.classList.remove('is-visible');
        }
    });

    getEl('copyModelsBtn')?.addEventListener('click', async function () {
        const sourceAdminId = getEl('sourceAdminSelect')?.value;
        const targetAdminId = getEl('targetAdminSelect')?.value;

        if (!sourceAdminId) {
            showMessage('error', 'Please select a Source Admin.');
            return;
        }
        if (!targetAdminId) {
            showMessage('error', 'Please select a Target Admin.');
            return;
        }
        if (sourceAdminId === targetAdminId) {
            showMessage('error', 'Source and Target Admin cannot be the same.');
            return;
        }

        const includeAddOns = getEl('includeAddOns')?.checked !== false;
        const overwriteExisting = getEl('overwriteExisting')?.checked === true;

        const chosenTestIds = Array.from(selectedTests);
        const chosenPanelIds = Array.from(selectedPanels);
        const chosenPackageIds = Array.from(selectedPackages);

        const categoryIdsToCopy = includeAddOns
            ? mergeUniqueIds(baseCategoryIds, sourceAdminModels.categories)
            : [];
        const unitIdsToCopy = includeAddOns
            ? mergeUniqueIds(baseUnitIds, sourceAdminModels.units)
            : [];
        const sampleTypeIdsToCopy = includeAddOns
            ? mergeUniqueIds(baseSampleIds, sourceAdminModels.sampleTypes)
            : [];

        const totalSelected =
            chosenTestIds.length +
            chosenPanelIds.length +
            chosenPackageIds.length +
            categoryIdsToCopy.length +
            unitIdsToCopy.length +
            sampleTypeIdsToCopy.length;

        if (totalSelected === 0 && !overwriteExisting) {
            showMessage('error', 'Please select at least one test, panel, package, or add-on to assign.');
            return;
        }

        if (
            overwriteExisting &&
            !window.confirm(
                'Replace previously assigned SuperAdmin catalog copies on the Target Admin with this selection? Target Admin’s custom-created items will stay safe. This cannot be undone.'
            )
        ) {
            return;
        }

        if (isCopying) return;
        isCopying = true;

        const button = this;
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Assigning Catalog...';
        setProgress(5, 'Preparing catalog transfer...');

        try {
            const payload = {
                franchiseeId: targetAdminId,
                sourceAdminId,
                testIds: chosenTestIds,
                panelIds: chosenPanelIds,
                packageIds: chosenPackageIds,
                unitIds: unitIdsToCopy,
                sampleTypeIds: sampleTypeIdsToCopy,
                categoryIds: categoryIdsToCopy,
                overwriteExisting
            };

            const { assignedCounts, sentCounts } = await assignModelsInBatches(payload, ({ label, processed, total }) => {
                const pct = total > 0 ? Math.max(8, Math.round((processed / total) * 100)) : 100;
                setProgress(pct, `Copying ${label} (${processed}/${total})...`);
                button.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Copying ${label} (${processed}/${total})...`;
            });

            if (isDestroyed) return;
            setProgress(100, 'Catalog assignment complete!');
            showMessage('success', buildCopySummaryHtml(assignedCounts, sentCounts), true);

            try {
                targetAdminModels = await getAdminModels(targetAdminId);
                if (!isDestroyed) {
                    renderAdminSummaryBox(targetAdminId, targetAdminModels, 'target');
                    renderCatalogLists();
                }
            } catch (previewErr) {
                console.warn('Target preview refresh skipped:', previewErr);
            }
        } catch (error) {
            if (isDestroyed) return;
            console.error('Copy error:', error);
            showMessage('error', error.message || 'Failed to assign catalog. Please try again.');
            setProgress(null);
        } finally {
            isCopying = false;
            if (!isDestroyed) {
                button.innerHTML = originalText;
                button.disabled = false;
                scheduleTimeout(() => setProgress(null), 1800);
            }
        }
    });

    async function initializePage() {
        try {
            await Promise.all([loadAdmins(), getAllAddOns()]);
        } catch (error) {
            if (!isDestroyed) {
                console.error('Error initializing Admin Assignment page:', error);
                showMessage('error', 'Failed to initialize page. Please refresh.');
            }
        }
    }

    window.cleanupCurrentPage = () => {
        isDestroyed = true;
        activeControllers.forEach((ctrl) => {
            try { ctrl.abort(); } catch (_) {}
        });
        activeControllers.clear();
        activeTimers.forEach((id) => window.clearTimeout(id));
        activeTimers.clear();
    };

    window.subpageReady = initializePage();
})();
