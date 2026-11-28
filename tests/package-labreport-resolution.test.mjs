import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createBookingCatalogResolvers,
  deriveLivePackageSampleTypes,
  deriveLivePanelSampleTypes,
  distributePackageContentsAcrossRows,
  hydrateLiveCatalogSampleTypes,
  matchesBookingSampleType,
  resolveBookedInvestigationsForLabReport,
  resolveExpandedItemsForBookingRows,
} from "../src/utils/bookingPackageResolver.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// Helper to create minimal Mongoose-like model mocks supporting .find(query).lean()
const createMockModel = (docs = []) => ({
  find(query = {}) {
    const matchesQuery = (doc) => {
      if (query.$or) {
        return query.$or.some((branch) => matchesCondition(doc, branch));
      }
      return matchesCondition(doc, query);
    };

    const matchesCondition = (doc, cond) => {
      return Object.entries(cond).every(([field, expected]) => {
        const val = doc?.[field];
        if (expected && typeof expected === "object" && Array.isArray(expected.$in)) {
          const targets = expected.$in.map((x) => String(x));
          if (Array.isArray(val)) return val.some((v) => targets.includes(String(v)));
          return targets.includes(String(val));
        }
        return String(val ?? "") === String(expected ?? "");
      });
    };

    const matched = docs.filter(matchesQuery);
    return {
      select() {
        return this;
      },
      async lean() {
        return matched.map((d) => ({ ...d }));
      },
    };
  },
});

const TENANT_A = "65f00000000000000000000a";
const TENANT_B = "65f00000000000000000000b";

const BASE_TEST_RBS = "65f000000000000000001001";
const TENANT_TEST_RBS = "65f000000000000000002001";
const TENANT_TEST_CREATININE = "65f000000000000000002002";
const BASE_TEST_HB = "65f000000000000000001003";
const BASE_TEST_TLC = "65f000000000000000001004"; // Intentionally uncloned base test
const TENANT_TEST_HB = "65f000000000000000002003"; // Cloned from SuperAdmin WITHOUT originalTestId (name match!)
const OTHER_TENANT_TEST_RBS = "65f000000000000000003001";
const TENANT_TEST_ESR = "65f000000000000000002005";

const BASE_PANEL_CBC = "65f000000000000000004001";
const TENANT_PANEL_CBC = "65f000000000000000005001";
const TENANT_PANEL_LFT = "65f000000000000000005002";

const BASE_PKG_HEALTH = "65f000000000000000006001";
const TENANT_PKG_HEALTH = "65f000000000000000007001";

const mockTests = [
  {
    _id: BASE_TEST_RBS,
    tenantId: null,
    Name: "Random Blood Sugar",
    Short_name: "RBS",
    sampleType: "Fluoride",
    method: undefined,
    instrument: null,
  },
  {
    _id: TENANT_TEST_RBS,
    tenantId: TENANT_A,
    originalTestId: BASE_TEST_RBS,
    Name: "Random Blood Sugar",
    Short_name: "RBS",
    sampleType: "Fluoride",
  },
  {
    _id: OTHER_TENANT_TEST_RBS,
    tenantId: TENANT_B,
    originalTestId: BASE_TEST_RBS,
    Name: "Random Blood Sugar (Other Tenant)",
    Short_name: "RBS-B",
    sampleType: "Fluoride",
  },
  {
    _id: TENANT_TEST_CREATININE,
    tenantId: TENANT_A,
    Name: "Serum Creatinine",
    Short_name: "CREAT",
    sampleType: "Serum",
  },
  {
    _id: BASE_TEST_HB,
    tenantId: null,
    Name: "Hemoglobin",
    Short_name: "Hb",
    sampleType: "Whole Blood EDTA",
  },
  {
    _id: TENANT_TEST_HB,
    tenantId: TENANT_A,
    // Simulates legacy SuperAdmin copy where originalTestId was omitted
    Name: "Hemoglobin",
    Short_name: "Hb",
    sampleType: "Whole Blood EDTA",
  },
  {
    _id: BASE_TEST_TLC,
    tenantId: null,
    Name: "Total Leucocyte Count",
    Short_name: "TLC",
    sampleType: "Whole Blood EDTA",
  },
  {
    _id: TENANT_TEST_ESR,
    tenantId: TENANT_A,
    Name: "ESR",
    Short_name: "ESR",
    sampleType: "", // Empty sample type edge case
  },
];

