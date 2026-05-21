(function () {
    const COLLECTION_BY_TYPE = {
        test: 'testSchema',
        panel: 'addPannel',
        package: 'Package',
    };

    const TYPE_BY_COLLECTION = {
        testSchema: 'test',
        addPannel: 'panel',
        Package: 'package',
    };

    const GROUP_SCOPE_LABEL = {
        common: 'Common',
        doctor: 'Doctor',
    };

    const BOOKING_CATALOG_API_MODE_KEY = '__labflowBookingCatalogApiMode';

    function getElementByIds(ids) {
        for (const id of ids) {
            const element = document.getElementById(id);
            if (element) {
                return element;
            }
        }

        return null;
    }

    function toId(value) {
        if (!value) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'object' && value._id) return toId(value._id);
        if (typeof value === 'object' && value.id) return toId(value.id);
        return String(value);
    }

    function toNumber(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function normalizeItemType(value) {
        if (!value) return null;

        const normalized = String(value).trim().toLowerCase();
        if (normalized === 'test' || normalized === 'testschema') return 'test';
        if (normalized === 'panel' || normalized === 'panels' || normalized === 'pannel' || normalized === 'addpannel') return 'panel';
        if (normalized === 'package' || normalized === 'packages') return 'package';
        return TYPE_BY_COLLECTION[value] || null;
    }

    function buildItemKey(itemType, itemId) {
        return `${normalizeItemType(itemType)}:${toId(itemId)}`;
    }

    function ensureArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function getUniqueStrings(values = []) {
        return [...new Set(
            ensureArray(values)
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        )];
    }

    function normalizeSampleTypeList(value) {
        if (Array.isArray(value)) {
            return getUniqueStrings(value);
        }

        const text = String(value || '').trim();
        if (!text) {
            return [];
        }

        return getUniqueStrings(text.split(','));
    }

    function dedupeRowIds(ids = []) {
        const seen = new Set();

        return ensureArray(ids).reduce((accumulator, entry) => {
            const entryId = toId(entry?.id);
            const collectionName = String(entry?.collectionName || '').trim();
            if (!entryId || !collectionName) {
                return accumulator;
            }

            const key = `${collectionName}:${entryId}`;
            if (seen.has(key)) {
                return accumulator;
            }

            seen.add(key);
            accumulator.push({
                id: entryId,
                collectionName,
            });
            return accumulator;
        }, []);
    }

    function getArrayResponse(payload) {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.message)) return payload.message;
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload?.items)) return payload.items;
        return [];
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatCurrency(value) {
        return toNumber(value).toFixed(2);
    }

    function formatDateForInput(value) {
        if (!value) return '';

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }

        return date.toISOString().split('T')[0];
    }

    function parseAgeParts(value) {
        const text = String(value || '').trim();
        if (!text) {
            return { ageValue: '', ageUnit: 'years' };
        }

        const [ageValue = '', ageUnit = 'years'] = text.split(/\s+/);
        const normalizedUnit = ageUnit.toLowerCase();

        return {
            ageValue,
            ageUnit: ['years', 'months', 'days'].includes(normalizedUnit) ? normalizedUnit : 'years',
        };
    }

    async function getResponseJson(response) {
        return response.json().catch(() => ({}));
    }

    function setReadonlyInput(input, readonly) {
        if (!input) return;

        if (readonly) {
            input.setAttribute('readonly', true);
            input.style.backgroundColor = '#3333331c';
            input.style.cursor = 'not-allowed';
        } else {
            input.removeAttribute('readonly');
            input.style.backgroundColor = 'white';
            input.style.cursor = 'text';
        }
    }

    function clearNode(node) {
        if (node) {
            node.innerHTML = '';
        }
    }

    function cloneItemsMap(map) {
        return new Map(Array.from(map.entries()).map(([key, value]) => [key, { ...value }]));
    }

    function safeJsonParse(value, fallback = null) {
        try {
            return JSON.parse(value);
        } catch (error) {
            return fallback;
        }
    }

    function getResponseMessage(payload, fallback = '') {
        if (typeof payload === 'string' && payload.trim()) {
            return payload.trim();
        }

        if (Array.isArray(payload)) {
            const listMessage = payload
                .map((entry) => (typeof entry === 'string' ? entry : entry?.message || entry?.msg || ''))
                .filter(Boolean)
                .join(', ');

            if (listMessage) {
                return listMessage;
            }
        }

        const directMessage = payload?.message;
        if (typeof directMessage === 'string' && directMessage.trim()) {
            return directMessage.trim();
        }

        if (Array.isArray(directMessage)) {
            const listMessage = directMessage
                .map((entry) => (typeof entry === 'string' ? entry : entry?.message || entry?.msg || ''))
                .filter(Boolean)
                .join(', ');

            if (listMessage) {
                return listMessage;
            }
        }

        const errorListMessage = ensureArray(payload?.errors)
            .map((entry) => (typeof entry === 'string' ? entry : entry?.message || entry?.msg || ''))
            .filter(Boolean)
            .join(', ');
        if (errorListMessage) {
            return errorListMessage;
        }

        const directError = payload?.error;
        if (typeof directError === 'string' && directError.trim()) {
            return directError.trim();
        }

        const directDetails = payload?.details;
        if (typeof directDetails === 'string' && directDetails.trim()) {
            return directDetails.trim();
        }

        return String(fallback || '').trim();
    }

    const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function focusField(field) {
        if (field && typeof field.focus === 'function') {
            field.focus();
        }
    }

    function validateDoctorPayload(payload, refs) {
        if (!payload.firstname) {
            return { message: 'Doctor first name required hai.', field: refs.doctorFirstname };
        }

        if (!payload.lastname) {
            return { message: 'Doctor last name required hai.', field: refs.doctorLastname };
        }

        if (payload.email && !SIMPLE_EMAIL_REGEX.test(payload.email)) {
            return { message: 'Doctor email valid format me dijiye.', field: refs.doctorEmail };
        }

        if (!payload.specialization) {
            return { message: 'Doctor specialization required hai.', field: refs.doctorSpecialization };
        }

        if (!payload.gender) {
            return { message: 'Doctor gender required hai.', field: refs.doctorGender };
        }

        return null;
    }

    function validateLabPayload(payload, refs) {
        if (!payload.LabName) {
            return { message: 'Lab name required hai.', field: refs.labModalName };
        }

        return null;
    }

    function isExpectedEmptyStateResponse(response, payload, patterns = []) {
        if (!response || ![400, 404].includes(Number(response.status))) {
            return false;
        }

        const message = getResponseMessage(payload).toLowerCase();
        return patterns.some((pattern) => message.includes(String(pattern || '').toLowerCase()));
    }

    function logNonBlockingApiWarning(context, error, extra = null) {
        if (extra !== null && typeof extra !== 'undefined') {
            console.warn(`[Booking Page] ${context}:`, error, extra);
            return;
        }

        console.warn(`[Booking Page] ${context}:`, error);
    }

    function resolveGlobalUser() {
        if (typeof window !== 'undefined' && window.user) {
            return window.user;
        }

        if (typeof user !== 'undefined') {
            return user;
        }

        return null;
    }

    function resolveGlobalUserId() {
        const globalUser = resolveGlobalUser();

        return toId(
            (typeof window !== 'undefined' && typeof window.userId !== 'undefined' && window.userId)
            || (typeof userId !== 'undefined' ? userId : '')
            || globalUser?.parentUser
            || globalUser?._id
        );
    }

    function resolveGlobalUsername() {
        return String(
            (typeof window !== 'undefined' && typeof window.username !== 'undefined' && window.username)
            || (typeof username !== 'undefined' ? username : '')
            || resolveGlobalUser()?.username
            || ''
        );
    }

    function resolveTenantModelType() {
        return String(resolveGlobalUser()?.tenantId?.modelType || '');
    }

    function getBookingCatalogApiMode() {
        return typeof window !== 'undefined' ? String(window[BOOKING_CATALOG_API_MODE_KEY] || '') : '';
    }

    function setBookingCatalogApiMode(mode) {
        if (typeof window === 'undefined') return;

        if (!mode) {
            delete window[BOOKING_CATALOG_API_MODE_KEY];
            return;
        }

        window[BOOKING_CATALOG_API_MODE_KEY] = mode;
    }

    window.initLabflowBookingPage = async function initLabflowBookingPage(options = {}) {
        const mode = options.mode === 'edit' ? 'edit' : 'new';
        const isEditMode = mode === 'edit';
        const BASE = window.BASE_URL || window.location.origin;

        const refs = {
            loader: document.querySelector('.loader'),
            feedback: document.getElementById('successMessage'),
            bookingId: document.getElementById('random-id'),
            bookingDate: getElementByIds(['booking-date', 'dob']),
            bookingTime: getElementByIds(['booking-time', 'time']),
            courierName: document.getElementById('courier-name'),
            courierId: document.getElementById('courier-id'),
            patientName: document.getElementById('patient-name'),
            ageValue: document.getElementById('ageValue'),
            ageUnit: document.getElementById('ageUnit'),
            patientGender: document.getElementById('patient-gender'),
            patientPhone: document.getElementById('patient-phone'),
            doctorSelect: document.getElementById('doctor-selection'),
            doctorName: document.getElementById('doctor-name'),
            labSelect: document.getElementById('lab-selection'),
            labName: document.getElementById('lab-name'),
            franchiseeSelect: document.getElementById('franchisee-select'),
            clinicalHistory: document.getElementById('clinical-history'),
            fileInput: document.querySelector('.file-input input[type="file"]'),
            total: document.getElementById('total'),
            total2: document.getElementById('total2'),
            discountAmount: document.getElementById('discount-amount'),
            discountPercentage: document.getElementById('discount-percentage'),
            availableSearch: document.getElementById('selectTestDivforSearch'),
            selectedSearch: document.getElementById('selectedTestDivforSearch'),
            groupSearch: document.getElementById('groupSearchInput'),
            availableList: document.getElementById('test-selection'),
            selectedList: document.getElementById('test-selected'),
            groupList: document.getElementById('group-selection'),
            tableBody: document.getElementById('tableBody'),
            duplicateBarcodeHint: document.querySelector('.details-section span'),
            submitBtn: document.getElementById('submit-btn'),
            lastBookingId: document.getElementById('last-booking-id'),
            lastBookingDate: document.getElementById('last-booking-date'),
            lastBookingTime: document.getElementById('last-booking-time'),
            lastBookingTotal: document.getElementById('last-booking-total'),
            lastBookingPatient: document.getElementById('last-booking-patient'),
            doctorModal: document.getElementById('modal'),
            openDoctorBtn: document.getElementById('openModalBtn'),
            doctorCloseBtn: document.querySelector('#modal .close'),
            doctorFooterCloseBtn: document.querySelector('#modal .btn-close'),
            addDoctorBtn: document.querySelector('#modal .btn-add'),
            doctorFirstname: document.getElementById('firstname'),
            doctorLastname: document.getElementById('lastname'),
            doctorEmail: document.getElementById('doctor-email'),
            doctorSpecialization: document.getElementById('specialization'),
            doctorDob: document.getElementById('doctor-dob'),
            doctorGender: document.getElementById('doctor-gender'),
            doctorAddress: document.getElementById('doctor-address'),
            doctorPricingMode: document.getElementById('doctor-initial-pricing-mode'),
            doctorPricingSourceWrap: document.getElementById('doctor-pricing-source-wrap'),
            doctorPricingSource: document.getElementById('doctor-pricing-source'),
            doctorOpenPricingManager: document.getElementById('doctor-open-pricing-manager'),
            labModal: document.getElementById('modal-overlay'),
            openLabBtn: document.getElementById('show-modal-btn'),
            closeLabBtn: document.getElementById('close-modal-btn'),
            addLabBtn: document.getElementById('add-lab'),
            labModalName: document.getElementById('lab-name2'),
            labModalAddress: document.getElementById('lab-address'),
            saveGroupFromBookingBtn: document.getElementById('saveGroupFromBookingBtn'),
            updateGroupFromBookingBtn: document.getElementById('updateGroupFromBookingBtn'),
            bookingGroupModal: document.getElementById('bookingGroupModal'),
            bookingGroupModalTitle: document.getElementById('bookingGroupModalTitle'),
            closeBookingGroupModal: document.getElementById('closeBookingGroupModal'),
            cancelBookingGroupModal: document.getElementById('cancelBookingGroupModal'),
            confirmBookingGroupSave: document.getElementById('confirmBookingGroupSave'),
            bookingGroupExistingSelect: document.getElementById('bookingGroupExistingSelect'),
            bookingGroupName: document.getElementById('bookingGroupName'),
            bookingGroupDescription: document.getElementById('bookingGroupDescription'),
            editPopup: document.getElementById('editPopup'),
            editForm: document.getElementById('editForm'),
            openEditPopup: document.getElementById('openEditPopup'),
            closeEditPopup: document.getElementById('closeEditPopup'),
            saveEditForm: document.getElementById('saveEditForm'),
            cancelBookingBtn: document.getElementById('cancelbooking'),
        };

        const state = {
            rootUserId: resolveGlobalUserId(),
            bookingUserId: resolveGlobalUserId(),
            supportsAdvancedBookingApi: getBookingCatalogApiMode() !== 'legacy',
            legacyCatalogWarningShown: false,
            doctors: [],
            labs: [],
            subFranchisees: [],
            selfDoctorId: '',
            selectedDoctorId: '',
            catalogItems: [],
            catalogMap: new Map(),
            groups: [],
            newSelectedItems: new Map(),
            lockedItems: new Map(),
            rowState: new Map(),
            booking: null,
            existingSampleBarcodes: new Map(),
            currentGroupMode: 'create',
            groupSelectionId: '',
        };

        function syncIdentityState() {
            const resolvedRootUserId = resolveGlobalUserId();
            if (resolvedRootUserId) {
                state.rootUserId = resolvedRootUserId;
            }

            if (!state.bookingUserId) {
                state.bookingUserId = state.rootUserId || resolvedRootUserId || '';
            }

            if (getBookingCatalogApiMode() === 'legacy') {
                state.supportsAdvancedBookingApi = false;
            }
        }

        syncIdentityState();

        function showMessage(message, type = 'error') {
            if (!refs.feedback) return;

            if (isEditMode) {
                refs.feedback.className = `notification ${type === 'success' ? 'success' : 'error'} active`;
                refs.feedback.innerHTML = `<strong>${escapeHtml(type === 'success' ? 'Success' : 'Error')}</strong><p>${escapeHtml(message || '')}</p>`;
                return;
            }

            refs.feedback.textContent = message || '';
            refs.feedback.classList.remove('booking-message--success', 'booking-message--error');
            refs.feedback.classList.add(type === 'success' ? 'booking-message--success' : 'booking-message--error');
            refs.feedback.style.display = message ? 'block' : 'none';
        }

        function hideMessage() {
            if (!refs.feedback) return;

            refs.feedback.textContent = '';
            refs.feedback.innerHTML = '';
            refs.feedback.className = '';

            if (isEditMode) {
                refs.feedback.className = 'notification';
            } else {
                refs.feedback.style.display = 'none';
            }
        }

        function setLoading(isLoading) {
            if (refs.loader) {
                refs.loader.style.display = isLoading ? 'flex' : 'none';
            }

            if (refs.submitBtn) {
                refs.submitBtn.disabled = Boolean(isLoading);
            }
        }

        function getDoctorOptionLabel(doctor) {
            if (!doctor) return '';

            if (doctor.isSystemDefault) {
                return doctor.displayName || 'Self';
            }

            const specialization = doctor.specialization ? ` (${doctor.specialization})` : '';
            return `${doctor.displayName || `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim()}${specialization}`;
        }

        function setCurrentDateTime() {
            const now = new Date();

            if (refs.bookingDate && !isEditMode) {
                refs.bookingDate.value = formatDateForInput(now);
                refs.bookingDate.setAttribute('readonly', true);
            }

            if (refs.bookingTime && !isEditMode) {
                refs.bookingTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                refs.bookingTime.setAttribute('readonly', true);
            }
        }

        function generateBookingId() {
            return `OH${Math.floor(Math.random() * 10000000000)}`;
        }

        function hideSingleLayerFields() {
            if (resolveTenantModelType() === '1layer') {
                document.querySelectorAll('.forhide').forEach((element) => {
                    element.style.display = 'none';
                });
            }
        }

        function normalizeCatalogItem(item, fallbackType) {
            const itemType = normalizeItemType(item?.itemType || fallbackType);
            const itemId = toId(item?.itemId || item?.id || item?._id);
            if (!itemType || !itemId) {
                return null;
            }

            return {
                itemType,
                itemId,
                collectionName: item.collectionName || COLLECTION_BY_TYPE[itemType],
                itemName: item.itemName || item.testName || item.panelName || item.packageName || '',
                shortName: item.shortName || item.Short_name || '',
                bookingCode: Number.isFinite(Number(item.bookingCode)) ? Number(item.bookingCode) : null,
                sampleTypes: normalizeSampleTypeList(
                    Array.isArray(item.sampleTypes) && item.sampleTypes.length > 0
                        ? item.sampleTypes
                        : item.sampleType
                ),
                price: toNumber(item.price ?? item.basePrice ?? item.finalPrice ?? item.myPrice),
                basePrice: toNumber(item.basePrice ?? item.catalogPrice ?? item.Price),
                mrpPrice: toNumber(item.mrpPrice ?? item.finalPrice),
                rateSource: item.rateSource || '',
                selectedViaGroupId: toId(item.selectedViaGroupId),
                selectedViaGroupName: item.selectedViaGroupName || '',
            };
        }

        function flattenCatalog(catalog) {
            return [
                ...ensureArray(catalog?.tests).map((item) => normalizeCatalogItem(item, 'test')),
                ...ensureArray(catalog?.panels).map((item) => normalizeCatalogItem(item, 'panel')),
                ...ensureArray(catalog?.packages).map((item) => normalizeCatalogItem(item, 'package')),
            ].filter(Boolean);
        }

        function getEditableGroups() {
            return ensureArray(state.groups);
        }

        function resetSearchInput(input) {
            if (!input) return;

            input.value = '';
            window.requestAnimationFrame(() => input.focus());
        }

        function getDoctorById(doctorId) {
            return state.doctors.find((doctor) => toId(doctor._id) === toId(doctorId)) || null;
        }

        function renderDoctorPricingSources(selectedSourceId = '') {
            if (!refs.doctorPricingSource) return;

            const options = state.doctors.map((doctor) => {
                const doctorId = toId(doctor._id);
                const selected = doctorId === toId(selectedSourceId || state.selfDoctorId) ? 'selected' : '';
                return `<option value="${escapeHtml(doctorId)}" ${selected}>${escapeHtml(getDoctorOptionLabel(doctor))}</option>`;
            });

            refs.doctorPricingSource.innerHTML = options.join('');
        }

        function syncDoctorPricingMode() {
            if (!refs.doctorPricingMode || !refs.doctorPricingSourceWrap) return;

            const shouldShowSource = refs.doctorPricingMode.value === 'copy';
            refs.doctorPricingSourceWrap.style.display = shouldShowSource ? 'block' : 'none';
        }

        function syncAdvancedBookingUi() {
            const advancedAvailable = state.supportsAdvancedBookingApi !== false;
            const quickGroupHint = advancedAvailable
                ? ''
                : 'Current installed app build me quick groups aur doctor pricing overrides available nahi hain. Updated build run karein.';

            [refs.saveGroupFromBookingBtn, refs.updateGroupFromBookingBtn].forEach((button) => {
                if (!button) return;
                button.disabled = !advancedAvailable;
                button.title = quickGroupHint;
            });

            if (refs.doctorOpenPricingManager) {
                refs.doctorOpenPricingManager.disabled = !advancedAvailable;
                refs.doctorOpenPricingManager.title = advancedAvailable
                    ? ''
                    : 'Updated build ke bina pricing manager open nahi hoga.';
            }
        }

        function normalizeLegacySampleTypes(value) {
            if (Array.isArray(value)) {
                return value.map((item) => String(item || '').trim()).filter(Boolean);
            }

            const text = String(value || '').trim();
            if (!text) {
                return [];
            }

            return text.split(',').map((item) => item.trim()).filter(Boolean);
        }

        function normalizeLegacyCatalogItem(item, itemType) {
            if (!item) return null;

            if (itemType === 'test') {
                return normalizeCatalogItem({
                    itemType,
                    itemId: item.testId || item._id,
                    collectionName: 'testSchema',
                    itemName: item.testName || item.Name || '',
                    shortName: item.Short_name || '',
                    sampleTypes: normalizeLegacySampleTypes(item.sampleType),
                    basePrice: item.myPrice ?? item.franchiseePrice ?? item.basePrice ?? item.Price ?? 0,
                    mrpPrice: item.mrpPrice ?? item.final_price ?? 0,
                    price: item.myPrice ?? item.franchiseePrice ?? item.basePrice ?? item.Price ?? 0,
                    rateSource: 'legacy-default',
                }, itemType);
            }

            if (itemType === 'panel') {
                return normalizeCatalogItem({
                    itemType,
                    itemId: item.panelId || item._id,
                    collectionName: 'addPannel',
                    itemName: item.panelName || item.name || '',
                    sampleTypes: normalizeLegacySampleTypes(item.sampleType),
                    basePrice: item.myPrice ?? item.franchiseePrice ?? item.basePrice ?? item.price ?? 0,
                    mrpPrice: item.mrpPrice ?? item.final_price ?? 0,
                    price: item.myPrice ?? item.franchiseePrice ?? item.basePrice ?? item.price ?? 0,
                    rateSource: 'legacy-default',
                }, itemType);
            }

            const packageSamples = [
                ...normalizeLegacySampleTypes(item.sampleType),
                ...normalizeLegacySampleTypes(item.sample_types),
            ];

            return normalizeCatalogItem({
                itemType: 'package',
                itemId: item.packageId || item._id,
                collectionName: 'Package',
                itemName: item.packageName || '',
                sampleTypes: [...new Set(packageSamples)],
                basePrice: item.myPrice ?? item.franchiseePrice ?? item.basePrice ?? item.packageFee ?? 0,
                mrpPrice: item.mrpPrice ?? item.final_price ?? 0,
                price: item.myPrice ?? item.franchiseePrice ?? item.basePrice ?? item.packageFee ?? 0,
                rateSource: 'legacy-default',
            }, 'package');
        }

        function applyCatalogState({ catalog, groups = [], selfDoctorId = state.selfDoctorId }, preserveSelection) {
            state.selfDoctorId = toId(selfDoctorId) || state.selfDoctorId;
            state.catalogItems = flattenCatalog(catalog);
            state.catalogMap = new Map(state.catalogItems.map((item) => [buildItemKey(item.itemType, item.itemId), item]));
            state.groups = ensureArray(groups);

            syncAdvancedBookingUi();
            enrichLockedItemsFromCatalog();

            if (preserveSelection) {
                reconcileNewSelectionWithCatalog();
            } else {
                state.newSelectedItems = new Map();
                state.rowState = new Map();
            }

            renderEverything();
        }

        function applyEmptyCatalogState(preserveSelection = false) {
            applyCatalogState({
                selfDoctorId: state.selfDoctorId,
                groups: [],
                catalog: {
                    tests: [],
                    panels: [],
                    packages: [],
                },
            }, preserveSelection);
        }

        async function loadLegacyBookingCatalog() {
            const rootUserId = state.rootUserId || state.bookingUserId || '';
            const selectedFranchiseeId = getSelectedFranchiseeId();
            const query = new URLSearchParams();

            if (rootUserId) {
                query.set('userId', rootUserId);
            }
            if (selectedFranchiseeId) {
                query.set('oldId', selectedFranchiseeId);
            }

            const queryText = query.toString() ? `?${query.toString()}` : '';
            const [testsResponse, panelsResponse, packagesResponse] = await Promise.all([
                fetch(`${BASE}/api/v1/user/get-test${queryText}`, { method: 'POST' }),
                fetch(`${BASE}/api/v1/user/get-all-pannels${queryText}`, { method: 'POST' }),
                fetch(`${BASE}/api/v1/user/get-all-packages${queryText}`, { method: 'POST' }),
            ]);

            const [testsData, panelsData, packagesData] = await Promise.all([
                getResponseJson(testsResponse),
                getResponseJson(panelsResponse),
                getResponseJson(packagesResponse),
            ]);

            const catalog = {
                tests: testsResponse.ok
                    ? getArrayResponse(testsData).map((item) => normalizeLegacyCatalogItem(item, 'test')).filter(Boolean)
                    : [],
                panels: panelsResponse.ok
                    ? getArrayResponse(panelsData).map((item) => normalizeLegacyCatalogItem(item, 'panel')).filter(Boolean)
                    : [],
                packages: packagesResponse.ok
                    ? getArrayResponse(packagesData).map((item) => normalizeLegacyCatalogItem(item, 'package')).filter(Boolean)
                    : [],
            };

            const failures = [
                !testsResponse.ok ? getResponseMessage(testsData, 'Tests load nahi ho paye') : '',
                !panelsResponse.ok ? getResponseMessage(panelsData, 'Panels load nahi ho paye') : '',
                !packagesResponse.ok ? getResponseMessage(packagesData, 'Packages load nahi ho paye') : '',
            ].filter(Boolean);

            if (failures.length === 3) {
                throw new Error(failures[0] || 'Legacy booking catalog bhi load nahi ho paya');
            }

            if (failures.length > 0) {
                logNonBlockingApiWarning('Legacy catalog partially loaded', failures.join(' | '));
            }

            return {
                selfDoctorId: state.selfDoctorId,
                groups: [],
                catalog,
            };
        }

        function updateDoctorField() {
            const selectedOption = refs.doctorSelect?.selectedOptions?.[0];
            if (!refs.doctorName) return;

            if (!selectedOption || !selectedOption.value) {
                refs.doctorName.value = '';
                setReadonlyInput(refs.doctorName, false);
                return;
            }

            refs.doctorName.value = selectedOption.textContent || '';
            setReadonlyInput(refs.doctorName, true);
        }

        function updateLabField() {
            const selectedOption = refs.labSelect?.selectedOptions?.[0];
            if (!refs.labName) return;

            if (!selectedOption || !selectedOption.value) {
                refs.labName.value = '';
                setReadonlyInput(refs.labName, false);
                return;
            }

            refs.labName.value = selectedOption.textContent || '';
            setReadonlyInput(refs.labName, true);
        }

        function renderDoctors(preferredDoctorId = '') {
            if (!refs.doctorSelect) return;

            if (state.doctors.length === 0) {
                refs.doctorSelect.innerHTML = '<option value="">-- Add or select doctor --</option>';
                refs.doctorSelect.disabled = true;
                state.selectedDoctorId = '';
                updateDoctorField();
                renderDoctorPricingSources();
                return;
            }

            refs.doctorSelect.disabled = false;

            refs.doctorSelect.innerHTML = state.doctors.map((doctor) => {
                const selected = toId(doctor._id) === toId(preferredDoctorId || state.selectedDoctorId) ? 'selected' : '';
                return `<option value="${escapeHtml(toId(doctor._id))}" doctor-id="${escapeHtml(toId(doctor._id))}" data-email="${escapeHtml(doctor.email || '')}" ${selected}>${escapeHtml(getDoctorOptionLabel(doctor))}</option>`;
            }).join('');

            if (!refs.doctorSelect.value && state.doctors[0]) {
                refs.doctorSelect.value = toId(state.doctors[0]._id);
            }

            state.selectedDoctorId = refs.doctorSelect.value || state.selfDoctorId || '';
            updateDoctorField();
            renderDoctorPricingSources();
        }

        function renderLabs(preferredLabId = '') {
            if (!refs.labSelect) return;

            const options = [
                '<option value="">-- No Lab Selected --</option>',
                ...state.labs.map((lab) => {
                    const labId = toId(lab._id);
                    const selected = labId === toId(preferredLabId) ? 'selected' : '';
                    return `<option value="${escapeHtml(lab.LabName || '')}" Lab-id="${escapeHtml(labId)}" ${selected}>${escapeHtml(lab.LabName || '')}</option>`;
                }),
            ];

            refs.labSelect.innerHTML = options.join('');
            updateLabField();
        }

        function renderSubFranchisees(preferredId = '', preferredName = '') {
            if (!refs.franchiseeSelect) return;

            const normalizedPreferredId = toId(preferredId);
            const normalizedPreferredName = String(preferredName || '').trim();
            const options = ['<option value="">-- Select franchisee --</option>'];

            state.subFranchisees.forEach((franchisee) => {
                const franchiseeId = toId(franchisee._id);
                const label = franchisee.fullName || franchisee.name || '';
                const selected = franchiseeId === normalizedPreferredId
                    || (normalizedPreferredName && label === normalizedPreferredName)
                    ? 'selected'
                    : '';

                options.push(
                    `<option value="${escapeHtml(label)}" data-id="${escapeHtml(franchiseeId)}" ${selected}>${escapeHtml(label)}</option>`
                );
            });

            const hasPreferredSelection = Boolean(normalizedPreferredId || normalizedPreferredName);
            const preferredExists = state.subFranchisees.some((franchisee) => {
                const franchiseeId = toId(franchisee._id);
                const label = franchisee.fullName || franchisee.name || '';
                return franchiseeId === normalizedPreferredId || (normalizedPreferredName && label === normalizedPreferredName);
            });

            if (hasPreferredSelection && !preferredExists) {
                options.push(
                    `<option value="${escapeHtml(normalizedPreferredName)}" data-id="${escapeHtml(normalizedPreferredId)}" selected>${escapeHtml(normalizedPreferredName || 'Selected franchisee')}</option>`
                );
            }

            if (state.subFranchisees.length === 0 && !hasPreferredSelection) {
                options[0] = '<option value="">-- No franchisee available --</option>';
                refs.franchiseeSelect.disabled = true;
            } else {
                refs.franchiseeSelect.disabled = false;
            }

            refs.franchiseeSelect.innerHTML = options.join('');
        }

        async function fetchDoctors(preferredDoctorId = '') {
            try {
                const response = await fetch(`${BASE}/api/v1/user/all-doctor`);
                const data = await getResponseJson(response);

                if (!response.ok) {
                    if (isExpectedEmptyStateResponse(response, data, ['no doctor found', 'no doctors found'])) {
                        state.doctors = [];
                        state.selfDoctorId = '';
                        renderDoctors(preferredDoctorId || state.selectedDoctorId || state.selfDoctorId);
                        return [];
                    }

                    throw new Error(getResponseMessage(data, 'Doctors load nahi ho paye'));
                }

                state.doctors = getArrayResponse(data);
                const selfDoctor = state.doctors.find((doctor) => doctor.isSystemDefault);
                state.selfDoctorId = toId(selfDoctor?._id);
                renderDoctors(preferredDoctorId || state.selectedDoctorId || state.selfDoctorId);
                return state.doctors;
            } catch (error) {
                state.doctors = [];
                state.selfDoctorId = '';
                renderDoctors(preferredDoctorId || state.selectedDoctorId || state.selfDoctorId);
                logNonBlockingApiWarning('Doctors list load failed, page will continue', error);
                return [];
            }
        }

        async function fetchLabs(preferredLabId = '') {
            try {
                const response = await fetch(`${BASE}/api/v1/user/all-Lab`);
                const data = await getResponseJson(response);

                if (!response.ok) {
                    if (isExpectedEmptyStateResponse(response, data, ['no lab found', 'no labs found'])) {
                        state.labs = [];
                        renderLabs(preferredLabId || getSelectedLabId());
                        return [];
                    }

                    throw new Error(getResponseMessage(data, 'Labs load nahi ho paye'));
                }

                state.labs = getArrayResponse(data);
                renderLabs(preferredLabId || getSelectedLabId());
                return state.labs;
            } catch (error) {
                state.labs = [];
                renderLabs(preferredLabId || getSelectedLabId());
                logNonBlockingApiWarning('Labs list load failed, page will continue', error);
                return [];
            }
        }

        async function fetchSubFranchisees(preferredId = '', preferredName = '') {
            syncIdentityState();
            if (!refs.franchiseeSelect) return [];

            if (!state.rootUserId) {
                state.subFranchisees = [];
                renderSubFranchisees(preferredId, preferredName);
                return [];
            }

            try {
                const response = await fetch(`${BASE}/api/v1/user/get-super-franchisee?userId=${state.rootUserId}`);
                const data = await getResponseJson(response);

                if (!response.ok) {
                    if (isExpectedEmptyStateResponse(response, data, ['no franchisee found', 'no franchisees found'])) {
                        state.subFranchisees = [];
                        renderSubFranchisees(preferredId, preferredName);
                        return [];
                    }

                    throw new Error(getResponseMessage(data, 'Franchisee list load nahi ho paayi'));
                }

                state.subFranchisees = getArrayResponse(data);
                renderSubFranchisees(preferredId, preferredName);
                return state.subFranchisees;
            } catch (error) {
                state.subFranchisees = [];
                renderSubFranchisees(preferredId, preferredName);
                logNonBlockingApiWarning('Franchisee list load failed, page will continue', error);
                return [];
            }
        }

        function getSelectedDoctorId() {
            return toId(refs.doctorSelect?.selectedOptions?.[0]?.getAttribute('doctor-id') || refs.doctorSelect?.value);
        }

        function getSelectedLabId() {
            return toId(refs.labSelect?.selectedOptions?.[0]?.getAttribute('Lab-id'));
        }

        function getSelectedFranchiseeId() {
            return toId(refs.franchiseeSelect?.selectedOptions?.[0]?.getAttribute('data-id'));
        }

        function getSelectedGroupItemCollection(itemType) {
            return COLLECTION_BY_TYPE[normalizeItemType(itemType)] || '';
        }

        function getCurrentSelectedItemsMap() {
            return new Map([
                ...Array.from(state.lockedItems.entries()),
                ...Array.from(state.newSelectedItems.entries()),
            ]);
        }

        function getCurrentSelectedItems() {
            return Array.from(getCurrentSelectedItemsMap().values());
        }

        function getCurrentSelectionSize() {
            return state.lockedItems.size + state.newSelectedItems.size;
        }

        function getSelectedItemsForSave(items = getCurrentSelectedItems()) {
            return items.map((item) => ({
                itemType: item.itemType,
                itemId: item.itemId,
                selectedViaGroupId: item.selectedViaGroupId || null,
                selectedViaGroupName: item.selectedViaGroupName || '',
            }));
        }

        function syncDiscountDisplay() {
            const currentTotal = getCurrentSelectedItems().reduce((sum, item) => sum + toNumber(item.price), 0);
            const discountValue = toNumber(refs.discountAmount?.value);
            const payableAmount = Math.max(currentTotal - discountValue, 0);
            const discountPercentage = currentTotal > 0 ? ((Math.min(discountValue, currentTotal) / currentTotal) * 100).toFixed(2) : '0.00';

            if (refs.total) {
                refs.total.textContent = formatCurrency(currentTotal);
            }

            if (refs.total2) {
                refs.total2.textContent = formatCurrency(payableAmount);
            }

            if (refs.discountPercentage) {
                refs.discountPercentage.value = `${discountPercentage}%`;
            }
        }

        function fillBarcodePair(barcodeInput, confirmInput, generatedValue = '') {
            if (!barcodeInput || !confirmInput) return;

            const barcodeValue = barcodeInput.value.trim();
            const confirmValue = confirmInput.value.trim();

            if (!barcodeValue && !confirmValue && generatedValue) {
                barcodeInput.value = generatedValue;
                confirmInput.value = generatedValue;
                return;
            }

            if (!barcodeValue && confirmValue) {
                barcodeInput.value = confirmValue;
            } else if (barcodeValue && !confirmValue) {
                confirmInput.value = barcodeValue;
            }
        }

        function generateSampleBarcode() {
            return String(Math.floor(100000 + (Math.random() * 900000)));
        }

        function rebuildRowsFromSelection() {
            const previousRows = cloneItemsMap(state.rowState);
            const nextRows = new Map();

            getCurrentSelectedItems().forEach((item) => {
                const sampleTypes = normalizeSampleTypeList(
                    item.sampleTypes.length > 0 ? item.sampleTypes : ['Unknown']
                );

                sampleTypes.forEach((sampleType) => {
                    const normalizedSample = String(sampleType || 'Unknown').trim() || 'Unknown';
                    let existingRow = nextRows.get(normalizedSample);

                    if (!existingRow) {
                        const previousRow = previousRows.get(normalizedSample);
                        existingRow = previousRow
                            ? {
                                ...previousRow,
                                sampleType: normalizedSample,
                                ids: [],
                                testNames: [],
                            }
                            : {
                                sampleType: normalizedSample,
                                barcodeId: '',
                                confirmBarcodeId: '',
                                ids: [],
                                testNames: [],
                                readOnly: false,
                            };
                    }

                    const lockedBarcode = state.existingSampleBarcodes.get(normalizedSample);
                    if (lockedBarcode) {
                        existingRow.barcodeId = lockedBarcode;
                        existingRow.confirmBarcodeId = lockedBarcode;
                        existingRow.readOnly = true;
                    }

                    const collectionName = item.collectionName || getSelectedGroupItemCollection(item.itemType);
                    const rowItemKey = `${collectionName}:${toId(item.itemId)}`;
                    const existingRowItemKeys = new Set(
                        ensureArray(existingRow.ids).map((entry) => `${entry?.collectionName}:${toId(entry?.id)}`)
                    );

                    if (!existingRowItemKeys.has(rowItemKey)) {
                        existingRow.ids.push({
                            id: item.itemId,
                            collectionName,
                        });
                    }

                    if (item.itemName && !existingRow.testNames.includes(item.itemName)) {
                        existingRow.testNames.push(item.itemName);
                    }

                    nextRows.set(normalizedSample, existingRow);
                });
            });

            if (resolveTenantModelType() === '1layer') {
                nextRows.forEach((row) => {
                    if (!row.readOnly && !row.barcodeId && !row.confirmBarcodeId) {
                        const autoValue = generateSampleBarcode();
                        row.barcodeId = autoValue;
                        row.confirmBarcodeId = autoValue;
                    }
                });
            }

            state.rowState = nextRows;
        }

        function renderRows() {
            if (!refs.tableBody) return;

            clearNode(refs.tableBody);
            rebuildRowsFromSelection();

            if (state.rowState.size === 0) {
                refs.tableBody.innerHTML = '<tr><td colspan="4" class="no-sample">No Sample Selected</td></tr>';
                return;
            }

            let index = 1;
            Array.from(state.rowState.values()).forEach((row) => {
                const tr = document.createElement('tr');
                tr.setAttribute('data-sample-type', row.sampleType);
                tr.setAttribute('data-test-data', JSON.stringify(row.ids || []));

                const barcodeValue = row.barcodeId || '';
                const confirmValue = row.confirmBarcodeId || '';
                const inputStyle = row.readOnly
                    ? 'background-color:#3333331c;cursor:not-allowed;'
                    : '';

                tr.innerHTML = `
                    <td>${index}</td>
                    <td>${escapeHtml(row.sampleType)}</td>
                    <td>
                        <input type="text" name="barcodeId" value="${escapeHtml(barcodeValue)}" ${row.readOnly ? 'readonly' : ''} style="${inputStyle}">
                        <br>
                        <input type="text" name="confirmBarcodeId" value="${escapeHtml(confirmValue)}" ${row.readOnly ? 'readonly' : ''} style="${inputStyle}">
                    </td>
                    <td>${escapeHtml(Array.from(new Set(row.testNames || [])).join(', '))}</td>
                `;

                const barcodeInput = tr.querySelector('input[name="barcodeId"]');
                const confirmInput = tr.querySelector('input[name="confirmBarcodeId"]');

                const syncRow = () => {
                    fillBarcodePair(barcodeInput, confirmInput);
                    row.barcodeId = barcodeInput.value.trim();
                    row.confirmBarcodeId = confirmInput.value.trim();
                };

                if (!row.readOnly) {
                    barcodeInput.addEventListener('blur', syncRow);
                    confirmInput.addEventListener('blur', syncRow);
                }

                refs.tableBody.appendChild(tr);
                index += 1;
            });
        }

        function getFilteredAvailableItems(query = String(refs.availableSearch?.value || '').trim().toLowerCase()) {
            const blockedKeys = new Set([
                ...Array.from(state.lockedItems.keys()),
                ...Array.from(state.newSelectedItems.keys()),
            ]);

            return state.catalogItems.filter((item) => {
                const key = buildItemKey(item.itemType, item.itemId);
                if (blockedKeys.has(key)) {
                    return false;
                }

                if (!query) {
                    return true;
                }

                const searchPool = [
                    item.itemName,
                    item.shortName,
                    item.itemType,
                    item.bookingCode,
                    ensureArray(item.sampleTypes).join(', '),
                ].join(' ').toLowerCase();

                return searchPool.includes(query);
            });
        }

        function getFilteredSelectedItems(query = String(refs.selectedSearch?.value || '').trim().toLowerCase()) {
            const lockedItems = Array.from(state.lockedItems.values()).map((item) => ({
                ...item,
                isLocked: true,
                isExisting: true,
                isRemovable: isEditMode,
            }));
            const newItems = Array.from(state.newSelectedItems.values()).map((item) => ({
                ...item,
                isLocked: false,
                isExisting: false,
                isRemovable: true,
            }));

            return [...lockedItems, ...newItems].filter((item) => {
                if (!query) return true;

                const searchPool = [
                    item.itemName,
                    item.shortName,
                    item.itemType,
                    item.bookingCode,
                    item.selectedViaGroupName,
                    ensureArray(item.sampleTypes).join(', '),
                ].join(' ').toLowerCase();

                return searchPool.includes(query);
            });
        }

        function getFilteredGroups(query = String(refs.groupSearch?.value || '').trim().toLowerCase()) {
            return getEditableGroups().filter((group) => {
                if (!query) return true;

                const searchPool = [
                    group.name,
                    group.description,
                    ensureArray(group.items).map((item) => `${item.itemName} ${item.bookingCode || ''}`).join(' '),
                ].join(' ').toLowerCase();

                return searchPool.includes(query);
            });
        }

        function parseQuickCodeInput(query) {
            const text = String(query || '').trim();
            if (!text || !text.includes('/')) {
                return [];
            }

            const parts = text
                .split('/')
                .map((part) => part.trim())
                .filter(Boolean);

            if (parts.length === 0 || parts.some((part) => !/^\d+$/.test(part))) {
                return [];
            }

            return [...new Set(parts.map((part) => Number(part)).filter((part) => Number.isFinite(part)))];
        }

        function selectItemsByQuickCodes(rawQuery) {
            const quickCodes = parseQuickCodeInput(rawQuery);
            if (quickCodes.length === 0) {
                return 0;
            }

            let addedCount = 0;
            state.catalogItems.forEach((item) => {
                if (!quickCodes.includes(Number(item.bookingCode))) {
                    return;
                }

                if (addItemToSelection(item, { skipRender: true })) {
                    addedCount += 1;
                }
            });

            if (addedCount > 0) {
                renderEverything();
                resetSearchInput(refs.availableSearch);
            }

            return addedCount;
        }

        function renderAvailableItems() {
            if (!refs.availableList) return;

            const query = String(refs.availableSearch?.value || '').trim().toLowerCase();
            const filteredItems = getFilteredAvailableItems(query);

            if (filteredItems.length === 0) {
                refs.availableList.innerHTML = '<span class="tests-name-option" style="cursor:default;">No matching items found</span>';
                return;
            }

            refs.availableList.innerHTML = filteredItems.map((item) => {
                const key = buildItemKey(item.itemType, item.itemId);
                const sampleText = ensureArray(item.sampleTypes).join(', ') || '-';
                const sourceLabel = item.rateSource === 'doctor-rate-card' ? 'Doctor Price' : 'Default Price';
                const codeLabel = item.bookingCode ? ` | Code ${item.bookingCode}` : '';
                return `
                    <span class="tests-name-option" data-action="select-item" data-item-key="${escapeHtml(key)}" style="justify-content:space-between;gap:10px;">
                        <span style="display:flex;flex-direction:column;">
                            <strong>${escapeHtml(item.itemName)}</strong>
                            <small>${escapeHtml(item.itemType)} | ${escapeHtml(sampleText)} | ${escapeHtml(sourceLabel)}${escapeHtml(codeLabel)}</small>
                        </span>
                        <span>Rs. ${formatCurrency(item.price)}</span>
                    </span>
                `;
            }).join('');
        }

        function renderSelectedItems() {
            if (!refs.selectedList) return;

            const query = String(refs.selectedSearch?.value || '').trim().toLowerCase();
            const selectedItems = getFilteredSelectedItems(query);

            if (selectedItems.length === 0) {
                refs.selectedList.innerHTML = '<span class="realSelectedTests" style="cursor:default;">No items selected</span>';
                return;
            }

            refs.selectedList.innerHTML = selectedItems.map((item) => {
                const key = buildItemKey(item.itemType, item.itemId);
                const badgeParts = [];
                if (item.isExisting) {
                    badgeParts.push('Already booked');
                }
                if (item.selectedViaGroupName) {
                    badgeParts.push(item.selectedViaGroupName);
                } else if (item.isRemovable) {
                    badgeParts.push('Click to remove');
                }
                const badgeText = badgeParts.join(' | ') || 'Selected';
                const sourceLabel = item.rateSource === 'doctor-rate-card' ? 'Doctor Price' : 'Default Price';

                return `
                    <span
                        class="realSelectedTests"
                        data-action="${item.isRemovable ? 'remove-item' : 'locked-item'}"
                        data-item-key="${escapeHtml(key)}"
                        style="justify-content:space-between;gap:10px;${item.isRemovable ? '' : 'opacity:0.7;cursor:default;'}"
                    >
                        <span style="display:flex;flex-direction:column;">
                            <strong>${escapeHtml(item.itemName || key)}</strong>
                            <small>${escapeHtml(item.itemType)} | ${escapeHtml(sourceLabel)} | ${escapeHtml(badgeText)}</small>
                        </span>
                        <span>Rs. ${formatCurrency(item.price)}</span>
                    </span>
                `;
            }).join('');
        }

        function renderGroups() {
            if (!refs.groupList) return;

            const query = String(refs.groupSearch?.value || '').trim().toLowerCase();
            const groups = getFilteredGroups(query);

            if (state.supportsAdvancedBookingApi === false) {
                refs.groupList.innerHTML = '<span style="cursor:default;">Quick groups updated app build ke baad available honge.</span>';
                return;
            }

            if (groups.length === 0) {
                refs.groupList.innerHTML = '<span style="cursor:default;">No matching groups found</span>';
                return;
            }

            refs.groupList.innerHTML = groups.map((group) => `
                <span data-action="apply-group" data-group-id="${escapeHtml(toId(group._id))}" style="justify-content:space-between;gap:10px;">
                    <span style="display:flex;flex-direction:column;">
                        <strong>${escapeHtml(group.name || '')}</strong>
                        <small>Global Group | ${ensureArray(group.items).length} items</small>
                    </span>
                    <span>Add</span>
                </span>
            `).join('');
        }

        function renderEverything() {
            renderAvailableItems();
            renderSelectedItems();
            renderGroups();
            renderRows();
            syncDiscountDisplay();
        }
        function enrichLockedItemsFromCatalog() {
            state.lockedItems.forEach((item, key) => {
                const catalogItem = state.catalogMap.get(key);
                if (!catalogItem) return;

                state.lockedItems.set(key, {
                    ...item,
                    ...catalogItem,
                    selectedViaGroupId: item.selectedViaGroupId || catalogItem.selectedViaGroupId || '',
                    selectedViaGroupName: item.selectedViaGroupName || catalogItem.selectedViaGroupName || '',
                });
            });
        }

        function reconcileNewSelectionWithCatalog() {
            const removedNames = [];
            const nextSelectedItems = new Map();

            state.newSelectedItems.forEach((item) => {
                const key = buildItemKey(item.itemType, item.itemId);
                const catalogItem = state.catalogMap.get(key);

                if (!catalogItem) {
                    removedNames.push(item.itemName || key);
                    return;
                }

                nextSelectedItems.set(key, {
                    ...catalogItem,
                    selectedViaGroupId: item.selectedViaGroupId || '',
                    selectedViaGroupName: item.selectedViaGroupName || '',
                });
            });

            state.newSelectedItems = nextSelectedItems;

            if (removedNames.length > 0) {
                showMessage(`${removedNames.join(', ')} selected doctor ki price list me available nahi tha, isliye remove kar diya gaya.`, 'error');
            }
        }

        async function loadCatalog({ preserveSelection = true } = {}) {
            syncIdentityState();
            state.selectedDoctorId = getSelectedDoctorId() || state.selfDoctorId;
            updateDoctorField();

            if (getBookingCatalogApiMode() === 'legacy') {
                const legacyData = await loadLegacyBookingCatalog();
                state.supportsAdvancedBookingApi = false;
                applyCatalogState(legacyData, preserveSelection);
                return;
            }

            const searchParams = new URLSearchParams();
            if (state.selectedDoctorId) {
                searchParams.set('doctorId', state.selectedDoctorId);
            }
            if (state.bookingUserId) {
                searchParams.set('bookingUserId', state.bookingUserId);
            }

            const response = await fetch(`${BASE}/api/v1/user/booking-doctor-catalog?${searchParams.toString()}`);
            const data = await getResponseJson(response);

            if (!response.ok) {
                const isMissingAdvancedRoute = response.status === 404
                    && (data.code === 'ROUTE_NOT_FOUND' || String(data.message || '').toLowerCase().includes('could not be found'));

                if (!isMissingAdvancedRoute) {
                    throw new Error(data.message || 'Doctor pricing catalog load nahi ho paya');
                }

                setBookingCatalogApiMode('legacy');
                const legacyData = await loadLegacyBookingCatalog();
                state.supportsAdvancedBookingApi = false;
                applyCatalogState(legacyData, preserveSelection);

                if (!state.legacyCatalogWarningShown) {
                    state.legacyCatalogWarningShown = true;
                    showMessage(
                        'Current running app build me new doctor pricing API available nahi hai. Booking page default catalog par fallback hua hai. Full doctor-wise pricing aur quick groups ke liye app ko restart ya rebuild karein.',
                        'error'
                    );
                }
                return;
            }

            setBookingCatalogApiMode('advanced');
            state.supportsAdvancedBookingApi = true;
            applyCatalogState({
                selfDoctorId: data.selfDoctorId,
                catalog: data.catalog,
                groups: data.groups,
            }, preserveSelection);
        }

        async function loadCatalogSafely(options = {}) {
            try {
                await loadCatalog(options);
                return true;
            } catch (error) {
                applyEmptyCatalogState(Boolean(options.preserveSelection));
                logNonBlockingApiWarning('Catalog load failed, empty state applied', error);
                showMessage(
                    error.message || 'Catalog abhi load nahi ho paya. Page open rahega, lekin items API response aane ke baad hi dikhenge.',
                    'error'
                );
                return false;
            }
        }

        async function settleInitializationTasks(tasks = []) {
            const results = await Promise.allSettled(tasks.map((task) => task.run()));

            results.forEach((result, index) => {
                if (result.status !== 'rejected') {
                    return;
                }

                const task = tasks[index];
                logNonBlockingApiWarning(
                    `${task?.label || 'Initialization task'} failed during page setup, continuing`,
                    result.reason
                );
            });

            return results;
        }

        function addItemToSelection(item, options = {}) {
            const key = buildItemKey(item.itemType, item.itemId);
            if (state.lockedItems.has(key) || state.newSelectedItems.has(key)) {
                return false;
            }

            state.newSelectedItems.set(key, {
                ...item,
                selectedViaGroupId: options.groupId || item.selectedViaGroupId || '',
                selectedViaGroupName: options.groupName || item.selectedViaGroupName || '',
            });

            if (!options.skipRender) {
                renderEverything();
            }
            if (options.searchInput) {
                resetSearchInput(options.searchInput);
            }
            return true;
        }

        function removeItemFromSelection(itemKey, options = {}) {
            if (!itemKey) {
                return;
            }

            if (state.newSelectedItems.has(itemKey)) {
                state.newSelectedItems.delete(itemKey);
            } else if (isEditMode && state.lockedItems.has(itemKey)) {
                state.lockedItems.delete(itemKey);
            } else {
                return;
            }

            renderEverything();
            if (options.searchInput) {
                resetSearchInput(options.searchInput);
            }
        }

        function applyGroup(groupId) {
            const group = state.groups.find((entry) => toId(entry._id) === toId(groupId));
            if (!group) {
                return;
            }

            let addedCount = 0;
            ensureArray(group.items).forEach((groupItem) => {
                const normalizedItem = normalizeCatalogItem(groupItem, groupItem.itemType);
                if (!normalizedItem) return;

                if (addItemToSelection(normalizedItem, {
                    groupId: toId(group._id),
                    groupName: group.name || '',
                    skipRender: true,
                })) {
                    addedCount += 1;
                }
            });

            renderEverything();
            resetSearchInput(refs.groupSearch);

            if (addedCount === 0) {
                showMessage('Is group ke sab items already selected hain ya current doctor ke liye available nahi hain.', 'error');
            }
        }

        function syncRowsFromDom() {
            if (!refs.tableBody) return;

            refs.tableBody.querySelectorAll('tr[data-sample-type]').forEach((rowElement) => {
                const sampleType = rowElement.getAttribute('data-sample-type');
                const row = state.rowState.get(sampleType);
                if (!row) return;

                const barcodeInput = rowElement.querySelector('input[name="barcodeId"]');
                const confirmInput = rowElement.querySelector('input[name="confirmBarcodeId"]');

                if (barcodeInput && confirmInput) {
                    fillBarcodePair(barcodeInput, confirmInput);
                    row.barcodeId = barcodeInput.value.trim();
                    row.confirmBarcodeId = confirmInput.value.trim();
                }
            });
        }

        function validateBarcodes() {
            syncRowsFromDom();

            if (refs.duplicateBarcodeHint) {
                refs.duplicateBarcodeHint.style.display = 'none';
            }

            const barcodeMap = new Map();

            for (const row of state.rowState.values()) {
                const barcode = String(row.barcodeId || '').trim();
                const confirmBarcode = String(row.confirmBarcodeId || '').trim();

                if (!barcode || !confirmBarcode) {
                    throw new Error(`Barcode ${row.sampleType} sample ke liye required hai.`);
                }

                if (barcode !== confirmBarcode) {
                    throw new Error(`${barcode} aur ${confirmBarcode} match nahi kar rahe.`);
                }

                if (barcodeMap.has(barcode) && barcodeMap.get(barcode) !== row.sampleType) {
                    if (refs.duplicateBarcodeHint) {
                        refs.duplicateBarcodeHint.style.display = 'block';
                    }
                    throw new Error('Same barcode different sample type ke saath allowed nahi hai.');
                }

                barcodeMap.set(barcode, row.sampleType);
            }
        }

        function buildTablePayload() {
            syncRowsFromDom();

            return Array.from(state.rowState.values()).map((row) => ({
                typeOfSample: row.sampleType,
                barcodeId: row.barcodeId || row.confirmBarcodeId || '',
                confirmBarcodeId: row.confirmBarcodeId || row.barcodeId,
                testName: getUniqueStrings(row.testNames).join(', '),
                ids: dedupeRowIds(row.ids),
            }));
        }

        function buildPatientAgeText() {
            const ageValue = String(refs.ageValue?.value || '').trim();
            if (!ageValue) {
                return '';
            }

            return `${ageValue} ${refs.ageUnit?.value || 'years'}`.trim();
        }

        function getFormCommonFields() {
            return {
                barcodeId: refs.bookingId?.value || '',
                date: refs.bookingDate?.value || '',
                time: refs.bookingTime?.value || '',
                createdbyuser: resolveGlobalUsername(),
                courierName: refs.courierName?.value || '',
                courierId: refs.courierId?.value || '',
                patientName: refs.patientName?.value.trim() || '',
                year: buildPatientAgeText(),
                gender: refs.patientGender?.value || '',
                patientPhone: refs.patientPhone?.value || '',
                doctorName: refs.doctorName?.value || '',
                labName: refs.labName?.value || '',
                franchisee: refs.franchiseeSelect?.value || '',
                clinicalHistory: refs.clinicalHistory?.value || '',
                total: refs.total?.textContent || '0',
                userId: state.bookingUserId || state.rootUserId || '',
                discountamount: refs.discountAmount?.value || '',
                discountunit: String(refs.discountPercentage?.value || '').replace('%', ''),
            };
        }

        function appendCommonFormData(formData) {
            const fields = getFormCommonFields();
            const currentSelectedItems = getCurrentSelectedItems();
            Object.entries(fields).forEach(([key, value]) => formData.append(key, value));

            formData.append('subFranchisee', refs.franchiseeSelect?.value || '');
            formData.append('subFranchiseeId', getSelectedFranchiseeId() || '');

            const selectedDoctorOption = refs.doctorSelect?.selectedOptions?.[0];
            formData.append('savedDoctor', selectedDoctorOption?.textContent || '');
            formData.append('savedDoctorId', getSelectedDoctorId() || '');
            formData.append('savedDoctorEmail', selectedDoctorOption?.getAttribute('data-email') || '');

            const selectedLabOption = refs.labSelect?.selectedOptions?.[0];
            formData.append('savedLab', selectedLabOption?.textContent || '');
            formData.append('savedLabId', getSelectedLabId() || '');

            formData.append('testIds', JSON.stringify(currentSelectedItems.map((item) => item.itemId)));
            formData.append('selectedItems', JSON.stringify(getSelectedItemsForSave(currentSelectedItems)));
            formData.append('tableData', JSON.stringify(buildTablePayload()));
            if (isEditMode) {
                formData.append('replaceExistingSelection', 'true');
            }

            if (refs.fileInput?.files?.[0]) {
                formData.append('file', refs.fileInput.files[0]);
            }
        }
        async function submitNewBooking() {
            hideMessage();

            if (!refs.patientName?.value.trim()) {
                showMessage('Patient name required hai.', 'error');
                refs.patientName?.focus();
                return;
            }

            if (state.newSelectedItems.size === 0) {
                showMessage('At least ek test, panel ya package select kariye.', 'error');
                return;
            }

            try {
                validateBarcodes();
            } catch (error) {
                showMessage(error.message || 'Barcode validation failed.', 'error');
                return;
            }

            const formData = new FormData();
            appendCommonFormData(formData);

            setLoading(true);
            try {
                const response = await fetch(`${BASE}/api/v1/user/new-booking`, {
                    method: 'POST',
                    body: formData,
                });
                const data = await getResponseJson(response);

                if (!response.ok) {
                    throw new Error(getResponseMessage(data, 'Booking save nahi ho saki'));
                }

                showMessage(data.message || 'Booking successfully create ho gayi.', 'success');
                setTimeout(() => {
                    if (typeof window.loadPage === 'function') {
                        window.loadPage('allcases');
                    }
                }, 500);
            } catch (error) {
                showMessage(error.message || 'Booking create karte waqt error aaya.', 'error');
            } finally {
                setLoading(false);
            }
        }

        async function submitEditedBooking() {
            hideMessage();

            if (!refs.patientName?.value.trim()) {
                showMessage('Patient name required hai.', 'error');
                refs.patientName?.focus();
                return;
            }

            if (getCurrentSelectionSize() === 0) {
                showMessage('Kam se kam ek test, panel ya package select kariye.', 'error');
                return;
            }

            try {
                validateBarcodes();
            } catch (error) {
                showMessage(error.message || 'Barcode validation failed.', 'error');
                return;
            }

            const formData = new FormData();
            appendCommonFormData(formData);

            setLoading(true);
            try {
                const response = await fetch(`${BASE}/api/v1/user/editbookingbookedtests`, {
                    method: 'POST',
                    body: formData,
                });
                const data = await getResponseJson(response);

                if (!response.ok) {
                    throw new Error(getResponseMessage(data, 'Booking update nahi ho saki'));
                }

                showMessage(data.message || 'Booking successfully update ho gayi.', 'success');
                setTimeout(() => {
                    if (typeof window.loadPage === 'function') {
                        window.loadPage('allcases');
                    }
                }, 700);
            } catch (error) {
                showMessage(error.message || 'Booking edit karte waqt error aaya.', 'error');
            } finally {
                setLoading(false);
            }
        }

        function hydrateLockedItemsFromBooking(booking) {
            state.lockedItems = new Map();
            state.existingSampleBarcodes = new Map();

            ensureArray(booking?.tableData).forEach((row) => {
                const sampleType = String(row.typeOfSample || '').trim();
                const barcode = row.barcodeId || row.confirmBarcodeId || '';
                if (sampleType && barcode) {
                    state.existingSampleBarcodes.set(sampleType, barcode);
                }
            });

            if (ensureArray(booking?.selectedItems).length > 0) {
                booking.selectedItems.forEach((item) => {
                    const itemType = normalizeItemType(item.itemType || item.collectionName);
                    const itemId = toId(item.itemId || item.id);
                    if (!itemType || !itemId) return;

                    const key = buildItemKey(itemType, itemId);
                    state.lockedItems.set(key, {
                        itemType,
                        itemId,
                        collectionName: item.collectionName || COLLECTION_BY_TYPE[itemType],
                        itemName: item.itemName || '',
                        shortName: item.shortName || '',
                        sampleTypes: ensureArray(item.sampleTypes),
                        price: toNumber(item.price),
                        selectedViaGroupId: toId(item.selectedViaGroupId),
                        selectedViaGroupName: item.selectedViaGroupName || '',
                    });
                });
                return;
            }

            ensureArray(booking?.tableData).forEach((row) => {
                ensureArray(row.ids).forEach((entry) => {
                    const itemType = normalizeItemType(entry.collectionName);
                    const itemId = toId(entry.id);
                    if (!itemType || !itemId) return;

                    const key = buildItemKey(itemType, itemId);
                    if (state.lockedItems.has(key)) return;

                    state.lockedItems.set(key, {
                        itemType,
                        itemId,
                        collectionName: entry.collectionName || COLLECTION_BY_TYPE[itemType],
                        itemName: '',
                        shortName: '',
                        sampleTypes: row.typeOfSample ? [row.typeOfSample] : [],
                        price: 0,
                        selectedViaGroupId: '',
                        selectedViaGroupName: '',
                    });
                });
            });
        }

        function populateEditBarcodeForm() {
            if (!refs.editForm || !state.booking) return;

            refs.editForm.innerHTML = '';

            ensureArray(state.booking.tableData).forEach((row) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'flex flex-col sm:flex-row sm:items-center gap-2 mb-3';
                wrapper.innerHTML = `
                    <span class="text-sm text-gray-600 w-32">${escapeHtml(row.typeOfSample || 'Sample Type')}</span>
                    <input
                        type="text"
                        id="${escapeHtml(toId(row._id))}"
                        value="${escapeHtml(row.barcodeId || row.confirmBarcodeId || '')}"
                        class="mt-1 block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:ring-blue-200"
                    />
                `;
                refs.editForm.appendChild(wrapper);
            });
        }

        async function loadExistingBooking() {
            const urlParams = new URLSearchParams(window.location.search);
            const storedRegId = safeJsonParse(localStorage.getItem('regId') || 'null', null);
            const storedBooking = safeJsonParse(localStorage.getItem('booking') || 'null', null);
            const sessionRegId = safeJsonParse(sessionStorage.getItem('regId') || 'null', null);
            const sessionBooking = safeJsonParse(sessionStorage.getItem('booking') || 'null', null);
            const bookingId = urlParams.get('id')
                || urlParams.get('value1')
                || urlParams.get('Name')
                || sessionRegId
                || storedRegId
                || sessionBooking?.bookingId
                || storedBooking?.bookingId;

            if (!bookingId) {
                throw new Error('Booking ID nahi mila');
            }

            const response = await fetch(`${BASE}/api/v1/user/getbooking`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ value1: bookingId }),
            });

            const payload = await getResponseJson(response);
            if (!response.ok) {
                throw new Error(getResponseMessage(payload, 'Booking load nahi ho saki'));
            }

            const booking = payload.data || payload;
            state.booking = booking;
            state.bookingUserId = toId(booking.createdBy) || state.bookingUserId;

            if (refs.bookingId) refs.bookingId.value = booking.bookingId || '';
            if (refs.bookingDate) refs.bookingDate.value = formatDateForInput(booking.date);
            if (refs.bookingTime) refs.bookingTime.value = booking.time || '';
            if (refs.courierName) refs.courierName.value = booking.courierName || '';
            if (refs.courierId) refs.courierId.value = booking.courierId || '';
            if (refs.patientName) refs.patientName.value = booking.patientName || '';
            if (refs.patientPhone) refs.patientPhone.value = booking.patientPhone || '';
            if (refs.patientGender) refs.patientGender.value = booking.gender || 'Any';
            if (refs.clinicalHistory) refs.clinicalHistory.value = booking.clinicalHistory || '';
            if (refs.doctorName) refs.doctorName.value = booking.doctorName || booking.savedDoctor || '';
            if (refs.labName) refs.labName.value = booking.labName || booking.savedLab || '';
            if (refs.discountAmount) refs.discountAmount.value = toNumber(booking.discountamount) > 0 ? String(toNumber(booking.discountamount)) : '';

            const ageParts = parseAgeParts(booking.year);
            if (refs.ageValue) refs.ageValue.value = ageParts.ageValue;
            if (refs.ageUnit) refs.ageUnit.value = ageParts.ageUnit;

            hydrateLockedItemsFromBooking(booking);
            populateEditBarcodeForm();
        }

        async function loadLastBooking() {
            const response = await fetch(`${BASE}/api/v1/user/last-booking`, {
                method: 'POST',
                credentials: 'include',
            });
            const data = await getResponseJson(response);

            if (!response.ok || data?.status === 'empty') {
                return;
            }

            if (refs.lastBookingId) refs.lastBookingId.textContent = data.bookingId || '_______';
            if (refs.lastBookingTime) refs.lastBookingTime.textContent = data.time || '______';
            if (refs.lastBookingTotal) refs.lastBookingTotal.textContent = data.total || '______';
            if (refs.lastBookingPatient) refs.lastBookingPatient.textContent = data.patientName || '______';

            if (refs.lastBookingDate && data.date) {
                refs.lastBookingDate.textContent = new Date(data.date).toLocaleDateString('en-US', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                });
            }
        }

        function setDoctorFromBooking() {
            if (!refs.doctorSelect) return;

            const bookingDoctorId = toId(state.booking?.savedDoctorId);
            const doctorIdToSelect = bookingDoctorId && state.doctors.some((doctor) => toId(doctor._id) === bookingDoctorId)
                ? bookingDoctorId
                : (state.selfDoctorId || refs.doctorSelect.value);

            refs.doctorSelect.value = doctorIdToSelect;
            state.selectedDoctorId = doctorIdToSelect;
            updateDoctorField();
        }

        function setLabFromBooking() {
            if (!refs.labSelect) return;

            const bookingLabId = toId(state.booking?.savedLabId);
            if (bookingLabId && state.labs.some((lab) => toId(lab._id) === bookingLabId)) {
                const matchingOption = Array.from(refs.labSelect.options).find((option) => toId(option.getAttribute('Lab-id')) === bookingLabId);
                if (matchingOption) {
                    refs.labSelect.value = matchingOption.value;
                }
            }

            updateLabField();
        }

        function setFranchiseeFromBooking() {
            if (!refs.franchiseeSelect) return;

            const bookingSubFranchiseeId = toId(state.booking?.subFranchiseeId);
            const bookingSubFranchiseeName = state.booking?.subFranchisee || state.booking?.franchisee || '';

            if (bookingSubFranchiseeId || bookingSubFranchiseeName) {
                const matchingOption = Array.from(refs.franchiseeSelect.options).find((option) =>
                    toId(option.getAttribute('data-id')) === bookingSubFranchiseeId
                    || option.value === bookingSubFranchiseeName
                );

                if (matchingOption) {
                    refs.franchiseeSelect.value = matchingOption.value;
                }
            }

            state.bookingUserId = getSelectedFranchiseeId() || toId(state.booking?.createdBy) || state.rootUserId || state.bookingUserId;
        }

        function resetDoctorForm() {
            if (refs.doctorFirstname) refs.doctorFirstname.value = '';
            if (refs.doctorLastname) refs.doctorLastname.value = '';
            if (refs.doctorEmail) refs.doctorEmail.value = '';
            if (refs.doctorSpecialization) refs.doctorSpecialization.value = '';
            if (refs.doctorDob) refs.doctorDob.value = '';
            if (refs.doctorGender) refs.doctorGender.value = 'male';
            if (refs.doctorAddress) refs.doctorAddress.value = '';
            if (refs.doctorPricingMode) refs.doctorPricingMode.value = 'default';
            if (refs.doctorPricingSource) refs.doctorPricingSource.value = state.selfDoctorId || '';
            if (refs.doctorOpenPricingManager) refs.doctorOpenPricingManager.checked = false;
            syncDoctorPricingMode();
        }

        function resetLabForm() {
            if (refs.labModalName) refs.labModalName.value = '';
            if (refs.labModalAddress) refs.labModalAddress.value = '';
        }

        async function createDoctor() {
            const payload = {
                firstname: refs.doctorFirstname?.value.trim() || '',
                lastname: refs.doctorLastname?.value.trim() || '',
                email: refs.doctorEmail?.value.trim() || '',
                specialization: refs.doctorSpecialization?.value.trim() || '',
                dob: refs.doctorDob?.value || '',
                gender: refs.doctorGender?.value || '',
                address: refs.doctorAddress?.value || '',
                userId: state.bookingUserId || state.rootUserId || '',
            };

            const validationError = validateDoctorPayload(payload, refs);
            if (validationError) {
                showMessage(validationError.message, 'error');
                focusField(validationError.field);
                return;
            }

            const response = await fetch(`${BASE}/api/v1/user/add-doctor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await getResponseJson(response);

            if (!response.ok) {
                throw new Error(data.message || 'Doctor create nahi ho paya');
            }

            const createdDoctor = data.data || data.doctor || data;
            const createdDoctorId = toId(createdDoctor?._id);
            const pricingMode = refs.doctorPricingMode?.value || 'default';
            const copySourceDoctorId = refs.doctorPricingSource?.value || state.selfDoctorId || '';
            const shouldOpenPricingManager = Boolean(refs.doctorOpenPricingManager?.checked);
            let postCreateMessage = data.message || 'Doctor successfully add ho gaya.';

            if (pricingMode === 'copy' && createdDoctorId && copySourceDoctorId) {
                if (state.supportsAdvancedBookingApi === false) {
                    postCreateMessage = 'Doctor add ho gaya. Is running app build me doctor pricing copy API available nahi hai. Updated build run karke pricing set karein.';
                } else {
                    try {
                        const copyResponse = await fetch(`${BASE}/api/v1/user/doctor-rate-card/${createdDoctorId}/copy`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ sourceDoctorId: copySourceDoctorId }),
                        });
                        const copyData = await getResponseJson(copyResponse);

                        if (!copyResponse.ok) {
                            throw new Error(getResponseMessage(copyData, 'Doctor create ho gaya, lekin pricing copy nahi ho payi'));
                        }
                    } catch (error) {
                        logNonBlockingApiWarning('Doctor pricing copy failed after doctor creation', error);
                        postCreateMessage = `${postCreateMessage} Pricing copy nahi ho payi. ${error.message || 'Manual pricing later set karein.'}`;
                    }
                }
            }

            resetDoctorForm();
            if (refs.doctorModal) refs.doctorModal.classList.remove('active');
            await fetchDoctors(createdDoctorId);
            if (createdDoctorId && refs.doctorSelect) {
                refs.doctorSelect.value = createdDoctorId;
                state.selectedDoctorId = createdDoctorId;
                updateDoctorField();
            }
            const catalogLoaded = await loadCatalogSafely({ preserveSelection: true });

            if (shouldOpenPricingManager && createdDoctorId && typeof window.loadPage === 'function') {
                if (state.supportsAdvancedBookingApi === false) {
                    showMessage('Doctor add ho gaya. Pricing manager current running build me available nahi hai. Updated build run karein.', 'success');
                    return;
                }
                window.loadPage('doctorPricing', createdDoctorId);
                return;
            }

            if (!catalogLoaded) {
                postCreateMessage = `${postCreateMessage} Catalog refresh turant complete nahi hua, ek baar page reload karke verify kar lijiye.`;
            }

            showMessage(postCreateMessage, 'success');
        }

        async function createLab() {
            const payload = {
                LabName: refs.labModalName?.value.trim() || '',
                LabAddress: refs.labModalAddress?.value || '',
                userId: state.bookingUserId || state.rootUserId || '',
            };

            const validationError = validateLabPayload(payload, refs);
            if (validationError) {
                showMessage(validationError.message, 'error');
                focusField(validationError.field);
                return;
            }

            const response = await fetch(`${BASE}/api/v1/user/add-Lab`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await getResponseJson(response);

            if (!response.ok) {
                throw new Error(getResponseMessage(data, 'Lab create nahi ho payi'));
            }

            const createdLab = data.data || data.lab || data;
            const createdLabId = toId(createdLab?._id);

            resetLabForm();
            if (refs.labModal) refs.labModal.style.display = 'none';
            await fetchLabs(createdLabId);
            if (createdLabId && refs.labSelect) {
                const matchingOption = Array.from(refs.labSelect.options || []).find(
                    (option) => toId(option.getAttribute('Lab-id')) === createdLabId
                );
                if (matchingOption) {
                    refs.labSelect.value = matchingOption.value;
                    updateLabField();
                }
            }
            showMessage(data.message || 'Lab successfully add ho gayi.', 'success');
        }

        function openGroupModal(modeName) {
            if (!refs.bookingGroupModal) return;
            if (state.supportsAdvancedBookingApi === false) {
                showMessage('Quick groups current running build me available nahi hain. Updated app rebuild ya restart karein.', 'error');
                return;
            }

            const availableGroups = getEditableGroups();
            state.currentGroupMode = modeName === 'update' ? 'update' : 'create';
            state.groupSelectionId = '';

            refs.bookingGroupModalTitle.textContent = state.currentGroupMode === 'update' ? 'Update Quick Group' : 'Save Quick Group';
            refs.confirmBookingGroupSave.textContent = state.currentGroupMode === 'update' ? 'Update Group' : 'Save Group';

            refs.bookingGroupExistingSelect.innerHTML = [
                '<option value="">Select group</option>',
                ...availableGroups.map((group) => `<option value="${escapeHtml(toId(group._id))}">${escapeHtml(group.name || '')} (${escapeHtml(GROUP_SCOPE_LABEL[group.scope] || 'Group')})</option>`),
            ].join('');

            refs.bookingGroupExistingSelect.disabled = state.currentGroupMode !== 'update';
            refs.bookingGroupName.value = '';
            refs.bookingGroupDescription.value = '';

            if (state.currentGroupMode === 'update' && availableGroups.length > 0) {
                refs.bookingGroupExistingSelect.value = toId(availableGroups[0]._id);
                populateGroupModalFromSelection(toId(availableGroups[0]._id));
            }

            refs.bookingGroupModal.classList.add('active');
        }

        function closeGroupModal() {
            if (refs.bookingGroupModal) {
                refs.bookingGroupModal.classList.remove('active');
            }
        }

        function populateGroupModalFromSelection(groupId) {
            const group = getEditableGroups().find((entry) => toId(entry._id) === toId(groupId));
            if (!group) return;

            state.groupSelectionId = toId(group._id);
            refs.bookingGroupName.value = group.name || '';
            refs.bookingGroupDescription.value = group.description || '';
        }

        async function saveCurrentSelectionAsGroup() {
            if (state.supportsAdvancedBookingApi === false) {
                throw new Error('Quick groups current running build me available nahi hain. Updated app rebuild ya restart karein.');
            }

            if (state.newSelectedItems.size === 0) {
                throw new Error('Group save karne ke liye pehle items select kariye.');
            }

            const payload = {
                name: refs.bookingGroupName?.value.trim() || '',
                description: refs.bookingGroupDescription?.value.trim() || '',
                scope: 'common',
                doctorId: null,
                items: Array.from(state.newSelectedItems.values()).map((item) => ({
                    itemType: item.itemType,
                    itemId: item.itemId,
                })),
            };

            if (!payload.name) {
                throw new Error('Quick group name required hai.');
            }

            const method = state.currentGroupMode === 'update' ? 'PUT' : 'POST';
            const targetGroupId = state.groupSelectionId || refs.bookingGroupExistingSelect?.value || '';
            const url = state.currentGroupMode === 'update'
                ? `${BASE}/api/v1/user/booking-quick-groups/${targetGroupId}`
                : `${BASE}/api/v1/user/booking-quick-groups`;

            if (state.currentGroupMode === 'update' && !toId(targetGroupId)) {
                throw new Error('Update ke liye existing group select kariye.');
            }

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await getResponseJson(response);

            if (!response.ok) {
                throw new Error(data.message || 'Quick group save nahi ho paya');
            }

            await loadCatalog({ preserveSelection: true });
            closeGroupModal();
            showMessage(data.message || 'Quick group successfully save ho gaya.', 'success');
        }

        async function cancelCurrentBooking() {
            if (!state.booking?.bookingId) return;

            const confirmed = window.confirm('Kya aap sure hain ki aap booking cancel karna chahte hain?');
            if (!confirmed) {
                return;
            }

            const response = await fetch(`${BASE}/api/v1/user/bookings/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId: state.booking.bookingId }),
            });
            const data = await getResponseJson(response);

            if (!response.ok) {
                throw new Error(data.message || 'Booking cancel nahi ho saki');
            }

            showMessage(data.message || 'Booking successfully cancel ho gayi.', 'success');
            setTimeout(() => {
                if (typeof window.loadPage === 'function') {
                    window.loadPage('allcases');
                }
            }, 700);
        }

        async function saveEditedBarcodes() {
            if (!state.booking?._id) {
                return;
            }

            const tableData = ensureArray(state.booking.tableData).map((row) => ({ ...row }));
            const inputs = refs.editForm?.querySelectorAll('input') || [];

            inputs.forEach((input) => {
                const rowId = toId(input.id);
                tableData.forEach((row) => {
                    if (toId(row._id) === rowId) {
                        row.barcodeId = input.value.trim();
                    }
                });
            });

            const response = await fetch(`${BASE}/api/v1/user/editBookingBarcodes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: state.booking._id,
                    tableData,
                }),
            });
            const data = await getResponseJson(response);

            if (!response.ok) {
                throw new Error(getResponseMessage(data, 'Barcode update nahi ho saki'));
            }

            state.booking.tableData = tableData;
            hydrateLockedItemsFromBooking(state.booking);
            if (refs.editPopup) refs.editPopup.classList.add('hidden');
            showMessage(data.message || 'Barcode successfully update ho gaye.', 'success');
        }
        function bindCoreEvents() {
            refs.availableList?.addEventListener('click', (event) => {
                const target = event.target.closest('[data-action="select-item"]');
                if (!target) return;

                const item = state.catalogMap.get(target.getAttribute('data-item-key'));
                if (!item) return;

                addItemToSelection(item, { searchInput: refs.availableSearch });
            });

            refs.selectedList?.addEventListener('click', (event) => {
                const target = event.target.closest('[data-action="remove-item"]');
                if (!target) return;

                removeItemFromSelection(target.getAttribute('data-item-key'), { searchInput: refs.selectedSearch });
            });

            refs.groupList?.addEventListener('click', (event) => {
                const target = event.target.closest('[data-action="apply-group"]');
                if (!target) return;

                applyGroup(target.getAttribute('data-group-id'));
            });

            refs.availableSearch?.addEventListener('input', renderAvailableItems);
            refs.selectedSearch?.addEventListener('input', renderSelectedItems);
            refs.groupSearch?.addEventListener('input', renderGroups);
            refs.discountAmount?.addEventListener('input', syncDiscountDisplay);
            refs.availableSearch?.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;

                event.preventDefault();
                const rawQuery = refs.availableSearch?.value || '';
                const hasQuickCodePattern = parseQuickCodeInput(rawQuery).length > 0;
                const quickCodeMatches = selectItemsByQuickCodes(rawQuery);
                if (quickCodeMatches > 0) {
                    return;
                }
                if (hasQuickCodePattern) {
                    showMessage('Entered quick codes se koi available item match nahi hua.', 'error');
                    resetSearchInput(refs.availableSearch);
                    return;
                }

                const firstItem = getFilteredAvailableItems(String(rawQuery).trim().toLowerCase())[0];
                if (!firstItem) return;

                addItemToSelection(firstItem, { searchInput: refs.availableSearch });
            });
            refs.selectedSearch?.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;

                event.preventDefault();
                const firstItem = getFilteredSelectedItems(String(refs.selectedSearch?.value || '').trim().toLowerCase())
                    .find((item) => item.isRemovable);
                if (!firstItem) return;

                removeItemFromSelection(buildItemKey(firstItem.itemType, firstItem.itemId), { searchInput: refs.selectedSearch });
            });
            refs.groupSearch?.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;

                event.preventDefault();
                const firstGroup = getFilteredGroups(String(refs.groupSearch?.value || '').trim().toLowerCase())[0];
                if (!firstGroup) return;

                applyGroup(firstGroup._id);
            });

            refs.doctorSelect?.addEventListener('change', async () => {
                try {
                    await loadCatalog({ preserveSelection: true });
                } catch (error) {
                    showMessage(error.message || 'Doctor pricing refresh nahi ho paya.', 'error');
                }
            });

            refs.labSelect?.addEventListener('change', updateLabField);

            refs.franchiseeSelect?.addEventListener('change', async () => {
                state.bookingUserId = getSelectedFranchiseeId() || state.rootUserId || state.bookingUserId;
                try {
                    await loadCatalog({ preserveSelection: true });
                } catch (error) {
                    showMessage(error.message || 'Franchisee change ke baad pricing refresh nahi hua.', 'error');
                }
            });

            refs.openDoctorBtn?.addEventListener('click', () => {
                resetDoctorForm();
                renderDoctorPricingSources();
                syncDoctorPricingMode();
                refs.doctorModal?.classList.add('active');
            });
            refs.doctorCloseBtn?.addEventListener('click', () => refs.doctorModal?.classList.remove('active'));
            refs.doctorFooterCloseBtn?.addEventListener('click', () => refs.doctorModal?.classList.remove('active'));
            refs.doctorModal?.addEventListener('click', (event) => {
                if (event.target === refs.doctorModal) {
                    refs.doctorModal.classList.remove('active');
                }
            });
            refs.doctorPricingMode?.addEventListener('change', syncDoctorPricingMode);

            refs.openLabBtn?.addEventListener('click', () => {
                if (refs.labModal) refs.labModal.style.display = 'flex';
            });
            refs.closeLabBtn?.addEventListener('click', () => {
                if (refs.labModal) refs.labModal.style.display = 'none';
            });
            refs.labModal?.addEventListener('click', (event) => {
                if (event.target === refs.labModal) {
                    refs.labModal.style.display = 'none';
                }
            });

            refs.addDoctorBtn?.addEventListener('click', async () => {
                try {
                    await createDoctor();
                } catch (error) {
                    showMessage(error.message || 'Doctor add nahi ho paya.', 'error');
                }
            });

            refs.addLabBtn?.addEventListener('click', async () => {
                try {
                    await createLab();
                } catch (error) {
                    showMessage(error.message || 'Lab add nahi ho payi.', 'error');
                }
            });

            refs.saveGroupFromBookingBtn?.addEventListener('click', () => openGroupModal('create'));
            refs.updateGroupFromBookingBtn?.addEventListener('click', () => {
                if (getEditableGroups().length === 0) {
                    showMessage('Update karne ke liye koi quick group available nahi hai.', 'error');
                    return;
                }
                openGroupModal('update');
            });
            refs.closeBookingGroupModal?.addEventListener('click', closeGroupModal);
            refs.cancelBookingGroupModal?.addEventListener('click', closeGroupModal);
            refs.bookingGroupModal?.addEventListener('click', (event) => {
                if (event.target === refs.bookingGroupModal) {
                    closeGroupModal();
                }
            });
            refs.bookingGroupExistingSelect?.addEventListener('change', (event) => populateGroupModalFromSelection(event.target.value));
            refs.confirmBookingGroupSave?.addEventListener('click', async () => {
                try {
                    await saveCurrentSelectionAsGroup();
                } catch (error) {
                    showMessage(error.message || 'Quick group save nahi ho paya.', 'error');
                }
            });
        }

        function bindEditModeEvents() {
            if (!isEditMode) return;

            refs.submitBtn?.addEventListener('click', submitEditedBooking);
            refs.cancelBookingBtn?.addEventListener('click', async () => {
                try {
                    await cancelCurrentBooking();
                } catch (error) {
                    showMessage(error.message || 'Booking cancel nahi ho saki.', 'error');
                }
            });
            refs.openEditPopup?.addEventListener('click', () => refs.editPopup?.classList.remove('hidden'));
            refs.closeEditPopup?.addEventListener('click', () => refs.editPopup?.classList.add('hidden'));
            refs.saveEditForm?.addEventListener('click', async () => {
                try {
                    await saveEditedBarcodes();
                } catch (error) {
                    showMessage(error.message || 'Barcode update nahi ho paye.', 'error');
                }
            });
        }

        function bindNewModeEvents() {
            if (isEditMode) return;

            refs.submitBtn?.addEventListener('click', submitNewBooking);
        }

        async function initializeNewBookingPage() {
            if (refs.bookingId) {
                refs.bookingId.value = generateBookingId();
            }

            setCurrentDateTime();
            hideSingleLayerFields();

            await settleInitializationTasks([
                { label: 'Doctors list', run: () => fetchDoctors() },
                { label: 'Labs list', run: () => fetchLabs() },
                { label: 'Franchisee list', run: () => fetchSubFranchisees() },
                { label: 'Last booking summary', run: () => loadLastBooking() },
            ]);

            state.bookingUserId = getSelectedFranchiseeId() || state.rootUserId || state.bookingUserId;
            await loadCatalogSafely({ preserveSelection: false });
        }

        async function initializeEditBookingPage() {
            hideSingleLayerFields();

            await loadExistingBooking();
            await settleInitializationTasks([
                { label: 'Doctors list', run: () => fetchDoctors(toId(state.booking?.savedDoctorId)) },
                { label: 'Labs list', run: () => fetchLabs(toId(state.booking?.savedLabId)) },
                {
                    label: 'Franchisee list',
                    run: () => fetchSubFranchisees(
                        toId(state.booking?.subFranchiseeId),
                        state.booking?.subFranchisee || state.booking?.franchisee || ''
                    ),
                },
                { label: 'Last booking summary', run: () => loadLastBooking() },
            ]);

            setDoctorFromBooking();
            setLabFromBooking();
            setFranchiseeFromBooking();
            await loadCatalogSafely({ preserveSelection: false });
            renderEverything();
        }

        try {
            hideMessage();
            setLoading(true);
            bindCoreEvents();
            bindNewModeEvents();
            bindEditModeEvents();

            if (isEditMode) {
                await initializeEditBookingPage();
            } else {
                await initializeNewBookingPage();
            }
        } catch (error) {
            console.error('Booking page initialization failed:', error);
            showMessage(error.message || 'Booking page initialize nahi ho paayi.', 'error');
        } finally {
            setLoading(false);
        }
    };
})();
