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

        return {
            ...parameter,
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
    const byOriginalId = new Map();
    const byName = new Map();

    const register = (category) => {
        if (!category) return;

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
                return byOriginalId.get(toIdString(entry._id)) || entry;
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

async function copyScopedFormulasToTenant({
    session,
    sourceScopeId,
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

    if (!sourceScopeId || !targetTenantId || (!normalizedMasterKeys.length && !sourceParameterIds.length)) {
        return 0;
    }

    const sourceFormulas = await Formula.find({
        tenantId: sourceScopeId,
        $or: [
            { targetMasterKey: { $in: normalizedMasterKeys } },
            { targetParameterId: { $in: sourceParameterIds } },
        ],
    }).session(session).lean();

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

    const targetTests = await testSchema.find({
        tenantId: targetTenantId,
        "parameters.masterParameterKey": { $in: normalizedMasterKeys },
    })
        .select("_id Name parameters")
        .session(session)
        .lean();

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

    for (const formula of sourceFormulas) {
        const fallbackTargetMasterKey =
            String(formula.targetMasterKey || "").trim() ||
            String(sourceParameterMapById.get(toIdString(formula.targetParameterId))?.masterParameterKey || "").trim();
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
        await Formula.bulkWrite(formulaUpserts, { session, ordered: false });
        copiedCount = formulaUpserts.length;
    }

    return copiedCount;
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

    if (!Name || !category || !final_price || !Price || !sampleType) {
        return res.status(400).json({ message: "Missing required fields" })
    }

    // checking if test is allready in database
    const allreadyExistedTest = await testSchema.findOne(
        {
            Name: Name,
            createdBy: userId
        }
    )

    if (allreadyExistedTest) {
        return res.status(400).json({ message: "This test is already Exists" });
    }

    const lastPanel = await testSchema
        .findOne({ createdBy: userId}) // optionally filter by tenant
        .sort({ order: -1 })             // highest order first
        .select('order');                // only fetch order field

    const nextOrder = lastPanel ? lastPanel.order + 1 : 1;
    const nextBookingCode = await getNextBookingCodeForScope({
        createdBy: userId,
        createdByRole: "superAdmin"
    });
    const normalizedParameters = normalizeParameterPayload(parameters);

    const testCreated = await testSchema.create({
        Name,
        Short_name,
        category: category || "",
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

    if (!Name || !category || !final_price || !Price || !sampleType) {
        return res.status(400).json({ message: "Missing required fields" })
    }

    // checking if test is allready in database
    const allreadyExistedTest = await testSchema.findOne(
        {
            Name: Name,
            tenantId: tenantId
        }
    )

    if (allreadyExistedTest) {
        return res.status(400).json({ message: "This test is already Exists" });
    }

    const lastPanel = await testSchema
        .findOne({ createdBy: req.user._id }) // optionally filter by tenant
        .sort({ order: -1 })             // highest order first
        .select('order');                // only fetch order field

    const nextOrder = lastPanel ? lastPanel.order + 1 : 1;
    const nextBookingCode = await getNextBookingCodeForScope({ tenantId });
    const normalizedParameters = normalizeParameterPayload(parameters);

    const testCreated = await testSchema.create({
        Name,
        Short_name,
        category: category || "",
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

    const samples = await sampleSchema.find(query);

    if (!samples) {
        return res.status(500).json({ message: "! No samples found" })
    }

    return res.status(200).json({ message: "sample added successfully", data: samples });
}

// admin fetch samples correct 
const fetchsampleadmin = async (req, res) => {

    const samples = await sampleSchema.find({
        tenantId: req.user.tenantId._id
    })

    if (!samples) {
        return res.status(500).json({ message: "! No samples found" })
    }

    return res.status(200).json({ message: "sample added successfully", data: samples });
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

const updateTestOrder = asyncHandler(async (req, res) => {
    const { updatedOrder } = req.body;
    const tid = req.user.tenantId._id;
    if (!Array.isArray(updatedOrder) || updatedOrder.length === 0) {
        throw new ApiError(400, "Invalid or empty order data");
    }

    try {
        const bulkOperations = await Promise.all(updatedOrder.map(async (orderData) => {
            let { id, order } = orderData;

            // If id is a valid MongoDB ObjectId, use it directly
            if (mongoose.isValidObjectId(id)) {
                id = new mongoose.Types.ObjectId(id); // Convert string ObjectId to ObjectId type
            }
            // If id is a numeric value (e.g., '4'), map it to ObjectId by querying the database
            else if (typeof id !== "number") {
                const idofNumber = parseInt(id);
                const test = await testSchema.findOne({
                    order: idofNumber,
                    tenantId: tid
                });
                if (!test) {
                    throw new ApiError(400, `Test with order ${id} not found`);
                }
                id = test._id; // Use the found ObjectId
            }
            else {
                throw new ApiError(400, `Invalid ObjectId: ${id}`);
            }

            return {
                updateOne: {
                    filter: { _id: id },
                    update: { order },
                },
            };
        }));

        // Execute the bulk write operation
        await testSchema.bulkWrite(bulkOperations);

        res.json({
            status: 200,
            message: "Test order updated successfully",
        });
    } catch (error) {
        console.error("Error updating test order:", error);
        throw new ApiError(500, "Failed to update test order");
    }
});
const updateTestOrdersuper = asyncHandler(async (req, res) => {
    const { updatedOrder } = req.body;
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser;
    } else {
        userId = req.user._id;
    }
    if (!Array.isArray(updatedOrder) || updatedOrder.length === 0) {
        throw new ApiError(400, "Invalid or empty order data");
    }

    try {
        const bulkOperations = await Promise.all(updatedOrder.map(async (orderData) => {
            let { id, order } = orderData;

            // If id is a valid MongoDB ObjectId, use it directly
            if (mongoose.isValidObjectId(id)) {
                id = new mongoose.Types.ObjectId(id); // Convert string ObjectId to ObjectId type
            }
            // If id is a numeric value (e.g., '4'), map it to ObjectId by querying the database
            else if (typeof id !== "number") {
                const idofNumber = parseInt(id);
                const test = await testSchema.findOne({
                    order: idofNumber,
                    createdBy: userId
                });
                if (!test) {
                    throw new ApiError(400, `Test with order ${id} not found`);
                }
                id = test._id; // Use the found ObjectId
            }
            else {
                throw new ApiError(400, `Invalid ObjectId: ${id}`);
            }

            return {
                updateOne: {
                    filter: { _id: id },
                    update: { order },
                },
            };
        }));

        // Execute the bulk write operation
        await testSchema.bulkWrite(bulkOperations);

        res.json({
            status: 200,
            message: "Test order updated successfully",
        });
    } catch (error) {
        console.error("Error updating test order:", error);
        throw new ApiError(500, "Failed to update test order");
    }
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
    if (!Name || !final_price || !Short_name || !category || !Price || !sampleType) {
        return res.status(401).json({ message: "missing required fields", status: "error" })
    }
    const currentTest = await testSchema.findById({
        createdBy: userId,
        _id
    });

    if (!currentTest) {
        return res.status(401).json({ message: "something went wrong, Test not found", status: "error" });
    }
    const normalizedParameters = normalizeParameterPayload(parameters, currentTest.parameters);

    const editedTest = await testSchema.findOneAndUpdate(
        {
            _id
        },
        {
            Name,
            Short_name,
            category: category || "",
            Price,
            parameters: normalizedParameters || null,
            sampleType,
            method: method || "",
            tat: tat || "",
            instrument: instrument || "",
            interpretation: interpretation || "",
            hideMethodInstrument: normalizedHideMethodInstrument,
            hideInterpretation: normalizedHideInterpretation,
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

    if (!final_price || !Short_name || !category || !Price || !sampleType) {
        return res.status(401).json({ message: "missing required fields", status: "error" })
    }

    const currentTest = await testSchema.findById({
        tenantId: tid,
        createdBy: userId,
        _id
    });
    if (!currentTest) {
        return res.status(401).json({ message: "something went wrong, Test not found", status: "error" });
    }
    const normalizedParameters = normalizeParameterPayload(parameters, currentTest.parameters);

    const editedTest = await testSchema.findOneAndUpdate(
        {
            _id
        },
        {
            Short_name,
            category: category || "",
            Price,
            parameters: normalizedParameters || null,
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

    const allrecievedTest = await testSchema.find(query);
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
        });
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
const assignModelsToFranchisee = asyncHandler(async (req, res) => {
    let session; // created later, after validation
    try {
        const {
            franchiseeId,
            testIds = [],
            panelIds = [],
            packageIds = [],
            categoryIds = [],
            unitIds = [],
            sampleTypeIds = []
        } = req.body;

        if (!franchiseeId) {
            return res.status(400).json({ success: false, message: "Franchisee ID is required." });
        }

        // Pre-validate the tenant before starting a transaction so we don't leave open
        // transactions when returning early due to bad input.
        const tenant = await Tenant.findById(franchiseeId);
        if (!tenant || !tenant.adminDetails?.userId) {
            return res.status(404).json({ success: false, message: "Franchisee not found." });
        }

        // Start a session only after basic validation passes
        session = await mongoose.startSession();
        session.startTransaction();

        // If you need the tenant inside the transaction for consistent reads, re-fetch using the session.
        const tenantInSession = await Tenant.findById(franchiseeId).session(session);
        const createdBy = tenantInSession?.adminDetails?.userId || tenant.adminDetails.userId;

        let assignedCounts = {
            tests: 0,
            panels: 0,
            packages: 0,
            categories: 0,
            units: 0,
            sampleTypes: 0,
            formulas: 0,
        };
        const sourceFormulaScopeId = resolveFormulaScopeId(req.user);

        // === PERFORMANCE: PREFETCH EVERY LOOKUP TABLE ONCE ===
        // Previously this endpoint ran 1-2 queries for every test / panel / package
        // (duplicate checks + id remapping). For a big admin that meant thousands of
        // sequential round trips, which blew past the proxy timeout and returned a
        // 504 gateway timeout (html) to the browser. All lookup data is now loaded
        // once into in-memory maps and reused for every item.
        const hasCategoryWork = Boolean((categoryIds?.length || 0) + (testIds?.length || 0) + (panelIds?.length || 0));
        const hasTestWork = Boolean((testIds?.length || 0) + (panelIds?.length || 0) + (packageIds?.length || 0));
        const hasPanelWork = Boolean((panelIds?.length || 0) + (packageIds?.length || 0));

        const [tenantCategoryDocs, tenantTestDocs, tenantPanelDocs, tenantUnitDocs, tenantSampleDocs, tenantPackageDocs] = await Promise.all([
            hasCategoryWork
                ? categorydb.find({ tenantId: franchiseeId }).session(session).lean()
                : [],
            hasTestWork
                ? testSchema.find({ tenantId: franchiseeId }).select("_id Name originalTestId").session(session).lean()
                : [],
            hasPanelWork
                ? addPannel.find({ tenantId: franchiseeId }).select("_id name originalPanelId").session(session).lean()
                : [],
            (unitIds?.length || 0) > 0
                ? unitdb.find({ tenantId: franchiseeId }).select("_id unit originalUnitId").session(session).lean()
                : [],
            (sampleTypeIds?.length || 0) > 0
                ? sampleSchema.find({ tenantId: franchiseeId }).select("_id Name originalSampleId").session(session).lean()
                : [],
            (packageIds?.length || 0) > 0
                ? Package.find({ tenantId: franchiseeId }).select("_id packageName originalPackageId").session(session).lean()
                : [],
        ]);

        const categoryResolver = buildCategoryResolver(tenantCategoryDocs);

        const assignedCategoryOriginalIds = new Set(
            tenantCategoryDocs.map((category) => toIdString(category.originalCategoryId)).filter(Boolean)
        );
        const assignedCategoryNames = new Set(
            tenantCategoryDocs.map((category) => (category.category == null ? "" : String(category.category))).filter(Boolean)
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
            tenantUnitDocs.map((unit) => toIdString(unit.originalUnitId)).filter(Boolean)
        );
        const assignedUnitNames = new Set(
            tenantUnitDocs.map((unit) => (unit.unit == null ? "" : String(unit.unit))).filter(Boolean)
        );

        const assignedSampleOriginalIds = new Set(
            tenantSampleDocs.map((sample) => toIdString(sample.originalSampleId)).filter(Boolean)
        );
        const assignedSampleNames = new Set(
            tenantSampleDocs.map((sample) => (sample.Name == null ? "" : String(sample.Name))).filter(Boolean)
        );

        // === STEP 4: CATEGORIES ===
        if (categoryIds && categoryIds.length > 0) {
            const candidateCategories = await categorydb.find({
                _id: { $in: categoryIds },
                $or: [
                    { isBaseCategory: true },
                    { isBaseCategory: { $exists: false } }  // Field exist नहीं करता
                ]
            }).session(session).lean();

            const newCategories = candidateCategories.filter(cat =>
                !assignedCategoryOriginalIds.has(String(cat._id)) &&
                !assignedCategoryNames.has(String(cat.category))
            );

            if (newCategories.length > 0) {
                // Get next orderId for categories
                const lastCategory = await categorydb
                    .findOne({ tenantId: franchiseeId })
                    .sort({ orderId: -1 })
                    .select('orderId')
                    .session(session)
                    .lean();

                let nextCategoryOrder = lastCategory ? lastCategory.orderId + 1 : 1;

                const copiedCategories = newCategories.map(cat => {
                    const { _id, ...rest } = cat;
                    return {
                        ...rest,
                        _id: new mongoose.Types.ObjectId(),
                        orderId: nextCategoryOrder++,
                        createdBy,
                        tenantId: franchiseeId,
                        isBaseCategory: false,
                        purchasedFromBaseCategory: true,
                        originalCategoryId: cat._id,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                });

                await categorydb.insertMany(copiedCategories, { session });
                assignedCounts.categories = copiedCategories.length;

                // Register the fresh copies so tests/panels copied in this same request
                // can be mapped to them without extra database queries.
                for (const copiedCategory of copiedCategories) {
                    categoryResolver.register(copiedCategory);

                    const copiedOriginalId = toIdString(copiedCategory.originalCategoryId);
                    if (copiedOriginalId) {
                        assignedCategoryOriginalIds.add(copiedOriginalId);
                    }
                    assignedCategoryNames.add(String(copiedCategory.category));
                }
            }
        }

        // === STEP 5: UNITS ===
        if (unitIds && unitIds.length > 0) {
            const candidateUnits = await unitdb.find({
                _id: { $in: unitIds },
                isBaseUnit: true,
            }).session(session).lean();

            const newUnits = candidateUnits.filter(unit =>
                !assignedUnitOriginalIds.has(String(unit._id)) &&
                !assignedUnitNames.has(String(unit.unit))
            );

            if (newUnits.length > 0) {
                const copiedUnits = newUnits.map(unit => {
                    const { _id, ...rest } = unit;
                    return {
                        ...rest,
                        _id: new mongoose.Types.ObjectId(),
                        createdBy,
                        tenantId: franchiseeId,
                        isBaseUnit: false,
                        purchasedFromBaseUnit: true,
                        originalUnitId: unit._id,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                });

                await unitdb.insertMany(copiedUnits, { session });
                assignedCounts.units = copiedUnits.length;

                for (const copiedUnit of copiedUnits) {
                    const copiedOriginalId = toIdString(copiedUnit.originalUnitId);
                    if (copiedOriginalId) {
                        assignedUnitOriginalIds.add(copiedOriginalId);
                    }
                    assignedUnitNames.add(String(copiedUnit.unit));
                }
            }
        }

        // === STEP 6: SAMPLE TYPES ===
        if (sampleTypeIds && sampleTypeIds.length > 0) {
            const candidateSamples = await sampleSchema.find({
                _id: { $in: sampleTypeIds },
                isBaseSample: true,
            }).session(session).lean();

            const newSamples = candidateSamples.filter(sample =>
                !assignedSampleOriginalIds.has(String(sample._id)) &&
                !assignedSampleNames.has(String(sample.Name))
            );

            if (newSamples.length > 0) {
                const copiedSamples = newSamples.map(sample => {
                    const { _id, ...rest } = sample;
                    return {
                        ...rest,
                        _id: new mongoose.Types.ObjectId(),
                        createdBy,
                        tenantId: franchiseeId,
                        isBaseSample: false,
                        purchasedFromBaseSample: true,
                        originalSampleId: sample._id,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                });

                await sampleSchema.insertMany(copiedSamples, { session });
                assignedCounts.sampleTypes = copiedSamples.length;

                for (const copiedSample of copiedSamples) {
                    const copiedOriginalId = toIdString(copiedSample.originalSampleId);
                    if (copiedOriginalId) {
                        assignedSampleOriginalIds.add(copiedOriginalId);
                    }
                    assignedSampleNames.add(String(copiedSample.Name));
                }
            }
        }

        // === STEP 1: TESTS (IMPROVED DUPLICATE DETECTION) ===
        if (testIds && testIds.length > 0) {
            // Base + already-assigned candidates in a single query
            const allCandidateTests = await testSchema.find({
                _id: { $in: testIds },
            }).session(session).lean();

            // Step 2: Split between baseTest & non-baseTest
            const candidateTests = allCandidateTests.filter(t => {
                if (t.createdByRole === 'admin' || t.createdByRole === 'superAdmin' || t.isBaseTest === true) {
                    return true; // सबको allow
                } else {
                    // Already assigned to someone → treat as cloned
                    return t.isBaseTest === false;
                }
            });

            // Filter out tests that would cause duplicates (in-memory lookups only)
            const newTests = candidateTests.filter(test =>
                !testIdByOriginalId.has(String(test._id)) &&
                !testIdByName.has(String(test.Name))
            );

            if (newTests.length > 0) {
                const copiedTests = [];

                for (const test of newTests) {
                    const { _id, ...rest } = test;

                    // Map the source category to the tenant's own copy (in-memory lookup)
                    const newCategory = categoryResolver.resolve(test.category);

                    // Differentiate between SuperAdmin base-tests and admin-created tests
                    if (test.createdByRole === 'superAdmin') {
                        const copiedParameters = normalizeParameterPayload(
                            (rest.parameters || []).map((parameter) => ({
                                ...parameter,
                                originalParameterId: toIdString(parameter.originalParameterId) || toIdString(parameter._id) || null,
                            }))
                        );
                        // SuperAdmin base test -> create a tenant-scoped copy marked as purchased
                        copiedTests.push({
                            ...rest,
                            _id: new mongoose.Types.ObjectId(),
                            createdBy,
                            category: newCategory,
                            parameters: copiedParameters,
                            tenantId: franchiseeId,
                            assignedPrices: [], // reset assignedPrices
                            isBaseTest: false,
                            purchasedFromBaseTest: true,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });
                    } else if (test.createdByRole === 'admin') {
                        const copiedParameters = normalizeParameterPayload(
                            (rest.parameters || []).map((parameter) => ({
                                ...parameter,
                                originalParameterId: toIdString(parameter.originalParameterId) || toIdString(parameter._id) || null,
                            }))
                        );
                        // Admin-created test -> create as baseTest for tenant but keep originalTestId linkage
                        copiedTests.push({
                            ...rest,
                            _id: new mongoose.Types.ObjectId(),
                            createdBy,
                            tenantId: franchiseeId,
                            parameters: copiedParameters,
                            isBaseTest: true,
                            assignedPrices: [], // reset assignedPrices
                            purchasePrice: [],
                            purchasedFromBaseTest: false,
                            originalTestId: test._id,
                            category: newCategory,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });
                    }
                    // If neither condition matches we simply skip (no push)
                }
                if (copiedTests.length > 0) {
                    await testSchema.insertMany(copiedTests, { session });
                    assignedCounts.tests = copiedTests.length;

                    // Make the freshly created tests resolvable for the panels/packages
                    // that are copied later in this very same request.
                    for (const copiedTest of copiedTests) {
                        const copiedOriginalId = toIdString(copiedTest.originalTestId);
                        if (copiedOriginalId && !testIdByOriginalId.has(copiedOriginalId)) {
                            testIdByOriginalId.set(copiedOriginalId, copiedTest._id);
                        }

                        const copiedName = String(copiedTest.Name);
                        if (!testIdByName.has(copiedName)) {
                            testIdByName.set(copiedName, copiedTest._id);
                        }
                    }

                    // Update base tests with purchasedBy info (ONE bulk update instead of N)
                    const sourceTestIds = [...new Set(newTests.map(t => String(t._id)))];
                    if (sourceTestIds.length > 0) {
                        const purchaseDate = new Date();
                        await testSchema.updateMany(
                            { _id: { $in: sourceTestIds } },
                            {
                                $push: {
                                    purchasedBy: {
                                        tenantId: franchiseeId,
                                        purchasePrice: 1,
                                        purchaseDate
                                    }
                                }
                            },
                            { session }
                        );
                    }
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
                    targetTenantId: franchiseeId,
                    createdBy,
                    relevantMasterKeys,
                    sourceParameterEntries,
                });
            }
        }

        // === STEP 2: PANELS (IMPROVED DUPLICATE DETECTION & ID MAPPING) ===
        if (panelIds && panelIds.length > 0) {
            const allCandidatePanels = await addPannel.find({
                _id: { $in: panelIds },
            }).session(session).lean();

            const candidatePanels = allCandidatePanels.filter(t => {
                if (t.createdByRole === 'admin' || t.createdByRole === 'superAdmin' || t.isBasePanel === true) {
                    return true; // सबको allow
                } else {
                    return t.isBasePanel === false
                }
            })

            const newPanels = candidatePanels.filter(panel =>
                !panelIdByOriginalId.has(String(panel._id)) &&
                !panelIdByName.has(String(panel.name))
            );

            if (newPanels.length > 0) {
                const copiedPanels = [];

                for (const panel of newPanels) {
                    const { _id, ...rest } = panel;

                    // Map the source category to the tenant's own copy (in-memory lookup)
                    const newCategory = categoryResolver.resolve(panel.category);

                    // Map testsId array to tenant test ids (by originalTestId first, then by name).
                    // Uses the prefetched test maps instead of one query per test.
                    const mappedTestIds = [];
                    const testsNames = Array.isArray(panel.tests) ? panel.tests : [];
                    const testsIdArr = Array.isArray(panel.testsId) ? panel.testsId : [];

                    for (let idx = 0; idx < testsIdArr.length; idx++) {
                        const srcTestId = testsIdArr[idx];

                        let foundTestId = testIdByOriginalId.get(toIdString(srcTestId));

                        // If not found by originalTestId, try by name (fall back to same index in tests array)
                        if (!foundTestId) {
                            const maybeName = testsNames[idx] || null;
                            if (maybeName) {
                                foundTestId = testIdByName.get(String(maybeName));
                            }
                        }

                        if (foundTestId) mappedTestIds.push(foundTestId);
                        // else skip that test mapping; panel will have fewer testsId entries
                    }

                    if (panel.createdByRole === 'superAdmin') {
                        copiedPanels.push({
                            ...rest,
                            _id: new mongoose.Types.ObjectId(),
                            createdBy,
                            category: newCategory,
                            tenantId: franchiseeId,
                            isBasePanel: false,
                            purchasedFromBasePanel: true,
                            originalPanelId: panel._id,
                            assignedPrices: {}, // reset assignedPrices
                            // attach mapped test ids if any
                            testsId: mappedTestIds,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });
                    }
                    else if (panel.createdByRole === 'admin') {
                        copiedPanels.push({
                            ...rest,
                            _id: new mongoose.Types.ObjectId(),
                            createdBy,
                            category: newCategory,
                            tenantId: franchiseeId,
                            isBasePanel: true,
                            purchasedFromBasePanel: false,
                            purchasedBy: [],
                            originalPanelId: panel._id,
                            assignedPrices: [], // reset assignedPrices
                            // attach mapped test ids if any
                            testsId: mappedTestIds,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });
                    }
                }

                if (copiedPanels.length > 0) {
                    await addPannel.insertMany(copiedPanels, { session });
                    assignedCounts.panels = copiedPanels.length;

                    // Make the fresh panels resolvable for the packages copied later
                    for (const copiedPanel of copiedPanels) {
                        const copiedOriginalId = toIdString(copiedPanel.originalPanelId);
                        if (copiedOriginalId && !panelIdByOriginalId.has(copiedOriginalId)) {
                            panelIdByOriginalId.set(copiedOriginalId, copiedPanel._id);
                        }

                        const copiedName = String(copiedPanel.name);
                        if (!panelIdByName.has(copiedName)) {
                            panelIdByName.set(copiedName, copiedPanel._id);
                        }
                    }

                    // ONE bulk update instead of N per-panel updates
                    const sourcePanelIds = [...new Set(newPanels.map(p => String(p._id)))];
                    if (sourcePanelIds.length > 0) {
                        const purchaseDate = new Date();
                        await addPannel.updateMany(
                            { _id: { $in: sourcePanelIds } },
                            {
                                $push: {
                                    purchasedBy: {
                                        tenantId: franchiseeId,
                                        purchasePrice: 2,
                                        purchaseDate
                                    }
                                }
                            },
                            { session }
                        );
                    }
                }
            }
        }

        // === STEP 3: PACKAGES (IMPROVED DUPLICATE DETECTION & ID MAPPING) ===
        if (packageIds && packageIds.length > 0) {
            const allCandidatePackages = await Package.find({
                _id: { $in: packageIds },
            }).session(session).lean();

            const candidatePackages = allCandidatePackages.filter(p => {
                if (p.createdByRole === 'admin' || p.createdByRole === 'superAdmin' || p.isBasePackage === true) {
                    return true; // सबको allow
                }
                else {
                    return p.isBasePackage === false
                }
            })

            const newPackages = candidatePackages.filter(pkg =>
                !packageIdByOriginalId.has(String(pkg._id)) &&
                !packageIdByName.has(String(pkg.packageName))
            );

            if (newPackages.length > 0) {

                const copiedPackages = [];

                for (const pkg of newPackages) {
                    const { _id, ...rest } = pkg;

                    // Map testIds to tenant test ids (in-memory lookups)
                    const mappedTestIds = [];
                    const srcTestIds = Array.isArray(pkg.testIds) ? pkg.testIds : [];
                    const srcTestNames = Array.isArray(pkg.testname) ? pkg.testname : [];

                    for (let i = 0; i < srcTestIds.length; i++) {
                        const srcId = srcTestIds[i];
                        let foundTestId = testIdByOriginalId.get(toIdString(srcId));

                        if (!foundTestId) {
                            const maybeName = srcTestNames[i] || null;
                            if (maybeName) {
                                foundTestId = testIdByName.get(String(maybeName));
                            }
                        }

                        if (foundTestId) mappedTestIds.push(foundTestId);
                    }

                    // Map pannelIds to tenant panel ids (in-memory lookups)
                    const mappedPanelIds = [];
                    const srcPanelIds = Array.isArray(pkg.pannelIds) ? pkg.pannelIds : [];
                    const srcPanelNames = Array.isArray(pkg.pannelname) ? pkg.pannelname : [];

                    for (let i = 0; i < srcPanelIds.length; i++) {
                        const srcId = srcPanelIds[i];
                        let foundPanelId = panelIdByOriginalId.get(toIdString(srcId));

                        if (!foundPanelId) {
                            const maybeName = srcPanelNames[i] || null;
                            if (maybeName) {
                                foundPanelId = panelIdByName.get(String(maybeName));
                            }
                        }

                        if (foundPanelId) mappedPanelIds.push(foundPanelId);
                    }

                    if (pkg.createdByRole === 'superAdmin') {
                        copiedPackages.push({
                            ...rest,
                            _id: new mongoose.Types.ObjectId(),
                            createdBy,
                            tenantId: franchiseeId,
                            isBasePackage: false,
                            purchasedFromBasePackage: true,
                            assignedPrices: [], // reset assignedPrices
                            originalPackageId: pkg._id,
                            testIds: mappedTestIds,
                            pannelIds: mappedPanelIds,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });
                    } else if (pkg.createdByRole === 'admin') {
                        copiedPackages.push({
                            ...rest,
                            _id: new mongoose.Types.ObjectId(),
                            createdBy,
                            tenantId: franchiseeId,
                            isBasePackage: true,
                            purchasedFromBasePackage: false,
                            assignedPrices: [], // reset assignedPrices
                            purchasedBy: [],
                            originalPackageId: pkg._id,
                            testIds: mappedTestIds,
                            pannelIds: mappedPanelIds,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });
                    }
                }

                if (copiedPackages.length > 0) {
                    await Package.insertMany(copiedPackages, { session });
                    assignedCounts.packages = copiedPackages.length;

                    // ONE bulk update instead of N per-package updates
                    const sourcePackageIds = [...new Set(newPackages.map(p => String(p._id)))];
                    if (sourcePackageIds.length > 0) {
                        const purchaseDate = new Date();
                        await Package.updateMany(
                            { _id: { $in: sourcePackageIds } },
                            {
                                $push: {
                                    purchasedBy: {
                                        tenantId: franchiseeId,
                                        purchasePrice: 3,
                                        purchaseDate
                                    }
                                }
                            },
                            { session }
                        );
                    }
                }
            }
        }

        await session.commitTransaction();
        session.endSession();

        const totalAssigned = Object.values(assignedCounts).reduce((sum, count) => sum + count, 0);

        res.status(200).json({
            success: true,
            message: `Successfully assigned ${totalAssigned} models without duplicates.`,
            assignedCounts: assignedCounts,
            details: {
                skippedDuplicates: {
                    tests: (testIds?.length || 0) - assignedCounts.tests,
                    panels: (panelIds?.length || 0) - assignedCounts.panels,
                    packages: (packageIds?.length || 0) - assignedCounts.packages,
                    categories: (categoryIds?.length || 0) - assignedCounts.categories,
                    units: (unitIds?.length || 0) - assignedCounts.units,
                    sampleTypes: (sampleTypeIds?.length || 0) - assignedCounts.sampleTypes
                }
            }
        });

    } catch (err) {
        if (session) {
            try {
                await session.abortTransaction();
            } catch (e) {
                // ignore abort errors
            }
            try {
                session.endSession();
            } catch (e) { }
        }
        console.error("Assignment Error:", err);
        res.status(500).json({
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
        const { adminId } = req.body;

        // Fetch assigned tests, panels, packages for this admin.
        // FIXED (performance): the preview only needs id + name + price + createdByRole, so
        // fetch just those fields instead of every full document (which could build a
        // multi-MB response for a large admin and time out at the gateway with a 504).
        const assignedTests = await testSchema.find({ tenantId: adminId })
            .select("_id Name Price createdByRole")
            .lean();
        const assignedPanels = await addPannel.find({ tenantId: adminId })
            .select("_id name price createdByRole")
            .lean();
        const assignedPackages = await Package.find({ tenantId: adminId })
            .select("_id packageName packageFee createdByRole")
            .lean();

        res.json({
            success: true,
            data: {
                tests: assignedTests,
                panels: assignedPanels,
                packages: assignedPackages
            }
        });

    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

const getAllAddOns = asyncHandler(async (req, res) => {
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }
    try {
        const units = await unitdb.find({ createdBy: userId }).select("_id");
        const sampleTypes = await sampleSchema.find({ createdBy: userId }).select("_id");
        const categories = await categorydb.find({ createdBy: userId }).select("_id");
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
