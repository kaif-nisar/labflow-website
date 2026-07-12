function showRatelist(list) {
    document.getElementById('in-ratelist').classList.add('hidden');
    document.getElementById('not-in-ratelist').classList.add('hidden');
    document.getElementById('in-ratelist-tab').classList.remove('active');
    document.getElementById('not-in-ratelist-tab').classList.remove('active');
    
    if (list === 'in-ratelist') {
        document.getElementById('in-ratelist').classList.remove('hidden');
        document.getElementById('in-ratelist-tab').classList.add('active');
    } else {
        document.getElementById('not-in-ratelist').classList.remove('hidden');
        document.getElementById('not-in-ratelist-tab').classList.add('active');
    }
}


async function fetchingpackagesfromDatabase() {
    const loader = document.querySelector(".loader");
    loader.style.display = "block";
    try {
        const response = await fetch(`${BASE_URL}/api/v1/user/all-packages-tenant`,{method:"POST"})

        if(!response.ok) {
            throw new Error("something went wrong while fetching details")
        }

        const packageData = await response.json();

        printpackagesInTable(packageData.packages);

    } catch (error) {
        console.log(error);
    } finally {
    loader.style.display = "none";
    }
}

function printpackagesInTable(allpackages) {
    const pannelTableBody = document.querySelector('#in-ratelist tbody');
    pannelTableBody.innerHTML = '';
    let orderId = 0;

    const noMatchRow = document.createElement("tr");
    noMatchRow.id = "noMatch";
    noMatchRow.style.display = "none";

    const cell = document.createElement("td");
    cell.setAttribute("colspan", "7");
    cell.textContent = "No matching row";
    cell.style.textAlign = "center";

    noMatchRow.appendChild(cell);
    pannelTableBody.appendChild(noMatchRow);

    allpackages.forEach(package => {
        const row = document.createElement('tr');
        orderId++;
        
        row.innerHTML = `
        <td><input type="checkbox" class="row-checkbox" value="${package._id}" onchange="toggleBulkDeleteBtn()"></td>
        <td>${orderId}</td>
        <td>${package.packageName}</td>
        <td>${package.packageFee}</td>
        <td>${package.pannelname},${package.testname}</td>
        <td>${package.testSample},${package.pannelSample}</td>
        <td class="actions" style="display: flex; gap: 15px; align-items: center; border: none;">
                <a href="#" onclick="loadPage('editPackage', '${package._id}')" title="Edit Package" style="color: #007bff; font-size: 1.1em; transition: color 0.2s;" onmouseover="this.style.color='#0056b3'" onmouseout="this.style.color='#007bff'"><i class="fa-solid fa-pen-to-square"></i></a>
                <a href="#" onclick="deletePackage('${package._id}')" title="Delete Package" style="color: #dc3545; font-size: 1.1em; transition: color 0.2s;" onmouseover="this.style.color='#c82333'" onmouseout="this.style.color='#dc3545'"><i class="fa-solid fa-trash"></i></a>
        </td>`

        pannelTableBody.appendChild(row);
    })
};

fetchingpackagesfromDatabase();

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

async function deletePackage(id) {
    if (confirm('Are you sure you want to delete this package?')) {
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/delete-packages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
                body: JSON.stringify({ packageIds: [id] })
            });
            const data = await response.json();
            if (response.ok) {
                alert('Package deleted successfully');
                fetchingpackagesfromDatabase();
            } else {
                alert(data.message || 'Error deleting package');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to delete package');
        }
    }
}

async function bulkDeletePackages() {
    const checkboxes = document.querySelectorAll('.row-checkbox:checked');
    const packageIds = Array.from(checkboxes).map(cb => cb.value);
    if (packageIds.length === 0) return;
    if (confirm(`Are you sure you want to delete ${packageIds.length} packages?`)) {
        try {
            const response = await fetch(`${BASE_URL}/api/v1/user/delete-packages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
                body: JSON.stringify({ packageIds })
            });
            const data = await response.json();
            if (response.ok) {
                alert('Packages deleted successfully');
                document.getElementById('selectAllCheckbox').checked = false;
                toggleBulkDeleteBtn();
                fetchingpackagesfromDatabase();
            } else {
                alert(data.message || 'Error deleting packages');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to delete packages');
        }
    }
}

function filterTable() {
    const searchInput = document.querySelector("#searchInput").value.toLowerCase(); // Get the search query
    const rows = document.querySelectorAll("#packagetbody tr");
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