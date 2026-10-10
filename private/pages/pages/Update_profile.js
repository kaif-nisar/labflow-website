// Update_profile.js - Professional Profile & Lab Branding Manager

// Global state tracking
let currentProfileData = null;
let currentBrandingState = {
    brandType: "image",
    labHeading: "",
    labSlogan: "",
    bgColor: "#ffffff",
    textColor: "#0f172a",
    sloganColor: "#64748b",
    fontSize: 20,
    sloganSize: 12,
    fontFamily: "Arial, sans-serif",
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0"
};

// Safe access to userId and BASE_URL
function getResolvedUserId() {
    if (typeof userId !== 'undefined' && userId) return userId;
    if (window.userId) return window.userId;
    if (window.user && window.user._id) return window.user._id;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('_id') || "";
}

function getResolvedBaseUrl() {
    if (typeof BASE_URL !== 'undefined' && BASE_URL) return BASE_URL;
    return window.location.origin;
}

// High-Visibility Toast Notification System (Mounted directly on document.body)
function getOrCreateToastShelf() {
    let shelf = document.getElementById("toastShelf");
    if (!shelf) {
        shelf = document.createElement("div");
        shelf.id = "toastShelf";
        shelf.className = "toast-shelf";
        document.body.appendChild(shelf);
    } else if (shelf.parentElement !== document.body) {
        // Move directly to document.body to escape any parent overflow, transform, or scroll stacking context
        document.body.appendChild(shelf);
    }
    return shelf;
}

function showToast(message, type = "success", title = "") {
    const shelf = getOrCreateToastShelf();

    if (!title) {
        if (type === "success") title = "Success";
        else if (type === "error") title = "Notice";
        else title = "Information";
    }

    const toast = document.createElement("div");
    toast.className = `toast-bubble toast-${type}`;
    
    let iconClass = "fa-check";
    if (type === "error") iconClass = "fa-exclamation-triangle";
    if (type === "info") iconClass = "fa-info";

    toast.innerHTML = `
        <div class="toast-icon-wrap">
            <i class="fas ${iconClass}"></i>
        </div>
        <div class="toast-body-wrap">
            <div class="toast-title-text">${title}</div>
            <div class="toast-msg-text">${message}</div>
        </div>
        <button type="button" class="toast-close-btn" title="Dismiss" aria-label="Dismiss">&times;</button>
    `;

    const closeBtn = toast.querySelector(".toast-close-btn");
    let isDismissed = false;
    const dismissToast = () => {
        if (isDismissed) return;
        isDismissed = true;
        toast.style.opacity = "0";
        toast.style.transform = window.innerWidth <= 768 ? "translateY(-16px) scale(0.96)" : "translateX(30px) scale(0.96)";
        setTimeout(() => toast.remove(), 260);
    };

    if (closeBtn) closeBtn.onclick = dismissToast;

    shelf.appendChild(toast);

    setTimeout(dismissToast, 4500);
}

// In-place buffer controller
function setBuffer(bufferId, isVisible, text = "") {
    const el = document.getElementById(bufferId);
    if (!el) return;
    el.style.display = isVisible ? "flex" : "none";
    if (text) {
        const textEl = el.querySelector(".buffer-text");
        if (textEl) textEl.textContent = text;
    }
}

// Switch between branding tabs
window.switchBrandTab = function(mode) {
    document.querySelectorAll('.brand-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.brand-tab-pane').forEach(p => p.classList.remove('active'));

    const targetBtn = document.getElementById(`tab-btn-${mode}`);
    const targetPane = document.getElementById(`pane-${mode}`);
    if (targetBtn) targetBtn.classList.add('active');
    if (targetPane) targetPane.classList.add('active');

    currentBrandingState.brandType = (mode === 'text') ? 'text' : (mode === 'image' ? 'image' : 'none');
};

// Presets and live preview updates
window.applyPresetBg = function(color) {
    const bgPicker = document.getElementById("brand-bg-color");
    const bgHex = document.getElementById("brand-bg-color-hex");
    if (bgPicker) bgPicker.value = color;
    if (bgHex) bgHex.value = color;
    currentBrandingState.bgColor = color;
    updateLiveBrandBox();
};

window.setTextAlign = function(align) {
    currentBrandingState.textAlign = align;
    ['left', 'center', 'right'].forEach(a => {
        const btn = document.getElementById(`btn-align-${a}`);
        if (btn) {
            if (a === align) {
                btn.style.background = "#e2e8f0";
                btn.style.fontWeight = "bold";
            } else {
                btn.style.background = "#f1f5f9";
                btn.style.fontWeight = "normal";
            }
        }
    });
    updateLiveBrandBox();
};

