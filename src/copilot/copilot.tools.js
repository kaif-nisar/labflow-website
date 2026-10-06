import mongoose from "mongoose";
import { categorydb } from "../models/category.model.js";
import { testSchema } from "../models/newTest.model.js";
import { addPannel } from "../models/AddPannel.model.js";
import { Package } from "../models/addPackage.model.js";
import { newBooking } from "../models/NewBooking.model.js";
import { acceptedBarcode } from "../models/samples.model.js";
import { Ledger } from "../models/ledger.model.js";
import { doctors } from "../models/doctor.model.js";
import { User } from "../models/user.model.js";
import { sampleSchema } from "../models/sampletype.model.js";
import { unitdb } from "../models/category.model.js";
import { getNextBookingCodeForScope } from "../utils/bookingCode.js";

/**
 * Helper to get clean tenant & user scope
 */
export function getScopeContext(req) {
  const role = req.user?.role || "admin";
  let userId;
  let tenantId = null;

  if (role === "staff") {
    userId = req.user.parentUser;
    tenantId = req.user.tenantId?._id || req.user.tenantId;
  } else if (role === "superAdmin") {
    userId = req.user._id;
    tenantId = null;
  } else {
    userId = req.user._id;
    tenantId = req.user.tenantId?._id || req.user.tenantId;
  }

  return { userId, tenantId, role };
}

/**
 * Escape regex special characters so strings like "SGOT (AST)" or "A:G" don't break queries
 */
