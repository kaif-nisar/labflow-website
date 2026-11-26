import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildReportSelectionTree,
  filterReportBySelection,
} from "../public/js/selectiveReportEngine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

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

function makeFixtureReport() {
  return {
    _id: "rep_001",
    bookingId: "BK_9001",
    patientName: "Meera Verma",
    MoreDetails: "<p>Correlate clinically.</p>",
    uniquetestArray: ["CBC", "LIPID", "TSH", "USG Abdomen"],
    CategoryAndTest: [
      {
        category: "HAEMATOLOGY",
        title: "CBC",
        interpretation: "<p>Interpret CBC carefully</p>",
        tests: [
          {
            testName: '<td class="test-name"><div class="test-name-cell">Complete Haemogram</div></td>',
            isMultiParameterHeading: true,
          },
          {
            testName: '<td class="test-name" id="parameters"><div class="test-name-cell">Haemoglobin</div></td>',
            value: "10.8",
            unit: "g/dL",
            reference: "12.0 - 15.5",
          },
          {
            testName: '<td class="test-name" id="parameters"><div class="test-name-cell">Total WBC Count</div></td>',
            value: "7500",
            unit: "/cumm",
            reference: "4000 - 11000",
          },
          {
            testName: null,
            remark: "Smear normal",
          },
          {
            testName: '<td class="test-name" id="parameters"><div class="test-name-cell">Platelet Count</div></td>',
            value: "250000",
            unit: "/cumm",
            reference: "150000 - 450000",
          },
        ],
      },
      {
        category: "BIOCHEMISTRY",
        title: "LIPID PROFILE",
        tests: [
          {
            testName: '<td class="test-name"><div class="test-name-cell">Total Cholesterol</div></td>',
            value: "225",
            unit: "mg/dL",
            reference: "< 200",
          },
          {
            testName: '<td class="test-name"><div class="test-name-cell">Triglycerides</div></td>',
            value: "160",
            unit: "mg/dL",
            reference: "< 150",
          },
        ],
      },
      {
        category: "ENDOCRINOLOGY",
        title: "ENDOCRINOLOGY",
        tests: [
          {
            testName: '<td class="test-name"><div class="test-name-cell">Serum TSH</div></td>',
            value: "6.4",
            unit: "µIU/mL",
            reference: "0.4 - 4.2",
          },
        ],
      },
      {
        category: "RADIOLOGY",
        title: "RADIOLOGY",
        tests: [
          {
            testName: "<p>Liver normal in size and echotexture.</p>",
            isDocumented: true,
          },
        ],
      },
    ],
  };
}

const sampleBarcodeMeta = [
  {
    packages: [
      {
        _id: "pkg_health",
        packageName: "Executive Health Package",
        Short_name: "Exec Health",
        pannelIds: [{ _id: "pan_cbc", name: "CBC" }],
        testIds: [{ _id: "test_tsh", Name: "Serum TSH" }],
      },
    ],
  },
];

check("buildReportSelectionTree indexes packages, panels, multi-param groups, parameters, and documented tests", () => {
  const report = makeFixtureReport();
  const tree = buildReportSelectionTree(report, sampleBarcodeMeta);

  assert.equal(tree.packages.length, 1);
  assert.equal(tree.packages[0].name, "Executive Health Package");
  assert.equal(tree.sections.length, 4);

  const cbcSec = tree.sections[0];
  assert.equal(cbcSec.isPanel, true);
  assert.deepEqual(cbcSec.matchedPackageIds, ["pkg_health"]);
  assert.equal(cbcSec.items[0].kind, "group");
  assert.equal(cbcSec.items[1].kind, "param");
  assert.equal(cbcSec.items[1].parentKey, cbcSec.items[0].key);

  const endoSec = tree.sections[2];
  assert.deepEqual(endoSec.items[0].packageIds, ["pkg_health"]);
});

check("Full mode (allSelected or mode=full) returns original report untouched", () => {
  const report = makeFixtureReport();
  const resFull = filterReportBySelection(report, { mode: "full", allSelected: true }, sampleBarcodeMeta);
  assert.equal(resFull, report);
  assert.equal(resFull.CategoryAndTest.length, 4);
});

check("Filtering by single Panel keeps ONLY that panel & updates header Investigations cleanly without mutating fullReport", () => {
  const report = makeFixtureReport();
  const snapBefore = JSON.stringify(report);
  const tree = buildReportSelectionTree(report, sampleBarcodeMeta);
  const cbcLeafs = tree.sections[0].items.filter((i) => i.kind !== "group").map((i) => i.key);

  const filtered = filterReportBySelection(
    report,
    { mode: "selected", allSelected: false, selectedItemKeys: cbcLeafs },
    sampleBarcodeMeta
  );

  assert.equal(filtered.isSelectiveReport, true);
  assert.equal(filtered.CategoryAndTest.length, 1);
  assert.equal(filtered.CategoryAndTest[0].title, "CBC");
  assert.deepEqual(filtered.uniquetestArray, ["CBC"]);
  assert.deepEqual(filtered.investigationShortNames, ["CBC"]);
  assert.equal(JSON.stringify(report), snapBefore, "Full report object must never be mutated");
});

