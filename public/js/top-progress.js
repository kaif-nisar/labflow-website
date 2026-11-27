(function () {
  if (window.AppTopLoader) {
    return;
  }

  const PROGRESS_STYLE_ID = "app-top-loader-style";
  const PROGRESS_ROOT_ID = "app-top-loader";
  const LEGACY_LOADER_SELECTOR = [
    ".loader",
    ".loader-bg",
    ".loaderDiv",
    ".loaderDiv1",
    ".loader-div",
    ".loaderInnerDiv",
    ".loader-overlay",
    ".loading-screen",
    ".loading-spinner",
    ".loader-content",
    ".spinner1",
    ".loader-format3",
    ".format-loader",
    ".page-boot-loader",
    "#loader",
    "#loader1",
    "#loadingScreen",
    "#loadingOverlay",
    "#pageBootLoader",
    "#button-loader"
  ].join(",");

  const state = {
    seq: 0,
    mounted: false,
    visible: false,
    progress: 0,
    root: null,
    bar: null,
    activeTokens: new Set(),
    tokenMeta: new Map(),
    showTimer: null,
    hideTimer: null,
    trickleTimer: null,
    legacyEntries: new WeakMap(),
    observer: null
  };

  const config = {
    delayMs: 120,
    minimum: 0.08,
    maximum: 0.92,
    trickleMs: 220,
    fadeMs: 260
  };

  function injectStyles() {
    if (document.getElementById(PROGRESS_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = PROGRESS_STYLE_ID;
    style.textContent = `
      #${PROGRESS_ROOT_ID} {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 3.5px;
        opacity: 0;
        pointer-events: none;
        z-index: 2147483647;
        transition: opacity 220ms ease;
      }

      #${PROGRESS_ROOT_ID}.is-visible {
        opacity: 1;
      }

      /* Yield to SPA shell instant progress rail during active route transitions so only one top bar appears */
      #lfInstantRail.is-active ~ #${PROGRESS_ROOT_ID},
      #lfInstantRail.is-active ~ #${PROGRESS_ROOT_ID}.is-visible {
        opacity: 0 !important;
        visibility: hidden !important;
        transition: none !important;
      }

      #${PROGRESS_ROOT_ID} .app-top-loader__bar {
        position: relative;
        width: 100%;
        height: 100%;
        transform: scaleX(0);
        transform-origin: left center;
        transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease;
        background: linear-gradient(90deg, #2563eb 0%, #38bdf8 50%, #6366f1 100%);
        box-shadow: 0 0 12px rgba(56, 189, 248, 0.75);
      }

      #${PROGRESS_ROOT_ID} .app-top-loader__peg {
        position: absolute;
        top: 0;
        right: 0;
        width: 120px;
        height: 100%;
        opacity: 0.95;
        transform: translateX(38px);
        background: linear-gradient(90deg, rgba(56, 189, 248, 0), rgba(143, 220, 255, 0.95));
        filter: blur(8px);
      }

      .app-top-loader-legacy {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      .app-top-loader-legacy * {
        pointer-events: none !important;
      }
    `;

    document.head.appendChild(style);
  }

  function mount() {
    if (state.mounted || !document.body) {
      return;
    }

    injectStyles();

    const root = document.createElement("div");
    root.id = PROGRESS_ROOT_ID;
    root.setAttribute("aria-hidden", "true");

    const bar = document.createElement("div");
    bar.className = "app-top-loader__bar";

    const peg = document.createElement("div");
    peg.className = "app-top-loader__peg";

    bar.appendChild(peg);
    root.appendChild(bar);
    document.body.appendChild(root);

    state.root = root;
    state.bar = bar;
    state.mounted = true;

    scanLegacyLoaders(document);
    startLegacyObserver();
  }

  function setProgress(value) {
    state.progress = Math.min(1, Math.max(0, Number(value) || 0));
    if (state.bar) {
      state.bar.style.transform = `scaleX(${state.progress})`;
    }
  }

  function set(value) {
    if (!state.activeTokens.size) {
      return;
    }
    const clamped = Math.min(0.96, Math.max(config.minimum, Number(value) || 0));
    if (clamped > state.progress) {
      setProgress(clamped);
    }
  }

  function stopTrickle() {
    if (state.trickleTimer) {
      window.clearInterval(state.trickleTimer);
      state.trickleTimer = null;
    }
  }

  function startTrickle() {
    if (state.trickleTimer) {
      return;
    }

    state.trickleTimer = window.setInterval(() => {
      if (state.activeTokens.size === 0 || state.progress >= config.maximum) {
        return;
      }

      const remaining = config.maximum - state.progress;
      const step = Math.min(remaining, Math.max(0.015, remaining * (0.16 + Math.random() * 0.14)));
      setProgress(state.progress + step);
    }, config.trickleMs);
  }

  function reveal() {
    if (state.showTimer) {
      window.clearTimeout(state.showTimer);
      state.showTimer = null;
    }
    if (!state.activeTokens.size) {
      return;
    }

    mount();
    if (!state.root) {
      return;
    }
    state.visible = true;
    state.root.classList.add("is-visible");
    if (state.progress < config.minimum) {
      setProgress(config.minimum);
    }
    startTrickle();
  }

  function scheduleReveal(immediate) {
    if (immediate) {
      reveal();
      return;
    }
    if (state.visible || state.showTimer) {
      return;
    }

    state.showTimer = window.setTimeout(reveal, config.delayMs);
  }

  function finishIfIdle() {
    if (state.activeTokens.size > 0) {
      return;
    }

    if (state.showTimer) {
      window.clearTimeout(state.showTimer);
      state.showTimer = null;
      setProgress(0);
      return;
    }

    if (!state.visible) {
      setProgress(0);
      return;
    }

    stopTrickle();
    setProgress(1);

    if (state.hideTimer) {
      window.clearTimeout(state.hideTimer);
    }

    state.hideTimer = window.setTimeout(() => {
      state.visible = false;
      if (state.root) {
        state.root.classList.remove("is-visible");
      }

      window.setTimeout(() => {
        if (!state.visible && state.activeTokens.size === 0) {
          setProgress(0);
        }
      }, config.fadeMs);
    }, 180);
  }

  function start(label, options) {
    mount();

    if (options && options.silent) {
      return null;
    }

    if (state.hideTimer) {
      window.clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }

    const token = `top-loader-${++state.seq}`;
    const immediate = Boolean(options && options.immediate);
    state.activeTokens.add(token);
    state.tokenMeta.set(token, { label: label || "task", immediate });

    const initialProgress = options && typeof options.progress === "number"
      ? Math.max(config.minimum, Math.min(0.9, options.progress))
      : config.minimum;

    if (state.progress < initialProgress) {
      setProgress(initialProgress);
    }

    scheduleReveal(immediate);
    startTrickle();

    return token;
  }

  function done(token) {
    if (token) {
      state.activeTokens.delete(token);
      state.tokenMeta.delete(token);
    } else {
      state.activeTokens.clear();
      state.tokenMeta.clear();
    }

    finishIfIdle();
  }

  function wrap(promise, label, options) {
    const token = start(label, options);
    return Promise.resolve(promise).finally(() => done(token));
  }

  function isSilentRequest(input, init) {
    if (init && init.__topLoaderSilent) {
      return true;
    }

    const method = (init && init.method ? String(init.method) : "GET").toUpperCase();
    if (method === "HEAD" || method === "OPTIONS") {
      return true;
    }

    const requestUrl = typeof input === "string" ? input : input && input.url ? input.url : "";
    return requestUrl.startsWith("data:");
  }

  function installFetchProxy() {
    if (window.__appTopLoaderFetchInstalled || typeof window.fetch !== "function") {
      return;
    }

    const originalFetch = window.fetch.bind(window);
    window.__appTopLoaderFetchInstalled = true;

    window.fetch = function (input, init) {
      if (isSilentRequest(input, init)) {
        return originalFetch(input, init);
      }

      const token = start(typeof input === "string" ? input : "fetch");
      return Promise.resolve(originalFetch(input, init)).finally(() => done(token));
    };
  }

  function isLegacyLoaderVisible(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const inlineDisplay = (element.style.display || "").trim().toLowerCase();
    if (inlineDisplay && inlineDisplay !== "none") {
      return true;
    }

    return (
      element.classList.contains("active") ||
      element.classList.contains("show") ||
      element.classList.contains("loadervisible") ||
      element.classList.contains("is-visible") ||
      element.getAttribute("aria-hidden") === "false"
    );
  }

  function registerLegacyLoader(element) {
    if (!(element instanceof HTMLElement) || state.legacyEntries.has(element)) {
      return;
    }

    element.classList.add("app-top-loader-legacy");
    state.legacyEntries.set(element, {
      token: null,
      visible: isLegacyLoaderVisible(element)
    });
  }

  function releaseLegacyLoader(element) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    const entry = state.legacyEntries.get(element);
    if (!entry) {
      return;
    }

    if (entry.token) {
      done(entry.token);
    }

    state.legacyEntries.delete(element);
  }

  function syncLegacyLoader(element) {
    const entry = state.legacyEntries.get(element);
    if (!entry) {
      return;
    }

    const visible = isLegacyLoaderVisible(element);
    if (visible === entry.visible) {
      return;
    }

    entry.visible = visible;

    if (visible && !entry.token) {
      entry.token = start(`legacy:${element.id || element.className || "loader"}`);
      return;
    }

    if (!visible && entry.token) {
      done(entry.token);
      entry.token = null;
    }
  }

  function collectLegacyNodes(root) {
    const nodes = [];

    if (!(root instanceof Element)) {
      return nodes;
    }

    if (root.matches(LEGACY_LOADER_SELECTOR)) {
      nodes.push(root);
    }

    root.querySelectorAll(LEGACY_LOADER_SELECTOR).forEach((element) => {
      nodes.push(element);
    });

    return nodes;
  }

  function scanLegacyLoaders(root) {
    collectLegacyNodes(root).forEach(registerLegacyLoader);
  }

  function releaseLegacyLoaders(root) {
    collectLegacyNodes(root).forEach(releaseLegacyLoader);
  }

  function startLegacyObserver() {
    if (state.observer) {
      return;
    }

    state.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) {
              scanLegacyLoaders(node);
            }
          });

          mutation.removedNodes.forEach((node) => {
            if (node instanceof Element) {
              releaseLegacyLoaders(node);
            }
          });

          return;
        }

        if (mutation.target instanceof HTMLElement) {
          if (!state.legacyEntries.has(mutation.target) && mutation.target.matches(LEGACY_LOADER_SELECTOR)) {
            registerLegacyLoader(mutation.target);
          }

          syncLegacyLoader(mutation.target);
        }
      });
    });

    state.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class", "aria-hidden", "hidden"]
    });
  }

  window.AppTopLoader = {
    start,
    done,
    set,
    wrap,
    isActive: () => state.activeTokens.size > 0,
    scanLegacyLoaders
  };

  installFetchProxy();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