export function escapeRegex(string = "") {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build exact case-insensitive regex safely escaped
 */
export function makeExactCaseInsensitiveRegex(string = "") {
  return new RegExp(`^${escapeRegex(String(string).trim())}$`, "i");
}

/**
 * Comprehensive Pathology Knowledge Base for automatic test recognition, alias resolution,
 * sample-type alignment, and standard clinical parameters/ranges.
 */
export const STANDARD_PATHOLOGY_TESTS = {
  // LFT sub-tests (Sample: Serum)
  "bilirubin total": {
    name: "Bilirubin (Total)",
    shortName: "TBIL",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mg/dL",
    normalValue: { lowerValue: "0.2", upperValue: "1.2" },
    aliases: ["total bilirubin", "t. bilirubin", "bilirubin total", "serum bilirubin total", "t-bil", "tbil"]
  },
  "bilirubin direct": {
    name: "Bilirubin (Direct)",
    shortName: "DBIL",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mg/dL",
    normalValue: { lowerValue: "0.0", upperValue: "0.3" },
    aliases: ["direct bilirubin", "d. bilirubin", "bilirubin direct", "conjugated bilirubin", "d-bil", "dbil"]
  },
  "bilirubin indirect": {
    name: "Bilirubin (Indirect)",
    shortName: "IBIL",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mg/dL",
    normalValue: { lowerValue: "0.2", upperValue: "0.8" },
    aliases: ["indirect bilirubin", "unconjugated bilirubin", "i-bil", "ibil"]
  },
  "sgot": {
    name: "SGOT (AST)",
    shortName: "SGOT",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "U/L",
    normalValue: { lowerValue: "5", upperValue: "40" },
    aliases: ["ast", "sgot (ast)", "aspartate aminotransferase", "sgot/ast", "ast (sgot)"]
  },
  "sgpt": {
    name: "SGPT (ALT)",
    shortName: "SGPT",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "U/L",
    normalValue: { lowerValue: "5", upperValue: "45" },
    aliases: ["alt", "sgpt (alt)", "alanine aminotransferase", "sgpt/alt", "alt (sgpt)"]
  },
  "alkaline phosphatase": {
    name: "Alkaline Phosphatase (ALP)",
    shortName: "ALP",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "U/L",
    normalValue: { lowerValue: "30", upperValue: "120" },
    aliases: ["alp", "alkaline phosphatase (alp)", "alk phos", "serum alkaline phosphatase"]
  },
  "total protein": {
    name: "Protein (Total)",
    shortName: "TP",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "g/dL",
    normalValue: { lowerValue: "6.0", upperValue: "8.3" },
    aliases: ["protein (total)", "protein total", "serum total protein", "total protein", "total proteins"]
  },
  "albumin": {
    name: "Albumin (Serum)",
    shortName: "ALB",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "g/dL",
    normalValue: { lowerValue: "3.5", upperValue: "5.2" },
    aliases: ["serum albumin", "albumin (serum)", "alb"]
  },
  "globulin": {
    name: "Globulin (Serum)",
    shortName: "GLOB",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "g/dL",
    normalValue: { lowerValue: "2.0", upperValue: "3.5" },
    aliases: ["serum globulin", "globulin (serum)", "glob"]
  },
  "a:g ratio": {
    name: "A:G Ratio",
    shortName: "A/G",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "Ratio",
    normalValue: { lowerValue: "1.0", upperValue: "2.2" },
    aliases: ["a/g ratio", "ag ratio", "albumin globulin ratio", "albumin:globulin ratio", "a/g", "a:g"]
  },

  // KFT / RFT sub-tests (Sample: Serum)
  "blood urea": {
    name: "Blood Urea",
    shortName: "UREA",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mg/dL",
    normalValue: { lowerValue: "15", upperValue: "45" },
    aliases: ["urea", "serum urea", "blood urea nitrogen", "bun", "s. urea"]
  },
  "serum creatinine": {
    name: "Serum Creatinine",
    shortName: "CREAT",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mg/dL",
    normalValue: { lowerValue: "0.6", upperValue: "1.4" },
    aliases: ["creatinine", "creatinine (serum)", "s. creatinine", "sr creatinine"]
  },
  "uric acid": {
    name: "Serum Uric Acid",
    shortName: "URIC",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mg/dL",
    normalValue: { lowerValue: "3.5", upperValue: "7.2" },
    aliases: ["uric acid", "serum uric acid", "s. uric acid"]
  },
  "serum calcium": {
    name: "Serum Calcium",
    shortName: "CA",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mg/dL",
    normalValue: { lowerValue: "8.5", upperValue: "10.5" },
    aliases: ["calcium", "serum calcium", "s. calcium", "total calcium"]
  },

  // Lipid Profile sub-tests (Sample: Serum)
  "total cholesterol": {
    name: "Total Cholesterol",
    shortName: "CHOL",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mg/dL",
    normalValue: { lowerValue: "125", upperValue: "200" },
    aliases: ["cholesterol", "cholesterol (total)", "cholesterol total", "serum cholesterol", "sr. cholesterol"]
  },
  "triglycerides": {
    name: "Triglycerides",
    shortName: "TGL",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mg/dL",
    normalValue: { lowerValue: "50", upperValue: "150" },
    aliases: ["tgl", "serum triglycerides", "triglyceride", "s. triglycerides"]
  },
  "hdl cholesterol": {
    name: "HDL Cholesterol",
    shortName: "HDL",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mg/dL",
    normalValue: { lowerValue: "40", upperValue: "60" },
    aliases: ["hdl", "high density lipoprotein", "hdl-c", "hdl cholesterol"]
  },
  "ldl cholesterol": {
    name: "LDL Cholesterol",
    shortName: "LDL",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mg/dL",
    normalValue: { lowerValue: "60", upperValue: "100" },
    aliases: ["ldl", "low density lipoprotein", "ldl-c", "ldl cholesterol"]
  },
  "vldl cholesterol": {
    name: "VLDL Cholesterol",
    shortName: "VLDL",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mg/dL",
    normalValue: { lowerValue: "10", upperValue: "30" },
    aliases: ["vldl", "vldl-c", "very low density lipoprotein"]
  },

  // Thyroid Profile sub-tests (Sample: Serum)
  "total t3": {
    name: "T3 (Total)",
    shortName: "T3",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "ng/dL",
    normalValue: { lowerValue: "60", upperValue: "200" },
    aliases: ["t3", "triiodothyronine", "total t3", "t3 (total)"]
  },
  "total t4": {
    name: "T4 (Total)",
    shortName: "T4",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "µg/dL",
    normalValue: { lowerValue: "4.5", upperValue: "12.0" },
    aliases: ["t4", "thyroxine", "total t4", "t4 (total)"]
  },
  "tsh": {
    name: "TSH (Ultrasensitive)",
    shortName: "TSH",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "µIU/mL",
    normalValue: { lowerValue: "0.35", upperValue: "4.94" },
    aliases: ["tsh", "thyroid stimulating hormone", "tsh (3rd gen)", "tsh ultrasensitive", "tsh 3rd generation"]
  },

  // Electrolytes (Sample: Serum)
  "sodium": {
    name: "Serum Sodium (Na+)",
    shortName: "NA",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mmol/L",
    normalValue: { lowerValue: "135", upperValue: "145" },
    aliases: ["sodium", "serum sodium", "na+", "na", "s. sodium"]
  },
  "potassium": {
    name: "Serum Potassium (K+)",
    shortName: "K",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mmol/L",
    normalValue: { lowerValue: "3.5", upperValue: "5.1" },
    aliases: ["potassium", "serum potassium", "k+", "k", "s. potassium"]
  },
  "chloride": {
    name: "Serum Chloride (Cl-)",
    shortName: "CL",
    category: "Biochemistry",
    sampleType: "Serum",
    unit: "mmol/L",
    normalValue: { lowerValue: "96", upperValue: "106" },
    aliases: ["chloride", "serum chloride", "cl-", "cl", "s. chloride"]
  },

  // Blood Sugars (Sample: Fluoride Plasma)
  "fasting blood sugar": {
    name: "Glucose Fasting (FBS)",
    shortName: "FBS",
    category: "Biochemistry",
    sampleType: "Fluoride Plasma",
    unit: "mg/dL",
    normalValue: { lowerValue: "70", upperValue: "100" },
    aliases: ["fbs", "glucose fasting", "fasting blood sugar", "blood sugar fasting", "glucose (f)"]
  },
  "post prandial blood sugar": {
    name: "Glucose PP (PPBS)",
    shortName: "PPBS",
    category: "Biochemistry",
    sampleType: "Fluoride Plasma",
    unit: "mg/dL",
    normalValue: { lowerValue: "80", upperValue: "140" },
    aliases: ["ppbs", "glucose pp", "post prandial blood sugar", "blood sugar pp", "glucose (pp)"]
  },
  "random blood sugar": {
    name: "Glucose Random (RBS)",
    shortName: "RBS",
    category: "Biochemistry",
    sampleType: "Fluoride Plasma",
    unit: "mg/dL",
    normalValue: { lowerValue: "70", upperValue: "140" },
    aliases: ["rbs", "glucose random", "random blood sugar", "blood sugar random", "glucose (r)"]
  },

  // Glycated Hemoglobin (Sample: EDTA Whole Blood)
  "hba1c": {
    name: "HbA1c (Glycated Hemoglobin)",
    shortName: "HBA1C",
    category: "Hematology",
    sampleType: "EDTA Whole Blood",
    unit: "%",
    normalValue: { lowerValue: "4.0", upperValue: "5.6" },
    aliases: ["hba1c", "glycated hemoglobin", "hemoglobin a1c", "glycohemoglobin"]
  }
};

/**
 * Standard pathology profile/panel definitions with strictly uniform sample types
 */
export const STANDARD_PATHOLOGY_PANELS = {
  "lft": {
    name: "Liver Function Test (LFT)",
    shortName: "LFT",
    category: "Biochemistry",
    sampleType: "Serum",
    aliases: ["lft", "liver function test", "liver profile", "hepatic profile", "liver panel"],
    testNames: [
      "Total Bilirubin",
      "Direct Bilirubin",
      "Indirect Bilirubin",
      "SGOT (AST)",
      "SGPT (ALT)",
      "Alkaline Phosphatase (ALP)",
      "Total Protein",
      "Albumin",
      "Globulin",
      "A:G Ratio"
    ]
  },
  "kft": {
    name: "Kidney Function Test (KFT)",
    shortName: "KFT",
    category: "Biochemistry",
    sampleType: "Serum",
    aliases: ["kft", "kidney function test", "renal function test", "rft", "renal profile", "kidney profile", "renal panel"],
    testNames: [
      "Blood Urea",
      "BUN",
      "Serum Creatinine",
      "Uric Acid",
      "Serum Calcium",
      "Serum Phosphorus",
      "Serum Sodium",
      "Serum Potassium",
      "Serum Chloride"
    ]
  },
  "rft": {
    name: "Renal Function Test (RFT)",
    shortName: "RFT",
    category: "Biochemistry",
    sampleType: "Serum",
    aliases: ["rft", "renal function test", "kidney function test", "kft"],
    testNames: [
      "Blood Urea",
      "BUN",
      "Serum Creatinine",
      "Uric Acid",
      "Serum Calcium",
      "Serum Phosphorus",
      "Serum Sodium",
      "Serum Potassium",
      "Serum Chloride"
    ]
  },
  "lipid": {
    name: "Lipid Profile",
    shortName: "LIPID",
    category: "Biochemistry",
    sampleType: "Serum",
    aliases: ["lipid profile", "lipid panel", "cholesterol profile", "lipid test"],
    testNames: [
      "Total Cholesterol",
      "Triglycerides",
      "HDL Cholesterol",
      "LDL Cholesterol",
      "VLDL Cholesterol",
      "Cholesterol/HDL Ratio"
    ]
  },
  "thyroid": {
    name: "Thyroid Profile (TFT)",
    shortName: "TFT",
    category: "Biochemistry",
    sampleType: "Serum",
    aliases: ["thyroid profile", "tft", "thyroid panel", "thyroid function test", "t3 t4 tsh"],
    testNames: [
      "T3 (Total Triiodothyronine)",
      "T4 (Total Thyroxine)",
      "TSH (Ultrasensitive)"
    ]
  },
  "electrolytes": {
    name: "Serum Electrolytes",
    shortName: "ELECTRO",
    category: "Biochemistry",
    sampleType: "Serum",
    aliases: ["serum electrolytes", "electrolytes panel", "electrolyte profile", "na k cl"],
    testNames: [
      "Serum Sodium",
      "Serum Potassium",
      "Serum Chloride"
    ]
  },
  "cbc": {
    name: "Complete Blood Count (CBC)",
    shortName: "CBC",
    category: "Hematology",
    sampleType: "EDTA Whole Blood",
    aliases: ["complete blood count", "cbc", "hemogram", "complete hemogram", "cbc with esr"],
    testNames: [
      "Hemoglobin",
      "Total Leukocyte Count (TLC)",
      "Platelet Count",
      "RBC Count",
      "PCV / Hematocrit",
      "MCV",
      "MCH",
      "MCHC",
      "RDW-CV",
      "Neutrophils",
      "Lymphocytes",
      "Monocytes",
      "Eosinophils",
      "Basophils"
    ]
  },
  "urine": {
    name: "Urine Routine & Microscopic Examination",
    shortName: "URINE-RE",
    category: "Clinical Pathology",
    sampleType: "Urine",
    aliases: ["urine routine", "urine r/e", "urine examination", "urine analysis", "urinalysis"],
    testNames: [
      "Urine Colour",
      "Urine Appearance",
      "Urine Specific Gravity",
      "Urine pH",
      "Urine Protein / Albumin",
      "Urine Glucose / Sugar",
      "Urine Ketone",
      "Urine Pus Cells / WBCs",
      "Urine Red Blood Cells (RBCs)",
      "Urine Epithelial Cells"
    ]
  }
};

/**
 * Return standard test definition template for auto-creating clinically accurate tests
 */
export function getStandardTestDefinition(candidateName, preferredSampleType = "Serum") {
  const clean = String(candidateName || "").trim();
  const lower = clean.toLowerCase();

  // Search in dictionary
  for (const [key, def] of Object.entries(STANDARD_PATHOLOGY_TESTS)) {
    const allMatches = [key, def.name.toLowerCase(), def.shortName.toLowerCase(), ...(def.aliases || []).map(a => a.toLowerCase())];
    if (allMatches.includes(lower) || allMatches.some(m => lower.includes(m) || m.includes(lower))) {
      return {
        Name: def.name,
        Short_name: def.shortName,
        categoryName: def.category,
        sampleType: preferredSampleType || def.sampleType,
        Price: 150,
        final_price: 150,
        parameters: [
          {
            order: 1,
            Para_name: def.name,
            unit: def.unit,
            defaultresult: "",
            ValueType: "Numeric",
            NormalValue: [
              {
                gender: "Any",
                minAge: "0",
                minAgeUnit: "Years",
                maxAge: "120",
                maxAgeUnit: "Years",
                lowerValue: def.normalValue.lowerValue,
                upperValue: def.normalValue.upperValue
              }
            ]
          }
        ]
      };
    }
  }

  // Fallback template
  return {
    Name: clean,
    Short_name: clean.slice(0, 8).toUpperCase(),
    categoryName: "General",
    sampleType: preferredSampleType || "Serum",
    Price: 150,
    final_price: 150,
    parameters: [
      {
        order: 1,
        Para_name: clean,
        unit: "",
        defaultresult: "",
        ValueType: "Numeric",
        NormalValue: [
          {
            gender: "Any",
            minAge: "0",
            minAgeUnit: "Years",
            maxAge: "120",
            maxAgeUnit: "Years",
            lowerValue: "",
            upperValue: ""
          }
        ]
      }
    ]
  };
}

/**
 * Intelligent sub-test lookup: checks literal match, escaped regex, parentheses parts,
 * clinical aliases, and filters by expected sample type when provided.
 */
export async function findExistingSubTest(candidateName, targetTenantId, targetUserId, expectedSampleType = null) {
  if (!candidateName || typeof candidateName !== "string") return null;
  const clean = candidateName.trim();
  const lower = clean.toLowerCase();
  const scope = targetTenantId ? { tenantId: targetTenantId } : { createdBy: targetUserId };

  const matchesSampleType = (doc) => {
    if (!expectedSampleType) return true;
    const docSt = String(doc.sampleType || "").trim().toLowerCase();
    const expSt = String(expectedSampleType || "").trim().toLowerCase();
    return docSt === expSt;
  };

  // 1. Literal exact match
  let docs = await testSchema.find({ Name: clean, ...scope });
  let matched = docs.find(matchesSampleType);
  if (matched) return matched;
  if (!expectedSampleType && docs.length > 0) return docs[0];

  // 2. Case-insensitive exact regex match (safely escaped)
  docs = await testSchema.find({ Name: makeExactCaseInsensitiveRegex(clean), ...scope });
  matched = docs.find(matchesSampleType);
  if (matched) return matched;
  if (!expectedSampleType && docs.length > 0) return docs[0];

  // 3. Short_name exact match
  docs = await testSchema.find({ Short_name: makeExactCaseInsensitiveRegex(clean), ...scope });
  matched = docs.find(matchesSampleType);
  if (matched) return matched;
  if (!expectedSampleType && docs.length > 0) return docs[0];

  // 4. Clinical aliases lookup from STANDARD_PATHOLOGY_TESTS
  const candidateAliases = new Set();
  candidateAliases.add(lower);

  for (const [key, testDef] of Object.entries(STANDARD_PATHOLOGY_TESTS)) {
    const allNames = [key, testDef.name.toLowerCase(), testDef.shortName.toLowerCase(), ...(testDef.aliases || []).map(a => a.toLowerCase())];
    if (allNames.some(n => n === lower || lower.includes(n) || n.includes(lower))) {
      allNames.forEach(n => candidateAliases.add(n));
      candidateAliases.add(testDef.name.toLowerCase());
      candidateAliases.add(testDef.shortName.toLowerCase());
    }
  }

  // Also extract parentheses parts: e.g. "SGOT (AST)" -> "SGOT", "AST"
  const parenthesesMatch = clean.match(/^([^(]+)\s*\(([^)]+)\)$/);
  if (parenthesesMatch) {
    candidateAliases.add(parenthesesMatch[1].trim().toLowerCase());
    candidateAliases.add(parenthesesMatch[2].trim().toLowerCase());
  }

  const aliasRegexes = Array.from(candidateAliases).filter(Boolean).map(a => makeExactCaseInsensitiveRegex(a));
  if (aliasRegexes.length > 0) {
    docs = await testSchema.find({
      $or: [
        { Name: { $in: aliasRegexes } },
        { Short_name: { $in: aliasRegexes } }
      ],
      ...scope
    });
    matched = docs.find(matchesSampleType);
    if (matched) return matched;
    if (!expectedSampleType && docs.length > 0) return docs[0];
  }

  // 5. Prefix with parentheses: e.g. clean is "SGOT", in DB is "SGOT (AST)" or "SGOT/AST"
  docs = await testSchema.find({
    Name: new RegExp(`^${escapeRegex(clean)}[\\s\\(/]`, "i"),
    ...scope
  });
  matched = docs.find(matchesSampleType);
  if (matched) return matched;
  if (!expectedSampleType && docs.length > 0) return docs[0];

  return null;
}

export function buildScopedQuery(scope, condition) {
  if (!scope || Object.keys(scope).length === 0) return condition || {};
  if (!condition || Object.keys(condition).length === 0) return scope;
  return { $and: [scope, condition] };
}

export const CLINICAL_PANEL_KEYWORD_GROUPS = {
  kft: ["kidney", "renal", "kft", "rft"],
  lft: ["liver", "hepatic", "lft"],
  lipid: ["lipid", "cholesterol"],
  thyroid: ["thyroid", "tft", "t3", "t4", "tsh"],
  cbc: ["cbc", "cbp", "hemogram", "blood count", "blood picture"],
  electrolytes: ["electrolyte", "electrolytes", "serum electrolytes"],
  urine: ["urine", "urinalysis", "cue"]
};

/**
 * Intelligent Panel lookup: checks literal match, case-insensitive match,
 * parentheses parts, multi-word ordered/all-words match, clinical keyword groups,
 * clinical aliases, and single distinctive words.
 */
export async function findExistingPanel(candidateName, targetTenantId, targetUserId, { exactOnly = false } = {}) {
  if (!candidateName || typeof candidateName !== "string") return null;
  const clean = candidateName.trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();

  const scope = targetTenantId
    ? { $or: [{ tenantId: targetTenantId }, { createdBy: targetUserId }] }
    : (targetUserId ? { createdBy: targetUserId } : {});

  // 1. Literal exact match
  let doc = await addPannel.findOne(buildScopedQuery(scope, { name: clean }));
  if (doc) return doc;

  // 2. Case-insensitive exact regex match
  doc = await addPannel.findOne(buildScopedQuery(scope, { name: makeExactCaseInsensitiveRegex(clean) }));
  if (doc) return doc;

  // 3. Parentheses parts match: e.g. "LFT (Liver Function Test)" -> "LFT" or "Liver Function Test"
  const parenthesesMatch = clean.match(/^([^(]+)\s*\(([^)]+)\)$/);
  if (parenthesesMatch) {
    const part1 = parenthesesMatch[1].trim();
    const part2 = parenthesesMatch[2].trim();
    doc = await addPannel.findOne(buildScopedQuery(scope, {
      $or: [
        { name: makeExactCaseInsensitiveRegex(part1) },
        { name: makeExactCaseInsensitiveRegex(part2) }
      ]
    }));
    if (doc) return doc;
  }

  // If exact match only requested (e.g. duplicate check on create), stop here
  if (exactOnly) return null;

  // 4. Multi-word ordered / all-words regex (e.g. "Kidney Profile" -> "Kidney Function Profile")
  const words = clean.split(/\s+/).filter(w => w.length > 2 && !["the", "and", "for"].includes(w.toLowerCase()));
  if (words.length > 1) {
    // Check ordered words: e.g. "kidney.*profile"
    doc = await addPannel.findOne(buildScopedQuery(scope, {
      name: new RegExp(words.map(escapeRegex).join(".*"), "i")
    }));
    if (doc) return doc;

    // Check all words present in any order
    doc = await addPannel.findOne(buildScopedQuery(scope, {
      $and: words.map(w => ({ name: new RegExp(escapeRegex(w), "i") }))
    }));
    if (doc) return doc;
  }

  // 5. Clinical keyword groups matching (e.g. Kidney/Renal/KFT/RFT)
  for (const [groupKey, keywords] of Object.entries(CLINICAL_PANEL_KEYWORD_GROUPS)) {
    if (keywords.some(kw => lower === kw || lower.includes(kw))) {
      const regexConditions = keywords.map(kw => ({
        name: new RegExp(`\\b${escapeRegex(kw)}\\b`, "i")
      }));
      doc = await addPannel.findOne(buildScopedQuery(scope, {
        $or: regexConditions
      }));
      if (doc) return doc;
    }
  }

  // 6. Clinical aliases lookup from STANDARD_PATHOLOGY_PANELS
  for (const [key, pDef] of Object.entries(STANDARD_PATHOLOGY_PANELS)) {
    const allAliases = [key, pDef.name.toLowerCase(), ...(pDef.aliases || []).map(a => a.toLowerCase())];
    if (allAliases.some(a => a === lower || lower.includes(a) || a.includes(lower))) {
      doc = await addPannel.findOne(buildScopedQuery(scope, {
        $or: [
          { name: makeExactCaseInsensitiveRegex(pDef.name) },
          { name: { $in: allAliases.map(a => makeExactCaseInsensitiveRegex(a)) } }
        ]
      }));
      if (doc) return doc;
    }
  }

  // 7. Significant single word (e.g. "Kidney" when user searched "Kidney Panel")
  const distinctiveWords = words.filter(w => !["test", "tests", "panel", "profile"].includes(w.toLowerCase()));
  for (const dw of distinctiveWords) {
    doc = await addPannel.findOne(buildScopedQuery(scope, {
      name: new RegExp(`\\b${escapeRegex(dw)}\\b`, "i")
    }));
    if (doc) return doc;
  }

  // 8. Starts with clean name prefix (e.g. "Lipid" -> "Lipid Profile")
  doc = await addPannel.findOne(buildScopedQuery(scope, {
    name: new RegExp(`^${escapeRegex(clean)}`, "i")
  }));
  if (doc) return doc;

  // 9. Substring contains
  doc = await addPannel.findOne(buildScopedQuery(scope, {
    name: new RegExp(escapeRegex(clean), "i")
  }));
  if (doc) return doc;

  return null;
}

/**
 * Check if category exists or automatically create it with valid orderId
 */
export async function checkOrCreateCategory({ categoryName, tenantId, userId, role }) {
  if (!categoryName) categoryName = "General";
  const trimmed = categoryName.trim();
  const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
  const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;

  // Search existing category for tenant or createdBy
  const query = {
    category: makeExactCaseInsensitiveRegex(trimmed),
  };
  if (targetTenantId) {
    query.$or = [{ tenantId: targetTenantId }, { tenantId: null }];
  } else if (targetUserId) {
    query.createdBy = targetUserId;
  }

  let catDoc = await categorydb.findOne(query);
  if (catDoc) {
    if (!catDoc.orderId) {
      catDoc.orderId = 1;
      await catDoc.save().catch(() => {});
    }
    return {
      _id: catDoc._id,
      category: catDoc.category,
      orderId: catDoc.orderId || 1,
      tenantId: catDoc.tenantId
    };
  }

  // Create new category
  const lastCat = await categorydb
    .findOne(targetTenantId ? { tenantId: targetTenantId } : { createdBy: targetUserId })
    .sort({ orderId: -1 })
    .select("orderId");

  const nextOrder = lastCat?.orderId ? lastCat.orderId + 1 : 1;

  try {
    catDoc = await categorydb.create({
      orderId: nextOrder,
      category: trimmed,
      tenantId: targetTenantId,
      createdBy: targetUserId,
      isBaseCategory: role === "superAdmin",
      createdByRole: role === "superAdmin" ? "superAdmin" : "admin",
      purchasedFromBaseCategory: false,
      originalCategoryId: null
    });
  } catch (err) {
    if (err.code === 11000 || String(err.message).includes("E11000")) {
      catDoc = await categorydb.findOne(query);
    } else {
      throw err;
    }
  }

  return {
    _id: catDoc._id,
    category: catDoc.category,
    orderId: catDoc.orderId || nextOrder,
    tenantId: catDoc.tenantId
  };
}

/**
 * Check if sample type exists in sampleSchema or automatically register it
 */
export async function checkOrCreateSampleType({ sampleTypeName, tenantId, userId, role }) {
  const trimmed = (sampleTypeName || "Serum").trim();
  if (!trimmed) return "Serum";
  const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
  const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;

  const query = {
    Name: makeExactCaseInsensitiveRegex(trimmed),
  };
  if (targetTenantId) {
    query.$or = [{ tenantId: targetTenantId }, { tenantId: null }];
  }

  let sampleDoc = await sampleSchema.findOne(query);
  if (!sampleDoc) {
    sampleDoc = await sampleSchema.create({
      Name: trimmed,
      tenantId: targetTenantId,
      createdBy: targetUserId,
      createdByRole: role === "superAdmin" ? "superAdmin" : "admin",
      isBaseSample: role === "superAdmin",
      purchasedFromBaseSample: false
    }).catch(async (err) => {
      if (err.code === 11000 || String(err.message).includes("E11000")) {
        return await sampleSchema.findOne(query);
      }
      return null;
    });
  }

  return sampleDoc?.Name || trimmed;
}

/**
 * Check if unit exists in unitdb or automatically register it
 */
export async function checkOrCreateUnit({ unitName, tenantId, userId, role }) {
  const trimmed = (unitName || "").trim();
  if (!trimmed) return "";
  const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
  const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;

  const query = {
    unit: makeExactCaseInsensitiveRegex(trimmed),
  };
  if (targetTenantId) {
    query.$or = [{ tenantId: targetTenantId }, { tenantId: null }];
  }

  let unitDoc = await unitdb.findOne(query);
  if (!unitDoc) {
    unitDoc = await unitdb.create({
      unit: trimmed,
      tenantId: targetTenantId,
      createdBy: targetUserId,
      createdByRole: role === "superAdmin" ? "superAdmin" : "admin"
    }).catch(async (err) => {
      if (err.code === 11000 || String(err.message).includes("E11000")) {
        return await unitdb.findOne(query);
      }
      return null;
    });
  }

  return unitDoc?.unit || trimmed;
}

/**
 * Create a new Test document with strict LabFlow schema parity
 */
export async function executeCreateTest({ testData, tenantId, userId, role }) {
  const {
    Name,
    Short_name,
    categoryName,
    Price,
    final_price,
    tat,
    sampleType,
    method,
    instrument,
    interpretation,
    hideMethodInstrument = false,
    hideInterpretation = false,
    parameters = []
  } = testData;

  if (!Name || !Name.trim()) {
    throw new Error("Test Name is required");
  }

  const cleanName = Name.trim();
  const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
  const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;

  // Check if test already exists in tenant (safely checking escaped regex and literal)
  let existingTest = await findExistingSubTest(cleanName, targetTenantId, targetUserId);
  if (!existingTest) {
    existingTest = await testSchema.findOne({
      $or: [
        { Name: cleanName },
        { Name: makeExactCaseInsensitiveRegex(cleanName) }
      ],
      ...(targetTenantId ? { tenantId: targetTenantId } : { createdBy: targetUserId })
    });
  }

  if (existingTest) {
    return {
      success: true,
      alreadyExists: true,
      createdItem: existingTest,
      test: existingTest,
      message: `Test '${existingTest.Name}' pehle se hi database me maujood hai.`
    };
  }

  // 1. Resolve or create Category (with valid orderId)
  const catDoc = await checkOrCreateCategory({
    categoryName: categoryName || "General",
    tenantId: targetTenantId,
    userId: targetUserId,
    role
  });

  // 2. Resolve or create Sample Type in sampleSchema
  const resolvedSampleType = await checkOrCreateSampleType({
    sampleTypeName: sampleType || "Serum",
    tenantId: targetTenantId,
    userId: targetUserId,
    role
  });

  // 3. Calculate order and booking code
  const lastTest = await testSchema
    .findOne(targetTenantId ? { tenantId: targetTenantId } : { createdBy: targetUserId })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = lastTest?.order ? lastTest.order + 1 : 1;
  const nextBookingCode = await getNextBookingCodeForScope(
    targetTenantId ? { tenantId: targetTenantId } : { createdBy: targetUserId, createdByRole: role }
  );

  // 4. Normalize parameters with strict LabFlow schema
  const rawParams = (Array.isArray(parameters) && parameters.length > 0) ? parameters : [{
    Para_name: cleanName,
    unit: "",
    defaultresult: "",
    ValueType: "Numeric",
    NormalValue: []
  }];

  const normalizedParams = await Promise.all(rawParams.map(async (p, idx) => {
    const pUnit = p.unit ? await checkOrCreateUnit({ unitName: p.unit, tenantId: targetTenantId, userId: targetUserId, role }) : "";
    const pValueType = String(p.ValueType || (p.text ? "Text" : "Numeric")).trim().toLowerCase() === "text" ? "Text" : "Numeric";

    let normalValues = [];
    if (Array.isArray(p.NormalValue) && p.NormalValue.length > 0) {
      normalValues = p.NormalValue.map(nv => {
        const rawGender = String(nv.gender || "Any").trim();
        const validGender = ["Male", "Female"].includes(rawGender) ? rawGender : "Any"; // NEVER "Both"
        return {
          gender: validGender,
          minAge: String(nv.minAge ?? "0"),
          minAgeUnit: ["Years", "Months", "Days"].includes(nv.minAgeUnit) ? nv.minAgeUnit : "Years",
          maxAge: String(nv.maxAge ?? "120"),
          maxAgeUnit: ["Years", "Months", "Days"].includes(nv.maxAgeUnit) ? nv.maxAgeUnit : "Years",
          lowerValue: String(nv.lowerValue ?? ""),
          upperValue: String(nv.upperValue ?? "")
        };
      });
    } else {
      normalValues = [
        {
          gender: "Any", // CRITICAL: "Any" matches patient in labreport.js
          minAge: "0",
          minAgeUnit: "Years",
          maxAge: "120",
          maxAgeUnit: "Years",
          lowerValue: String(p.lowerValue || ""),
          upperValue: String(p.upperValue || "")
        }
      ];
    }

    return {
      order: p.order || idx + 1,
      Para_name: p.Para_name || p.name || `Parameter ${idx + 1}`,
      unit: pUnit,
      groupby: p.groupby || "",
      defaultresult: p.defaultresult || "",
      masterParameterKey: `param_${new mongoose.Types.ObjectId().toString()}`,
      NormalValue: normalValues,
      text: p.text || "",
      ValueType: pValueType,
      lowerRange: Number(p.lowerRange || 0),
      upperRange: Number(p.upperRange || 0),
      forRandom: Boolean(p.forRandom)
    };
  }));

  const effectivePrice = Number(final_price || Price || 300);

  try {
    const createdTest = await testSchema.create({
      order: nextOrder,
      bookingCode: nextBookingCode,
      Name: cleanName,
      Short_name: Short_name ? Short_name.trim() : cleanName.slice(0, 8).toUpperCase(),
      category: {
        _id: catDoc._id,
        category: catDoc.category,
        orderId: catDoc.orderId || 1,
        tenantId: catDoc.tenantId
      },
      Price: effectivePrice,
      final_price: effectivePrice,
      tat: tat || "24 Hours",
      sampleType: resolvedSampleType,
      method: method || "Fully Automated",
      instrument: instrument || "Automated Clinical Analyzer",
      interpretation: interpretation || `<p><strong>Clinical Significance for ${cleanName}:</strong> Essential diagnostic indicator evaluated in laboratory medicine.</p>`,
      hideMethodInstrument: Boolean(hideMethodInstrument),
      hideInterpretation: Boolean(hideInterpretation),
      parameters: normalizedParams,
      tenantId: targetTenantId,
      createdBy: targetUserId,
      createdByRole: role === "superAdmin" ? "superAdmin" : "admin",
      isBaseTest: role === "superAdmin"
    });

    return {
      success: true,
      createdItem: createdTest,
      message: `Test '${createdTest.Name}' successfully database me add ho gaya hai (Booking Code: ${createdTest.bookingCode}).`
    };
  } catch (err) {
    if (err.code === 11000 || String(err.message).includes("E11000") || String(err.message).includes("duplicate key")) {
      const dup = (await findExistingSubTest(cleanName, targetTenantId, targetUserId)) || (await testSchema.findOne({
        Name: cleanName,
        ...(targetTenantId ? { tenantId: targetTenantId } : { createdBy: targetUserId })
      }));
      if (dup) {
        return {
          success: true,
          alreadyExists: true,
          createdItem: dup,
          test: dup,
          message: `Test '${dup.Name}' pehle se hi database me maujood tha.`
        };
      }
    }
    throw err;
  }
}

/**
 * Create a new Panel document with automatic sub-test resolution and creation
 */
export async function executeCreatePanel({ panelData, tenantId, userId, role }) {
  const {
    name,
    Short_name,
    shortName,
    short_name,
    code,
    categoryName,
    price,
    final_price,
    tests = [],
    testNames = [],
    sample_types,
    sampleType,
    interpretation,
    hideInterpretation = false,
    hideMethodInstrument = false,
    hidePanelInterpretation = false
  } = panelData;

  if (!name || !name.trim()) {
    throw new Error("Panel Name is required");
  }

  const cleanPanelName = name.trim();
  if (cleanPanelName.includes(",")) {
    throw new Error("Panel name cannot contain commas (','). Please provide a clean panel name without commas.");
  }

  const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
  const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;

  // Check if panel already exists
  const existingPanel = await findExistingPanel(cleanPanelName, targetTenantId, targetUserId, { exactOnly: true });
  if (existingPanel) {
    return {
      success: true,
      alreadyExists: true,
      createdItem: existingPanel,
      panel: existingPanel,
      message: `Panel '${existingPanel.name}' pehle se hi database me maujood hai.`
    };
  }

  // Find standard panel definition if available
  const lowerName = cleanPanelName.toLowerCase();
  let matchedPanelDef = null;
  for (const [key, pDef] of Object.entries(STANDARD_PATHOLOGY_PANELS)) {
    const aliases = [key, pDef.name.toLowerCase(), ...(pDef.aliases || []).map(a => a.toLowerCase())];
    if (aliases.some(a => a === lowerName || lowerName.includes(a) || a.includes(lowerName))) {
      matchedPanelDef = pDef;
      break;
    }
  }

  // 1. Resolve or create Category
  const finalCategoryName = categoryName || matchedPanelDef?.category || "Biochemistry";
  const catDoc = await checkOrCreateCategory({
    categoryName: finalCategoryName,
    tenantId: targetTenantId,
    userId: targetUserId,
    role
  });

  // 2. Resolve single uniform sample type strictly
  const candidateSampleType =
    (sample_types && sample_types[0]) ||
    sampleType ||
    matchedPanelDef?.sampleType ||
    "Serum";

  const resolvedSampleType = await checkOrCreateSampleType({
    sampleTypeName: candidateSampleType,
    tenantId: targetTenantId,
    userId: targetUserId,
    role
  });

  // 3. Resolve constituent tests:
  let effectiveTestNames = Array.isArray(testNames) ? [...testNames] : [];
  if ((!tests || tests.length === 0) && effectiveTestNames.length === 0) {
    if (matchedPanelDef?.testNames?.length) {
      effectiveTestNames = [...matchedPanelDef.testNames];
    } else {
      effectiveTestNames = [cleanPanelName];
    }
  }

  const resolvedTestsIds = [];
  const resolvedTestNames = [];

  // A. Process full sub-test specifications
  if (Array.isArray(tests) && tests.length > 0) {
    for (const testDef of tests) {
      const tName = testDef.Name || testDef.name;
      if (!tName) continue;

      let existingSubTest = await findExistingSubTest(tName, targetTenantId, targetUserId, resolvedSampleType);

      if (!existingSubTest) {
        const standardDef = getStandardTestDefinition(tName, resolvedSampleType);
        const createResult = await executeCreateTest({
          testData: {
            ...standardDef,
            ...testDef,
            Name: tName.trim(),
            categoryName: catDoc.category,
            sampleType: resolvedSampleType
          },
          tenantId: targetTenantId,
          userId: targetUserId,
          role
        });
        existingSubTest = createResult.createdItem;
      }

      if (existingSubTest) {
        if (!resolvedTestsIds.some(id => id.toString() === existingSubTest._id.toString())) {
          resolvedTestsIds.push(existingSubTest._id);
          resolvedTestNames.push(existingSubTest.Name);
        }
      }
    }
  }

  // B. Process string test names
  if (Array.isArray(effectiveTestNames) && effectiveTestNames.length > 0) {
    for (const tn of effectiveTestNames) {
      if (!tn || typeof tn !== "string") continue;
      const cleanTn = tn.trim();
      let existingSubTest = await findExistingSubTest(cleanTn, targetTenantId, targetUserId, resolvedSampleType);

      if (!existingSubTest) {
        const subPrice = Math.round(Number(final_price || price || 500) / (effectiveTestNames.length || 1));
        const standardDef = getStandardTestDefinition(cleanTn, resolvedSampleType);
        const createResult = await executeCreateTest({
          testData: {
            ...standardDef,
            Name: cleanTn,
            categoryName: catDoc.category,
            sampleType: resolvedSampleType,
            Price: subPrice,
            final_price: subPrice
          },
          tenantId: targetTenantId,
          userId: targetUserId,
          role
        });
        existingSubTest = createResult.createdItem;
      }

      if (existingSubTest) {
        if (!resolvedTestsIds.some(id => id.toString() === existingSubTest._id.toString())) {
          resolvedTestsIds.push(existingSubTest._id);
          resolvedTestNames.push(existingSubTest.Name);
        }
      }
    }
  }

  const lastPanel = await addPannel
    .findOne(targetTenantId ? { tenantId: targetTenantId } : { createdBy: targetUserId })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = lastPanel?.order ? lastPanel.order + 1 : 1;
  const nextBookingCode = await getNextBookingCodeForScope(
    targetTenantId ? { tenantId: targetTenantId } : { createdBy: targetUserId, createdByRole: role }
  );

  const effectivePrice = Number(final_price || price || 500);
  const resolvedShortName = String(
    Short_name ?? shortName ?? short_name ?? code ?? matchedPanelDef?.shortName ?? ""
  ).trim();

  try {
    const createdPanel = await addPannel.create({
      order: nextOrder,
      bookingCode: nextBookingCode,
      name: cleanPanelName,
      Short_name: resolvedShortName,
      category: {
        _id: catDoc._id,
        category: catDoc.category,
        orderId: catDoc.orderId || 1,
        tenantId: catDoc.tenantId
      },
      price: effectivePrice,
      final_price: effectivePrice,
      tests: resolvedTestNames,
      testsId: resolvedTestsIds,
      sample_types: [resolvedSampleType],
      interpretation: interpretation || `<p><strong>Clinical Significance for ${cleanPanelName}:</strong> Comprehensive profile evaluation.</p>`,
      hideInterpretation: Boolean(hideInterpretation),
      hideMethodInstrument: Boolean(hideMethodInstrument),
      hidePanelInterpretation: Boolean(hidePanelInterpretation),
      hidepanelinterpretation: Boolean(hidePanelInterpretation),
      tenantId: targetTenantId,
      createdBy: targetUserId,
      createdByRole: role === "superAdmin" ? "superAdmin" : "admin",
      isBasePanel: role === "superAdmin"
    });

    return {
      success: true,
      createdItem: createdPanel,
      message: `Panel '${createdPanel.name}' (${createdPanel.tests.length} tests linked with specimen '${resolvedSampleType}') successfully create ho gaya hai (Booking Code: ${createdPanel.bookingCode}).`
    };
  } catch (err) {
    if (err.code === 11000 || String(err.message).includes("E11000") || String(err.message).includes("duplicate key")) {
      const dup = await findExistingPanel(cleanPanelName, targetTenantId, targetUserId);
      if (dup) {
        return {
          success: true,
          alreadyExists: true,
          createdItem: dup,
          panel: dup,
          message: `Panel '${dup.name}' pehle se hi database me maujood hai.`
        };
      }
    }
    throw err;
  }
}

/**
 * Create a new Package document with automatic multi-sample test and panel resolution
 */
export async function executeCreatePackage({ packageData, tenantId, userId, role }) {
  const {
    packageName,
    packageGender = "Both",
    packageFee,
    final_price,
    testNames = [],
    panelNames = []
  } = packageData;

  if (!packageName || !packageName.trim()) {
    throw new Error("Package Name is required");
  }

  const cleanPackageName = packageName.trim();
  if (cleanPackageName.includes(",")) {
    throw new Error("Package name cannot contain commas (','). Please provide a clean package name without commas.");
  }

  const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
  const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;

  // Check if package already exists
  const existingPkg = await Package.findOne({
    $or: [
      { packageName: cleanPackageName },
      { packageName: makeExactCaseInsensitiveRegex(cleanPackageName) }
    ],
    ...(targetTenantId ? { tenantId: targetTenantId } : { createdBy: targetUserId })
  });

  if (existingPkg) {
    return {
      success: true,
      alreadyExists: true,
      createdItem: existingPkg,
      package: existingPkg,
      message: `Package '${existingPkg.packageName}' pehle se hi maujood hai.`
    };
  }

  // 1. Resolve or auto-create constituent tests
  const resolvedTestNames = [];
  const resolvedTestIds = [];
  const resolvedTestSamples = [];

  for (const tName of (testNames || [])) {
    if (!tName || typeof tName !== "string") continue;
    const cleanTn = tName.trim();
    let testDoc = await findExistingSubTest(cleanTn, targetTenantId, targetUserId);

    if (!testDoc) {
      const standardDef = getStandardTestDefinition(cleanTn);
      const catDoc = await checkOrCreateCategory({
        categoryName: standardDef.categoryName || "Biochemistry",
        tenantId: targetTenantId,
        userId: targetUserId,
        role
      });
      const st = await checkOrCreateSampleType({
        sampleTypeName: standardDef.sampleType || "Serum",
        tenantId: targetTenantId,
        userId: targetUserId,
        role
      });
      const res = await executeCreateTest({
        testData: {
          ...standardDef,
          categoryName: catDoc.category,
          sampleType: st
        },
        tenantId: targetTenantId,
        userId: targetUserId,
        role
      });
      testDoc = res.createdItem;
    }

    if (testDoc && !resolvedTestIds.some(id => id.toString() === testDoc._id.toString())) {
      resolvedTestIds.push(testDoc._id);
      resolvedTestNames.push(testDoc.Name);
      resolvedTestSamples.push(testDoc.sampleType || "Serum");
    }
  }

  // 2. Resolve or auto-create constituent panels
  const resolvedPanelNames = [];
  const resolvedPanelIds = [];
  const resolvedPanelSamples = [];

  for (const pName of (panelNames || [])) {
    if (!pName || typeof pName !== "string") continue;
    const cleanPn = pName.trim();
    let panelDoc = await findExistingPanel(cleanPn, targetTenantId, targetUserId);

    if (!panelDoc) {
      const pRes = await executeCreatePanel({
        panelData: {
          name: cleanPn,
          price: 500,
          final_price: 500
        },
        tenantId: targetTenantId,
        userId: targetUserId,
        role
      });
      panelDoc = pRes.createdItem || pRes.panel;
    }

    if (panelDoc && !resolvedPanelIds.some(id => id.toString() === panelDoc._id.toString())) {
      resolvedPanelIds.push(panelDoc._id);
      resolvedPanelNames.push(panelDoc.name);
      resolvedPanelSamples.push(panelDoc.sample_types?.[0] || "Serum");
    }
  }

  if (resolvedTestIds.length === 0 && resolvedPanelIds.length === 0) {
    throw new Error("A package must contain at least one constituent test or panel.");
  }

  const lastPkg = await Package
    .findOne(targetTenantId ? { tenantId: targetTenantId } : { createdBy: targetUserId })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = lastPkg?.order ? Number(lastPkg.order || 0) + 1 : 1;
  const nextBookingCode = await getNextBookingCodeForScope(
    targetTenantId ? { tenantId: targetTenantId } : { createdBy: targetUserId, createdByRole: role }
  );

  const effectiveFee = Number(final_price || packageFee || 999);

  try {
    const createdPackage = await Package.create({
      order: nextOrder,
      bookingCode: nextBookingCode,
      packageName: cleanPackageName,
      packageGender: ["male", "female", "Both"].includes(packageGender) ? packageGender : "Both",
      packageFee: String(effectiveFee),
      final_price: String(effectiveFee),
      testname: resolvedTestNames,
      testIds: resolvedTestIds,
      testSample: resolvedTestSamples,
      pannelname: resolvedPanelNames,
      pannelIds: resolvedPanelIds,
      pannelSample: resolvedPanelSamples,
      tenantId: targetTenantId,
      createdBy: targetUserId,
      createdByRole: role === "superAdmin" ? "superAdmin" : "admin",
      isBasePackage: role === "superAdmin"
    });

    return {
      success: true,
      createdItem: createdPackage,
      message: `Package '${createdPackage.packageName}' (${resolvedTestNames.length} tests, ${resolvedPanelNames.length} panels linked) successfully create ho gaya hai (Booking Code: ${createdPackage.bookingCode}).`
    };
  } catch (err) {
    if (err.code === 11000 || String(err.message).includes("E11000") || String(err.message).includes("duplicate key")) {
      const dup = await Package.findOne({
        $or: [
          { packageName: cleanPackageName },
          { packageName: makeExactCaseInsensitiveRegex(cleanPackageName) }
        ],
        ...(targetTenantId ? { tenantId: targetTenantId } : { createdBy: targetUserId })
      });
      if (dup) {
        return {
          success: true,
          alreadyExists: true,
          createdItem: dup,
          package: dup,
          message: `Package '${dup.packageName}' pehle se hi maujood hai.`
        };
      }
    }
    throw err;
  }
}

/**
 * Thoroughly repair any existing tests, panels, and bookings in tenant:
 * 1. Ensures tests have complete category objects ({ _id, category, orderId, tenantId }),
 *    gender: "Any" (never "Both") in NormalValue, and valid masterParameterKeys.
 * 2. Ensures panels have category with orderId and non-empty testsId referencing real sub-tests.
 * 3. Ensures bookings have status "pending", age with unit (e.g. "30 Years"), and acceptedBarcode records.
 */
export async function repairExistingTestsAndBookings({ tenantId, userId, username, role }) {
  try {
    if (!tenantId) return 0;
    const targetTenantId = new mongoose.Types.ObjectId(tenantId);
    const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;

    // 1. Repair testSchema documents
    const tests = await testSchema.find({ tenantId: targetTenantId });
    for (const test of tests) {
      let changed = false;

      // Ensure valid category object with orderId
      if (!test.category || typeof test.category !== "object" || !test.category.orderId || !test.category.category) {
        const catName = (typeof test.category === "string" ? test.category : test.category?.category) || "General";
        const catDoc = await checkOrCreateCategory({
          categoryName: catName,
          tenantId: targetTenantId,
          userId: targetUserId,
          role
        });
        test.category = {
          _id: catDoc._id,
          category: catDoc.category,
          orderId: catDoc.orderId || 1,
          tenantId: catDoc.tenantId
        };
        changed = true;
      }

      // Ensure parameters are well-formed
      if (Array.isArray(test.parameters)) {
        for (const param of test.parameters) {
          if (!param.masterParameterKey) {
            param.masterParameterKey = `param_${new mongoose.Types.ObjectId().toString()}`;
            changed = true;
          }
          if (!param.ValueType) {
            param.ValueType = param.text ? "Text" : "Numeric";
            changed = true;
          }
          if (Array.isArray(param.NormalValue) && param.NormalValue.length > 0) {
            for (const nv of param.NormalValue) {
              if (nv.gender === "Both" || !nv.gender) {
                nv.gender = "Any";
                changed = true;
              }
              if (!nv.minAgeUnit) {
                nv.minAgeUnit = "Years";
                changed = true;
              }
              if (!nv.maxAgeUnit) {
                nv.maxAgeUnit = "Years";
                changed = true;
              }
            }
          } else {
            param.NormalValue = [{
              gender: "Any",
              minAge: "0",
              minAgeUnit: "Years",
              maxAge: "120",
              maxAgeUnit: "Years",
              lowerValue: "",
              upperValue: ""
            }];
            changed = true;
          }
        }
      }

      if (changed) {
        await test.save();
      }
    }

    // 2. Repair addPannel documents
    const panels = await addPannel.find({ tenantId: targetTenantId });
    for (const panel of panels) {
      let changed = false;
      if (!panel.category || typeof panel.category !== "object" || !panel.category.orderId || !panel.category.category) {
        const catName = (typeof panel.category === "string" ? panel.category : panel.category?.category) || "Biochemistry";
        const catDoc = await checkOrCreateCategory({
          categoryName: catName,
          tenantId: targetTenantId,
          userId: targetUserId,
          role
        });
        panel.category = {
          _id: catDoc._id,
          category: catDoc.category,
          orderId: catDoc.orderId || 1,
          tenantId: catDoc.tenantId
        };
        changed = true;
      }

      // Ensure testsId has valid sub-tests
      if ((!panel.testsId || panel.testsId.length === 0) && Array.isArray(panel.tests) && panel.tests.length > 0) {
        const subIds = [];
        for (const tn of panel.tests) {
          let st = await findExistingSubTest(tn, targetTenantId, targetUserId);
          if (!st) {
            const cr = await executeCreateTest({
              testData: {
                Name: tn.trim(),
                categoryName: panel.category?.category || "Biochemistry",
                Price: Math.round(Number(panel.final_price || 500) / panel.tests.length),
                parameters: [{ Para_name: tn.trim(), unit: "", NormalValue: [] }]
              },
              tenantId: targetTenantId,
              userId: targetUserId,
              role
            });
            st = cr.createdItem;
          }
          if (st) subIds.push(st._id);
        }
        panel.testsId = subIds;
        changed = true;
      }

      if (changed) {
        await panel.save();
      }
    }

    // 3. Repair newBooking documents
    const onHoldOrUnfixedBookings = await newBooking.find({
      tenantId: targetTenantId
    });

    let repairedCount = 0;
    for (const booking of onHoldOrUnfixedBookings) {
      let bChanged = false;
      if (booking.status === "On Hold") {
        booking.status = "pending";
        bChanged = true;
      }
      if (booking.year && !String(booking.year).includes(" ")) {
        booking.year = `${booking.year} Years`;
        bChanged = true;
      }
      if (!booking.createdbyuser && username) {
        booking.createdbyuser = username;
        bChanged = true;
      }
      if (bChanged) {
        await booking.save();
        repairedCount++;
      }

      // Check if acceptedBarcode document exists for this booking
      const existingBarcodeDoc = await acceptedBarcode.findOne({
        tenantId: targetTenantId,
        bookingId: booking.bookingId
      });

      if (!existingBarcodeDoc && Array.isArray(booking.tableData) && booking.tableData.length > 0) {
        const barcodeEntries = booking.tableData.map(entry => {
          const barcodeVal = entry.confirmBarcodeId || entry.barcodeId || String(Math.floor(100000 + Math.random() * 900000));
          return {
            barcode: barcodeVal,
            testandpannelArray: (entry.testName || "").split(",").map(t => t.trim()).filter(Boolean),
            sampleType: entry.typeOfSample || "Serum",
            testIds: entry.ids || []
          };
        });

        await acceptedBarcode.create({
          tenantId: targetTenantId,
          bookingId: booking.bookingId,
          barcodes: barcodeEntries
        });
      }
    }
    return repairedCount;
  } catch (err) {
    console.error("Error repairing tests and bookings:", err);
    return 0;
  }
}

export const repairPreviousCopilotBookings = repairExistingTestsAndBookings;

/**
 * Create a new Patient Booking document matching manual booking flow exactly
 */
export async function executeCreateBooking({ bookingData, tenantId, userId, role, currentUser }) {
  const {
    patientName,
    gender = "Male",
    year = "30",
    patientPhone = "",
    doctorName = "Self",
    items = []
  } = bookingData;

  if (!patientName || !patientName.trim()) {
    throw new Error("Patient Name is required");
  }

  const cleanPatientName = patientName.trim();
  const rawYear = String(year || "30").trim();
  const cleanYear = rawYear.includes(" ") ? rawYear : `${rawYear} Years`;
  const cleanPhone = String(patientPhone || "").trim();

  // 1. Generate unique bookingId matching manual booking format (e.g. OH...)
  let bookingId = `OH${Math.floor(1000000000 + Math.random() * 9000000000)}`;
  while (await newBooking.findOne({ bookingId })) {
    bookingId = `OH${Math.floor(1000000000 + Math.random() * 9000000000)}`;
  }

  const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
  const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;
  const reqDoctorName = (doctorName || "Self").trim();

  // 2. Resolve Doctor from DB if available
  let doctorDoc = null;
  if (targetTenantId) {
    doctorDoc = await doctors.findOne({
      tenantId: targetTenantId,
      displayName: makeExactCaseInsensitiveRegex(reqDoctorName)
    });
    if (!doctorDoc && reqDoctorName.toLowerCase() !== "self") {
      doctorDoc = await doctors.findOne({
        tenantId: targetTenantId,
        displayName: makeExactCaseInsensitiveRegex("self")
      });
    }
    if (!doctorDoc) {
      doctorDoc = await doctors.findOne({
        tenantId: targetTenantId
      });
    }
  }

  const resolvedDoctorName = doctorDoc?.displayName || reqDoctorName || "Self";
  const resolvedDoctorId = doctorDoc?._id || undefined;
  const resolvedDoctorEmail = doctorDoc?.email || "";
  const resolvedDoctorMeta = {
    displayName: resolvedDoctorName,
    email: resolvedDoctorEmail,
    firstName: doctorDoc?.firstName || "",
    lastName: doctorDoc?.lastName || "",
    source: doctorDoc?._id ? "doctor-ref" : "snapshot"
  };

  // 3. Resolve Items and Sample Types
  const selectedItems = [];
  const sampleGroups = new Map(); // sampleType -> { testNames: [], ids: [] }
  let calculatedTotal = 0;

  for (const item of items) {
    const itemName = item.name || item.itemName;
    if (!itemName) continue;

    const itemType = (item.type || "test").toLowerCase();
    let price = Number(item.estimatedPrice || item.price || 0);
    let sampleTypes = ["Serum"];
    let docId = null;

    if (itemType === "panel") {
      let pDoc = await findExistingPanel(itemName.trim(), targetTenantId, targetUserId);
      if (!pDoc) {
        // Auto-create panel with real sub-tests so Enter Result page finds it
        const createResult = await executeCreatePanel({
          panelData: {
            name: itemName.trim(),
            categoryName: "Biochemistry",
            price: price || 500,
            testNames: [itemName.trim()]
          },
          tenantId: targetTenantId,
          userId: targetUserId,
          role
        });
        pDoc = createResult.createdItem;
      }

      if (pDoc) {
        docId = pDoc._id;
        price = Number(pDoc.final_price || pDoc.price || price);
        sampleTypes = Array.isArray(pDoc.sample_types) && pDoc.sample_types.length > 0 ? pDoc.sample_types : ["Serum"];
      }
      calculatedTotal += price;

      selectedItems.push({
        itemId: docId,
        itemType: "panel",
        itemName: pDoc?.name || itemName,
        shortName: (pDoc?.name || itemName).slice(0, 8).toUpperCase(),
        sampleTypes: sampleTypes,
        price: price,
        basePrice: price,
        mrpPrice: price,
        rateSource: "self"
      });

      for (const st of sampleTypes) {
        const normSt = (st || "Serum").trim();
        if (!sampleGroups.has(normSt)) sampleGroups.set(normSt, { testNames: [], ids: [] });
        const grp = sampleGroups.get(normSt);
        if (!grp.testNames.includes(itemName)) grp.testNames.push(itemName);
        grp.ids.push({ id: docId, collectionName: "addPannel" });
      }
    } else if (itemType === "package") {
      const pkgDoc = await Package.findOne({
        $or: [
          { packageName: itemName.trim() },
          { packageName: makeExactCaseInsensitiveRegex(itemName.trim()) }
        ],
        ...(targetTenantId ? { tenantId: targetTenantId } : { createdBy: targetUserId })
      }).populate("testIds pannelIds");

      if (pkgDoc) {
        docId = pkgDoc._id;
        price = Number(pkgDoc.final_price || pkgDoc.packageFee || price);
        sampleTypes = [...(pkgDoc.testSample || []), ...(pkgDoc.pannelSample || [])];
        if (sampleTypes.length === 0) sampleTypes = ["Serum"];
      } else {
        docId = new mongoose.Types.ObjectId();
      }
      calculatedTotal += price;

      selectedItems.push({
        itemId: docId,
        itemType: "package",
        itemName: pkgDoc?.packageName || itemName,
        shortName: (pkgDoc?.packageName || itemName).slice(0, 8).toUpperCase(),
        sampleTypes: sampleTypes,
        price: price,
        basePrice: price,
        mrpPrice: price,
        rateSource: "self"
      });

      if (pkgDoc?.testIds?.length > 0 || pkgDoc?.pannelIds?.length > 0) {
        (pkgDoc.testIds || []).forEach(t => {
          const st = (t.sampleType || "Serum").trim();
          if (!sampleGroups.has(st)) sampleGroups.set(st, { testNames: [], ids: [] });
          const grp = sampleGroups.get(st);
          if (!grp.testNames.includes(t.Name)) grp.testNames.push(t.Name);
          grp.ids.push({ id: t._id, collectionName: "testSchema" });
        });
        (pkgDoc.pannelIds || []).forEach(p => {
          const st = (p.sample_types?.[0] || "Serum").trim();
          if (!sampleGroups.has(st)) sampleGroups.set(st, { testNames: [], ids: [] });
          const grp = sampleGroups.get(st);
          if (!grp.testNames.includes(p.name)) grp.testNames.push(p.name);
          grp.ids.push({ id: p._id, collectionName: "addPannel" });
        });
      } else {
        for (const st of sampleTypes) {
          const normSt = (st || "Serum").trim();
          if (!sampleGroups.has(normSt)) sampleGroups.set(normSt, { testNames: [], ids: [] });
          const grp = sampleGroups.get(normSt);
          if (!grp.testNames.includes(itemName)) grp.testNames.push(itemName);
          grp.ids.push({ id: docId, collectionName: "Package" });
        }
      }
    } else {
      // test
      let tDoc = await findExistingSubTest(itemName, targetTenantId, targetUserId);
      if (!tDoc) {
        tDoc = await testSchema.findOne({
          $or: [
            { Name: itemName.trim() },
            { Name: makeExactCaseInsensitiveRegex(itemName.trim()) }
          ],
          ...(targetTenantId ? { tenantId: targetTenantId } : { createdBy: targetUserId })
        });
      }

      if (!tDoc) {
        // Auto-create test with real schema and category so Enter Result page finds it
        const createResult = await executeCreateTest({
          testData: {
            Name: itemName.trim(),
            categoryName: "General",
            sampleType: "Serum",
            Price: price || 300,
            parameters: [{ Para_name: itemName.trim(), unit: "", NormalValue: [] }]
          },
          tenantId: targetTenantId,
          userId: targetUserId,
          role
        });
        tDoc = createResult.createdItem;
      }

      if (tDoc) {
        docId = tDoc._id;
        price = Number(tDoc.final_price || tDoc.Price || price);
        sampleTypes = [tDoc.sampleType || "Serum"];
      }
      calculatedTotal += price;

      selectedItems.push({
        itemId: docId,
        itemType: "test",
        itemName: tDoc?.Name || itemName,
        shortName: (tDoc?.Short_name || tDoc?.Name || itemName).slice(0, 8).toUpperCase(),
        sampleTypes: sampleTypes,
        price: price,
        basePrice: price,
        mrpPrice: price,
        rateSource: "self"
      });

      const st = (sampleTypes[0] || "Serum").trim();
      if (!sampleGroups.has(st)) sampleGroups.set(st, { testNames: [], ids: [] });
      const grp = sampleGroups.get(st);
      if (!grp.testNames.includes(itemName)) grp.testNames.push(itemName);
      grp.ids.push({ id: docId, collectionName: "testSchema" });
    }
  }

  if (sampleGroups.size === 0) {
    sampleGroups.set("Serum", {
      testNames: items.map(i => i.name || "General Test"),
      ids: selectedItems.map(si => ({ id: si.itemId, collectionName: "testSchema" }))
    });
  }

  // 4. Build tableData with 6-digit barcodes
  const tableData = [];
  const sampleBarcodeIds = [];

  for (const [sampleType, grp] of sampleGroups.entries()) {
    const sampleBarcode = String(Math.floor(100000 + Math.random() * 900000));
    const uniqueIdsMap = new Map();
    grp.ids.forEach(obj => {
      const key = `${obj.id}_${obj.collectionName}`;
      if (!uniqueIdsMap.has(key)) uniqueIdsMap.set(key, obj);
    });

    tableData.push({
      typeOfSample: sampleType,
      barcodeId: sampleBarcode,
      confirmBarcodeId: sampleBarcode,
      testName: grp.testNames.join(", "),
      ids: Array.from(uniqueIdsMap.values())
    });
    sampleBarcodeIds.push(sampleBarcode);
  }

  const finalTotal = calculatedTotal > 0 ? calculatedTotal : Number(bookingData.total || 500);
  const createdbyusername = currentUser?.username || "Admin";

  // 5. Create newBooking document with status "pending" (MATCHES ALLCASES FLOW)
  const newBookingDoc = await newBooking.create({
    bookingId: bookingId,
    date: new Date(),
    time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
    patientName: cleanPatientName,
    year: cleanYear,
    gender: gender,
    patientPhone: cleanPhone,
    doctorName: resolvedDoctorName,
    savedDoctor: resolvedDoctorName,
    savedDoctorId: resolvedDoctorId,
    savedDoctorEmail: resolvedDoctorEmail,
    savedDoctorMeta: resolvedDoctorMeta,
    labName: "",
    franchisee: "",
    total: finalTotal,
    selectedItems: selectedItems,
    tableData: tableData,
    status: "pending", // EXACT MATCH FOR ALLCASES
    isreportready: false,
    tenantId: targetTenantId,
    createdBy: targetUserId,
    createdbyuser: createdbyusername
  });

  // 6. Create acceptedBarcode document (REQUIRED for allcases aggregation lookup)
  const barcodeEntries = tableData.map(entry => ({
    barcode: entry.confirmBarcodeId || entry.barcodeId,
    testandpannelArray: entry.testName.split(",").map(t => t.trim()).filter(Boolean),
    sampleType: entry.typeOfSample,
    testIds: entry.ids
  }));

  const newBarcodeDocument = new acceptedBarcode({
    tenantId: targetTenantId,
    bookingId: bookingId,
    barcodes: barcodeEntries
  });
  await newBarcodeDocument.save();

  // 7. Create Ledger debit record
  const transactionId = `#CR${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const ledgerEntry = new Ledger({
    userId: targetUserId,
    username: createdbyusername,
    amount: finalTotal,
    patientName: cleanPatientName,
    sampleBarcodeId: sampleBarcodeIds,
    type: "debit",
    transactionId,
    description: `Booking for ${bookingId}`,
    caseId: newBookingDoc._id
  });
  await ledgerEntry.save();

  // 8. Auto-repair any previous stuck bookings in tenant
  repairPreviousCopilotBookings({
    tenantId: targetTenantId,
    userId: targetUserId,
    username: createdbyusername
  }).catch(() => {});

  return {
    success: true,
    createdItem: newBookingDoc,
    bookingId: newBookingDoc.bookingId,
    message: `Patient ${newBookingDoc.patientName} ki booking confirm ho gayi hai! Booking ID: **${newBookingDoc.bookingId}**, Barcode: **${sampleBarcodeIds.join(", ")}**, Total Bill: ₹${newBookingDoc.total}. Ab ye booking 'Cases' page par turant dikhegi.`
  };
}

/**
 * Quick catalog search
 */
export async function searchLabCatalog({ query, tenantId, userId }) {
  if (!query) return { tests: [], panels: [], packages: [] };
  const regex = new RegExp(escapeRegex(query.trim()), "i");
  const scope = tenantId ? { tenantId } : { createdBy: userId };

  const [tests, panels, packages] = await Promise.all([
    testSchema.find({ Name: regex, ...scope }).select("Name bookingCode Price final_price category sampleType").limit(10),
    addPannel.find({ name: regex, ...scope }).select("name bookingCode price final_price tests").limit(10),
    Package.find({ packageName: regex, ...scope }).select("packageName bookingCode final_price testname pannelname").limit(10)
  ]);

  return { tests, panels, packages };
}

/**
 * Audit tests in database for missing fields, missing interpretations, and missing units/ranges
 */
/**
 * Standard Clinical Pathology Method & Analyzer Resolver
 */
export function resolveStandardMethodAndInstrument(testDoc) {
  const name = String(testDoc?.Name || "").toLowerCase();
  const sample = String(testDoc?.sampleType || "").toLowerCase();
  const cat = String(testDoc?.category?.category || testDoc?.category || "").toLowerCase();

  let method = (testDoc?.method && !["", ".", "-", "n/a", "na", "none"].includes(String(testDoc.method).trim().toLowerCase())) ? testDoc.method.trim() : null;
  let instrument = (testDoc?.instrument && !["", ".", "-", "n/a", "na", "none"].includes(String(testDoc.instrument).trim().toLowerCase())) ? testDoc.instrument.trim() : null;

  // 1. Calculations & Ratios
  if (
    name.includes("ratio") ||
    name.includes("vldl") ||
    name.includes("calculated") ||
    name.includes("non-hdl") ||
    name.includes("globulin") ||
    name.includes("egfr") ||
    name.includes("cholesterol / hdl") ||
    name.includes("cholesterol/hdl") ||
    name.includes("indirect")
  ) {
    if (!method) method = "CALCULATED";
    if (!instrument) instrument = "Calculated";
    return { method, instrument };
  }

  // 2. Glucose
  if (name.includes("glucose") || name.includes("sugar") || name.includes("fbs") || name.includes("ppbs") || name.includes("rbs")) {
    if (!method) method = "GOD-POD Method";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }

  // 3. HbA1c
  if (name.includes("hba1c") || name.includes("glycated")) {
    if (!method) method = "HPLC (High Performance Liquid Chromatography)";
    if (!instrument) instrument = "Automated HPLC Analyzer";
    return { method, instrument };
  }

  // 4. Lipid Profile analytes
  if (name.includes("cholesterol") && !name.includes("hdl")) {
    if (!method) method = "CHOD-POD Method";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }
  if (name.includes("triglyceride")) {
    if (!method) method = "GPO-PAP Method";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }
  if (name.includes("hdl") || name.includes("ldl")) {
    if (!method) method = "Direct Enzymatic / Immunoinhibition";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }

  // 5. Kidney & Renal (Creatinine, Urea, Uric Acid, Calcium, Phosphorus)
  if (name.includes("creatinine")) {
    if (!method) method = "Jaffe's Kinetic Method";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }
  if (name.includes("urea") || name.includes("bun")) {
    if (!method) method = "GLDH Urease Method";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }
  if (name.includes("uric acid")) {
    if (!method) method = "Enzymatic Uricase Method";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }
  if (name.includes("calcium")) {
    if (!method) method = "Arsenazo III Method";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }
  if (name.includes("phosphorus") || name.includes("phosphate")) {
    if (!method) method = "Phosphomolybdate Method";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }

  // 6. Liver & Enzymes (Bilirubin, SGOT, SGPT, ALP, Protein, Albumin, Amylase, Lipase)
  if (name.includes("bilirubin")) {
    if (!method) method = "Modified Jendrassik-Grof Method";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }
  if (name.includes("sgot") || name.includes("ast") || name.includes("aspartate")) {
    if (!method) method = "FS IFCC Method (without Pyridoxal Phosphate)";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }
  if (name.includes("sgpt") || name.includes("alt") || name.includes("alanine")) {
    if (!method) method = "FS IFCC Method (without Pyridoxal Phosphate)";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }
  if (name.includes("alkaline") || name.includes("alp")) {
    if (!method) method = "FS IFCC (p-NPP Substrate Method)";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }
  if (name.includes("protein") && !name.includes("crp") && !name.includes("proteinuria")) {
    if (!method) method = "Biuret Method";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }
  if (name.includes("albumin")) {
    if (!method) method = "Bromocresol Green (BCG) Method";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }
  if (name.includes("amylase") || name.includes("lipase")) {
    if (!method) method = "Enzymatic Colorimetric";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }

  // 7. Electrolytes (Sodium, Potassium, Chloride)
  if (name.includes("sodium") || name.includes("potassium") || name.includes("chloride") || name.includes("electrolyte")) {
    if (!method) method = "Ion Selective Electrode (ISE)";
    if (!instrument) instrument = "Electrolyte Analyzer (ISE)";
    return { method, instrument };
  }

  // 8. Hematology & CBC parameters
  if (
    sample.includes("edta") ||
    cat.includes("hematology") ||
    name.includes("leucocyte") ||
    name.includes("platelet") ||
    name.includes("neutrophil") ||
    name.includes("lymphocyte") ||
    name.includes("monocyte") ||
    name.includes("eosinophil") ||
    name.includes("basophil") ||
    name.includes("rbc") ||
    name.includes("wbc") ||
    name.includes("hemoglobin") ||
    name.includes("haemoglobin") ||
    name.includes("mcv") ||
    name.includes("mch") ||
    name.includes("mchc") ||
    name.includes("rdw") ||
    name.includes("pcv") ||
    name.includes("hematocrit") ||
    name.includes("cbc") ||
    name.includes("p-lcc") ||
    name.includes("pct")
  ) {
    if (!method) method = "Electrical Impedance & Flow Cytometry";
    if (!instrument) instrument = "Automated 5-Part Hematology Analyzer";
    return { method, instrument };
  }

  // 9. ESR
  if (name.includes("esr") || name.includes("erythrocyte sedimentation")) {
    if (!method) method = "Westergren Method";
    if (!instrument) instrument = "Automated ESR Analyzer";
    return { method, instrument };
  }

  // 10. Hormones, Vitamins, Tumor Markers, Thyroid (CLIA)
  if (
    name.includes("thyroid") ||
    name.includes("tsh") ||
    name.includes("t3") ||
    name.includes("t4") ||
    name.includes("vitamin d") ||
    name.includes("vitamin b") ||
    name.includes("b-12") ||
    name.includes("b12") ||
    name.includes("ferritin") ||
    name.includes("testosterone") ||
    name.includes("prolactin") ||
    name.includes("estrogen") ||
    name.includes("progesterone") ||
    name.includes("beta hcg") ||
    name.includes("hcg") ||
    name.includes("psa") ||
    name.includes("cortisol") ||
    name.includes("insulin") ||
    name.includes("fsh") ||
    name.includes("lh") ||
    name.includes("amh") ||
    name.includes("ca-125") ||
    name.includes("ca 125") ||
    name.includes("cea") ||
    name.includes("afp") ||
    name.includes("acth")
  ) {
    if (!method) method = "Chemiluminescence Immunoassay (CLIA)";
    if (!instrument) instrument = "Chemiluminescence Immunoassay Analyzer (CLIA)";
    return { method, instrument };
  }

  // 11. Coagulation (PT, INR, APTT)
  if (name.includes("pt") || name.includes("inr") || name.includes("aptt") || name.includes("coagulation") || name.includes("fibrinogen") || sample.includes("citrate")) {
    if (!method) method = "Coagulometric Clotting Assay";
    if (!instrument) instrument = "Automated Coagulation Analyzer";
    return { method, instrument };
  }

  // 12. Infectious Diseases, Serology & ELISA
  if (
    name.includes("hiv") ||
    name.includes("hepatitis") ||
    name.includes("hbsag") ||
    name.includes("hcv") ||
    name.includes("dengue") ||
    name.includes("troponin") ||
    name.includes("elisa")
  ) {
    if (!method) method = "ELISA / Chemiluminescence (CLIA)";
    if (!instrument) instrument = "Automated Immunoassay Analyzer";
    return { method, instrument };
  }

  // 13. Widal & Latex Agglutination
  if (name.includes("widal")) {
    if (!method) method = "Slide Agglutination Method";
    if (!instrument) instrument = "Manual / Agglutination Viewer";
    return { method, instrument };
  }
  if (name.includes("ra") || name.includes("rheumatoid") || name.includes("aso") || name.includes("crp")) {
    if (!method) method = "Latex Agglutination / Immunoturbidimetry";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
    return { method, instrument };
  }

  // 14. Urine, Stool, Semen, Sputum, Body Fluids & Microscopy
  if (
    sample.includes("urine") ||
    sample.includes("stool") ||
    sample.includes("semen") ||
    sample.includes("sputum") ||
    sample.includes("csf") ||
    sample.includes("fluid") ||
    cat.includes("microscopy") ||
    cat.includes("clinical pathology") ||
    name.includes("urine") ||
    name.includes("stool") ||
    name.includes("semen") ||
    name.includes("stain") ||
    name.includes("afb")
  ) {
    if (!method) method = name.includes("afb") || name.includes("stain") ? "Ziehl-Neelsen (Z-N) Staining" : "Microscopic Examination";
    if (!instrument) instrument = "Clinical Microscope";
    return { method, instrument };
  }

  // 15. Default Fallbacks by Category
  if (cat.includes("bio") || sample.includes("serum")) {
    if (!method) method = "Photometric / Enzymatic Method";
    if (!instrument) instrument = "Fully Automated Clinical Chemistry Analyzer";
  } else if (cat.includes("serology") || cat.includes("immuno")) {
    if (!method) method = "Immunoturbidimetry / CLIA";
    if (!instrument) instrument = "Automated Immunoassay Analyzer";
  } else {
    if (!method) method = "Standard Diagnostic Protocol";
    if (!instrument) instrument = "Automated Laboratory Analyzer";
  }

  return { method, instrument };
}

export async function auditTestsInDatabase({ tenantId, userId, role }) {
  const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
  const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;
  const scope = (targetTenantId && targetUserId)
    ? { $or: [{ tenantId: targetTenantId }, { createdBy: targetUserId }] }
    : (targetTenantId ? { tenantId: targetTenantId } : (targetUserId ? { $or: [{ createdBy: targetUserId }, { createdByRole: "superAdmin" }, { isBaseTest: true }] } : {}));

  const tests = await testSchema.find(scope).lean();

  const issues = [];
  const fixes = [];

  for (const t of tests) {
    const testIssues = [];
    const updates = {};

    // 1. Method check
    const isMethodMissing = !t.method || ["", ".", "-", "n/a", "na", "none"].includes(String(t.method).trim().toLowerCase());
    if (isMethodMissing) testIssues.push("Missing or incomplete methodology");

    // 2. Instrument check
    const isInstrumentMissing = !t.instrument || ["", ".", "-", "n/a", "na", "none"].includes(String(t.instrument).trim().toLowerCase());
    if (isInstrumentMissing) testIssues.push("Missing analyzer / instrument");

    // 3. Interpretation check
    const isInterpMissing = !t.interpretation || t.interpretation.trim().length < 25 || t.interpretation.includes("Clinical significance for");
    if (isInterpMissing) testIssues.push("Missing clinical interpretation");

    // 4. Sample type check
    if (!t.sampleType) testIssues.push("Missing specimen/sample type");

    // 5. Category check
    if (!t.category || (!t.category?.category && typeof t.category !== "string")) testIssues.push("Missing category");

    // 6. Parameter checks
    if (!t.parameters || t.parameters.length === 0) {
      testIssues.push("No parameters configured");
    } else {
      const missingUnits = t.parameters.filter(p => !p.unit || p.unit.trim() === "");
      if (missingUnits.length > 0) testIssues.push(`${missingUnits.length} parameter(s) missing unit`);
      const missingNormals = t.parameters.filter(p => !p.NormalValue || p.NormalValue.length === 0 || (!p.NormalValue[0]?.lowerValue && !p.NormalValue[0]?.upperValue));
      if (missingNormals.length > 0) testIssues.push(`${missingNormals.length} parameter(s) missing reference ranges`);
    }

    if (testIssues.length > 0) {
      const resolved = resolveStandardMethodAndInstrument(t);
      if (isMethodMissing) updates.method = resolved.method;
      if (isInstrumentMissing) updates.instrument = resolved.instrument;

      const issueObj = {
        testId: String(t._id),
        name: t.Name,
        currentName: t.Name,
        testName: t.Name,
        shortName: t.Short_name || "",
        category: t.category?.category || t.category || "General",
        sampleType: t.sampleType || "Not set",
        price: t.final_price || t.Price || 0,
        currentMethod: t.method || "(empty)",
        currentInstrument: t.instrument || "(empty)",
        proposedMethod: resolved.method,
        proposedInstrument: resolved.instrument,
        issues: testIssues,
        updates
      };

      issues.push(issueObj);
      if (Object.keys(updates).length > 0 || isInterpMissing) {
        fixes.push(issueObj);
      }
    }
  }

  return {
    totalTests: tests.length,
    totalIssuesFound: issues.length,
    issues,
    fixes
  };
}

/**
 * Safe query builder to lookup a test by ObjectId or fallback to test Name
 */
function buildTestLookupQuery(fix, tenantId, userId) {
  const rawId = fix?.testId || fix?.id || fix?._id;

  // Check if rawId is a valid 24-character hexadecimal MongoDB ObjectId
  if (rawId && typeof rawId === "string" && /^[0-9a-fA-F]{24}$/.test(rawId)) {
    return { _id: new mongoose.Types.ObjectId(rawId) };
  }

  // Fallback: match by current test Name if rawId was a placeholder like "test_1"
  const candidateName = fix?.currentName || fix?.testName || fix?.name;
  if (candidateName && typeof candidateName === "string" && candidateName.trim()) {
    const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
    const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;
    const scope = (targetTenantId && targetUserId)
      ? { $or: [{ tenantId: targetTenantId }, { createdBy: targetUserId }] }
      : (targetTenantId ? { tenantId: targetTenantId } : (targetUserId ? { createdBy: targetUserId } : {}));

    return {
      Name: makeExactCaseInsensitiveRegex(candidateName.trim()),
      ...scope
    };
  }

  return null;
}

/**
 * Catalog Gap Analysis: Identify recommended clinical tests missing from laboratory catalog
 */
export async function findMissingStandardTests({ tenantId, userId }) {
  const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
  const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;
  const scope = (targetTenantId && targetUserId)
    ? { $or: [{ tenantId: targetTenantId }, { createdBy: targetUserId }] }
    : (targetTenantId ? { tenantId: targetTenantId } : (targetUserId ? { $or: [{ createdBy: targetUserId }, { createdByRole: "superAdmin" }, { isBaseTest: true }] } : {}));

  const existing = await testSchema.find(scope).select("Name").lean();
  const existingNamesLower = existing.map(t => String(t.Name || "").toLowerCase().trim());

  const RECOMMENDED_ESSENTIAL_TESTS = [
    { name: "D-Dimer", category: "Hematology / Coagulation", sampleType: "Citrate Plasma", reason: "Thrombosis, DVT, Pulmonary Embolism, and DIC monitoring" },
    { name: "Procalcitonin (PCT)", category: "Biochemistry / Immunology", sampleType: "Serum", reason: "Critical care sepsis marker differentiating bacterial vs viral infection" },
    { name: "High Sensitivity Troponin I (hs-cTnI)", category: "Biochemistry", sampleType: "Serum", reason: "Gold-standard early biomarker for Acute Myocardial Infarction (heart attack)" },
    { name: "High-Sensitivity CRP (hs-CRP)", category: "Biochemistry", sampleType: "Serum", reason: "Independent cardiovascular risk stratification and vascular inflammation" },
    { name: "Ferritin (Serum)", category: "Biochemistry", sampleType: "Serum", reason: "Body iron store assessment, microcytic anemia, and inflammatory activity" },
    { name: "Prostate-Specific Antigen (PSA Total)", category: "Immunology", sampleType: "Serum", reason: "Prostate carcinoma screening and benign prostatic hyperplasia (BPH) workup in males >45" },
    { name: "Carcinoembryonic Antigen (CEA)", category: "Immunology", sampleType: "Serum", reason: "Gastrointestinal, colorectal, and lung malignancy surveillance" },
    { name: "Beta-hCG (Quantitative)", category: "Endocrinology", sampleType: "Serum", reason: "Quantitative gestational assessment, ectopic pregnancy, and germ-cell tumors" },
    { name: "Total IgE (Serum)", category: "Immunology", sampleType: "Serum", reason: "Allergy profiling, bronchial asthma, atopic dermatitis, and parasitic infections" },
    { name: "Anti-CCP (Cyclic Citrullinated Peptide)", category: "Immunology", sampleType: "Serum", reason: "Highly specific early diagnostic marker for Rheumatoid Arthritis" },
    { name: "ANA (Antinuclear Antibodies by IFA/ELISA)", category: "Immunology", sampleType: "Serum", reason: "Screening marker for Systemic Lupus Erythematosus (SLE) and autoimmune disorders" },
    { name: "Serum Cortisol", category: "Endocrinology", sampleType: "Serum", reason: "Hypothalamic-pituitary-adrenal axis evaluation (Cushing's and Addison's disease)" }
  ];

  const missing = [];
  for (const item of RECOMMENDED_ESSENTIAL_TESTS) {
    const cleanItem = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const found = existingNamesLower.some(dbName => {
      const cleanDb = dbName.replace(/[^a-z0-9]/g, "");
      return cleanDb.includes(cleanItem) || cleanItem.includes(cleanDb);
    });
    if (!found) {
      missing.push(item);
    }
  }

  return missing;
}

/**
 * Update an existing Test with full field support (prices, hide flags, parameters, interpretation)
 */
export async function executeUpdateTest({ updateData, tenantId, userId, role }) {
  const {
    testId,
    testName,
    name,
    updates,
    ...directFields
  } = updateData || {};

  const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
  const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;

  const targetId =
    testId ||
    updateData?.id ||
    updateData?._id ||
    updates?.testId ||
    updates?.id ||
    updates?._id;

  let candidateName =
    testName ||
    name ||
    updateData?.Name ||
    updateData?.test ||
    updateData?.test_name ||
    updateData?.title ||
    updateData?.testTitle ||
    updateData?.target ||
    updateData?.targetName ||
    updateData?.selectedTest ||
    updateData?.itemName ||
    updateData?.item ||
    updates?.testName ||
    updates?.Name ||
    updates?.name ||
    updates?.test ||
    updates?.title;

  if (typeof candidateName === "string" && (candidateName.trim().toLowerCase() === "undefined" || candidateName.trim().toLowerCase() === "null")) {
    candidateName = null;
  }

  const scope = targetTenantId
    ? { $or: [{ tenantId: targetTenantId }, { createdBy: targetUserId }] }
    : (targetUserId ? { createdBy: targetUserId } : {});

  let existingTest = null;

  if (targetId && typeof targetId === "string" && /^[0-9a-fA-F]{24}$/.test(targetId)) {
    existingTest = await testSchema.findOne(buildScopedQuery(scope, {
      _id: new mongoose.Types.ObjectId(targetId)
    }));
  }

  if (!existingTest && candidateName) {
    existingTest = await findExistingSubTest(candidateName, targetTenantId, targetUserId);
    if (!existingTest) {
      existingTest = await testSchema.findOne(buildScopedQuery(scope, {
        Name: makeExactCaseInsensitiveRegex(candidateName.trim())
      }));
    }
  }

  // Fallback: try extracting from summary if name was not provided
  if (!existingTest && !candidateName && !targetId) {
    const summaryText = updateData?.summary || updateData?.description || updateData?.message || "";
    if (summaryText) {
      const allTests = await testSchema.find(scope).select("Name").limit(50).lean();
      for (const t of allTests) {
        if (t.Name && summaryText.toLowerCase().includes(t.Name.toLowerCase())) {
          existingTest = t;
          break;
        }
      }
    }
  }

  if (!existingTest && !candidateName && !targetId) {
    const allTests = await testSchema.find(scope).select("Name").limit(10).lean();
    const availableNames = allTests.map(t => `"${t.Name}"`).join(", ");
    throw new Error(`Aapne kis test ko update karna hai uska naam nahi mila. Kripya test ka naam batayein.${availableNames ? ` Aapki lab ke tests: ${availableNames}` : ""}`);
  }

  if (!existingTest) {
    const allTests = await testSchema.find(scope).select("Name").limit(10).lean();
    const availableNames = allTests.map(t => `"${t.Name}"`).join(", ");
    throw new Error(`Test '${candidateName || targetId}' database me nahi mila.${availableNames ? ` Available tests in your lab: ${availableNames}` : ""}`);
  }

  const mergedUpdates = { ...(updates || {}), ...directFields };

  // Check if renaming the test
  const newNameCandidate =
    updateData?.newName ||
    updateData?.newTestName ||
    updateData?.updatedName ||
    updates?.newName ||
    updates?.newTestName ||
    updates?.updatedName ||
    updates?.Name ||
    updates?.name ||
    (directFields?.Name && directFields.Name.trim().toLowerCase() !== existingTest.Name.trim().toLowerCase() ? directFields.Name : null);

  const setFields = {};

  if (newNameCandidate && typeof newNameCandidate === "string" && newNameCandidate.trim()) {
    const cleanNewName = newNameCandidate.trim();
    if (cleanNewName.includes(",")) throw new Error("Test Name cannot contain commas (',').");
    setFields.Name = cleanNewName;
  }
  if (mergedUpdates.Short_name !== undefined) setFields.Short_name = String(mergedUpdates.Short_name).trim();
  if (mergedUpdates.Price !== undefined) setFields.Price = Number(mergedUpdates.Price);
  if (mergedUpdates.final_price !== undefined) setFields.final_price = Number(mergedUpdates.final_price);
  if (mergedUpdates.tat !== undefined) setFields.tat = String(mergedUpdates.tat).trim();
  if (mergedUpdates.method !== undefined) setFields.method = String(mergedUpdates.method).trim();
  if (mergedUpdates.instrument !== undefined) setFields.instrument = String(mergedUpdates.instrument).trim();
  if (mergedUpdates.interpretation !== undefined) setFields.interpretation = String(mergedUpdates.interpretation);

  // CRITICAL TOGGLES
  if (mergedUpdates.hideInterpretation !== undefined) {
    setFields.hideInterpretation = Boolean(mergedUpdates.hideInterpretation);
  }
  if (mergedUpdates.hideMethodInstrument !== undefined) {
    setFields.hideMethodInstrument = Boolean(mergedUpdates.hideMethodInstrument);
  }

  if (mergedUpdates.sampleType) {
    const st = await checkOrCreateSampleType({
      sampleTypeName: mergedUpdates.sampleType,
      tenantId: targetTenantId,
      userId: targetUserId,
      role
    });
    setFields.sampleType = st;
  }

  if (mergedUpdates.categoryName || mergedUpdates.category) {
    const catName = mergedUpdates.categoryName || (typeof mergedUpdates.category === "string" ? mergedUpdates.category : mergedUpdates.category?.category);
    if (catName) {
      const catDoc = await checkOrCreateCategory({
        categoryName: catName,
        tenantId: targetTenantId,
        userId: targetUserId,
        role
      });
      setFields.category = {
        _id: catDoc._id,
        category: catDoc.category,
        orderId: catDoc.orderId || 1,
        tenantId: catDoc.tenantId
      };
    }
  }

  if (Array.isArray(mergedUpdates.parameters) && mergedUpdates.parameters.length > 0) {
    setFields.parameters = await Promise.all(mergedUpdates.parameters.map(async (p, idx) => {
      const pUnit = p.unit ? await checkOrCreateUnit({ unitName: p.unit, tenantId: targetTenantId, userId: targetUserId, role }) : "";
      const pValueType = String(p.ValueType || (p.text ? "Text" : "Numeric")).trim().toLowerCase() === "text" ? "Text" : "Numeric";
      let normalValues = [];
      if (Array.isArray(p.NormalValue) && p.NormalValue.length > 0) {
        normalValues = p.NormalValue.map(nv => ({
          gender: ["Male", "Female"].includes(String(nv.gender || "Any").trim()) ? String(nv.gender).trim() : "Any",
          minAge: String(nv.minAge ?? "0"),
          minAgeUnit: ["Years", "Months", "Days"].includes(nv.minAgeUnit) ? nv.minAgeUnit : "Years",
          maxAge: String(nv.maxAge ?? "120"),
          maxAgeUnit: ["Years", "Months", "Days"].includes(nv.maxAgeUnit) ? nv.maxAgeUnit : "Years",
          lowerValue: String(nv.lowerValue ?? ""),
          upperValue: String(nv.upperValue ?? "")
        }));
      }
      return {
        order: p.order || idx + 1,
        Para_name: p.Para_name || p.name || `Parameter ${idx + 1}`,
        unit: pUnit,
        defaultresult: p.defaultresult || "",
        masterParameterKey: p.masterParameterKey || `param_${new mongoose.Types.ObjectId().toString()}`,
        NormalValue: normalValues,
        text: p.text || "",
        ValueType: pValueType,
        lowerRange: Number(p.lowerRange || 0),
        upperRange: Number(p.upperRange || 0),
        forRandom: Boolean(p.forRandom)
      };
    }));
  }

  const updatedTest = await testSchema.findOneAndUpdate(
    { _id: existingTest._id },
    { $set: setFields },
    { new: true }
  );

  const isRenamed = updatedTest.Name !== existingTest.Name;
  const renameNote = isRenamed ? ` (Name changed: '${existingTest.Name}' ➔ '${updatedTest.Name}')` : '';

  return {
    success: true,
    createdItem: updatedTest,
    updatedItem: updatedTest,
    test: updatedTest,
    message: `Test '${updatedTest.Name}' successfully update ho gaya hai!${renameNote} (Interpretation hidden: ${updatedTest.hideInterpretation ? "Yes" : "No"}, Method/Instrument hidden: ${updatedTest.hideMethodInstrument ? "Yes" : "No"})`
  };
}

/**
 * Update an existing Panel with full field support (toggles: hide individual test interpretations/notes, method/instrument, panel interpretation)
 */
export async function executeUpdatePanel({ updateData, tenantId, userId, role }) {
  const {
    panelId,
    panelName,
    name,
    updates,
    ...directFields
  } = updateData || {};

  const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
  const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;

  const targetId =
    panelId ||
    updateData?.id ||
    updateData?._id ||
    updates?.panelId ||
    updates?.id ||
    updates?._id;

  let targetName =
    panelName ||
    name ||
    updateData?.panel ||
    updateData?.panel_name ||
    updateData?.title ||
    updateData?.panelTitle ||
    updateData?.testName ||
    updateData?.test ||
    updateData?.target ||
    updateData?.targetName ||
    updateData?.selectedPanel ||
    updateData?.itemName ||
    updateData?.item ||
    updates?.panelName ||
    updates?.name ||
    updates?.panel ||
    updates?.title ||
    updates?.testName;

  if (typeof targetName === "string" && (targetName.trim().toLowerCase() === "undefined" || targetName.trim().toLowerCase() === "null")) {
    targetName = null;
  }

  let existingPanel = null;

  const scope = targetTenantId
    ? { $or: [{ tenantId: targetTenantId }, { createdBy: targetUserId }] }
    : (targetUserId ? { createdBy: targetUserId } : {});

  if (targetId && typeof targetId === "string" && /^[0-9a-fA-F]{24}$/.test(targetId)) {
    existingPanel = await addPannel.findOne(buildScopedQuery(scope, {
      _id: new mongoose.Types.ObjectId(targetId)
    }));
  }

  if (!existingPanel && targetName) {
    existingPanel = await findExistingPanel(targetName, targetTenantId, targetUserId);
  }

  // Fallback 1: scan all panels in tenant scope and match with token overlap
  if (!existingPanel && targetName) {
    const allTenantPanels = await addPannel.find(scope).lean();
    const searchTokens = targetName.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 1);
    let bestMatch = null;
    let highestScore = 0;

    for (const p of allTenantPanels) {
      if (!p.name) continue;
      const pTokens = p.name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 1);
      let matchCount = 0;
      for (const tok of searchTokens) {
        if (pTokens.includes(tok)) matchCount++;
      }
      if (matchCount > highestScore) {
        highestScore = matchCount;
        bestMatch = p;
      }
    }

    if (bestMatch && highestScore > 0) {
      existingPanel = bestMatch;
    }
  }

  // Fallback 2: if targetName was not provided at all, inspect summary or description
  if (!existingPanel && !targetName && !targetId) {
    const summaryText = updateData?.summary || updateData?.description || updateData?.message || "";
    if (summaryText) {
      const allTenantPanels = await addPannel.find(scope).select("name").lean();
      for (const p of allTenantPanels) {
        if (p.name && summaryText.toLowerCase().includes(p.name.toLowerCase())) {
          existingPanel = p;
          break;
        }
      }
    }
  }

  if (!existingPanel && !targetName && !targetId) {
    const allPanels = await addPannel.find(scope).select("name").limit(10).lean();
    const availableNames = allPanels.map(p => `"${p.name}"`).join(", ");
    throw new Error(`Aapne kis panel ko update karna hai uska naam nahi mila. Kripya batayein ki aap kis panel ko update karna chahte hain (jaise: 'Kidney Function Profile').${availableNames ? ` Available panels: ${availableNames}` : ""}`);
  }

  if (!existingPanel) {
    const allPanels = await addPannel.find(scope).select("name").limit(10).lean();
    const availableNames = allPanels.map(p => `"${p.name}"`).join(", ");
    throw new Error(`Panel '${targetName || targetId}' database me nahi mila.${availableNames ? ` Available panels in your lab: ${availableNames}` : ""}`);
  }

  const mergedUpdates = { ...(updates || {}), ...directFields };

  // Check if renaming the panel
  const newNameCandidate =
    updateData?.newName ||
    updateData?.newPanelName ||
    updateData?.updatedName ||
    updates?.newName ||
    updates?.newPanelName ||
    updates?.updatedName ||
    updates?.name ||
    updates?.Name ||
    (directFields?.name && directFields.name.trim().toLowerCase() !== existingPanel.name.trim().toLowerCase() ? directFields.name : null);

  const setFields = {};

  if (newNameCandidate && typeof newNameCandidate === "string" && newNameCandidate.trim()) {
    const cleanNewName = newNameCandidate.trim();
    if (cleanNewName.includes(",")) throw new Error("Panel Name cannot contain commas (',').");
    setFields.name = cleanNewName;
  }

  if (mergedUpdates.price !== undefined) setFields.price = Number(mergedUpdates.price);
  if (mergedUpdates.final_price !== undefined) setFields.final_price = Number(mergedUpdates.final_price);
  if (mergedUpdates.interpretation !== undefined) setFields.interpretation = String(mergedUpdates.interpretation);

  // Category update if requested
  if (mergedUpdates.category || mergedUpdates.categoryName) {
    const catName = mergedUpdates.categoryName || (typeof mergedUpdates.category === "string" ? mergedUpdates.category : mergedUpdates.category?.category);
    if (catName && typeof catName === "string" && catName.trim()) {
      const catDoc = await checkOrCreateCategory({
        categoryName: catName.trim(),
        tenantId: targetTenantId,
        userId: targetUserId,
        role
      });
      setFields.category = {
        _id: catDoc._id,
        category: catDoc.category,
        orderId: catDoc.orderId || 1,
        tenantId: catDoc.tenantId
      };
    }
  }

  // Sample types update if requested
  if (mergedUpdates.sampleType || mergedUpdates.sample_types) {
    const rawSt = mergedUpdates.sample_types || mergedUpdates.sampleType;
    const stArr = Array.isArray(rawSt) ? rawSt : [rawSt];
    setFields.sample_types = stArr.filter(Boolean).map(s => String(s).trim());
  }

  // Short Name update (e.g. LFT, KFT, RFT)
  const candidateShortName =
    mergedUpdates.Short_name !== undefined ? mergedUpdates.Short_name :
    mergedUpdates.shortName !== undefined ? mergedUpdates.shortName :
    mergedUpdates.short_name !== undefined ? mergedUpdates.short_name :
    mergedUpdates.code !== undefined ? mergedUpdates.code :
    updateData?.Short_name !== undefined ? updateData?.Short_name :
    updateData?.shortName !== undefined ? updateData?.shortName :
    updateData?.short_name !== undefined ? updateData?.short_name :
    updateData?.code;

  if (candidateShortName !== undefined && candidateShortName !== null) {
    setFields.Short_name = String(candidateShortName).trim();
  }

  // CRITICAL TOGGLES
  if (mergedUpdates.hideInterpretation !== undefined) {
    setFields.hideInterpretation = Boolean(mergedUpdates.hideInterpretation);
  }
  if (mergedUpdates.hideMethodInstrument !== undefined) {
    setFields.hideMethodInstrument = Boolean(mergedUpdates.hideMethodInstrument);
  }
  if (mergedUpdates.hidePanelInterpretation !== undefined) {
    setFields.hidePanelInterpretation = Boolean(mergedUpdates.hidePanelInterpretation);
    setFields.hidepanelinterpretation = Boolean(mergedUpdates.hidePanelInterpretation);
  }

  // Constituent sub-tests updates (supports: replace testNames, addTests, removeTests)
  let candidateTestNames = mergedUpdates.testNames || mergedUpdates.tests;
  const addTestNames = mergedUpdates.addTests || mergedUpdates.addTestNames;
  const removeTestNames = mergedUpdates.removeTests || mergedUpdates.removeTestNames;

  if (Array.isArray(addTestNames) && addTestNames.length > 0) {
    const currentTests = Array.isArray(existingPanel.tests) ? [...existingPanel.tests] : [];
    for (const at of addTestNames) {
      if (at && typeof at === "string" && !currentTests.some(t => t.toLowerCase() === at.toLowerCase())) {
        currentTests.push(at.trim());
      }
    }
    candidateTestNames = currentTests;
  }

  if (Array.isArray(removeTestNames) && removeTestNames.length > 0) {
    const removeSet = new Set(removeTestNames.map(r => String(r).trim().toLowerCase()));
    const baseTests = candidateTestNames || existingPanel.tests || [];
    candidateTestNames = baseTests.filter(t => !removeSet.has(String(t).trim().toLowerCase()));
  }

  if (Array.isArray(candidateTestNames) && candidateTestNames.length > 0) {
    const currentSampleType = (setFields.sample_types && setFields.sample_types[0]) || existingPanel.sample_types?.[0] || "Serum";
    const subIds = [];
    const subNames = [];

    for (const tn of candidateTestNames) {
      if (!tn || typeof tn !== "string") continue;
      const cleanTn = tn.trim();
      let stDoc = await findExistingSubTest(cleanTn, targetTenantId, targetUserId, currentSampleType);
      if (!stDoc) {
        const standardDef = getStandardTestDefinition(cleanTn, currentSampleType);
        const cr = await executeCreateTest({
          testData: {
            ...standardDef,
            Name: cleanTn,
            categoryName: (setFields.category?.category || existingPanel.category?.category || "Biochemistry"),
            sampleType: currentSampleType,
            Price: Math.round(Number(setFields.final_price || existingPanel.final_price || 500) / candidateTestNames.length),
            final_price: Math.round(Number(setFields.final_price || existingPanel.final_price || 500) / candidateTestNames.length)
          },
          tenantId: targetTenantId,
          userId: targetUserId,
          role
        });
        stDoc = cr.createdItem;
      }
      if (stDoc && !subIds.some(id => id.toString() === stDoc._id.toString())) {
        subIds.push(stDoc._id);
        subNames.push(stDoc.Name);
      }
    }
    setFields.tests = subNames;
    setFields.testsId = subIds;
  }

  const updatedPanel = await addPannel.findOneAndUpdate(
    { _id: existingPanel._id },
    { $set: setFields },
    { new: true }
  );

  const isRenamed = updatedPanel.name !== existingPanel.name;
  const renameNote = isRenamed ? ` (Name changed: '${existingPanel.name}' ➔ '${updatedPanel.name}')` : '';
  const shortNameNote = updatedPanel.Short_name ? ` (Short Name: '${updatedPanel.Short_name}')` : '';

  return {
    success: true,
    updatedItem: updatedPanel,
    createdItem: updatedPanel,
    panel: updatedPanel,
    message: `Panel '${updatedPanel.name}' successfully update ho gaya hai!${renameNote}${shortNameNote} (Individual Test Notes/Interpretations Hidden: ${updatedPanel.hideInterpretation ? "Yes" : "No"}, Method/Instrument Hidden: ${updatedPanel.hideMethodInstrument ? "Yes" : "No"}, Panel Interpretation Hidden: ${updatedPanel.hidePanelInterpretation ? "Yes" : "No"})`
  };
}

/**
 * Update an existing Package
 */
export async function executeUpdatePackage({ updateData, tenantId, userId, role }) {
  const {
    packageId,
    packageName,
    name,
    updates,
    ...directFields
  } = updateData || {};

  const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
  const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;

  const targetId =
    packageId ||
    updateData?.id ||
    updateData?._id ||
    updates?.packageId ||
    updates?.id ||
    updates?._id;

  let targetName =
    packageName ||
    name ||
    updateData?.pkgName ||
    updateData?.package ||
    updateData?.title ||
    updateData?.packageTitle ||
    updateData?.target ||
    updateData?.targetName ||
    updateData?.selectedPackage ||
    updateData?.itemName ||
    updateData?.item ||
    updates?.packageName ||
    updates?.name ||
    updates?.package ||
    updates?.title;

  if (typeof targetName === "string" && (targetName.trim().toLowerCase() === "undefined" || targetName.trim().toLowerCase() === "null")) {
    targetName = null;
  }

  const scope = targetTenantId
    ? { $or: [{ tenantId: targetTenantId }, { createdBy: targetUserId }] }
    : (targetUserId ? { createdBy: targetUserId } : {});

  let existingPkg = null;

  if (targetId && typeof targetId === "string" && /^[0-9a-fA-F]{24}$/.test(targetId)) {
    existingPkg = await Package.findOne(buildScopedQuery(scope, {
      _id: new mongoose.Types.ObjectId(targetId)
    }));
  }

  if (!existingPkg && targetName) {
    existingPkg = await Package.findOne(buildScopedQuery(scope, {
      $or: [
        { packageName: targetName.trim() },
        { packageName: makeExactCaseInsensitiveRegex(targetName.trim()) }
      ]
    }));
  }

  if (!existingPkg && !targetName && !targetId) {
    const allPkgs = await Package.find(scope).select("packageName").limit(10).lean();
    const availableNames = allPkgs.map(p => `"${p.packageName}"`).join(", ");
    throw new Error(`Aapne kis package ko update karna hai uska naam nahi mila. Kripya package ka naam batayein.${availableNames ? ` Available packages: ${availableNames}` : ""}`);
  }

  if (!existingPkg) {
    const allPkgs = await Package.find(scope).select("packageName").limit(10).lean();
    const availableNames = allPkgs.map(p => `"${p.packageName}"`).join(", ");
    throw new Error(`Package '${targetName || targetId}' database me nahi mila.${availableNames ? ` Available packages: ${availableNames}` : ""}`);
  }

  const mergedUpdates = { ...(updates || {}), ...directFields };

  // Check if renaming the package
  const newNameCandidate =
    updateData?.newPackageName ||
    updateData?.newName ||
    updateData?.updatedName ||
    updates?.newPackageName ||
    updates?.newName ||
    updates?.updatedName ||
    updates?.packageName ||
    updates?.name ||
    (directFields?.packageName && directFields.packageName.trim().toLowerCase() !== existingPkg.packageName.trim().toLowerCase() ? directFields.packageName : null);

  const setFields = {};

  if (newNameCandidate && typeof newNameCandidate === "string" && newNameCandidate.trim()) {
    const cleanNewName = newNameCandidate.trim();
    if (cleanNewName.includes(",")) throw new Error("Package Name cannot contain commas (',').");
    setFields.packageName = cleanNewName;
  }
  if (mergedUpdates.packageFee !== undefined) setFields.packageFee = String(mergedUpdates.packageFee);
  if (mergedUpdates.final_price !== undefined) setFields.final_price = String(mergedUpdates.final_price);
  if (mergedUpdates.packageGender && ["male", "female", "Both"].includes(mergedUpdates.packageGender)) {
    setFields.packageGender = mergedUpdates.packageGender;
  }

  const updatedPkg = await Package.findOneAndUpdate(
    { _id: existingPkg._id },
    { $set: setFields },
    { new: true }
  );

  const isRenamed = updatedPkg.packageName !== existingPkg.packageName;
  const renameNote = isRenamed ? ` (Name changed: '${existingPkg.packageName}' ➔ '${updatedPkg.packageName}')` : '';

  return {
    success: true,
    createdItem: updatedPkg,
    updatedItem: updatedPkg,
    package: updatedPkg,
    message: `Package '${updatedPkg.packageName}' successfully update ho gaya hai!${renameNote}`
  };
}

/**
 * Execute fix for a single test
 */
export async function executeFixTest({ testId, currentName, testName, updates, tenantId, userId, role }) {
  const query = buildTestLookupQuery({ testId, currentName, testName }, tenantId, userId);
  if (!query) throw new Error("Could not identify the test to update (invalid testId and missing testName)");

  const updatedTest = await testSchema.findOneAndUpdate(
    query,
    { $set: updates },
    { new: true }
  );

  if (!updatedTest) {
    throw new Error("Test not found or no permission to edit");
  }

  return {
    success: true,
    test: updatedTest,
    message: `Test '${updatedTest.Name}' successfully updated with standard medical fields!`
  };
}

/**
 * Execute batch fixes for multiple tests
 */
export async function executeBatchFixTests({ fixes = [], tenantId, userId, role }) {
  if (!Array.isArray(fixes) || fixes.length === 0) {
    throw new Error("No fixes provided for batch update");
  }

  let updatedCount = 0;
  for (const fix of fixes) {
    if (!fix.updates) continue;
    const query = buildTestLookupQuery(fix, tenantId, userId);
    if (!query) continue;

    try {
      const res = await testSchema.updateOne(query, { $set: fix.updates });
      if (res.modifiedCount > 0) updatedCount++;
    } catch (err) {
      console.warn("Failed to apply fix for:", fix?.testId || fix?.currentName, err.message);
    }
  }

  return {
    success: true,
    updatedCount,
    message: `${updatedCount} test(s) in your database were successfully fixed and enriched with standard medical data!`
  };
}




/**
 * Resolve standard short name for a panel based on standard pathology profiles
 */
export function resolveStandardPanelShortName(panelName) {
  if (!panelName || typeof panelName !== "string") return "";
  const clean = panelName.trim();
  const lower = clean.toLowerCase();

  // 1. Direct parentheses extraction if already has abbreviation like "Liver Function Test (LFT)" or "COMPLETE BLOOD COUNT (CBC)"
  const parenMatch = clean.match(/\(([A-Za-z0-9\s\-_+]+)\)/);
  if (parenMatch && parenMatch[1].trim().length <= 8) {
    const candidate = parenMatch[1].trim().toUpperCase();
    if (!["ANIMALS", "BASIC", "SERUM", "URINE"].includes(candidate)) {
      return candidate;
    }
  }

  // 2. Check STANDARD_PATHOLOGY_PANELS aliases
  for (const [key, panelDef] of Object.entries(STANDARD_PATHOLOGY_PANELS)) {
    const aliases = [key, panelDef.name.toLowerCase(), panelDef.shortName.toLowerCase(), ...(panelDef.aliases || []).map(a => a.toLowerCase())];
    if (aliases.some(a => lower === a || lower.includes(a) || a.includes(lower))) {
      return panelDef.shortName;
    }
  }

  // 3. Common clinical mappings
  if (lower.includes("liver") || lower.includes("hepatic")) return "LFT";
  if (lower.includes("kidney") || lower.includes("renal")) return "KFT";
  if (lower.includes("lipid") || lower.includes("cholesterol")) return "LIPID";
  if (lower.includes("thyroid") || lower.includes("t3 t4 tsh")) return "TFT";
  if (lower.includes("blood count") || lower.includes("cbc") || lower.includes("hemogram") || lower.includes("blood picture") || lower.includes("cbp")) return "CBC";
  if (lower.includes("electrolyte")) return "ELECTRO";
  if (lower.includes("urine examination") || lower.includes("urine routine") || lower.includes("cue") || lower.includes("urinalysis")) return "URINE-RE";
  if (lower.includes("viral marker") || lower.includes("viral")) return "VIRAL";
  if (lower.includes("bilirubin")) return "BILIRUBIN";
  if (lower.includes("differential") || lower.includes("dlc")) return "DLC";

  // 4. Fallback: generate clean 3-5 character acronym from uppercase initials
  const words = clean.replace(/[^a-zA-Z0-9\s]/g, " ").trim().split(/\s+/).filter(w => w.length > 0 && !["AND", "THE", "OF", "FOR", "IN"].includes(w.toUpperCase()));
  if (words.length >= 2 && words.length <= 5) {
    return words.map(w => w[0].toUpperCase()).join("");
  }

  return clean.slice(0, 5).toUpperCase();
}

/**
 * Audit panels in database for missing Short_name
 */
export async function auditPanelsInDatabase({ tenantId, userId, role }) {
  const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
  const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;
  const scope = (targetTenantId && targetUserId)
    ? { $or: [{ tenantId: targetTenantId }, { createdBy: targetUserId }] }
    : (targetTenantId ? { tenantId: targetTenantId } : (targetUserId ? { $or: [{ createdBy: targetUserId }, { createdByRole: "superAdmin" }, { isBasePanel: true }] } : {}));

  const panels = await addPannel.find(scope).lean();

  const issues = [];
  const fixes = [];

  for (const p of panels) {
    const isShortNameMissing = !p.Short_name || String(p.Short_name).trim() === "";
    if (isShortNameMissing) {
      const suggestedShort = resolveStandardPanelShortName(p.name);
      const fixItem = {
        panelId: String(p._id),
        name: p.name,
        currentName: p.name,
        panelName: p.name,
        category: p.category?.category || p.category || "Biochemistry",
        currentShortName: "",
        suggestedShortName: suggestedShort,
        updates: {
          Short_name: suggestedShort
        }
      };
      issues.push(fixItem);
      fixes.push(fixItem);
    }
  }

  return {
    totalPanels: panels.length,
    totalIssuesFound: issues.length,
    issues,
    fixes
  };
}

/**
 * Execute batch updates for panels (e.g. adding Short_name to all panels)
 */
export async function executeBatchUpdatePanels({ fixes = [], tenantId, userId, role }) {
  if (!Array.isArray(fixes) || fixes.length === 0) {
    throw new Error("No panel fixes provided for batch update");
  }

  let updatedCount = 0;
  for (const fix of fixes) {
    if (!fix.updates && !fix.Short_name && !fix.suggestedShortName) continue;
    const rawId = fix?.panelId || fix?.id || fix?._id;
    let query = null;

    if (rawId && typeof rawId === "string" && /^[0-9a-fA-F]{24}$/.test(rawId)) {
      query = { _id: new mongoose.Types.ObjectId(rawId) };
    } else if (fix?.panelName || fix?.name || fix?.currentName) {
      const cName = fix.panelName || fix.name || fix.currentName;
      const targetTenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
      const targetUserId = userId ? new mongoose.Types.ObjectId(userId) : null;
      const scope = (targetTenantId && targetUserId)
        ? { $or: [{ tenantId: targetTenantId }, { createdBy: targetUserId }] }
        : (targetTenantId ? { tenantId: targetTenantId } : (targetUserId ? { createdBy: targetUserId } : {}));
      query = { name: makeExactCaseInsensitiveRegex(cName.trim()), ...scope };
    }

    if (!query) continue;

    const setObj = {};
    if (fix.updates) {
      Object.assign(setObj, fix.updates);
    }
    if (fix.Short_name) setObj.Short_name = String(fix.Short_name).trim();
    if (fix.suggestedShortName && !setObj.Short_name) setObj.Short_name = String(fix.suggestedShortName).trim();

    try {
      const res = await addPannel.updateOne(query, { $set: setObj });
      if (res.modifiedCount > 0) updatedCount++;
    } catch (err) {
      console.warn("Failed to apply panel fix for:", fix?.panelId || fix?.name, err.message);
    }
  }

  return {
    success: true,
    updatedCount,
    message: `${updatedCount} panel(s) in your lab catalog were successfully updated with short names and are now searchable in booking!`
  };
}