// Live Brand Box Renderer
function updateLiveBrandBox() {
    const liveBox = document.getElementById("brand-live-box");
    const headingEl = document.getElementById("live-preview-heading");
    const sloganEl = document.getElementById("live-preview-slogan");
    if (!liveBox || !headingEl || !sloganEl) return;

    const headingText = document.getElementById("brand-lab-heading")?.value.trim() || "Your Lab Name";
    const sloganText = document.getElementById("brand-lab-slogan")?.value.trim() || "";

    headingEl.textContent = headingText;
    sloganEl.textContent = sloganText;
    sloganEl.style.display = sloganText ? "block" : "none";

    const bg = document.getElementById("brand-bg-color")?.value || "#ffffff";
    const textColor = document.getElementById("brand-text-color")?.value || "#0f172a";
    const sloganColor = document.getElementById("brand-slogan-color")?.value || "#64748b";
    const fontSize = parseInt(document.getElementById("brand-font-size")?.value) || 20;
    const sloganSize = parseInt(document.getElementById("brand-slogan-size")?.value) || 12;
    const fontFamily = document.getElementById("brand-font-family")?.value || "Arial, sans-serif";
    const borderWidth = parseInt(document.getElementById("brand-border-width")?.value) || 0;
    const borderColor = document.getElementById("brand-border-color")?.value || "#e2e8f0";

    liveBox.style.backgroundColor = bg;
    liveBox.style.fontFamily = fontFamily;
    liveBox.style.border = borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : "none";
    liveBox.style.alignItems = currentBrandingState.textAlign === 'center' ? 'center' : (currentBrandingState.textAlign === 'right' ? 'flex-end' : 'flex-start');
    liveBox.style.textAlign = currentBrandingState.textAlign;

    headingEl.style.color = textColor;
    headingEl.style.fontSize = `${fontSize}px`;

    sloganEl.style.color = sloganColor;
    sloganEl.style.fontSize = `${sloganSize}px`;

    // Keep internal state updated
    currentBrandingState.labHeading = headingText;
    currentBrandingState.labSlogan = sloganText;
    currentBrandingState.bgColor = bg;
    currentBrandingState.textColor = textColor;
    currentBrandingState.sloganColor = sloganColor;
    currentBrandingState.fontSize = fontSize;
    currentBrandingState.sloganSize = sloganSize;
    currentBrandingState.fontFamily = fontFamily;
    currentBrandingState.borderWidth = borderWidth;
    currentBrandingState.borderColor = borderColor;
}

// Character Limit Listeners
function setupCharacterLimits() {
    const headingInput = document.getElementById("brand-lab-heading");
    const headingCounter = document.getElementById("heading-char-counter");
    if (headingInput && headingCounter) {
        headingInput.addEventListener("input", () => {
            const len = headingInput.value.length;
            headingCounter.textContent = `${len} / 30 letters`;
            if (len >= 30) {
                headingCounter.classList.add("limit-reached");
            } else {
                headingCounter.classList.remove("limit-reached");
            }
            updateLiveBrandBox();
        });
    }

    const sloganInput = document.getElementById("brand-lab-slogan");
    const sloganCounter = document.getElementById("slogan-char-counter");
    if (sloganInput && sloganCounter) {
        sloganInput.addEventListener("input", () => {
            const len = sloganInput.value.length;
            sloganCounter.textContent = `${len} / 50 letters`;
            if (len >= 50) {
                sloganCounter.classList.add("limit-reached");
            } else {
                sloganCounter.classList.remove("limit-reached");
            }
            updateLiveBrandBox();
        });
    }

    // Sliders & pickers
    const fontSizeSlider = document.getElementById("brand-font-size");
    const fontSizeBadge = document.getElementById("brand-font-size-val");
    if (fontSizeSlider && fontSizeBadge) {
        fontSizeSlider.addEventListener("input", () => {
            fontSizeBadge.textContent = `${fontSizeSlider.value}px`;
            updateLiveBrandBox();
        });
    }

    const sloganSizeSlider = document.getElementById("brand-slogan-size");
    const sloganSizeBadge = document.getElementById("brand-slogan-size-val");
    if (sloganSizeSlider && sloganSizeBadge) {
        sloganSizeSlider.addEventListener("input", () => {
            sloganSizeBadge.textContent = `${sloganSizeSlider.value}px`;
            updateLiveBrandBox();
        });
    }

    ['brand-bg-color', 'brand-text-color', 'brand-slogan-color', 'brand-border-color'].forEach(id => {
        const picker = document.getElementById(id);
        const hex = document.getElementById(`${id}-hex`);
        if (picker) {
            picker.addEventListener("input", () => {
                if (hex) hex.value = picker.value;
                updateLiveBrandBox();
            });
        }
        if (hex) {
            hex.addEventListener("input", () => {
                if (/^#[0-9A-Fa-f]{6}$/.test(hex.value)) {
                    if (picker) picker.value = hex.value;
                    updateLiveBrandBox();
                }
            });
        }
    });

    document.getElementById("brand-font-family")?.addEventListener("change", updateLiveBrandBox);
    document.getElementById("brand-border-width")?.addEventListener("change", updateLiveBrandBox);
}

