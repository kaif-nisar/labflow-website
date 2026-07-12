const doctorPricingState = {
    doctors: [],
    selectedDoctorId: null,
    selfDoctorId: null,
    rateItems: [],
    filteredRateItems: [],
    groups: [],
    groupDraftItems: [],
};

const doctorPricingRefs = {
    doctorSelect: document.getElementById('doctorPricingSelect'),
    refreshBtn: document.getElementById('refreshDoctorPricingBtn'),
    searchInput: document.getElementById('rateCardSearchInput'),
    copySourceSelect: document.getElementById('copySourceDoctorSelect'),
    copyBtn: document.getElementById('copyRateCardBtn'),
    exportBtn: document.getElementById('exportRateCardBtn'),
    importInput: document.getElementById('importRateCardInput'),
    saveBtn: document.getElementById('saveRateCardBtn'),
    selfDoctorNote: document.getElementById('selfDoctorNote'),
    rateCardStatus: document.getElementById('rateCardStatus'),
    rateCardTableBody: document.getElementById('rateCardTableBody'),
    groupsList: document.getElementById('groupsList'),
    groupStatus: document.getElementById('groupStatus'),
    createGroupBtn: document.getElementById('createGroupBtn'),
    groupModalOverlay: document.getElementById('groupModalOverlay'),
    closeGroupModalBtn: document.getElementById('closeGroupModalBtn'),
    saveGroupBtn: document.getElementById('saveGroupBtn'),
    groupIdInput: document.getElementById('groupIdInput'),
    groupNameInput: document.getElementById('groupNameInput'),
    groupDescriptionInput: document.getElementById('groupDescriptionInput'),
    groupItemSearchInput: document.getElementById('groupItemSearchInput'),
    groupResultsList: document.getElementById('groupResultsList'),
    groupSelectedItems: document.getElementById('groupSelectedItems'),
    percentageInput: document.getElementById('percentageInput'),
    applyPercentageBtn: document.getElementById('applyPercentageBtn'),
};

function getDoctorPricingIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('Name') || '';
}

function setStatus(target, message, isError = false) {
    if (!target) return;
    target.textContent = message || '';
    target.classList.toggle('error', Boolean(message) && isError);
}

async function getApiJson(response) {
    return response.json().catch(() => ({}));
}

function isMissingAdvancedBookingRoute(response, data) {
    return response.status === 404
        && (data?.code === 'ROUTE_NOT_FOUND' || String(data?.message || '').toLowerCase().includes('could not be found'));
}

