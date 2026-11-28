import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { categorydb, Counter } from "../models/category.model.js"
import { testSchema } from "../models/newTest.model.js"
import { testCounter } from "../models/counterTests.model.js"
import mongoose from "mongoose"
import { sampleSchema } from "../models/sampletype.model.js";
import { unitdb } from "../models/category.model.js";
import { addPannel } from "../models/AddPannel.model.js";
import { Package } from "../models/addPackage.model.js";
import { Tenant } from "../models/tenant.model.js";
import { User } from "../models/user.model.js";
import { SuperAdmin } from "../models/superAdmin.model.js";
import { getNextBookingCodeForScope } from "../utils/bookingCode.js";
import { Formula } from "../models/formula.model.js";
import { resolveCategoryForScope } from "../utils/categorySnapshot.js";


const parseBooleanInput = (value) => value === true || value === "true" || value === 1 || value === "1";
const toIdString = (value) => {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object" && value._id) return String(value._id);
    return String(value);
};

const createMasterParameterKey = () => `param_${new mongoose.Types.ObjectId().toString()}`;

const buildParameterLabel = (testName, parameterName) => {
    const safeTestName = String(testName || "Test").trim();
    const safeParameterName = String(parameterName || safeTestName || "Parameter").trim();

    if (!safeTestName) return safeParameterName;
    if (safeTestName.toLowerCase() === safeParameterName.toLowerCase()) {
        return safeParameterName;
    }

    return `${safeParameterName} (${safeTestName})`;
};

function normalizeParameterPayload(parameters = [], existingParameters = []) {
    const existingById = new Map();
    const existingByMasterKey = new Map();
    const existingByOriginalParameterId = new Map();
    const existingByNameOrder = new Map();

    for (const parameter of Array.isArray(existingParameters) ? existingParameters : []) {
        const parameterId = toIdString(parameter?._id);
        const masterParameterKey = String(parameter?.masterParameterKey || "").trim();
        const originalParameterId = toIdString(parameter?.originalParameterId);
        const nameOrderKey = `${String(parameter?.Para_name || "").trim().toLowerCase()}::${String(parameter?.order || "")}`;

        if (parameterId) existingById.set(parameterId, parameter);
        if (masterParameterKey) existingByMasterKey.set(masterParameterKey, parameter);
        if (originalParameterId) existingByOriginalParameterId.set(originalParameterId, parameter);
        if (nameOrderKey) existingByNameOrder.set(nameOrderKey, parameter);
    }

    return (Array.isArray(parameters) ? parameters : []).map((parameter) => {
        const incomingParameterId = toIdString(parameter?.parameterId || parameter?._id);
        const incomingMasterKey = String(parameter?.masterParameterKey || "").trim();
        const incomingOriginalParameterId = toIdString(parameter?.originalParameterId);
        const nameOrderKey = `${String(parameter?.Para_name || "").trim().toLowerCase()}::${String(parameter?.order || "")}`;

        const matchedExistingParameter =
            existingById.get(incomingParameterId) ||
            existingByMasterKey.get(incomingMasterKey) ||
            existingByOriginalParameterId.get(incomingOriginalParameterId) ||
            existingByNameOrder.get(nameOrderKey) ||
            null;

        const masterParameterKey =
            incomingMasterKey ||
            String(matchedExistingParameter?.masterParameterKey || "").trim() ||
            createMasterParameterKey();

        const originalParameterId =
            incomingOriginalParameterId ||
            toIdString(matchedExistingParameter?.originalParameterId) ||
            null;

        const normalizeOptionalNumber = (value) => {
            if (value === undefined || value === null || String(value).trim() === "") return null;
            const number = Number(value);
            return Number.isFinite(number) ? number : null;
        };

        return {
            ...parameter,
            // These fields are Numbers in the parameter schema. The catalog form
            // submits empty strings for blank inputs, which Mongoose cannot cast.
            lowerRange: normalizeOptionalNumber(parameter?.lowerRange),
            upperRange: normalizeOptionalNumber(parameter?.upperRange),
            forRandom: parseBooleanInput(parameter?.forRandom),
            masterParameterKey,
            originalParameterId,
        };
    });
}

async function ensureTestDocumentsHaveMasterKeys(testRecords) {
    const records = Array.isArray(testRecords) ? testRecords : [testRecords];

    for (const testRecord of records) {
        if (!testRecord?.parameters?.length) {
            continue;
        }

        let hasChanges = false;

        for (const parameter of testRecord.parameters) {
            const masterParameterKey = String(parameter?.masterParameterKey || "").trim();
            if (masterParameterKey) {
                continue;
            }

            parameter.masterParameterKey = createMasterParameterKey();
            hasChanges = true;
        }

        if (hasChanges && typeof testRecord.save === "function") {
            testRecord.markModified("parameters");
            await testRecord.save();
        }
    }

    return testRecords;
}

// FIXED (performance): builds an in-memory resolver that maps a stored category
// reference (ObjectId / string / category document / array of documents) to the
// tenant's own copy of that category. This replaces 1-2 database round trips that
// used to run for every single test/panel that was being copied.
function buildCategoryResolver(categories = []) {
    const byId = new Map();
    const byOriginalId = new Map();
    const byName = new Map();

    const register = (category) => {
        if (!category) return;

        const idStr = toIdString(category._id);
        if (idStr && !byId.has(idStr)) {
            byId.set(idStr, category);
        }

        const originalId = toIdString(category.originalCategoryId);
        if (originalId && !byOriginalId.has(originalId)) {
            byOriginalId.set(originalId, category);
        }

        const name = category.category == null ? "" : String(category.category);
        if (name && !byName.has(name)) {
            byName.set(name, category);
        }
    };

    for (const category of Array.isArray(categories) ? categories : []) {
        register(category);
    }

    return {
        register,
        resolve(reference) {
            let entry = null;

            if (Array.isArray(reference)) {
                entry = reference.length > 0 ? reference[0] : null;
            } else if (reference && typeof reference === "object") {
                entry = reference;
            }

            // Primitive references are kept as-is (same behaviour as before)
            if (!entry) {
                return reference;
            }

            if (entry._id) {
                const entryId = toIdString(entry._id);
                const byOwnId = byId.get(entryId);
                if (byOwnId) return byOwnId;

                const byOrig = byOriginalId.get(entryId);
                if (byOrig) return byOrig;

                if (entry.category) {
                    const matchedByName = byName.get(String(entry.category));
                    if (matchedByName) return matchedByName;
                }
                return entry;
            }

            if (entry.category) {
                return byName.get(String(entry.category)) || entry.category;
            }

            return reference;
        },
    };
}

function resolveFormulaScopeId(user) {
    if (!user) return null;
    if (user.tenantId?._id) return user.tenantId._id;
    if (user.role === "staff" && user.parentUser) return user.parentUser;
    return user._id || null;
}

function normalizeObjectIdArray(values = []) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const cleaned = [];
    for (const val of values) {
        const idStr = toIdString(val).trim();
        if (!idStr || !mongoose.isValidObjectId(idStr) || seen.has(idStr)) continue;
        seen.add(idStr);
        cleaned.push(idStr);
    }
    return cleaned;
}

function isTransactionUnsupportedError(error) {
    const msg = String(error?.message || "");
    return /Transaction numbers are only allowed on a replica set member|replica set/i.test(msg);
}

async function copyScopedFormulasToTenant({
    session,
    sourceScopeId,
    sourceScopeIds = [],
    targetTenantId,
    createdBy,
    relevantMasterKeys = [],
    sourceParameterEntries = [],
}) {
    const normalizedMasterKeys = [...new Set((relevantMasterKeys || []).filter(Boolean).map(String))];
    const normalizedSourceEntries = Array.isArray(sourceParameterEntries) ? sourceParameterEntries : [];
    const sourceParameterIds = normalizedSourceEntries
        .map((entry) => toIdString(entry?.parameterId))
        .filter(Boolean);

    const scopeCandidates = [
        ...(Array.isArray(sourceScopeIds) ? sourceScopeIds : []),
        sourceScopeId,
    ]
        .map((val) => toIdString(val).trim())
        .filter((val) => val && mongoose.isValidObjectId(val));
    const uniqueScopeIds = [...new Set(scopeCandidates)].map((id) => new mongoose.Types.ObjectId(id));

    if (!uniqueScopeIds.length || !targetTenantId || (!normalizedMasterKeys.length && !sourceParameterIds.length)) {
        return 0;
    }

    const sourceFormulasQuery = Formula.find({
        tenantId: uniqueScopeIds.length === 1 ? uniqueScopeIds[0] : { $in: uniqueScopeIds },
        $or: [
            { targetMasterKey: { $in: normalizedMasterKeys } },
            { targetParameterId: { $in: sourceParameterIds } },
            { "dependencies.parameterMasterKey": { $in: normalizedMasterKeys } },
        ],
    });
    if (session) sourceFormulasQuery.session(session);
    const sourceFormulas = await sourceFormulasQuery.lean();

    if (!sourceFormulas.length) {
        return 0;
    }

    const sourceParameterMapById = new Map();
    for (const entry of normalizedSourceEntries) {
        const parameterId = toIdString(entry?.parameterId);
        if (!parameterId) {
            continue;
        }

        sourceParameterMapById.set(parameterId, {
            masterParameterKey: String(entry?.masterParameterKey || "").trim(),
            label: String(entry?.label || "").trim(),
        });
    }

    const targetTestsQuery = testSchema
        .find({ tenantId: targetTenantId })
        .select("_id Name parameters");
    if (session) targetTestsQuery.session(session);
    const targetTests = await targetTestsQuery.lean();

    const targetParameterMap = new Map();
    for (const test of targetTests) {
        for (const parameter of Array.isArray(test.parameters) ? test.parameters : []) {
            const masterKey = String(parameter?.masterParameterKey || "").trim();
            if (!masterKey) continue;
            targetParameterMap.set(masterKey, {
                testId: test._id,
                parameterId: parameter._id,
                label: buildParameterLabel(test.Name, parameter.Para_name || test.Name || "Parameter"),
            });
        }
    }

    const formulaUpserts = [];
    const seenTargetKeys = new Set();

    for (const formula of sourceFormulas) {
        const fallbackTargetMasterKey =
            String(formula.targetMasterKey || "").trim() ||
            String(sourceParameterMapById.get(toIdString(formula.targetParameterId))?.masterParameterKey || "").trim();
        if (!fallbackTargetMasterKey || seenTargetKeys.has(fallbackTargetMasterKey)) {
            continue;
        }
        const targetEntry = targetParameterMap.get(fallbackTargetMasterKey);
        if (!targetEntry) {
            continue;
        }

        const dependencies = [];
        let isFormulaResolvable = true;
        let normalizedExpression = String(formula.expression || "");

        for (const dependency of formula.dependencies || []) {
            const dependencyMasterKey =
                String(dependency.parameterMasterKey || "").trim() ||
                String(sourceParameterMapById.get(toIdString(dependency.parameterId))?.masterParameterKey || "").trim();
            const dependencyEntry = targetParameterMap.get(dependencyMasterKey);
            if (!dependencyEntry) {
                isFormulaResolvable = false;
                break;
            }

            dependencies.push({
                testId: dependencyEntry.testId,
                parameterId: dependencyEntry.parameterId,
                parameterMasterKey: dependencyMasterKey,
                label: dependencyEntry.label,
            });

            const legacyDependencyParameterId = toIdString(dependency.parameterId);
            if (legacyDependencyParameterId) {
                normalizedExpression = normalizedExpression.replaceAll(
                    `{{${legacyDependencyParameterId}}}`,
                    `{{${dependencyMasterKey}}}`
                );
            }
        }

        if (!isFormulaResolvable) {
            continue;
        }

        const legacyTargetParameterId = toIdString(formula.targetParameterId);
        if (legacyTargetParameterId && fallbackTargetMasterKey) {
            normalizedExpression = normalizedExpression.replaceAll(
                `{{${legacyTargetParameterId}}}`,
                `{{${fallbackTargetMasterKey}}}`
            );
        }

        seenTargetKeys.add(fallbackTargetMasterKey);
        formulaUpserts.push({
            updateOne: {
                filter: {
                    tenantId: targetTenantId,
                    targetMasterKey: fallbackTargetMasterKey,
                },
                update: {
                    $set: {
                        tenantId: targetTenantId,
                        targetTestId: targetEntry.testId,
                        targetParameterId: targetEntry.parameterId,
                        targetMasterKey: fallbackTargetMasterKey,
                        targetLabel: targetEntry.label,
                        expression: normalizedExpression,
                        displayExpression: formula.displayExpression || formula.expression,
                        dependencies,
                        precision: formula.precision ?? 2,
                        notes: formula.notes || "",
                        isActive: formula.isActive !== false,
                        allowManualOverride: Boolean(formula.allowManualOverride),
                        validationStatus: formula.validationStatus || "valid",
                        lastValidatedAt: formula.lastValidatedAt || new Date(),
                        updatedBy: createdBy,
                    },
                    $setOnInsert: {
                        createdBy,
                    },
                },
                upsert: true,
            },
        });
    }

    // PERFORMANCE: one bulk write instead of one round trip per formula
    if (formulaUpserts.length > 0) {
        const bulkOptions = session ? { session, ordered: false } : { ordered: false };
        await Formula.bulkWrite(formulaUpserts, bulkOptions);
        return formulaUpserts.length;
    }

    return 0;
}