// Fetch user profile and populate form
async function getFranchiseeById(targetUserId) {
    targetUserId = targetUserId || getResolvedUserId();
    if (!targetUserId) {
        console.warn("No userId available to fetch profile.");
        return;
    }

    const baseUrl = getResolvedBaseUrl();
    try {
        const response = await fetch(`${baseUrl}/api/v1/user/superFranchisee-fetch?_id=${targetUserId}`);
        const data = await response.json();
        if (!data.success && !data.data) {
            throw new Error(data.message || "Failed to load user profile");
        }

        const franchiseeData = data.data;
        currentProfileData = franchiseeData;

        // Populate fields
        const currentUserEl = document.getElementById("currentUser");
        if (currentUserEl) {
            currentUserEl.value = `${franchiseeData.fullName || ""} (${franchiseeData.username || ""}) - ${franchiseeData.role || ""}`;
        }

        const clinicNameEl = document.getElementById("clinicName");
        if (clinicNameEl) {
            clinicNameEl.value = franchiseeData.clinicName || franchiseeData.tenantId?.name || franchiseeData.fullName || "";
        }

        const addressEl = document.getElementById("address");
        if (addressEl) addressEl.value = franchiseeData.address || "";

        const firstNameEl = document.getElementById("firstName");
        const lastNameEl = document.getElementById("lastName");
        if (firstNameEl) firstNameEl.value = (franchiseeData.fullName || "").split(' ')[0] || "";
        if (lastNameEl) lastNameEl.value = (franchiseeData.fullName || "").split(' ').slice(1).join(' ') || "";

        const phoneNoEl = document.getElementById("phoneNo");
        if (phoneNoEl) phoneNoEl.value = franchiseeData.phoneNo || "";

        const emailEl = document.getElementById("email");
        if (emailEl) emailEl.value = franchiseeData.email || "";

        const cityEl = document.getElementById("city");
        if (cityEl) cityEl.value = franchiseeData.city || "";

        const stateEl = document.getElementById("state");
        if (stateEl) stateEl.value = franchiseeData.state || "";

        const pinCodeEl = document.getElementById("pinCode");
        if (pinCodeEl) pinCodeEl.value = franchiseeData.pinCode || "";

        // Populate logo
        const tenantLogo = franchiseeData.tenantId?.logo || "";
        const logoImg = document.getElementById("weblogo-img-preview");
        const logoEmpty = document.getElementById("logo-empty-ph");
        const removeLogoBtn = document.getElementById("btn-remove-logo");

        if (tenantLogo && logoImg) {
            logoImg.src = tenantLogo;
            logoImg.style.display = "block";
            if (logoEmpty) logoEmpty.style.display = "none";
            if (removeLogoBtn) removeLogoBtn.style.display = "inline-flex";
        } else if (logoImg) {
            logoImg.style.display = "none";
            if (logoEmpty) logoEmpty.style.display = "block";
            if (removeLogoBtn) removeLogoBtn.style.display = "none";
        }

        // Populate profile avatar
        const avatarUrl = franchiseeData.profileimage;
        const avatarImg = document.getElementById("profileImage-preview");
        const removeProfileBtn = document.getElementById("btn-remove-profile");
        if (avatarUrl && avatarImg) {
            avatarImg.src = avatarUrl;
            if (removeProfileBtn) removeProfileBtn.style.display = "inline-flex";
        }

        // Populate NABL logo
        const nablUrl = franchiseeData.nabllogo;
        const nablImg = document.getElementById("nablLogo-preview");
        const nablEmpty = document.getElementById("nabl-empty-ph");
        const removeNablBtn = document.getElementById("btn-remove-nabl");
        if (nablUrl && nablImg) {
            nablImg.src = nablUrl;
            nablImg.style.display = "block";
            if (nablEmpty) nablEmpty.style.display = "none";
            if (removeNablBtn) removeNablBtn.style.display = "inline-flex";
        }

        // Populate Branding settings
        const branding = franchiseeData.tenantId?.branding || franchiseeData.branding;
        if (branding) {
            if (branding.labHeading) {
                const headingInp = document.getElementById("brand-lab-heading");
                if (headingInp) {
                    headingInp.value = branding.labHeading;
                    document.getElementById("heading-char-counter").textContent = `${branding.labHeading.length} / 30 letters`;
                }
            } else if (franchiseeData.clinicName || franchiseeData.tenantId?.name) {
                const defaultName = (franchiseeData.clinicName || franchiseeData.tenantId?.name || "").slice(0, 30);
                const headingInp = document.getElementById("brand-lab-heading");
                if (headingInp) {
                    headingInp.value = defaultName;
                    document.getElementById("heading-char-counter").textContent = `${defaultName.length} / 30 letters`;
                }
            }

            if (branding.labSlogan) {
                const sloganInp = document.getElementById("brand-lab-slogan");
                if (sloganInp) {
                    sloganInp.value = branding.labSlogan;
                    document.getElementById("slogan-char-counter").textContent = `${branding.labSlogan.length} / 50 letters`;
                }
            }

            if (branding.bgColor) applyPresetBg(branding.bgColor);
            if (branding.textColor) {
                const textPicker = document.getElementById("brand-text-color");
                const textHex = document.getElementById("brand-text-color-hex");
                if (textPicker) textPicker.value = branding.textColor;
                if (textHex) textHex.value = branding.textColor;
            }
            if (branding.sloganColor) {
                const sloganPicker = document.getElementById("brand-slogan-color");
                const sloganHex = document.getElementById("brand-slogan-color-hex");
                if (sloganPicker) sloganPicker.value = branding.sloganColor;
                if (sloganHex) sloganHex.value = branding.sloganColor;
            }
            if (branding.fontSize) {
                const fSize = document.getElementById("brand-font-size");
                const fBadge = document.getElementById("brand-font-size-val");
                if (fSize) fSize.value = branding.fontSize;
                if (fBadge) fBadge.textContent = `${branding.fontSize}px`;
            }
            if (branding.sloganSize) {
                const sSize = document.getElementById("brand-slogan-size");
                const sBadge = document.getElementById("brand-slogan-size-val");
                if (sSize) sSize.value = branding.sloganSize;
                if (sBadge) sBadge.textContent = `${branding.sloganSize}px`;
            }
            if (branding.fontFamily) {
                const fFam = document.getElementById("brand-font-family");
                if (fFam) fFam.value = branding.fontFamily;
            }
            if (branding.textAlign) {
                setTextAlign(branding.textAlign);
            }
            if (branding.borderWidth !== undefined) {
                const bWidth = document.getElementById("brand-border-width");
                if (bWidth) bWidth.value = branding.borderWidth;
            }
            if (branding.borderColor) {
                const bCol = document.getElementById("brand-border-color");
                if (bCol) bCol.value = branding.borderColor;
            }

            // Decide active tab
            if (branding.brandType === "text") {
                switchBrandTab('text');
            } else if (branding.brandType === "none") {
                switchBrandTab('blank');
            } else if (tenantLogo) {
                switchBrandTab('image');
            } else if (branding.labHeading) {
                switchBrandTab('text');
            }
        } else {
            // Default setup if no branding configured
            if (tenantLogo) {
                switchBrandTab('image');
            } else {
                const defName = (franchiseeData.clinicName || franchiseeData.tenantId?.name || "Apex Diagnostics").slice(0, 30);
                const headingInp = document.getElementById("brand-lab-heading");
                if (headingInp) {
                    headingInp.value = defName;
                    document.getElementById("heading-char-counter").textContent = `${defName.length} / 30 letters`;
                }
            }
        }

        updateLiveBrandBox();
    } catch (err) {
        console.error("Error fetching franchisee profile:", err);
        showToast(err.message || "Failed to load profile details.", "error");
    }
}

