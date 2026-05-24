import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { Formula } from "../models/formula.model.js";
import { testSchema } from "../models/newTest.model.js";
import {
  evaluateFormulaExpression,
  validateFormulaExpression,
} from "../utils/formulaEngine.js";

function resolveTenantId(user) {
  if (!user) return null;
  if (user.role === "staff" && user.parentUser) {
    return user.tenantId?._id || user.tenantId || null;
  }
  if (user.tenantId?._id) return user.tenantId._id;
  return user.tenantId || user._id || null;
}

function resolveActorId(user) {
  if (!user) return null;
  return user._id || null;
}

function createMasterParameterKey() {
  return `param_${new mongoose.Types.ObjectId().toString()}`;
}

function buildParameterLabel(testName, parameterName) {
  const safeTestName = String(testName || "Test").trim();
  const safeParameterName = String(parameterName || safeTestName || "Parameter").trim();

  if (!safeTestName) return safeParameterName;
  if (safeTestName.toLowerCase() === safeParameterName.toLowerCase()) {
    return safeParameterName;
  }

  return `${safeParameterName} (${safeTestName})`;
}

async function getTenantTests(tenantId) {
  const tests = await testSchema
    .find({ tenantId })
    .select("_id Name Short_name parameters")
    .exec();

  for (const test of tests) {
    let hasChanges = false;

    for (const parameter of Array.isArray(test.parameters) ? test.parameters : []) {
      const existingMasterKey = String(parameter?.masterParameterKey || "").trim();
      if (existingMasterKey) continue;

      parameter.masterParameterKey = createMasterParameterKey();
      hasChanges = true;
    }

    if (hasChanges) {
      test.markModified("parameters");
      await test.save();
    }
  }

  return tests.map((test) => test.toObject());
}

function buildParameterCatalog(tests) {
  const parameterMap = new Map();

  for (const test of tests) {
    for (const parameter of Array.isArray(test.parameters) ? test.parameters : []) {
      if (!parameter?._id) continue;
      const valueType = String(
        parameter.ValueType || (parameter.text ? "text" : "numeric") || "numeric"
      ).toLowerCase();

      parameterMap.set(String(parameter._id), {
        testId: String(test._id),
        testName: test.Name || "",
        parameterId: String(parameter._id),
        masterParameterKey: String(parameter.masterParameterKey || "").trim(),
        parameterName: parameter.Para_name || test.Name || "",
        label: buildParameterLabel(test.Name, parameter.Para_name || test.Name || "Parameter"),
        valueType,
        unit: parameter.unit || "",
      });
    }
  }

  return parameterMap;
}

function buildParameterCatalogByMasterKey(parameterCatalog) {
  const parameterMap = new Map();

  for (const entry of parameterCatalog.values()) {
    const masterKey = String(entry.masterParameterKey || "").trim();
    if (!masterKey || parameterMap.has(masterKey)) continue;
    parameterMap.set(masterKey, entry);
  }

  return parameterMap;
}

function resolveCatalogEntry({
  parameterCatalog,
  parameterCatalogByMasterKey,
  parameterId,
  parameterMasterKey,
}) {
  const masterKey = String(parameterMasterKey || "").trim();
  if (masterKey && parameterCatalogByMasterKey.has(masterKey)) {
    return parameterCatalogByMasterKey.get(masterKey);
  }

  const id = String(parameterId || "").trim();
  if (id && parameterCatalog.has(id)) {
    return parameterCatalog.get(id);
  }

  return null;
}

function replaceExpressionKeys(expression, parameterCatalog) {
  return String(expression || "").replace(/\{\{([^{}]+)\}\}/g, (match, rawKey) => {
    const lookupKey = String(rawKey || "").trim();
    const catalogEntry = parameterCatalog.get(lookupKey);

    if (!catalogEntry?.masterParameterKey) {
      return match;
    }

    return `{{${catalogEntry.masterParameterKey}}}`;
  });
}