// superAdmin creating Test
const addingTest = asyncHandler(async (req, res) => {
    // trim all values in req.body
    Object.entries(req.body).forEach(([key, value]) => {
        if (typeof value === "string") {
            req.body[key] = value.trim()
        }
    })

    let userId;
    if (req.user.role === "staff") {
        // Agar staff hai to parentUser ke according test lana hai
        userId = req.user.parentUser;
    } else {
        userId = req.user._id;
    }

    const userRole = req.user.role;
    const normalizedHideMethodInstrument = parseBooleanInput(req.body.hideMethodInstrument);
    const normalizedHideInterpretation = parseBooleanInput(req.body.hideInterpretation);

    const {
        Name,
        final_price,
        Short_name,
        tat,
        category,
        Price,
        sampleType,
        method,
        instrument,
        parameters,
        interpretation,
        hideMethodInstrument,
        hideInterpretation,
        isDocumentedTest,
        user
    } = req.body;
    // const superAdmin = req.user.id // get the super admin id from token 

    const isBlankField = (v) => v === undefined || v === null || String(v).trim() === "";
    if (!Name || !category || isBlankField(final_price) || isBlankField(Price) || !sampleType) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    // checking if test is already in database
    const allreadyExistedTest = await testSchema.findOne(
        {
            Name: String(Name).trim(),
            createdBy: userId
        }
    );

    if (allreadyExistedTest) {
        return res.status(400).json({ message: "A test with this name already exists" });
    }

    const lastPanel = await testSchema
        .findOne({ createdBy: userId })
        .sort({ order: -1 })
        .select('order');

    const nextOrder = (Number(lastPanel?.order) || 0) + 1;
    const nextBookingCode = await getNextBookingCodeForScope({
        createdBy: userId,
        createdByRole: "superAdmin"
    });
    const normalizedParameters = normalizeParameterPayload(parameters);
    const resolvedCategory = await resolveCategoryForScope({
        categoryInput: category,
        tenantId: null,
        createdBy: userId
    });

    const testCreated = await testSchema.create({
        Name,
        Short_name,
        category: resolvedCategory || category || "",
        Price,
        parameters: normalizedParameters || null,
        sampleType,
        method: method || "",
        instrument: instrument || "",
        interpretation: interpretation || "",
        hideMethodInstrument: normalizedHideMethodInstrument,
        hideInterpretation: normalizedHideInterpretation,
        order: nextOrder,
        bookingCode: nextBookingCode,
        isDocumentedTest: isDocumentedTest,
        final_price,
        tat: tat || "",
        createdBy: userId || "", // add the super admin id to the test
        originalTestId: null,
        isBaseTest: true,
        purchasedFromBaseTest: false,
        createdByRole: "superAdmin"
    })
    if (!testCreated) {
        return res.status(200).json({ message: "Failed to create test" })
    }

    // अगर staff का parentUser है तो उसे भी notify करें
    if (userRole === 'staff') {
        await SuperAdmin.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "test_create",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: "Staff created a new test",
                        testName: Name,
                        testId: testCreated._id
                    },
                    reference: {
                        model: "Test",
                        id: testCreated._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.json({
        status: 200,
        test: testCreated,
        message: "test is created sucessfully"
    })

})


// admin creating Test
const addingTesttenant = asyncHandler(async (req, res) => {
    // trim all values in req.body
    Object.entries(req.body).forEach(([key, value]) => {
        if (typeof value === "string") {
            req.body[key] = value.trim()
        }
    })


    let userId;
    if (req.user.role === "staff") {
        // Agar staff hai to parentUser ke according test lana hai
        userId = req.user.parentUser;
    } else {
        userId = req.user._id;
    }

    const tenantId = req.user.tenantId?._id; // safe optional chaining
    const normalizedHideMethodInstrument = parseBooleanInput(req.body.hideMethodInstrument);
    const normalizedHideInterpretation = parseBooleanInput(req.body.hideInterpretation);

    const {
        Name,
        final_price,
        Short_name,
        category,
        tat,
        Price,
        sampleType,
        method,
        instrument,
        parameters,
        interpretation,
        hideMethodInstrument,
        hideInterpretation,
        isDocumentedTest,
        user
    } = req.body;
    // const superAdmin = req.user.id // get the super admin id from token 

    const isBlankField = (v) => v === undefined || v === null || String(v).trim() === "";
    if (!Name || !category || isBlankField(final_price) || isBlankField(Price) || !sampleType) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    // checking if test is already in database
    const allreadyExistedTest = await testSchema.findOne(
        {
            Name: String(Name).trim(),
            tenantId: tenantId
        }
    );

    if (allreadyExistedTest) {
        return res.status(400).json({ message: "A test with this name already exists" });
    }

    const lastPanel = await testSchema
        .findOne({ tenantId })
        .sort({ order: -1 })
        .select('order');

    const nextOrder = (Number(lastPanel?.order) || 0) + 1;
    const nextBookingCode = await getNextBookingCodeForScope({ tenantId });
    const normalizedParameters = normalizeParameterPayload(parameters);
    const resolvedCategory = await resolveCategoryForScope({
        categoryInput: category,
        tenantId,
        createdBy: userId
    });

    const testCreated = await testSchema.create({
        Name,
        Short_name,
        category: resolvedCategory || category || "",
        Price,
        parameters: normalizedParameters || null,
        sampleType,
        method: method || "",
        instrument: instrument || "",
        interpretation: interpretation || "",
        hideMethodInstrument: normalizedHideMethodInstrument,
        hideInterpretation: normalizedHideInterpretation,
        order: nextOrder,
        bookingCode: nextBookingCode,
        isDocumentedTest: isDocumentedTest,
        final_price,
        tat: tat || "",
        createdBy: userId || "", // add the super admin id to the test
        originalTestId: null,
        isBaseTest: true,
        purchasedFromBaseTest: false,
        tenantId: tenantId,
        createdByRole: "admin"
    })
    if (!testCreated) {
        return res.status(200).json({ message: "Failed to create test" })
    }

    // अगर staff का parentUser है तो उसे भी notify करें
    if (req.user.role === 'staff') {
        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "test_create",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: "Staff created a new test",
                        testName: Name,
                        testId: testCreated._id
                    },
                    reference: {
                        model: "Test",
                        id: testCreated._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.json({
        status: 200,
        test: testCreated,
        message: "test is created sucessfully"
    })
})

// create superAdmin sample correct 
const addsample = async (req, res) => {
    const { Name, user } = req.body;
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }
    if (!Name) {
        return res.status(400).json({ message: "! please enter Name" })
    }

    const duplicate = await sampleSchema.findOne({
        createdBy: userId,
        Name: Name,
        isBaseSample: true,
    })

    if (duplicate) {
        return res.status(400).json({ message: "! This sampletype is already present" })
    }

    const createddoc = await sampleSchema.create({
        tenantId: null,
        Name: Name,
        createdBy: userId,
        isBaseSample: true,
        purchasedFromBaseSample: false,
        createdByRole: "superAdmin",
    })

    if (!createddoc) {
        return res.status(401).json({ message: "! Something went wrong, please try again" })
    }

    if (req.user.role === 'staff') {
        await SuperAdmin.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "test_create",
                    details: {
                        staffId: userId,
                        staffName: req.user.fullName,
                        action: "Staff created a new Sample",
                        sampleName: Name,
                        sampleId: createddoc._id
                    },
                    reference: {
                        model: "sample",
                        id: createddoc._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.status(200).json({ message: "sample added successfully" });

}

// create admin sample correct 
const addsampleadmin = async (req, res) => {
    const { Name, user } = req.body;
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }
    if (!Name) {
        return res.status(400).json({ message: "! please enter Name" })
    }

    const tid = req.user.tenantId._id;

    const duplicate = await sampleSchema.findOne({
        tenantId: tid,
        Name: Name
    })

    if (duplicate) {
        return res.status(400).json({ message: "! This sampletype is already present" })
    }

    const createddoc = await sampleSchema.create({
        tenantId: tid,
        createdBy: userId,
        Name: Name,
        isBaseSample: true,
        purchasedFromBaseSample: false,
        createdByRole: "admin"
    })

    if (!createddoc) {
        return res.status(401).json({ message: "! Something went wrong, please try again" })
    }
    if (req.user.role === 'staff') {

        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "test_create",
                    details: {
                        staffId: userId,
                        staffName: req.user.fullName,
                        action: "Staff created a new Sample",
                        sampleName: Name,
                        sampleId: createddoc._id
                    },
                    reference: {
                        model: "sample",
                        id: createddoc._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.status(200).json({ message: "sample added successfully" });

}

// superAdmin fetch samples correct 
const fetchsample = async (req, res) => {

    let query = {};
    if (req.user.role === 'staff') {
        query.createdBy = req.user.parentUser
    }
    else {
        query.createdBy = req.user._id
    }

    const samples = await sampleSchema.find(query).sort({ Name: 1 });

    if (!samples) {
        return res.status(500).json({ message: "No sample types found" })
    }

    return res.status(200).json({ message: "Sample types fetched successfully", data: samples });
}

// admin fetch samples correct 
const fetchsampleadmin = async (req, res) => {

    const samples = await sampleSchema.find({
        tenantId: req.user.tenantId._id
    }).sort({ Name: 1 });

    if (!samples) {
        return res.status(500).json({ message: "No sample types found" })
    }

    return res.status(200).json({ message: "Sample types fetched successfully", data: samples });
}
// Todo: Update test interpretation
const updateTestInterpretation = asyncHandler(async (req, res) => {

    const { testId, interpretation } = req.body;
let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }
    const tid = req.user.tenantId?._id; // safe optional chaining

    if (!testId || !interpretation) {
        throw new ApiError(400, "Test ID and interpretation are required.");
    }

    // Find the test by testId and update the interpretation
    const updatedTest = await testSchema.findOneAndUpdate(
        {
            _id: testId,
            tenantId: tid,
        },
        { interpretation: interpretation }, // Only update the interpretation field
        { new: true } // Return the updated document
    );

    if (!updatedTest) {
        throw new ApiError(404, "Test not found.");
    }

      // अगर staff का parentUser है तो उसे भी notify करें
    if (req.user.role === 'staff') {
        await SuperAdmin.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "Other",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: "Staff updated a Interpretation of Test",
                        testName: updatedTest.Name,
                        testId: updatedTest._id
                    },
                    reference: {
                        model: "Test",
                        id: updatedTest._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.json({
        status: 200,
        test: updatedTest,
        message: "Test interpretation updated successfully"
    });
});

/**
 * Resolve tenant/owner query scope consistently for catalog reorder APIs.
 */
const parseOrderPayload = (body = {}) => {
    if (Array.isArray(body.updatedOrder) && body.updatedOrder.length > 0) {
        return body.updatedOrder;
    }
    if (Array.isArray(body.orderedIds) && body.orderedIds.length > 0) {
        return body.orderedIds.map((id, idx) => ({ id, order: idx + 1 }));
    }
    return [];
};

const updateTestOrder = asyncHandler(async (req, res) => {
    const updatedOrder = parseOrderPayload(req.body);
    const tid = req.user.tenantId._id;
    if (!Array.isArray(updatedOrder) || updatedOrder.length === 0) {
        throw new ApiError(400, "Invalid or empty order data");
    }

    try {
        const dedupedMap = new Map();
        for (const orderData of updatedOrder) {
            let { id, order } = orderData || {};
            const numericOrder = Number(order);
            if (!Number.isFinite(numericOrder) || numericOrder < 1) {
                throw new ApiError(400, `Invalid order value: ${order}`);
            }

            if (mongoose.isValidObjectId(id)) {
                id = new mongoose.Types.ObjectId(id);
            } else if (typeof id !== "number" && id !== undefined && id !== null) {
                const idofNumber = parseInt(id, 10);
                const test = await testSchema.findOne({
                    order: idofNumber,
                    tenantId: tid
                }).select("_id").lean();
                if (!test) {
                    throw new ApiError(400, `Test with order ${id} not found`);
                }
                id = test._id;
            } else {
                throw new ApiError(400, `Invalid test ID: ${id}`);
            }

            dedupedMap.set(String(id), {
                updateOne: {
                    filter: { _id: id, tenantId: tid },
                    update: { $set: { order: Math.round(numericOrder) } },
                },
            });
        }

        const bulkOperations = Array.from(dedupedMap.values());
        if (bulkOperations.length > 0) {
            await testSchema.bulkWrite(bulkOperations);
        }

        res.json({
            status: 200,
            updatedCount: bulkOperations.length,
            message: "Test order updated successfully",
        });
    } catch (error) {
        console.error("Error updating test order:", error);
        if (error instanceof ApiError) throw error;
        throw new ApiError(500, "Failed to update test order");
    }
});

const updateTestOrdersuper = asyncHandler(async (req, res) => {
    const updatedOrder = parseOrderPayload(req.body);
    const userId = req.user.role === 'staff' ? req.user.parentUser : req.user._id;
    if (!Array.isArray(updatedOrder) || updatedOrder.length === 0) {
        throw new ApiError(400, "Invalid or empty order data");
    }

    try {
        const dedupedMap = new Map();
        for (const orderData of updatedOrder) {
            let { id, order } = orderData || {};
            const numericOrder = Number(order);
            if (!Number.isFinite(numericOrder) || numericOrder < 1) {
                throw new ApiError(400, `Invalid order value: ${order}`);
            }

            if (mongoose.isValidObjectId(id)) {
                id = new mongoose.Types.ObjectId(id);
            } else if (typeof id !== "number" && id !== undefined && id !== null) {
                const idofNumber = parseInt(id, 10);
                const test = await testSchema.findOne({
                    order: idofNumber,
                    createdBy: userId
                }).select("_id").lean();
                if (!test) {
                    throw new ApiError(400, `Test with order ${id} not found`);
                }
                id = test._id;
            } else {
                throw new ApiError(400, `Invalid test ID: ${id}`);
            }

            dedupedMap.set(String(id), {
                updateOne: {
                    filter: { _id: id, createdBy: userId },
                    update: { $set: { order: Math.round(numericOrder) } },
                },
            });
        }

        const bulkOperations = Array.from(dedupedMap.values());
        if (bulkOperations.length > 0) {
            await testSchema.bulkWrite(bulkOperations);
        }

        res.json({
            status: 200,
            updatedCount: bulkOperations.length,
            message: "Test order updated successfully",
        });
    } catch (error) {
        console.error("Error updating test order:", error);
        if (error instanceof ApiError) throw error;
        throw new ApiError(500, "Failed to update test order");
    }
});

/**
 * Resolve tenant/owner query scope consistently for Lab Report reorder APIs.
 */
const resolveTestReorderScopeFilter = (req) => {
    const tid = req.user?.tenantId?._id || req.user?.tenantId || null;
    if (tid) {
        return { tid, filter: { tenantId: tid } };
    }
    const ownerId = req.user?.role === "staff" ? req.user?.parentUser : req.user?._id;
    return { tid: null, filter: { createdBy: ownerId } };
};

/**
 * Reorder booked tests directly from Enter Result / Lab Report while preserving
 * relative order numbers against all other unbooked tests in the tenant database.
 *
 * Example: Booked tests currently at DB orders [30, 32, 48] reordered into [A, C, B]
 * receive slots [30, 32, 48] (A->30, C->32, B->48). If duplicate or colliding DB
 * order numbers exist, tenant tests are cleanly normalized 1..N while keeping
 * unbooked tests in their exact relative positions.
 */
const reorderTestsFromReport = asyncHandler(async (req, res) => {
    const { orderedTestIds, panelId } = req.body || {};
    const { filter: scopeFilter } = resolveTestReorderScopeFilter(req);

    if (!Array.isArray(orderedTestIds)) {
        throw new ApiError(400, "orderedTestIds array is required");
    }

    const seenIds = new Set();
    const cleanOrderedIds = [];
    for (const rawId of orderedTestIds) {
        const idStr = toIdString(rawId).trim();
        if (!idStr || !mongoose.isValidObjectId(idStr) || seenIds.has(idStr)) continue;
        seenIds.add(idStr);
        cleanOrderedIds.push(idStr);
    }

    if (cleanOrderedIds.length < 2) {
        throw new ApiError(400, "At least two distinct valid test IDs are required to reorder");
    }

    const targetObjectIds = cleanOrderedIds.map((id) => new mongoose.Types.ObjectId(id));
    const foundTests = await testSchema
        .find({ ...scopeFilter, _id: { $in: targetObjectIds } })
        .select("_id Name order")
        .lean();

    if (foundTests.length < 2) {
        throw new ApiError(404, "Matching tenant tests not found for reordering");
    }

    const foundById = new Map(foundTests.map((doc) => [String(doc._id), doc]));
    const activeOrderedIds = cleanOrderedIds.filter((id) => foundById.has(id));
    if (activeOrderedIds.length < 2) {
        throw new ApiError(400, "At least two matched tests are required to reorder");
    }

    const activeObjectIds = activeOrderedIds.map((id) => new mongoose.Types.ObjectId(id));
    const existingOrders = activeOrderedIds.map((id) => Number(foundById.get(id)?.order));
    const allOrdersValid = existingOrders.every((val) => Number.isFinite(val) && val > 0);
    const hasUniqueInternalOrders = new Set(existingOrders).size === existingOrders.length;

    let hasExternalOrderCollision = false;
    if (allOrdersValid && hasUniqueInternalOrders) {
        const collidingCount = await testSchema.countDocuments({
            ...scopeFilter,
            _id: { $nin: activeObjectIds },
            order: { $in: existingOrders },
        });
        hasExternalOrderCollision = collidingCount > 0;
    }

    const updatedOrders = {};
    const bulkOps = [];

    if (allOrdersValid && hasUniqueInternalOrders && !hasExternalOrderCollision) {
        // Fast path: reassign exact ascending slots from the booked tests' existing DB orders
        const sortedSlots = [...existingOrders].sort((a, b) => a - b);
        activeOrderedIds.forEach((idStr, idx) => {
            const nextOrder = sortedSlots[idx];
            updatedOrders[idStr] = nextOrder;
            if (Number(foundById.get(idStr)?.order) !== nextOrder) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: new mongoose.Types.ObjectId(idStr), ...scopeFilter },
                        update: { $set: { order: nextOrder } },
                    },
                });
            }
        });
    } else {
        // Collision-healing path: normalize tenant test orders 1..N while inserting the
        // reordered tests into their sorted canonical positions without disturbing other tests.
        const allTenantTests = await testSchema
            .find(scopeFilter)
            .sort({ order: 1, _id: 1 })
            .select("_id order")
            .lean();

        const targetSet = new Set(activeOrderedIds);
        const slotIndices = [];
        allTenantTests.forEach((doc, idx) => {
            if (targetSet.has(String(doc._id))) {
                slotIndices.push(idx);
            }
        });

        const nextTenantSequence = allTenantTests.map((doc) => ({ ...doc }));
        slotIndices.forEach((slotIdx, seqIdx) => {
            const targetId = activeOrderedIds[seqIdx];
            if (targetId && foundById.has(targetId)) {
                nextTenantSequence[slotIdx] = foundById.get(targetId);
            }
        });

        nextTenantSequence.forEach((doc, idx) => {
            const canonicalOrder = idx + 1;
            const idStr = String(doc._id);
            if (targetSet.has(idStr)) {
                updatedOrders[idStr] = canonicalOrder;
            }
            if (Number(doc.order) !== canonicalOrder) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: doc._id, ...scopeFilter },
                        update: { $set: { order: canonicalOrder } },
                    },
                });
            }
        });
    }

    if (bulkOps.length > 0) {
        await testSchema.bulkWrite(bulkOps);
    }

    // Keep panel.testsId & panel.tests aligned when reordered inside a panel section
    if (panelId && mongoose.isValidObjectId(String(panelId))) {
        const panelDoc = await addPannel.findOne({
            _id: new mongoose.Types.ObjectId(String(panelId)),
            ...scopeFilter,
        });
        if (panelDoc && Array.isArray(panelDoc.testsId) && panelDoc.testsId.length > 1) {
            const reorderedSet = new Set(activeOrderedIds);
            const panelSlots = [];
            panelDoc.testsId.forEach((tidItem, idx) => {
                if (reorderedSet.has(String(tidItem))) {
                    panelSlots.push(idx);
                }
            });
            const presentIdsInOrder = activeOrderedIds.filter((idStr) =>
                panelDoc.testsId.some((tidItem) => String(tidItem) === idStr)
            );
            if (panelSlots.length === presentIdsInOrder.length && panelSlots.length > 1) {
                const nextTestsId = [...panelDoc.testsId];
                panelSlots.forEach((slotIdx, i) => {
                    nextTestsId[slotIdx] = new mongoose.Types.ObjectId(presentIdsInOrder[i]);
                });
                const panelTestDocs = await testSchema
                    .find({ _id: { $in: nextTestsId } })
                    .select("_id Name")
                    .lean();
                const nameById = new Map(panelTestDocs.map((d) => [String(d._id), d.Name]));
                panelDoc.testsId = nextTestsId;
                panelDoc.tests = nextTestsId.map((tidItem) => nameById.get(String(tidItem))).filter(Boolean);
                await panelDoc.save();
            }
        }
    }

    return res.status(200).json({
        success: true,
        message: "Test order updated in database.",
        updatedOrders,
    });
});