// 1. Upload Image Logo
async function uploadLogoOnly() {
    const logoInput = document.getElementById("weblogo");
    if (!logoInput || !logoInput.files || logoInput.files.length === 0) {
        showToast("Please select an image file first to upload as logo.", "error");
        return;
    }

    const file = logoInput.files[0];
    const targetUserId = getResolvedUserId();
    const baseUrl = getResolvedBaseUrl();

    setBuffer("branding-buffer", true, "Uploading and applying logo...");

    const formData = new FormData();
    formData.append("_id", targetUserId);
    formData.append("logo", file);
    formData.append("brandType", "image");

    try {
        const response = await fetch(`${baseUrl}/api/v1/user/superfranchisee-update?_id=${targetUserId}`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success && result.data) {
            const newLogoUrl = result.data.tenantId?.logo || result.data.logo;
            const logoImg = document.getElementById("weblogo-img-preview");
            const logoEmpty = document.getElementById("logo-empty-ph");
            const removeBtn = document.getElementById("btn-remove-logo");

            if (newLogoUrl && logoImg) {
                logoImg.src = newLogoUrl;
                logoImg.style.display = "block";
                if (logoEmpty) logoEmpty.style.display = "none";
                if (removeBtn) removeBtn.style.display = "inline-flex";
            }

            // Sync with navbar logo if element exists
            const topLogo = document.getElementById("logo");
            if (topLogo && newLogoUrl) topLogo.src = newLogoUrl;
            if (window.user && window.user.tenantId) {
                window.user.tenantId.logo = newLogoUrl;
                if (!window.user.tenantId.branding) window.user.tenantId.branding = {};
                window.user.tenantId.branding.brandType = "image";
            }

            logoInput.value = "";
            document.getElementById("logo-filename-label").textContent = "";
            showToast("Lab logo uploaded successfully! Dynamic UI updated.");
        } else {
            throw new Error(result.message || "Failed to upload logo.");
        }
    } catch (err) {
        console.error("Error uploading logo:", err);
        showToast(err.message || "An error occurred while uploading logo.", "error");
    } finally {
        setBuffer("branding-buffer", false);
    }
}