async function hydrateFormulaMasterKeys(formulas, parameterCatalog, parameterCatalogByMasterKey) {
  const normalizedFormulas = [];

  for (const formula of formulas) {
    const targetEntry = resolveCatalogEntry({
      parameterCatalog,
      parameterCatalogByMasterKey,
      parameterId: formula.targetParameterId,
      parameterMasterKey: formula.targetMasterKey,
    });

    if (!targetEntry) {
      normalizedFormulas.push(formula);
      continue;
    }

    let hasChanges = false;
    const normalizedDependencies = (formula.dependencies || []).map((dependency) => {
      const dependencyEntry = resolveCatalogEntry({
        parameterCatalog,
        parameterCatalogByMasterKey,
        parameterId: dependency.parameterId,
        parameterMasterKey: dependency.parameterMasterKey,
      });

      if (!dependencyEntry) {
        return dependency;
      }

      const nextDependency = {
        testId: dependencyEntry.testId,
        parameterId: dependencyEntry.parameterId,
        parameterMasterKey: dependencyEntry.masterParameterKey,
        label: dependency.label || dependencyEntry.label,
      };

      if (
        String(dependency.parameterId || "") !== String(nextDependency.parameterId) ||
        String(dependency.parameterMasterKey || "") !== String(nextDependency.parameterMasterKey) ||
        String(dependency.testId || "") !== String(nextDependency.testId) ||
        String(dependency.label || "") !== String(nextDependency.label || "")
      ) {
        hasChanges = true;
      }

      return nextDependency;
    });

    const normalizedExpression = replaceExpressionKeys(formula.expression, parameterCatalog);
    if (normalizedExpression !== String(formula.expression || "")) {
      hasChanges = true;
    }

    const normalizedFormula = {
      ...formula,
      targetTestId: formula.targetTestId || targetEntry.testId,
      targetParameterId: formula.targetParameterId || targetEntry.parameterId,
      targetMasterKey: formula.targetMasterKey || targetEntry.masterParameterKey,
      targetLabel: formula.targetLabel || targetEntry.label,
      expression: normalizedExpression,
      dependencies: normalizedDependencies,
    };

    if (
      String(formula.targetTestId || "") !== String(normalizedFormula.targetTestId) ||
      String(formula.targetParameterId || "") !== String(normalizedFormula.targetParameterId) ||
      String(formula.targetMasterKey || "") !== String(normalizedFormula.targetMasterKey) ||
      String(formula.targetLabel || "") !== String(normalizedFormula.targetLabel || "")
    ) {
      hasChanges = true;
    }

    if (hasChanges && formula._id) {
      await Formula.updateOne(
        { _id: formula._id },
        {
          $set: {
            targetTestId: normalizedFormula.targetTestId,
            targetParameterId: normalizedFormula.targetParameterId,
            targetMasterKey: normalizedFormula.targetMasterKey,
            targetLabel: normalizedFormula.targetLabel,
            expression: normalizedFormula.expression,
            dependencies: normalizedFormula.dependencies,
          },
        }
      );
    }

    normalizedFormulas.push(normalizedFormula);
  }

  return normalizedFormulas;
}

function normalizeDependencyEntries(parameterMasterKeys, parameterCatalogByMasterKey) {
  return parameterMasterKeys.map((parameterMasterKey) => {
    const catalogEntry = parameterCatalogByMasterKey.get(String(parameterMasterKey));
    if (!catalogEntry) {
      throw new ApiError(400, "Formula contains a parameter that does not belong to this tenant.");
    }

    return {
      testId: catalogEntry.testId,
      parameterId: catalogEntry.parameterId,
      parameterMasterKey: catalogEntry.masterParameterKey,
      label: catalogEntry.label,
    };
  });
}

function ensureTargetExists(targetMasterKey, parameterCatalogByMasterKey) {
  const targetEntry = parameterCatalogByMasterKey.get(String(targetMasterKey));
  if (!targetEntry) {
    throw new ApiError(400, "Selected target field was not found for this tenant.");
  }
  return targetEntry;
}

