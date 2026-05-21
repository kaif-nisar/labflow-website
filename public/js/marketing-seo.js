(() => {
    const EXIT_POPUP_DISMISSED_KEY = "labflowExitPopupDismissed";
    const header = document.querySelector(".site-header");
    const navToggle = document.getElementById("navToggle");
    const mobileNav = document.getElementById("mobileNav");
    const bookings = document.getElementById("roiBookings");
    const minutes = document.getElementById("roiMinutes");
    const hourly = document.getElementById("roiHourly");
    const result = document.getElementById("roiResult");

    const syncHeaderState = () => {
        if (!header) return;
        if (window.scrollY > 8) {
            header.classList.add("is-scrolled");
        } else {
            header.classList.remove("is-scrolled");
        }
    };

    const closeMobileNav = () => {
        if (!navToggle || !mobileNav) return;
        navToggle.setAttribute("aria-expanded", "false");
        mobileNav.hidden = true;
        mobileNav.classList.remove("is-open");
        document.body.classList.remove("mobile-nav-open");
    };

    const openMobileNav = () => {
        if (!navToggle || !mobileNav) return;
        navToggle.setAttribute("aria-expanded", "true");
        mobileNav.hidden = false;
        mobileNav.classList.add("is-open");
        document.body.classList.add("mobile-nav-open");
    };

    navToggle?.addEventListener("click", () => {
        const expanded = navToggle.getAttribute("aria-expanded") === "true";
        if (expanded) {
            closeMobileNav();
        } else {
            openMobileNav();
        }
    });

    mobileNav?.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
            closeMobileNav();
        });
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 860) {
            closeMobileNav();
        }
    }, { passive: true });

    window.addEventListener("scroll", syncHeaderState, { passive: true });
    syncHeaderState();

    const update = () => {
        if (!bookings || !minutes || !hourly || !result) return;
        const bookingCount = Number(bookings.value || 0);
        const minutesSaved = Number(minutes.value || 0);
        const hourlyCost = Number(hourly.value || 0);
        const monthlyValue = Math.round((bookingCount * minutesSaved * 26 / 60) * hourlyCost);
        result.textContent = `Estimated monthly value unlocked: INR ${monthlyValue.toLocaleString("en-IN")}`;
    };

    [bookings, minutes, hourly].forEach((input) => {
        if (input) input.addEventListener("input", update, { passive: true });
    });

    update();

    const popup = document.getElementById("exitPopup");
    const closeBtn = popup?.querySelector(".exit-popup__close");
    let shown = false;
    let exitIntentBound = false;

    const closePopup = () => {
        if (!popup) return;
        popup.hidden = true;
        popup.style.display = "none";
        popup.setAttribute("aria-hidden", "true");
        document.body.classList.remove("popup-open");
        shown = true;
        try {
            sessionStorage.setItem(EXIT_POPUP_DISMISSED_KEY, "true");
        } catch (error) {
            // ignore storage issues
        }
    };

    const showPopup = () => {
        if (!popup || shown || window.innerWidth < 900) return;
        shown = true;
        popup.hidden = false;
        popup.style.display = "grid";
        popup.setAttribute("aria-hidden", "false");
        document.body.classList.add("popup-open");
    };

    const isPopupDismissed = () => {
        try {
            return sessionStorage.getItem(EXIT_POPUP_DISMISSED_KEY) === "true";
        } catch (error) {
            return false;
        }
    };

    closeBtn?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closePopup();
    });
    popup?.addEventListener("click", (event) => {
        if (event.target === popup) closePopup();
    });
    document.addEventListener("click", (event) => {
        const closeTrigger = event.target.closest(".exit-popup__close");
        if (closeTrigger) {
            event.preventDefault();
            closePopup();
        }
    });

    if (popup && !isPopupDismissed() && !exitIntentBound) {
        exitIntentBound = true;
        document.addEventListener("mouseout", (event) => {
            if (shown || isPopupDismissed()) return;
            if (event.relatedTarget || event.toElement) return;
            if (typeof event.clientY !== "number" || event.clientY > 10) return;
            showPopup();
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && navToggle?.getAttribute("aria-expanded") === "true") {
                closeMobileNav();
            }
            if (event.key === "Escape" && popup.style.display !== "none" && !popup.hidden) {
                closePopup();
            }
        });
    } else if (popup && isPopupDismissed()) {
        popup.hidden = true;
        popup.style.display = "none";
        popup.setAttribute("aria-hidden", "true");
        document.body.classList.remove("popup-open");
        shown = true;
    }
})();