// 2. Remove Logo
async function removeLogo() {
    if (!confirm("Are you sure you want to remove your lab logo?")) return;

    const targetUserId = getResolvedUserId();
    const baseUrl = getResolvedBaseUrl();
    setBuffer("branding-buffer", true, "Removing logo...");

    const formData = new FormData();
    formData.append("_id", targetUserId);
    formData.append("removeLogo", "true");

    try {
        const response = await fetch(`${baseUrl}/api/v1/user/superfranchisee-update?_id=${targetUserId}`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            const logoImg = document.getElementById("weblogo-img-preview");
            const logoEmpty = document.getElementById("logo-empty-ph");
            const removeBtn = document.getElementById("btn-remove-logo");

            if (logoImg) logoImg.style.display = "none";
            if (logoEmpty) logoEmpty.style.display = "block";
            if (removeBtn) removeBtn.style.display = "none";

            const topLogo = document.getElementById("logo");
            if (topLogo) topLogo.src = "/images/logoLabFlow.svg";
            if (window.user && window.user.tenantId) window.user.tenantId.logo = "";

            showToast("Logo removed successfully.");
        } else {
            throw new Error(result.message || "Failed to remove logo.");
        }
    } catch (err) {
        console.error("Error removing logo:", err);
        showToast(err.message || "An error occurred while removing logo.", "error");
    } finally {
        setBuffer("branding-buffer", false);
    }
}