function assertNoSelfDependency(targetMasterKey, dependencyMasterKeys) {
  if (dependencyMasterKeys.includes(String(targetMasterKey))) {
    throw new ApiError(400, "A formula cannot depend on its own target field.");
  }
}

function assertNoDependencyMismatch(dependencyMasterKeys, requestDependencyMasterKeys) {
  const actual = [...new Set(dependencyMasterKeys)].sort();
  const requested = [...new Set(requestDependencyMasterKeys || [])].sort();
  if (actual.length !== requested.length) {
    throw new ApiError(400, "Dependency selection does not match the formula expression.");
  }

  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== requested[index]) {
      throw new ApiError(400, "Dependency selection does not match the formula expression.");
    }
  }
}

function buildFormulaGraph(formulas, candidateFormula = null) {
  const graph = new Map();

  for (const formula of formulas) {
    graph.set(
      String(formula.targetMasterKey || formula.targetParameterId),
      (formula.dependencies || []).map((dependency) =>
        String(dependency.parameterMasterKey || dependency.parameterId)
      )
    );
  }

  if (candidateFormula) {
    graph.set(
      String(candidateFormula.targetMasterKey || candidateFormula.targetParameterId),
      (candidateFormula.dependencies || []).map((dependency) =>
        String(dependency.parameterMasterKey || dependency.parameterId)
      )
    );
  }

  return graph;
}

function assertNoCircularDependency(formulas, candidateFormula) {
  const targetId = String(candidateFormula.targetMasterKey || candidateFormula.targetParameterId);
  const graph = buildFormulaGraph(formulas, candidateFormula);
  const visiting = new Set();
  const visited = new Set();

  function walk(nodeId) {
    if (visiting.has(nodeId)) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }

    visiting.add(nodeId);
    const nextNodes = graph.get(nodeId) || [];
    for (const nextNodeId of nextNodes) {
      if (!graph.has(nextNodeId)) continue;
      if (walk(nextNodeId)) {
        return true;
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  if (walk(targetId)) {
    throw new ApiError(400, "This formula creates a circular dependency.");
  }
}

function toFormulaResponse(formula) {
  return {
    _id: formula._id,
    tenantId: formula.tenantId,
    targetTestId: formula.targetTestId,
    targetParameterId: formula.targetParameterId,
    targetMasterKey: formula.targetMasterKey,
    targetLabel: formula.targetLabel,
    expression: formula.expression,
    displayExpression: formula.displayExpression,
    dependencies: formula.dependencies || [],
    precision: formula.precision,
    notes: formula.notes || "",
    isActive: formula.isActive,
    allowManualOverride: formula.allowManualOverride,
    validationStatus: formula.validationStatus,
    lastValidatedAt: formula.lastValidatedAt,
    createdBy: formula.createdBy,
    updatedBy: formula.updatedBy,
    createdAt: formula.createdAt,
    updatedAt: formula.updatedAt,
  };
}

const listFormulas = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req.user);
  if (!tenantId) {
    throw new ApiError(400, "Tenant information is required.");
  }

  const formulas = await Formula.find({ tenantId }).sort({ updatedAt: -1 }).lean();
  const tests = await getTenantTests(tenantId);
  const parameterCatalog = buildParameterCatalog(tests);
  const parameterCatalogByMasterKey = buildParameterCatalogByMasterKey(parameterCatalog);
  const hydratedFormulas = await hydrateFormulaMasterKeys(
    formulas,
    parameterCatalog,
    parameterCatalogByMasterKey
  );

  return res.status(200).json({
    status: "success",
    data: hydratedFormulas.map(toFormulaResponse),
  });
});

const listActiveFormulas = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req.user);
  if (!tenantId) {
    throw new ApiError(400, "Tenant information is required.");
  }

  const formulas = await Formula.find({ tenantId, isActive: true }).sort({ updatedAt: -1 }).lean();
  const tests = await getTenantTests(tenantId);
  const parameterCatalog = buildParameterCatalog(tests);
  const parameterCatalogByMasterKey = buildParameterCatalogByMasterKey(parameterCatalog);
  const hydratedFormulas = await hydrateFormulaMasterKeys(
    formulas,
    parameterCatalog,
    parameterCatalogByMasterKey
  );

  return res.status(200).json({
    status: "success",
    data: hydratedFormulas.map(toFormulaResponse),
  });
});

