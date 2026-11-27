import mongoose from "mongoose";
import { categorydb } from "../models/category.model.js";

const OBJECT_ID_HEX_RE = /^[a-f0-9]{24}$/i;

const toCleanString = (value) => (value == null ? "" : String(value).trim());

const isValidObjectIdLike = (value) => {
  if (!value) return false;
  if (value instanceof mongoose.Types.ObjectId) return true;
  return typeof value === "string" && OBJECT_ID_HEX_RE.test(value.trim());
};

/**
 * Extracts a human-readable category name from any stored category shape
 * (plain string, categorydb doc, partial object, nested object, or single-item array).
 * Returns "" for raw ObjectIds so IDs are resolved against `categorydb` rather than shown as hex.
 */
export function extractCategoryName(rawCategory, depth = 0) {
  if (!rawCategory || depth > 3) return "";

  if (Array.isArray(rawCategory)) {
    return rawCategory.length > 0 ? extractCategoryName(rawCategory[0], depth + 1) : "";
  }

  if (typeof rawCategory === "string") {
    const trimmed = rawCategory.trim();
    return OBJECT_ID_HEX_RE.test(trimmed) ? "" : trimmed;
  }

  if (rawCategory instanceof mongoose.Types.ObjectId) {
    return "";
  }

  if (typeof rawCategory === "object") {
    const candidates = [
      rawCategory.category,
      rawCategory.name,
      rawCategory.Name,
      rawCategory.categoryName,
      rawCategory.label,
      rawCategory.title,
    ];
    for (const candidate of candidates) {
      if (candidate == null) continue;
      const extracted = typeof candidate === "object"
        ? extractCategoryName(candidate, depth + 1)
        : toCleanString(candidate);
      if (extracted && !OBJECT_ID_HEX_RE.test(extracted)) {
        return extracted;
      }
    }
  }

  return "";
}

/**
 * Extracts an ObjectId string from any category reference shape if present.
 */
export function extractCategoryId(rawCategory, depth = 0) {
  if (!rawCategory || depth > 3) return "";

  if (Array.isArray(rawCategory)) {
    return rawCategory.length > 0 ? extractCategoryId(rawCategory[0], depth + 1) : "";
  }

  if (isValidObjectIdLike(rawCategory)) {
    return String(rawCategory).trim();
  }

  if (typeof rawCategory === "object") {
    const idCandidate = rawCategory._id || rawCategory.id || rawCategory.originalCategoryId;
    if (isValidObjectIdLike(idCandidate)) {
      return String(idCandidate).trim();
    }
    if (rawCategory.category && typeof rawCategory.category === "object") {
      return extractCategoryId(rawCategory.category, depth + 1);
    }
  }

  return "";
}

function buildCategoryLookupIndexes(categoryDocs = []) {
  const byId = new Map();
  const byOriginalId = new Map();
  const byLowerName = new Map();

  for (const doc of Array.isArray(categoryDocs) ? categoryDocs : []) {
    if (!doc || typeof doc !== "object") continue;
    const idStr = doc._id ? String(doc._id) : "";
    const origStr = doc.originalCategoryId ? String(doc.originalCategoryId) : "";
    const nameStr = toCleanString(doc.category);

    if (idStr && !byId.has(idStr)) byId.set(idStr, doc);
    if (origStr && !byOriginalId.has(origStr)) byOriginalId.set(origStr, doc);
    if (nameStr && !byLowerName.has(nameStr.toLowerCase())) {
      byLowerName.set(nameStr.toLowerCase(), doc);
    }
  }

  return { byId, byOriginalId, byLowerName };
}

function formatCategorySnapshot(doc) {
  return {
    ...(doc._id ? { _id: doc._id } : {}),
    orderId: Number.isFinite(Number(doc.orderId)) ? Number(doc.orderId) : 9999,
    category: toCleanString(doc.category) || "General",
    ...(doc.tenantId !== undefined ? { tenantId: doc.tenantId } : {}),
    ...(doc.originalCategoryId !== undefined ? { originalCategoryId: doc.originalCategoryId } : {}),
  };
}

/**
 * Pure resolver: matches `categoryInput` against a list of `categorydb` documents
 * and always returns a consistent `{ category, orderId, ... }` snapshot object.
 */
export function resolveCategorySnapshot({
  categoryInput,
  categoryDocs = [],
  indexes = null,
  fallbackName = "General",
} = {}) {
  const idx = indexes || buildCategoryLookupIndexes(categoryDocs);
  const rawId = extractCategoryId(categoryInput);
  const rawName = extractCategoryName(categoryInput);

  let matched = null;
  if (rawId) {
    matched = idx.byId.get(rawId) || idx.byOriginalId.get(rawId) || null;
  }
  if (!matched && rawName) {
    matched = idx.byLowerName.get(rawName.toLowerCase()) || null;
  }

  if (matched) {
    return formatCategorySnapshot(matched);
  }

  if (rawName) {
    const existingOrder = Number(
      Array.isArray(categoryInput) ? categoryInput[0]?.orderId : categoryInput?.orderId
    );
    return {
      ...(rawId ? { _id: rawId } : {}),
      orderId: Number.isFinite(existingOrder) && existingOrder > 0 ? existingOrder : 9999,
      category: rawName,
    };
  }

  if (fallbackName === null) {
    return null;
  }

  return {
    orderId: 9999,
    category: fallbackName || "General",
  };
}