// 3. Save Custom Text Branding
async function saveTextBranding() {
    const headingInput = document.getElementById("brand-lab-heading");
    const headingText = headingInput?.value.trim() || "";
    if (!headingText) {
        showToast("Please enter a Lab / Diagnostic Center Name.", "error");
        headingInput?.focus();
        return;
    }

    if (headingText.length > 30) {
        showToast("Lab Name cannot exceed 30 letters for invoice rectangular proportion.", "error");
        return;
    }

    const sloganText = document.getElementById("brand-lab-slogan")?.value.trim() || "";
    if (sloganText.length > 50) {
        showToast("Tagline cannot exceed 50 letters.", "error");
        return;
    }

    const targetUserId = getResolvedUserId();
    const baseUrl = getResolvedBaseUrl();

    setBuffer("branding-buffer", true, "Saving custom text branding...");

    const brandingPayload = {
        brandType: "text",
        labHeading: headingText,
        labSlogan: sloganText,
        bgColor: document.getElementById("brand-bg-color")?.value || "#ffffff",
        textColor: document.getElementById("brand-text-color")?.value || "#0f172a",
        sloganColor: document.getElementById("brand-slogan-color")?.value || "#64748b",
        fontSize: parseInt(document.getElementById("brand-font-size")?.value) || 20,
        sloganSize: parseInt(document.getElementById("brand-slogan-size")?.value) || 12,
        fontFamily: document.getElementById("brand-font-family")?.value || "Arial, sans-serif",
        textAlign: currentBrandingState.textAlign || "center",
        borderWidth: parseInt(document.getElementById("brand-border-width")?.value) || 0,
        borderColor: document.getElementById("brand-border-color")?.value || "#e2e8f0"
    };

    const formData = new FormData();
    formData.append("_id", targetUserId);
    formData.append("branding", JSON.stringify(brandingPayload));
    formData.append("brandType", "text");

    try {
        const response = await fetch(`${baseUrl}/api/v1/user/superfranchisee-update?_id=${targetUserId}`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success && result.data) {
            if (window.user && window.user.tenantId) {
                window.user.tenantId.branding = result.data.tenantId?.branding || brandingPayload;
            }
            showToast("Custom lab text branding saved! Your invoices will now display this header.");
        } else {
            throw new Error(result.message || "Failed to save branding.");
        }
    } catch (err) {
        console.error("Error saving text branding:", err);
        showToast(err.message || "Failed to save text branding.", "error");
    } finally {
        setBuffer("branding-buffer", false);
    }
}

// 4. Apply Blank (No logo, No text)
async function applyBlankBranding() {
    if (!confirm("This will clear both custom logo and text header from your invoices. Continue?")) return;

    const targetUserId = getResolvedUserId();
    const baseUrl = getResolvedBaseUrl();

    setBuffer("branding-buffer", true, "Applying blank header...");

    const brandingPayload = {
        brandType: "none",
        labHeading: "",
        labSlogan: ""
    };

    const formData = new FormData();
    formData.append("_id", targetUserId);
    formData.append("removeLogo", "true");
    formData.append("branding", JSON.stringify(brandingPayload));
    formData.append("brandType", "none");

    try {
        const response = await fetch(`${baseUrl}/api/v1/user/superfranchisee-update?_id=${targetUserId}`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            // Update UI
            const logoImg = document.getElementById("weblogo-img-preview");
            const logoEmpty = document.getElementById("logo-empty-ph");
            const removeBtn = document.getElementById("btn-remove-logo");
            if (logoImg) logoImg.style.display = "none";
            if (logoEmpty) logoEmpty.style.display = "block";
            if (removeBtn) removeBtn.style.display = "none";

            if (window.user && window.user.tenantId) {
                window.user.tenantId.logo = "";
                window.user.tenantId.branding = brandingPayload;
            }

            showToast("Invoice branding cleared. Invoices will show clean default title.");
        } else {
            throw new Error(result.message || "Failed to apply blank branding.");
        }
    } catch (err) {
        console.error("Error applying blank branding:", err);
        showToast(err.message || "Failed to clear branding.", "error");
    } finally {
        setBuffer("branding-buffer", false);
    }
}

// 5. Upload Avatar (Profile Image)
async function uploadProfileImageOnly() {
    const input = document.getElementById("profileImage");
    if (!input || !input.files || input.files.length === 0) {
        showToast("Please select a profile picture first.", "error");
        return;
    }

    const targetUserId = getResolvedUserId();
    const baseUrl = getResolvedBaseUrl();
    setBuffer("assets-buffer", true, "Uploading avatar...");

    const formData = new FormData();
    formData.append("_id", targetUserId);
    formData.append("profileImage", input.files[0]);

    try {
        const response = await fetch(`${baseUrl}/api/v1/user/superfranchisee-update?_id=${targetUserId}`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success && result.data) {
            const newUrl = result.data.profileimage;
            const previewEl = document.getElementById("profileImage-preview");
            if (previewEl && newUrl) previewEl.src = newUrl;

            // Sync with navbar avatar if exists
            const navAvatar = document.getElementById("user-profile-img");
            if (navAvatar && newUrl) navAvatar.src = newUrl;
            if (window.user) window.user.profileimage = newUrl;

            document.getElementById("btn-remove-profile").style.display = "inline-flex";
            input.value = "";
            document.getElementById("profile-filename-label").textContent = "";

            showToast("Profile avatar updated successfully!");
        } else {
            throw new Error(result.message || "Failed to upload avatar.");
        }
    } catch (err) {
        console.error("Error uploading avatar:", err);
        showToast(err.message || "Failed to update profile picture.", "error");
    } finally {
        setBuffer("assets-buffer", false);
    }
}

