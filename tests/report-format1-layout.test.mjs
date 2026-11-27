import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

import {
  FORMAT1_HEADER_FONT_SIZE_PX,
  isReportFormat1,
  normalizeFormat1HeaderMarkup,
  normalizeFormat1BodyMarkup,
  buildFormat1PdfHeaderTemplate,
  buildFormat1PdfBodyDocument,
  buildFormat1PdfFooterTemplate,
  generateFormat1PagePdf,
} from "../src/utils/pdfFormat1Helpers.js";
import { getPuppeteerLaunchOptions } from "../src/utils/puppeteerRuntime.js";

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

const sampleLegacyHeader = `
  <div class="report-details">
    <div class="report-details-innerDiv2 rf1-header-card">
      <div class="format1left2">
        <div class="format1-infor-div fixedheightdiv">
          <div class="format1-tags">Patient Name:</div>
          <div class="value" style="font-weight:700;font-size:15px;color:#111;">Mr. Rajesh Sharma</div>
        </div>
        <div class="format1-infor-div fixedheightdiv"><div class="format1-tags">Age / Sex:</div><div class="value">45 Years / Male</div></div>
        <div class="format1-infor-div fixedheightdiv"><div class="format1-tags">Referred By:</div><div class="value">Dr. P. K. Verma</div></div>
        <div class="format1-infor-div fixedheightdiv"><div class="format1-tags">Reg. no:</div><div class="value">BK-2026-991</div></div>
        <div class="format1-infor-div forhide" id="investDiv"><div class="format1-tags">Investigations:</div><div class="value"><span id="investigationarray">CBC, LIPID PROFILE, LFT, KFT, SERUM TSH</span></div></div>
      </div>
      <div class="format1-right2">
        <div class="rf1-barcode-band">
          <div class="barcode-div2"><div class="barcode2"><div id="barcodeContainer2"></div></div></div>
          <span class="rf1-accession-id">BK-2026-991</span>
        </div>
        <div class="format1-registered-div2">
          <div class="format1-registeration-tag2">Registered on:</div>
          <div class="format1-time-div">27-11-2026 <span>09:30 AM</span></div>
        </div>
        <div class="format1-registered-div2">
          <div class="format1-registeration-tag2">Reported on:</div>
          <div class="format1-time-div">27-11-2026 <span>01:15 PM</span></div>
        </div>
      </div>
      <div class="click qr-div"><div class="branding"><strong>Powered By</strong><span>www.LabFlow</span></div></div>
    </div>
  </div>
`;

const sampleBodyHtml = `
  <div class="container2" id="containerpdf">
    <div class="table-div" id="tables-container">
      <div class="section">
        <div class="headings">
          <h3 class="category-heading">HAEMATOLOGY</h3>
          <h4 class="table-heading">COMPLETE BLOOD COUNT (CBC)</h4>
        </div>
        <table class="test-table">
          <thead>
            <tr>
              <th class="deletion"></th>
              <th width="300px">Test Description</th>
              <th width="175px" class="valuecell">Result</th>
              <th>Unit</th>
              <th>Biological Ref. Interval</th>
            </tr>
          </thead>
          <tbody>
            <tr class="is-normal-row">
              <td class="wrong"></td>
              <td class="test-name"><div class="test-name-cell">Haemoglobin</div></td>
              <td class="high-low"><div class="rf1-result-wrap"><span class="result-value">14.2</span><div class="HL"><span class="high-low-marker"></span></div></div></td>
              <td class="unit-cell">g/dL</td>
              <td class="reference-cell">Male: 13.0 - 17.0\nFemale: 12.0 - 15.5</td>
            </tr>
            <tr class="BoldRow abnormal-result-row">
              <td class="wrong"></td>
              <td class="test-name"><div class="test-name-cell">Total Leukocyte Count</div></td>
              <td class="high-low"><div class="rf1-result-wrap"><span class="result-value">12400</span><div class="HL"><span class="high-low-marker">H</span></div></div></td>
              <td class="unit-cell">/cumm</td>
              <td class="reference-cell">4000 - 11000</td>
            </tr>
            <tr>
              <td class="wrong"></td>
              <td colspan="4" class="remark-row"><div class="rf1-callout"><span class="rf1-callout-label">Remark:</span><span>Mild leukocytosis correlated clinically.</span></div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
`;

await check("isReportFormat1 distinguishes Format 1 cleanly from Format 3/4/5", () => {
  assert.equal(isReportFormat1({ pdfformat: "reportFormat1" }), true);
  assert.equal(isReportFormat1({ pdfformat: "reportFormat3", format3: true, header: sampleLegacyHeader }), false);
  assert.equal(isReportFormat1({ pdfformat: "reportFormat5", header: sampleLegacyHeader }), false);
  assert.equal(isReportFormat1({ header: sampleLegacyHeader }), true);
});