/**
 * Resolves a request's `category` field (string, ID, or object) against `categorydb`
 * for test/panel creation and editing so saved documents preserve `_id` and `orderId`.
 */
export async function resolveCategoryForScope({
  categoryInput,
  tenantId = null,
  createdBy = null,
} = {}) {
  if (!categoryInput) return "";

  const rawId = extractCategoryId(categoryInput);
  const rawName = extractCategoryName(categoryInput);

  if (!rawId && !rawName) {
    return categoryInput;
  }

  const scopeFilter = tenantId
    ? { tenantId }
    : (createdBy ? { createdBy, tenantId: null } : {});

  const scopeCategories = await categorydb
    .find(scopeFilter)
    .select("_id orderId category tenantId originalCategoryId")
    .lean();

  let fallbackDoc = null;
  if (rawId && !scopeCategories.some((c) => String(c._id) === rawId || String(c.originalCategoryId || "") === rawId)) {
    fallbackDoc = await categorydb
      .findById(rawId)
      .select("_id orderId category tenantId originalCategoryId")
      .lean();
  }

  const allDocs = fallbackDoc ? [...scopeCategories, fallbackDoc] : scopeCategories;
  const resolved = resolveCategorySnapshot({
    categoryInput,
    categoryDocs: allDocs,
    fallbackName: null,
  });

  return resolved || categoryInput;
}

/**
 * Hydrates `category` on `singleTests`, `panels`, and populated `panel.testsId`
 * items returned by `getTestNameController` (`/getbarcodeTests`) using live `categorydb` docs.
 * Note: `.populate("category")` is a no-op on Mixed schemas in Mongoose 8, so explicit hydration is required.
 */
export async function hydrateCategoriesOnBarcodeResult({
  tenantId = null,
  singleTests = [],
  panels = [],
} = {}) {
  const toPlain = (doc) => (doc && typeof doc.toObject === "function" ? doc.toObject() : doc);

  const plainTests = (singleTests || []).map(toPlain).filter(Boolean);
  const plainPanels = (panels || []).map((panel) => {
    const obj = toPlain(panel);
    if (!obj) return null;
    if (Array.isArray(obj.testsId)) {
      obj.testsId = obj.testsId.map(toPlain).filter(Boolean);
    }
    return obj;
  }).filter(Boolean);

  const referencedIds = new Set();
  const collectId = (rawCat) => {
    const id = extractCategoryId(rawCat);
    if (id) referencedIds.add(id);
  };

  plainTests.forEach((t) => collectId(t.category));
  plainPanels.forEach((p) => {
    collectId(p.category);
    (p.testsId || []).forEach((child) => collectId(child?.category));
  });

  const queryOr = [];
  if (tenantId) queryOr.push({ tenantId });
  if (referencedIds.size > 0) {
    const objectIds = Array.from(referencedIds).map((id) => new mongoose.Types.ObjectId(id));
    queryOr.push({ _id: { $in: objectIds } });
    queryOr.push({ originalCategoryId: { $in: objectIds } });
  }

  const categoryDocs = queryOr.length > 0
    ? await categorydb
        .find(queryOr.length === 1 ? queryOr[0] : { $or: queryOr })
        .select("_id orderId category tenantId originalCategoryId")
        .lean()
    : [];

  // Prefer tenant's own category docs over global/base fallbacks when both exist in index
  const sortedDocs = categoryDocs.sort((a, b) => {
    const aMatchesTenant = tenantId && String(a.tenantId || "") === String(tenantId) ? 0 : 1;
    const bMatchesTenant = tenantId && String(b.tenantId || "") === String(tenantId) ? 0 : 1;
    return aMatchesTenant - bMatchesTenant;
  });

  const indexes = buildCategoryLookupIndexes(sortedDocs);

  plainTests.forEach((test) => {
    test.category = resolveCategorySnapshot({
      categoryInput: test.category,
      indexes,
      fallbackName: "General",
    });
  });

  plainPanels.forEach((panel) => {
    if (Array.isArray(panel.testsId)) {
      panel.testsId.forEach((childTest) => {
        if (!childTest || typeof childTest !== "object") return;
        childTest.category = resolveCategorySnapshot({
          categoryInput: childTest.category,
          indexes,
          fallbackName: "General",
        });
      });
    }

    const panelCatResolved = resolveCategorySnapshot({
      categoryInput: panel.category,
      indexes,
      fallbackName: null,
    });

    if (panelCatResolved) {
      panel.category = panelCatResolved;
    } else {
      const childWithCategory = (panel.testsId || []).find(
        (child) => extractCategoryName(child?.category) && extractCategoryName(child?.category) !== "General"
      );
      panel.category = childWithCategory
        ? { ...childWithCategory.category }
        : { orderId: 9999, category: "General" };
    }
  });

  return { singleTests: plainTests, panels: plainPanels };
}