const mockPanels = [
  {
    _id: BASE_PANEL_CBC,
    tenantId: null,
    name: "Complete Blood Count",
    tests: ["Hemoglobin", "Total Leucocyte Count"],
    testsId: [BASE_TEST_HB, BASE_TEST_TLC],
    sample_types: ["Whole Blood EDTA"],
  },
  {
    _id: TENANT_PANEL_CBC,
    tenantId: TENANT_A,
    originalPanelId: BASE_PANEL_CBC,
    name: "Complete Blood Count",
    tests: ["Hemoglobin", "Total Leucocyte Count"],
    testsId: [BASE_TEST_HB, BASE_TEST_TLC],
    sample_types: ["Whole Blood EDTA"],
  },
  {
    _id: TENANT_PANEL_LFT,
    tenantId: TENANT_A,
    name: "Liver Function Test",
    tests: ["Serum Creatinine"],
    testsId: [TENANT_TEST_CREATININE],
    sample_types: ["Serum"],
  },
];

const mockPackages = [
  {
    _id: TENANT_PKG_HEALTH,
    tenantId: TENANT_A,
    originalPackageId: BASE_PKG_HEALTH,
    packageName: "Master Health Package",
    testIds: [BASE_TEST_RBS, TENANT_TEST_CREATININE, TENANT_TEST_ESR],
    pannelIds: [BASE_PANEL_CBC, TENANT_PANEL_LFT],
    // Intentionally stale testSample & pannelSample missing Fluoride!
    testSample: ["Serum"],
    pannelSample: ["Serum"],
  },
];

test("deriveLivePanelSampleTypes & deriveLivePackageSampleTypes reflect live Fluoride test even with stale package metadata", () => {
  const testsById = new Map(mockTests.map((t) => [t._id, t]));
  const panelsById = new Map(mockPanels.map((p) => [p._id, p]));

  const livePanelSamples = deriveLivePanelSampleTypes(mockPanels[1], testsById);
  assert.deepEqual(livePanelSamples, ["Whole Blood EDTA"]);

  const livePkgSamples = deriveLivePackageSampleTypes(mockPackages[0], testsById, panelsById);
  assert.ok(livePkgSamples.includes("Fluoride"), "Package live sample types must include Fluoride from RBS");
  assert.ok(livePkgSamples.includes("Serum"), "Package live sample types must include Serum");
  assert.ok(livePkgSamples.includes("Whole Blood EDTA"), "Package live sample types must include EDTA from CBC panel");
});

test("matchesBookingSampleType handles Fluoride variants, delimiters, and spelling typos", () => {
  assert.equal(matchesBookingSampleType(["Fluoride"], "Fluoride", false), true);
  assert.equal(matchesBookingSampleType(["Sodium Fluoride (Gray Top)"], "Fluoride", false), true);
  assert.equal(matchesBookingSampleType(["Flouride"], "Fluoride", false), true);
  assert.equal(matchesBookingSampleType(["Serum / Fluoride"], "Fluoride", false), true);
  assert.equal(matchesBookingSampleType(["Whole Blood EDTA"], "Serum", false), false);
});

test("distributePackageContentsAcrossRows rescues unmatched Fluoride/sample-less tests onto primary package row instead of dropping them", () => {
  const testsById = new Map(mockTests.map((t) => [t._id, t]));
  const panelsById = new Map(mockPanels.map((p) => [p._id, p]));

  // Booking only had Serum & EDTA rows (Fluoride row was missing from booking table!)
  const { allocations } = distributePackageContentsAcrossRows({
    pkgDoc: mockPackages[0],
    rowSamples: ["Serum", "Whole Blood EDTA"],
    resolvedTestsById: testsById,
    resolvedPanelsById: panelsById,
  });

  const row0TestNames = allocations[0].tests.map((t) => t.Name);
  const row0PanelNames = allocations[0].panels.map((p) => p.name);
  const row1PanelNames = allocations[1].panels.map((p) => p.name);

  assert.ok(row0TestNames.includes("Serum Creatinine"));
  assert.ok(row0TestNames.includes("Random Blood Sugar"), "Fluoride RBS must be rescued to row 0");
  assert.ok(row0TestNames.includes("ESR"), "Sample-less test must be rescued to row 0 without duplication");
  assert.ok(!allocations[1].tests.some((t) => t.Name === "ESR"), "Sample-less test should not duplicate across rows");
  assert.ok(row0PanelNames.includes("Liver Function Test"));
  assert.ok(row1PanelNames.includes("Complete Blood Count"));
});

