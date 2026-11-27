(function () {
  function ensureAssets() {
    if (!document.querySelector('link[href*="/css/catalog-studio.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/css/catalog-studio.css?v=1";
      document.head.appendChild(link);
    }
    const loadScript = (src, check) => {
      if (check()) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load " + src));
        document.head.appendChild(s);
      });
    };
    return loadScript("/js/catalogStudioEngine.js", () => Boolean(window.CatalogStudio))
      .then(() => loadScript("/js/catalogStudioPages.js", () => Boolean(window.CatalogStudioPages)));
  }

  window.subpageReady = ensureAssets().then(() =>
    window.CatalogStudioPages.initPackageFormPage({ portalMode: "superAdmin", mode: "add" })
  );
})();
