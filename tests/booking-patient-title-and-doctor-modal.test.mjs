import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

import "../public/js/bookingPatientHelpers.js";
import { doctors } from "../src/models/doctor.model.js";
import { sanitizeDoctorFields } from "../src/utils/doctorPricing.js";
import { addDoctorsController } from "../src/controllers/doctors.controllers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const helpers = globalThis.LabflowBookingHelpers;

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

await check("Patient title catalog maps Male, Female, and Other salutations", () => {
  assert.ok(helpers, "LabflowBookingHelpers should attach to globalThis");

  assert.equal(helpers.getGenderForPatientTitle("Mr."), "Male");
  assert.equal(helpers.getGenderForPatientTitle("Master"), "Male");
  assert.equal(helpers.getGenderForPatientTitle("Shri"), "Male");
  assert.equal(helpers.getGenderForPatientTitle("Baby Boy"), "Male");

  assert.equal(helpers.getGenderForPatientTitle("Mrs."), "Female");
  assert.equal(helpers.getGenderForPatientTitle("Ms."), "Female");
  assert.equal(helpers.getGenderForPatientTitle("Miss"), "Female");
  assert.equal(helpers.getGenderForPatientTitle("Smt."), "Female");
  assert.equal(helpers.getGenderForPatientTitle("Kumari"), "Female");
  assert.equal(helpers.getGenderForPatientTitle("Baby Girl"), "Female");

  assert.equal(helpers.getGenderForPatientTitle("Mx."), "Other");
  assert.equal(helpers.getGenderForPatientTitle("Baby"), "Other");
  assert.equal(helpers.getGenderForPatientTitle("B/o"), "Other");
  assert.equal(helpers.getGenderForPatientTitle("Dr."), "Other");
  assert.equal(helpers.getGenderForPatientTitle("Prof."), "Other");
  assert.equal(helpers.getGenderForPatientTitle(""), "");
});

await check("combinePatientTitleAndName formats cleanly and avoids duplicate prefixes", () => {
  assert.equal(helpers.combinePatientTitleAndName("Mr.", "Rahul Sharma"), "Mr. Rahul Sharma");
  assert.equal(helpers.combinePatientTitleAndName("Mr.", "mr. Rahul Sharma"), "Mr. Rahul Sharma");
  assert.equal(helpers.combinePatientTitleAndName("Mrs.", "Mrs Sunita Devi"), "Mrs. Sunita Devi");
  assert.equal(helpers.combinePatientTitleAndName("", "  Amit   Verma "), "Amit Verma");
  assert.equal(helpers.combinePatientTitleAndName("Mr.", "   "), "");
});

await check("splitPatientTitleAndName extracts prefixes accurately on edit without false positives", () => {
  assert.deepEqual(helpers.splitPatientTitleAndName("Mrs. Sunita Devi"), {
    title: "Mrs.",
    name: "Sunita Devi",
  });
  assert.deepEqual(helpers.splitPatientTitleAndName("Baby Girl Ananya"), {
    title: "Baby Girl",
    name: "Ananya",
  });
  assert.deepEqual(helpers.splitPatientTitleAndName("Baby of Priya"), {
    title: "B/o",
    name: "Priya",
  });
  assert.deepEqual(helpers.splitPatientTitleAndName("Mr Rahul"), {
    title: "Mr.",
    name: "Rahul",
  });
  assert.deepEqual(helpers.splitPatientTitleAndName("Baby"), {
    title: "",
    name: "Baby",
  });
  assert.deepEqual(helpers.splitPatientTitleAndName("Amitabh"), {
    title: "",
    name: "Amitabh",
  });
});

await check("validateDoctorFormPayload requires only firstname and lastname", () => {
  assert.ok(helpers.validateDoctorFormPayload({ firstname: "", lastname: "Sharma" }));
  assert.ok(helpers.validateDoctorFormPayload({ firstname: "Rajesh", lastname: "" }));
  assert.equal(
    helpers.validateDoctorFormPayload({
      firstname: "Rajesh",
      lastname: "Sharma",
      specialization: "",
      gender: "",
      email: "",
      dob: "",
      address: "",
    }),
    null
  );
  assert.ok(
    helpers.validateDoctorFormPayload({
      firstname: "Rajesh",
      lastname: "Sharma",
      email: "invalid-email",
    })
  );
  assert.equal(
    helpers.validateDoctorFormPayload({
      firstname: "Rajesh",
      lastname: "Sharma",
      email: "dr.sharma@clinic.in",
    }),
    null
  );
});

await check("Doctor mongoose schema validates with only firstName and lastName", () => {
  const minimalDoc = new doctors({
    firstName: "Rajesh",
    lastName: "Sharma",
    tenantId: "507f1f77bcf86cd799439011",
    createdBy: "507f1f77bcf86cd799439012",
  });
  const err = minimalDoc.validateSync();
  assert.equal(err, undefined);
  assert.equal(minimalDoc.specialization, "");
  assert.equal(minimalDoc.gender, "other");

  const sanitized = sanitizeDoctorFields(minimalDoc);
  assert.equal(sanitized.specialization, "");
  assert.equal(sanitized.gender, "other");
});