test("resolveExpandedItemsForBookingRows resolves tenant clones, panel child tests, and 100% of package items", async () => {
  const resolvers = createBookingCatalogResolvers({
    testSchema: createMockModel(mockTests),
    addPannel: createMockModel(mockPanels),
    Package: createMockModel(mockPackages),
  });

  const expanded = await resolveExpandedItemsForBookingRows({
    tenantId: TENANT_A,
    resolvers,
    rows: [
      {
        barcodeId: "BC-SERUM",
        typeOfSample: "Serum",
        ids: [{ id: BASE_PKG_HEALTH, collectionName: "Package" }],
      },
      {
        barcodeId: "BC-EDTA",
        typeOfSample: "EDTA",
        ids: [{ id: BASE_PKG_HEALTH, collectionName: "Package" }],
      },
    ],
  });

  assert.equal(expanded.length, 2);
  const allExpandedNames = new Set([...expanded[0].testnames, ...expanded[1].testnames]);
  assert.deepEqual(
    allExpandedNames,
    new Set(["Random Blood Sugar", "Serum Creatinine", "ESR", "Complete Blood Count", "Liver Function Test"])
  );

  // Verify TENANT_TEST_RBS was chosen over OTHER_TENANT_TEST_RBS and BASE_TEST_RBS
  const allObjIds = [...expanded[0].testObjects, ...expanded[1].testObjects].map((o) => String(o.id));
  assert.ok(allObjIds.includes(TENANT_TEST_RBS));
  assert.ok(!allObjIds.includes(OTHER_TENANT_TEST_RBS));
});

test("resolveBookedInvestigationsForLabReport reconciles partial/stale acceptedBarcode against bookingDoc A to Z", async () => {
  const resolvers = createBookingCatalogResolvers({
    testSchema: createMockModel(mockTests),
    addPannel: createMockModel(mockPanels),
    Package: createMockModel(mockPackages),
  });

  // Simulate old buggy acceptedBarcode that ONLY saved Serum Creatinine + LFT
  // (dropped Fluoride RBS, EDTA CBC, ESR, and stripped the Package ID!)
  const staleAcceptedBarcode = {
    tenantId: TENANT_A,
    bookingId: "BK-999",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    barcodes: [
      {
        barcode: "BC-SERUM",
        sampleType: "Serum",
        testandpannelArray: ["Serum Creatinine", "Liver Function Test"],
        testIds: [
          { id: TENANT_TEST_CREATININE, collectionName: "testSchema" },
          { id: TENANT_PANEL_LFT, collectionName: "addPannel" },
        ],
      },
    ],
  };

  const bookingDoc = {
    tenantId: TENANT_A,
    bookingId: "BK-999",
    selectedItems: [
      { itemType: "package", itemId: TENANT_PKG_HEALTH, itemName: "Master Health Package" },
    ],
    tableData: [
      {
        barcodeId: "BC-SERUM",
        typeOfSample: "Serum",
        testName: "Master Health Package",
        ids: [{ id: TENANT_PKG_HEALTH, collectionName: "Package" }],
      },
    ],
  };

  const result = await resolveBookedInvestigationsForLabReport({
    tenantId: TENANT_A,
    acceptedBarcodeDoc: staleAcceptedBarcode,
    bookingDoc,
    resolvers,
  });

  const returnedTestNames = result.singleTests.map((t) => t.Name);
  const returnedPanelNames = result.panels.map((p) => p.name);
  const returnedPkgNames = result.packages.map((p) => p.packageName);

  // Every single test and panel in the booked package MUST appear A to Z!
  assert.ok(returnedTestNames.includes("Random Blood Sugar"), "Fluoride Random Blood Sugar must appear");
  assert.ok(returnedTestNames.includes("Serum Creatinine"), "Serum Creatinine must appear");
  assert.ok(returnedTestNames.includes("ESR"), "ESR must appear");
  assert.ok(returnedPanelNames.includes("Complete Blood Count"), "CBC panel must appear");
  assert.ok(returnedPanelNames.includes("Liver Function Test"), "LFT panel must appear");
  assert.deepEqual(returnedPkgNames, ["Master Health Package"]);

  // Verify panel child tests inside CBC didn't get dropped even though TLC is uncloned base doc and HB lacked originalTestId!
  const cbcPanel = result.panels.find((p) => p.name === "Complete Blood Count");
  const cbcChildIds = cbcPanel.testsId.map((t) => String(t._id));
  assert.equal(cbcPanel.testsId.length, 2);
  assert.ok(cbcChildIds.includes(TENANT_TEST_HB), "Cloned Hb without originalTestId resolved by name");
  assert.ok(cbcChildIds.includes(BASE_TEST_TLC), "Uncloned base TLC fallback preserved instead of dropped by match:{tenantId}");

  // Verify zero cross-tenant leakage & no duplicates
  assert.ok(!result.singleTests.some((t) => String(t._id) === OTHER_TENANT_TEST_RBS));
  assert.equal(new Set(result.singleTests.map((t) => String(t._id))).size, result.singleTests.length);
  assert.equal(new Set(result.panels.map((p) => String(p._id))).size, result.panels.length);

  // Verify package doc on response has populated testIds & pannelIds for selectiveReportEngine
  assert.ok(result.packages[0].testIds.every((t) => t && typeof t === "object" && t.Name));
  assert.ok(result.packages[0].pannelIds.every((p) => p && typeof p === "object" && p.name));
  assert.ok(result.investigations.includes("Master Health Package"));
  assert.ok(result.investigations.includes("RBS"));
});

