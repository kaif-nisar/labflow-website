async function fetchingPannelsfromDatabase() {
    const loader = document.querySelector(".loader");
    loader.style.display = "block";

    try {
        const response = await fetch(`${BASE_URL}/api/v1/user/all-pannels`, { method: "POST" });

        if (!response.ok) {
            throw new Error("Something went wrong while fetching details");
        }

        const panelData = await response.json();

        populatePannelsTable(panelData);

    } catch (error) {
        console.log(error);
    } finally {
        loader.style.display = "none";
    }
}

async function populatePannelsTable(pannels) {
    // console.log(pannels)
    const tbody = document.querySelector("#pannel-table tbody");
    tbody.innerHTML = "";

    const noMatchRow = document.createElement("tr");
    noMatchRow.id = "noMatch";
    noMatchRow.style.display = "none";

    const cell = document.createElement("td");
    cell.setAttribute("colspan", "7");
    cell.textContent = "No matching row";
    cell.style.textAlign = "center";

    noMatchRow.appendChild(cell);
    tbody.appendChild(noMatchRow);
    // Sort pannels by the order field if available
    pannels.sort((a, b) => a.order - b.order);

    for (const pannel of pannels) {
        const row = document.createElement('tr');
        row.setAttribute('draggable', true);
        row.setAttribute('data-id', pannel.order); // Store order ID for reference

        // const catdoc = await loadcategory(pannel.category);

        row.innerHTML = `
            <td><input type="checkbox" class="row-checkbox" value="${pannel._id}" onchange="toggleBulkDeleteBtn()"></td>
            <td class="order"><i class="fa-solid fa-up-down"></i>${pannel.order}</td>
            <td>${pannel.name}</td>
            <td>${pannel.category.category}</td>
            <td>${pannel.price}</td>
            <td class="pannelTests">${pannel.tests}</td>
            <td>${pannel.sample_types}</td>
            <td class="actions" style="display: flex; gap: 15px; align-items: center; border: none;">
                <a href="#" onclick="loadPage('editPanels', '${pannel._id}')" title="Edit Panel" style="color: #007bff; font-size: 1.1em; transition: color 0.2s;" onmouseover="this.style.color='#0056b3'" onmouseout="this.style.color='#007bff'"><i class="fa-solid fa-pen-to-square"></i></a>
                <a href="#" onclick="deletePanel('${pannel._id}')" title="Delete Panel" style="color: #dc3545; font-size: 1.1em; transition: color 0.2s;" onmouseover="this.style.color='#c82333'" onmouseout="this.style.color='#dc3545'"><i class="fa-solid fa-trash"></i></a>
            </td>`;

        tbody.appendChild(row);
    }

    // Add drag-and-drop functionality
    addDragAndDropListeners();
}

function addDragAndDropListeners() {
    const rows = document.querySelectorAll("#pannel-table tbody tr");
    let draggedRow = null;

    rows.forEach(row => {
        // Drag Start
        row.addEventListener('dragstart', (e) => {
            draggedRow = row;
            row.classList.add('dragging');

            e.dataTransfer.setDragImage(new Image(), 0, 0);
        });

        // Drag Over
        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            const targetRow = e.target.closest('tr');
            if (targetRow && targetRow !== draggedRow) {
                targetRow.classList.add('drop-target');
            }
        });

        // Drag Leave
        row.addEventListener('dragleave', (e) => {
            const targetRow = e.target.closest('tr');
            if (targetRow) {
                targetRow.classList.remove('drop-target');
            }
        });

        // Drop
        row.addEventListener('drop', (e) => {
            e.preventDefault();

            const targetRow = e.target.closest('tr');
            if (targetRow && targetRow !== draggedRow) {
                const tbody = targetRow.parentElement;
                const draggedIndex = [...tbody.children].indexOf(draggedRow);
                const targetIndex = [...tbody.children].indexOf(targetRow);

                if (draggedIndex < targetIndex) {
                    tbody.insertBefore(draggedRow, targetRow.nextSibling);
                } else {
                    tbody.insertBefore(draggedRow, targetRow);
                }

                targetRow.classList.remove('drop-target');
            }
        });

        // Drag End
        row.addEventListener('dragend', () => {
            if (draggedRow) {
                draggedRow.classList.remove('dragging');
            }
            updateOrder(); // Save new order
        });
    });
}

