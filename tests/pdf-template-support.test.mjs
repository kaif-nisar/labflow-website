import assert from "node:assert/strict";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import puppeteer from "puppeteer";

import {
  detectMimeTypeFromBuffer,
  getMimeType,
  readAssetAsBuffer,
} from "../src/utils/pdfOfflineAssets.js";
import {
  UPLOAD_ROOT,
  normalizeStoredUploadPublicId,
  normalizeStoredUploadUrl,
} from "../src/utils/localStorage.js";
import { addBackgroundToPdf } from "../src/utils/pdfBackground.js";
import { generateFormat1PagePdf } from "../src/utils/pdfFormat1Helpers.js";
import { generateFormat5PdfBuffer } from "../src/controllers/reportFormat5Pdf.controller.js";
import { getPuppeteerLaunchOptions } from "../src/utils/puppeteerRuntime.js";
import { uploadImage } from "../src/controllers/template.controller.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(`PASS  ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name} -> ${error.stack || error.message}`);
    process.exitCode = 1;
  }
};

async function createSampleLetterheadPdf({ rotation = 0, withCrop = false } = {}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage(rotation === 90 || rotation === 270 ? [841.89, 595.28] : [595.28, 841.89]);
  if (rotation) {
    page.setRotation(degrees(rotation));
  }
  if (withCrop) {
    page.setCropBox(0, 0, page.getWidth(), page.getHeight());
  }
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  // Paint a distinct teal top header band on the page
  if (rotation === 90) {
    // On a page rotated 90 deg CW, x=0..100 lies along the visual top edge
    page.drawRectangle({ x: 0, y: 0, width: 100, height: 595.28, color: rgb(0.06, 0.46, 0.43) });
  } else {
    page.drawRectangle({ x: 0, y: 742, width: 595.28, height: 99.89, color: rgb(0.06, 0.46, 0.43) });
    page.drawText("ACME DIAGNOSTICS LETTERHEAD", { x: 36, y: 782, size: 18, font, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 32, color: rgb(0.95, 0.85, 0.2) });
  }
  return Buffer.from(await doc.save());
}

async function renderPdfPage1InBrowser(pdfBytes) {
  const browser = await puppeteer.launch(getPuppeteerLaunchOptions());
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ path: path.join(repoRoot, "public/vendor/pdfjs/pdf.min.js") });
    const workerCode = fs.readFileSync(path.join(repoRoot, "public/vendor/pdfjs/pdf.worker.min.js"), "utf8");
    return await page.evaluate(async (b64, workerSrcCode) => {
      const lib = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
      const blob = new Blob([workerSrcCode], { type: "application/javascript" });
      lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const doc = await lib.getDocument({ data: arr }).promise;
      const numPages = doc.numPages;
      const pagesMeta = [];
      for (let pNum = 1; pNum <= numPages; pNum++) {
        const pg = await doc.getPage(pNum);
        const vp = pg.getViewport({ scale: 1 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await pg.render({ canvasContext: ctx, viewport: vp }).promise;
        const topHeaderPx = Array.from(ctx.getImageData(Math.round(canvas.width / 2), 24, 1, 1).data);
        const bottomFooterPx = Array.from(ctx.getImageData(Math.round(canvas.width / 2), canvas.height - 12, 1, 1).data);
        pagesMeta.push({ width: canvas.width, height: canvas.height, topHeaderPx, bottomFooterPx });
      }
      return { numPages, pagesMeta };
    }, Buffer.from(pdfBytes).toString("base64"), workerCode);
  } finally {
    await browser.close();
  }
}

await check("detectMimeTypeFromBuffer and getMimeType identify PDF files reliably", () => {
  assert.equal(getMimeType("/uploads/reports/sample-template.pdf?v=1"), "application/pdf");
  assert.equal(detectMimeTypeFromBuffer(Buffer.from("%PDF-1.7\n...")), "application/pdf");
  assert.equal(
    detectMimeTypeFromBuffer(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("  %PDF-1.4\n...")])),
    "application/pdf"
  );
  assert.equal(detectMimeTypeFromBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d])), "image/png");
});

await check("localStorage helpers preserve .pdf raw public_ids and resolve /raw/upload URLs", () => {
  const rawUrl = "https://res.cloudinary.com/demo/raw/upload/v1732/labflow/reports/123-template-letterhead.pdf";
  assert.equal(normalizeStoredUploadUrl(rawUrl), rawUrl);
  assert.equal(normalizeStoredUploadPublicId(rawUrl), "labflow/reports/123-template-letterhead.pdf");
  assert.equal(
    normalizeStoredUploadPublicId("labflow/reports/123-template-letterhead.pdf"),
    "labflow/reports/123-template-letterhead.pdf"
  );
  assert.equal(normalizeStoredUploadUrl("/uploads/reports/123-letterhead.pdf"), "/uploads/reports/123-letterhead.pdf");
  assert.equal(normalizeStoredUploadPublicId("/uploads/reports/123-letterhead.pdf"), "reports/123-letterhead.pdf");

  const imgUrl = "https://res.cloudinary.com/demo/image/upload/v1732/labflow/reports/123-template.png";
  assert.equal(normalizeStoredUploadPublicId(imgUrl), "labflow/reports/123-template");
});

