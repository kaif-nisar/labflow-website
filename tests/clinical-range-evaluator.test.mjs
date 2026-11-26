import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

import {
  evaluateClinicalReferenceFlag,
  parseNumericReferenceBound,
  parseObservedNumeric,
  parsePatientAgeDays,
} from "../public/js/clinicalRangeEvaluator.mjs";
import {
  buildFormat5BodyCss,
  prepareFormat5BodyHtml,
} from "../src/controllers/reportFormat5Pdf.controller.js";
import {
  buildLegacyAbnormalHighlightCss,
  normalizeLegacyPdfBodyHtml,
} from "../src/utils/pdfAbnormalHighlight.js";

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push(`PASS  ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name} -> ${error.message}`);
    process.exitCode = 1;
  }
};

// --- 1. Age & Numeric Parsing ------------------------------------------------
check("parsePatientAgeDays handles years, months, weeks, days", () => {
  assert.equal(Math.round(parsePatientAgeDays("30")), Math.round(30 * 365.25));
  assert.equal(Math.round(parsePatientAgeDays("6 Months")), Math.round(6 * 30.4375));
  assert.equal(parsePatientAgeDays("14 Days"), 14);
  assert.equal(parsePatientAgeDays("2 Weeks"), 14);
  assert.equal(parsePatientAgeDays(""), null);
});

check("parseObservedNumeric parses commas, percentages, comparators, rejects ratios", () => {
  assert.deepEqual(parseObservedNumeric("11,800"), { comparator: "", num: 11800 });
  assert.deepEqual(parseObservedNumeric("45%"), { comparator: "", num: 45 });
  assert.deepEqual(parseObservedNumeric("< 0.05"), { comparator: "<", num: 0.05 });
  assert.deepEqual(parseObservedNumeric(">= 240"), { comparator: ">=", num: 240 });
  assert.equal(parseObservedNumeric("1:160"), null);
  assert.equal(parseObservedNumeric("120/80"), null);
  assert.deepEqual(parseObservedNumeric("8.2 mg/dL"), { comparator: "", num: 8.2 });
});

check("parseNumericReferenceBound strips age parens before extracting range", () => {
  assert.deepEqual(
    parseNumericReferenceBound("Male (18 - 60 yrs): 13.0 - 17.0"),
    { type: "range", low: 13, high: 17 }
  );
  assert.deepEqual(
    parseNumericReferenceBound("Adult (18 - 60 yrs) 70 - 110 mg/dL"),
    { type: "range", low: 70, high: 110 }
  );
  assert.deepEqual(
    parseNumericReferenceBound("Up to 40 U/L"),
    { type: "upper", limit: 40, strict: false }
  );
  assert.deepEqual(
    parseNumericReferenceBound("< 200 mg/dL"),
    { type: "upper", limit: 200, strict: true }
  );
  assert.deepEqual(
    parseNumericReferenceBound(">= 60 mg/dL"),
    { type: "lower", limit: 60, strict: false }
  );
});

// --- 2. Normal Results MUST Stay Unhighlighted (isAbnormal: false) ----------
check("Normal numeric values strictly inside interval are NOT flagged", () => {
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "14.5", reference: "13.0 - 17.0" }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "11,000", reference: "4,000 - 11,000" }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "13.0", reference: "13.0 - 17.0" }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "40", reference: "Up to 40" }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "60", reference: ">= 60" }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
});

// --- 3. Out-of-Range Numeric Values (L / H) ----------------------------------
check("Below-range numeric values get L flag", () => {
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "10.8", reference: "13.0 - 17.0" }),
    { isAbnormal: true, flag: "L", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "35", reference: ">= 60" }),
    { isAbnormal: true, flag: "L", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "< 0.01", reference: "0.35 - 4.94" }),
    { isAbnormal: true, flag: "L", isNumeric: true }
  );
});

check("Above-range numeric values get H flag", () => {
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "18,400", reference: "4,000 - 11,000" }),
    { isAbnormal: true, flag: "H", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "48", reference: "Up to 40" }),
    { isAbnormal: true, flag: "H", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "200", reference: "< 200" }),
    { isAbnormal: true, flag: "H", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "> 250", reference: "< 200" }),
    { isAbnormal: true, flag: "H", isNumeric: true }
  );
});

// --- 4. Demographic & Stratified Clinical Risk Tiers -------------------------
check("Gender & Age demographic lines select exact patient interval", () => {
  const hbRef = "Male: 13.5 - 17.5\nFemale: 12.0 - 15.5";
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "12.5", reference: hbRef, gender: "Female" }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "12.5", reference: hbRef, gender: "Male" }),
    { isAbnormal: true, flag: "L", isNumeric: true }
  );

  const alpRef = "Adults (> 18 yrs): 30 - 120\nChildren (1 - 14 yrs): 100 - 390";
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "250", reference: alpRef, age: "8" }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "250", reference: alpRef, age: "35" }),
    { isAbnormal: true, flag: "H", isNumeric: true }
  );
});

