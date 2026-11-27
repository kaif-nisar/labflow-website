(async function () {
    function loadFallbackScript(url) {
        if (typeof window.loadScript === 'function') {
            return window.loadScript(url);
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = false;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
            document.head.appendChild(script);
        });
    }

    try {
        if (!window.LabflowBookingHelpers) {
            await loadFallbackScript('/js/bookingPatientHelpers.js');
        }
        if (typeof window.initLabflowBookingPage !== 'function') {
            await loadFallbackScript('pages/pages/bookingPage.shared.js');
        }

        await window.initLabflowBookingPage({ mode: 'edit' });
    } catch (error) {
        console.error('Edit booking page failed to load:', error);
        const loader = document.querySelector('.loader');
        if (loader) {
            loader.style.display = 'none';
        }
    }
})();