/**
 * Reorder parameters within a multi-parameter test directly from Lab Report / Enter Result.
 * Reorders the persisted `test.parameters` array AND updates sequential `param.order` (1..N)
 * while preserving each parameter's `_id`, `masterParameterKey`, ranges, and formula links.
 */
const reorderTestParametersFromReport = asyncHandler(async (req, res) => {
    const { testId, orderedParameters } = req.body || {};
    const { filter: scopeFilter } = resolveTestReorderScopeFilter(req);

    if (!testId || !mongoose.isValidObjectId(String(testId))) {
        throw new ApiError(400, "Valid testId is required");
    }
    if (!Array.isArray(orderedParameters) || orderedParameters.length < 2) {
        throw new ApiError(400, "At least two parameter entries are required to reorder");
    }

    const testDoc = await testSchema.findOne({
        _id: new mongoose.Types.ObjectId(String(testId)),
        ...scopeFilter,
    });
    if (!testDoc) {
        throw new ApiError(404, "Test not found for parameter reordering");
    }

    const existingParams = Array.isArray(testDoc.parameters) ? testDoc.parameters : [];
    if (existingParams.length < 2) {
        throw new ApiError(400, "Test must have multiple parameters to reorder");
    }

    const usedIndices = new Set();
    const matchExistingIndex = (entry) => {
        if (!entry) return -1;
        const pid = String(entry.parameterId || entry._id || "").trim();
        const mKey = String(entry.masterParameterKey || "").trim();
        const pName = String(entry.paraName || entry.Para_name || "").trim().toLowerCase();

        if (pid) {
            const idx = existingParams.findIndex((p, i) => !usedIndices.has(i) && String(p?._id || "") === pid);
            if (idx !== -1) return idx;
        }
        if (mKey) {
            const idx = existingParams.findIndex(
                (p, i) => !usedIndices.has(i) && String(p?.masterParameterKey || "").trim() === mKey
            );
            if (idx !== -1) return idx;
        }
        if (pName) {
            const idx = existingParams.findIndex(
                (p, i) => !usedIndices.has(i) && String(p?.Para_name || "").trim().toLowerCase() === pName
            );
            if (idx !== -1) return idx;
        }
        return -1;
    };

    const reorderedParams = [];
    for (const entry of orderedParameters) {
        const idx = matchExistingIndex(entry);
        if (idx !== -1) {
            usedIndices.add(idx);
            reorderedParams.push(existingParams[idx]);
        }
    }

    // Safety net: append any untouched parameter subdocuments so zero parameters can be lost
    existingParams.forEach((param, idx) => {
        if (!usedIndices.has(idx)) {
            reorderedParams.push(param);
        }
    });

    if (reorderedParams.length !== existingParams.length) {
        throw new ApiError(409, "Parameter count mismatch while reordering");
    }

    reorderedParams.forEach((param, idx) => {
        param.order = idx + 1;
    });

    testDoc.set("parameters", reorderedParams);
    testDoc.markModified("parameters");
    await testDoc.save();

    return res.status(200).json({
        success: true,
        message: "Parameter order updated in database.",
        testId: String(testDoc._id),
        parameters: testDoc.parameters.map((p) => ({
            _id: String(p._id || ""),
            masterParameterKey: p.masterParameterKey || "",
            Para_name: p.Para_name || "",
            order: p.order,
        })),
    });
});