test("hydrateLiveCatalogSampleTypes populates _liveSampleTypes for packages and panels with live test sampleTypes", async () => {
  const { panels, packages } = await hydrateLiveCatalogSampleTypes({
    tests: [], // Force lookup via testSchema & addPannel mocks
    panels: [{ ...mockPanels[1] }],
    packages: [{ ...mockPackages[0] }],
    testSchema: createMockModel(mockTests),
    addPannel: createMockModel(mockPanels),
  });

  assert.deepEqual(panels[0]._liveSampleTypes, ["Whole Blood EDTA"]);
  assert.ok(packages[0]._liveSampleTypes.includes("Fluoride"), "Package catalog must surface Fluoride from RBS");
  assert.ok(packages[0]._liveSampleTypes.includes("Serum"), "Package catalog must surface Serum");
  assert.ok(packages[0]._liveSampleTypes.includes("Whole Blood EDTA"), "Package catalog must surface EDTA from CBC");
});

test("labreport.js guards method, instrument, parameters, Para_name, and patient.age against TypeError crashes", () => {
  const labreportSource = fs.readFileSync(
    path.join(repoRoot, "private/pages/pages/labreport.js"),
    "utf8"
  );

  assert.equal(
    labreportSource.includes('typeof test.method === "string" ? test.method.trim()'),
    true,
    "test.method.trim() must be safely type-guarded"
  );
  assert.equal(
    labreportSource.includes('typeof test.instrument === "string" ? test.instrument.trim()'),
    true,
    "test.instrument.trim() must be safely type-guarded"
  );
  assert.equal(
    labreportSource.includes("const safeTestParameters = Array.isArray(test.parameters) ? test.parameters : [];"),
    true,
    "test.parameters must be normalized to an array before accessing index 0"
  );
  assert.equal(labreportSource.includes("test.parameters[0]?.text"), false, "Unsafe test.parameters[0] without safe array must be removed");
  assert.equal(labreportSource.includes("param.Para_name.replace"), false, "Unsafe param.Para_name.replace must be removed");
  assert.equal(labreportSource.includes('patient.age.split(" ")'), false, "Unsafe patient.age.split must be removed");
  assert.equal(labreportSource.includes("await getallpptfromrelatedbarcode("), true, "getallpptfromrelatedbarcode call should be awaited");
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
    passed++;
  } catch (error) {
    console.error(`FAIL  ${name} -> ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

console.log(`\nSummary: ${passed}/${tests.length} passed`);
