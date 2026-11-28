// testAssign.js - SuperAdmin Catalog Assignment to Franchisee / Tenant
(function () {
    'use strict';

    const pageRoot =
        Array.from(document.querySelectorAll('.spa-page-canvas[data-spa-page="testAssign"]')).pop() ||
        document;

    const getEl = (id) =>
        pageRoot instanceof HTMLElement
            ? pageRoot.querySelector(`#${CSS.escape(id)}`) || document.getElementById(id)
            : document.getElementById(id);

    const getAll = (selector) => pageRoot.querySelectorAll(selector);

    let testsData = [];
    let panelsData = [];
    let packagesData = [];
    let unitIds = [];
    let sampleIds = [];
    let categoryIds = [];

    let testSearchQuery = '';
    let panelSearchQuery = '';
    let packageSearchQuery = '';

    const selectedTestIds = new Set();
    const selectedPanelIds = new Set();
    const selectedPackageIds = new Set();

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

    function scheduleTimeout(fn, delayMs) {
        const id = window.setTimeout(() => {
            activeTimers.delete(id);
            if (!isDestroyed) fn();
        }, delayMs);
        activeTimers.add(id);
        return id;
    }

    function createSignal() {
        const controller = new AbortController();
        activeControllers.add(controller);
        return {
            controller,
            cleanup: () => activeControllers.delete(controller)
        };
    }

    async function safeFetchJson(url, options = {}) {
        const { controller, cleanup } = createSignal();
        try {
            const response = await fetch(url, {
                credentials: 'include',
                ...options,
                signal: controller.signal
            });
            const rawBody = await response.text();
            let parsed = null;
            let parseError = false;
            if (rawBody) {
                try {
                    parsed = JSON.parse(rawBody);
                } catch (_) {
                    parseError = true;
                }
            }
            if (!response.ok) {
                const msg = parsed?.message || parsed?.error || `HTTP ${response.status} ${response.statusText}`;
                const err = new Error(msg);
                err.status = response.status;
                throw err;
            }
            if (parseError) {
                throw new Error(`Unexpected server response (HTTP ${response.status}).`);
            }
            return parsed;
        } finally {
            cleanup();
        }
    }

    async function loadInitialData() {
        const franchiseeSelect = getEl('franchiseeSelect');

        try {
            const [franchisees, tests, panels, packages] = await Promise.all([
                safeFetchJson('/api/v1/user/get-tenants'),
                safeFetchJson('/api/v1/user/test-database', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }),
                safeFetchJson('/api/v1/user/all-pannels', { method: 'POST' }),
                safeFetchJson('/api/v1/user/all-packages', { method: 'POST' })
            ]);

            if (isDestroyed) return;

            testsData = Array.isArray(tests) ? tests : (tests?.data || []);
            panelsData = Array.isArray(panels) ? panels : (panels?.data || []);
            packagesData = Array.isArray(packages) ? packages : (packages?.data || []);

            if (franchiseeSelect) {
                franchiseeSelect.innerHTML = '<option value="">Select a franchisee...</option>';
                const tenants = (franchisees?.data || []).slice().sort((a, b) =>
                    String(a?.name || '').localeCompare(String(b?.name || ''))
                );
                tenants.forEach((franchisee) => {
                    const option = document.createElement('option');
                    option.value = franchisee._id;
                    const uname = franchisee.adminDetails?.username || franchisee.adminDetails?.userId?.username || '';
                    const hasAdminUser = Boolean(franchisee.adminDetails?.userId);
                    option.textContent = uname
                        ? `${franchisee.name} (@${uname})${hasAdminUser ? '' : ' — admin account missing'}`
                        : `${franchisee.name}${hasAdminUser ? '' : ' — admin account missing'}`;
                    if (!hasAdminUser) option.disabled = true;
                    franchiseeSelect.appendChild(option);
                });
            }

            renderTests();
            renderPanels();
            renderPackages();
        } catch (error) {
            if (error?.name === 'AbortError' || isDestroyed) return;
            console.error('Error loading data:', error);
            showMessage('error', `Failed to load data from server: ${error.message || 'Please refresh the page.'}`);

            ['testsList', 'panelsList', 'packagesList'].forEach((id) => {
                const area = getEl(id);
                if (area) {
                    area.innerHTML = `
                        <div style="text-align: center; color: #ef4444; padding: 20px;">
                            <i class="fas fa-exclamation-triangle" style="margin-bottom: 10px;"></i>
                            <div>Failed to load data</div>
                        </div>
                    `;
                }
            });
        }
    }

    async function getAllAddON() {
        try {
            const result = await safeFetchJson('/api/v1/user/get-all-addons', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (result?.success) {
                unitIds = result.unitIds || [];
                sampleIds = result.sampleTypeIds || [];
                categoryIds = result.categoryIds || [];
                return { unitIds, sampleIds, categoryIds };
            }
            return { unitIds: [], sampleIds: [], categoryIds: [] };
        } catch (error) {
            if (error?.name === 'AbortError' || isDestroyed) return { unitIds: [], sampleIds: [], categoryIds: [] };
            console.error('Error fetching addons:', error);
            return { unitIds: [], sampleIds: [], categoryIds: [] };
        }
    }

    function filterData(data, searchQuery, nameField) {
        if (!searchQuery.trim()) return data;
        const query = searchQuery.toLowerCase().trim();
        return data.filter((item) => {
            const name = String(item?.[nameField] || '').toLowerCase();
            return name.includes(query);
        });
    }

    function highlightSearchTerm(text, searchQuery) {
        const safeText = escapeHtml(text || '');
        if (!searchQuery.trim() || !text) return safeText;
        const regex = new RegExp(`(${escapeRegExp(searchQuery.trim())})`, 'gi');
        return safeText.replace(regex, '<mark style="background-color: #fef08a; padding: 2px 0;">$1</mark>');
    }

    function renderTests(searchQuery = testSearchQuery) {
        const container = getEl('testsList');
        const countElement = getEl('testsCount');
        const searchResultElement = getEl('testsSearchResult');
        if (!container || !countElement || !searchResultElement) return;

        const filteredTests = filterData(testsData, searchQuery, 'Name');
        container.innerHTML = '';
        countElement.textContent = testsData.length;

        if (searchQuery.trim()) {
            searchResultElement.textContent = `Showing ${filteredTests.length} of ${testsData.length}`;
            searchResultElement.style.display = 'block';
        } else {
            searchResultElement.style.display = 'none';
        }

        if (filteredTests.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #64748b; padding: 20px;">
                    <i class="fas fa-search" style="margin-bottom: 10px;"></i>
                    <div>${searchQuery.trim() ? 'No tests found matching your search' : 'No tests available'}</div>
                </div>
            `;
            updateSelectAllState('test-checkbox', 'selectAllTests');
            return;
        }

        filteredTests.forEach((test) => {
            const originalIndex = testsData.findIndex((t) => t._id === test._id);
            const item = document.createElement('div');
            item.className = 'data-item';
            const checkedAttr = selectedTestIds.has(String(test._id)) ? 'checked' : '';
            item.innerHTML = `
                <input type="checkbox" class="item-checkbox test-checkbox" data-id="${escapeHtml(test._id)}" data-index="${originalIndex}" ${checkedAttr}>
                <span class="item-name" title="${escapeHtml(test.Name)}">${highlightSearchTerm(test.Name, searchQuery)}</span>
                <span class="item-price">₹${Number(test.Price ?? test.final_price ?? 0)}</span>
            `;
            container.appendChild(item);
        });

        updateSelectAllState('test-checkbox', 'selectAllTests');
    }

    function renderPanels(searchQuery = panelSearchQuery) {
        const container = getEl('panelsList');
        const countElement = getEl('panelsCount');
        const searchResultElement = getEl('panelsSearchResult');
        if (!container || !countElement || !searchResultElement) return;

        const filteredPanels = filterData(panelsData, searchQuery, 'name');
        container.innerHTML = '';
        countElement.textContent = panelsData.length;

        if (searchQuery.trim()) {
            searchResultElement.textContent = `Showing ${filteredPanels.length} of ${panelsData.length}`;
            searchResultElement.style.display = 'block';
        } else {
            searchResultElement.style.display = 'none';
        }

        if (filteredPanels.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #64748b; padding: 20px;">
                    <i class="fas fa-search" style="margin-bottom: 10px;"></i>
                    <div>${searchQuery.trim() ? 'No panels found matching your search' : 'No panels available'}</div>
                </div>
            `;
            updateSelectAllState('panel-checkbox', 'selectAllPanels');
            return;
        }

        filteredPanels.forEach((panel) => {
            const originalIndex = panelsData.findIndex((p) => p._id === panel._id);
            const item = document.createElement('div');
            item.className = 'data-item';
            const checkedAttr = selectedPanelIds.has(String(panel._id)) ? 'checked' : '';
            item.innerHTML = `
                <input type="checkbox" class="item-checkbox panel-checkbox" data-id="${escapeHtml(panel._id)}" data-index="${originalIndex}" ${checkedAttr}>
                <span class="item-name" title="${escapeHtml(panel.name)}">${highlightSearchTerm(panel.name, searchQuery)}</span>
                <span class="item-price">₹${Number(panel.price ?? panel.final_price ?? 0)}</span>
            `;
            container.appendChild(item);
        });

        updateSelectAllState('panel-checkbox', 'selectAllPanels');
    }

    function renderPackages(searchQuery = packageSearchQuery) {
        const container = getEl('packagesList');
        const countElement = getEl('packagesCount');
        const searchResultElement = getEl('packagesSearchResult');
        if (!container || !countElement || !searchResultElement) return;

        const filteredPackages = filterData(packagesData, searchQuery, 'packageName');
        container.innerHTML = '';
        countElement.textContent = packagesData.length;

        if (searchQuery.trim()) {
            searchResultElement.textContent = `Showing ${filteredPackages.length} of ${packagesData.length}`;
            searchResultElement.style.display = 'block';
        } else {
            searchResultElement.style.display = 'none';
        }

        if (filteredPackages.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #64748b; padding: 20px;">
                    <i class="fas fa-search" style="margin-bottom: 10px;"></i>
                    <div>${searchQuery.trim() ? 'No packages found matching your search' : 'No packages available'}</div>
                </div>
            `;
            updateSelectAllState('package-checkbox', 'selectAllPackages');
            return;
        }

        filteredPackages.forEach((pkg) => {
            const originalIndex = packagesData.findIndex((p) => p._id === pkg._id);
            const item = document.createElement('div');
            item.className = 'data-item';
            const checkedAttr = selectedPackageIds.has(String(pkg._id)) ? 'checked' : '';
            item.innerHTML = `
                <input type="checkbox" class="item-checkbox package-checkbox" data-id="${escapeHtml(pkg._id)}" data-index="${originalIndex}" ${checkedAttr}>
                <span class="item-name" title="${escapeHtml(pkg.packageName)}">${highlightSearchTerm(pkg.packageName, searchQuery)}</span>
                <span class="item-price">₹${Number(pkg.packageFee ?? pkg.final_price ?? 0)}</span>
            `;
            container.appendChild(item);
        });

        updateSelectAllState('package-checkbox', 'selectAllPackages');
    }

    function updateSelectAllState(checkboxClass, selectAllId) {
        const allVisibleCheckboxes = getAll(`.${checkboxClass}`);
        const checkedVisibleCheckboxes = getAll(`.${checkboxClass}:checked`);
        const selectAllCheckbox = getEl(selectAllId);
        if (!selectAllCheckbox) return;

        if (allVisibleCheckboxes.length === 0 || checkedVisibleCheckboxes.length === 0) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = false;
        } else if (checkedVisibleCheckboxes.length === allVisibleCheckboxes.length) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = true;
        } else {
            selectAllCheckbox.indeterminate = true;
        }
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            window.clearTimeout(timeout);
            activeTimers.delete(timeout);
            timeout = scheduleTimeout(() => func(...args), wait);
        };
    }

    getEl('testsSearch')?.addEventListener('input', debounce((e) => {
        testSearchQuery = e.target.value;
        renderTests(testSearchQuery);
    }, 250));

    getEl('panelsSearch')?.addEventListener('input', debounce((e) => {
        panelSearchQuery = e.target.value;
        renderPanels(panelSearchQuery);
    }, 250));

    getEl('packagesSearch')?.addEventListener('input', debounce((e) => {
        packageSearchQuery = e.target.value;
        renderPackages(packageSearchQuery);
    }, 250));

    getEl('selectAllTests')?.addEventListener('change', function () {
        getAll('.test-checkbox').forEach((checkbox) => {
            checkbox.checked = this.checked;
            if (this.checked) selectedTestIds.add(checkbox.dataset.id);
            else selectedTestIds.delete(checkbox.dataset.id);
        });
    });

    getEl('selectAllPanels')?.addEventListener('change', function () {
        getAll('.panel-checkbox').forEach((checkbox) => {
            checkbox.checked = this.checked;
            if (this.checked) selectedPanelIds.add(checkbox.dataset.id);
            else selectedPanelIds.delete(checkbox.dataset.id);
        });
    });

    getEl('selectAllPackages')?.addEventListener('change', function () {
        getAll('.package-checkbox').forEach((checkbox) => {
            checkbox.checked = this.checked;
            if (this.checked) selectedPackageIds.add(checkbox.dataset.id);
            else selectedPackageIds.delete(checkbox.dataset.id);
        });
    });

    pageRoot.addEventListener('change', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.classList.contains('test-checkbox')) {
            if (target.checked) selectedTestIds.add(target.dataset.id);
            else selectedTestIds.delete(target.dataset.id);
            updateSelectAllState('test-checkbox', 'selectAllTests');
        } else if (target.classList.contains('panel-checkbox')) {
            if (target.checked) selectedPanelIds.add(target.dataset.id);
            else selectedPanelIds.delete(target.dataset.id);
            updateSelectAllState('panel-checkbox', 'selectAllPanels');
        } else if (target.classList.contains('package-checkbox')) {
            if (target.checked) selectedPackageIds.add(target.dataset.id);
            else selectedPackageIds.delete(target.dataset.id);
            updateSelectAllState('package-checkbox', 'selectAllPackages');
        }
    });

    getEl('assignModelsBtn')?.addEventListener('click', async function () {
        const franchiseeId = getEl('franchiseeSelect')?.value;
        if (!franchiseeId) {
            showMessage('error', 'Please select a franchisee.');
            return;
        }

        const selectedTests = Array.from(selectedTestIds);
        const selectedPanels = Array.from(selectedPanelIds);
        const selectedPackages = Array.from(selectedPackageIds);

        if (
            selectedTests.length === 0 &&
            selectedPanels.length === 0 &&
            selectedPackages.length === 0 &&
            unitIds.length === 0 &&
            sampleIds.length === 0 &&
            categoryIds.length === 0
        ) {
            showMessage('error', 'Please select at least one model to assign.');
            return;
        }

        const overwriteExisting = getEl('overwriteExisting')?.checked === true;
        if (
            overwriteExisting &&
            !window.confirm(
                'Overwrite the target user’s existing Super Admin catalog copies with the current selection? User-created records will be kept. This cannot be undone.'
            )
        ) {
            return;
        }

        const originalText = this.innerHTML;
        this.innerHTML = '<div class="loading-spinner"></div> Assigning...';
        this.disabled = true;

        const { controller, cleanup } = createSignal();
        try {
            const assignRes = await fetch('/api/v1/user/assign-models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                signal: controller.signal,
                body: JSON.stringify({
                    franchiseeId,
                    testIds: selectedTests,
                    panelIds: selectedPanels,
                    packageIds: selectedPackages,
                    unitIds,
                    sampleTypeIds: sampleIds,
                    categoryIds,
                    overwriteExisting
                })
            });

            const rawBody = await assignRes.text();
            let result = null;
            try {
                result = rawBody ? JSON.parse(rawBody) : {};
            } catch (_) {
                if ([502, 503, 504].includes(assignRes.status)) {
                    throw new Error(
                        `Server took too long to answer (HTTP ${assignRes.status}). Nothing is duplicated - please click Assign again to continue.`
                    );
                }
                throw new Error(`Unexpected server response (HTTP ${assignRes.status}). Please refresh the page and try again.`);
            }

            if (assignRes.ok && result.success === true) {
                const assignedCounts = result.assignedCounts || {};
                const skippedCounts = result.skippedCounts || result.details?.skippedDuplicates || {};

                const totalAssigned =
                    (assignedCounts.tests || 0) +
                    (assignedCounts.panels || 0) +
                    (assignedCounts.packages || 0) +
                    (assignedCounts.categories || 0) +
                    (assignedCounts.units || 0) +
                    (assignedCounts.sampleTypes || 0);

                const totalSkipped =
                    (skippedCounts.tests || 0) +
                    (skippedCounts.panels || 0) +
                    (skippedCounts.packages || 0) +
                    (skippedCounts.categories || 0) +
                    (skippedCounts.units || 0) +
                    (skippedCounts.sampleTypes || 0);

                let successMessage = 'Assignment completed successfully!\n\n';
                if (totalAssigned > 0) {
                    successMessage += `✅ Assigned (${totalAssigned} items):\n`;
                    if (assignedCounts.tests) successMessage += `• ${assignedCounts.tests} tests\n`;
                    if (assignedCounts.panels) successMessage += `• ${assignedCounts.panels} panels\n`;
                    if (assignedCounts.packages) successMessage += `• ${assignedCounts.packages} packages\n`;
                    if (assignedCounts.categories) successMessage += `• ${assignedCounts.categories} categories\n`;
                    if (assignedCounts.units) successMessage += `• ${assignedCounts.units} units\n`;
                    if (assignedCounts.sampleTypes) successMessage += `• ${assignedCounts.sampleTypes} sample types\n`;
                    if (assignedCounts.formulas) successMessage += `• ${assignedCounts.formulas} formulas\n`;
                }

                if (totalSkipped > 0) {
                    successMessage += `\n⚠️ Skipped (${totalSkipped} items - already assigned):\n`;
                    if (skippedCounts.tests) successMessage += `• ${skippedCounts.tests} tests\n`;
                    if (skippedCounts.panels) successMessage += `• ${skippedCounts.panels} panels\n`;
                    if (skippedCounts.packages) successMessage += `• ${skippedCounts.packages} packages\n`;
                    if (skippedCounts.categories) successMessage += `• ${skippedCounts.categories} categories\n`;
                    if (skippedCounts.units) successMessage += `• ${skippedCounts.units} units\n`;
                    if (skippedCounts.sampleTypes) successMessage += `• ${skippedCounts.sampleTypes} sample types\n`;
                }

                showMessage('success', successMessage);
                clearAllSelections();
            } else {
                const errorMessage = result.message || result.error || 'Unknown error occurred during assignment';
                showMessage('error', `Assignment failed: ${errorMessage}`);
            }
        } catch (err) {
            if (err?.name === 'AbortError' || isDestroyed) return;
            console.error('Assignment error:', err);
            showMessage('error', err.message || 'Assignment failed. Please check your connection and try again.');
        } finally {
            cleanup();
            if (!isDestroyed) {
                this.innerHTML = originalText;
                this.disabled = false;
            }
        }
    });

    function clearAllSelections() {
        selectedTestIds.clear();
        selectedPanelIds.clear();
        selectedPackageIds.clear();

        getAll('.item-checkbox').forEach((checkbox) => {
            checkbox.checked = false;
        });

        ['selectAllTests', 'selectAllPanels', 'selectAllPackages'].forEach((id) => {
            const cb = getEl(id);
            if (cb) {
                cb.checked = false;
                cb.indeterminate = false;
            }
        });

        ['testsSearch', 'panelsSearch', 'packagesSearch'].forEach((id) => {
            const input = getEl(id);
            if (input) input.value = '';
        });

        testSearchQuery = '';
        panelSearchQuery = '';
        packageSearchQuery = '';
        renderTests();
        renderPanels();
        renderPackages();
    }

    function showMessage(type, message) {
        const successEl = getEl('assignmentSuccess');
        const errorEl = getEl('assignmentError');
        if (!successEl || !errorEl) return;

        successEl.style.display = 'none';
        errorEl.style.display = 'none';

        const formattedMessage = escapeHtml(message).replace(/\n/g, '<br>');

        if (type === 'success') {
            successEl.innerHTML = `<i class="fas fa-check-circle"></i> <div>${formattedMessage}</div>`;
            successEl.style.display = 'flex';
            successEl.style.alignItems = 'flex-start';
            scheduleTimeout(() => {
                successEl.style.display = 'none';
            }, 12000);
        } else {
            errorEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> <div>${formattedMessage}</div>`;
            errorEl.style.display = 'flex';
            errorEl.style.alignItems = 'flex-start';
            scheduleTimeout(() => {
                errorEl.style.display = 'none';
            }, 10000);
        }
    }

    async function initializePage() {
        try {
            await Promise.all([loadInitialData(), getAllAddON()]);
        } catch (error) {
            if (!isDestroyed) {
                console.error('Error initializing page:', error);
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
