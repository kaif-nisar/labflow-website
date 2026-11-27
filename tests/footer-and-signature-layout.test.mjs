import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

import {
  FOOTER_BOX_BOUNDS,
  DEFAULT_FOOTER_BOX,
  normalizeFooterBox,
  normalizeSignatureLayout,
  fitSlotsToStageHeight,
  computeSignatureStageHeightPx,
  computeSignatureSlotStyleMetrics,
  buildCustomSignatureStageCss,
  hasCustomFooterOrSignatureLayout,
} from "../public/js/signatureLayoutEngine.mjs";
import {
  applySignatureLayoutToFooterHtml,
  resolveEffectiveSignatureLayout,
} from "../src/utils/pdfSignatureLayout.js";
import {
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

await check("normalizeFooterBox & normalizeSignatureLayout clamp bounds and preserve legacy backwards compatibility", () => {
  const def = normalizeSignatureLayout(null);
  assert.equal(def.isCustom, false);
  assert.deepEqual(def.footer, DEFAULT_FOOTER_BOX);
  assert.equal(computeSignatureStageHeightPx(def), 100);
  assert.equal(hasCustomFooterOrSignatureLayout(def), false);

  // Legacy layout without `footer` field should normalize cleanly
  const legacy = normalizeSignatureLayout({
    isCustom: true,
    slots: {
      lab: { xPct: 2, yPx: 8, widthPct: 24, heightPx: 70 },
    },
  });
  assert.equal(legacy.isCustom, true);
  assert.equal(legacy.footer.isCustom, false);
  assert.equal(legacy.footer.widthPct, 100);
  assert.equal(computeSignatureStageHeightPx(legacy), 100);

  // Out-of-range footer dims clamp cleanly
  const clamped = normalizeFooterBox({
    isCustom: true,
    widthPct: 20,
    xPct: 90,
    heightPx: 12,
  });
  assert.equal(clamped.isCustom, true);
  assert.equal(clamped.widthPct, FOOTER_BOX_BOUNDS.minWidthPct);
  assert.equal(clamped.xPct, 100 - FOOTER_BOX_BOUNDS.minWidthPct);
  assert.equal(clamped.heightPx, FOOTER_BOX_BOUNDS.minHeightPx);
});

await check("fitSlotsToStageHeight compacts tall slots cleanly without clipping and honors custom footer height", () => {
  const layout = normalizeSignatureLayout({
    isCustom: true,
    footer: { isCustom: true, xPct: 12.5, widthPct: 75, heightPx: 64 },
    slots: {
      lab: { xPct: 0, yPx: 10, widthPct: 28, heightPx: 84 },
      doc1: { xPct: 36, yPx: 10, widthPct: 28, heightPx: 84 },
      doc2: { xPct: 72, yPx: 10, widthPct: 28, heightPx: 84 },
    },
  });
  const stageH = computeSignatureStageHeightPx(layout);
  assert.equal(stageH, 64);

  const fitted = fitSlotsToStageHeight(layout.slots, stageH, { lab: true, doc1: true, doc2: true });
  for (const key of ["lab", "doc1", "doc2"]) {
    assert.ok(fitted[key].yPx + fitted[key].heightPx <= 60, `${key} exceeded compact 60px inner stage`);
    const metrics = computeSignatureSlotStyleMetrics(fitted[key], 10.5, { footerWidthPct: 75 });
    assert.ok(metrics.imgMaxHeightPx >= 14);
    assert.ok(metrics.textFontPx >= 6.8);
  }
});

await check("buildCustomSignatureStageCss & applySignatureLayoutToFooterHtml work for footer-only resize (flex mode) and Format 5", () => {
  const footerOnlyLayout = {
    version: 1,
    isCustom: false,
    footer: { isCustom: true, xPct: 15, widthPct: 70, heightPx: 68 },
  };
  assert.equal(hasCustomFooterOrSignatureLayout(footerOnlyLayout), true);

  const css = buildCustomSignatureStageCss({
    containerSelector: ".pdf-footer-div .signed-off-div2",
    slotSelector: ".left-sign",
    layout: footerOnlyLayout,
  });
  assert.match(css, /width:\s*70%\s*!important/);
  assert.match(css, /margin-left:\s*15%\s*!important/);
  assert.match(css, /height:\s*68px\s*!important/);
  assert.match(css, /display:\s*flex\s*!important/);

  const legacyFooterHtml = `
    <div class="signed-off-div">
      <div class="signed-off-div2">
        <div class="left-sign"><div style="height:35px;width:95px;"></div><div class="textspan">Dr. A. Sharma</div></div>
        <div class="left-sign"><div style="height:35px;width:95px;"></div><div class="textspan">Lab Tech</div></div>
        <div class="left-sign"><div style="height:35px;width:95px;"></div><div class="textspan">Dr. R. Mehta</div></div>
      </div>
    </div>`;
  const bridgeRes = applySignatureLayoutToFooterHtml({
    rawFooterHtml: legacyFooterHtml,
    signatureLayout: footerOnlyLayout,
    isFormat5: false,
    showLab: true,
    showDoc1: true,
    showDoc2: true,
  });
  assert.equal(bridgeRes.isCustom, true);
  assert.equal(bridgeRes.hasCustomFooter, true);
  assert.equal(bridgeRes.hasCustomSlots, false);
  assert.equal(bridgeRes.stageHeightPx, 68);
  assert.match(bridgeRes.layoutCss, /\.pdf-footer-div \.signed-off-div2[\s\S]*width:\s*70%/);

  const f5FooterHtml = `
    <div class="oh5-footer-wrap">
      <div class="oh5-footer-top-row">
        <div class="oh5-qr-block"><img id="qrimg" src="data:image/png;base64,iVBORw0KGgo=" /></div>
        <div class="signatures oh5-signatures">
          <div class="oh5-sign-slot oh5-sign-lab" id="labInchargeSign" data-sig-slot="lab"><div class="oh5-sign-cred">Lab Tech</div></div>
          <div class="oh5-sign-slot oh5-sign-doc1" id="firstDoctorSign" data-sig-slot="doc1"><div class="oh5-sign-cred">Dr. A. Sharma</div></div>
          <div class="oh5-sign-slot oh5-sign-doc2" id="secondDoctorSign" data-sig-slot="doc2"><div class="oh5-sign-cred">Dr. R. Mehta</div></div>
        </div>
      </div>
    </div>`;
  const f5Bridge = applySignatureLayoutToFooterHtml({
    rawFooterHtml: f5FooterHtml,
    signatureLayout: { ...footerOnlyLayout, footer: { isCustom: true, xPct: 10, widthPct: 80, heightPx: 62 } },
    isFormat5: true,
    showLab: true,
    showDoc1: true,
    showDoc2: true,
  });
  assert.match(f5Bridge.layoutCss, /\.oh5-footer-wrap[\s\S]*width:\s*80%/);
  assert.match(f5Bridge.layoutCss, /\.oh5-footer-wrap[\s\S]*margin-left:\s*10%/);
  assert.match(f5Bridge.layoutCss, /width:\s*34px\s*!important/);

  const resolved = resolveEffectiveSignatureLayout({
    reqBody: { signatureLayout: footerOnlyLayout },
  });
  assert.equal(resolved.footer.isCustom, true);
  assert.equal(resolved.footer.widthPct, 70);
  assert.equal(resolved.footer.heightPx, 68);
});

// Run Print Settings UI & Format 1 PDF verification with proper HTTP interception on http://localhost
await check("Headless Chromium verifies Print Settings footer resize handles, presets, alignment, and Format 1 PDF compact dimensions", async () => {
  const launchOpts = getPuppeteerLaunchOptions();
  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 950, deviceScaleFactor: 1 });

    const psHtml = fs.readFileSync(path.join(repoRoot, "private/pages/pages/printsetting.html"), "utf8");
    const psJs = fs.readFileSync(path.join(repoRoot, "private/pages/pages/printsetting.js"), "utf8");
    const sigEngineSrc = fs.readFileSync(path.join(repoRoot, "public/js/signatureLayoutEngine.mjs"), "utf8");

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.endsWith("/printsetting.html")) {
        return req.respond({ status: 200, contentType: "text/html", body: psHtml });
      }
      if (url.endsWith("/printsetting.js")) {
        return req.respond({ status: 200, contentType: "application/javascript", body: psJs });
      }
      if (url.includes("/js/signatureLayoutEngine.mjs")) {
        return req.respond({ status: 200, contentType: "application/javascript", body: sigEngineSrc });
      }
      if (url.includes("/api/v1/user/getting-pdf-data")) {
        return req.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ headermargin: "2.5", footermargin: "1.8", marginLeft: "1.0", marginRight: "1.0" }),
        });
      }
      if (url.includes("/api/v1/user/getDoctorsSign")) {
        return req.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            showlabinchargesign: true,
            showfirstdoctorsign: true,
            showseconddoctorsign: true,
            labinchargeinfo: "Lab Tech\nDMLT",
            firstdoctorsigninfo: "Dr. A. Sharma\nMD Pathology",
            seconddoctorsigninfo: "Dr. R. Mehta\nConsultant",
          }),
        });
      }
      if (url.includes("/api/v1/user/templates")) {
        return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ urls: [] }) });
      }
      return req.respond({ status: 200, contentType: "text/css", body: "" });
    });

    await page.goto("http://localhost:3999/private/pages/pages/printsetting.html", { waitUntil: "networkidle0" });

    // 1. Default footer height should be compact (~100px), no longer bloated 175px!
    const initialMetrics = await page.evaluate(() => {
      const grid = document.getElementById("docSignaturesGrid");
      const hInput = document.getElementById("footer-box-h");
      const wInput = document.getElementById("footer-box-w");
      return {
        gridHeight: Math.round(parseFloat(grid.style.height)),
        gridWidthPct: grid.style.width,
        hInputVal: hInput?.value,
        wInputVal: wInput?.value,
      };
    });
    assert.ok(initialMetrics.gridHeight <= 105, `Expected compact default footer <= 105px, got ${initialMetrics.gridHeight}`);
    assert.equal(initialMetrics.gridWidthPct, "100%");

    // 2. Apply Mini preset (64px height) and verify slots fit inside without overflowing
    await page.evaluate(() => window.applyFooterPreset(64, 100, 0));
    const miniMetrics = await page.evaluate(() => {
      const grid = document.getElementById("docSignaturesGrid");
      const gridRect = grid.getBoundingClientRect();
      const slots = Array.from(document.querySelectorAll(".ps-doc-sig-block")).map((el) => {
        const r = el.getBoundingClientRect();
        return { bottomDiff: Math.round(r.bottom - gridRect.bottom), height: Math.round(r.height) };
      });
      return {
        gridHeight: Math.round(parseFloat(grid.style.height)),
        hInputVal: document.getElementById("footer-box-h")?.value,
        slots,
      };
    });
    assert.equal(miniMetrics.gridHeight, 64);
    assert.equal(miniMetrics.hInputVal, "64");
    for (const s of miniMetrics.slots) {
      assert.ok(s.bottomDiff <= 1, `Slot overflowed compact 64px footer by ${s.bottomDiff}px`);
    }

    // 3. Adjust width slider/input to 70% and click Center align
    await page.evaluate(() => {
      const wEl = document.getElementById("footer-box-w");
      wEl.value = "70";
      wEl.dispatchEvent(new Event("input", { bubbles: true }));
      window.setFooterAlign("center");
    });
    const centeredMetrics = await page.evaluate(() => {
      const grid = document.getElementById("docSignaturesGrid");
      return {
        width: grid.style.width,
        marginLeft: grid.style.marginLeft,
        xInput: document.getElementById("footer-box-x")?.value,
        pillText: document.getElementById("footerBoxPill")?.textContent,
      };
    });
    assert.equal(centeredMetrics.width, "70%");
    assert.equal(centeredMetrics.marginLeft, "15%");
    assert.equal(centeredMetrics.xInput, "15");
    assert.match(centeredMetrics.pillText, /70% × 64px/);

    // 4. Scroll footer stage into view and test pointer drag on bottom footer handle (`fh-s`) and right handle (`fh-e`)
    await page.evaluate(() => {
      document.getElementById("docSignaturesGrid")?.scrollIntoView({ block: "center", inline: "center" });
    });
    const handleBoxes = await page.evaluate(() => {
      const sEl = document.querySelector('.ps-footer-handle[data-footer-handle="s"]');
      const eEl = document.querySelector('.ps-footer-handle[data-footer-handle="e"]');
      const s = sEl.getBoundingClientRect();
      const e = eEl.getBoundingClientRect();
      return {
        s: { x: s.left + s.width / 2, y: s.top + s.height / 2 },
        e: { x: e.left + e.width / 2, y: e.top + e.height / 2 },
      };
    });
    await page.mouse.move(handleBoxes.s.x, handleBoxes.s.y);
    await page.mouse.down();
    await page.mouse.move(handleBoxes.s.x, handleBoxes.s.y + 30, { steps: 5 });
    await page.mouse.up();

    const afterHandleResize = await page.evaluate(() => ({
      gridHeight: Math.round(parseFloat(document.getElementById("docSignaturesGrid").style.height)),
      hInput: document.getElementById("footer-box-h")?.value,
    }));
    assert.ok(afterHandleResize.gridHeight > 64, `Expected footer handle drag to increase height from 64, got ${afterHandleResize.gridHeight}`);
    assert.equal(String(afterHandleResize.gridHeight), afterHandleResize.hInput);

    // Also test right handle (`fh-e`) drag to resize width (re-measure after height changed!)
    const eBox = await page.evaluate(() => {
      const e = document.querySelector('.ps-footer-handle[data-footer-handle="e"]').getBoundingClientRect();
      return { x: e.left + e.width / 2, y: e.top + e.height / 2 };
    });
    await page.mouse.move(eBox.x, eBox.y);
    await page.mouse.down();
    await page.mouse.move(eBox.x - 60, eBox.y, { steps: 5 });
    await page.mouse.up();

    const afterWidthHandleResize = await page.evaluate(() => ({
      widthPct: parseFloat(document.getElementById("docSignaturesGrid").style.width),
      wInput: parseFloat(document.getElementById("footer-box-w")?.value || "0"),
    }));
    assert.ok(afterWidthHandleResize.widthPct < 70, `Expected right footer handle drag left to shrink width below 70%, got ${afterWidthHandleResize.widthPct}%`);
    assert.equal(Math.round(afterWidthHandleResize.widthPct), Math.round(afterWidthHandleResize.wInput));

    // 5. Reset Footer restores 100% × 100px
    await page.evaluate(() => window.resetFooterLayout());
    const resetMetrics = await page.evaluate(() => ({
      width: document.getElementById("docSignaturesGrid").style.width,
      height: Math.round(parseFloat(document.getElementById("docSignaturesGrid").style.height)),
      x: document.getElementById("footer-box-x")?.value,
    }));
    assert.equal(resetMetrics.width, "100%");
    assert.equal(resetMetrics.height, 100);
    assert.equal(resetMetrics.x, "0");

    // 6. Verify Format 1 PDF Footer Template renders narrower & shorter cleanly in Chromium + generates valid PDF
    const pdfPage = await browser.newPage();
    await pdfPage.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    const sampleFooterMarkup = `
      <div class="signed-off-div">
        <div class="signed-off-div2">
          <div class="left-sign" data-sig-slot="doc1"><div class="rf-sig-img-wrap"><div class="rf-sig-spacer" style="height:35px;width:95px;"></div></div><div class="textspan">Dr. A. Sharma\nMD Pathology</div></div>
          <div class="left-sign" data-sig-slot="lab"><div class="rf-sig-img-wrap"><div class="rf-sig-spacer" style="height:35px;width:95px;"></div></div><div class="textspan">Lab Tech\nDMLT</div></div>
          <div class="left-sign" data-sig-slot="doc2"><div class="rf-sig-img-wrap"><div class="rf-sig-spacer" style="height:35px;width:95px;"></div></div><div class="textspan">Dr. R. Mehta\nConsultant</div></div>
        </div>
      </div>`;

    const compactFooterTpl = await buildFormat1PdfFooterTemplate({
      footer: sampleFooterMarkup,
      footermarginPx: 15,
      selectedFontSize: 12,
      signatureLayout: {
        version: 1,
        isCustom: false,
        footer: { isCustom: true, xPct: 15, widthPct: 70, heightPx: 62 },
      },
      showlab: true,
      showdoctorfirst: true,
      showdoctorsecond: true,
    });

    await pdfPage.setContent(`<!DOCTYPE html><html><body style="width:794px;margin:0;">${compactFooterTpl}</body></html>`, {
      waitUntil: "domcontentloaded",
    });
    const renderedFooterRect = await pdfPage.evaluate(() => {
      const outer = document.querySelector(".pdf-footer-div").getBoundingClientRect();
      const stage = document.querySelector(".signed-off-div2").getBoundingClientRect();
      return {
        outerWidth: Math.round(outer.width),
        stageWidth: Math.round(stage.width),
        stageHeight: Math.round(stage.height),
        stageLeftOffset: Math.round(stage.left - outer.left),
      };
    });
    assert.equal(renderedFooterRect.stageHeight, 62, `Expected rendered Format 1 footer stage height 62px, got ${renderedFooterRect.stageHeight}`);
    const expectedWidth = Math.round(renderedFooterRect.outerWidth * 0.7);
    assert.ok(
      Math.abs(renderedFooterRect.stageWidth - expectedWidth) <= 3,
      `Expected stage width ~${expectedWidth}px (70% of ${renderedFooterRect.outerWidth}), got ${renderedFooterRect.stageWidth}`
    );
    const expectedLeft = Math.round(renderedFooterRect.outerWidth * 0.15);
    assert.ok(
      Math.abs(renderedFooterRect.stageLeftOffset - expectedLeft) <= 3,
      `Expected centered left offset ~${expectedLeft}px, got ${renderedFooterRect.stageLeftOffset}`
    );

    const pdfBuf = await generateFormat1PagePdf({
      page: pdfPage,
      htmlContent: '<div class="container2"><div class="section"><table class="test-table"><tbody><tr><td class="test-name">Hb</td><td class="high-low">14.0</td><td class="unit-cell">g/dL</td><td class="reference-cell">13-17</td></tr></tbody></table></div></div>',
      header: '<div class="report-details"><div class="report-details-innerDiv2"><div class="format1left2"><div class="format1-infor-div"><div class="format1-tags">Patient Name:</div><div class="value">Rajesh</div></div></div><div class="format1-right2"><div class="format1-registered-div2"><div class="format1-registeration-tag2">Reg:</div><div class="format1-time-div">01-01-2026</div></div></div></div></div>',
      footer: sampleFooterMarkup,
      footermarginPx: 15,
      signatureLayout: {
        version: 1,
        isCustom: false,
        footer: { isCustom: true, xPct: 15, widthPct: 70, heightPx: 62 },
      },
      showlab: true,
      showdoctorfirst: true,
      showdoctorsecond: true,
    });
    assert.equal(Buffer.from(pdfBuf).subarray(0, 5).toString("utf8"), "%PDF-");
  } finally {
    await browser.close();
  }
});

for (const line of results) console.log(line);
console.log(process.exitCode ? "\nSome checks failed" : "\nAll checks passed");
