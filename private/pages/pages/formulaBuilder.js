(function initializeFormulaBuilder() {
    const state = {
        catalog: [],
        formulas: [],
        selectedFormulaId: null,
        expressionTokens: [],
        displayTokens: [],
    };

    const elements = {
        targetTest: document.getElementById("formula-target-test"),
        targetParameter: document.getElementById("formula-target-parameter"),
        precision: document.getElementById("formula-precision"),
        activeStatus: document.getElementById("formula-active-status"),
        manualOverride: document.getElementById("formula-manual-override"),
        search: document.getElementById("formula-search"),
        sourceList: document.getElementById("formula-source-list"),
        displayExpression: document.getElementById("formula-display-expression"),
        tokenPreview: document.getElementById("formula-token-preview"),
        tokenChipList: document.getElementById("formula-token-chip-list"),
        constant: document.getElementById("formula-constant"),
        notes: document.getElementById("formula-notes"),
        previewGrid: document.getElementById("formula-preview-grid"),
        previewResult: document.getElementById("formula-preview-result"),
        tableBody: document.getElementById("formula-table-body"),
        deleteButton: document.getElementById("formula-delete-btn"),
    };

    async function parseResponseSafely(response) {
        const rawText = await response.text();
        if (!rawText) {
            return {};
        }

        try {
            return JSON.parse(rawText);
        } catch (error) {
            return {
                message: rawText,
            };
        }
    }

    function showInlineStatus(message, type = "success") {
        if (typeof window.showStatusMessage === "function") {
            window.showStatusMessage(message, type);
            return;
        }
        console[type === "error" ? "error" : "log"](message);
    }

    function formatDate(value) {
        if (!value) return "-";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "-";

        return date.toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function getSelectedTest() {
        return state.catalog.find((test) => String(test._id) === elements.targetTest.value) || null;
    }

    function getSelectedParameterOption() {
        return getAllParameterOptions().find(
            (parameter) => parameter.parameterId === String(elements.targetParameter.value || "")
        ) || null;
    }

    function buildParameterLabel(testName, parameterName) {
        const safeTestName = String(testName || "Test").trim();
        const safeParameterName = String(parameterName || safeTestName || "Parameter").trim();

        if (!safeTestName) {
            return safeParameterName;
        }

        if (safeTestName.toLowerCase() === safeParameterName.toLowerCase()) {
            return safeParameterName;
        }

        return `${safeParameterName} (${safeTestName})`;
    }

    function getAllParameterOptions() {
        return state.catalog.flatMap((test) =>
            (test.parameters || []).map((parameter) => ({
                testId: String(test._id),
                parameterId: String(parameter._id),
                masterParameterKey: String(parameter.masterParameterKey || "").trim(),
                label: buildParameterLabel(test.name, parameter.name),
                testName: test.name,
                parameterName: parameter.name,
                valueType: String(parameter.valueType || "numeric").toLowerCase(),
                unit: parameter.unit || "",
            }))
        );
    }

    function resetBuilder() {
        state.selectedFormulaId = null;
        state.expressionTokens = [];
        state.displayTokens = [];
        elements.precision.value = "2";
        elements.activeStatus.value = "true";
        elements.manualOverride.value = "true";
        elements.notes.value = "";
        elements.constant.value = "";
        elements.displayExpression.value = "";
        elements.tokenPreview.textContent = "";
        elements.tokenChipList.innerHTML = "";
        elements.previewGrid.innerHTML = "";
        elements.previewResult.textContent = "Preview अभी run नहीं हुआ है।";
        elements.previewResult.classList.remove("is-error");
        elements.deleteButton.style.display = "none";
    }

    function renderTargetTests() {
        const currentValue = elements.targetTest.value;
        elements.targetTest.innerHTML = state.catalog
            .map((test) => `<option value="${test._id}">${test.name}</option>`)
            .join("");

        if (currentValue) {
            elements.targetTest.value = currentValue;
        }
        if (!elements.targetTest.value && state.catalog[0]) {
            elements.targetTest.value = state.catalog[0]._id;
        }

        renderTargetParameters();
    }

    function renderTargetParameters() {
        const selectedTest = getSelectedTest();
        const previousValue = elements.targetParameter.value;
        const options = selectedTest?.parameters || [];

        elements.targetParameter.innerHTML = options
            .map((parameter) => `<option value="${parameter._id}">${parameter.name}</option>`)
            .join("");

        if (previousValue) {
            elements.targetParameter.value = previousValue;
        }
        if (!elements.targetParameter.value && options[0]) {
            elements.targetParameter.value = options[0]._id;
        }
    }

    function appendToken(expressionToken, displayToken) {
        state.expressionTokens.push(expressionToken);
        state.displayTokens.push(displayToken);
        syncExpressionPreview();
    }

    function tokenizeSavedExpression(expression) {
        const source = String(expression || "").trim();
        const tokens = [];
        let index = 0;

        while (index < source.length) {
            const char = source[index];

            if (/\s/.test(char)) {
                index += 1;
                continue;
            }

            if ("+-*/(),".includes(char)) {
                tokens.push({ type: char, value: char });
                index += 1;
                continue;
            }

            if (char === "{" && source[index + 1] === "{") {
                const endIndex = source.indexOf("}}", index + 2);
                if (endIndex === -1) {
                    throw new Error("Saved formula placeholder is not closed properly.");
                }

                tokens.push({
                    type: "variable",
                    value: source.slice(index, endIndex + 2),
                    parameterId: source.slice(index + 2, endIndex).trim(),
                });
                index = endIndex + 2;
                continue;
            }

            if (/\d|\./.test(char)) {
                let endIndex = index + 1;
                while (endIndex < source.length && /[\d.]/.test(source[endIndex])) {
                    endIndex += 1;
                }

                tokens.push({
                    type: "number",
                    value: source.slice(index, endIndex),
                });
                index = endIndex;
                continue;
            }

            if (/[a-zA-Z_]/.test(char)) {
                let endIndex = index + 1;
                while (endIndex < source.length && /[a-zA-Z0-9_]/.test(source[endIndex])) {
                    endIndex += 1;
                }

                tokens.push({
                    type: "identifier",
                    value: source.slice(index, endIndex),
                });
                index = endIndex;
                continue;
            }

            tokens.push({
                type: "raw",
                value: char,
            });
            index += 1;
        }

        return tokens;
    }

    function buildDisplayTokensFromFormula(formula) {
        const dependencyLabelMap = new Map(
            (formula.dependencies || []).map((dependency) => [
                String(dependency.parameterMasterKey || dependency.parameterId),
                dependency.label || String(dependency.parameterMasterKey || dependency.parameterId),
            ])
        );

        return tokenizeSavedExpression(formula.expression).map((token, index, tokens) => {
            if (token.type === "variable") {
                return dependencyLabelMap.get(String(token.parameterId)) || token.value;
            }

            if (token.type === "identifier" && tokens[index + 1]?.type === "(") {
                return `${token.value}(`;
            }

            if (token.type === "(" && tokens[index - 1]?.type === "identifier") {
                return null;
            }

            return token.value;
        }).filter(Boolean);
    }

    function removeTokenAt(index) {
        if (index < 0 || index >= state.expressionTokens.length) return;
        state.expressionTokens.splice(index, 1);
        state.displayTokens.splice(index, 1);
        syncExpressionPreview();
    }

    function removeLastToken() {
        if (!state.expressionTokens.length) return;
        removeTokenAt(state.expressionTokens.length - 1);
    }

    function syncExpressionPreview() {
        elements.displayExpression.value = state.displayTokens.join(" ");
        elements.tokenPreview.textContent = state.expressionTokens.join(" ");
        renderTokenChips();
        renderPreviewInputs();
    }

    function renderTokenChips() {
        if (!state.displayTokens.length) {
            elements.tokenChipList.innerHTML = `<div class="formula-muted">Selected tokens यहाँ chips के रूप में दिखेंगे। किसी token को हटाने के लिए उसके cross पर click करें।</div>`;
            return;
        }

        elements.tokenChipList.innerHTML = state.displayTokens
            .map((token, index) => `
                <div class="formula-token-chip">
                    <span>${token}</span>
                    <button type="button" data-remove-token="${index}" aria-label="Remove ${token}">x</button>
                </div>
            `)
            .join("");
    }

    function renderSourceList() {
        const searchTerm = elements.search.value.trim().toLowerCase();
        const selectedTargetId = String(elements.targetParameter.value || "");
        const options = getAllParameterOptions().filter((item) => {
            if (item.parameterId === selectedTargetId) return false;
            if (!searchTerm) return true;

            return (
                item.label.toLowerCase().includes(searchTerm) ||
                item.testName.toLowerCase().includes(searchTerm) ||
                item.parameterName.toLowerCase().includes(searchTerm)
            );
        });

        if (!options.length) {
            elements.sourceList.innerHTML = `<div class="formula-muted">No matching source field found.</div>`;
            return;
        }

        elements.sourceList.innerHTML = options
            .map((item) => `
                <div class="formula-source-item">
                    <div>
                        <strong>${item.parameterName}</strong>
                        <span>${item.testName}</span>
                        <div class="formula-source-meta">
                            <span class="formula-badge ${item.valueType === "text" ? "type-text" : "type-numeric"}">${item.valueType}</span>
                            <span class="formula-badge type-unit">${item.unit || "No unit"}</span>
                        </div>
                    </div>
                    <button type="button" data-parameter-id="${item.parameterId}" data-master-parameter-key="${item.masterParameterKey}" data-label="${item.label}" data-value-type="${item.valueType}">
                        Insert
                    </button>
                </div>
            `)
            .join("");
    }

    function extractDependenciesFromExpression() {
        const expression = state.expressionTokens.join(" ");
        const matches = expression.match(/\{\{([^{}]+)\}\}/g) || [];
        return [...new Set(matches.map((match) => match.replace(/[{}]/g, "")))];
    }

    function renderPreviewInputs() {
        const dependencies = extractDependenciesFromExpression();
        if (!dependencies.length) {
            elements.previewGrid.innerHTML = `<div class="formula-preview-empty formula-muted">Preview के लिए पहले source fields add करें। फिर यहाँ sample input boxes दिखेंगे।</div>`;
            return;
        }

        const catalog = getAllParameterOptions();
        elements.previewGrid.innerHTML = dependencies
            .map((dependencyKey) => {
                const entry = catalog.find((item) => item.masterParameterKey === dependencyKey);
                const inputKey = entry?.masterParameterKey || dependencyKey;
                const label = entry?.label || dependencyKey;
                return `
                    <div class="formula-preview-row">
                        <label for="preview-${inputKey}">${label}</label>
                        <input id="preview-${inputKey}" data-preview-id="${inputKey}" type="number" step="0.01">
                    </div>
                `;
            })
            .join("");
    }

    async function runPreview() {
        const expression = state.expressionTokens.join(" ").trim();
        if (!expression) {
            showInlineStatus("Preview से पहले formula बनाइए.", "warn");
            return;
        }

        const sampleValues = {};
        document.querySelectorAll("[data-preview-id]").forEach((input) => {
            sampleValues[input.dataset.previewId] = input.value;
        });

        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/formulas/preview`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ expression, sampleValues }),
            });
            const result = await parseResponseSafely(response);

            if (!response.ok) {
                throw new Error(result.message || "Preview failed.");
            }

            elements.previewResult.textContent = `Preview Result: ${result.data.result}`;
            elements.previewResult.classList.remove("is-error");

            if (Array.isArray(result.data.missingIds) && result.data.missingIds.length) {
                showInlineStatus("कुछ dependencies के sample values missing थे, उन्हें 0 माना गया।", "info");
            }
        } catch (error) {
            elements.previewResult.textContent = error.message;
            elements.previewResult.classList.add("is-error");
        }
    }

    function buildPayload() {
        const expression = state.expressionTokens.join(" ").trim();
        const displayExpression = state.displayTokens.join(" ").trim();
        const dependencyParameterIds = extractDependenciesFromExpression();

        if (!elements.targetTest.value || !elements.targetParameter.value) {
            throw new Error("Target test और target field select करना जरूरी है।");
        }

        if (!expression) {
            throw new Error("Formula expression खाली नहीं हो सकता।");
        }

        return {
            targetTestId: elements.targetTest.value,
            targetParameterId: elements.targetParameter.value,
            targetMasterKey: getSelectedParameterOption()?.masterParameterKey || "",
            expression,
            displayExpression,
            dependencyMasterKeys: dependencyParameterIds,
            precision: Number.parseInt(elements.precision.value, 10) || 2,
            notes: elements.notes.value.trim(),
            isActive: elements.activeStatus.value === "true",
            allowManualOverride: elements.manualOverride.value === "true",
        };
    }

    async function saveFormula() {
        let payload;
        try {
            payload = buildPayload();
        } catch (error) {
            showInlineStatus(error.message, "warn");
            return;
        }

        const isEditMode = Boolean(state.selectedFormulaId);
        const url = isEditMode
            ? `${BASE_URL}/api/v1/user/formulas/${state.selectedFormulaId}`
            : `${BASE_URL}/api/v1/user/formulas`;
        const method = isEditMode ? "PUT" : "POST";

        try {
            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });
            const result = await parseResponseSafely(response);

            if (!response.ok) {
                throw new Error(result.message || "Formula save failed.");
            }

            showInlineStatus(result.message || "Formula saved successfully.");
            resetBuilder();
            await loadFormulas();
        } catch (error) {
            showInlineStatus(error.message, "error");
        }
    }

    async function deleteSelectedFormula() {
        if (!state.selectedFormulaId) return;

        const confirmed = window.confirm("क्या आप यह formula delete करना चाहते हैं?");
        if (!confirmed) return;

        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/formulas/${state.selectedFormulaId}`, {
                method: "DELETE",
            });
            const result = await parseResponseSafely(response);

            if (!response.ok) {
                throw new Error(result.message || "Formula delete failed.");
            }

            showInlineStatus(result.message || "Formula deleted successfully.");
            resetBuilder();
            await loadFormulas();
        } catch (error) {
            showInlineStatus(error.message, "error");
        }
    }

    function loadFormulaIntoBuilder(formula) {
        state.selectedFormulaId = formula._id;
        elements.targetTest.value = formula.targetTestId;
        renderTargetParameters();
        elements.targetParameter.value = formula.targetParameterId;
        elements.precision.value = String(formula.precision ?? 2);
        elements.activeStatus.value = String(Boolean(formula.isActive));
        elements.manualOverride.value = String(Boolean(formula.allowManualOverride));
        elements.notes.value = formula.notes || "";
        state.expressionTokens = tokenizeSavedExpression(formula.expression).map((token) => token.value);
        state.displayTokens = buildDisplayTokensFromFormula(formula);
        syncExpressionPreview();
        renderSourceList();
        elements.deleteButton.style.display = "inline-flex";
    }

    function renderFormulaTable() {
        if (!state.formulas.length) {
            elements.tableBody.innerHTML = `<tr><td colspan="5">कोई formula अभी saved नहीं है.</td></tr>`;
            return;
        }

        elements.tableBody.innerHTML = state.formulas
            .map((formula) => `
                <tr>
                    <td>${formula.targetLabel}</td>
                    <td><code>${formula.displayExpression}</code></td>
                    <td>
                        <span class="formula-status ${formula.isActive ? "active" : "inactive"}">
                            ${formula.isActive ? "Active" : "Inactive"}
                        </span>
                    </td>
                    <td>${formatDate(formula.updatedAt)}</td>
                    <td>
                        <button type="button" data-edit-formula="${formula._id}">Edit</button>
                    </td>
                </tr>
            `)
            .join("");
    }

    async function loadCatalog() {
        const response = await fetch(`${BASE_URL}/api/v1/user/formulas/catalog`);
        const result = await parseResponseSafely(response);
        if (!response.ok) {
            throw new Error(result.message || "Failed to load formula catalog.");
        }

        state.catalog = result.data || [];
        renderTargetTests();
        renderSourceList();
    }

    async function loadFormulas() {
        const response = await fetch(`${BASE_URL}/api/v1/user/formulas`);
        const result = await parseResponseSafely(response);
        if (!response.ok) {
            throw new Error(result.message || "Failed to load formulas.");
        }

        state.formulas = result.data || [];
        renderFormulaTable();
    }

    function bindEvents() {
        elements.targetTest.addEventListener("change", () => {
            renderTargetParameters();
            renderSourceList();
        });

        elements.targetParameter.addEventListener("change", renderSourceList);
        elements.search.addEventListener("input", renderSourceList);

        document.querySelectorAll("[data-token]").forEach((button) => {
            button.addEventListener("click", () => {
                appendToken(button.dataset.token, button.dataset.token);
            });
        });

        document.querySelectorAll("[data-function]").forEach((button) => {
            button.addEventListener("click", () => {
                const fnName = button.dataset.function;
                appendToken(`${fnName} (`, `${fnName}(`);
            });
        });

        elements.sourceList.addEventListener("click", (event) => {
            const button = event.target.closest("[data-parameter-id]");
            if (!button) return;

            if (button.dataset.valueType === "text") {
                const shouldInsert = window.confirm("This parameter uses a text reference type. Do you still want to insert it into the formula?");
                if (!shouldInsert) {
                    return;
                }
            }

            appendToken(`{{${button.dataset.masterParameterKey}}}`, button.dataset.label);
        });

        elements.tokenChipList.addEventListener("click", (event) => {
            const button = event.target.closest("[data-remove-token]");
            if (!button) return;
            removeTokenAt(Number(button.dataset.removeToken));
        });

        document.getElementById("formula-insert-constant").addEventListener("click", () => {
            const value = elements.constant.value.trim();
            if (!value) {
                showInlineStatus("Constant value enter करें.", "warn");
                return;
            }

            appendToken(value, value);
            elements.constant.value = "";
        });

        document.getElementById("formula-preview-btn").addEventListener("click", runPreview);
        document.getElementById("formula-remove-last-btn").addEventListener("click", removeLastToken);
        document.getElementById("formula-save-btn").addEventListener("click", saveFormula);
        document.getElementById("formula-reset-btn").addEventListener("click", () => {
            resetBuilder();
            renderSourceList();
        });
        elements.deleteButton.addEventListener("click", deleteSelectedFormula);

        elements.tableBody.addEventListener("click", (event) => {
            const button = event.target.closest("[data-edit-formula]");
            if (!button) return;

            const formula = state.formulas.find((item) => item._id === button.dataset.editFormula);
            if (formula) {
                loadFormulaIntoBuilder(formula);
            }
        });
    }

    async function init() {
        bindEvents();
        resetBuilder();

        try {
            await loadCatalog();
            await loadFormulas();
        } catch (error) {
            showInlineStatus(error.message, "error");
            elements.tableBody.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
        }
    }

    init();
})();