function updateOrder() {
    const rows = document.querySelectorAll("#pannel-table tbody tr:not(#noMatch)");
    const updatedOrder = [];

    rows.forEach((row, index) => {
        const orderId = row.getAttribute('data-id');
        const orderCell = row.querySelector('td:first-child');
        orderCell.textContent = index + 1; // Update order visually
        updatedOrder.push({ id: orderId, order: index + 1 });
    });

    // Save new order to the server
    saveOrderToServer(updatedOrder);
}

async function saveOrderToServer(updatedOrder) {
    // Select table and container elements
    const tableContainer = document.getElementById("pannel-table"); // Assume this is the container holding the table
    const table = document.getElementById("categoriesTable");
    const loader = document.querySelector(".loader");
    loader.style.display = "block";

    // Hide the table container
    tableContainer.style.display = "none";
    try {
        const response = await fetch(`${BASE_URL}/api/v1/user/updatePannelOrdersuper`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ updatedOrder }),
        });

        if (!response.ok) {
            throw new Error("Failed to update order on server");
        }

        const result = await response.json();
        console.log("Order updated successfully:", result);
        location.reload();
    } catch (error) {
        console.error("Error updating order on server:", error);
        alert("Failed to save the order. Please try again.");
    } finally {
        // Show the table container and hide the loading animation
        tableContainer.style.display = "block";
        loader.style.display = "none";
    }
}
fetchingPannelsfromDatabase();

function filterTable() {
    const searchInput = document.querySelector("#searchInput").value.toLowerCase(); // Get the search query
    const rows = document.querySelectorAll("#panel-tbody tr");
    let match = false;

    rows.forEach(row => {

        if (row.id === "noMatch") return;

        const rowData = Array.from(row.cells)
            .map(cell => cell.textContent.toLowerCase())
            .join(" "); // Concatenate all cell text in a row

        // Show the row if it includes the search query, otherwise hide it
        if (rowData.includes(searchInput)) {
            row.style.display = ""; // Show row
            match = true;
        } else {
            row.style.display = "none"; // Hide row
        }

        const noMatchrow = document.getElementById("noMatch");
        if (match) {
            noMatchrow.style.display = "none";
        } else {
            noMatchrow.style.display = "";
        }
    });
}

function toggleSelectAll(selectAllCheckbox) {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
    toggleBulkDeleteBtn();
}

function toggleBulkDeleteBtn() {
    const checkboxes = document.querySelectorAll('.row-checkbox:checked');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    if (checkboxes.length > 0) {
        bulkDeleteBtn.style.display = 'inline-block';
    } else {
        bulkDeleteBtn.style.display = 'none';
    }
}

async function deletePanel(id) {
    if (confirm('Are you sure you want to delete this panel?')) {
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/delete-panels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
                body: JSON.stringify({ panelIds: [id] })
            });
            const data = await response.json();
            if (response.ok) {
                alert('Panel deleted successfully');
                fetchingPannelsfromDatabase();
            } else {
                alert(data.message || 'Error deleting panel');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to delete panel');
        }
    }
}

async function bulkDeletePanels() {
    const checkboxes = document.querySelectorAll('.row-checkbox:checked');
    const panelIds = Array.from(checkboxes).map(cb => cb.value);
    if (panelIds.length === 0) return;
    if (confirm(`Are you sure you want to delete ${panelIds.length} panels?`)) {
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/delete-panels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
                body: JSON.stringify({ panelIds })
            });
            const data = await response.json();
            if (response.ok) {
                alert('Panels deleted successfully');
                document.getElementById('selectAllCheckbox').checked = false;
                toggleBulkDeleteBtn();
                fetchingPannelsfromDatabase();
            } else {
                alert(data.message || 'Error deleting panels');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to delete panels');
        }
    }
}
