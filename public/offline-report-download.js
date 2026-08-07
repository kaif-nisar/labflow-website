(() => {
  const token = new URLSearchParams(window.location.search).get('token');
  const card = document.getElementById('report-card');
  const status = document.getElementById('status');
  const meta = document.getElementById('meta');
  const button = document.getElementById('download-btn');
  let downloadStarted = false;

  const showError = (message) => {
    card.classList.add('error');
    status.textContent = message;
    meta.textContent = '';
  };
  const pdfUrl = () => `/api/v1/offline-reports/${encodeURIComponent(token)}/pdf`;
  const download = () => {
    if (downloadStarted || !token) return;
    downloadStarted = true;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Downloading…';
    // A navigation lets the browser handle large PDF streams without storing a
    // second PDF copy in browser memory.
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.src = pdfUrl();
    document.body.appendChild(frame);
    window.setTimeout(() => {
      button.disabled = false;
      button.innerHTML = '<i class="fa-solid fa-download"></i> Download report again';
      downloadStarted = false;
    }, 3000);
  };

  if (!token) {
    showError('This report link is incomplete. Please scan the QR code again.');
    return;
  }

  fetch(`/api/v1/offline-reports/${encodeURIComponent(token)}`)
    .then(async (response) => {
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'This report is unavailable.');
      return response.json();
    })
    .then((report) => {
      const expiry = new Date(report.expiresAt);
      meta.textContent = Number.isNaN(expiry.getTime()) ? '' : `Available until ${expiry.toLocaleDateString()}`;
      status.textContent = 'Your download will start automatically. If it does not, use the button below.';
      button.addEventListener('click', download);
      download();
    })
    .catch((error) => showError(error.message || 'This report is unavailable or has expired.'));
})();
