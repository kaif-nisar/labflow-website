//copyTestAssign
// Global variables
let allAdmins = [];
let sourceAdminModels = { tests: [], panels: [], packages: [], units: [], samples: [], categories: [] };
let targetAdminModels = { tests: [], panels: [], packages: [], units: [], samples: [], categories: [] };
let unitIds = [];
let sampleIds = [];
let categoryIds = [];
let isCopying = false;

// =====================================================================================
// FIX (504 Gateway Time-out + "SyntaxError: Unexpected token '<'")
// -------------------------------------------------------------------------------------
// 1) A gateway timeout answers with an HTML error page, so response.json() used to blow
//    up with "Unexpected token '<'". Every response is now read as text and parsed
//    defensively, and gateway/network failures are retried automatically.
// 2) The copy is now sent to the server in small batches. The assign endpoint already
//    skips duplicates, so retrying or continuing is always safe. This keeps every single
//    request far below the proxy timeout and shows real progress instead of one huge
//    request that dies with a 504.
// =====================================================================================
const REQUEST_TIMEOUT_MS = 120000;          // timeout for a single API request
const GATEWAY_STATUSES = [502, 503, 504];
const RETRY_DELAYS_MS = [3000, 8000];       // retry gateway/network hiccups twice

const CHUNK_SIZES = {
    categoryIds: 100,
    unitIds: 100,
    sampleTypeIds: 100,
    testIds: 25,
    panelIds: 10,
    packageIds: 10
};

// Order matters: add-ons first, then tests, then panels, then packages (so nested
// test/panel ids can be remapped by the server while copying).
const ASSIGN_STAGES = [
    { key: "categoryIds", countKey: "categories", label: "categories" },
    { key: "unitIds", countKey: "units", label: "units" },
    { key: "sampleTypeIds", countKey: "sampleTypes", label: "sample types" },
    { key: "testIds", countKey: "tests", label: "tests" },
    { key: "panelIds", countKey: "panels", label: "panels" },
    { key: "packageIds", countKey: "packages", label: "packages" }
];

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHttpErrorMessage(status, serverMessage, parseFailed) {
    if (GATEWAY_STATUSES.includes(status)) {
        return `Server took too long to answer (HTTP ${status} Gateway Time-out). Please click Copy again to continue - items that were already copied are skipped.`;
    }

    if (status === 401 || status === 403) {
        return "Your session expired or you do not have permission for this action. Please log in again.";
    }

    if (serverMessage) {
        return serverMessage;
    }

    if (parseFailed) {
        return `Request failed with status ${status} and the server returned an unexpected (non-JSON) response.`;
    }

    return `Request failed with status ${status}.`;
}

// Reads ANY response safely - HTML error pages (502/503/504) no longer break the page.
async function fetchJSON(url, options = {}) {
    const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
        const rawText = await response.text();

        let parsed = null;
        let parseFailed = false;

        if (rawText) {
            try {
                parsed = JSON.parse(rawText);
            } catch (error) {
                parseFailed = true;
            }
        }

        if (!response.ok) {
            const serverMessage = parsed && (parsed.message || parsed.error);
            const httpError = new Error(buildHttpErrorMessage(response.status, serverMessage, parseFailed));
            httpError.status = response.status;
            httpError.retryable = GATEWAY_STATUSES.includes(response.status);
            throw httpError;
        }

        if (parseFailed) {
            throw new Error("Server returned an unexpected (non-JSON) response. Please refresh the page and try again.");
        }

        return parsed || {};

    } catch (error) {
        if (error && error.name === "AbortError") {
            const timeoutError = new Error(`Server did not respond within ${Math.round(timeoutMs / 1000)} seconds. Please try again.`);
            timeoutError.retryable = true;
            throw timeoutError;
        }

        if (error instanceof TypeError) {
            const networkError = new Error("Unable to reach the server. Please check your internet connection and try again.");
            networkError.retryable = true;
            throw networkError;
        }

        throw error;

    } finally {
        clearTimeout(timer);
    }
}

// Same as fetchJSON but retries gateway/network failures.
// Safe to retry: the assign endpoint skips models that are already assigned.
async function requestJSON(url, options = {}, retries = RETRY_DELAYS_MS.length) {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fetchJSON(url, options);
        } catch (error) {
            lastError = error;

            if (!error || !error.retryable || attempt >= retries) {
                throw error;
            }

            await delay(RETRY_DELAYS_MS[attempt]);
        }
    }

    throw lastError || new Error("Request failed.");
}