// SuperAdmin Test Edit
const editTest = asyncHandler(async (req, res) => {
    const {
        _id,
        Name,
        final_price,
        Short_name,
        category,
        tat,
        Price,
        sampleType,
        method,
        instrument,
        interpretation,
        hideMethodInstrument,
        hideInterpretation,
        parameters
    } = req.body;

    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }
    const normalizedHideMethodInstrument = parseBooleanInput(req.body.hideMethodInstrument);
    const normalizedHideInterpretation = parseBooleanInput(req.body.hideInterpretation);
    const isBlankField = (v) => v === undefined || v === null || String(v).trim() === "";
    if (!Name || isBlankField(final_price) || !category || isBlankField(Price) || !sampleType) {
        return res.status(400).json({ message: "Missing required fields", status: "error" });
    }
    const currentTest = await testSchema.findOne({
        createdBy: userId,
        _id
    });

    if (!currentTest) {
        return res.status(404).json({ message: "Test not found or access denied", status: "error" });
    }
    const trimmedName = String(Name).trim();
    if (trimmedName && trimmedName !== currentTest.Name) {
        const duplicateName = await testSchema.findOne({
            createdBy: userId,
            Name: trimmedName,
            _id: { $ne: currentTest._id }
        }).select("_id").lean();
        if (duplicateName) {
            return res.status(400).json({ message: "A test with this name already exists", status: "error" });
        }
    }
    const normalizedParameters = normalizeParameterPayload(parameters, currentTest.parameters);
    const resolvedCategory = await resolveCategoryForScope({
        categoryInput: category,
        tenantId: null,
        createdBy: userId
    });

    const editedTest = await testSchema.findOneAndUpdate(
        {
            _id,
            createdBy: userId
        },
        {
            Name: trimmedName || currentTest.Name,
            Short_name: Short_name !== undefined ? String(Short_name).trim() : (currentTest.Short_name || ""),
            category: resolvedCategory || category || "",
            Price,
            parameters: Array.isArray(normalizedParameters) ? normalizedParameters : [],
            sampleType,
            method: method || "",
            tat: tat || "",
            instrument: instrument || "",
            interpretation: interpretation || "",
            hideMethodInstrument: normalizedHideMethodInstrument,
            hideInterpretation: normalizedHideInterpretation,
            ...(req.body.isDocumentedTest !== undefined ? { isDocumentedTest: parseBooleanInput(req.body.isDocumentedTest) } : {}),
            final_price
        },
        { new: true }
    );

    if (!editedTest) {
        return res.status(402).json({ message: "Something went wrong, please try again", status: "error" });
    }

    // अगर staff का parentUser है तो उसे भी notify करें
    if (req.user.role === 'staff') {
        await SuperAdmin.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "test_create",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: "Staff updated a Test",
                        testName: Name,
                        testId: editedTest._id
                    },
                    reference: {
                        model: "Test",
                        id: editedTest._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.status(200).json({ message: "test edited successfully", status: "success" });
});

// Admin Test Edit
const editTesttenant = asyncHandler(async (req, res) => {
    const {
        _id,
        Name,
        final_price,
        Short_name,
        category,
        tat,
        Price,
        sampleType,
        method,
        instrument,
        interpretation,
        hideMethodInstrument,
        hideInterpretation,
        parameters
    } = req.body;

    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }

    const tid = req.user.tenantId._id;
    const normalizedHideMethodInstrument = parseBooleanInput(req.body.hideMethodInstrument);
    const normalizedHideInterpretation = parseBooleanInput(req.body.hideInterpretation);

    const isBlankField = (v) => v === undefined || v === null || String(v).trim() === "";
    if (isBlankField(final_price) || !category || isBlankField(Price) || !sampleType) {
        return res.status(400).json({ message: "Missing required fields", status: "error" });
    }

    const currentTest = await testSchema.findOne({
        tenantId: tid,
        _id
    });
    if (!currentTest) {
        return res.status(404).json({ message: "Test not found", status: "error" });
    }
    const trimmedName = typeof Name === "string" ? Name.trim() : "";
    if (trimmedName && trimmedName !== currentTest.Name) {
        const duplicateName = await testSchema.findOne({
            tenantId: tid,
            Name: trimmedName,
            _id: { $ne: currentTest._id }
        }).select("_id").lean();
        if (duplicateName) {
            return res.status(400).json({ message: "A test with this name already exists", status: "error" });
        }
    }
    const normalizedParameters = normalizeParameterPayload(parameters, currentTest.parameters);
    const resolvedCategory = await resolveCategoryForScope({
        categoryInput: category,
        tenantId: tid,
        createdBy: userId
    });

    const editedTest = await testSchema.findOneAndUpdate(
        {
            _id,
            tenantId: tid
        },
        {
            ...(trimmedName ? { Name: trimmedName } : {}),
            Short_name: Short_name !== undefined ? String(Short_name).trim() : (currentTest.Short_name || ""),
            category: resolvedCategory || category || "",
            Price,
            parameters: Array.isArray(normalizedParameters) ? normalizedParameters : [],
            sampleType,
            method: method || "",
            tat: tat || "",
            instrument: instrument || "",
            interpretation: interpretation || "",
            hideMethodInstrument: normalizedHideMethodInstrument,
            hideInterpretation: normalizedHideInterpretation,
            final_price,
        },
        { new: true }
    );

    if (!editedTest) {
        return res.status(402).json({ message: "Something went wrong, please try again", status: "error" });
    }

    // अगर staff का parentUser है तो उसे भी notify करें
    if (req.user.role === 'staff') {
        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "test_create",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: "Staff updated a Test",
                        testName: Short_name,
                        testId: editedTest._id
                    },
                    reference: {
                        model: "Test",
                        id: editedTest._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.status(200).json({ message: "test edited successfully", status: "success" });
});

const allTest = asyncHandler(async (req, res) => {


    let query = {
        createdByRole: "superAdmin"
    };

    if (req.user.role === "staff") {
        // Agar staff hai to parentUser ke according test lana hai
        query.createdBy = req.user.parentUser;

    } else {
        // Warna khud ke according test lana hai
        query.createdBy = req.user._id;
    }

    const allrecievedTest = await testSchema.find(query).sort({ order: 1, _id: 1 });
    await ensureTestDocumentsHaveMasterKeys(allrecievedTest);

    if (!allrecievedTest) {
        throw new ApiError(400, "Something went wrong while fetching details")
    }

    return res.json(allrecievedTest)

})

// for test category creation
const testCate = asyncHandler(async (req, res) => {

    const { catName } = req.body
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }

    const fetchedcategory = await categorydb.findOne({
        createdBy: userId,
        category: catName
    });

    if (fetchedcategory) {
        return res.json({ message: `'${catName}' allready present`, type: "error" });
    }

    if (!catName && typeof catName !== "string") {
        return res.json({ message: "please enter category Name", type: "auth" });
    }

    const incremented = await Counter.findOneAndUpdate(
        { _id: "orderId" },
        { $inc: { sequence_value: 1 } },
        { new: true, upsert: true }
    )

    console.log(incremented)

    if (!incremented) {
        return res.json({ message: "Invalid orderId, please try again", type: "error" });
    }

    const newCategory = await categorydb.create({
        orderId: incremented.sequence_value,
        category: catName,
        createdBy: userId,
        tenantId: null
    })

    if (!newCategory) {
        return res.json({ message: "Connection error, please check your internet connection", type: "error" });
    }

    return res.json({ message: "category added successfully", type: "success" });

})

// const testCateadmin = asyncHandler(async (req, res) => {

//     const { catName } = req.body

//     const tenantid = req.user.tenantId._id;

//     const fetchedcategory = await categorydb.findOne({
//         tenantId: tenantid,
//         createdBy: req.user._id,
//         category: catName
//     });

//     if (fetchedcategory) {
//         return res.json({ message: `'${catName}' allready present`, type: "error" });
//     }

//     if (!catName && typeof catName !== "string") {
//         return res.json({ message: "please enter category Name", type: "auth" });
//     }

//     const incremented = await Counter.findOneAndUpdate(
//         { _id: "orderId" },
//         { $inc: { sequence_value: 1 } },
//         { new: true, upsert: true }
//     )

//     console.log(incremented)

//     if (!incremented) {
//         return res.json({ message: "Invalid orderId, please try again", type: "error" });
//     }

//     const newCategory = await categorydb.create({
//         orderId: incremented.sequence_value,
//         category: catName,
//         createdBy: req.user._id,
//         tenantId: tenantid
//     })

//     if (!newCategory) {
//         return res.json({ message: "Connection error, please check your internet connection", type: "error" });
//     }

//     return res.json({ message: "category added successfully", type: "success" });

// })

// for fetc all test category
const getAllTestCate = asyncHandler(async (req, res) => {
    let query = {};

    if (req.user.role === 'staff') {
        query.createdBy = req.user.parentUser;
    }
    else {
        query.createdBy = req.user._id
    }
    const allrecievedTest = await categorydb.find(query)

    if (!allrecievedTest) {
        throw new ApiError(400, "Something went wrong while fetching details")
    }
    return res.json(new ApiResponse(201, allrecievedTest, { success: true }))
})

// for fetc all test category
const getAllTestCateadmin = asyncHandler(async (req, res) => {
    const allrecievedTest = await categorydb.find({
        tenantId: req.user.tenantId._id
    })
    if (!allrecievedTest) {
        throw new ApiError(400, "Something went wrong while fetching details")
    }
    return res.json(new ApiResponse(201, allrecievedTest, { success: true }))
})
//fetch one category base on id
const getOneTestCate = asyncHandler(async (req, res) => {
    const _id = req.query._id;
    const oneTest = await categorydb.findById(_id)
    if (!oneTest) {
        throw new ApiError(400, "Something went wrong while fetching details")
    }
    return res.json(new ApiResponse(201, oneTest, { success: true }))
});

// fetch one test base on id
const getOneTest = asyncHandler(async (req, res) => {
    const { Name } = req.query
    const oneTest = await testSchema.findById({ _id: Name })
    if (!oneTest) {
        throw new ApiError(400, "Something went wrong while fetching details")
    }
    await ensureTestDocumentsHaveMasterKeys(oneTest);
    res.set("Cache-Control", "no-store");
    return res.json(new ApiResponse(201, oneTest, { success: true }))
})


