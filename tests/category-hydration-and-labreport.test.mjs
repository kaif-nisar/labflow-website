import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractCategoryName,
  extractCategoryId,
  resolveCategorySnapshot,
} from "../src/utils/categorySnapshot.js";

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

const sampleCategories = [
  {
    _id: "65f000000000000000000101",
    orderId: 1,
    category: "HAEMATOLOGY",
    tenantId: "65f000000000000000000001",
    originalCategoryId: "65f000000000000000000901",
  },
  {
    _id: "65f000000000000000000102",
    orderId: 2,
    category: "BIOCHEMISTRY",
    tenantId: "65f000000000000000000001",
    originalCategoryId: "65f000000000000000000902",
  },
  {
    _id: "65f000000000000000000103",
    orderId: 3,
    category: "SEROLOGY",
    tenantId: "65f000000000000000000001",
  },
];

check("extractCategoryName handles string, object aliases, arrays, nested objects, and rejects raw ObjectId hex", () => {
  assert.equal(extractCategoryName("  Biochemistry  "), "Biochemistry");
  assert.equal(extractCategoryName({ category: "HAEMATOLOGY", orderId: 1 }), "HAEMATOLOGY");
  assert.equal(extractCategoryName({ name: "Hormones" }), "Hormones");
  assert.equal(extractCategoryName({ categoryName: "Microbiology" }), "Microbiology");
  assert.equal(extractCategoryName([{ category: "Serology", orderId: 3 }]), "Serology");
  assert.equal(extractCategoryName({ category: { category: "Clinical Pathology" } }), "Clinical Pathology");
  assert.equal(extractCategoryName("65f000000000000000000101"), "");
  assert.equal(extractCategoryName(null), "");
});

check("extractCategoryId finds IDs from hex strings, objects, and arrays", () => {
  assert.equal(extractCategoryId("65f000000000000000000101"), "65f000000000000000000101");
  assert.equal(extractCategoryId({ _id: "65f000000000000000000102" }), "65f000000000000000000102");
  assert.equal(extractCategoryId([{ originalCategoryId: "65f000000000000000000901" }]), "65f000000000000000000901");
  assert.equal(extractCategoryId("Biochemistry"), "");
});

check("resolveCategorySnapshot hydrates Catalog Studio plain string categories with live orderId and _id", () => {
  const resolved = resolveCategorySnapshot({
    categoryInput: "biochemistry",
    categoryDocs: sampleCategories,
  });
  assert.equal(resolved.category, "BIOCHEMISTRY");
  assert.equal(resolved.orderId, 2);
  assert.equal(resolved._id, "65f000000000000000000102");
});

check("resolveCategorySnapshot matches base originalCategoryId to tenant's live renamed/reordered category", () => {
  const resolved = resolveCategorySnapshot({
    categoryInput: { _id: "65f000000000000000000901", orderId: 99, category: "Old Haem Name" },
    categoryDocs: sampleCategories,
  });
  assert.equal(resolved.category, "HAEMATOLOGY");
  assert.equal(resolved.orderId, 1);
  assert.equal(resolved._id, "65f000000000000000000101");
});

check("resolveCategorySnapshot resolves raw 24-hex ObjectId string and handles custom/missing fallbacks", () => {
  const fromHex = resolveCategorySnapshot({
    categoryInput: "65f000000000000000000103",
    categoryDocs: sampleCategories,
  });
  assert.equal(fromHex.category, "SEROLOGY");
  assert.equal(fromHex.orderId, 3);

  const customName = resolveCategorySnapshot({
    categoryInput: "Special Immunology",
    categoryDocs: sampleCategories,
  });
  assert.equal(customName.category, "Special Immunology");
  assert.equal(customName.orderId, 9999);

  const empty = resolveCategorySnapshot({
    categoryInput: null,
    categoryDocs: sampleCategories,
  });
  assert.equal(empty.category, "General");
  assert.equal(empty.orderId, 9999);
});

check("NewBooking.controller uses hydrateCategoriesOnBarcodeResult instead of no-op Mixed .populate('category')", () => {
  const src = fs.readFileSync(path.join(repoRoot, "src/controllers/NewBooking.controller.js"), "utf8");
  assert.ok(src.includes("hydrateCategoriesOnBarcodeResult"), "Missing hydrateCategoriesOnBarcodeResult call");
  assert.ok(!src.includes(".populate('category')"), "Leftover no-op .populate('category') on Mixed schema");
});

check("labreport.js normalizes panel and single test categories cleanly and avoids naive .category.category crash", () => {
  const src = fs.readFileSync(path.join(repoRoot, "private/pages/pages/labreport.js"), "utf8");
  assert.ok(src.includes("function resolvePanelCategoryMeta(panel)"), "Missing panel category resolver");
  assert.ok(src.includes("function normalizeCategoryMeta("), "Missing category normalizer");
  assert.ok(src.includes("matchedCategories.add(normalizeCategoryKey(panelCategory.category))"), "matchedCategories should track normalized keys");
  assert.ok(src.includes("categoryHeading.textContent = resolvedCategory.category"), "createTable must use resolvedCategory.category");
  assert.ok(!src.includes("categoryHeading.textContent = category.category"), "Leftover unsafe category.category access");
});

check("labreport.html centers both main category headings (.grouped-section > h2) and sub-category bars (.lr-sec-head-bar)", () => {
  const html = fs.readFileSync(path.join(repoRoot, "private/pages/pages/labreport.html"), "utf8");
  assert.match(html, /\.grouped-section\s*>\s*h2[\s\S]*?text-align:\s*center\s*!important/);
  assert.match(html, /\.lr-sec-head-bar\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(68px,\s*1fr\)\s+minmax\(0,\s*auto\)\s+minmax\(68px,\s*1fr\)/);
  assert.match(html, /\.lr-sec-head-bar\s+h3\s*\{[\s\S]*?grid-column:\s*2;[\s\S]*?text-align:\s*center\s*!important/);
});

console.log(results.join("\n"));
if (process.exitCode) {
  process.exit(process.exitCode);
}
