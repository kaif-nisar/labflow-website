# Offline LabFlow desktop integration prompt

You are editing the offline Electron build of the same LabFlow LIS codebase. The cloud code now has a separate, public offline-report channel. Do not modify the existing cloud-report QR/download flow or the cloud `Customization` collection.

## Goal

When an offline report is finalised (and whenever its PDF content changes), upload the complete final PDF-render payload to the cloud. The cloud responds with a tokenised URL. Generate the printed report's QR code from that URL. A patient scanning it opens a cloud page that automatically downloads the cloud-generated PDF and also shows a manual download button.

## Cloud API contract

Base endpoint: `https://labflowlis.com/api/v1/offline-reports`

`POST /api/v1/offline-reports` is intentionally JWT-free so an offline Electron install can sync directly when internet returns. Send JSON with at least:

```json
{
  "offlineReportId": "stable-local-report-id",
  "bookingId": "booking-number",
  "reportId": "optional-local-object-id",
  "pdfFormat": "reportFormat1",
  "htmlContent": "final report body HTML",
  "cssContent": "final report CSS",
  "header": "final header HTML",
  "footer": "final footer HTML",
  "backgroundImageUrl": "optional cloud-reachable image URL",
  "showInvest": true,
  "BoldRow": true,
  "HLinred": false,
  "HighLow": true,
  "RowSpacing": 7,
  "selectedFontSize": 12,
  "selectedFontFamily": "Arial",
  "hideCategories": false,
  "hideTableHeadings": false,
  "headermargin": "2.8",
  "footermargin": "1",
  "marginRight": "0",
  "marginLeft": "0",
  "LeftsignPd": "0",
  "Rightsignpd": "0",
  "investigationmargin": 40,
  "showlab": false,
  "showdoctorfirst": true,
  "showdoctorsecond": true,
  "fileInputLab": "",
  "fileInputDoctorleft": "",
  "fileInputDoctorright": "",
  "fileInputLabtext": "",
  "fileInputDoctorlefttext": "",
  "fileInputDoctorrighttext": ""
}
```

Use the same final values currently sent to `/api/v1/user/adding-pdf-data` / `/api/v1/user/get-pdf`; do not re-create report markup with a different algorithm. `offlineReportId` must be stable for the local report, so retries and later edits upsert the same cloud document. Save this entire API response in the local offline database, especially `downloadUrl`, `downloadToken`, and `expiresAt`.

```json
{
  "success": true,
  "offlineReportId": "...",
  "downloadToken": "opaque-token",
  "downloadUrl": "https://labflowlis.com/offline-report-download.html?token=opaque-token",
  "expiresAt": "ISO-date"
}
```

Create the QR from `downloadUrl`, not from a report ID, booking ID, or a local URL. The token is opaque and must not be altered. On network failure, queue the payload locally and retry with exponential backoff when the app next has connectivity. Do not block the offline PDF download/print workflow because sync failed.

## Important implementation notes

- Place this as a separate offline-only integration module/call site; do not alter existing online QR code behavior.
- Upload after all QR/barcode/signature images have been converted to base64 or are otherwise reachable by the cloud renderer. Do not include the QR image in `htmlContent` before `downloadUrl` is known; after the upload returns, generate/inject the QR using `downloadUrl`, then upload once more with the final HTML so the cloud PDF contains that QR.
- The server creates/refreshes an `offline_reports` collection document and its TTL expiry every upload. MongoDB deletes it automatically one calendar month after the most recent upload. Treat an expired QR as intentionally unavailable.
- The public PDF endpoint is `GET /api/v1/offline-reports/:token/pdf`; do not call it from the desktop app for normal local printing.
- Handle HTTP errors visibly in the desktop sync status, but retain the local report and retry safely.
