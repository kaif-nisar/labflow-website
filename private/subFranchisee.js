const BASE_URL = window.location.origin;
const portalGuard = window.AppPortalGuard.configure({
    loginPath: "/franchiseelogin.html",
    homePath: "/index.html",
    useFetchGuard: true,
});
let subscriptionServerOffsetMs = 0;
let subscriptionCountdownInterval = null;
let subscriptionStatusInterval = null;

function setPortalImage(target, source, type) {
    const element = typeof target === "string" ? document.getElementById(target) : target;
    if (!element) return;

    if (window.PortalUI && typeof window.PortalUI.setImageSource === "function") {
        window.PortalUI.setImageSource(element, source, { type });
        return;
    }

    if (source) {
        element.src = source;
    }
}

function syncSubscriptionServerClock(serverDateHeaderOrIso) {
    if (!serverDateHeaderOrIso) return;
    const serverTime = new Date(serverDateHeaderOrIso).getTime();
    if (Number.isFinite(serverTime)) {
        subscriptionServerOffsetMs = serverTime - Date.now();
    }
}

function subscriptionNow() {
    return Date.now() + subscriptionServerOffsetMs;
}

function getSubscriptionEffectiveEndDate(subscription) {
    return (
        subscription?.effectiveEndDate ||
        subscription?.gracePeriod?.graceUntil ||
        subscription?.endDate ||
        null
    );
}