const previewFormula = asyncHandler(async (req, res) => {
  const { expression = "", sampleValues = {} } = req.body || {};

  validateFormulaExpression(expression);
  const preview = evaluateFormulaExpression(expression, sampleValues);

  return res.status(200).json({
    status: "success",
    data: preview,
  });
});

const saveFormula = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req.user);
  const actorId = resolveActorId(req.user);
  const {
    targetTestId,
    targetParameterId,
    targetMasterKey,
    expression = "",
    displayExpression = "",
    dependencyMasterKeys = [],
    precision = 2,
    notes = "",
    isActive = true,
    allowManualOverride = false,
  } = req.body || {};

  if (!tenantId) {
    throw new ApiError(400, "Tenant information is required.");
  }

  if (!targetTestId || !targetMasterKey) {
    throw new ApiError(400, "Target test and target field are required.");
  }

  const tests = await getTenantTests(tenantId);
  const parameterCatalog = buildParameterCatalog(tests);
  const parameterCatalogByMasterKey = buildParameterCatalogByMasterKey(parameterCatalog);
  const targetEntry = ensureTargetExists(targetMasterKey, parameterCatalogByMasterKey);
  if (String(targetEntry.testId) !== String(targetTestId)) {
    throw new ApiError(400, "Selected target field selected target test से match नहीं करता.");
  }
  const validation = validateFormulaExpression(expression);
  const dependencyKeys = validation.usedIds.map(String);

  assertNoDependencyMismatch(dependencyKeys, dependencyMasterKeys);
  assertNoSelfDependency(targetMasterKey, dependencyKeys);

  const dependencies = normalizeDependencyEntries(dependencyKeys, parameterCatalogByMasterKey);
  const existingFormulas = await Formula.find({ tenantId }).lean();
  const hydratedExistingFormulas = await hydrateFormulaMasterKeys(
    existingFormulas,
    parameterCatalog,
    parameterCatalogByMasterKey
  );

  assertNoCircularDependency(hydratedExistingFormulas, {
    targetMasterKey,
    dependencies,
  });

  const payload = {
    tenantId,
    targetTestId,
    targetParameterId: targetEntry.parameterId,
    targetMasterKey,
    targetLabel: targetEntry.label,
    expression: expression.trim(),
    displayExpression: displayExpression.trim() || expression.trim(),
    dependencies,
    precision: Number.isFinite(Number(precision)) ? Number(precision) : 2,
    notes: String(notes || "").trim(),
    isActive: Boolean(isActive),
    allowManualOverride: Boolean(allowManualOverride),
    validationStatus: "valid",
    lastValidatedAt: new Date(),
    updatedBy: actorId,
  };

  const savedFormula = await Formula.findOneAndUpdate(
    {
      tenantId,
      targetMasterKey,
    },
    {
      $set: payload,
      $setOnInsert: {
        createdBy: actorId,
      },
    },
    {
      new: true,
      upsert: true,
    }
  );

  return res.status(201).json({
    status: "success",
    message: "Formula saved successfully.",
    data: toFormulaResponse(savedFormula.toObject()),
  });
});