check("Filtering single parameter inside multi-parameter test retains parent heading & attached inline remark", () => {
  const report = makeFixtureReport();
  const tree = buildReportSelectionTree(report, sampleBarcodeMeta);
  const wbcParam = tree.sections[0].items.find((i) => i.label === "Total WBC Count");

  const filtered = filterReportBySelection(
    report,
    { mode: "selected", allSelected: false, selectedItemKeys: [wbcParam.key] },
    sampleBarcodeMeta
  );

  const tests = filtered.CategoryAndTest[0].tests;
  assert.equal(tests.length, 3); // Heading + Total WBC Count + trailing remark
  assert.equal(tests[0].isMultiParameterHeading, true);
  assert.match(tests[1].testName, /Total WBC Count/);
  assert.equal(tests[2].remark, "Smear normal");
});

check("Filtering Package member items selects panel + test across different categories cleanly", () => {
  const report = makeFixtureReport();
  const tree = buildReportSelectionTree(report, sampleBarcodeMeta);
  const pkgKeys = [];
  tree.sections.forEach((sec) => {
    sec.items.forEach((it) => {
      if (it.kind !== "group" && it.packageIds.includes("pkg_health")) {
        pkgKeys.push(it.key);
      }
    });
  });

  const filtered = filterReportBySelection(
    report,
    { mode: "selected", allSelected: false, selectedItemKeys: pkgKeys, includeMoreDetails: false },
    sampleBarcodeMeta
  );

  assert.equal(filtered.CategoryAndTest.length, 2);
  assert.deepEqual(filtered.CategoryAndTest.map((c) => c.title), ["CBC", "ENDOCRINOLOGY"]);
  assert.deepEqual(filtered.uniquetestArray, ["CBC", "Serum TSH"]);
  assert.equal(filtered.MoreDetails, "");
});

check("All 5 Report Formats, Lab Report & PDF Controller integrate non-destructive selective reporting", () => {
  const labHtml = fs.readFileSync(path.join(repoRoot, "private/pages/pages/labreport.html"), "utf8");
  const labJs = fs.readFileSync(path.join(repoRoot, "private/pages/pages/labreport.js"), "utf8");
  const pdfCtrl = fs.readFileSync(path.join(repoRoot, "src/controllers/pdfgenerator.controller.js"), "utf8");

  assert.match(labHtml, /id="lrSelectiveScopeBar"/);
  assert.match(labHtml, /id="selectedReportBtn"/);
  assert.match(labHtml, /id="lrSelectedFormatSelect"/);
  assert.match(labJs, /getCleanTestNameHtml/);
  assert.match(labJs, /initializeSelectiveReportControls/);
  assert.match(labJs, /selKey=/);
  assert.match(labJs, /resolveLabReportBarcodeNumber/);

  assert.match(pdfCtrl, /shouldSkipCustomizationSave/);
  assert.match(pdfCtrl, /selective_print_non_destructive/);

  for (const fmtFile of [
    "private/pages/pages/reportFormat.js",
    "private/pages/pages/reportFormat1.js",
    "private/pages/pages/reportFormat3.js",
    "private/pages/pages/reportFormat4.js",
    "private/pages/pages/reportFormat5.js",
  ]) {
    const code = fs.readFileSync(path.join(repoRoot, fmtFile), "utf8");
    assert.match(code, /resolveInitialSelectiveReport/, `${fmtFile} must resolve ?selKey= non-destructively`);
    assert.match(code, /mountReportFilterDrawer/, `${fmtFile} must mount Report Filter Drawer`);
    assert.match(code, /skipCustomizationSave/, `${fmtFile} must pass skipCustomizationSave during selective print`);
  }

  const shared = fs.readFileSync(path.join(repoRoot, "private/pages/pages/reportAction.shared.js"), "utf8");
  assert.match(shared, /\.lf-filter-body\s*\{[\s\S]*?min-height:\s*120px;[\s\S]*?overflow-y:\s*auto !important;[\s\S]*?display:\s*block;/);
  assert.match(shared, /\.lf-filter-sec\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?overflow:\s*visible;/);
});

for (const line of results) console.log(line);
console.log(process.exitCode ? "\nSome checks failed" : "\nAll checks passed");