check("Stratified clinical decision tiers pick normal/desirable/sufficiency tier", () => {
  const vitDRef = "Deficiency: < 20\nInsufficiency: 20 - 29\nSufficiency: 30 - 100\nToxicity: > 100";
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "42.5", reference: vitDRef }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "16.2", reference: vitDRef }),
    { isAbnormal: true, flag: "L", isNumeric: true }
  );

  const cholRef = "Desirable: < 200\nBorderline High: 200 - 239\nHigh: >= 240";
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "178", reference: cholRef }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "225", reference: cholRef }),
    { isAbnormal: true, flag: "H", isNumeric: true }
  );
});

// --- 5. Dilution Titers, Blood Groups, Qualitative Tests ---------------------
check("Dilution titers evaluate Widal/ASO accurately", () => {
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "1:40", reference: "Negative (< 1:80)" }),
    { isAbnormal: false, flag: "", isNumeric: false }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "1:160", reference: "Negative (< 1:80)" }),
    { isAbnormal: true, flag: "H", isNumeric: false }
  );
});

check("Blood groups are never falsely highlighted as Positive abnormal", () => {
  assert.equal(
    evaluateClinicalReferenceFlag({ testName: "Blood Group & Rh Typing", value: "O Positive", reference: "" }).isAbnormal,
    false
  );
  assert.equal(
    evaluateClinicalReferenceFlag({ testName: "Rh Factor", value: "Rh Positive", reference: "" }).isAbnormal,
    false
  );
  assert.equal(
    evaluateClinicalReferenceFlag({ testName: "ABO Group", value: "AB+", reference: "" }).isAbnormal,
    false
  );
});

check("Explicit normal qualitative results stay unhighlighted while abnormal ones trigger", () => {
  assert.equal(
    evaluateClinicalReferenceFlag({ value: "Non-Reactive", reference: "Non-Reactive" }).isAbnormal,
    false
  );
  assert.equal(
    evaluateClinicalReferenceFlag({ value: "Absent", reference: "Absent" }).isAbnormal,
    false
  );
  assert.equal(
    evaluateClinicalReferenceFlag({ value: "Clear", reference: "Clear" }).isAbnormal,
    false
  );
  assert.equal(
    evaluateClinicalReferenceFlag({ value: "Reactive", reference: "Non-Reactive" }).isAbnormal,
    true
  );
  assert.equal(
    evaluateClinicalReferenceFlag({ value: "Positive", reference: "Negative" }).isAbnormal,
    true
  );
  assert.equal(
    evaluateClinicalReferenceFlag({ value: "Present (+++)", reference: "Absent" }).isAbnormal,
    true
  );
  assert.equal(
    evaluateClinicalReferenceFlag({ value: "Trace", reference: "Nil" }).isAbnormal,
    true
  );
  assert.equal(
    evaluateClinicalReferenceFlag({ value: "Turbid", reference: "Clear" }).isAbnormal,
    true
  );
});

check("dbIsAbnormal acts as qualitative fallback but never overrides valid numeric range", () => {
  // Valid numeric inside range ignores stale dbIsAbnormal=true
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "14.5", reference: "13.0 - 17.0", dbIsAbnormal: true }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
  // Unparseable qualitative remark respects dbIsAbnormal=true
  assert.equal(
    evaluateClinicalReferenceFlag({ value: "Microcytic hypochromic picture", reference: "Normocytic normochromic", dbIsAbnormal: true }).isAbnormal,
    true
  );
});