// 6. Remove Avatar
async function removeProfileImage() {
    if (!confirm("Are you sure you want to remove your profile picture?")) return;

    const targetUserId = getResolvedUserId();
    const baseUrl = getResolvedBaseUrl();
    setBuffer("assets-buffer", true, "Removing avatar...");

    const formData = new FormData();
    formData.append("_id", targetUserId);
    formData.append("removeProfileImage", "true");

    try {
        const response = await fetch(`${baseUrl}/api/v1/user/superfranchisee-update?_id=${targetUserId}`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            const previewEl = document.getElementById("profileImage-preview");
            if (previewEl) previewEl.src = 'https://ui-avatars.com/api/?name=User&background=0284c7&color=fff';

            const navAvatar = document.getElementById("user-profile-img");
            if (navAvatar) navAvatar.src = 'https://ui-avatars.com/api/?name=User&background=0284c7&color=fff';
            if (window.user) window.user.profileimage = "";

            document.getElementById("btn-remove-profile").style.display = "none";
            showToast("Profile avatar removed.");
        } else {
            throw new Error(result.message || "Failed to remove avatar.");
        }
    } catch (err) {
        console.error("Error removing avatar:", err);
        showToast(err.message || "Failed to remove avatar.", "error");
    } finally {
        setBuffer("assets-buffer", false);
    }
}

// 7. Upload NABL Logo
async function uploadNablOnly() {
    const input = document.getElementById("nablLogo");
    if (!input || !input.files || input.files.length === 0) {
        showToast("Please select a NABL / quality stamp image first.", "error");
        return;
    }

    const targetUserId = getResolvedUserId();
    const baseUrl = getResolvedBaseUrl();
    setBuffer("assets-buffer", true, "Uploading NABL stamp...");

    const formData = new FormData();
    formData.append("_id", targetUserId);
    formData.append("nablLogo", input.files[0]);

    try {
        const response = await fetch(`${baseUrl}/api/v1/user/superfranchisee-update?_id=${targetUserId}`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success && result.data) {
            const newUrl = result.data.nabllogo;
            const previewEl = document.getElementById("nablLogo-preview");
            const emptyEl = document.getElementById("nabl-empty-ph");
            const removeBtn = document.getElementById("btn-remove-nabl");

            if (previewEl && newUrl) {
                previewEl.src = newUrl;
                previewEl.style.display = "block";
                if (emptyEl) emptyEl.style.display = "none";
                if (removeBtn) removeBtn.style.display = "inline-flex";
            }

            if (window.user) window.user.nabllogo = newUrl;
            input.value = "";
            document.getElementById("nabl-filename-label").textContent = "";

            showToast("NABL certification logo updated successfully!");
        } else {
            throw new Error(result.message || "Failed to upload NABL logo.");
        }
    } catch (err) {
        console.error("Error uploading NABL logo:", err);
        showToast(err.message || "Failed to upload NABL stamp.", "error");
    } finally {
        setBuffer("assets-buffer", false);
    }
}

// 8. Remove NABL Logo
async function removeNablLogo() {
    if (!confirm("Are you sure you want to remove the NABL certification stamp?")) return;

    const targetUserId = getResolvedUserId();
    const baseUrl = getResolvedBaseUrl();
    setBuffer("assets-buffer", true, "Removing NABL stamp...");

    const formData = new FormData();
    formData.append("_id", targetUserId);
    formData.append("removeNablLogo", "true");

    try {
        const response = await fetch(`${baseUrl}/api/v1/user/superfranchisee-update?_id=${targetUserId}`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            const previewEl = document.getElementById("nablLogo-preview");
            const emptyEl = document.getElementById("nabl-empty-ph");
            const removeBtn = document.getElementById("btn-remove-nabl");

            if (previewEl) previewEl.style.display = "none";
            if (emptyEl) emptyEl.style.display = "block";
            if (removeBtn) removeBtn.style.display = "none";
            if (window.user) window.user.nabllogo = "";

            showToast("NABL stamp removed.");
        } else {
            throw new Error(result.message || "Failed to remove NABL logo.");
        }
    } catch (err) {
        console.error("Error removing NABL logo:", err);
        showToast(err.message || "Failed to remove NABL stamp.", "error");
    } finally {
        setBuffer("assets-buffer", false);
    }
}