// Load initial data
async function loadAdmins() {
    try {
        const result = await requestJSON(`/api/v1/user/get-tenants`, { credentials: "include" });

        allAdmins = result.data || [];

        const sourceSelect = document.getElementById("sourceAdminSelect");
        const targetSelect = document.getElementById("targetAdminSelect");

        // Clear existing options
        sourceSelect.innerHTML = '<option value="">Select source admin...</option>';
        targetSelect.innerHTML = '<option value="">Select target admin...</option>';

        // Populate both dropdowns
        allAdmins.forEach((admin) => {
            const sourceOption = document.createElement("option");
            sourceOption.value = admin._id;
            sourceOption.textContent = admin.name;

            const targetOption = document.createElement("option");
            targetOption.value = admin._id;
            targetOption.textContent = admin.name;

            sourceSelect.appendChild(sourceOption);
            targetSelect.appendChild(targetOption);
        });

    } catch (error) {
        console.error('Error loading admins:', error);
        showMessage('error', 'Failed to load admin list: ' + error.message);
    }
}

// Get assigned models for specific admin
async function getAdminModels(adminId) {
    const empty = { tests: [], panels: [], packages: [], units: [], samples: [], categories: [] };

    try {
        const result = await requestJSON(`/api/v1/user/get-admin-assigned-models`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ adminId })
        });

        if (result.success) {
            return {
                tests: result.data?.tests || [],
                panels: result.data?.panels || [],
                packages: result.data?.packages || []
            };
        }

        console.warn('Admin models request failed:', result.message || result);
        return { tests: [], panels: [], packages: [] };

    } catch (error) {
        console.error('Error fetching admin models:', error);
        showMessage('error', 'Failed to load assigned models: ' + error.message);
        return empty;
    }
}

// FIXED: Properly update global variables
async function getAllAddON() {
    try {
        const result = await requestJSON(`/api/v1/user/get-all-addons`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include"
        });

        if (result.success) {
            // UPDATE GLOBAL VARIABLES - This was missing!
            unitIds = result.unitIds || [];
            sampleIds = result.sampleTypeIds || [];
            categoryIds = result.categoryIds || [];

            return {
                unitIds: unitIds,
                sampleIds: sampleIds,
                categoryIds: categoryIds
            };
        }

        return { unitIds: [], sampleIds: [], categoryIds: [] };

    } catch (error) {
        console.error('Error fetching addons:', error);
        showMessage('error', 'Failed to load add-ons (units / samples / categories): ' + error.message);
        return { unitIds: [], sampleIds: [], categoryIds: [] };
    }
}

// Update preview for admin models
function updateModelsPreview(models, previewId, testCountId, panelCountId, packageCountId, listId) {
    const preview = document.getElementById(previewId);
    const testCount = document.getElementById(testCountId);
    const panelCount = document.getElementById(panelCountId);
    const packageCount = document.getElementById(packageCountId);
    const list = document.getElementById(listId);

    // Compute breakdowns: prefer explicit createdByRole when present.
    const totalTests = Array.isArray(models.tests) ? models.tests.length : 0;
    const adminTests = Array.isArray(models.tests) ? models.tests.filter(t => String(t.createdByRole).toLowerCase() === 'admin').length : 0;
    const superAdminTests = totalTests - adminTests;

    const totalPanels = Array.isArray(models.panels) ? models.panels.length : 0;
    const adminPanels = Array.isArray(models.panels) ? models.panels.filter(p => String(p.createdByRole).toLowerCase() === 'admin').length : 0;
    const superAdminPanels = totalPanels - adminPanels;

    const totalPackages = Array.isArray(models.packages) ? models.packages.length : 0;
    const adminPackages = Array.isArray(models.packages) ? models.packages.filter(pk => String(pk.createdByRole).toLowerCase() === 'admin').length : 0;
    const superAdminPackages = totalPackages - adminPackages;

    // Show primary count as superAdmin (base) items, and show a small +N admin badge when applicable.
    const smallBadge = (n, label) => n > 0 ? `<span style="font-size:0.65rem;color:#6b7280;margin-left:6px">+${n} ${label}</span>` : '';

    testCount.innerHTML = `${superAdminTests}${smallBadge(adminTests, 'admin')}`;
    panelCount.innerHTML = `${superAdminPanels}${smallBadge(adminPanels, 'admin')}`;
    packageCount.innerHTML = `${superAdminPackages}${smallBadge(adminPackages, 'admin')}`;

    let listHTML = '';

    // Add tests
    models.tests.slice(0, 5).forEach(test => {
        listHTML += `<div class="preview-item">
            <span><i class="fas fa-vial"></i> ${test.Name}</span>
            <span>₹${test.Price || 0}</span>
        </div>`;
    });

    // Add panels
    models.panels.slice(0, 5).forEach(panel => {
        listHTML += `<div class="preview-item">
            <span><i class="fas fa-layer-group"></i> ${panel.name}</span>
            <span>₹${panel.price || 0}</span>
        </div>`;
    });

    // Add packages
    models.packages.slice(0, 5).forEach(pkg => {
        listHTML += `<div class="preview-item">
            <span><i class="fas fa-box"></i> ${pkg.packageName}</span>
            <span>₹${pkg.packageFee || 0}</span>
        </div>`;
    });

    const totalItems = models.tests.length + models.panels.length + models.packages.length;
    if (totalItems > 15) {
        listHTML += `<div class="preview-item" style="font-style: italic; color: #6b7280;">
            <span>... and ${totalItems - 15} more items</span>
        </div>`;
    }

    list.innerHTML = listHTML;
    preview.style.display = totalItems > 0 ? 'block' : 'none';
}