await check("addDoctorsController creates doctor with only firstname and lastname", async () => {
  const originalFindOne = doctors.findOne;
  const originalCreate = doctors.create;

  try {
    // ensureSelfDoctorForUser finds existing complete self doctor
    doctors.findOne = async () => ({
      _id: "507f1f77bcf86cd799439099",
      isSystemDefault: true,
      displayName: "Self",
      firstName: "Self",
      lastName: "Doctor",
      specialization: "Walk-in / Default",
      DOB: new Date("2000-01-01T00:00:00.000Z"),
      gender: "other",
      remarks: "System default",
    });
    let capturedPayload = null;
    doctors.create = async (doc) => {
      capturedPayload = doc;
      return { ...doc, _id: "507f1f77bcf86cd799439088", toObject: () => ({ ...doc, _id: "507f1f77bcf86cd799439088" }) };
    };

    const req = {
      body: {
        firstname: "  Ananya ",
        lastname: " Verma ",
        specialization: "",
        gender: "",
        email: "",
        dob: "",
        address: "",
      },
      user: {
        _id: "507f1f77bcf86cd799439012",
        role: "admin",
        tenantId: "507f1f77bcf86cd799439011",
      },
    };

    let jsonResponse = null;
    await new Promise((resolve, reject) => {
      const res = {
        json: (payload) => {
          jsonResponse = payload;
          resolve();
          return res;
        },
      };
      addDoctorsController(req, res, (err) => {
        if (err) reject(err);
      });
    });

    assert.equal(capturedPayload.firstName, "Ananya");
    assert.equal(capturedPayload.lastName, "Verma");
    assert.equal(capturedPayload.specialization, "");
    assert.equal(capturedPayload.gender, "other");
    assert.equal(jsonResponse.statusCode, 200);
    assert.equal(jsonResponse.data.displayName, "Ananya Verma");

    // Also confirm missing firstname or lastname still fails with 400
    await assert.rejects(
      new Promise((resolve, reject) => {
        addDoctorsController(
          { body: { firstname: "OnlyFirst", lastname: "" }, user: req.user },
          { json: resolve },
          (err) => (err ? reject(err) : resolve())
        );
      }),
      /first name and last name are required/i
    );
  } finally {
    doctors.findOne = originalFindOne;
    doctors.create = originalCreate;
  }
});

await check("Booking HTML views include patient-title, Male/Female/Other gender, and redesigned Add Doctor modal", () => {
  const pages = [
    "private/pages/pages/new_booking.html",
    "private/pages/pages/editbooking.html",
    "private/pages/pages/new_booking_copy.html",
  ];

  for (const relPath of pages) {
    const html = fs.readFileSync(path.join(repoRoot, relPath), "utf8");
    const $ = cheerio.load(html);

    assert.ok($("#patient-title").length === 1, `${relPath} missing #patient-title`);
    assert.ok($("#patient-name").length === 1, `${relPath} missing #patient-name`);
    assert.equal($("#patient-title optgroup[label*='Most Used']").length, 1, `${relPath} missing Most Used optgroup`);
    assert.equal($("#patient-title option[value='']").text().trim(), "No Title", `${relPath} missing No Title fallback option`);

    if (relPath.endsWith("editbooking.html")) {
      assert.equal($("#patient-title option[selected]").length, 0, `${relPath} should not hardcode pre-selected title before hydration`);
    } else {
      assert.equal($("#patient-title option[selected]").attr("value"), "Mr.", `${relPath} should pre-select Mr. initially`);
    }

    const genderValues = $("#patient-gender option").map((_, el) => $(el).attr("value")).get();
    assert.deepEqual(genderValues, ["Male", "Female", "Other"], `${relPath} gender options mismatch`);

    const titleValues = $("#patient-title option[data-gender]").map((_, el) => $(el).attr("value")).get();
    assert.ok(titleValues.includes("Mr.") && titleValues.includes("Mrs.") && titleValues.includes("Mx."), `${relPath} missing expected title options`);

    assert.ok($("#modal.lf-doc-modal").length === 1, `${relPath} missing redesigned #modal.lf-doc-modal`);
    assert.ok($("#doctorModalFeedback").length === 1, `${relPath} missing #doctorModalFeedback`);
    assert.equal($("#modal .lf-doc-body .lf-doc-req").length, 2, `${relPath} should mark only First & Last Name with * in modal body`);
  }
});

await check("Adaptive patient title tracker defaults to Mr., promotes frequent titles, and shifts on future usage", () => {
  const store = new Map();
  const mockStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => store.set(key, String(val)),
  };
  const opts = { storage: mockStorage, storageKey: "test_patient_title_usage" };

  assert.equal(helpers.getPreferredDefaultPatientTitle(opts), "Mr.");

  // One Mrs. ties with initial Mr. seed (1 vs 1) -> keep Mr. stable
  let summary = helpers.recordPatientTitleUsage("Mrs.", opts);
  assert.equal(summary.defaultTitle, "Mr.");

  // Second Mrs. makes Mrs. strictly more frequent (2 > 1) -> auto-promote Mrs.
  summary = helpers.recordPatientTitleUsage("Mrs.", opts);
  assert.equal(summary.defaultTitle, "Mrs.");
  assert.equal(summary.rankedTitles[0], "Mrs.");

  // Fill rolling window with Mrs. so it strongly dominates
  for (let i = 0; i < 28; i += 1) {
    helpers.recordPatientTitleUsage("Mrs.", opts);
  }
  assert.equal(helpers.getPreferredDefaultPatientTitle(opts), "Mrs.");

  // Future demographic shift: Master used repeatedly overtakes Mrs. within the 30-item rolling window
  for (let i = 0; i < 16; i += 1) {
    summary = helpers.recordPatientTitleUsage("Master", opts);
  }
  assert.equal(summary.defaultTitle, "Master");
  assert.equal(summary.rankedTitles[0], "Master");
  assert.equal(helpers.getPreferredDefaultPatientTitle(opts), "Master");

  // Recording empty No Title ("") must not disrupt preferred salutation
  summary = helpers.recordPatientTitleUsage("", opts);
  assert.equal(summary.defaultTitle, "Master");
});

console.log(results.join("\n"));
if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
console.log("\nAll booking patient title & doctor modal checks passed");