// --- 6. PDF HTML Compiler & Full-Row Highlight Verification ------------------
check("prepareFormat5BodyHtml strips stale highlights on normal rows & enriches legacy abnormal rows", () => {
  const dirtyHtml = `
    <table class="oh5-results-table">
      <tbody>
        <tr class="oh5-test-row BoldRow oh5-row--abnormal">
          <td><span class="oh5-test-title">Haemoglobin</span></td>
          <td class="oh5-col-result-cell high-low">
            <div class="oh5-result-wrap">
              <span class="oh5-result-value is-abnormal is-red">14.2</span>
              <span class="oh5-flag-slot"><span class="HL"><span class="oh5-flag-badge is-red">H</span></span></span>
            </div>
          </td>
          <td class="oh5-unit-cell"><span class="oh5-unit-inner">g/dL</span></td>
          <td class="oh5-ref-block"><span class="oh5-ref-text">13.0 - 17.0</span></td>
        </tr>
        <tr class="oh5-test-row">
          <td><span class="oh5-test-title">Total WBC Count</span></td>
          <td class="oh5-col-result-cell">
            <div class="oh5-result-wrap">
              <span class="oh5-result-value">16,500</span>
              <span class="oh5-flag-slot"></span>
            </div>
          </td>
          <td class="oh5-unit-cell"><span class="oh5-unit-inner">/cumm</span></td>
          <td class="oh5-ref-block"><span class="oh5-ref-text">4,000 - 11,000</span></td>
        </tr>
      </tbody>
    </table>
  `;

  const cleaned = prepareFormat5BodyHtml({
    rawBodyHtml: dirtyHtml,
    BoldRow: true,
    HLinred: true,
    HighLow: true,
    patientGender: "Male",
    patientAge: "34",
  });

  const [row1, row2] = cleaned.split("</tr>");
  assert.match(row1, /data-abnormal="0"/);
  assert.match(row1, /Haemoglobin/);
  assert.doesNotMatch(row1, /oh5-row--abnormal|BoldRow|high-low|is-abnormal|is-red|oh5-flag-badge/);

  assert.match(row2, /oh5-row--abnormal BoldRow is-bold-row is-red-row/);
  assert.match(row2, /Total WBC Count/);
  assert.match(row2, /oh5-flag-badge is-red">H<\/span>/);
});

check("buildFormat5BodyCss keeps normal cells 400 and abnormal rows 700 across all 4 columns", () => {
  const css = buildFormat5BodyCss({
    horizontalLeftPx: 28,
    horizontalRightPx: 28,
    baseFontSizePx: 10.5,
    rowSpacingPx: 0.5,
    fontStack: "'Segoe UI', Arial, sans-serif",
    HLinred: true,
    BoldRow: true,
    showCategoryResolved: true,
    showTestHeadingResolved: true,
    HighLowResolved: true,
  });

  assert.match(css, /\.oh5-results-table tbody td\s*\{[\s\S]*?font-weight:\s*400;/);
  assert.match(css, /tr\.oh5-row--abnormal td,\s*\n\s*tr\.BoldRow td\s*\{[\s\S]*?font-weight:\s*700 !important;/);
  assert.match(css, /tr\.oh5-row--abnormal \.oh5-unit-inner[\s\S]*?tr\.oh5-row--abnormal \.oh5-ref-text[\s\S]*?font-weight:\s*700 !important;/);
});

check("Enter Result referenceType='text' & unit-suffixed numeric values still compute H/L flags", () => {
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "18.5", reference: "10.0 - 15.0", referenceType: "text", dbIsAbnormal: true }),
    { isAbnormal: true, flag: "H", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "8.2 mg/dL", reference: "10.0 - 15.0", referenceType: "text" }),
    { isAbnormal: true, flag: "L", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "12.5", reference: "10.0 - 15.0", referenceType: "text" }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "Custom Elevated", reference: "Normal", referenceType: "text", dbIsAbnormal: true, dbFlag: "H" }),
    { isAbnormal: true, flag: "H", isNumeric: false }
  );
});

check("normalizeLegacyPdfBodyHtml & buildLegacyAbnormalHighlightCss highlight full abnormal rows & restore normal rows", () => {
  const legacyBody = `
    <table class="test-table">
      <tbody>
        <tr class="BoldRow" style="font-weight:bold;">
          <td class="wrong"></td>
          <td class="test-name"><div class="test-name-cell">Haemoglobin</div></td>
          <td class="high-low"><div class="HL"><span class="high-low-marker">H</span></div><span class="result-value">14.2</span></td>
          <td>g/dL</td>
          <td>13.0 - 17.0</td>
        </tr>
        <tr data-ref-type="text">
          <td class="wrong"></td>
          <td class="test-name"><div class="test-name-cell">Serum Cholesterol</div></td>
          <td class="high-low"><div class="HL"><span class="high-low-marker"></span></div><span class="result-value">245</span></td>
          <td>mg/dL</td>
          <td>&lt; 200</td>
        </tr>
      </tbody>
    </table>
  `;

  const normalized = normalizeLegacyPdfBodyHtml({
    htmlContent: legacyBody,
    header: "<div>Age / Sex: 40 Y / Male</div>",
    HighLow: true,
    HLinred: true,
    BoldRow: true,
  });

  const [r1, r2] = normalized.split("</tr>");
  assert.match(r1, /is-normal-row/);
  assert.doesNotMatch(r1, /BoldRow|abnormal-result-row|>H</);

  assert.match(r2, /BoldRow abnormal-result-row/);
  assert.match(r2, /<span class="high-low-marker">H<\/span>/);

  const legacyCss = buildLegacyAbnormalHighlightCss({ HighLow: true, HLinred: true, BoldRow: true });
  assert.match(legacyCss, /tr\.abnormal-result-row td[\s\S]*?font-weight:\s*700 !important;/);
  assert.match(legacyCss, /td \.HL span\.high-low-marker[\s\S]*?display:\s*inline-flex !important;/);
});