// update one category base on id
const updateTestCate = asyncHandler(async (req, res) => {
    const { _id } = req.query
    const { catName } = req.body
    let category = catName

    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }

    const duplicateTest = await categorydb.findOne({
        category: category,
        createdBy: userId
    });
    if (duplicateTest) {
        return res.json({
            message: `${category} already present`,
            type: "auth"
        });
    }
    const updatedTest = await categorydb.findByIdAndUpdate(_id, { category }, { new: true })

    if (!updatedTest) {
        return res.json({
            message: `please check your internet connection`,
            type: "error"
        });
    }
    // अगर staff का parentUser है तो उसे भी notify करें
    if (req.user.role === 'staff') {
        await SuperAdmin.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "test_create",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: "Staff update a Category",
                        categoryName: category,
                        categoryId: updatedTest._id
                    },
                    reference: {
                        model: "unit",
                        id: updatedTest._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.json({ message: `edited successfully`, type: "success" });
})
const updateTestCateadmin = asyncHandler(async (req, res) => {
    const { _id } = req.query
    const { catName } = req.body

    let category = catName
    const duplicateTest = await categorydb.findOne({
        category: category,
        tenantId: req.user.tenantId._id
    });
    if (duplicateTest) {
        return res.json({
            message: `${category} already present`,
            type: "auth"
        });
    }
    const updatedTest = await categorydb.findByIdAndUpdate(_id, { category }, { new: true })

    if (!updatedTest) {
        return res.json({
            message: `please check your internet connection`,
            type: "error"
        });
    }
    if (req.user.role === 'staff') {
        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "test_create",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: "Staff update a Category",
                        categoryName: category,
                        categoryId: updatedTest._id
                    },
                    reference: {
                        model: "unit",
                        id: updatedTest._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.json({ message: `edited successfully`, type: "success" });
})

//for test category edit
const editTestCate = asyncHandler(async (req, res) => {

    const { category } = req.params

    if (!category) {
        throw new ApiError(400, "an error occured when sending variables through url")
    }

    const { catName } = req.body

    if (!catName) {
        throw new ApiError(400, "please enter Name")
    }

    const editedCategory = await categorydb.findOneAndUpdate(
        { category: category },
        {
            $set:
                { category: catName }
        },
        { new: true }
    )

    if (!editedCategory) {
        throw new ApiError(400, "something went wrong")
    }

    return res.json(new ApiResponse(200, { editedCategory }, "category edited successfully"))

})

const editdefaultresult = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { dataObject, tname, text, selectType, testId, parameterId } = req.body;

        console.log("Request data:", { dataObject, tname, text, testId, parameterId });

        // Input validation
        if (!tname && !parameterId) {
            return res.status(400).json({
                success: false,
                message: "Parameter identity is required"
            });
        }

        if (!dataObject && !text) {
            return res.status(400).json({
                success: false,
                message: "Either dataObject or text must be provided for update"
            });
        }

        // Check if user has tenantId
        if (!req.user.tenantId || !req.user.tenantId._id) {
            return res.status(400).json({
                success: false,
                message: "Invalid tenant information"
            });
        }

        const tenantId = req.user.tenantId._id;

        const matchQuery = {
            tenantId: tenantId
        };

        if (testId) {
            matchQuery._id = testId;
        }

        if (parameterId) {
            matchQuery["parameters._id"] = parameterId;
        } else {
            matchQuery["parameters.Para_name"] = tname;
        }

        // First check if the test with the parameter exists
        const existingTest = await testSchema.findOne(matchQuery).session(session);

        if (!existingTest) {
            return res.status(404).json({
                success: false,
                message: `Test parameter '${tname || parameterId}' not found for this tenant`
            });
        }

        console.log("Found existing test:", existingTest._id);

        const matchedParameter = existingTest.parameters.find((parameter) => {
            if (parameterId && String(parameter?._id) === String(parameterId)) {
                return true;
            }

            return parameter?.Para_name === tname;
        });

        if (!matchedParameter) {
            return res.status(404).json({
                success: false,
                message: "Requested parameter was not found in the matched test"
            });
        }

        const resolvedParameterId = matchedParameter._id;
        const resolvedParameterName = matchedParameter.Para_name;

        // Prepare update operations
        const updateOperations = {};
        let updateFields = [];

        // Add text update if provided
        if (text !== undefined && text !== null && selectType === "text") {
            updateOperations["parameters.$[target].text"] = text;
            updateOperations["parameters.$[target].NormalValue"] = [];
            updateOperations["parameters.$[target].ValueType"] = "text";
            updateFields.push("text");
        }

        // Add NormalValue update if provided
        if (dataObject !== undefined && dataObject !== null && selectType !== "text") {
            updateOperations["parameters.$[target].NormalValue"] = dataObject;
            updateOperations["parameters.$[target].text"] = "";
            updateOperations["parameters.$[target].ValueType"] = "numeric";
            updateFields.push("NormalValue");
        }

        // Perform single atomic update operation
        const updatedTest = await testSchema.findOneAndUpdate(
            {
                _id: existingTest._id,
                tenantId: tenantId
            },
            {
                $set: updateOperations
            },
            {
                arrayFilters: [{ "target._id": resolvedParameterId }],
                new: true,
                runValidators: true,
                session: session
            }
        );

        if (!updatedTest) {
            throw new ApiError(500, "Failed to update test parameter");
        }

        // Find the specific updated parameter for response
        const updatedParameter = updatedTest.parameters.find(
            param => String(param._id) === String(resolvedParameterId)
        );

        if (!updatedParameter) {
            throw new ApiError(500, "Updated parameter not found in response");
        }

        // Log the update activity
        const activityLog = {
            activityType: "parameter_update",
            details: {
                userId: req.user._id,
                userName: req.user.fullName || req.user.username,
                testId: updatedTest._id,
                testName: updatedTest.Name,
                parameterName: resolvedParameterName,
                updatedFields: updateFields,
                oldValues: {},
                newValues: {}
            },
            timestamp: new Date()
        };

        // Add old and new values to activity log
        if (text !== undefined) {
            activityLog.details.newValues.text = text;
        }
        if (dataObject !== undefined) {
            activityLog.details.newValues.NormalValue = dataObject;
        }

        console.log("Update successful for parameter:", resolvedParameterName);

        // Commit the transaction
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: `Parameter '${resolvedParameterName}' updated successfully`,
            data: {
                testId: updatedTest._id,
                testName: updatedTest.Name,
                updatedParameter: {
                    _id: updatedParameter._id,
                    Para_name: updatedParameter.Para_name,
                    text: updatedParameter.text,
                    NormalValue: updatedParameter.NormalValue,
                    ValueType: updatedParameter.ValueType
                },
                updatedFields: updateFields,
                lastModified: new Date()
            }
        });

    } catch (error) {
        // Rollback transaction on error
        await session.abortTransaction();
        session.endSession();

        console.error("Error in editdefaultresult:", error);

        // Handle different types of errors
        if (error instanceof ApiError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }

        // Handle Mongoose validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => ({
                field: err.path,
                message: err.message
            }));

            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: validationErrors
            });
        }

        // Handle MongoDB duplicate key errors
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Duplicate entry error",
                error: "A parameter with similar data already exists"
            });
        }

        // Handle MongoDB connection errors
        if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
            return res.status(503).json({
                success: false,
                message: "Database connection error. Please try again later."
            });
        }

        // Generic error handler
        return res.status(500).json({
            success: false,
            message: "Internal server error while updating parameter",
            error: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                stack: error.stack
            } : undefined
        });
    }
});


const findTestcontroller = asyncHandler(async (req, res) => {
    const { name, shortName } = req.params;

    // if(!(name || shortName)) {
    //     throw new ApiError(400, "please give name or shortname")
    // }

    const tests = await testSchema.findOne({
        Name: name
        // $or: [
        //     {Name: name},
        //     {Short_name: shortName}
        // ]
    })

    if (!tests) {
        throw new ApiError(400, "test not found")
    }

    await ensureTestDocumentsHaveMasterKeys(tests);

    return res.json(tests)

})