const updateFormula = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req.user);
  const actorId = resolveActorId(req.user);
  const { id } = req.params;
  const {
    targetTestId,
    targetParameterId,
    targetMasterKey,
    expression = "",
    displayExpression = "",
    dependencyMasterKeys = [],
    precision = 2,
    notes = "",
    isActive = true,
    allowManualOverride = false,
  } = req.body || {};

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "A valid formula id is required.");
  }

  const currentFormula = await Formula.findOne({ _id: id, tenantId }).lean();
  if (!currentFormula) {
    throw new ApiError(404, "Formula not found.");
  }

  const tests = await getTenantTests(tenantId);
  const parameterCatalog = buildParameterCatalog(tests);
  const parameterCatalogByMasterKey = buildParameterCatalogByMasterKey(parameterCatalog);
  const [hydratedCurrentFormula] = await hydrateFormulaMasterKeys(
    [currentFormula],
    parameterCatalog,
    parameterCatalogByMasterKey
  );
  const formulaToEdit = hydratedCurrentFormula || currentFormula;
  const resolvedTargetTestId = targetTestId || formulaToEdit.targetTestId;
  const resolvedTargetMasterKey = targetMasterKey || formulaToEdit.targetMasterKey;
  const targetEntry = ensureTargetExists(resolvedTargetMasterKey, parameterCatalogByMasterKey);
  if (String(targetEntry.testId) !== String(resolvedTargetTestId)) {
    throw new ApiError(400, "Selected target field selected target test से match नहीं करता.");
  }
  const validation = validateFormulaExpression(expression);
  const dependencyKeys = validation.usedIds.map(String);

  assertNoDependencyMismatch(dependencyKeys, dependencyMasterKeys);
  assertNoSelfDependency(resolvedTargetMasterKey, dependencyKeys);

  const dependencies = normalizeDependencyEntries(dependencyKeys, parameterCatalogByMasterKey);
  const siblingFormulas = await Formula.find({
    tenantId,
    _id: { $ne: id },
  }).lean();
  const hydratedSiblingFormulas = await hydrateFormulaMasterKeys(
    siblingFormulas,
    parameterCatalog,
    parameterCatalogByMasterKey
  );

  assertNoCircularDependency(hydratedSiblingFormulas, {
    targetMasterKey: resolvedTargetMasterKey,
    dependencies,
  });

  const updatedFormula = await Formula.findOneAndUpdate(
    { _id: id, tenantId },
    {
      $set: {
        targetTestId: resolvedTargetTestId,
        targetParameterId: targetEntry.parameterId,
        targetMasterKey: resolvedTargetMasterKey,
        targetLabel: targetEntry.label,
        expression: expression.trim(),
        displayExpression: displayExpression.trim() || expression.trim(),
        dependencies,
        precision: Number.isFinite(Number(precision)) ? Number(precision) : 2,
        notes: String(notes || "").trim(),
        isActive: Boolean(isActive),
        allowManualOverride: Boolean(allowManualOverride),
        validationStatus: "valid",
        lastValidatedAt: new Date(),
        updatedBy: actorId,
      },
    },
    { new: true }
  );

  return res.status(200).json({
    status: "success",
    message: "Formula updated successfully.",
    data: toFormulaResponse(updatedFormula.toObject()),
  });
});

const deleteFormula = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req.user);
  const { id } = req.params;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "A valid formula id is required.");
  }

  const deletedFormula = await Formula.findOneAndDelete({ _id: id, tenantId });
  if (!deletedFormula) {
    throw new ApiError(404, "Formula not found.");
  }

  return res.status(200).json({
    status: "success",
    message: "Formula deleted successfully.",
    data: toFormulaResponse(deletedFormula.toObject()),
  });
});

const getFormulaCatalog = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req.user);
  if (!tenantId) {
    throw new ApiError(400, "Tenant information is required.");
  }

  const tests = await getTenantTests(tenantId);
  const data = tests.map((test) => ({
    _id: test._id,
    name: test.Name || "",
    shortName: test.Short_name || "",
    parameters: (test.parameters || []).map((parameter) => ({
      _id: parameter._id,
      name: parameter.Para_name || test.Name || "",
      unit: parameter.unit || "",
      masterParameterKey: String(parameter.masterParameterKey || "").trim(),
      valueType: String(
        parameter.ValueType || (parameter.text ? "text" : "numeric") || "numeric"
      ).toLowerCase(),
    })),
  }));

  return res.status(200).json({
    status: "success",
    data,
  });
});

export {
  deleteFormula,
  getFormulaCatalog,
  listActiveFormulas,
  listFormulas,
  previewFormula,
  saveFormula,
  updateFormula,
};
