import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import mongoose from "mongoose";
import puppeteer from "puppeteer";

import { getPuppeteerLaunchOptions } from "../src/utils/puppeteerRuntime.js";

import {
  adminAssign,
  assignModelsToFranchisee,
  getAllAddOns,
} from "../src/controllers/addtest.controller.js";
import { testSchema } from "../src/models/newTest.model.js";
import { addPannel } from "../src/models/AddPannel.model.js";
import { Package } from "../src/models/addPackage.model.js";
import { categorydb, unitdb } from "../src/models/category.model.js";
import { sampleSchema } from "../src/models/sampletype.model.js";
import { Tenant } from "../src/models/tenant.model.js";
import { Formula } from "../src/models/formula.model.js";

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

function invokeHandler(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      payload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.payload = data;
        resolve(this);
        return this;
      },
    };
    handler(req, res, (err) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

function makeQueryMock(result) {
  const q = {
    select() { return q; },
    sort() { return q; },
    session() { return q; },
    populate() { return q; },
    lean: async () => result,
    then(onFulfilled, onRejected) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return q;
}

await check("SuperAdmin HTML & SPA router properly reference copyTestAssign without .html suffix", () => {
  const superAdminHtml = fs.readFileSync(path.join(repoRoot, "private/superAdmin.html"), "utf8");
  const testAssignHtml = fs.readFileSync(path.join(repoRoot, "private/pages/testAssign.html"), "utf8");
  const mainJs = fs.readFileSync(path.join(repoRoot, "private/main.js"), "utf8");

  assert.ok(superAdminHtml.includes('data-page="copyTestAssign"'), "superAdmin.html should expose Admin Assignment sidebar link");
  assert.ok(!testAssignHtml.includes('data-page="copyTestAssign.html"'), "testAssign.html must not have .html in data-page");
  assert.ok(testAssignHtml.includes('data-page="copyTestAssign"'), "testAssign.html should target copyTestAssign");
  assert.ok(mainJs.includes("normalizeSaPageName"), "main.js should normalize page names");
});

await check("adminAssign validates adminId and returns full catalog including categories/units/sampleTypes", async () => {
  const badRes = await invokeHandler(adminAssign, { body: { adminId: "invalid-id" } });
  assert.equal(badRes.statusCode, 400);
  assert.equal(badRes.payload.success, false);

  const validAdminId = new mongoose.Types.ObjectId().toString();
  const origTestFind = testSchema.find;
  const origPanelFind = addPannel.find;
  const origPkgFind = Package.find;
  const origCatFind = categorydb.find;
  const origUnitFind = unitdb.find;
  const origSampleFind = sampleSchema.find;

  try {
    testSchema.find = () => makeQueryMock([{ _id: "t1", Name: "CBC", Price: 300, createdByRole: "superAdmin" }]);
    addPannel.find = () => makeQueryMock([{ _id: "p1", name: "LFT", price: 500, createdByRole: "admin" }]);
    Package.find = () => makeQueryMock([{ _id: "pk1", packageName: "Basic Health", packageFee: "999", createdByRole: "superAdmin" }]);
    categorydb.find = () => makeQueryMock([{ _id: "c1", category: "Hematology" }]);
    unitdb.find = () => makeQueryMock([{ _id: "u1", unit: "mg/dL" }]);
    sampleSchema.find = () => makeQueryMock([{ _id: "s1", Name: "Blood" }]);

    const okRes = await invokeHandler(adminAssign, { body: { adminId: validAdminId } });
    assert.equal(okRes.statusCode, 200);
    assert.equal(okRes.payload.success, true);
    assert.equal(okRes.payload.data.tests.length, 1);
    assert.equal(okRes.payload.data.panels.length, 1);
    assert.equal(okRes.payload.data.packages.length, 1);
    assert.equal(okRes.payload.data.categories.length, 1);
    assert.equal(okRes.payload.data.units.length, 1);
    assert.equal(okRes.payload.data.sampleTypes.length, 1);
  } finally {
    testSchema.find = origTestFind;
    addPannel.find = origPanelFind;
    Package.find = origPkgFind;
    categorydb.find = origCatFind;
    unitdb.find = origUnitFind;
    sampleSchema.find = origSampleFind;
  }
});

await check("assignModelsToFranchisee fixes panel assignedPrices, cross-batch testId remapping, dedup, and standalone fallback", async () => {
  const sourceAdminId = new mongoose.Types.ObjectId();
  const targetAdminId = new mongoose.Types.ObjectId();
  const targetUserId = new mongoose.Types.ObjectId();
  const baseTestId = new mongoose.Types.ObjectId();
  const sourceTestId = new mongoose.Types.ObjectId();
  const targetTestId = new mongoose.Types.ObjectId();
  const sourcePanelId = new mongoose.Types.ObjectId();
  const sourceCatId = new mongoose.Types.ObjectId();
  const targetCatId = new mongoose.Types.ObjectId();

  const origStartSession = mongoose.startSession;
  const origTenantFindById = Tenant.findById;
  const origCatFind = categorydb.find;
  const origTestFind = testSchema.find;
  const origPanelFind = addPannel.find;
  const origPanelInsertMany = addPannel.insertMany;
  const origPanelUpdateMany = addPannel.updateMany;
  const origFormulaFind = Formula.find;

  let insertedPanels = [];

  try {
    // Simulate standalone MongoDB rejecting transactions -> must fall back cleanly
    mongoose.startSession = async () => ({
      startTransaction() {},
      async commitTransaction() {
        throw new Error("Transaction numbers are only allowed on a replica set member or mongos");
      },
      async abortTransaction() {},
      endSession() {},
    });

    Tenant.findById = () =>
      makeQueryMock({
        _id: targetAdminId,
        adminDetails: { userId: targetUserId },
      });

    categorydb.find = () =>
      makeQueryMock([
        { _id: targetCatId, orderId: 1, category: "Biochemistry", tenantId: targetAdminId },
      ]);

    testSchema.find = (filter) => {
      if (filter && filter._id && filter._id.$in) {
        // Fallback lookup for sourceTestId referenced by panel across batches
        return makeQueryMock([
          { _id: sourceTestId, Name: "SGOT", originalTestId: baseTestId },
        ]);
      }
      return makeQueryMock([
        { _id: targetTestId, Name: "SGOT", originalTestId: baseTestId },
      ]);
    };

    addPannel.find = (filter) => {
      if (filter && filter._id && filter._id.$in) {
        return makeQueryMock([
          {
            _id: sourcePanelId,
            name: "LFT",
            category: { _id: sourceCatId, category: "Biochemistry" },
            tests: [], // Intentionally empty to verify fallback remapping via sourceTestFallbackMap!
            testsId: [sourceTestId],
            sample_types: ["Serum"],
            createdByRole: "superAdmin",
            purchasedBy: [{ tenantId: sourceAdminId }],
          },
          // Duplicate name in same batch to verify intra-batch E11000 prevention
          {
            _id: new mongoose.Types.ObjectId(),
            name: "LFT",
            category: { _id: sourceCatId, category: "Biochemistry" },
            tests: [],
            testsId: [sourceTestId],
            sample_types: ["Serum"],
            createdByRole: "superAdmin",
          },
        ]);
      }
      return makeQueryMock([]);
    };

    addPannel.insertMany = async (docs) => {
      insertedPanels = docs;
      // Validate every copied panel against the real Mongoose schema!
      for (const d of docs) {
        const doc = new addPannel(d);
        await doc.validate();
      }
      return docs;
    };
    addPannel.updateMany = async () => ({ modifiedCount: 1 });
    Formula.find = () => makeQueryMock([]);

    const res = await invokeHandler(assignModelsToFranchisee, {
      user: { _id: new mongoose.Types.ObjectId(), role: "superAdmin" },
      body: {
        franchiseeId: targetAdminId.toString(),
        sourceAdminId: sourceAdminId.toString(),
        panelIds: [sourcePanelId.toString(), sourcePanelId.toString()],
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.success, true);
    assert.equal(res.payload.assignedCounts.panels, 1);
    assert.equal(insertedPanels.length, 1);

    const copied = insertedPanels[0];
    assert.ok(Array.isArray(copied.assignedPrices), "assignedPrices must be an array, not {}");
    assert.equal(copied.assignedPrices.length, 0);
    assert.equal(copied.purchasedBy.length, 0, "stale purchasedBy must be reset");
    assert.equal(String(copied.originalPanelId), sourcePanelId.toString());
    assert.equal(String(copied.category._id), targetCatId.toString(), "category should resolve by name to target's category");
    assert.equal(copied.testsId.length, 1, "panel.testsId must remap across batches even when panel.tests is empty");
    assert.equal(String(copied.testsId[0]), targetTestId.toString());
    assert.ok(res.payload.skippedCounts, "response should include skippedCounts alongside details.skippedDuplicates");
  } finally {
    mongoose.startSession = origStartSession;
    Tenant.findById = origTenantFindById;
    categorydb.find = origCatFind;
    testSchema.find = origTestFind;
    addPannel.find = origPanelFind;
    addPannel.insertMany = origPanelInsertMany;
    addPannel.updateMany = origPanelUpdateMany;
    Formula.find = origFormulaFind;
  }
});

await check("Headless Chromium verifies Test Analysis -> Admin Assignment navigation, catalog selection, and chunked copy without errors", async () => {
  const app = express();
  app.use(express.json());

  const adminAId = "64b100000000000000000001";
  const adminBId = "64b100000000000000000002";
  const assignRequests = [];

  app.get("/api/session", (req, res) => {
    res.json({
      authenticated: true,
      kind: "superAdmin",
      portalRole: "superAdmin",
      superAdmin: { _id: "sa1", username: "superadmin", role: "superAdmin" },
    });
  });

  app.get("/api/v1/user/get-tenants", (req, res) => {
    res.json({
      success: true,
      data: [
        {
          _id: adminAId,
          name: "Alpha Diagnostics",
          modelType: "1layer",
          status: "active",
          adminDetails: { username: "alpha_lab", userId: { _id: "u1", username: "alpha_lab" } },
        },
        {
          _id: adminBId,
          name: "Beta Pathology",
          modelType: "2layer",
          status: "active",
          adminDetails: { username: "beta_lab", userId: { _id: "u2", username: "beta_lab" } },
        },
      ],
    });
  });

  app.post("/api/v1/user/test-database", (req, res) => res.json([{ _id: "bt1", Name: "CBC", Price: 250 }]));
  app.post("/api/v1/user/all-pannels", (req, res) => res.json([{ _id: "bp1", name: "LFT", price: 550 }]));
  app.post("/api/v1/user/all-packages", (req, res) => res.json([{ _id: "bpk1", packageName: "Full Body", packageFee: "1200" }]));
  app.get("/api/v1/user/get-all-addons", (req, res) =>
    res.json({ success: true, unitIds: ["u_base_1"], sampleTypeIds: ["s_base_1"], categoryIds: ["c_base_1"] })
  );
  app.get("/api/v1/user/dashboard/stats", (req, res) =>
    res.json({ success: true, data: { totalClients: 2, totalTest: 1, activeModels: 2, totalRevenue: 0 } })
  );
  app.get("/api/v1/user/dashboard/recent-clients", (req, res) => res.json({ success: true, data: [] }));
  app.get("/api/v1/user/dashboard/top-franchisees", (req, res) => res.json({ success: true, data: [] }));
  app.get("/api/v1/user/dashboard/notifications", (req, res) => res.json({ success: true, data: [] }));

  let betaCopied = false;
  app.post("/api/v1/user/get-admin-assigned-models", (req, res) => {
    const { adminId } = req.body;
    if (adminId === adminAId) {
      return res.json({
        success: true,
        data: {
          tests: [
            { _id: "st1", Name: "CBC <Check>", Price: 300, createdByRole: "superAdmin", category: { category: "Hematology" } },
            { _id: "st2", Name: "HbA1c", Price: 450, createdByRole: "admin", category: { category: "Biochemistry" } },
          ],
          panels: [{ _id: "sp1", name: "Lipid Profile", price: 600, createdByRole: "superAdmin", testsId: ["st1"] }],
          packages: [{ _id: "spk1", packageName: "Preventive Care", packageFee: "1500", createdByRole: "superAdmin" }],
          categories: [{ _id: "c_src_1", category: "Hematology" }],
          units: [{ _id: "u_src_1", unit: "g/dL" }],
          sampleTypes: [{ _id: "s_src_1", Name: "Whole Blood" }],
        },
      });
    }
    return res.json({
      success: true,
      data: {
        tests: betaCopied
          ? [{ _id: "tt1", Name: "CBC <Check>", Price: 300, createdByRole: "superAdmin" }, { _id: "tt2", Name: "HbA1c", Price: 450, createdByRole: "admin" }]
          : [{ _id: "tt1", Name: "CBC <Check>", Price: 300, createdByRole: "superAdmin" }],
        panels: betaCopied ? [{ _id: "tp1", name: "Lipid Profile", price: 600, createdByRole: "superAdmin" }] : [],
        packages: betaCopied ? [{ _id: "tpk1", packageName: "Preventive Care", packageFee: "1500", createdByRole: "superAdmin" }] : [],
        categories: [],
        units: [],
        sampleTypes: [],
      },
    });
  });

  app.post("/api/v1/user/assign-models", (req, res) => {
    assignRequests.push(req.body);
    betaCopied = true;
    res.json({
      success: true,
      assignedCounts: {
        tests: Array.isArray(req.body.testIds) ? req.body.testIds.length : 0,
        panels: Array.isArray(req.body.panelIds) ? req.body.panelIds.length : 0,
        packages: Array.isArray(req.body.packageIds) ? req.body.packageIds.length : 0,
        categories: Array.isArray(req.body.categoryIds) ? req.body.categoryIds.length : 0,
        units: Array.isArray(req.body.unitIds) ? req.body.unitIds.length : 0,
        sampleTypes: Array.isArray(req.body.sampleTypeIds) ? req.body.sampleTypeIds.length : 0,
        formulas: 0,
      },
      skippedCounts: {},
    });
  });

  app.use("/superAdmin", express.static(path.join(repoRoot, "private")));
  app.use(express.static(path.join(repoRoot, "public")));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await puppeteer.launch(getPuppeteerLaunchOptions());
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const pageErrors = [];
    const failed404s = [];

    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("response", (resp) => {
      if (resp.status() >= 400 && !resp.url().includes("favicon")) {
        failed404s.push(`${resp.status()} ${resp.url()}`);
      }
    });

    await page.goto(`${baseUrl}/superAdmin/superAdmin.html?page=testAssign`, { waitUntil: "networkidle0" });

    // Verify Test Analysis committed into #main-content cleanly and click "Admin Assignment"
    const adminAssignLinkSel = '#main-content .spa-page-canvas[data-spa-page="testAssign"] [data-page="copyTestAssign"]';
    await page.waitForSelector(adminAssignLinkSel, { visible: true });
    await page.click(adminAssignLinkSel);
    await page.waitForSelector(`#main-content .spa-page-canvas[data-spa-page="copyTestAssign"] #sourceAdminSelect option[value="${adminAId}"]`);

    // Verify zero 404s or route error toasts
    const errorToastCount = await page.$$eval(".lf-route-toast", (els) => els.length);
    assert.equal(errorToastCount, 0, "Should not show route error toast on Admin Assignment click");
    assert.equal(failed404s.length, 0, `Unexpected HTTP >= 400 responses: ${failed404s.join(", ")}`);

    // Navigate away to Dashboard and back via sidebar "Admin Assignment" to test SPA re-entry
    await page.waitForSelector('.sidebar .menu-item[data-page="dashboard"]', { visible: true });
    await page.$eval('.sidebar .menu-item[data-page="dashboard"]', (el) => el.scrollIntoView({ block: "center" }));
    await page.click('.sidebar .menu-item[data-page="dashboard"]');
    await page.waitForSelector('#main-content .spa-page-canvas[data-spa-page="dashboard"]');
    await page.$eval('.sidebar .menu-item[data-page="copyTestAssign"]', (el) => el.scrollIntoView({ block: "center" }));
    await page.click('.sidebar .menu-item[data-page="copyTestAssign"]');
    await page.waitForSelector('#main-content .spa-page-canvas[data-spa-page="copyTestAssign"] #sourceAdminSelect');

    // Select Source and Target Admins
    await page.select("#main-content #sourceAdminSelect", adminAId);
    await page.waitForSelector("#main-content #sourceTestsList .aa-test-cb");
    await page.select("#main-content #targetAdminSelect", adminBId);
    await page.waitForFunction(() => document.querySelectorAll("#main-content #sourceTestsList .aa-tag--dup").length === 1);

    // Execute assignment
    await page.click("#main-content #copyModelsBtn");
    await page.waitForSelector("#main-content #copySuccess.is-visible");

    const successText = await page.$eval("#main-content #copySuccessBody", (el) => el.textContent);
    assert.ok(successText.includes("Assignment Complete"), `Expected completion summary, got: ${successText}`);
    assert.ok(assignRequests.some((r) => r.sourceAdminId === adminAId && r.franchiseeId === adminBId));
    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join("; ")}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

for (const line of results) {
  console.log(line);
}
if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
