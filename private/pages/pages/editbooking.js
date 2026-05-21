(async function () {
    try {
        if (typeof window.initLabflowBookingPage !== 'function') {
            await loadScript('pages/pages/bookingPage.shared.js');
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