// --- 8. Single-line multi-demographic refs, /cumm units & legacy Enter-Result DB flags ---
check("Single-line demographic refs (/, ;, |), /cumm units & unparenthesized age clauses evaluate cleanly", () => {
  const inlineRef = "Male: 13.5 - 17.5 / Female: 12.0 - 15.5";
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "12.5", reference: inlineRef, gender: "Female" }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "16.2", reference: inlineRef, gender: "Female" }),
    { isAbnormal: true, flag: "H", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "12.5", reference: "M: 13.5 - 17.5; F: 12.0 - 15.5", gender: "Male" }),
    { isAbnormal: true, flag: "L", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "150,000 /cumm", reference: "150,000 - 450,000 /cumm" }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "90,000 /cumm", reference: "150,000 - 450,000 /cumm" }),
    { isAbnormal: true, flag: "L", isNumeric: true }
  );
  assert.deepEqual(
    parseNumericReferenceBound("Adult 18 - 60 yrs 13.5 - 17.5"),
    { type: "range", low: 13.5, high: 17.5 }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({
      value: "0.4",
      reference: "Reactive: >= 1.0\nNon-Reactive: < 0.9",
    }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({
      value: "1.8",
      reference: "Reactive: >= 1.0\nNon-Reactive: < 0.9",
    }),
    { isAbnormal: true, flag: "H", isNumeric: true }
  );
});

check("Ambiguous demographic range with legacy dbIsAbnormal=true and empty dbFlag preserves abnormality & infers L/H", () => {
  const ref = "Male: 13.5 - 17.5\nFemale: 12.0 - 15.5";
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "12.5", reference: ref, gender: "", dbIsAbnormal: true, dbFlag: "" }),
    { isAbnormal: true, flag: "L", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "16.2", reference: ref, gender: "", dbIsAbnormal: true, dbFlag: "" }),
    { isAbnormal: true, flag: "H", isNumeric: true }
  );
  assert.deepEqual(
    evaluateClinicalReferenceFlag({ value: "14.2", reference: "13.0 - 17.0", dbIsAbnormal: true, dbFlag: "H" }),
    { isAbnormal: false, flag: "", isNumeric: true }
  );
});

check("Format 5 swaps Enter Result & Print dock positions and triggers instant PDF open on Print", () => {
  const html = fs.readFileSync(path.join(repoRoot, "private/pages/pages/reportFormat5.html"), "utf8");
  const js = fs.readFileSync(path.join(repoRoot, "private/pages/pages/reportFormat5.js"), "utf8");

  const signOffIdx = html.indexOf('id="signOff"');
  const printIdx = html.indexOf('id="BrowserPrint"');
  const saveIdx = html.indexOf('id="savePDF"');
  const sendIdx = html.indexOf('id="sendReport"');
  const enterIdx = html.indexOf('id="enterResult"');
  const settingIdx = html.indexOf('id="printsettingbutton"');

  assert.ok(signOffIdx > 0 && printIdx > signOffIdx && saveIdx > printIdx, "Print should follow Sign Off directly");
  assert.ok(enterIdx > sendIdx && settingIdx > enterIdx, "Enter Result should follow Send and precede Settings");

  assert.doesNotMatch(js, /\bisAbnormal\s*\?\?\s*test\.isBold\b/, "Must OR isAbnormal || isBold so false ?? true never drops legacy bold");
  assert.match(js, /rawValue\s*&&\s*typeof\s+rawValue\s*===\s*"object"/, "evaluateReferenceFlag must unwrap object-form argument cleanly");
  assert.match(js, /requestFormat5PdfBlob\(\{\s*download:\s*false\s*\}\)/, "Print handler must generate Format 5 PDF blob");
  assert.match(js, /printTab\s*=\s*global\.open\(""\s*,\s*"_blank"\)/, "Print handler must pre-open tab synchronously to avoid popup blocking");
  assert.match(js, /printTab\.location\.replace\(pdfUrl\)/, "Print handler must navigate pre-opened tab to generated PDF Blob URL");
});

for (const line of results) console.log(line);
console.log(process.exitCode ? "\nSome checks failed" : "\nAll checks passed");