const updateTestcontroller = asyncHandler(async (req, res) => {

    const { name, shortName } = req.params;
    const { Name, Short_name, category, Price, sampleType, method, instrument, interpretation, parameters, NormalValue } = req.body;
    const currentTest = await testSchema.findOne({
        $or: [
            { Name: name },
            { Short_name: shortName }
        ]
    });

    const normalizedParameters = Array.isArray(parameters)
        ? normalizeParameterPayload(parameters, currentTest?.parameters || [])
        : parameters;

    const updatedtests = await testSchema.findOneAndUpdate(
        {
            $or: [
                { Name: name },
                { Short_name: shortName }
            ]
        },
        {
            $set: {
                Name: Name,
                Short_name: Short_name,
                category: category || "",
                Price,
                parameters: normalizedParameters || "",
                sampleType,
                method: method || "",
                instrument: instrument || "",
                interpretation,
                defaultresult: NormalValue || ""
            }
        },
        { new: true } // `upsert: true` will create a new document if not found
    );


    if (!updatedtests) {
        throw new ApiError(400, "test not updated")
    }

    return res.json(updatedtests)

})
const addUnit = asyncHandler(async (req, res) => {
    const { unit } = req.body;
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    }
    else {
        userId = req.user._id
    }
    const unitExists = await unitdb.findOne({
        createdBy: userId,
        unit: unit,

    });
    if (unitExists) {
        throw new ApiError("Unit already exists");
    }
    const newUnit = new unitdb({
        createdBy: userId,
        unit,
        tenantId: null,
        isBaseUnit: true,
        purchasedFromBaseUnit: false,
        createdByRole: "superAdmin"
    });
    await newUnit.save();

    if (req.user.role === 'staff') {
        await SuperAdmin.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "test_create",
                    details: {
                        staffId: userId,
                        staffName: req.user.fullName,
                        action: "Staff created a new Unit",
                        unitName: unit,
                        unitId: newUnit._id
                    },
                    reference: {
                        model: "unit",
                        id: newUnit._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.status(201).json({ unit: newUnit.unit });
});

const addUnitadmin = asyncHandler(async (req, res) => {

    const { unit } = req.body;
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    }
    else {
        userId = req.user._id
    }

    const tid = req.user.tenantId._id;
    const unitExists = await unitdb.findOne({
        tenantId: tid,
        unit: unit
    });
    if (unitExists) {
        throw new ApiError("Unit already exists");
    }
    const newUnit = new unitdb({
        tenantId: tid,
        createdBy: userId,
        unit,
        isBaseUnit: true,
        purchasedFromBaseUnit: false,
        createdByRole: "admin"
    });
    await newUnit.save();
    if (req.user.role === 'staff') {
        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "test_create",
                    details: {
                        staffId: userId,
                        staffName: req.user.fullName,
                        action: "Staff created a new Unit",
                        unitName: unit,
                        unitId: newUnit._id
                    },
                    reference: {
                        model: "unit",
                        id: newUnit._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }


    return res.status(201).json({ unit: newUnit.unit });
});

const getUnits = asyncHandler(async (req, res) => {
    let query = {};

    if (req.user.role === 'staff') {
        query.createdBy = req.user.parentUser
    }
    else {
        query.createdBy = req.user._id
    }
    const units = await unitdb.find(query).sort({ unit: 1 });

    return res.status(200).json({ units });
});

const tenantTest = asyncHandler(async (req, res) => {

    const tenantId = req.user.tenantId._id; // Assuming tenant is logged in

    try {
        const tests = await testSchema.find({
            tenantId: tenantId,
        }).sort({ order: 1, _id: 1 });
        await ensureTestDocumentsHaveMasterKeys(tests);

        return res.status(200).json({
            status: 200,
            message: "Tests fetched successfully",
            count: tests.length,
            tests,
        });
    } catch (error) {
        return res
            .status(500)
            .json({ message: "Failed to fetch tests", error: error.message });
    }
});
const executeCatalogAssignment = async ({ req, tenant, session = null }) => {
    const franchiseeId = req.body.franchiseeId;
    const sourceAdminId = req.body.sourceAdminId && mongoose.isValidObjectId(String(req.body.sourceAdminId))
        ? String(req.body.sourceAdminId).trim()
        : null;
    const testIds = normalizeObjectIdArray(req.body.testIds);
    const panelIds = normalizeObjectIdArray(req.body.panelIds);
    const packageIds = normalizeObjectIdArray(req.body.packageIds);
    const categoryIds = normalizeObjectIdArray(req.body.categoryIds);
    const unitIds = normalizeObjectIdArray(req.body.unitIds);
    const sampleTypeIds = normalizeObjectIdArray(req.body.sampleTypeIds);
    const overwriteExisting = req.body.overwriteExisting === true;

    const sessionOpt = session ? { session } : {};
    const tenantInSessionQuery = Tenant.findById(franchiseeId);
    if (session) tenantInSessionQuery.session(session);
    const tenantInSession = await tenantInSessionQuery;
    const createdBy = tenantInSession?.adminDetails?.userId || tenant.adminDetails.userId;

    if (overwriteExisting === true) {
        await categorydb.deleteMany({ tenantId: franchiseeId, purchasedFromBaseCategory: true }, sessionOpt);
        await unitdb.deleteMany({ tenantId: franchiseeId, purchasedFromBaseUnit: true }, sessionOpt);
        await sampleSchema.deleteMany({ tenantId: franchiseeId, purchasedFromBaseSample: true }, sessionOpt);
        await testSchema.deleteMany({ tenantId: franchiseeId, purchasedFromBaseTest: true }, sessionOpt);
        await addPannel.deleteMany({ tenantId: franchiseeId, purchasedFromBasePanel: true }, sessionOpt);
        await Package.deleteMany({ tenantId: franchiseeId, purchasedFromBasePackage: true }, sessionOpt);
    }

    const assignedCounts = {
        tests: 0,
        panels: 0,
        packages: 0,
        categories: 0,
        units: 0,
        sampleTypes: 0,
        formulas: 0,
    };
    const sourceFormulaScopeId = resolveFormulaScopeId(req.user);

    const hasCategoryWork = Boolean(categoryIds.length + testIds.length + panelIds.length);
    const hasTestWork = Boolean(testIds.length + panelIds.length + packageIds.length);
    const hasPanelWork = Boolean(panelIds.length + packageIds.length);

    const runFind = (model, filter, selectFields = null) => {
        const q = model.find(filter);
        if (selectFields) q.select(selectFields);
        if (session) q.session(session);
        return q.lean();
    };

    const [tenantCategoryDocs, tenantTestDocs, tenantPanelDocs, tenantUnitDocs, tenantSampleDocs, tenantPackageDocs] = await Promise.all([
        hasCategoryWork ? runFind(categorydb, { tenantId: franchiseeId }) : [],
        hasTestWork ? runFind(testSchema, { tenantId: franchiseeId }, "_id Name originalTestId") : [],
        hasPanelWork ? runFind(addPannel, { tenantId: franchiseeId }, "_id name originalPanelId") : [],
        unitIds.length > 0 ? runFind(unitdb, { tenantId: franchiseeId }, "_id unit originalUnitId") : [],
        sampleTypeIds.length > 0 ? runFind(sampleSchema, { tenantId: franchiseeId }, "_id Name originalSampleId") : [],
        packageIds.length > 0 ? runFind(Package, { tenantId: franchiseeId }, "_id packageName originalPackageId") : [],
    ]);

    const categoryResolver = buildCategoryResolver(tenantCategoryDocs);

    const assignedCategoryOriginalIds = new Set(
        tenantCategoryDocs.map((c) => toIdString(c.originalCategoryId)).filter(Boolean)
    );
    const assignedCategoryNames = new Set(
        tenantCategoryDocs.map((c) => (c.category == null ? "" : String(c.category))).filter(Boolean)
    );

    const testIdByOriginalId = new Map();
    const testIdByName = new Map();
    for (const test of tenantTestDocs) {
        const originalId = toIdString(test.originalTestId);
        if (originalId && !testIdByOriginalId.has(originalId)) {
            testIdByOriginalId.set(originalId, test._id);
        }
        const testName = test.Name == null ? "" : String(test.Name);
        if (testName && !testIdByName.has(testName)) {
            testIdByName.set(testName, test._id);
        }
    }

    const panelIdByOriginalId = new Map();
    const panelIdByName = new Map();
    for (const panel of tenantPanelDocs) {
        const originalId = toIdString(panel.originalPanelId);
        if (originalId && !panelIdByOriginalId.has(originalId)) {
            panelIdByOriginalId.set(originalId, panel._id);
        }
        const panelName = panel.name == null ? "" : String(panel.name);
        if (panelName && !panelIdByName.has(panelName)) {
            panelIdByName.set(panelName, panel._id);
        }
    }

    const packageIdByOriginalId = new Map();
    const packageIdByName = new Map();
    for (const pkg of tenantPackageDocs) {
        const originalId = toIdString(pkg.originalPackageId);
        if (originalId && !packageIdByOriginalId.has(originalId)) {
            packageIdByOriginalId.set(originalId, pkg._id);
        }
        const packageName = pkg.packageName == null ? "" : String(pkg.packageName);
        if (packageName && !packageIdByName.has(packageName)) {
            packageIdByName.set(packageName, pkg._id);
        }
    }

    const assignedUnitOriginalIds = new Set(
        tenantUnitDocs.map((u) => toIdString(u.originalUnitId)).filter(Boolean)
    );
    const assignedUnitNames = new Set(
        tenantUnitDocs.map((u) => (u.unit == null ? "" : String(u.unit))).filter(Boolean)
    );

    const assignedSampleOriginalIds = new Set(
        tenantSampleDocs.map((s) => toIdString(s.originalSampleId)).filter(Boolean)
    );
    const assignedSampleNames = new Set(
        tenantSampleDocs.map((s) => (s.Name == null ? "" : String(s.Name))).filter(Boolean)
    );

    // === CATEGORIES ===
    if (categoryIds.length > 0) {
        const candidateCategories = await runFind(categorydb, {
            _id: { $in: categoryIds },
            $or: [
                { isBaseCategory: true },
                { isBaseCategory: { $exists: false } },
                ...(sourceAdminId ? [{ tenantId: sourceAdminId }] : [{ tenantId: { $ne: null } }])
            ]
        });

        const newCategories = [];
        for (const cat of candidateCategories) {
            const catName = String(cat.category || "").trim();
            if (!catName) continue;
            const origRef = toIdString(cat.originalCategoryId);
            if (
                assignedCategoryOriginalIds.has(String(cat._id)) ||
                (origRef && assignedCategoryOriginalIds.has(origRef)) ||
                assignedCategoryNames.has(catName)
            ) {
                continue;
            }
            assignedCategoryNames.add(catName);
            newCategories.push(cat);
        }

        if (newCategories.length > 0) {
            const lastCatQ = categorydb
                .findOne({ tenantId: franchiseeId })
                .sort({ orderId: -1 })
                .select("orderId");
            if (session) lastCatQ.session(session);
            const lastCategory = await lastCatQ.lean();

            let nextCategoryOrder = Number.isFinite(Number(lastCategory?.orderId))
                ? Number(lastCategory.orderId) + 1
                : 1;

            const copiedCategories = newCategories.map((cat) => {
                const { _id, ...rest } = cat;
                return {
                    ...rest,
                    _id: new mongoose.Types.ObjectId(),
                    orderId: nextCategoryOrder++,
                    createdBy,
                    tenantId: franchiseeId,
                    isBaseCategory: false,
                    purchasedFromBaseCategory: true,
                    originalCategoryId: cat.originalCategoryId || cat._id,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
            });

            await categorydb.insertMany(copiedCategories, sessionOpt);
            assignedCounts.categories = copiedCategories.length;

            for (const copiedCategory of copiedCategories) {
                categoryResolver.register(copiedCategory);
                const copiedOriginalId = toIdString(copiedCategory.originalCategoryId);
                if (copiedOriginalId) assignedCategoryOriginalIds.add(copiedOriginalId);
                assignedCategoryNames.add(String(copiedCategory.category));
            }
        }
    }

    // === UNITS ===
    if (unitIds.length > 0) {
        const candidateUnits = await runFind(unitdb, {
            _id: { $in: unitIds },
            $or: [
                { isBaseUnit: true },
                ...(sourceAdminId ? [{ tenantId: sourceAdminId }] : [{ tenantId: { $ne: null } }])
            ]
        });

        const newUnits = [];
        for (const unit of candidateUnits) {
            const unitLabel = String(unit.unit || "").trim();
            if (!unitLabel) continue;
            const origRef = toIdString(unit.originalUnitId);
            if (
                assignedUnitOriginalIds.has(String(unit._id)) ||
                (origRef && assignedUnitOriginalIds.has(origRef)) ||
                assignedUnitNames.has(unitLabel)
            ) {
                continue;
            }
            assignedUnitNames.add(unitLabel);
            newUnits.push(unit);
        }

        if (newUnits.length > 0) {
            const copiedUnits = newUnits.map((unit) => {
                const { _id, ...rest } = unit;
                return {
                    ...rest,
                    _id: new mongoose.Types.ObjectId(),
                    createdBy,
                    tenantId: franchiseeId,
                    isBaseUnit: false,
                    purchasedFromBaseUnit: true,
                    originalUnitId: unit.originalUnitId || unit._id,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
            });

            await unitdb.insertMany(copiedUnits, sessionOpt);
            assignedCounts.units = copiedUnits.length;

            for (const copiedUnit of copiedUnits) {
                const copiedOriginalId = toIdString(copiedUnit.originalUnitId);
                if (copiedOriginalId) assignedUnitOriginalIds.add(copiedOriginalId);
                assignedUnitNames.add(String(copiedUnit.unit));
            }
        }
    }

    // === SAMPLE TYPES ===
    if (sampleTypeIds.length > 0) {
        const candidateSamples = await runFind(sampleSchema, {
            _id: { $in: sampleTypeIds },
            $or: [
                { isBaseSample: true },
                ...(sourceAdminId ? [{ tenantId: sourceAdminId }] : [{ tenantId: { $ne: null } }])
            ]
        });

        const newSamples = [];
        for (const sample of candidateSamples) {
            const sampleName = String(sample.Name || "").trim();
            if (!sampleName) continue;
            const origRef = toIdString(sample.originalSampleId);
            if (
                assignedSampleOriginalIds.has(String(sample._id)) ||
                (origRef && assignedSampleOriginalIds.has(origRef)) ||
                assignedSampleNames.has(sampleName)
            ) {
                continue;
            }
            assignedSampleNames.add(sampleName);
            newSamples.push(sample);
        }

        if (newSamples.length > 0) {
            const copiedSamples = newSamples.map((sample) => {
                const { _id, ...rest } = sample;
                return {
                    ...rest,
                    _id: new mongoose.Types.ObjectId(),
                    createdBy,
                    tenantId: franchiseeId,
                    isBaseSample: false,
                    purchasedFromBaseSample: true,
                    originalSampleId: sample.originalSampleId || sample._id,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
            });

            await sampleSchema.insertMany(copiedSamples, sessionOpt);
            assignedCounts.sampleTypes = copiedSamples.length;

            for (const copiedSample of copiedSamples) {
                const copiedOriginalId = toIdString(copiedSample.originalSampleId);
                if (copiedOriginalId) assignedSampleOriginalIds.add(copiedOriginalId);
                assignedSampleNames.add(String(copiedSample.Name));
            }
        }
    }

    // === TESTS ===
    if (testIds.length > 0) {
        const allCandidateTests = await runFind(testSchema, { _id: { $in: testIds } });

        const candidateTests = allCandidateTests.filter((t) => {
            if (t.createdByRole === "admin" || t.createdByRole === "superAdmin" || t.isBaseTest === true) {
                return true;
            }
            return t.isBaseTest === false || Boolean(t.tenantId);
        });

        const newTests = [];
        for (const test of candidateTests) {
            const testName = test.Name == null ? "" : String(test.Name);
            if (!testName.trim()) continue;
            const origRef = toIdString(test.originalTestId);
            if (
                testIdByOriginalId.has(String(test._id)) ||
                (origRef && testIdByOriginalId.has(origRef)) ||
                testIdByName.has(testName)
            ) {
                continue;
            }
            testIdByName.set(testName, test._id);
            newTests.push(test);
        }

        if (newTests.length > 0) {
            const copiedTests = [];
            const sourceTestTenantIds = new Set();

            for (const test of newTests) {
                const { _id, __v, ...rest } = test;
                if (test.tenantId) sourceTestTenantIds.add(toIdString(test.tenantId));

                const newCategory = categoryResolver.resolve(test.category);
                const copiedParameters = normalizeParameterPayload(
                    (Array.isArray(rest.parameters) ? rest.parameters : []).map((parameter) => ({
                        ...parameter,
                        originalParameterId: toIdString(parameter?.originalParameterId) || toIdString(parameter?._id) || null,
                    }))
                );

                const safePrice = Number.isFinite(Number(rest.Price)) ? Number(rest.Price) : 0;
                const safeFinalPrice = Number.isFinite(Number(rest.final_price)) ? Number(rest.final_price) : safePrice;
                const safeSampleType = String(rest.sampleType || "").trim() || "Blood";
                const resolvedOriginalTestId = test.originalTestId || test._id;

                if (test.createdByRole === "superAdmin") {
                    copiedTests.push({
                        ...rest,
                        _id: new mongoose.Types.ObjectId(),
                        createdBy,
                        category: newCategory,
                        parameters: copiedParameters,
                        Price: safePrice,
                        final_price: safeFinalPrice,
                        sampleType: safeSampleType,
                        tenantId: franchiseeId,
                        assignedPrices: [],
                        purchasedBy: [],
                        isBaseTest: false,
                        purchasedFromBaseTest: true,
                        originalTestId: resolvedOriginalTestId,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });
                } else {
                    copiedTests.push({
                        ...rest,
                        _id: new mongoose.Types.ObjectId(),
                        createdBy,
                        createdByRole: "admin",
                        category: newCategory,
                        parameters: copiedParameters,
                        Price: safePrice,
                        final_price: safeFinalPrice,
                        sampleType: safeSampleType,
                        tenantId: franchiseeId,
                        assignedPrices: [],
                        purchasePrice: [],
                        purchasedBy: [],
                        isBaseTest: true,
                        purchasedFromBaseTest: false,
                        originalTestId: resolvedOriginalTestId,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });
                }
            }

            if (copiedTests.length > 0) {
                await testSchema.insertMany(copiedTests, sessionOpt);
                assignedCounts.tests = copiedTests.length;

                copiedTests.forEach((copiedTest, idx) => {
                    const sourceTest = newTests[idx];
                    if (sourceTest?._id) {
                        testIdByOriginalId.set(String(sourceTest._id), copiedTest._id);
                    }
                    const copiedOriginalId = toIdString(copiedTest.originalTestId);
                    if (copiedOriginalId && !testIdByOriginalId.has(copiedOriginalId)) {
                        testIdByOriginalId.set(copiedOriginalId, copiedTest._id);
                    }
                    testIdByName.set(String(copiedTest.Name), copiedTest._id);
                });

                const sourceTestIds = [...new Set(newTests.map((t) => String(t._id)))];
                if (sourceTestIds.length > 0) {
                    const purchaseDate = new Date();
                    await testSchema.updateMany(
                        { _id: { $in: sourceTestIds }, "purchasedBy.tenantId": { $ne: franchiseeId } },
                        {
                            $push: {
                                purchasedBy: {
                                    tenantId: franchiseeId,
                                    purchasePrice: 1,
                                    purchaseDate
                                }
                            }
                        },
                        sessionOpt
                    );
                }

                const relevantMasterKeys = copiedTests.flatMap((test) =>
                    (test.parameters || []).map((parameter) => String(parameter?.masterParameterKey || "").trim())
                );
                const sourceParameterEntries = newTests.flatMap((test) =>
                    (test.parameters || []).map((parameter) => ({
                        parameterId: parameter?._id,
                        masterParameterKey: parameter?.masterParameterKey,
                        label: buildParameterLabel(test.Name, parameter?.Para_name || test.Name || "Parameter"),
                    }))
                );
                assignedCounts.formulas = await copyScopedFormulasToTenant({
                    session,
                    sourceScopeId: sourceFormulaScopeId,
                    sourceScopeIds: [sourceAdminId, ...sourceTestTenantIds, sourceFormulaScopeId],
                    targetTenantId: franchiseeId,
                    createdBy,
                    relevantMasterKeys,
                    sourceParameterEntries,
                });
            }
        }
    }

    // === PANELS ===
    if (panelIds.length > 0) {
        const allCandidatePanels = await runFind(addPannel, { _id: { $in: panelIds } });

        const candidatePanels = allCandidatePanels.filter((p) => {
            if (p.createdByRole === "admin" || p.createdByRole === "superAdmin" || p.isBasePanel === true) {
                return true;
            }
            return p.isBasePanel === false || Boolean(p.tenantId);
        });

        const newPanels = [];
        for (const panel of candidatePanels) {
            const panelName = panel.name == null ? "" : String(panel.name);
            if (!panelName.trim()) continue;
            const origRef = toIdString(panel.originalPanelId);
            if (
                panelIdByOriginalId.has(String(panel._id)) ||
                (origRef && panelIdByOriginalId.has(origRef)) ||
                panelIdByName.has(panelName)
            ) {
                continue;
            }
            panelIdByName.set(panelName, panel._id);
            newPanels.push(panel);
        }

        if (newPanels.length > 0) {
            const unresolvedSrcTestIds = [];
            for (const panel of newPanels) {
                for (const srcId of Array.isArray(panel.testsId) ? panel.testsId : []) {
                    const idStr = toIdString(srcId);
                    if (idStr && !testIdByOriginalId.has(idStr)) {
                        unresolvedSrcTestIds.push(idStr);
                    }
                }
            }
            const sourceTestFallbackMap = new Map();
            if (unresolvedSrcTestIds.length > 0) {
                const srcTestDocs = await runFind(
                    testSchema,
                    { _id: { $in: [...new Set(unresolvedSrcTestIds)] } },
                    "_id Name originalTestId"
                );
                for (const doc of srcTestDocs) {
                    sourceTestFallbackMap.set(String(doc._id), doc);
                }
            }

            const resolveTargetTestId = (srcTestId, fallbackName) => {
                const srcIdStr = toIdString(srcTestId);
                let found = srcIdStr ? testIdByOriginalId.get(srcIdStr) : null;
                if (!found && fallbackName) {
                    found = testIdByName.get(String(fallbackName));
                }
                if (!found && srcIdStr) {
                    const srcDoc = sourceTestFallbackMap.get(srcIdStr);
                    if (srcDoc) {
                        const origId = toIdString(srcDoc.originalTestId);
                        found = (origId && testIdByOriginalId.get(origId)) || testIdByName.get(String(srcDoc.Name));
                    }
                }
                return found || null;
            };

            const copiedPanels = [];
            for (const panel of newPanels) {
                const { _id, __v, ...rest } = panel;
                const newCategory = categoryResolver.resolve(panel.category);

                const mappedTestIds = [];
                const testsNames = Array.isArray(panel.tests) ? panel.tests : [];
                const testsIdArr = Array.isArray(panel.testsId) ? panel.testsId : [];

                for (let idx = 0; idx < testsIdArr.length; idx++) {
                    const foundTestId = resolveTargetTestId(testsIdArr[idx], testsNames[idx] || null);
                    if (foundTestId) mappedTestIds.push(foundTestId);
                }

                const resolvedOriginalPanelId = panel.originalPanelId || panel._id;
                const safeSampleTypes = Array.isArray(rest.sample_types)
                    ? rest.sample_types.filter(Boolean)
                    : [];

                if (panel.createdByRole === "superAdmin") {
                    copiedPanels.push({
                        ...rest,
                        _id: new mongoose.Types.ObjectId(),
                        createdBy,
                        category: newCategory,
                        tenantId: franchiseeId,
                        isBasePanel: false,
                        purchasedFromBasePanel: true,
                        originalPanelId: resolvedOriginalPanelId,
                        assignedPrices: [],
                        purchasedBy: [],
                        sample_types: safeSampleTypes,
                        testsId: mappedTestIds,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });
                } else {
                    copiedPanels.push({
                        ...rest,
                        _id: new mongoose.Types.ObjectId(),
                        createdBy,
                        createdByRole: "admin",
                        category: newCategory,
                        tenantId: franchiseeId,
                        isBasePanel: true,
                        purchasedFromBasePanel: false,
                        purchasedBy: [],
                        originalPanelId: resolvedOriginalPanelId,
                        assignedPrices: [],
                        sample_types: safeSampleTypes,
                        testsId: mappedTestIds,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });
                }
            }

            if (copiedPanels.length > 0) {
                await addPannel.insertMany(copiedPanels, sessionOpt);
                assignedCounts.panels = copiedPanels.length;

                copiedPanels.forEach((copiedPanel, idx) => {
                    const sourcePanel = newPanels[idx];
                    if (sourcePanel?._id) {
                        panelIdByOriginalId.set(String(sourcePanel._id), copiedPanel._id);
                    }
                    const copiedOriginalId = toIdString(copiedPanel.originalPanelId);
                    if (copiedOriginalId && !panelIdByOriginalId.has(copiedOriginalId)) {
                        panelIdByOriginalId.set(copiedOriginalId, copiedPanel._id);
                    }
                    panelIdByName.set(String(copiedPanel.name), copiedPanel._id);
                });

                const sourcePanelIds = [...new Set(newPanels.map((p) => String(p._id)))];
                if (sourcePanelIds.length > 0) {
                    const purchaseDate = new Date();
                    await addPannel.updateMany(
                        { _id: { $in: sourcePanelIds }, "purchasedBy.tenantId": { $ne: franchiseeId } },
                        {
                            $push: {
                                purchasedBy: {
                                    tenantId: franchiseeId,
                                    purchasePrice: 2,
                                    purchaseDate
                                }
                            }
                        },
                        sessionOpt
                    );
                }
            }
        }
    }

    // === PACKAGES ===
    if (packageIds.length > 0) {
        const allCandidatePackages = await runFind(Package, { _id: { $in: packageIds } });

        const candidatePackages = allCandidatePackages.filter((p) => {
            if (p.createdByRole === "admin" || p.createdByRole === "superAdmin" || p.isBasePackage === true) {
                return true;
            }
            return p.isBasePackage === false || Boolean(p.tenantId);
        });

        const newPackages = [];
        for (const pkg of candidatePackages) {
            const pkgName = pkg.packageName == null ? "" : String(pkg.packageName);
            if (!pkgName.trim()) continue;
            const origRef = toIdString(pkg.originalPackageId);
            if (
                packageIdByOriginalId.has(String(pkg._id)) ||
                (origRef && packageIdByOriginalId.has(origRef)) ||
                packageIdByName.has(pkgName)
            ) {
                continue;
            }
            packageIdByName.set(pkgName, pkg._id);
            newPackages.push(pkg);
        }

        if (newPackages.length > 0) {
            const unresolvedSrcTestIds = [];
            const unresolvedSrcPanelIds = [];
            for (const pkg of newPackages) {
                for (const id of Array.isArray(pkg.testIds) ? pkg.testIds : []) {
                    const s = toIdString(id);
                    if (s && !testIdByOriginalId.has(s)) unresolvedSrcTestIds.push(s);
                }
                for (const id of Array.isArray(pkg.pannelIds) ? pkg.pannelIds : []) {
                    const s = toIdString(id);
                    if (s && !panelIdByOriginalId.has(s)) unresolvedSrcPanelIds.push(s);
                }
            }

            const [srcTestDocs, srcPanelDocs] = await Promise.all([
                unresolvedSrcTestIds.length > 0
                    ? runFind(testSchema, { _id: { $in: [...new Set(unresolvedSrcTestIds)] } }, "_id Name originalTestId")
                    : [],
                unresolvedSrcPanelIds.length > 0
                    ? runFind(addPannel, { _id: { $in: [...new Set(unresolvedSrcPanelIds)] } }, "_id name originalPanelId")
                    : []
            ]);

            const sourceTestFallbackMap = new Map(srcTestDocs.map((d) => [String(d._id), d]));
            const sourcePanelFallbackMap = new Map(srcPanelDocs.map((d) => [String(d._id), d]));

            const copiedPackages = [];
            for (const pkg of newPackages) {
                const { _id, __v, ...rest } = pkg;

                const mappedTestIds = [];
                const srcTestIds = Array.isArray(pkg.testIds) ? pkg.testIds : [];
                const srcTestNames = Array.isArray(pkg.testname) ? pkg.testname : [];
                for (let i = 0; i < srcTestIds.length; i++) {
                    const srcIdStr = toIdString(srcTestIds[i]);
                    let foundTestId = srcIdStr ? testIdByOriginalId.get(srcIdStr) : null;
                    if (!foundTestId && srcTestNames[i]) {
                        foundTestId = testIdByName.get(String(srcTestNames[i]));
                    }
                    if (!foundTestId && srcIdStr) {
                        const srcDoc = sourceTestFallbackMap.get(srcIdStr);
                        if (srcDoc) {
                            const origId = toIdString(srcDoc.originalTestId);
                            foundTestId = (origId && testIdByOriginalId.get(origId)) || testIdByName.get(String(srcDoc.Name));
                        }
                    }
                    if (foundTestId) mappedTestIds.push(foundTestId);
                }

                const mappedPanelIds = [];
                const srcPanelIds = Array.isArray(pkg.pannelIds) ? pkg.pannelIds : [];
                const srcPanelNames = Array.isArray(pkg.pannelname) ? pkg.pannelname : [];
                for (let i = 0; i < srcPanelIds.length; i++) {
                    const srcIdStr = toIdString(srcPanelIds[i]);
                    let foundPanelId = srcIdStr ? panelIdByOriginalId.get(srcIdStr) : null;
                    if (!foundPanelId && srcPanelNames[i]) {
                        foundPanelId = panelIdByName.get(String(srcPanelNames[i]));
                    }
                    if (!foundPanelId && srcIdStr) {
                        const srcDoc = sourcePanelFallbackMap.get(srcIdStr);
                        if (srcDoc) {
                            const origId = toIdString(srcDoc.originalPanelId);
                            foundPanelId = (origId && panelIdByOriginalId.get(origId)) || panelIdByName.get(String(srcDoc.name));
                        }
                    }
                    if (foundPanelId) mappedPanelIds.push(foundPanelId);
                }

                const resolvedOriginalPackageId = pkg.originalPackageId || pkg._id;
                const safeGender = ["male", "female", "Both"].includes(rest.packageGender) ? rest.packageGender : "Both";
                const safePackageFee = String(rest.packageFee ?? rest.final_price ?? "0");
                const safeFinalPrice = String(rest.final_price ?? rest.packageFee ?? "0");

                if (pkg.createdByRole === "superAdmin") {
                    copiedPackages.push({
                        ...rest,
                        _id: new mongoose.Types.ObjectId(),
                        createdBy,
                        tenantId: franchiseeId,
                        packageGender: safeGender,
                        packageFee: safePackageFee,
                        final_price: safeFinalPrice,
                        isBasePackage: false,
                        purchasedFromBasePackage: true,
                        assignedPrices: [],
                        purchasedBy: [],
                        originalPackageId: resolvedOriginalPackageId,
                        testIds: mappedTestIds,
                        pannelIds: mappedPanelIds,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });
                } else {
                    copiedPackages.push({
                        ...rest,
                        _id: new mongoose.Types.ObjectId(),
                        createdBy,
                        createdByRole: "admin",
                        tenantId: franchiseeId,
                        packageGender: safeGender,
                        packageFee: safePackageFee,
                        final_price: safeFinalPrice,
                        isBasePackage: true,
                        purchasedFromBasePackage: false,
                        assignedPrices: [],
                        purchasedBy: [],
                        originalPackageId: resolvedOriginalPackageId,
                        testIds: mappedTestIds,
                        pannelIds: mappedPanelIds,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });
                }
            }

            if (copiedPackages.length > 0) {
                await Package.insertMany(copiedPackages, sessionOpt);
                assignedCounts.packages = copiedPackages.length;

                const sourcePackageIds = [...new Set(newPackages.map((p) => String(p._id)))];
                if (sourcePackageIds.length > 0) {
                    const purchaseDate = new Date();
                    await Package.updateMany(
                        { _id: { $in: sourcePackageIds }, "purchasedBy.tenantId": { $ne: franchiseeId } },
                        {
                            $push: {
                                purchasedBy: {
                                    tenantId: franchiseeId,
                                    purchasePrice: 3,
                                    purchaseDate
                                }
                            }
                        },
                        sessionOpt
                    );
                }
            }
        }
    }

    const skippedCounts = {
        tests: Math.max(0, testIds.length - assignedCounts.tests),
        panels: Math.max(0, panelIds.length - assignedCounts.panels),
        packages: Math.max(0, packageIds.length - assignedCounts.packages),
        categories: Math.max(0, categoryIds.length - assignedCounts.categories),
        units: Math.max(0, unitIds.length - assignedCounts.units),
        sampleTypes: Math.max(0, sampleTypeIds.length - assignedCounts.sampleTypes),
    };

    return { assignedCounts, skippedCounts };
};

const assignModelsToFranchisee = asyncHandler(async (req, res) => {
    let session = null;
    try {
        const { franchiseeId } = req.body || {};

        if (!franchiseeId || !mongoose.isValidObjectId(String(franchiseeId))) {
            return res.status(400).json({ success: false, message: "Valid Franchisee ID is required." });
        }

        const tenant = await Tenant.findById(franchiseeId);
        if (!tenant || !tenant.adminDetails?.userId) {
            return res.status(404).json({ success: false, message: "Franchisee or its admin account was not found." });
        }

        let assignmentResult = null;
        try {
            session = await mongoose.startSession();
            session.startTransaction();
            assignmentResult = await executeCatalogAssignment({ req, tenant, session });
            await session.commitTransaction();
            session.endSession();
            session = null;
        } catch (txError) {
            if (session) {
                try { await session.abortTransaction(); } catch (_) {}
                try { session.endSession(); } catch (_) {}
                session = null;
            }
            if (!isTransactionUnsupportedError(txError)) {
                throw txError;
            }
            assignmentResult = await executeCatalogAssignment({ req, tenant, session: null });
        }

        const { assignedCounts, skippedCounts } = assignmentResult;
        const totalAssigned = Object.values(assignedCounts).reduce((sum, count) => sum + count, 0);

        return res.status(200).json({
            success: true,
            message: `Successfully assigned ${totalAssigned} models without duplicates.`,
            assignedCounts,
            skippedCounts,
            details: {
                skippedDuplicates: skippedCounts
            }
        });
    } catch (err) {
        if (session) {
            try { await session.abortTransaction(); } catch (_) {}
            try { session.endSession(); } catch (_) {}
        }
        console.error("Assignment Error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to assign models",
            error: err.message
        });
    }
});

const getAllModels = async (req, res) => {
        let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }
    try {
        const tests = await testSchema.find({ createdBy: userId }).select("_id");
        const panels = await addPannel.find({ createdBy: userId }).select("_id");
        const packages = await Package.find({ createdBy: userId }).select("_id");
        const testIds = tests.map(t => t._id);
        const panelIds = panels.map(p => p._id);
        const packageIds = packages.map(pk => pk._id);

        res.status(200).json({
            success: true,
            testIds,
            panelIds,
            packageIds
        });

    } catch (error) {
        console.error("Fetch error:", error);
        res.status(500).json({ success: false, message: "Could not fetch models" });
    }
};


// Add this route to your backend
const adminAssign = asyncHandler(async (req, res) => {
    try {
        const { adminId } = req.body || {};

        if (!adminId || !mongoose.isValidObjectId(String(adminId))) {
            return res.status(400).json({
                success: false,
                message: "Valid adminId is required."
            });
        }

        const [
            assignedTests,
            assignedPanels,
            assignedPackages,
            assignedCategories,
            assignedUnits,
            assignedSampleTypes
        ] = await Promise.all([
            testSchema
                .find({ tenantId: adminId })
                .select("_id Name Short_name Price final_price category sampleType createdByRole originalTestId purchasedFromBaseTest")
                .sort({ order: 1, _id: 1 })
                .lean(),
            addPannel
                .find({ tenantId: adminId })
                .select("_id name Short_name price final_price category testsId createdByRole originalPanelId purchasedFromBasePanel")
                .sort({ order: 1, _id: 1 })
                .lean(),
            Package
                .find({ tenantId: adminId })
                .select("_id packageName packageFee final_price testIds pannelIds createdByRole originalPackageId purchasedFromBasePackage")
                .sort({ order: 1, _id: 1 })
                .lean(),
            categorydb
                .find({ tenantId: adminId })
                .select("_id category orderId originalCategoryId createdByRole")
                .sort({ orderId: 1, _id: 1 })
                .lean(),
            unitdb
                .find({ tenantId: adminId })
                .select("_id unit originalUnitId createdByRole")
                .lean(),
            sampleSchema
                .find({ tenantId: adminId })
                .select("_id Name originalSampleId createdByRole")
                .lean(),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                tests: assignedTests,
                panels: assignedPanels,
                packages: assignedPackages,
                categories: assignedCategories,
                units: assignedUnits,
                sampleTypes: assignedSampleTypes,
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

const getAllAddOns = asyncHandler(async (req, res) => {
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser;
    } else {
        userId = req.user._id;
    }
    try {
        // Assignment copies SuperAdmin base catalog records (never tenant-scoped records).
        const [units, sampleTypes, categories] = await Promise.all([
            unitdb.find({
                tenantId: null,
                isBaseUnit: true,
                $or: [{ createdBy: userId }, { createdByRole: "superAdmin" }]
            }).select("_id").lean(),
            sampleSchema.find({
                tenantId: null,
                isBaseSample: true,
                $or: [{ createdBy: userId }, { createdByRole: "superAdmin" }]
            }).select("_id").lean(),
            categorydb.find({
                tenantId: null,
                isBaseCategory: true,
                $or: [{ createdBy: userId }, { createdByRole: "superAdmin" }]
            }).select("_id").lean(),
        ]);
        const unitIds = units.map(u => u._id);
        const sampleTypeIds = sampleTypes.map(s => s._id);
        const categoryIds = categories.map(c => c._id);
        res.status(200).json({
            success: true,
            unitIds,
            sampleTypeIds,
            categoryIds
        });
    } catch (error) {
        console.error("Fetch error:", error);
        res.status(500).json({ success: false, message: "Could not fetch add-ons" });
    }
});

const deleteTestsController = asyncHandler(async (req, res) => {
    const { testIds } = req.body;
    if (!testIds || !Array.isArray(testIds) || testIds.length === 0) {
        throw new ApiError(400, "testIds array is required");
    }
    const deletedTests = await testSchema.deleteMany({ _id: { $in: testIds } });
    return res.status(200).json(new ApiResponse(200, deletedTests, "Tests deleted successfully"));
});

export {
    addingTest,
    editTest,
    allTest,
    testCate,
    editTestCate,
    editdefaultresult,
    getAllTestCate,
    getOneTestCate,
    updateTestCate,
    findTestcontroller,
    updateTestcontroller,
    updateTestOrder,
    updateTestOrdersuper,
    reorderTestsFromReport,
    reorderTestParametersFromReport,
    updateTestInterpretation,
    getOneTest,
    addsample,
    fetchsample,
    getUnits,
    addUnit,
    tenantTest,
    getAllModels,
    assignModelsToFranchisee,
    addingTesttenant,
    updateTestCateadmin,
    getAllTestCateadmin,
    fetchsampleadmin,
    addUnitadmin,
    addsampleadmin,
    editTesttenant,
    adminAssign,
    getAllAddOns,
    deleteTestsController,
}