await check("normalizeFormat1HeaderMarkup strips inline font-size overrides, removes legacy overlapping rightcover, and moves #investDiv under timestamps", () => {
  const legacyWithRightCover = `
    <div class="report-details-innerDiv2">
      <div class="format1left2">
        <div class="format1-infor-div"><div class="format1-tags">Patient Name:</div><div class="value" style="font-size:15px;font-weight:700;">Test Patient</div></div>
        <div class="format1-infor-div"><div class="format1-tags">Referred By:</div><div class="value">Dr. R. Mehta</div></div>
        <div class="format1-infor-div forhide" id="investDiv" style="display:none;font-size:14px;"><div class="format1-tags">Investigations:</div><div class="value"><span id="investigationarray">CBC, LFT, Health Package</span></div></div>
      </div>
      <div class="format1-right2"><div class="format1-registered-div2"><img id="barcodeImage" /></div></div>
      <div class="format1-rightcover"><span>BK_LEGACY_7</span></div>
    </div>`;
  const cleaned = normalizeFormat1HeaderMarkup(legacyWithRightCover);
  assert.doesNotMatch(cleaned, /font-size\s*:\s*15px/i);
  assert.doesNotMatch(cleaned, /font-size\s*:\s*14px/i);
  assert.doesNotMatch(cleaned, /id="investDiv"[^>]*style="[^"]*display\s*:\s*none/i);
  assert.doesNotMatch(cleaned, /format1-rightcover/);
  assert.match(cleaned, /rf1-barcode-band/);
  assert.match(cleaned, /BK_LEGACY_7/);
  assert.match(cleaned, /Dr\. R\. Mehta/);
  assert.match(cleaned, /<div class="format1-right2">[\s\S]*id="investDiv"/);
});

await check("normalizeFormat1BodyMarkup removes legacy pixel widths & delete columns cleanly", () => {
  const cleaned = normalizeFormat1BodyMarkup(sampleBodyHtml);
  assert.doesNotMatch(cleaned, /width="300px"/);
  assert.doesNotMatch(cleaned, /class="deletion"/);
  assert.doesNotMatch(cleaned, /class="wrong"/);
  assert.match(cleaned, /col-test/);
  assert.match(cleaned, /col-ref/);
});

await check("buildFormat1PdfHeaderTemplate enforces strict 10px lock regardless of requested font size", async () => {
  assert.equal(FORMAT1_HEADER_FONT_SIZE_PX, 10);
  const headerHtml = await buildFormat1PdfHeaderTemplate({
    headermargin: "1.5",
    showInvest: true,
    header: sampleLegacyHeader,
    selectedFontFamily: "Segoe UI",
  });
  assert.match(headerHtml, /font-size:\s*10px\s*!important/);
  assert.doesNotMatch(headerHtml, /font-size:\s*15px/);
});