await check("uploadImage rejects spoofed/non-PDF and empty template files cleanly with temp cleanup", async () => {
  const tempDir = path.join(repoRoot, "temp");
  fs.mkdirSync(tempDir, { recursive: true });

  const makeMockRes = () => {
    const out = { statusCode: 200, body: null };
    return {
      status(code) {
        out.statusCode = code;
        return this;
      },
      json(payload) {
        out.body = payload;
        return out;
      },
      out,
    };
  };

  // 1. Spoofed .pdf containing plain text
  const spoofPath = path.join(tempDir, `spoof-${Date.now()}.pdf`);
  fs.writeFileSync(spoofPath, "NOT A REAL PDF FILE");
  const res1 = makeMockRes();
  await uploadImage(
    {
      user: { _id: "u1", role: "admin", tenantId: { _id: "t1" } },
      files: {
        template: [{ path: spoofPath, originalname: "fake.pdf", mimetype: "application/pdf", size: 19 }],
      },
    },
    res1
  );
  assert.equal(res1.out.statusCode, 400);
  assert.match(res1.out.body.message, /Invalid PDF/i);
  assert.equal(fs.existsSync(spoofPath), false);

  // 2. Unsupported extension (.txt)
  const txtPath = path.join(tempDir, `notes-${Date.now()}.txt`);
  fs.writeFileSync(txtPath, "hello");
  const res2 = makeMockRes();
  await uploadImage(
    {
      user: { _id: "u1", role: "admin", tenantId: { _id: "t1" } },
      files: {
        template: [{ path: txtPath, originalname: "notes.txt", mimetype: "text/plain", size: 5 }],
      },
    },
    res2
  );
  assert.equal(res2.out.statusCode, 400);
  assert.match(res2.out.body.message, /Unsupported template format/i);
  assert.equal(fs.existsSync(txtPath), false);
});

