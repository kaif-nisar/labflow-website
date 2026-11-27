(function (root) {
    'use strict';

    const PATIENT_TITLE_CATALOG = Object.freeze([
        { value: 'Mr.', label: 'Mr.', group: 'Male', gender: 'Male', aliases: ['mr', 'mr.', 'mister'] },
        { value: 'Master', label: 'Master', group: 'Male', gender: 'Male', aliases: ['master', 'mast', 'mast.', 'mst', 'mst.'] },
        { value: 'Shri', label: 'Shri', group: 'Male', gender: 'Male', aliases: ['shri', 'shree', 'sh', 'sh.'] },
        { value: 'Baby Boy', label: 'Baby Boy', group: 'Male', gender: 'Male', aliases: ['baby boy', 'b/o boy', 'male baby'] },

        { value: 'Mrs.', label: 'Mrs.', group: 'Female', gender: 'Female', aliases: ['mrs', 'mrs.', 'missus'] },
        { value: 'Ms.', label: 'Ms.', group: 'Female', gender: 'Female', aliases: ['ms', 'ms.'] },
        { value: 'Miss', label: 'Miss', group: 'Female', gender: 'Female', aliases: ['miss', 'miss.'] },
        { value: 'Smt.', label: 'Smt.', group: 'Female', gender: 'Female', aliases: ['smt', 'smt.', 'shrimati'] },
        { value: 'Kumari', label: 'Kumari', group: 'Female', gender: 'Female', aliases: ['kumari', 'km', 'km.'] },
        { value: 'Baby Girl', label: 'Baby Girl', group: 'Female', gender: 'Female', aliases: ['baby girl', 'b/o girl', 'female baby'] },

        { value: 'Mx.', label: 'Mx.', group: 'Other', gender: 'Other', aliases: ['mx', 'mx.'] },
        { value: 'Baby', label: 'Baby', group: 'Other', gender: 'Other', aliases: ['baby'] },
        { value: 'B/o', label: 'B/o', group: 'Other', gender: 'Other', aliases: ['b/o', 'b.o', 'b.o.', 'baby of'] },
        { value: 'Dr.', label: 'Dr.', group: 'Other', gender: 'Other', aliases: ['dr', 'dr.', 'doctor'] },
        { value: 'Prof.', label: 'Prof.', group: 'Other', gender: 'Other', aliases: ['prof', 'prof.', 'professor'] },
    ]);

    const DEFAULT_FALLBACK_TITLE = 'Mr.';
    const TITLE_USAGE_STORAGE_KEY = 'lf_patient_title_usage_v1';
    const TITLE_USAGE_MAX_WINDOW = 30;
    const MAX_PRIORITY_OPTIONS = 3;

    const TITLE_BY_KEY = new Map();
    const PREFIX_MATCHERS = [];

    PATIENT_TITLE_CATALOG.forEach((entry) => {
        const canonicalKey = entry.value.toLowerCase();
        TITLE_BY_KEY.set(canonicalKey, entry);
        TITLE_BY_KEY.set(canonicalKey.replace(/\.+$/, ''), entry);

        const allForms = new Set([entry.value, ...(entry.aliases || [])]);
        allForms.forEach((form) => {
            const cleanedForm = String(form || '').trim();
            if (!cleanedForm) return;
            TITLE_BY_KEY.set(cleanedForm.toLowerCase(), entry);
            PREFIX_MATCHERS.push({
                pattern: cleanedForm,
                entry,
            });
        });
    });

    // Longest pattern first so "Baby Girl" / "Baby Boy" / "Baby of" match before "Baby"
    PREFIX_MATCHERS.sort((a, b) => b.pattern.length - a.pattern.length);

    function escapeRegExp(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function findTitleEntry(rawTitle) {
        const normalized = String(rawTitle || '').trim().toLowerCase();
        if (!normalized) return null;
        return TITLE_BY_KEY.get(normalized) || TITLE_BY_KEY.get(normalized.replace(/\.+$/, '')) || null;
    }

    function getCanonicalTitleValue(rawTitle) {
        const entry = findTitleEntry(rawTitle);
        return entry ? entry.value : '';
    }

    function getGenderForPatientTitle(rawTitle) {
        const entry = findTitleEntry(rawTitle);
        return entry ? entry.gender : '';
    }

    function normalizePatientGenderValue(rawGender, fallback = 'Male') {
        const normalized = String(rawGender || '').trim().toLowerCase();
        if (normalized === 'male' || normalized === 'm') return 'Male';
        if (normalized === 'female' || normalized === 'f') return 'Female';
        if (normalized === 'other' || normalized === 'any' || normalized === 'o' || normalized === 'transgender') {
            return 'Other';
        }
        return fallback;
    }

    function getSafeStorage(customStorage) {
        if (customStorage) return customStorage;
        try {
            if (typeof root !== 'undefined' && root.localStorage) {
                return root.localStorage;
            }
        } catch (_err) {
            return null;
        }
        return null;
    }

    function countHistoryFrequencies(history = []) {
        const counts = {};
        history.forEach((item) => {
            const canonical = getCanonicalTitleValue(item);
            if (!canonical) return;
            counts[canonical] = (counts[canonical] || 0) + 1;
        });
        return counts;
    }

    function resolveDefaultTitleFromHistory(history = [], currentDefault = DEFAULT_FALLBACK_TITLE) {
        const counts = countHistoryFrequencies(history);
        const entries = Object.entries(counts);
        if (entries.length === 0) {
            return DEFAULT_FALLBACK_TITLE;
        }

        const safeCurrentDefault = getCanonicalTitleValue(currentDefault) || DEFAULT_FALLBACK_TITLE;
        let maxCount = 0;
        entries.forEach(([, count]) => {
            if (count > maxCount) maxCount = count;
        });

        // Tie-breaker keeps the current default stable until another title strictly leads
        if ((counts[safeCurrentDefault] || 0) === maxCount && maxCount > 0) {
            return safeCurrentDefault;
        }

        let winner = safeCurrentDefault;
        let winnerCount = -1;
        // On a tie with a brand-new leader, prefer the most recently used title in history
        for (let i = history.length - 1; i >= 0; i -= 1) {
            const title = getCanonicalTitleValue(history[i]);
            if (!title) continue;
            const c = counts[title] || 0;
            if (c === maxCount && c > winnerCount) {
                winner = title;
                winnerCount = c;
                break;
            }
        }
        return winner || DEFAULT_FALLBACK_TITLE;
    }

    function readPatientTitleUsageState(options = {}) {
        const storage = getSafeStorage(options.storage);
        const storageKey = options.storageKey || TITLE_USAGE_STORAGE_KEY;
        const maxWindow = Number.isFinite(Number(options.maxWindow)) && Number(options.maxWindow) > 0
            ? Number(options.maxWindow)
            : TITLE_USAGE_MAX_WINDOW;

        let parsed = null;
        if (storage) {
            try {
                const raw = storage.getItem(storageKey);
                if (raw) parsed = JSON.parse(raw);
            } catch (_err) {
                parsed = null;
            }
        }

        const rawHistory = Array.isArray(parsed?.history) ? parsed.history : [];
        const history = rawHistory
            .map((item) => getCanonicalTitleValue(item))
            .filter(Boolean)
            .slice(-maxWindow);

        if (history.length === 0) {
            history.push(DEFAULT_FALLBACK_TITLE);
        }

        const defaultTitle = resolveDefaultTitleFromHistory(history, parsed?.defaultTitle || DEFAULT_FALLBACK_TITLE);
        return { history, defaultTitle };
    }

    function writePatientTitleUsageState(state, options = {}) {
        const storage = getSafeStorage(options.storage);
        const storageKey = options.storageKey || TITLE_USAGE_STORAGE_KEY;
        if (!storage) return;

        try {
            storage.setItem(storageKey, JSON.stringify({
                history: state.history,
                defaultTitle: state.defaultTitle,
            }));
        } catch (_err) {
            // Ignore storage quota / privacy mode failures
        }
    }

    function getPatientTitleUsageSummary(options = {}) {
        const state = readPatientTitleUsageState(options);
        const counts = countHistoryFrequencies(state.history);

        // Most recently seen index for tie-breaking display order
        const lastSeenIndex = {};
        state.history.forEach((title, idx) => {
            lastSeenIndex[title] = idx;
        });

        const rankedTitles = Object.keys(counts).sort((a, b) => {
            if (a === state.defaultTitle && b !== state.defaultTitle) return -1;
            if (b === state.defaultTitle && a !== state.defaultTitle) return 1;
            const diff = (counts[b] || 0) - (counts[a] || 0);
            if (diff !== 0) return diff;
            return (lastSeenIndex[b] ?? -1) - (lastSeenIndex[a] ?? -1);
        });

        return {
            defaultTitle: state.defaultTitle,
            counts,
            rankedTitles,
            history: [...state.history],
        };
    }

    function recordPatientTitleUsage(rawTitle, options = {}) {
        const canonical = getCanonicalTitleValue(rawTitle);
        const current = readPatientTitleUsageState(options);
        if (!canonical) {
            return getPatientTitleUsageSummary(options);
        }

        const maxWindow = Number.isFinite(Number(options.maxWindow)) && Number(options.maxWindow) > 0
            ? Number(options.maxWindow)
            : TITLE_USAGE_MAX_WINDOW;

        const nextHistory = [...current.history, canonical].slice(-maxWindow);
        const nextDefault = resolveDefaultTitleFromHistory(nextHistory, current.defaultTitle);
        const nextState = {
            history: nextHistory,
            defaultTitle: nextDefault,
        };

        writePatientTitleUsageState(nextState, options);
        return getPatientTitleUsageSummary(options);
    }

    function getPreferredDefaultPatientTitle(options = {}) {
        return getPatientTitleUsageSummary(options).defaultTitle || DEFAULT_FALLBACK_TITLE;
    }

    function renderPatientTitleOptions(titleSelect, options = {}) {
        if (!titleSelect || typeof titleSelect.ownerDocument === 'undefined') {
            return DEFAULT_FALLBACK_TITLE;
        }

        const doc = titleSelect.ownerDocument;
        const summary = getPatientTitleUsageSummary(options);
        const maxPriority = Number.isFinite(Number(options.maxPriorityItems))
            ? Number(options.maxPriorityItems)
            : MAX_PRIORITY_OPTIONS;

        const priorityValues = summary.rankedTitles
            .filter((value) => Boolean(findTitleEntry(value)))
            .slice(0, Math.max(1, maxPriority));
        if (!priorityValues.includes(summary.defaultTitle)) {
            priorityValues.unshift(summary.defaultTitle);
        }
        const prioritySet = new Set(priorityValues);

        titleSelect.innerHTML = '';

        const makeOption = (entry) => {
            const opt = doc.createElement('option');
            opt.value = entry.value;
            opt.textContent = entry.label;
            opt.setAttribute('data-gender', entry.gender);
            return opt;
        };

        const priorityGroup = doc.createElement('optgroup');
        priorityGroup.label = '★ Most Used';
        priorityValues.forEach((value) => {
            const entry = findTitleEntry(value);
            if (entry) priorityGroup.appendChild(makeOption(entry));
        });
        titleSelect.appendChild(priorityGroup);

        const groupDefinitions = [
            { group: 'Male', label: 'Male' },
            { group: 'Female', label: 'Female' },
            { group: 'Other', label: 'Other / Neutral' },
        ];

        groupDefinitions.forEach(({ group, label }) => {
            const groupEntries = PATIENT_TITLE_CATALOG.filter(
                (entry) => entry.group === group && !prioritySet.has(entry.value)
            );
            if (groupEntries.length === 0) return;

            const optgroup = doc.createElement('optgroup');
            optgroup.label = label;
            groupEntries.forEach((entry) => optgroup.appendChild(makeOption(entry)));
            titleSelect.appendChild(optgroup);
        });

        const noTitleOpt = doc.createElement('option');
        noTitleOpt.value = '';
        noTitleOpt.textContent = 'No Title';
        titleSelect.appendChild(noTitleOpt);

        if (Object.prototype.hasOwnProperty.call(options, 'selectedValue')) {
            const desired = String(options.selectedValue ?? '');
            titleSelect.value = desired;
        } else {
            titleSelect.value = summary.defaultTitle;
        }

        return summary.defaultTitle;
    }

    function combinePatientTitleAndName(rawTitle, rawName) {
        const cleanName = String(rawName || '').replace(/\s+/g, ' ').trim();
        if (!cleanName) {
            return '';
        }

        const titleEntry = findTitleEntry(rawTitle);
        const cleanTitle = titleEntry ? titleEntry.value : String(rawTitle || '').trim();
        if (!cleanTitle) {
            return cleanName;
        }

        // Prevent duplicate prefixes if the user typed the selected title inside the name input
        const formsToStrip = titleEntry
            ? [titleEntry.value, ...(titleEntry.aliases || [])]
            : [cleanTitle];
        const sortedForms = [...new Set(formsToStrip.map((item) => String(item || '').trim()).filter(Boolean))]
            .sort((a, b) => b.length - a.length);

        let strippedName = cleanName;
        for (const form of sortedForms) {
            const baseForm = form.replace(/\.+$/, '');
            const prefixRegex = new RegExp(`^${escapeRegExp(baseForm)}\\.?\\s+(.+)$`, 'i');
            const match = strippedName.match(prefixRegex);
            if (match && match[1]) {
                strippedName = match[1].trim();
                break;
            }
        }

        return `${cleanTitle} ${strippedName}`.trim();
    }

    function splitPatientTitleAndName(fullName) {
        const cleanFullName = String(fullName || '').replace(/\s+/g, ' ').trim();
        if (!cleanFullName) {
            return { title: '', name: '' };
        }

        for (const matcher of PREFIX_MATCHERS) {
            const basePattern = matcher.pattern.replace(/\.+$/, '');
            const regex = new RegExp(`^${escapeRegExp(basePattern)}\\.?\\s+(.+)$`, 'i');
            const match = cleanFullName.match(regex);
            if (match && match[1] && match[1].trim()) {
                return {
                    title: matcher.entry.value,
                    name: match[1].trim(),
                };
            }
        }

        return {
            title: '',
            name: cleanFullName,
        };
    }

    const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function validateDoctorFormPayload(payload = {}, refs = {}) {
        const firstname = String(payload.firstname || '').trim();
        const lastname = String(payload.lastname || '').trim();
        const email = String(payload.email || '').trim();

        if (!firstname) {
            return { message: 'Doctor first name is required.', field: refs.doctorFirstname || null };
        }

        if (!lastname) {
            return { message: 'Doctor last name is required.', field: refs.doctorLastname || null };
        }

        if (email && !SIMPLE_EMAIL_REGEX.test(email)) {
            return { message: 'Please enter a valid doctor email address.', field: refs.doctorEmail || null };
        }

        return null;
    }

    function updateGenderIconState(genderValue, iconEl) {
        if (!iconEl) return;
        const normalized = normalizePatientGenderValue(genderValue, 'Other');
        iconEl.classList.remove('fa-mars', 'fa-venus', 'fa-genderless', 'fa-venus-mars');
        if (normalized === 'Male') {
            iconEl.classList.add('fa-mars');
        } else if (normalized === 'Female') {
            iconEl.classList.add('fa-venus');
        } else {
            iconEl.classList.add('fa-venus-mars');
        }
    }

    function bindPatientTitleGenderSync(options = {}) {
        const {
            titleSelect,
            genderSelect,
            nameInput,
            genderIcon,
            genderGroup,
            mode = 'new',
            storageKey,
            storage,
        } = options;

        if (!titleSelect || !genderSelect) {
            return {
                syncFromTitle: function () {},
                hydratePatientFields: function () {},
                recordTitleUsage: function () {},
                refreshPriorityOptions: function () {},
            };
        }

        let userManuallyEditedGender = false;
        let userManuallyEditedTitle = false;
        let pulseTimer = null;

        function pulseGenderControl() {
            if (!genderGroup) return;
            genderGroup.classList.remove('is-auto-synced');
            void genderGroup.offsetWidth;
            genderGroup.classList.add('is-auto-synced');
            if (pulseTimer) {
                clearTimeout(pulseTimer);
            }
            pulseTimer = setTimeout(() => {
                genderGroup.classList.remove('is-auto-synced');
            }, 950);
        }

        function ensureGenderOptionExists(value) {
            const normalized = normalizePatientGenderValue(value, 'Other');
            const exists = Array.from(genderSelect.options || []).some((opt) => opt.value === normalized);
            if (!exists) {
                const option = document.createElement('option');
                option.value = normalized;
                option.textContent = normalized;
                genderSelect.appendChild(option);
            }
            return normalized;
        }

        function syncFromTitle({ animate = true } = {}) {
            const selectedOption = titleSelect.selectedOptions?.[0];
            const mappedGender = selectedOption?.getAttribute('data-gender')
                || getGenderForPatientTitle(titleSelect.value);

            if (!mappedGender) {
                return false;
            }

            const targetValue = ensureGenderOptionExists(mappedGender);
            const changed = genderSelect.value !== targetValue;
            genderSelect.value = targetValue;
            userManuallyEditedGender = false;
            updateGenderIconState(targetValue, genderIcon);

            if (animate && changed) {
                pulseGenderControl();
            }
            return true;
        }

        function refreshPriorityOptions(selectedValue) {
            const args = { storageKey, storage };
            if (typeof selectedValue !== 'undefined') {
                args.selectedValue = selectedValue;
            }
            return renderPatientTitleOptions(titleSelect, args);
        }

        if (titleSelect.dataset.titleGenderBound !== 'true') {
            titleSelect.dataset.titleGenderBound = 'true';
            titleSelect.addEventListener('change', () => {
                userManuallyEditedTitle = true;
                syncFromTitle({ animate: true });
            });
        }

        if (genderSelect.dataset.titleGenderBound !== 'true') {
            genderSelect.dataset.titleGenderBound = 'true';
            genderSelect.addEventListener('change', () => {
                userManuallyEditedGender = true;
                updateGenderIconState(genderSelect.value, genderIcon);
            });
        }

        if (nameInput && nameInput.dataset.titleAutoSplitBound !== 'true') {
            nameInput.dataset.titleAutoSplitBound = 'true';
            nameInput.addEventListener('blur', () => {
                if (userManuallyEditedTitle && titleSelect.value) return;
                const parsed = splitPatientTitleAndName(nameInput.value);
                if (parsed.title && parsed.name) {
                    const hasOption = Array.from(titleSelect.options || []).some((opt) => opt.value === parsed.title);
                    if (hasOption) {
                        titleSelect.value = parsed.title;
                        nameInput.value = parsed.name;
                        if (!userManuallyEditedGender) {
                            syncFromTitle({ animate: true });
                        }
                    }
                }
            });
        }

        if (mode !== 'edit') {
            const defaultTitle = refreshPriorityOptions();
            titleSelect.value = defaultTitle;
            syncFromTitle({ animate: false });
        } else {
            updateGenderIconState(genderSelect.value, genderIcon);
        }

        return {
            syncFromTitle,
            refreshPriorityOptions,
            recordTitleUsage(explicitTitle) {
                const chosenTitle = typeof explicitTitle === 'string' ? explicitTitle : titleSelect.value;
                return recordPatientTitleUsage(chosenTitle, { storageKey, storage });
            },
            hydratePatientFields({ patientName, gender }) {
                const parsed = splitPatientTitleAndName(patientName);
                refreshPriorityOptions(parsed.title || '');

                if (parsed.title) {
                    const hasTitleOption = Array.from(titleSelect.options || []).some((opt) => opt.value === parsed.title);
                    if (hasTitleOption) {
                        titleSelect.value = parsed.title;
                        if (nameInput) nameInput.value = parsed.name;
                    } else if (nameInput) {
                        titleSelect.value = '';
                        nameInput.value = String(patientName || '').trim();
                    }
                } else {
                    titleSelect.value = '';
                    if (nameInput) nameInput.value = parsed.name;
                }

                const normalizedGender = ensureGenderOptionExists(gender || getGenderForPatientTitle(titleSelect.value) || 'Male');
                genderSelect.value = normalizedGender;
                userManuallyEditedGender = false;
                userManuallyEditedTitle = true;
                updateGenderIconState(normalizedGender, genderIcon);
            },
        };
    }

    root.LabflowBookingHelpers = Object.freeze({
        PATIENT_TITLE_CATALOG,
        DEFAULT_FALLBACK_TITLE,
        TITLE_USAGE_STORAGE_KEY,
        TITLE_USAGE_MAX_WINDOW,
        getGenderForPatientTitle,
        normalizePatientGenderValue,
        getPreferredDefaultPatientTitle,
        getPatientTitleUsageSummary,
        recordPatientTitleUsage,
        renderPatientTitleOptions,
        combinePatientTitleAndName,
        splitPatientTitleAndName,
        validateDoctorFormPayload,
        updateGenderIconState,
        bindPatientTitleGenderSync,
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