// Source admin change handler
document.getElementById("sourceAdminSelect").addEventListener("change", async function () {
    const adminId = this.value;

    if (!adminId) {
        document.getElementById("sourceModelsPreview").style.display = 'none';
        sourceAdminModels = { tests: [], panels: [], packages: [] };
        return;
    }

    // Show loading state
    document.getElementById("sourceModelsPreview").style.display = 'block';
    document.getElementById("sourceModelsList").innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    sourceAdminModels = await getAdminModels(adminId);
    updateModelsPreview(sourceAdminModels, 'sourceModelsPreview', 'sourceTestsCount', 'sourcePanelsCount', 'sourcePackagesCount', 'sourceModelsList');
});

// Target admin change handler
document.getElementById("targetAdminSelect").addEventListener("change", async function () {
    const adminId = this.value;

    if (!adminId) {
        document.getElementById("targetModelsPreview").style.display = 'none';
        targetAdminModels = { tests: [], panels: [], packages: [] };
        return;
    }

    // Show loading state
    document.getElementById("targetModelsPreview").style.display = 'block';
    document.getElementById("targetModelsList").innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    targetAdminModels = await getAdminModels(adminId);
    updateModelsPreview(targetAdminModels, 'targetModelsPreview', 'targetTestsCount', 'targetPanelsCount', 'targetPackagesCount', 'targetModelsList');
});

// Sends the copy to the server one small batch at a time. The endpoint skips duplicates,
// so retrying a failed batch (or pressing Copy again) never creates double entries.
async function assignModelsInBatches(payload, onProgress) {
    const assignedCounts = { tests: 0, panels: 0, packages: 0, categories: 0, units: 0, sampleTypes: 0, formulas: 0 };
    const sentCounts = { tests: 0, panels: 0, packages: 0, categories: 0, units: 0, sampleTypes: 0 };

    const totalItems = ASSIGN_STAGES.reduce((sum, stage) => {
        const stageIds = Array.isArray(payload[stage.key]) ? payload[stage.key] : [];
        return sum + stageIds.length;
    }, 0);

    let processedItems = 0;

    for (const stage of ASSIGN_STAGES) {
        const stageIds = Array.isArray(payload[stage.key]) ? payload[stage.key] : [];
        const chunkSize = CHUNK_SIZES[stage.key] || 25;

        for (let index = 0; index < stageIds.length; index += chunkSize) {
            const chunk = stageIds.slice(index, index + chunkSize);

            if (typeof onProgress === "function") {
                onProgress({ label: stage.label, processed: processedItems, total: totalItems });
            }

            const result = await requestJSON("/api/v1/user/assign-models", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    franchiseeId: payload.franchiseeId,
                    [stage.key]: chunk
                })
            });

            const chunkCounts = result.assignedCounts || {};
            Object.keys(assignedCounts).forEach((key) => {
                assignedCounts[key] += Number(chunkCounts[key] || 0);
            });

            sentCounts[stage.countKey] += chunk.length;
            processedItems += chunk.length;

            if (typeof onProgress === "function") {
                onProgress({ label: stage.label, processed: processedItems, total: totalItems });
            }
        }
    }

    return { assignedCounts, sentCounts, totalItems };
}

