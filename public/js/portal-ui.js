(function () {
  const DEFAULT_LOGO_SRC = "/images/logoLabFlow.svg";
  const DEFAULT_AVATAR_SRC = "/images/default-avatar.svg";
  const SHELL_BREAKPOINT = 1100;

  const eyeIcon = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M1.5 12s3.9-6.5 10.5-6.5S22.5 12 22.5 12 18.6 18.5 12 18.5 1.5 12 1.5 12Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" stroke-width="1.8"/>
    </svg>`;

  const eyeSlashIcon = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 4.5 21 19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M10.6 5.7c.46-.12.93-.2 1.4-.2 6.6 0 10.5 6.5 10.5 6.5a20.79 20.79 0 0 1-4.12 4.74" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6.55 8.2A20.58 20.58 0 0 0 1.5 12s3.9 6.5 10.5 6.5c1.77 0 3.34-.47 4.73-1.17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M9.9 9.89A3.1 3.1 0 0 0 12 15.1c.56 0 1.1-.15 1.56-.42" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  function isValidSource(value) {
    if (value === null || value === undefined) return false;
    const normalized = String(value).trim();
    return normalized !== "" && normalized !== "null" && normalized !== "undefined" && normalized !== "[object Object]";
  }

  function getHints(img) {
    return [
      img.id,
      img.className,
      img.alt,
      img.getAttribute("name"),
      img.getAttribute("aria-label"),
      img.dataset.fallbackType,
      img.closest(".logo") ? "logo" : "",
      img.closest(".user-avatar") ? "avatar" : "",
      img.closest(".user-info") ? "profile" : "",
      img.closest(".user-profile") ? "profile" : ""
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function resolveFallbackType(img, explicitType) {
    if (explicitType) return explicitType;
    if (img.dataset.fallbackType) return img.dataset.fallbackType;

    const hints = getHints(img);
    if (/(logo|brand)/.test(hints)) return "logo";
    if (/(avatar|profile|user avatar|profile image|profile pic)/.test(hints)) return "avatar";
    return null;
  }

  function getFallbackSource(type) {
    if (type === "avatar") return DEFAULT_AVATAR_SRC;
    if (type === "logo") return DEFAULT_LOGO_SRC;
    return "";
  }

  function applyFallbackClasses(img, type) {
    img.classList.toggle("portal-fallback-avatar", type === "avatar");
    img.classList.toggle("portal-fallback-logo", type === "logo");
  }

  function setImageSource(target, source, options) {
    const img = typeof target === "string" ? document.getElementById(target) : target;
    if (!(img instanceof HTMLImageElement)) return;

    const config = options || {};
    const type = resolveFallbackType(img, config.type);
    const fallbackSource = config.fallbackSrc || getFallbackSource(type);
    const resolvedSource = isValidSource(source) ? String(source).trim() : fallbackSource;

    if (type) {
      img.dataset.fallbackType = type;
      img.dataset.fallbackSrc = fallbackSource;
      applyFallbackClasses(img, type);
    }

    if (resolvedSource && img.getAttribute("src") !== resolvedSource) {
      img.setAttribute("src", resolvedSource);
    }
  }

  function prepareImageFallback(img) {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.portalUiPrepared === "true") return;

    const type = resolveFallbackType(img);
    if (!type) return;

    img.dataset.portalUiPrepared = "true";
    img.dataset.fallbackType = type;
    img.dataset.fallbackSrc = getFallbackSource(type);
    applyFallbackClasses(img, type);

    img.addEventListener("error", function handleImageError() {
      const fallbackSource = img.dataset.fallbackSrc || getFallbackSource(type);
      if (fallbackSource && img.getAttribute("src") !== fallbackSource) {
        img.setAttribute("src", fallbackSource);
      }
    });

    if (!isValidSource(img.getAttribute("src"))) {
      img.setAttribute("src", img.dataset.fallbackSrc);
    }
  }

  function enhanceImages(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll("img").forEach(prepareImageFallback);
  }

  function wrapTable(table) {
    if (!(table instanceof HTMLTableElement)) return;
    if (table.closest(".portal-table-scroll")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "portal-table-scroll";
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  }

  function enhanceTables(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll("table").forEach(wrapTable);
  }

  function refreshPasswordToggle(button, input) {
    const isVisible = input.type === "text";
    button.innerHTML = isVisible ? eyeSlashIcon : eyeIcon;
    button.setAttribute("aria-label", isVisible ? "Hide password" : "Show password");
    button.setAttribute("title", isVisible ? "Hide password" : "Show password");
  }

  function enhancePasswordToggle(button) {
    if (!(button instanceof HTMLElement)) return;
    if (button.dataset.portalUiPrepared === "true") return;

    const targetId = button.getAttribute("data-password-toggle");
    const input = targetId ? document.getElementById(targetId) : null;
    if (!(input instanceof HTMLInputElement)) return;

    button.dataset.portalUiPrepared = "true";
    refreshPasswordToggle(button, input);

    button.addEventListener("click", function () {
      input.type = input.type === "password" ? "text" : "password";
      refreshPasswordToggle(button, input);
      input.focus({ preventScroll: true });
    });
  }

  function enhancePasswordToggles(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll("[data-password-toggle]").forEach(enhancePasswordToggle);
  }

  function detectShell() {
    if (document.getElementById("left-navbar") && document.getElementById("content-box")) {
      return "admin";
    }
    if (document.getElementById("toggle") && document.getElementById("right-container")) {
      return "franchise";
    }
    if (document.getElementById("sidebar") && document.querySelector(".main-content")) {
      return "superadmin";
    }
    if (document.body.getAttribute("ng-app") === "staffManagementApp") {
      return "staff";
    }
    return "";
  }

  function applyShellClasses() {
    const shell = detectShell();
    document.body.classList.add("portal-ui-enhanced");
    if (shell) {
      document.body.classList.add(`portal-shell-${shell}`);
    }
  }

  function removeDesktopOnlyMessage() {
    const blocker = document.getElementById("mobileMessage");
    if (blocker) {
      blocker.remove();
    }
  }

  function syncAdminShell() {
    const sidebar = document.getElementById("left-navbar");
    const content = document.getElementById("content-box");
    if (!sidebar || !content) return;

    if (window.innerWidth <= SHELL_BREAKPOINT) {
      sidebar.classList.add("hidden");
      content.classList.add("collapsed");
    } else {
      sidebar.classList.remove("hidden");
      content.classList.remove("collapsed");
    }
  }

  function syncFranchiseShell() {
    const sidebar = document.getElementById("toggle");
    const content = document.getElementById("right-container");
    if (!sidebar || !content) return;

    if (window.innerWidth <= SHELL_BREAKPOINT) {
      sidebar.classList.add("hidden");
      content.classList.add("full-width");
    } else {
      sidebar.classList.remove("hidden");
      content.classList.remove("full-width");
    }
  }

  function syncSuperAdminShell() {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;

    if (window.innerWidth > SHELL_BREAKPOINT) {
      sidebar.classList.remove("active");
    }
  }

  function closeShellOnOutsideClick(event) {
    if (window.innerWidth > SHELL_BREAKPOINT) return;

    const adminSidebar = document.getElementById("left-navbar");
    const adminToggle = document.getElementById("toggle-div");
    const franchiseSidebar = document.getElementById("toggle");
    const franchiseToggle = document.querySelector(".logo_toggle");
    const superAdminSidebar = document.getElementById("sidebar");
    const superAdminToggle = document.getElementById("toggle-sidebar");

    if (
      adminSidebar &&
      !adminSidebar.classList.contains("hidden") &&
      !adminSidebar.contains(event.target) &&
      !(adminToggle && adminToggle.contains(event.target))
    ) {
      adminSidebar.classList.add("hidden");
      const content = document.getElementById("content-box");
      if (content) content.classList.add("collapsed");
    }

    if (
      franchiseSidebar &&
      !franchiseSidebar.classList.contains("hidden") &&
      !franchiseSidebar.contains(event.target) &&
      !(franchiseToggle && franchiseToggle.contains(event.target))
    ) {
      franchiseSidebar.classList.add("hidden");
      const content = document.getElementById("right-container");
      if (content) content.classList.add("full-width");
    }

    if (
      superAdminSidebar &&
      superAdminSidebar.classList.contains("active") &&
      !superAdminSidebar.contains(event.target) &&
      !(superAdminToggle && superAdminToggle.contains(event.target))
    ) {
      superAdminSidebar.classList.remove("active");
    }
  }

  function syncResponsiveShell() {
    syncAdminShell();
    syncFranchiseShell();
    syncSuperAdminShell();
  }

  function observeDynamicContent() {
    if (!document.body || !window.MutationObserver) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          enhanceImages(node);
          enhanceTables(node);
          enhancePasswordToggles(node);
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    applyShellClasses();
    removeDesktopOnlyMessage();
    enhanceImages(document);
    enhanceTables(document);
    enhancePasswordToggles(document);
    syncResponsiveShell();
    observeDynamicContent();
    document.addEventListener("click", closeShellOnOutsideClick);
    window.addEventListener("resize", syncResponsiveShell);
  }

  window.PortalUI = {
    setImageSource,
    enhanceImages,
    enhanceTables,
    enhancePasswordToggles,
    syncResponsiveShell,
    defaultLogo: DEFAULT_LOGO_SRC,
    defaultAvatar: DEFAULT_AVATAR_SRC
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
