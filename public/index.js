(() => {
  const CARD_GAP = 24;
  const PRICE_TABLE = {
    p1: [699, 559],
    p2: [1999, 1599],
    p3: [4999, 3999],
    p4: [9999, 7999],
  };

  const getBaseUrl = () => window.location.origin;

  const getToastStack = () => {
    let stack = document.querySelector(".toast-stack");

    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }

    return stack;
  };

  const showToast = (message, type = "success") => {
    if (!message) {
      return;
    }

    const stack = getToastStack();
    const toast = document.createElement("div");
    toast.className = `app-toast ${type}`;
    toast.textContent = message;
    stack.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    window.setTimeout(() => {
      toast.classList.remove("show");
      window.setTimeout(() => toast.remove(), 250);
    }, 3500);
  };

  const setFeedback = (element, message, type = "") => {
    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.classList.remove("success", "error");

    if (type) {
      element.classList.add(type);
    }
  };

  const bindNavbar = () => {
    const navbar = document.getElementById("navbar");

    if (!navbar) {
      return;
    }

    const syncNavbar = () => {
      navbar.classList.toggle("scrolled", window.scrollY > 60);
    };

    syncNavbar();
    window.addEventListener("scroll", syncNavbar, { passive: true });
  };

  const bindMobileMenus = () => {
    const hamburger = document.getElementById("hamburger");
    const mobileMenu = document.getElementById("mobileMenu");
    const menuToggle = document.getElementById("menuToggle");
    const dropdownMenu = document.getElementById("dropdownMenu");

    const closeMenus = () => {
      mobileMenu?.classList.remove("open");
      dropdownMenu?.classList.add("hidden");
    };

    if (hamburger && mobileMenu) {
      hamburger.addEventListener("click", () => {
        mobileMenu.classList.toggle("open");
      });
    }

    if (menuToggle && dropdownMenu) {
      menuToggle.addEventListener("click", () => {
        dropdownMenu.classList.toggle("hidden");
      });
    }

    window.closeMobile = closeMenus;
  };

  const bindSmoothScroll = () => {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", (event) => {
        const targetSelector = anchor.getAttribute("href");

        if (!targetSelector || targetSelector === "#") {
          return;
        }

        const target = document.querySelector(targetSelector);

        if (!target) {
          return;
        }

        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        window.closeMobile?.();
      });
    });
  };

  const bindRevealAnimations = () => {
    const revealTargets = document.querySelectorAll(".reveal, .scroll-animate");

    if (!revealTargets.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("visible");
          entry.target.classList.add("active");
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    revealTargets.forEach((target) => observer.observe(target));
  };

  const bindScreenshotSlider = () => {
    const track = document.getElementById("ssTrack");
    const nextButton = document.getElementById("ss-next");
    const prevButton = document.getElementById("ss-prev");

    if (!track || !nextButton || !prevButton) {
      return;
    }

    const getScrollAmount = () => {
      const firstCard = track.querySelector(".ss-card");
      if (!firstCard) {
        return 524;
      }

      return firstCard.getBoundingClientRect().width + CARD_GAP;
    };

    nextButton.addEventListener("click", () => {
      track.scrollBy({ left: getScrollAmount(), behavior: "smooth" });
    });

    prevButton.addEventListener("click", () => {
      track.scrollBy({ left: -getScrollAmount(), behavior: "smooth" });
    });
  };

  const bindPricingToggle = () => {
    const toggle = document.getElementById("billingToggle");

    if (!toggle) {
      return;
    }

    const syncPrices = () => {
      const priceIndex = toggle.checked ? 1 : 0;

      Object.entries(PRICE_TABLE).forEach(([key, values]) => {
        const element = document.getElementById(key);
        if (element) {
          element.textContent = values[priceIndex];
        }
      });
    };

    toggle.addEventListener("change", syncPrices);
    syncPrices();
  };

  const bindNewsletterForms = () => {
    const forms = document.querySelectorAll("form[data-newsletter-form], form#subscribeform");

    forms.forEach((form) => {
      const emailInput = form.querySelector('input[type="email"]');
      const submitButton = form.querySelector('button[type="submit"], button');

      if (!emailInput || !submitButton) {
        return;
      }

      let feedback = form.nextElementSibling;
      if (!feedback || !feedback.classList.contains("newsletter-feedback")) {
        feedback = document.createElement("div");
        feedback.className = "newsletter-feedback";
        feedback.setAttribute("aria-live", "polite");
        form.insertAdjacentElement("afterend", feedback);
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = emailInput.value.trim().toLowerCase();

        if (!email) {
          setFeedback(feedback, "Please enter your email address.", "error");
          return;
        }

        submitButton.disabled = true;
        setFeedback(feedback, "Subscribing you to product updates...", "");

        try {
          const response = await fetch(`${getBaseUrl()}/api/v1/user/subscribe`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email }),
          });

          const payload = await response.json().catch(() => ({}));
          const message =
            payload?.message ||
            (response.ok
              ? "Thanks for subscribing. Automated updates are now enabled."
              : "Subscription could not be completed right now.");

          setFeedback(feedback, message, response.ok ? "success" : "error");
          showToast(message, response.ok ? "success" : "error");

          if (response.ok) {
            form.reset();
          }
        } catch (error) {
          const message = "Something went wrong while subscribing. Please try again.";
          console.error("Newsletter subscribe failed:", error);
          setFeedback(feedback, message, "error");
          showToast(message, "error");
        } finally {
          submitButton.disabled = false;
        }
      });
    });
  };

  const bindTrialModal = () => {
    const modal = document.getElementById("modal");
    const modalClose = document.getElementById("modalClose");
    const modalSub = document.getElementById("modalSub");
    const selectedPlan = document.getElementById("selectedPlan");
    const trialForm = document.getElementById("trialForm");
    const trialFormStatus = document.getElementById("trialFormStatus");
    const trialSubmit = trialForm?.querySelector('button[type="submit"]');

    if (!modal || !modalClose || !modalSub || !selectedPlan || !trialForm || !trialSubmit) {
      return;
    }

    const openModal = (planName = "Standard") => {
      selectedPlan.value = planName;
      modalSub.textContent = `Selected Plan: ${planName} - Fill in your details and we will contact you shortly.`;
      setFeedback(trialFormStatus, "", "");
      modal.classList.add("open");
      document.body.style.overflow = "hidden";
    };

    const closeModal = () => {
      modal.classList.remove("open");
      document.body.style.overflow = "";
    };

    document.querySelectorAll(".open-modal").forEach((button) => {
      button.addEventListener("click", () => {
        openModal(button.dataset.plan || "Standard");
      });
    });

    modalClose.addEventListener("click", closeModal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeModal();
      }
    });

    trialForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const formData = new FormData(trialForm);
      const payload = {
        name: String(formData.get("name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        city: String(formData.get("city") || "").trim(),
        plan: String(formData.get("plan") || "Standard").trim(),
      };

      if (!payload.name || !payload.email || !payload.phone || !payload.city) {
        setFeedback(trialFormStatus, "Please fill all fields before submitting.", "error");
        return;
      }

      const termsAccepted = document.getElementById("trialTerms")?.checked;
      if (!termsAccepted) {
        setFeedback(trialFormStatus, "Please agree to the Terms & Conditions first.", "error");
        return;
      }

      trialSubmit.disabled = true;
      setFeedback(trialFormStatus, "Submitting your trial request...", "");

      try {
        const response = await fetch(`${getBaseUrl()}/api/v1/user/handleRequest`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(result?.message || "Unable to submit your request right now.");
        }

        const successMessage = "Your request has been submitted successfully. Our team will contact you soon.";
        setFeedback(trialFormStatus, successMessage, "success");
        showToast(successMessage, "success");
        trialForm.reset();

        window.setTimeout(() => {
          closeModal();
        }, 1200);
      } catch (error) {
        const message = error?.message || "Something went wrong while submitting your request.";
        console.error("Trial form submission failed:", error);
        setFeedback(trialFormStatus, message, "error");
        showToast(message, "error");
      } finally {
        trialSubmit.disabled = false;
      }
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindNavbar();
    bindMobileMenus();
    bindSmoothScroll();
    bindRevealAnimations();
    bindScreenshotSlider();
    bindPricingToggle();
    bindNewsletterForms();
    bindTrialModal();
  });
})();