// 9. Save Profile Details
async function updateProfileDetails() {
    const firstName = document.getElementById("firstName")?.value.trim() || "";
    const lastName = document.getElementById("lastName")?.value.trim() || "";
    const clinicName = document.getElementById("clinicName")?.value.trim() || "";
    const phoneNo = document.getElementById("phoneNo")?.value.trim() || "";
    const email = document.getElementById("email")?.value.trim() || "";
    const address = document.getElementById("address")?.value.trim() || "";
    const city = document.getElementById("city")?.value.trim() || "";
    const state = document.getElementById("state")?.value.trim() || "";
    const pinCode = document.getElementById("pinCode")?.value.trim() || "";

    if (!firstName) {
        showToast("First name is required.", "error");
        document.getElementById("firstName")?.focus();
        return;
    }
    if (!clinicName) {
        showToast("Lab/Clinic name is required.", "error");
        document.getElementById("clinicName")?.focus();
        return;
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const targetUserId = getResolvedUserId();
    const baseUrl = getResolvedBaseUrl();

    setBuffer("details-buffer", true, "Saving profile details...");

    const formData = new FormData();
    formData.append("_id", targetUserId);
    formData.append("fullName", fullName);
    formData.append("clinicName", clinicName);
    formData.append("phoneNo", phoneNo);
    formData.append("email", email);
    formData.append("address", address);
    formData.append("city", city);
    formData.append("state", state);
    formData.append("pinCode", pinCode);

    try {
        const response = await fetch(`${baseUrl}/api/v1/user/superfranchisee-update?_id=${targetUserId}`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success && result.data) {
            // Update Current User display
            const currentUserEl = document.getElementById("currentUser");
            if (currentUserEl) {
                currentUserEl.value = `${result.data.fullName || fullName} (${result.data.username || ""}) - ${result.data.role || ""}`;
            }

            // Sync global user state
            if (window.user) {
                window.user.fullName = result.data.fullName;
                window.user.clinicName = result.data.clinicName;
                window.user.email = result.data.email;
                window.user.phoneNo = result.data.phoneNo;
            }

            showToast("Profile details updated successfully! No page reload needed.");
        } else {
            throw new Error(result.message || "Failed to update profile details.");
        }
    } catch (err) {
        console.error("Error updating profile details:", err);
        showToast(err.message || "An error occurred while updating profile.", "error");
    } finally {
        setBuffer("details-buffer", false);
    }
}

// Setup File Inputs change indicators
function setupFileInputLabels() {
    const logoFile = document.getElementById("weblogo");
    const logoLabel = document.getElementById("logo-filename-label");
    if (logoFile && logoLabel) {
        logoFile.addEventListener("change", () => {
            if (logoFile.files.length > 0) {
                logoLabel.textContent = `Selected: ${logoFile.files[0].name}`;
            } else {
                logoLabel.textContent = "";
            }
        });
    }

    const profileFile = document.getElementById("profileImage");
    const profileLabel = document.getElementById("profile-filename-label");
    if (profileFile && profileLabel) {
        profileFile.addEventListener("change", () => {
            if (profileFile.files.length > 0) {
                profileLabel.textContent = `Selected: ${profileFile.files[0].name}`;
            } else {
                profileLabel.textContent = "";
            }
        });
    }

    const nablFile = document.getElementById("nablLogo");
    const nablLabel = document.getElementById("nabl-filename-label");
    if (nablFile && nablLabel) {
        nablFile.addEventListener("change", () => {
            if (nablFile.files.length > 0) {
                nablLabel.textContent = `Selected: ${nablFile.files[0].name}`;
            } else {
                nablLabel.textContent = "";
            }
        });
    }
}

// Bind Event Listeners
function initProfileEventListeners() {
    setupCharacterLimits();
    setupFileInputLabels();

    document.getElementById("btn-save-logo")?.addEventListener("click", uploadLogoOnly);
    document.getElementById("btn-remove-logo")?.addEventListener("click", removeLogo);
    document.getElementById("btn-save-text-brand")?.addEventListener("click", saveTextBranding);
    document.getElementById("btn-apply-blank")?.addEventListener("click", applyBlankBranding);

    document.getElementById("btn-save-profile")?.addEventListener("click", uploadProfileImageOnly);
    document.getElementById("btn-remove-profile")?.addEventListener("click", removeProfileImage);
    document.getElementById("btn-save-nabl")?.addEventListener("click", uploadNablOnly);
    document.getElementById("btn-remove-nabl")?.addEventListener("click", removeNablLogo);

    document.getElementById("updateButton")?.addEventListener("click", updateProfileDetails);
}

// Initialize on DOM load
initProfileEventListeners();
getFranchiseeById(getResolvedUserId());