function formatSubscriptionCountdown(endDate) {
    const diff = new Date(endDate).getTime() - subscriptionNow();
    if (diff <= 0) return "00d 00h 00m 00s";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);
    return `${String(days).padStart(2, "0")}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function getSubscriptionDaysLeft(endDate) {
    const diff = new Date(endDate).getTime() - subscriptionNow();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function ensureSubscriptionBannerShell() {
    if (document.getElementById("subscription-alert-bar")) return;
    const style = document.createElement("style");
    style.textContent = `
      .subscription-alert-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 2500;
        display: none;
        padding: 10px 14px;
        background: linear-gradient(90deg, #fff4cc 0%, #ffe8a3 100%);
        border-bottom: 1px solid #ffd666;
        color: #102a43;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-family: Arial, sans-serif;
      }
      .subscription-alert-content { font-size: 13px; font-weight: 600; }
      .subscription-alert-btn {
        border: 0;
        border-radius: 6px;
        background: #0052cc;
        color: #fff;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      @media (max-width: 760px) {
        .subscription-alert-bar { flex-direction: column; align-items: flex-start; }
      }
    `;
    document.head.appendChild(style);

    const bar = document.createElement("div");
    bar.id = "subscription-alert-bar";
    bar.className = "subscription-alert-bar";
    bar.innerHTML = `
      <div class="subscription-alert-content" id="subscription-alert-content"></div>
      <button class="subscription-alert-btn" id="subscription-recharge-btn">Recharge Now</button>
    `;
    document.body.appendChild(bar);
    document.getElementById("subscription-recharge-btn").addEventListener("click", showSubscriptionModal);
}

function hideSubscriptionBanner() {
    const bar = document.getElementById("subscription-alert-bar");
    if (bar) bar.style.display = "none";
    if (subscriptionCountdownInterval) {
        clearInterval(subscriptionCountdownInterval);
        subscriptionCountdownInterval = null;
    }
}

function renderSubscriptionBanner(subscription) {
    ensureSubscriptionBannerShell();
    const bar = document.getElementById("subscription-alert-bar");
    const content = document.getElementById("subscription-alert-content");
    const endDate = getSubscriptionEffectiveEndDate(subscription);

    if (!bar || !content || !endDate) {
        hideSubscriptionBanner();
        return;
    }

    const daysLeft = getSubscriptionDaysLeft(endDate);
    if (daysLeft > 7) {
        hideSubscriptionBanner();
        return;
    }

    if (subscriptionCountdownInterval) {
        clearInterval(subscriptionCountdownInterval);
        subscriptionCountdownInterval = null;
    }

    if (daysLeft <= 1) {
        const paint = () => {
            content.textContent = `Subscription expires in: ${formatSubscriptionCountdown(endDate)}`;
        };
        paint();
        subscriptionCountdownInterval = setInterval(paint, 1000);
    } else {
        content.textContent = `Subscription expires in ${daysLeft} day(s). Recharge now to avoid interruption.`;
    }

    bar.style.display = "flex";
}

async function refreshSubscriptionBanner() {
    try {
        const response = await fetch(`${BASE_URL}/api/v1/user/check-subscription`, {
            method: "POST",
            credentials: "include",
            __topLoaderSilent: true
        });
        syncSubscriptionServerClock(response.headers.get("date"));
        if (!response.ok) return;
        const payload = await response.json();
        renderSubscriptionBanner(payload?.subscription);
    } catch (error) {
        console.error("Subscription banner refresh failed:", error);
    }
}

// Global state management - single source of truth
const AppState = {
    userId: null,
    username: null,
    userRole: null,
    Name: null,
    role: null,
    user: null,
    email: null,
    currentPage: null,
    loadedScripts: new Map(), // Track loaded scripts by page name
    eventListeners: new Map(),
    intervals: new Set(),
    pageScriptIndex: 0 // Counter for unique script identification
};

// Cleanup manager for proper resource disposal
const CleanupManager = {
    cleanupFunctions: [],

    add(fn) {
        this.cleanupFunctions.push(fn);
    },

    executeAll() {
        this.cleanupFunctions.forEach(fn => {
            try {
                fn();
            } catch (error) {
                console.error('Cleanup error:', error);
            }
        });
        this.cleanupFunctions = [];
    }
};

// Event listener manager to prevent duplicates
function addManagedEventListener(element, event, handler, options) {
    if (!element) return;
    
    const key = `${element.id || element.tagName || 'unknown'}_${event}_${Date.now()}`;
    
    // Remove old listener if exists
    if (AppState.eventListeners.has(key)) {
        const { el, evt, hndlr } = AppState.eventListeners.get(key);
        el.removeEventListener(evt, hndlr);
    }
    
    element.addEventListener(event, handler, options);
    AppState.eventListeners.set(key, { el: element, evt: event, hndlr: handler });
    
    CleanupManager.add(() => {
        element.removeEventListener(event, handler);
        AppState.eventListeners.delete(key);
    });
}

// Managed interval
function addManagedInterval(callback, delay) {
    const intervalId = setInterval(callback, delay);
    AppState.intervals.add(intervalId);
    
    CleanupManager.add(() => {
        clearInterval(intervalId);
        AppState.intervals.delete(intervalId);
    });
    
    return intervalId;
}

// Initialize global event listeners (only once)
function initializeGlobalListeners() {
    const pdfBtn = document.getElementById('pdfBtn');
    if (pdfBtn && !pdfBtn.dataset.initialized) {
        pdfBtn.addEventListener('click', handlePdfGeneration);
        pdfBtn.dataset.initialized = 'true';
    }

    const fullscreenBtn = document.getElementById('fullscreen-button');
    if (fullscreenBtn && !fullscreenBtn.dataset.initialized) {
        fullscreenBtn.addEventListener('click', handleFullscreen);
        fullscreenBtn.dataset.initialized = 'true';
    }

    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn && !logoutBtn.dataset.initialized) {
        logoutBtn.addEventListener('click', logout);
        logoutBtn.dataset.initialized = 'true';
    }

    const poweroffIcon = document.getElementById('poweroff-icon');
    if (poweroffIcon && !poweroffIcon.dataset.initialized) {
        poweroffIcon.addEventListener('click', logout);
        poweroffIcon.dataset.initialized = 'true';
    }

    const userIcon = document.getElementById('user');
    if (userIcon && !userIcon.dataset.initialized) {
        userIcon.addEventListener('click', handleUserModal);
        userIcon.dataset.initialized = 'true';
    }

    const headphoneIcon = document.getElementById('headphone');
    if (headphoneIcon && !headphoneIcon.dataset.initialized) {
        headphoneIcon.addEventListener('click', handleSupportModal);
        headphoneIcon.dataset.initialized = 'true';
    }
}

// PDF generation handler
function handlePdfGeneration() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const table = document.querySelector('table');

    if (!table) {
        alert('No table found');
        return;
    }

    const tableRows = table.querySelectorAll('tbody tr');
    if (tableRows.length === 0) {
        alert('No data available for PDF generation');
        return;
    }

    const rows = [];
    const headers = Array.from(table.querySelectorAll('thead th')).map(header => header.innerText);
    rows.push(headers);

    tableRows.forEach(row => {
        const rowData = Array.from(row.querySelectorAll('td')).map(cell => cell.innerText);
        rows.push(rowData);
    });

    doc.autoTable({
        head: [headers],
        body: rows.slice(1),
        startY: 20,
        margin: { top: 10, left: 10, right: 10, bottom: 10 },
        theme: 'grid'
    });

    doc.save('test_profiles.pdf');
}

// Fullscreen handler
function handleFullscreen() {
    const icon = document.getElementById('logo1');
    
    if (document.fullscreenElement) {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        if (icon) {
            icon.classList.remove('fa-compress');
            icon.classList.add('fa-expand');
        }
    } else {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.mozRequestFullScreen) {
            document.documentElement.mozRequestFullScreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) {
            document.documentElement.msRequestFullscreen();
        }
        if (icon) {
            icon.classList.add('fa-compress');
            icon.classList.remove('fa-expand');
        }
    }
}

// Toggle sidebar
function tp() {
    const toggle = document.getElementById("toggle");
    const rightCon = document.getElementById("right-container");

    if (!toggle || !rightCon) return;

    const isSet = toggle.classList.toggle('hidden');

    if (isSet) {
        rightCon.classList.add("full-width");
    } else {
        rightCon.classList.remove("full-width");
    }
}

window.tp = tp;

// Toggle sub-items
function toggleSubItems(id) {
    const subItems = document.getElementById(id);
    if (!subItems) return;

    const toggleItem = subItems.previousElementSibling;

    if (subItems.style.display === "block") {
        subItems.style.display = "none";
    } else {
        subItems.style.display = "block";
    }

    if (toggleItem) {
        toggleItem.classList.toggle('expanded');
    }
}

window.toggleSubItems = toggleSubItems;

// Update user name display
async function updateUserNameDisplay() {
    const firstParagraph = document.querySelector('.name .name_text');
    if (firstParagraph && AppState.Name && AppState.username) {
        firstParagraph.innerHTML = `<h3>${AppState.Name} ${AppState.username}</h3>`;
    }
}

// Verify access token
async function verifyAccessToken() {
    try {
        const session = await portalGuard.ensureSession({
            type: "user",
            strict: true,
            expectedPortalRole: "subFranchisee",
            loginPath: "/franchiseelogin.html",
        });

        if (!session) {
            return false;
        }

        const data = {
            isAuthorized: true,
            user: session.user,
        };
        
        // Update AppState
        AppState.userId = data.user._id;
        AppState.userRole = data.user.role;
        AppState.username = data.user.username;
        AppState.email = data.user.email;
        AppState.Name = data.user.fullName;
        AppState.role = data.user.role;
        AppState.user = data.user;

        // Set global variables for backward compatibility
        window.userId = data.user._id;
        window.username = data.user.username;
        window.userRole = data.user.role;
        window.email = data.user.email;
        window.Name = data.user.fullName;
        window.role = data.user.role;
        window.user = data.user;

        setPortalImage("logo", data.user.tenantId?.logo, "logo");

        if (data.user?.tenantId?.subscriptionPlan?.isActive === false) {
            showSubscriptionModal();
        }
        renderSubscriptionBanner(data?.user?.tenantId?.subscriptionPlan);

        setTimeout(updateUserNameDisplay, 900);

        return true;
    } catch (error) {
        console.error('Error verifying access token:', error);
        return false;
    }
}

// Show subscription modal
function showSubscriptionModal() {
    const modal = document.getElementById('subscriptionModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
    document.addEventListener('keydown', blockEvent, true);
    document.addEventListener('click', blockEvent, true);

    CleanupManager.add(() => {
        document.removeEventListener('keydown', blockEvent, true);
        document.removeEventListener('click', blockEvent, true);
    });
}

function blockEvent(e) {
    const modal = document.getElementById('subscriptionModal');
    if (modal && modal.style.display === 'block') {
        if (!modal.contains(e.target)) {
            e.stopPropagation();
            e.preventDefault();
        }
    }
}

// Fetch assigned tests
async function fetchAssignedTests() {
    if (!AppState.userId) return;

    try {
        const [testResponse, panelResponse, packageResponse] = await Promise.all([
            fetch(`${BASE_URL}/api/v1/user/get-test?userId=${AppState.userId}`, { method: "POST" }),
            fetch(`${BASE_URL}/api/v1/user/get-all-pannels?userId=${AppState.userId}`, { method: "POST" }),
            fetch(`${BASE_URL}/api/v1/user/get-all-packages?userId=${AppState.userId}`, { method: "POST" })
        ]);

        if (!testResponse.ok || !panelResponse.ok || !packageResponse.ok) {
            throw new Error("One or more API requests failed");
        }

        const testData = await testResponse.json();
        const panelData = await panelResponse.json();
        const packageData = await packageResponse.json();

        const combinedData = [...testData, ...panelData, ...packageData];
        const tableBody = document.querySelector('table tbody');
        
        if (!tableBody) return;

        tableBody.innerHTML = "";

        combinedData.forEach((item, index) => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${item.testName || item.packageName || item.panelName}</td>
                <td>Rs. ${item.mrpPrice || "N/A"}</td>
                <td>Rs. ${item.myPrice || "N/A"}</td>
                <td>${item.tat || "N/A"}</td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Error fetching assigned tests:", error);
        alert("Unable to load data. Please try again later.");
    }
}

window.fetchAssignedTests = fetchAssignedTests;

// Initialize notifications
function initializeNotifications() {
    const toggleBtn = document.getElementById('toggleNotifications');
    const notificationContainer = document.getElementById('notificationContainer');

    if (!toggleBtn || !notificationContainer) return;

    if (toggleBtn.dataset.initialized) return;
    toggleBtn.dataset.initialized = 'true';

    toggleBtn.addEventListener('click', () => {
        const isShown = notificationContainer.classList.toggle('show');
        toggleBtn.setAttribute('aria-expanded', isShown);
        if (isShown) {
            notificationContainer.focus();
        } else {
            toggleBtn.focus();
        }
    });
}

// Fetch notifications
async function fetchNotifications() {
    try {
        const response = await fetch(`${BASE_URL}/api/v1/user/getnewnotificationforfranshisee`, { __topLoaderSilent: true });
        const data = await response.json();

        if (!response.ok || data.status === "empty") {
            return;
        }

        populateMessages(data);
    } catch (error) {
        console.error("Error fetching notifications:", error);
    }
}

function populateMessages(data) {
    const alertDiv = document.querySelector('.alert-div');
    if (!alertDiv) return;

    const messagesCountSpan = alertDiv.querySelector("#messageshint");
    const messagesContainer = alertDiv.querySelector("#notificationContainer");

    if (!messagesCountSpan || !messagesContainer) return;

    messagesCountSpan.textContent = data.length;
    messagesContainer.innerHTML = "";

    data.forEach((elem) => {
        const div = document.createElement('div');
        div.className = 'notification';
        div.setAttribute("role", "alert");
        div.setAttribute("data-objId", elem._id);

        div.innerHTML = `
            <span class="deletemsg" style="cursor:pointer;">✖</span>
            <strong>Booking ID:</strong> <span>${elem.relatedbooking?.bookingId || "N/A"}</span><br>
            <strong>Last Message:</strong> <span>${elem.lastMessage?.message || "No message"}</span><br>
            <strong>Patient Name:</strong> <span>${elem.relatedbooking?.patientName || "N/A"}</span><br>
            <strong>Franchisee:</strong> <span>${elem.relatedbooking?.createdBy?.username || "N/A"}</span>
        `;

        const deleteBtn = div.querySelector('.deletemsg');
        deleteBtn.addEventListener('click', async function () {
            const objId = div.getAttribute("data-objId");
            try {
                const response = await fetch(`${BASE_URL}/api/v1/user/changewatchedstatus/${objId}`);
                if (response.ok) {
                    div.remove();
                    if (messagesContainer.children.length === 0) {
                        messagesCountSpan.textContent = "";
                        messagesContainer.classList.remove('show');
                    } else {
                        messagesCountSpan.textContent = messagesContainer.children.length;
                    }
                }
            } catch (error) {
                console.error("Error updating conversation:", error.message);
            }
        });

        messagesContainer.appendChild(div);
    });
}

// Clear old page completely
function clearOldPage() {
    const container = document.querySelector('.right-container');
    if (!container) return;

    console.log('🧹 Cleaning old page...');

    // Execute all cleanup functions
    CleanupManager.executeAll();

    // Remove ALL scripts from container (including old page scripts)
    const scripts = container.querySelectorAll('script');
    scripts.forEach(script => {
        console.log('Removing script:', script.src || 'inline');
        script.remove();
    });

    // Clear HTML content
    container.innerHTML = '';
    
    console.log('✅ Old page cleaned');
}

// Load page with proper cleanup
async function loadPage(page, Name, _id, name) {
    const routeToken = window.AppTopLoader?.start(`route:${page}`);
    try {
        console.log('🔄 Loading page:', page);
        
        fetchNotifications();

        const isAuthorized = await verifyAccessToken();
        if (!isAuthorized) {
            return;
        }

        // Clear old page COMPLETELY
        clearOldPage();

        const container = document.querySelector('.right-container');
        if (!container) {
            console.error('❌ Container not found');
            return;
        }

        // Fetch new page HTML
        const response = await fetch(`pages/pages/${page}.html?t=${Date.now()}`, { __topLoaderSilent: true });
        if (!response.ok) {
            throw new Error(`Failed to load page: ${response.status}`);
        }
        
        const html = await response.text();
        container.innerHTML = html;
        console.log('✅ Page HTML loaded');

        AppState.currentPage = page;
        AppState.pageScriptIndex++;

        // ✅ CRITICAL: Use inline script with IIFE to prevent variable conflicts
        const scriptContent = await fetchScriptContent(page);
        
        if (scriptContent) {
            const inlineScript = document.createElement('script');
            inlineScript.type = 'text/javascript';
            
            // Wrap in IIFE to create isolated scope
            inlineScript.textContent = `
                (function() {
                    'use strict';
                    // Isolated scope - no variable conflicts
                    console.log('📜 Executing page script: ${page}');
                    
                    ${scriptContent}
                    
                    console.log('✅ Page script executed: ${page}');
                })();
            `;
            
            container.appendChild(inlineScript);
            console.log('✅ Script loaded and executed for:', page);
            
            // Dispatch event after script execution
            setTimeout(() => {
                const pageLoadEvent = new CustomEvent('pageDataReady', {
                    detail: {
                        userId: AppState.userId,
                        username: AppState.username,
                        userRole: AppState.userRole,
                        Name: AppState.Name,
                        role: AppState.role,
                        user: AppState.user,
                        email: AppState.email
                    }
                });
                window.dispatchEvent(pageLoadEvent);
            }, 50);
        }

        // Update URL
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('page', page);
        if (Name) urlParams.set('Name', encodeURIComponent(Name));
        if (_id) urlParams.set('_id', encodeURIComponent(_id));
        if (name) urlParams.set('name', encodeURIComponent(name));

        window.history.pushState({ page }, '', `?${urlParams.toString()}`);

        // Setup navigation links
        setTimeout(() => {
            reinitializeNavigation();
            
            document.querySelectorAll('.right-container a[data-page], .container a[data-page]').forEach(link => {
                const newLink = link.cloneNode(true);
                link.parentNode.replaceChild(newLink, link);
                
                newLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    console.log('🖱️ Link clicked:', newLink.getAttribute('data-page'));
                    const nextPage = newLink.getAttribute('data-page');
                    const nextName = newLink.getAttribute('data-test-name');
                    const nextId = newLink.getAttribute('data-id');
                    const pannelName = newLink.getAttribute('data-pannel-name');
                    loadPage(nextPage, nextName, nextId, pannelName);
                });
            });
            
            console.log('✅ Navigation links initialized');
        }, 100);

    } catch (error) {
        console.error('❌ Error loading page:', error);
        if (String(error?.message || "").includes("401")) {
            portalGuard.handleSessionFailure({
                loginPath: "/franchiseelogin.html",
                message: "Your session expired while loading this page.",
            });
            return;
        }

        window.AppPortalGuard.redirectToErrorPage({
            status: 404,
            title: "Page Not Found",
            message: "The requested module could not be loaded.",
            loginPath: "/franchiseelogin.html",
            homePath: "/subFranchisee/subFranchisee.html",
        });
    } finally {
        if (routeToken) {
            window.AppTopLoader.done(routeToken);
        }
    }
}

// Fetch script content as text
async function fetchScriptContent(page) {
    try {
        const response = await fetch(`pages/pages/${page}.js?t=${Date.now()}`, { __topLoaderSilent: true });
        if (!response.ok) {
            console.warn(`No script file found for page: ${page}`);
            if (response.status === 401) {
                portalGuard.handleSessionFailure({
                    loginPath: "/franchiseelogin.html",
                    message: "Your session expired while loading this page.",
                });
            }
            return null;
        }
        return await response.text();
    } catch (error) {
        console.error('Error fetching script:', error);
        return null;
    }
}

// Fetch wallet amount
async function fetchWalletAmount() {
    if (!AppState.userId) return;

    try {
        const response = await fetch(`${BASE_URL}/api/v1/user/wallet-amount/${AppState.userId}`, { __topLoaderSilent: true });
        if (!response.ok) throw new Error('Failed to fetch wallet amount');
        
        const data = await response.json();
        const walletElement = document.getElementById('walletAmount');
        if (walletElement) {
            walletElement.innerText = Math.round(data.wallet);
        }
    } catch (error) {
        console.error('Error fetching wallet amount:', error);
    }
}

// Logout function
function logout() {
    fetch(`${BASE_URL}/api/v1/user/logout`, {
        method: 'POST',
        credentials: 'include'
    })
        .then(response => {
            if (response.ok) {
                CleanupManager.executeAll();
                portalGuard.clearStoredSession();
                window.location.href = `${BASE_URL}/franchiseelogin.html`;
            } else {
                throw new Error('Logout failed');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            portalGuard.handleSessionFailure({
                loginPath: "/franchiseelogin.html",
                message: "Your session could not be closed cleanly. Please login again.",
            });
        });
}

// User modal handler
function handleUserModal() {
    const userModal = document.getElementById('userModal');
    if (!userModal) return;

    if (userModal.style.display === 'none' || !userModal.style.display) {
        const namePara = document.querySelector('.modal-content_one .Name');
        const emailPara = document.querySelector('.modal-content_one .email');
        const rolePara = document.querySelector('.modal-content_one .role');

        if (namePara) namePara.innerHTML = `<strong>Name:</strong> ${AppState.Name}`;
        if (emailPara) emailPara.innerHTML = `<strong>Email:</strong> ${AppState.email}`;
        if (rolePara) rolePara.innerHTML = `<strong>Role:</strong> ${AppState.role}`;
        
        userModal.style.display = 'block';
    } else {
        userModal.style.display = 'none';
    }
}

// Support modal handler
function handleSupportModal() {
    const supportModal = document.getElementById('supportModal');
    if (!supportModal) return;

    if (supportModal.style.display === 'none' || !supportModal.style.display) {
        supportModal.style.display = 'block';
    } else {
        supportModal.style.display = 'none';
    }
}

// Loader function
function loaderFunction() {
    window.AppTopLoader?.scanLegacyLoaders(document);
}

// Initialize sidebar menu behavior
function initializeSidebarBehavior() {
    const sidebar = document.getElementById('toggle');
    const mainContent = document.getElementById('right-container');
    const menuItems = document.querySelectorAll('#toggle a');

    if (!sidebar || !mainContent) return;

    menuItems.forEach(item => {
        if (item.dataset.sidebarInitialized) return;
        item.dataset.sidebarInitialized = 'true';

        item.addEventListener('click', function () {
            sidebar.classList.add('hidden');
            mainContent.classList.add('full-width');
        });
    });
}

function reinitializeSidebarBehavior() {
    const menuItems = document.querySelectorAll('#toggle a');
    menuItems.forEach(item => {
        item.dataset.sidebarInitialized = 'false';
    });
    initializeSidebarBehavior();
}

// Initialize navigation
function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        if (item.dataset.navInitialized) return;
        item.dataset.navInitialized = 'true';

        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.getAttribute('data-page');
            loadPage(page);
        });
    });
}

function reinitializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.dataset.navInitialized = 'false';
    });
    
    initializeNavigation();
}

// Handle browser back/forward navigation
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.page) {
        loadPage(event.state.page);
    }
});

// Initialize application
async function initializeApp() {
    try {
        const isAuthorized = await verifyAccessToken();
        if (!isAuthorized) {
            return;
        }
        await refreshSubscriptionBanner();

        initializeGlobalListeners();
        initializeNotifications();
        initializeSidebarBehavior();
        initializeNavigation();

        addManagedInterval(fetchWalletAmount, 5000);
        fetchWalletAmount();

        if (!subscriptionStatusInterval) {
            subscriptionStatusInterval = setInterval(refreshSubscriptionBanner, 60 * 1000);
            CleanupManager.add(() => {
                clearInterval(subscriptionStatusInterval);
                subscriptionStatusInterval = null;
            });
        }

        const urlParams = new URLSearchParams(window.location.search);
        const currentPage = urlParams.get('page') || 'dashboard_copy';
        loadPage(currentPage);

        loaderFunction();

    } catch (error) {
        console.error('Failed to initialize app:', error);
        portalGuard.handleSessionFailure({
            loginPath: "/franchiseelogin.html",
            message: "Your session could not be restored. Please login again.",
        });
    }
}

// Start the application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Export for page scripts
window.AppState = AppState;
window.CleanupManager = CleanupManager;
window.addManagedEventListener = addManagedEventListener;
window.addManagedInterval = addManagedInterval;

// Helper for page scripts
window.waitForUserData = function() {
    return new Promise((resolve) => {
        if (AppState.user && AppState.userId) {
            resolve(AppState.user);
        } else {
            window.addEventListener('pageDataReady', (event) => {
                resolve(event.detail.user);
            }, { once: true });
        }
    });
};