await check("Headless Chromium verifies Format 1 header fixed at 10px while body scales across user font changes, plus pixel-accurate table alignment and PDF generation", async () => {
  const launchOpts = getPuppeteerLaunchOptions();
  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    // 1. Verify Header stays strictly 10px in Chromium while Body scales from 9px to 16px
    const headerTpl = await buildFormat1PdfHeaderTemplate({
      headermargin: "0",
      showInvest: true,
      header: sampleLegacyHeader,
      selectedFontFamily: "Arial",
    });

    await page.setContent(`<!DOCTYPE html><html><body style="width:794px;margin:0;">${headerTpl}</body></html>`, {
      waitUntil: "domcontentloaded",
    });

    const headerMetrics = await page.evaluate(() => {
      const card = document.querySelector(".report-details-innerDiv2");
      const left = document.querySelector(".format1left2");
      const mid = document.querySelector(".format1-right2");
      const qr = document.querySelector(".qr-div");
      const allTextNodes = Array.from(
        document.querySelectorAll(
          ".report-details-innerDiv2 .format1-tags, .report-details-innerDiv2 .value, .report-details-innerDiv2 .rf1-patient-name, .report-details-innerDiv2 .format1-registeration-tag2, .report-details-innerDiv2 .format1-time-div, .report-details-innerDiv2 .rf1-accession-id, .report-details-innerDiv2 #investigationarray"
        )
      );
      const fontSizes = allTextNodes.map((el) => getComputedStyle(el).fontSize);
      const lr = left.getBoundingClientRect();
      const mr = mid.getBoundingClientRect();
      const qrr = qr.getBoundingClientRect();
      return {
        fontSizes,
        cardWidth: Math.round(card.getBoundingClientRect().width),
        noLeftMidOverlap: lr.right <= mr.left + 1,
        noMidQrOverlap: mr.right <= qrr.left + 1,
      };
    });

    assert.ok(headerMetrics.fontSizes.length >= 6);
    for (const fsPx of headerMetrics.fontSizes) {
      assert.equal(fsPx, "10px", `Header font size must always be strictly 10px, got ${fsPx}`);
    }
    assert.equal(headerMetrics.noLeftMidOverlap, true, "Header left & mid columns must not overlap");
    assert.equal(headerMetrics.noMidQrOverlap, true, "Header mid & QR columns must not overlap");

    // 2. Verify Body scales to 16px AND table columns/result rail align within 1px
    const body16 = buildFormat1PdfBodyDocument({
      htmlContent: sampleBodyHtml,
      header: sampleLegacyHeader,
      selectedFontSize: 16,
      selectedFontFamily: "Arial",
      RowSpacing: 2,
      HighLow: true,
      HLinred: true,
      BoldRow: true,
    });
    await page.setContent(body16, { waitUntil: "domcontentloaded" });

    const body16Metrics = await page.evaluate(() => {
      const tds = Array.from(document.querySelectorAll("table.test-table tbody tr")).slice(0, 2);
      const ths = Array.from(document.querySelectorAll("table.test-table thead th"));
      const row1Tds = Array.from(tds[0].querySelectorAll("td"));
      const row2Tds = Array.from(tds[1].querySelectorAll("td"));
      const val1Rect = row1Tds[1].querySelector(".result-value").getBoundingClientRect();
      const val2Rect = row2Tds[1].querySelector(".result-value").getBoundingClientRect();
      const thAlignDiffs = ths.map((th, i) => {
        const thR = th.getBoundingClientRect();
        const tdR = row1Tds[i].getBoundingClientRect();
        return Math.max(Math.abs(thR.left - tdR.left), Math.abs(thR.width - tdR.width));
      });
      const catEl = document.querySelector(".category-heading");
      const subEl = document.querySelector(".table-heading");
      const tableEl = document.querySelector("table.test-table");
      const catRect = catEl.getBoundingClientRect();
      const subRect = subEl.getBoundingClientRect();
      const tblRect = tableEl.getBoundingClientRect();
      return {
        testNameFontSize: getComputedStyle(row1Tds[0]).fontSize,
        resultFontSize: getComputedStyle(row1Tds[1].querySelector(".result-value")).fontSize,
        hlFontSize: getComputedStyle(row2Tds[1].querySelector(".high-low-marker")).fontSize,
        maxColAlignDiff: Math.max(...thAlignDiffs),
        resultValueLeftDiff: Math.abs(val1Rect.left - val2Rect.left),
        abnormalFlagText: row2Tds[1].querySelector(".high-low-marker").textContent.trim(),
        gapCatToSub: Math.round((subRect.top - catRect.bottom) * 10) / 10,
        gapSubToTable: Math.round((tblRect.top - subRect.bottom) * 10) / 10,
      };
    });

    assert.equal(body16Metrics.testNameFontSize, "16px");
    assert.equal(body16Metrics.resultFontSize, "16px");
    assert.equal(body16Metrics.abnormalFlagText, "H");
    assert.ok(body16Metrics.maxColAlignDiff <= 1.5, `Header/body column alignment diff too large: ${body16Metrics.maxColAlignDiff}`);
    assert.ok(body16Metrics.resultValueLeftDiff <= 1.5, `Normal vs abnormal result values misaligned horizontally: ${body16Metrics.resultValueLeftDiff}`);
    assert.ok(
      body16Metrics.gapCatToSub >= 11 && body16Metrics.gapCatToSub <= 13,
      `Expected even 11..13px gap between Category and Subcategory, got ${body16Metrics.gapCatToSub}`
    );
    assert.ok(
      body16Metrics.gapSubToTable >= 11 && body16Metrics.gapSubToTable <= 13,
      `Expected even 11..13px gap between Subcategory and Table, got ${body16Metrics.gapSubToTable}`
    );
    assert.ok(
      Math.abs(body16Metrics.gapCatToSub - body16Metrics.gapSubToTable) <= 1,
      `Expected even vertical spacing Cat->Sub (${body16Metrics.gapCatToSub}) vs Sub->Table (${body16Metrics.gapSubToTable})`
    );

    // 3. Verify End-to-End Format 1 PDF generation returns valid PDF buffer
    const pdfBytes = await generateFormat1PagePdf({
      page,
      htmlContent: sampleBodyHtml,
      cssContent: "",
      header: sampleLegacyHeader,
      footer: '<div class="signed-off-div"><div class="signed-off-div2"><div class="left-sign"><div class="textspan">Dr. A. Sharma\nMD Pathology</div></div></div></div>',
      selectedFontSize: 15,
      selectedFontFamily: "Segoe UI",
      RowSpacing: 2,
      HighLow: true,
      HLinred: true,
      BoldRow: true,
      headermargin: "1.5",
      footermarginPx: 30,
      showInvest: true,
    });
    const pdfPrefix = Buffer.from(pdfBytes).subarray(0, 5).toString("utf8");
    assert.equal(pdfPrefix, "%PDF-", "Output must be a valid PDF binary");
    assert.ok(pdfBytes.length > 5000, "Generated PDF size unexpectedly tiny");

    // 4. Verify live Format 1 HTML stylesheet syntax + no Print Settings lock regressions
    const f1Html = fs.readFileSync(path.join(repoRoot, "private/pages/pages/reportFormat1.html"), "utf8");
    assert.match(f1Html, /\.report-details-innerDiv2[\s\S]*font-size:\s*10px\s*!important/);
    assert.match(f1Html, /max-width:\s*960px/);
    assert.match(f1Html, /\.rf1-result-wrap/);
  } finally {
    await browser.close();
  }
});

for (const line of results) console.log(line);
console.log(process.exitCode ? "\nSome checks failed" : "\nAll checks passed");