// Builds the human readable summary shown at the top of the page.
function buildCopySummary(assignedCounts, sentCounts) {
    const labelMap = {
        tests: "tests",
        panels: "panels",
        packages: "packages",
        categories: "categories",
        units: "units",
        sampleTypes: "sample types"
    };

    const assignedTotal = Object.keys(sentCounts).reduce((sum, key) => sum + (assignedCounts[key] || 0), 0);

    let skippedTotal = 0;
    Object.keys(sentCounts).forEach((key) => {
        skippedTotal += Math.max((sentCounts[key] || 0) - (assignedCounts[key] || 0), 0);
    });

    if (assignedTotal === 0) {
        return `Nothing new to copy - all ${skippedTotal} selected item(s) already exist for this admin.`;
    }

    const assignedParts = Object.keys(labelMap)
        .filter((key) => (assignedCounts[key] || 0) > 0)
        .map((key) => `${assignedCounts[key]} ${labelMap[key]}`);

    let summary = `Successfully assigned ${assignedTotal} item(s) - ${assignedParts.join(", ")}.`;

    if (skippedTotal > 0) {
        summary += ` Skipped ${skippedTotal} item(s) that already existed.`;
    }

    return summary;
}

// Copy models functionality
document.getElementById("copyModelsBtn").addEventListener("click", async function () {
    const sourceAdminId = document.getElementById("sourceAdminSelect").value;
    const targetAdminId = document.getElementById("targetAdminSelect").value;

    if (!sourceAdminId) {
        showMessage('error', 'Please select a source admin.');
        return;
    }

    if (!targetAdminId) {
        showMessage('error', 'Please select a target admin.');
        return;
    }

    if (sourceAdminId === targetAdminId) {
        showMessage('error', 'Source and target admin cannot be the same.');
        return;
    }

    const totalModels = sourceAdminModels.tests.length + sourceAdminModels.panels.length + sourceAdminModels.packages.length;

    if (totalModels === 0) {
        showMessage('error', 'Source admin has no models to copy.');
        return;
    }

    // Guard against double clicks - every click would start another long running copy
    if (isCopying) {
        return;
    }
    isCopying = true;

    const button = this;
    const originalText = button.innerHTML;
    button.innerHTML = '<div class="loading-spinner"></div> Preparing copy...';
    button.disabled = true;

    try {
        const payload = {
            franchiseeId: targetAdminId,
            testIds: sourceAdminModels.tests.map(test => test._id),
            panelIds: sourceAdminModels.panels.map(panel => panel._id),
            packageIds: sourceAdminModels.packages.map(pkg => pkg._id),
            unitIds: unitIds,
            sampleTypeIds: sampleIds,
            categoryIds: categoryIds
        };

        const { assignedCounts, sentCounts } = await assignModelsInBatches(payload, ({ label, processed, total }) => {
            button.innerHTML = `<div class="loading-spinner"></div> Copying ${label} (${processed}/${total})...`;
        });

        showMessage('success', buildCopySummary(assignedCounts, sentCounts));

        // Refresh target admin preview - a preview failure must never hide the copy result
        try {
            targetAdminModels = await getAdminModels(targetAdminId);
            updateModelsPreview(targetAdminModels, 'targetModelsPreview', 'targetTestsCount', 'targetPanelsCount', 'targetPackagesCount', 'targetModelsList');
        } catch (previewError) {
            console.warn('Target preview refresh failed:', previewError);
        }

    } catch (error) {
        console.error('Copy error:', error);
        showMessage('error', error.message || 'Copy failed. Please try again.');

    } finally {
        isCopying = false;
        button.innerHTML = originalText;
        button.disabled = false;
    }
});

// Utility function to show messages
function showMessage(type, message) {
    const successEl = document.getElementById("copySuccess");
    const errorEl = document.getElementById("copyError");

    successEl.style.display = "none";
    errorEl.style.display = "none";

    if (type === 'success') {
        successEl.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        successEl.style.display = "flex";
        setTimeout(() => successEl.style.display = "none", 8000);
    } else {
        errorEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
        errorEl.style.display = "flex";
        setTimeout(() => errorEl.style.display = "none", 10000);
    }
}

// FIXED: Properly initialize with await
async function initializePage() {
    try {
        await loadAdmins();
        await getAllAddON(); // This will now properly set global variables
        console.log('Page initialized successfully');
    } catch (error) {
        console.error('Error initializing page:', error);
        showMessage('error', 'Failed to initialize page. Please refresh.');
    }
}

// Initialize page properly
initializePage();