await check("addBackgroundToPdf embeds vector PDF letterhead behind Format 1 & Format 5 across multiple pages", async () => {
  const lhBytes = await createSampleLetterheadPdf();
  const relUploadName = `test-lh-${Date.now()}.pdf`;
  const uploadDir = path.join(UPLOAD_ROOT, "reports");
  fs.mkdirSync(uploadDir, { recursive: true });
  const uploadFilePath = path.join(uploadDir, relUploadName);
  fs.writeFileSync(uploadFilePath, lhBytes);

  try {
    const asset = await readAssetAsBuffer(`/uploads/reports/${relUploadName}`);
    assert.ok(asset?.buffer);
    assert.equal(asset.mimeType, "application/pdf");

    // 1. Format 1 multi-page test
    const browser = await puppeteer.launch(getPuppeteerLaunchOptions());
    let f1Raw;
    try {
      const page = await browser.newPage();
      const rows = Array.from({ length: 45 }, (_, i) => `
        <tr class="is-normal-row">
          <td class="test-name">Parameter ${i + 1}</td>
          <td class="high-low"><div class="rf1-result-wrap"><span class="result-value">12.${i}</span><div class="HL"></div></div></td>
          <td class="unit-cell">mg/dL</td>
          <td class="reference-cell">10 - 20</td>
        </tr>`).join("");
      f1Raw = await generateFormat1PagePdf({
        page,
        htmlContent: `<div class="container2"><div class="section"><table class="test-table"><thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Ref</th></tr></thead><tbody>${rows}</tbody></table></div></div>`,
        header: `<div class="report-details"><div class="report-details-innerDiv2 rf1-header-card"><div class="format1left2"><div class="format1-infor-div"><div class="format1-tags">Patient:</div><div class="value">Test Patient</div></div></div></div></div>`,
        footer: `<div class="signed-off-div"><div class="signed-off-div2"><div class="left-sign"><div class="textspan">Dr. Test</div></div></div></div>`,
        omitBackground: true,
      });
    } finally {
      await browser.close();
    }

    const f1WithPdfBg = await addBackgroundToPdf(f1Raw, `/uploads/reports/${relUploadName}`);
    assert.ok(f1WithPdfBg && f1WithPdfBg.length > 0);
    assert.equal(Buffer.from(f1WithPdfBg.slice(0, 5)).toString("latin1"), "%PDF-");
    const f1Rendered = await renderPdfPage1InBrowser(f1WithPdfBg);
    assert.ok(f1Rendered.numPages >= 2, `Expected multi-page report, got ${f1Rendered.numPages}`);
    for (const pgMeta of f1Rendered.pagesMeta) {
      // Top teal header band rgb(15, 117, 110) must appear on EVERY page!
      assert.ok(pgMeta.topHeaderPx[1] > 90 && pgMeta.topHeaderPx[0] < 40, `Missing teal header band: ${pgMeta.topHeaderPx}`);
      // Bottom yellow footer accent must appear on EVERY page!
      assert.ok(pgMeta.bottomFooterPx[0] > 200 && pgMeta.bottomFooterPx[2] < 90, `Missing yellow footer band: ${pgMeta.bottomFooterPx}`);
    }

    // 2. Format 5 with data:application/pdf URL
    const dataUrl = `data:application/pdf;base64,${lhBytes.toString("base64")}`;
    const f5Pdf = await generateFormat5PdfBuffer(
      {
        htmlContent: `<div class="section oh5-category-section"><div class="headings"><h3>HAEMATOLOGY</h3></div><table class="test-table"><tbody><tr class="oh5-test-row"><td>Haemoglobin</td><td>14.2</td><td>g/dL</td><td>13 - 17</td></tr></tbody></table></div>`,
        header: `<div class="oh5-header-card"><span class="oh5-patient-name">Test Patient</span></div>`,
        footer: `<div class="oh5-footer-wrap"><div class="oh5-footer-top-row"><div class="signatures oh5-signatures"><div id="firstDoctorSign" class="oh5-sign-slot">Dr. Test</div></div></div></div>`,
        backgroundImageUrl: dataUrl,
      },
      {
        launchPdfBrowser: () => puppeteer.launch(getPuppeteerLaunchOptions()),
        addBackgroundToPdf,
      }
    );
    const f5Rendered = await renderPdfPage1InBrowser(f5Pdf);
    assert.equal(f5Rendered.numPages, 1);
    assert.ok(f5Rendered.pagesMeta[0].topHeaderPx[1] > 90 && f5Rendered.pagesMeta[0].topHeaderPx[0] < 40);
  } finally {
    await fsPromises.unlink(uploadFilePath).catch(() => {});
  }
});

await check("addBackgroundToPdf handles rotated PDF templates and blank pages without throwing", async () => {
  const rotLh = await createSampleLetterheadPdf({ rotation: 90, withCrop: true });
  const rpt = await PDFDocument.create();
  rpt.addPage([595.28, 841.89]); // intentionally blank page (no Contents stream)
  const rptBytes = await rpt.save();

  const composed = await addBackgroundToPdf(
    rptBytes,
    `data:application/pdf;base64,${rotLh.toString("base64")}`
  );
  assert.ok(composed && composed.length > 0);
  const loaded = await PDFDocument.load(composed);
  assert.equal(loaded.getPageCount(), 1);
  const rendered = await renderPdfPage1InBrowser(composed);
  assert.equal(rendered.numPages, 1);
  // Rotated 90deg teal header band should now sit at top of portrait A4 page
  assert.ok(rendered.pagesMeta[0].topHeaderPx[1] > 90 && rendered.pagesMeta[0].topHeaderPx[0] < 40);
});