function getDoctorLabel(doctor) {
    return doctor.displayName || `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim();
}

async function fetchDoctorsForPricing() {
    const response = await fetch(`${BASE_URL}/api/v1/user/all-doctor`);
    if (!response.ok) {
        throw new Error('Failed to fetch doctors');
    }

    doctorPricingState.doctors = await response.json();
}

function renderDoctorSelect(initialRender = false) {
    // Only rebuild doctor select on initial render, not on change
    if (initialRender) {
        const requestedId = getDoctorPricingIdFromUrl();

        doctorPricingRefs.doctorSelect.innerHTML = doctorPricingState.doctors.map((doctor) => {
            if (doctor.isSystemDefault) {
                doctorPricingState.selfDoctorId = doctor._id;
            }
            return `<option value="${doctor._id}">${getDoctorLabel(doctor)}${doctor.isSystemDefault ? ' (Self)' : ''}</option>`;
        }).join('');

        doctorPricingState.selectedDoctorId = requestedId && doctorPricingState.doctors.some((doctor) => doctor._id === requestedId)
            ? requestedId
            : (doctorPricingState.selfDoctorId || doctorPricingState.doctors[0]?._id || null);

        if (doctorPricingState.selectedDoctorId) {
            doctorPricingRefs.doctorSelect.value = doctorPricingState.selectedDoctorId;
        }
    }

    // Always update copy source select based on current selected doctor
    doctorPricingRefs.copySourceSelect.innerHTML = [
        `<option value="${doctorPricingState.selfDoctorId}">Copy From Self</option>`,
        ...doctorPricingState.doctors
            .filter((doctor) => doctor._id !== doctorPricingState.selectedDoctorId)
            .map((doctor) => `<option value="${doctor._id}">${getDoctorLabel(doctor)}</option>`)
    ].join('');
}

async function loadRateCard() {
    if (!doctorPricingState.selectedDoctorId) return;

    const response = await fetch(`${BASE_URL}/api/v1/user/doctor-rate-card/${doctorPricingState.selectedDoctorId}`);
    const data = await getApiJson(response);

    if (!response.ok) {
        if (isMissingAdvancedBookingRoute(response, data)) {
            throw new Error('Current running app build me doctor pricing APIs available nahi hain. Updated build run ya rebuild karein.');
        }
        throw new Error(data.message || 'Failed to load doctor rate card');
    }

    doctorPricingState.selfDoctorId = data.selfDoctorId;
    doctorPricingState.rateItems = data.items || [];
    doctorPricingState.filteredRateItems = [...doctorPricingState.rateItems];

    const isSelf = doctorPricingState.selectedDoctorId === doctorPricingState.selfDoctorId;
    doctorPricingRefs.saveBtn.disabled = isSelf;
    doctorPricingRefs.copyBtn.disabled = isSelf;
    doctorPricingRefs.importInput.disabled = isSelf;
    doctorPricingRefs.selfDoctorNote.textContent = isSelf
        ? 'Self doctor current catalog prices use karta hai. Is doctor ke liye manual rate-card save disabled hai.'
        : 'Doctor price blank chhodne par booking me default catalog price lagega. Save karne par sirf filled items doctor-specific override ke roop me rahenge.';

    renderRateCardTable();
}

function renderRateCardTable() {
    const query = doctorPricingRefs.searchInput.value.trim().toLowerCase();
    doctorPricingState.filteredRateItems = doctorPricingState.rateItems.filter((item) => {
        const sampleText = (item.sampleTypes || []).join(', ').toLowerCase();
        return !query
            || item.itemName.toLowerCase().includes(query)
            || item.itemType.toLowerCase().includes(query)
            || String(item.bookingCode || '').includes(query)
            || sampleText.includes(query);
    });

    if (!doctorPricingState.filteredRateItems.length) {
        doctorPricingRefs.rateCardTableBody.innerHTML = '<tr><td colspan="5"><div class="empty-state">No catalog items found.</div></td></tr>';
        return;
    }

    doctorPricingRefs.rateCardTableBody.innerHTML = doctorPricingState.filteredRateItems.map((item) => `
        <tr>
            <td>${item.itemType}</td>
            <td>
                <strong>${item.itemName}</strong>
                <div class="group-result-meta">${item.shortName || item.itemId}${item.bookingCode ? ` | Code ${item.bookingCode}` : ''}</div>
            </td>
            <td>${(item.sampleTypes || []).join(', ') || '-'}</td>
            <td>Rs. ${Number(item.basePrice || 0).toFixed(2)}</td>
            <td>
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    class="rate-card-price-input"
                    data-item-type="${item.itemType}"
                    data-item-id="${item.itemId}"
                    value="${item.doctorPrice ?? ''}"
                    ${doctorPricingState.selectedDoctorId === doctorPricingState.selfDoctorId ? 'disabled' : ''}
                >
            </td>
        </tr>
    `).join('');
}

function syncRateItemsFromInputs() {
    document.querySelectorAll('.rate-card-price-input').forEach((input) => {
        const target = doctorPricingState.rateItems.find((item) =>
            item.itemType === input.dataset.itemType && item.itemId === input.dataset.itemId
        );
        if (target) {
            target.doctorPrice = input.value === '' ? null : Number(input.value);
        }
    });
}

function applyPercentageToAll() {
    const rawValue = doctorPricingRefs.percentageInput?.value;
    if (rawValue === '' || rawValue === null || rawValue === undefined) {
        setStatus(doctorPricingRefs.rateCardStatus, 'Please enter a percentage value.', true);
        return;
    }

    const pct = Number(rawValue);
    if (Number.isNaN(pct)) {
        setStatus(doctorPricingRefs.rateCardStatus, 'Invalid percentage value. Sirf number ya negative number dalein.', true);
        return;
    }

    if (doctorPricingState.selectedDoctorId === doctorPricingState.selfDoctorId) {
        setStatus(doctorPricingRefs.rateCardStatus, 'Self doctor ke liye pricing change disabled hai.', true);
        return;
    }

    syncRateItemsFromInputs();

    let updatedCount = 0;
    doctorPricingState.rateItems.forEach((item) => {
        const base = Number(item.basePrice || 0);
        if (base > 0) {
            item.doctorPrice = Math.round((base + (base * pct / 100)) * 100) / 100;
            updatedCount++;
        }
    });

    renderRateCardTable();

    const direction = pct >= 0 ? 'increased' : 'decreased';
    setStatus(doctorPricingRefs.rateCardStatus, `${updatedCount} items ${direction} by ${Math.abs(pct)}%. Review karke Save karein.`);
}

async function saveRateCard() {
    syncRateItemsFromInputs();
    setStatus(doctorPricingRefs.rateCardStatus, '');

    const items = doctorPricingState.rateItems
        .filter((item) => item.doctorPrice !== null && item.doctorPrice !== '' && !Number.isNaN(Number(item.doctorPrice)))
        .map((item) => ({
            itemType: item.itemType,
            itemId: item.itemId,
            price: Number(item.doctorPrice),
        }));

    const response = await fetch(`${BASE_URL}/api/v1/user/doctor-rate-card/${doctorPricingState.selectedDoctorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, replaceAll: true }),
    });
    const data = await getApiJson(response);

    if (!response.ok) {
        throw new Error(data.message || 'Failed to save doctor rate card');
    }

    setStatus(doctorPricingRefs.rateCardStatus, 'Doctor rate card saved successfully.');
    await loadRateCard();
}