await check("printsetting.html + printsetting.js support PDF upload, preview, and FormData persistence end-to-end", async () => {
  const lhBytes = await createSampleLetterheadPdf();
  const uploadedFields = [];

  const server = http.createServer(async (req, res) => {
    const reqPath = (req.url || "/").split("?")[0];
    if (reqPath === "/printsetting.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(path.join(repoRoot, "private/pages/pages/printsetting.html")));
      return;
    }
    if (reqPath === "/printsetting.js") {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(fs.readFileSync(path.join(repoRoot, "private/pages/pages/printsetting.js")));
      return;
    }
    if (reqPath.startsWith("/vendor/") || reqPath.startsWith("/js/")) {
      const filePath = path.join(repoRoot, "public", reqPath.slice(1));
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const ct =
        ext === ".css" ? "text/css" :
        ext === ".mjs" || ext === ".js" ? "application/javascript" :
        ext === ".woff2" ? "font/woff2" :
        ext === ".ttf" ? "font/ttf" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": ct });
      res.end(fs.readFileSync(filePath));
      return;
    }
    if (reqPath === "/api/v1/user/getting-pdf-data") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ headermargin: "2.5", footermargin: "1.8" }));
      return;
    }
    if (reqPath === "/api/v1/user/getDoctorsSign") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ showlabinchargesign: true, showfirstdoctorsign: true, showseconddoctorsign: true }));
      return;
    }
    if (reqPath === "/api/v1/user/templates") {
      res.writeHead(200, { "Content-Type": "application/json" });
      const urls = uploadedFields.length
        ? [{ _id: "tpl1", template: "/uploads/reports/mock-letterhead.pdf", public_id: "reports/mock-letterhead.pdf" }]
        : [];
      res.end(JSON.stringify({ urls }));
      return;
    }
    if (reqPath === "/uploads/reports/mock-letterhead.pdf") {
      res.writeHead(200, { "Content-Type": "application/pdf" });
      res.end(lhBytes);
      return;
    }
    if (reqPath === "/api/v1/user/template") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const bodyStr = Buffer.concat(chunks).toString("latin1");
      uploadedFields.push({ size: bodyStr.length, hasPdfMagic: bodyStr.includes("%PDF-") });
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        message: "File uploaded successfully",
        url: "/uploads/reports/mock-letterhead.pdf",
        public_id: "reports/mock-letterhead.pdf",
        templateId: "tpl1",
        fileType: "pdf",
      }));
      return;
    }
    if (reqPath === "/api/v1/user/uploadDoctorsSign") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (reqPath === "/api/v1/user/get-pdf") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      uploadedFields.push({ getPdfBg: parsed.backgroundImageUrl });
      res.writeHead(200, { "Content-Type": "application/pdf" });
      res.end(lhBytes);
      return;
    }
    res.writeHead(404);
    res.end("{}");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tmpPdfPath = path.join(repoRoot, "temp", `ui-upload-${Date.now()}.pdf`);
  fs.writeFileSync(tmpPdfPath, lhBytes);

  const browser = await puppeteer.launch(getPuppeteerLaunchOptions());
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(`${baseUrl}/printsetting.html`, { waitUntil: "networkidle0" });

    const acceptAttr = await page.$eval("#fileInput", (el) => el.getAttribute("accept"));
    assert.match(acceptAttr, /application\/pdf/i);
    assert.match(acceptAttr, /\.pdf/i);

    const fileInput = await page.$("#fileInput");
    await fileInput.uploadFile(tmpPdfPath);

    // Wait for PDF.js async preview to render into #letterheadThumbImg & #letterheadBgOverlay
    await page.waitForFunction(() => {
      const overlay = document.getElementById("letterheadBgOverlay");
      const thumbImg = document.getElementById("letterheadThumbImg");
      return (
        overlay &&
        overlay.classList.contains("is-active") &&
        overlay.style.backgroundImage.includes("data:image/png;base64") &&
        thumbImg &&
        thumbImg.src.includes("data:image/png;base64")
      );
    }, { timeout: 10000 });

    const badgeDisplay = await page.$eval("#letterheadThumbPdfBadge", (el) => getComputedStyle(el).display);
    assert.notEqual(badgeDisplay, "none");

    // Click Save Settings and confirm PDF is uploaded and persisted
    await page.click("#btnSaveAllSettings");
    await page.waitForFunction(() => {
      const status = document.getElementById("saveStatusIndicator")?.textContent || "";
      return status.includes("All changes saved");
    }, { timeout: 10000 });

    // Confirm gallery shows PDF badge & rendered thumbnail
    await page.waitForSelector("#images-div .ps-template-type-badge", { timeout: 5000 });
    const galleryBadge = await page.$eval("#images-div .ps-template-type-badge", (el) => el.textContent.trim());
    assert.equal(galleryBadge, "PDF");

    // Verify invalid/spoofed .pdf triggers error toast cleanly without crashing
    const badPdfPath = path.join(repoRoot, "temp", `ui-bad-${Date.now()}.pdf`);
    fs.writeFileSync(badPdfPath, "Not a real PDF file");
    try {
      await fileInput.uploadFile(badPdfPath);
      await page.waitForFunction(() => {
        const toast = document.getElementById("psToast");
        return toast && toast.classList.contains("error") && toast.classList.contains("is-show");
      }, { timeout: 5000 });
    } finally {
      await fsPromises.unlink(badPdfPath).catch(() => {});
    }

    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join("; ")}`);
    assert.ok(uploadedFields.some((f) => f.hasPdfMagic), "Expected uploaded FormData to contain PDF bytes");
    assert.ok(
      uploadedFields.some((f) => f.getPdfBg === "/uploads/reports/mock-letterhead.pdf"),
      "Expected get-pdf to receive saved PDF template URL"
    );
  } finally {
    await browser.close();
    server.close();
    await fsPromises.unlink(tmpPdfPath).catch(() => {});
  }
});

console.log(results.join("\n"));
if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