async function copyRateCard() {
    const response = await fetch(`${BASE_URL}/api/v1/user/doctor-rate-card/${doctorPricingState.selectedDoctorId}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDoctorId: doctorPricingRefs.copySourceSelect.value }),
    });
    const data = await getApiJson(response);

    if (!response.ok) {
        throw new Error(data.message || 'Failed to copy rate card');
    }

    setStatus(doctorPricingRefs.rateCardStatus, 'Doctor rate card copied successfully.');
    await loadRateCard();
}

function exportRateCard() {
    syncRateItemsFromInputs();
    const rows = doctorPricingState.rateItems.map((item) => ({
        itemType: item.itemType,
        itemId: item.itemId,
        itemName: item.itemName,
        bookingCode: item.bookingCode ?? '',
        sampleTypes: (item.sampleTypes || []).join(', '),
        basePrice: Number(item.basePrice || 0),
        doctorPrice: item.doctorPrice ?? '',
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'RateCard');
    XLSX.writeFile(workbook, `${doctorPricingRefs.doctorSelect.selectedOptions[0]?.textContent || 'doctor-rate-card'}-rate-card.xlsx`);
}

async function importRateCard(file) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const importMap = new Map(rows.map((row) => [`${row.itemType}:${row.itemId}`, row]));

    doctorPricingState.rateItems = doctorPricingState.rateItems.map((item) => {
        const matched = importMap.get(`${item.itemType}:${item.itemId}`);
        return matched
            ? { ...item, doctorPrice: matched.doctorPrice === '' ? null : Number(matched.doctorPrice) }
            : item;
    });

    renderRateCardTable();
    setStatus(doctorPricingRefs.rateCardStatus, 'Excel imported. Review karke save karein.');
}

async function loadGroups() {
    const response = await fetch(`${BASE_URL}/api/v1/user/booking-quick-groups`);
    const data = await getApiJson(response);

    if (!response.ok) {
        if (isMissingAdvancedBookingRoute(response, data)) {
            throw new Error('Current running app build me quick group APIs available nahi hain. Updated build run ya rebuild karein.');
        }
        throw new Error(data.message || 'Failed to load quick groups');
    }

    doctorPricingState.groups = data.groups || data.commonGroups || [];
    renderGroupLists();
}

function renderGroupCards(target, groups, emptyText) {
    if (!target) return;

    if (!groups.length) {
        target.innerHTML = `<div class="empty-state">${emptyText}</div>`;
        return;
    }

    target.innerHTML = groups.map((group) => `
        <div class="group-item">
            <h4>${group.name}</h4>
            <p>${group.description || 'No description'}</p>
            <div class="group-item-meta">
                <span class="group-item-count"><i class="fas fa-list"></i> ${(group.items || []).length} items</span>
            </div>
            <div class="actions">
                <button class="btn-muted" data-group-action="edit" data-group-id="${group._id}"><i class="fas fa-pen"></i> Edit</button>
                <button class="btn-danger" data-group-action="delete" data-group-id="${group._id}"><i class="fas fa-trash"></i> Delete</button>
            </div>
        </div>
    `).join('');
}

function renderGroupLists() {
    renderGroupCards(doctorPricingRefs.groupsList, doctorPricingState.groups, 'No quick groups yet.');
}

function renderGroupDraftItems() {
    if (!doctorPricingState.groupDraftItems.length) {
        doctorPricingRefs.groupSelectedItems.innerHTML = '<div class="empty-state">No items selected.</div>';
        return;
    }

    doctorPricingRefs.groupSelectedItems.innerHTML = doctorPricingState.groupDraftItems.map((item) => `
        <span class="item-chip">
            ${item.itemName}
            <button data-remove-group-item="${item.itemType}:${item.itemId}"><i class="fas fa-times"></i></button>
        </span>
    `).join('');
}

function renderGroupResults() {
    const query = doctorPricingRefs.groupItemSearchInput.value.trim().toLowerCase();
    const selectedKeys = new Set(doctorPricingState.groupDraftItems.map((item) => `${item.itemType}:${item.itemId}`));
    const items = doctorPricingState.rateItems.filter((item) => {
        if (selectedKeys.has(`${item.itemType}:${item.itemId}`)) return false;
        return !query
            || item.itemName.toLowerCase().includes(query)
            || item.itemType.toLowerCase().includes(query)
            || String(item.bookingCode || '').includes(query)
            || (item.sampleTypes || []).join(', ').toLowerCase().includes(query);
    });

    if (!items.length) {
        doctorPricingRefs.groupResultsList.innerHTML = '<div class="empty-state">No matching items found.</div>';
        return;
    }

    doctorPricingRefs.groupResultsList.innerHTML = items.map((item) => `
        <div class="group-result-row">
            <div>
                <strong>${item.itemName}</strong>
                <div class="group-result-meta">${item.itemType} | ${(item.sampleTypes || []).join(', ') || '-'}${item.bookingCode ? ` | Code ${item.bookingCode}` : ''}</div>
            </div>
            <button class="btn-muted" data-add-group-item="${item.itemType}:${item.itemId}">Add</button>
        </div>
    `).join('');
}

function openGroupModal(group = null) {
    doctorPricingState.groupDraftItems = [];
    doctorPricingRefs.groupIdInput.value = '';
    doctorPricingRefs.groupNameInput.value = '';
    doctorPricingRefs.groupDescriptionInput.value = '';
    doctorPricingRefs.groupItemSearchInput.value = '';

    if (group) {
        doctorPricingRefs.groupIdInput.value = group._id;
        doctorPricingRefs.groupNameInput.value = group.name || '';
        doctorPricingRefs.groupDescriptionInput.value = group.description || '';
        doctorPricingState.groupDraftItems = (group.items || []).map((item) => ({
            itemType: item.itemType,
            itemId: item.itemId,
            itemName: item.itemName,
            sampleTypes: item.sampleTypes || [],
        }));
    }

    renderGroupDraftItems();
    renderGroupResults();
    doctorPricingRefs.groupModalOverlay.style.display = 'flex';
}

function closeGroupModal() {
    doctorPricingRefs.groupModalOverlay.style.display = 'none';
}

function findRateItemByKey(key) {
    return doctorPricingState.rateItems.find((item) => `${item.itemType}:${item.itemId}` === key) || null;
}

async function saveGroup() {
    if (!doctorPricingRefs.groupNameInput.value.trim()) {
        throw new Error('Group name is required');
    }

    if (!doctorPricingState.groupDraftItems.length) {
        throw new Error('At least one item is required in a group');
    }

    // Remove duplicate items (same itemType:itemId combination)
    const uniqueItems = [];
    const seenKeys = new Set();
    for (const item of doctorPricingState.groupDraftItems) {
        const key = `${item.itemType}:${item.itemId}`;
        if (!seenKeys.has(key)) {
            seenKeys.add(key);
            uniqueItems.push(item);
        }
    }

    const groupId = doctorPricingRefs.groupIdInput.value;
    const isUpdate = !!groupId;
    const endpoint = isUpdate
        ? `${BASE_URL}/api/v1/user/booking-quick-groups/${groupId}`
        : `${BASE_URL}/api/v1/user/booking-quick-groups`;

    const response = await fetch(endpoint, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: doctorPricingRefs.groupNameInput.value.trim(),
            description: doctorPricingRefs.groupDescriptionInput.value.trim(),
            scope: 'common',
            doctorId: null,
            items: uniqueItems.map((item) => ({
                itemType: item.itemType,
                itemId: item.itemId,
            })),
        }),
    });
    const data = await getApiJson(response);

    if (!response.ok) {
        throw new Error(data.message || 'Failed to save group');
    }

    closeGroupModal();
    setStatus(doctorPricingRefs.groupStatus, isUpdate ? 'Quick group updated successfully.' : 'Quick group created successfully.');
    await loadGroups();
}

async function deleteGroup(groupId) {
    const response = await fetch(`${BASE_URL}/api/v1/user/booking-quick-groups/${groupId}`, {
        method: 'DELETE',
    });
    const data = await getApiJson(response);

    if (!response.ok) {
        throw new Error(data.message || 'Failed to delete group');
    }

    setStatus(doctorPricingRefs.groupStatus, 'Quick group deleted successfully.');
    await loadGroups();
}

function attachDoctorPricingEvents() {
    doctorPricingRefs.doctorSelect.addEventListener('change', async () => {
        doctorPricingState.selectedDoctorId = doctorPricingRefs.doctorSelect.value;
        // Don't rebuild doctor select, only update copy source select
        renderDoctorSelect(false);
        await Promise.all([loadRateCard(), loadGroups()]);
    });

    doctorPricingRefs.refreshBtn.addEventListener('click', async () => {
        await Promise.all([loadRateCard(), loadGroups()]);
    });

    doctorPricingRefs.searchInput.addEventListener('input', () => {
        syncRateItemsFromInputs();
        renderRateCardTable();
    });
    doctorPricingRefs.copyBtn.addEventListener('click', async () => {
        try { await copyRateCard(); } catch (error) { setStatus(doctorPricingRefs.rateCardStatus, error.message, true); }
    });
    doctorPricingRefs.saveBtn.addEventListener('click', async () => {
        try { await saveRateCard(); } catch (error) { setStatus(doctorPricingRefs.rateCardStatus, error.message, true); }
    });
    doctorPricingRefs.exportBtn.addEventListener('click', exportRateCard);
    doctorPricingRefs.applyPercentageBtn.addEventListener('click', () => {
        try { applyPercentageToAll(); } catch (error) { setStatus(doctorPricingRefs.rateCardStatus, error.message, true); }
    });
    doctorPricingRefs.percentageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            try { applyPercentageToAll(); } catch (error) { setStatus(doctorPricingRefs.rateCardStatus, error.message, true); }
        }
    });
    doctorPricingRefs.importInput.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            setStatus(doctorPricingRefs.rateCardStatus, 'Importing Excel file...');
            await importRateCard(file);
            setStatus(doctorPricingRefs.rateCardStatus, 'Excel imported. Review karke save karein.');
        } catch (error) {
            setStatus(doctorPricingRefs.rateCardStatus, error.message, true);
        }
        event.target.value = '';
    });

    doctorPricingRefs.createGroupBtn.addEventListener('click', () => openGroupModal());
    doctorPricingRefs.closeGroupModalBtn.addEventListener('click', closeGroupModal);
    doctorPricingRefs.groupModalOverlay.addEventListener('click', (event) => {
        if (event.target === doctorPricingRefs.groupModalOverlay) {
            closeGroupModal();
        }
    });
    doctorPricingRefs.groupItemSearchInput.addEventListener('input', renderGroupResults);
    doctorPricingRefs.saveGroupBtn.addEventListener('click', async () => {
        try { await saveGroup(); } catch (error) { setStatus(doctorPricingRefs.groupStatus, error.message, true); }
    });

    document.addEventListener('click', async (event) => {
        const addKey = event.target.closest('[data-add-group-item]')?.dataset.addGroupItem;
        if (addKey) {
            const item = findRateItemByKey(addKey);
            if (item) {
                // Check if item already exists in draft items
                const alreadyExists = doctorPricingState.groupDraftItems.some(
                    (draftItem) => draftItem.itemType === item.itemType && draftItem.itemId === item.itemId
                );

                if (!alreadyExists) {
                    doctorPricingState.groupDraftItems.push({
                        itemType: item.itemType,
                        itemId: item.itemId,
                        itemName: item.itemName,
                        sampleTypes: item.sampleTypes || [],
                    });
                    renderGroupDraftItems();
                    renderGroupResults();
                }
            }
            return;
        }

        const removeKey = event.target.closest('[data-remove-group-item]')?.dataset.removeGroupItem;
        if (removeKey) {
            doctorPricingState.groupDraftItems = doctorPricingState.groupDraftItems.filter((item) => `${item.itemType}:${item.itemId}` !== removeKey);
            renderGroupDraftItems();
            renderGroupResults();
            return;
        }

        const editGroupId = event.target.closest('[data-group-action="edit"]')?.dataset.groupId;
        if (editGroupId) {
            const group = doctorPricingState.groups.find((item) => item._id === editGroupId);
            if (group) {
                openGroupModal(group);
            }
            return;
        }

        const deleteGroupId = event.target.closest('[data-group-action="delete"]')?.dataset.groupId;
        if (deleteGroupId) {
            try { await deleteGroup(deleteGroupId); } catch (error) { setStatus(doctorPricingRefs.groupStatus, error.message, true); }
        }
    });
}

async function initDoctorPricingPage() {
    try {
        await fetchDoctorsForPricing();
        renderDoctorSelect(true);  // Initial render only
        await Promise.all([loadRateCard(), loadGroups()]);
        attachDoctorPricingEvents();
    } catch (error) {
        setStatus(doctorPricingRefs.rateCardStatus, error.message || 'Failed to load doctor pricing page.', true);
    }
}

initDoctorPricingPage();
