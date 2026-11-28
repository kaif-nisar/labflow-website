import mongoose from "mongoose";

const IGNORED_SAMPLE_TOKENS = new Set(["n/a", "na", "none", "null", "undefined", "-"]);
const GENERIC_SAMPLE_WORDS = new Set(["blood", "sample", "samples", "specimen", "tube", "vial", "container"]);

/**
 * Safely extract a trimmed ID string from an ObjectId, string, or populated subdocument.
 */
export const toIdStr = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (value instanceof mongoose.Types.ObjectId || typeof value.toHexString === "function") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    const nested = value._id ?? value.id ?? value.itemId;
    if (nested !== undefined && nested !== null && nested !== value) {
      return toIdStr(nested);
    }
    return "";
  }
  return String(value).trim();
};

/**
 * Deduplicate string arrays while preserving insertion order and ignoring empty values.
 */
export const dedupeOrderedStrings = (values = [], { ignorePlaceholderNA = false } = {}) => {
  const seen = new Set();
  const result = [];

  for (const raw of Array.isArray(values) ? values : [values]) {
    if (raw === null || raw === undefined) continue;
    const str = String(raw).trim();
    if (!str) continue;
    const lower = str.toLowerCase();
    if (ignorePlaceholderNA && IGNORED_SAMPLE_TOKENS.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(str);
  }

  return result;
};

/**
 * Normalize booking item / collection aliases into canonical item types:
 * "test" | "panel" | "package" | null.
 */
export const normalizeBookingItemType = (value) => {
  if (!value) return null;
  const norm = String(value).trim().toLowerCase();
  if (norm === "test" || norm === "tests" || norm === "testschema") return "test";
  if (norm === "panel" || norm === "panels" || norm === "pannel" || norm === "addpannel") return "panel";
  if (norm === "package" || norm === "packages") return "package";
  return null;
};

/**
 * Map an itemType or collection alias to its canonical schema collectionName.
 */
export const canonicalCollectionName = (value) => {
  const itemType = normalizeBookingItemType(value);
  if (itemType === "test") return "testSchema";
  if (itemType === "panel") return "addPannel";
  if (itemType === "package") return "Package";
  return "";
};

const normalizeSampleText = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\bfl(?:ou|uo)ride\b/g, "fluoride")
    .replace(/\s+/g, " ");
};

const extractSampleTokens = (value) => {
  return normalizeSampleText(value)
    .split(/[,/|;+\-()\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !GENERIC_SAMPLE_WORDS.has(t));
};

/**
 * Match candidate sample types against a booking row's target sample type.
 * Supports single-sample bookings, empty fallback candidates, substring match,
 * compound sample delimiters (e.g. "Serum / Fluoride"), and common spelling variants.
 */
export const matchesBookingSampleType = (
  sampleTypeCandidates = [],
  targetSample = "",
  isSingleSample = false
) => {
  if (isSingleSample) return true;

  const normalizedTarget = normalizeSampleText(targetSample);
  if (!normalizedTarget || IGNORED_SAMPLE_TOKENS.has(normalizedTarget)) {
    return true;
  }

  const candidateList = Array.isArray(sampleTypeCandidates)
    ? sampleTypeCandidates
    : [sampleTypeCandidates];

  const normalizedCandidates = candidateList
    .map(normalizeSampleText)
    .filter((s) => Boolean(s) && !IGNORED_SAMPLE_TOKENS.has(s));

  if (normalizedCandidates.length === 0) return true;

  const targetTokens = extractSampleTokens(normalizedTarget);

  return normalizedCandidates.some((candidate) => {
    if (
      candidate === normalizedTarget ||
      candidate.includes(normalizedTarget) ||
      normalizedTarget.includes(candidate)
    ) {
      return true;
    }

    if (targetTokens.length === 0) return false;
    const candidateTokens = extractSampleTokens(candidate);
    return candidateTokens.some((tok) => targetTokens.includes(tok));
  });
};

/**
 * Extract ordered unique sample types from a test document.
 */
export const extractTestSampleTypes = (testDoc) => {
  if (!testDoc || typeof testDoc !== "object") return [];
  const raw = [
    testDoc.sampleType,
    testDoc.sample_type,
    ...(Array.isArray(testDoc.sampleTypes) ? testDoc.sampleTypes : []),
    ...(Array.isArray(testDoc.sample_types) ? testDoc.sample_types : []),
  ];
  return dedupeOrderedStrings(raw, { ignorePlaceholderNA: true });
};

/**
 * Derive live sample types for a panel from its constituent tests first,
 * falling back to stored panel sample_types when child tests are unresolved or blank.
 */
export const deriveLivePanelSampleTypes = (panelDoc, testsById = new Map()) => {
  if (!panelDoc || typeof panelDoc !== "object") return [];

  const testRefs = Array.isArray(panelDoc.testsId) ? panelDoc.testsId : [];
  const liveSamples = [];
  let hasUnresolvedOrBlankChild = testRefs.length === 0;

  for (const ref of testRefs) {
    const resolvedTest =
      ref && typeof ref === "object" && (ref.Name || ref.Short_name || ref.sampleType || ref.sample_type)
        ? ref
        : testsById.get(toIdStr(ref)) || null;

    if (!resolvedTest) {
      hasUnresolvedOrBlankChild = true;
      continue;
    }

    const childSamples = extractTestSampleTypes(resolvedTest);
    if (childSamples.length === 0) {
      hasUnresolvedOrBlankChild = true;
    } else {
      liveSamples.push(...childSamples);
    }
  }

  const storedSamples = dedupeOrderedStrings(
    [
      ...(Array.isArray(panelDoc.sample_types) ? panelDoc.sample_types : []),
      ...(Array.isArray(panelDoc.sampleTypes) ? panelDoc.sampleTypes : []),
      panelDoc.sampleType,
    ],
    { ignorePlaceholderNA: true }
  );

  // Include stored panel samples whenever some child tests could not yield a sample type
  // so legacy or custom sample declarations are preserved alongside live test sample types.
  if (hasUnresolvedOrBlankChild || liveSamples.length === 0) {
    return dedupeOrderedStrings([...liveSamples, ...storedSamples], { ignorePlaceholderNA: true });
  }

  return dedupeOrderedStrings(liveSamples, { ignorePlaceholderNA: true });
};

/**
 * Derive live sample types for a package from its tests and panels (including panel child tests),
 * falling back to stored package testSample/pannelSample when references are unresolved or blank.
 */
export const deriveLivePackageSampleTypes = (
  pkgDoc,
  testsById = new Map(),
  panelsById = new Map()
) => {
  if (!pkgDoc || typeof pkgDoc !== "object") return [];

  const liveTestSamples = [];
  let hasUnresolvedTest = false;
  const testRefs = Array.isArray(pkgDoc.testIds) ? pkgDoc.testIds : [];

  for (const ref of testRefs) {
    const resolvedTest =
      ref && typeof ref === "object" && (ref.Name || ref.Short_name || ref.sampleType || ref.sample_type)
        ? ref
        : testsById.get(toIdStr(ref)) || null;

    if (!resolvedTest) {
      hasUnresolvedTest = true;
      continue;
    }

    const samples = extractTestSampleTypes(resolvedTest);
    if (samples.length === 0) {
      hasUnresolvedTest = true;
    } else {
      liveTestSamples.push(...samples);
    }
  }

  const storedTestSamples = dedupeOrderedStrings(pkgDoc.testSample || [], {
    ignorePlaceholderNA: true,
  });

  const livePanelSamples = [];
  let hasUnresolvedPanel = false;
  const panelRefs = Array.isArray(pkgDoc.pannelIds) ? pkgDoc.pannelIds : [];

  for (const ref of panelRefs) {
    const resolvedPanel =
      ref && typeof ref === "object" && (ref.name || ref.Short_name || Array.isArray(ref.testsId))
        ? ref
        : panelsById.get(toIdStr(ref)) || null;

    if (!resolvedPanel) {
      hasUnresolvedPanel = true;
      continue;
    }

    const samples = deriveLivePanelSampleTypes(resolvedPanel, testsById);
    if (samples.length === 0) {
      hasUnresolvedPanel = true;
    } else {
      livePanelSamples.push(...samples);
    }
  }

  const storedPanelSamples = dedupeOrderedStrings(pkgDoc.pannelSample || [], {
    ignorePlaceholderNA: true,
  });

  const merged = [
    ...liveTestSamples,
    ...(hasUnresolvedTest || testRefs.length === 0 ? storedTestSamples : []),
    ...livePanelSamples,
    ...(hasUnresolvedPanel || panelRefs.length === 0 ? storedPanelSamples : []),
  ];

  return dedupeOrderedStrings(merged, { ignorePlaceholderNA: true });
};

/**
 * Resolve each test/panel ref inside a package to concrete objects using lookup maps when unpopulated.
 */
const resolveInlinePackageMembers = (
  pkgDoc,
  resolvedTestsById = new Map(),
  resolvedPanelsById = new Map()
) => {
  const seenTestIds = new Set();
  const tests = [];
  for (const ref of pkgDoc?.testIds || []) {
    if (!ref) continue;
    const id = toIdStr(ref);
    const resolved =
      (id && resolvedTestsById.get(id)) ||
      (typeof ref === "object" && (ref._id || ref.Name || ref.Short_name) ? ref : null);
    const resolvedId = toIdStr(resolved);
    if (!resolved || !resolvedId || seenTestIds.has(resolvedId)) continue;
    seenTestIds.add(resolvedId);
    tests.push(resolved);
  }

  const seenPanelIds = new Set();
  const panels = [];
  for (const ref of pkgDoc?.pannelIds || []) {
    if (!ref) continue;
    const id = toIdStr(ref);
    const resolved =
      (id && resolvedPanelsById.get(id)) ||
      (typeof ref === "object" && (ref._id || ref.name || ref.Short_name) ? ref : null);
    const resolvedId = toIdStr(resolved);
    if (!resolved || !resolvedId || seenPanelIds.has(resolvedId)) continue;
    seenPanelIds.add(resolvedId);
    panels.push(resolved);
  }

  return { tests, panels };
};

/**
 * Distribute a package's tests and panels across every booking sample row that references the package.
 * Guarantees 100% of package tests and panels are assigned to at least one row:
 * items matching a row's sampleType go to matching row(s); items whose sampleType does not match
 * any row (e.g., Random Blood Sugar / Fluoride when only Serum & EDTA rows exist) are rescued to row 0.
 */
export const distributePackageContentsAcrossRows = ({
  pkgDoc,
  rowSamples = [],
  resolvedTestsById = new Map(),
  resolvedPanelsById = new Map(),
}) => {
  const { tests, panels } = resolveInlinePackageMembers(
    pkgDoc,
    resolvedTestsById,
    resolvedPanelsById
  );

  const effectiveSamples = Array.isArray(rowSamples) && rowSamples.length > 0 ? rowSamples : [""];
  const isSingleRow = effectiveSamples.length <= 1;
  const allocations = effectiveSamples.map((_, rowIndex) => ({
    rowIndex,
    tests: [],
    panels: [],
  }));

  if (isSingleRow) {
    allocations[0].tests = [...tests];
    allocations[0].panels = [...panels];
    return { allocations, tests, panels };
  }

  const rawTestSample = Array.isArray(pkgDoc?.testSample) ? pkgDoc.testSample : [];
  const canUsePositionalTestSample = rawTestSample.length === (pkgDoc?.testIds || []).length;

  tests.forEach((test, idx) => {
    let candidates = extractTestSampleTypes(test);
    if (candidates.length === 0 && canUsePositionalTestSample && rawTestSample[idx]) {
      candidates = dedupeOrderedStrings([rawTestSample[idx]], { ignorePlaceholderNA: true });
    }

    const matchedIndices = [];
    if (candidates.length > 0) {
      effectiveSamples.forEach((rowSample, rowIdx) => {
        if (matchesBookingSampleType(candidates, rowSample, false)) {
          matchedIndices.push(rowIdx);
        }
      });
    }

    // Rescue unmatched or sample-less tests onto the first row carrying this package.
    const targetIndices = matchedIndices.length > 0 ? matchedIndices : [0];
    targetIndices.forEach((rowIdx) => {
      allocations[rowIdx].tests.push(test);
    });
  });

  const rawPanelSample = Array.isArray(pkgDoc?.pannelSample) ? pkgDoc.pannelSample : [];
  const canUsePositionalPanelSample = rawPanelSample.length === (pkgDoc?.pannelIds || []).length;

  panels.forEach((panel, idx) => {
    let candidates = deriveLivePanelSampleTypes(panel, resolvedTestsById);
    if (candidates.length === 0 && canUsePositionalPanelSample && rawPanelSample[idx]) {
      candidates = dedupeOrderedStrings([rawPanelSample[idx]], { ignorePlaceholderNA: true });
    }

    const matchedIndices = [];
    if (candidates.length > 0) {
      effectiveSamples.forEach((rowSample, rowIdx) => {
        if (matchesBookingSampleType(candidates, rowSample, false)) {
          matchedIndices.push(rowIdx);
        }
      });
    }

    const targetIndices = matchedIndices.length > 0 ? matchedIndices : [0];
    targetIndices.forEach((rowIdx) => {
      allocations[rowIdx].panels.push(panel);
    });
  });

  return { allocations, tests, panels };
};

/**
 * Convenience helper to compute package allocations for a single booking row
 * given all rows in that booking (matching same package).
 */
export const getPackageAllocationForRow = ({
  pkgDoc,
  targetRowIndex = 0,
  rowSamples = [],
  resolvedTestsById = new Map(),
  resolvedPanelsById = new Map(),
}) => {
  const { allocations } = distributePackageContentsAcrossRows({
    pkgDoc,
    rowSamples,
    resolvedTestsById,
    resolvedPanelsById,
  });

  const safeIndex =
    targetRowIndex >= 0 && targetRowIndex < allocations.length ? targetRowIndex : 0;
  return allocations[safeIndex] || { rowIndex: safeIndex, tests: [], panels: [] };
};

/**
 * Pick the highest-priority document matching a requested ID in a tenant context:
 * 1. Exact _id inside tenantId
 * 2. Exact clone originalField inside tenantId
 * 3. Tenant document matching the base document's name (when originalId wasn't saved during cloning)
 * 4. Base document matching exact _id (without leaking other tenants' unrelated clones)
 */
const pickBestScopedMatch = ({
  candidates = [],
  refId = "",
  tid = "",
  originalField = "",
  nameField = "",
  tenantDocsByName = new Map(),
}) => {
  if (!refId || candidates.length === 0) return null;

  const exactTenant = candidates.find(
    (doc) => toIdStr(doc.tenantId) === tid && toIdStr(doc._id) === refId
  );
  if (exactTenant) return exactTenant;

  if (originalField) {
    const clonedTenant = candidates.find(
      (doc) => toIdStr(doc.tenantId) === tid && toIdStr(doc[originalField]) === refId
    );
    if (clonedTenant) return clonedTenant;
  }

  const baseDoc = candidates.find((doc) => toIdStr(doc._id) === refId) || null;
  if (baseDoc && nameField && tid) {
    const normName = String(baseDoc[nameField] || "").trim().toLowerCase();
    if (normName && tenantDocsByName.has(normName)) {
      return tenantDocsByName.get(normName);
    }
  }

  return baseDoc;
};

const dedupeValidObjectIdStrings = (values = []) => {
  const seen = new Set();
  const result = [];
  for (const raw of values) {
    const id = toIdStr(raw);
    if (!id || seen.has(id) || !mongoose.Types.ObjectId.isValid(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
};

/**
 * Build tenant-aware catalog resolvers backed by Mongoose models (or injected test doubles).
 */
export const createBookingCatalogResolvers = ({ testSchema, addPannel, Package }) => {
  const resolveTestsByRefs = async ({ refs = [], names = [], tenantId }) => {
    const tid = toIdStr(tenantId);
    const refIds = dedupeValidObjectIdStrings(refs);
    const cleanNames = dedupeOrderedStrings(names);
    const resolvedByRefId = new Map();
    const resolvedByName = new Map();

    let candidates = [];
    if (refIds.length > 0 && testSchema) {
      candidates = await testSchema
        .find({
          $or: [{ _id: { $in: refIds } }, { originalTestId: { $in: refIds } }],
        })
        .lean();
    }

    // Collect names from base docs belonging to another/null tenant so we can upgrade to tenant copy if present.
    const candidateBaseNames = candidates
      .filter((doc) => toIdStr(doc.tenantId) !== tid)
      .map((doc) => doc.Name)
      .filter(Boolean);

    const lookupNames = dedupeOrderedStrings([...cleanNames, ...candidateBaseNames]);
    const tenantDocsByName = new Map();
    const baseDocsByName = new Map();

    if (lookupNames.length > 0 && testSchema) {
      const nameDocs = await testSchema
        .find({
          $or: [{ Name: { $in: lookupNames } }, { Short_name: { $in: lookupNames } }],
        })
        .lean();

      for (const doc of nameDocs) {
        const docTid = toIdStr(doc.tenantId);
        const docName = String(doc.Name || "").trim().toLowerCase();
        const docShort = String(doc.Short_name || "").trim().toLowerCase();
        if (tid && docTid === tid) {
          if (docName && !tenantDocsByName.has(docName)) tenantDocsByName.set(docName, doc);
          if (docShort && !tenantDocsByName.has(docShort)) tenantDocsByName.set(docShort, doc);
        } else {
          if (docName && !baseDocsByName.has(docName)) baseDocsByName.set(docName, doc);
          if (docShort && !baseDocsByName.has(docShort)) baseDocsByName.set(docShort, doc);
        }
      }
    }

    for (const refId of refIds) {
      const relevant = candidates.filter(
        (doc) => toIdStr(doc._id) === refId || toIdStr(doc.originalTestId) === refId
      );
      const winner = pickBestScopedMatch({
        candidates: relevant,
        refId,
        tid,
        originalField: "originalTestId",
        nameField: "Name",
        tenantDocsByName,
      });
      if (winner) {
        resolvedByRefId.set(refId, winner);
      }
    }

    for (const name of cleanNames) {
      const norm = name.toLowerCase();
      const winner = tenantDocsByName.get(norm) || baseDocsByName.get(norm) || null;
      if (winner) {
        resolvedByName.set(norm, winner);
      }
    }

    return { resolvedByRefId, resolvedByName };
  };

  const resolvePanelsByRefs = async ({ refs = [], names = [], tenantId }) => {
    const tid = toIdStr(tenantId);
    const refIds = dedupeValidObjectIdStrings(refs);
    const cleanNames = dedupeOrderedStrings(names);
    const resolvedByRefId = new Map();
    const resolvedByName = new Map();

    let candidates = [];
    if (refIds.length > 0 && addPannel) {
      candidates = await addPannel
        .find({
          $or: [{ _id: { $in: refIds } }, { originalPanelId: { $in: refIds } }],
        })
        .lean();
    }

    const candidateBaseNames = candidates
      .filter((doc) => toIdStr(doc.tenantId) !== tid)
      .map((doc) => doc.name)
      .filter(Boolean);

    const lookupNames = dedupeOrderedStrings([...cleanNames, ...candidateBaseNames]);
    const tenantDocsByName = new Map();
    const baseDocsByName = new Map();

    if (lookupNames.length > 0 && addPannel) {
      const nameDocs = await addPannel
        .find({
          $or: [{ name: { $in: lookupNames } }, { Short_name: { $in: lookupNames } }],
        })
        .lean();

      for (const doc of nameDocs) {
        const docTid = toIdStr(doc.tenantId);
        const docName = String(doc.name || "").trim().toLowerCase();
        const docShort = String(doc.Short_name || "").trim().toLowerCase();
        if (tid && docTid === tid) {
          if (docName && !tenantDocsByName.has(docName)) tenantDocsByName.set(docName, doc);
          if (docShort && !tenantDocsByName.has(docShort)) tenantDocsByName.set(docShort, doc);
        } else {
          if (docName && !baseDocsByName.has(docName)) baseDocsByName.set(docName, doc);
          if (docShort && !baseDocsByName.has(docShort)) baseDocsByName.set(docShort, doc);
        }
      }
    }

    const panelWinners = [];
    for (const refId of refIds) {
      const relevant = candidates.filter(
        (doc) => toIdStr(doc._id) === refId || toIdStr(doc.originalPanelId) === refId
      );
      const winner = pickBestScopedMatch({
        candidates: relevant,
        refId,
        tid,
        originalField: "originalPanelId",
        nameField: "name",
        tenantDocsByName,
      });
      if (winner) {
        const clone = { ...winner };
        resolvedByRefId.set(refId, clone);
        panelWinners.push(clone);
      }
    }

    for (const name of cleanNames) {
      const norm = name.toLowerCase();
      const winner = tenantDocsByName.get(norm) || baseDocsByName.get(norm) || null;
      if (winner && !resolvedByName.has(norm)) {
        const existingClone = panelWinners.find((p) => toIdStr(p._id) === toIdStr(winner._id));
        const clone = existingClone || { ...winner };
        resolvedByName.set(norm, clone);
        if (!existingClone) panelWinners.push(clone);
      }
    }

    // Batch-resolve every child test inside all winner panels WITHOUT match:{tenantId} dropping base tests.
    const allChildTestRefs = [];
    const fallbackChildTestNames = [];
    for (const panel of panelWinners) {
      const childIds = Array.isArray(panel.testsId) ? panel.testsId : [];
      childIds.forEach((childRef) => {
        const childId = toIdStr(childRef);
        if (childId) allChildTestRefs.push(childId);
      });

      const childNames = Array.isArray(panel.tests) ? panel.tests : [];
      if (childNames.length > childIds.length || childIds.length === 0) {
        fallbackChildTestNames.push(...childNames);
      }
    }

    const { resolvedByRefId: childTestsById, resolvedByName: childTestsByName } =
      allChildTestRefs.length > 0 || fallbackChildTestNames.length > 0
        ? await resolveTestsByRefs({
            refs: allChildTestRefs,
            names: fallbackChildTestNames,
            tenantId: tid,
          })
        : { resolvedByRefId: new Map(), resolvedByName: new Map() };

    // If any panel child ref still missed by ID and panel.tests[idx] has a name, fetch missing by name.
    const missingSlotNames = [];
    for (const panel of panelWinners) {
      const childIds = Array.isArray(panel.testsId) ? panel.testsId : [];
      const childNames = Array.isArray(panel.tests) ? panel.tests : [];
      childIds.forEach((childRef, idx) => {
        const idStr = toIdStr(childRef);
        if ((!idStr || !childTestsById.has(idStr)) && childNames[idx]) {
          missingSlotNames.push(childNames[idx]);
        }
      });
    }

    if (missingSlotNames.length > 0) {
      const extra = await resolveTestsByRefs({ names: missingSlotNames, tenantId: tid });
      extra.resolvedByName.forEach((doc, key) => {
        if (!childTestsByName.has(key)) childTestsByName.set(key, doc);
      });
    }

    for (const panel of panelWinners) {
      const seenChildIds = new Set();
      const populatedChildren = [];
      const childIds = Array.isArray(panel.testsId) ? panel.testsId : [];
      const childNames = Array.isArray(panel.tests) ? panel.tests : [];

      childIds.forEach((childRef, idx) => {
        const idStr = toIdStr(childRef);
        const byId = idStr ? childTestsById.get(idStr) : null;
        const byName =
          !byId && childNames[idx]
            ? childTestsByName.get(String(childNames[idx]).trim().toLowerCase())
            : null;
        const resolvedChild =
          byId ||
          byName ||
          (childRef && typeof childRef === "object" && (childRef.Name || childRef.Short_name) ? childRef : null);

        const resolvedChildId = toIdStr(resolvedChild);
        if (!resolvedChild || !resolvedChildId || seenChildIds.has(resolvedChildId)) return;
        seenChildIds.add(resolvedChildId);
        populatedChildren.push(resolvedChild);
      });

      // If panel.tests lists extra tests beyond testsId (or testsId was empty), rescue by name.
      if (childNames.length > populatedChildren.length) {
        childNames.forEach((name) => {
          const norm = String(name || "").trim().toLowerCase();
          const byName = norm ? childTestsByName.get(norm) : null;
          const resolvedChildId = toIdStr(byName);
          if (byName && resolvedChildId && !seenChildIds.has(resolvedChildId)) {
            seenChildIds.add(resolvedChildId);
            populatedChildren.push(byName);
          }
        });
      }

      panel.testsId = populatedChildren;
    }

    return { resolvedByRefId, resolvedByName, childTestsById };
  };

  const resolvePackagesByRefs = async ({ refs = [], names = [], tenantId }) => {
    const tid = toIdStr(tenantId);
    const refIds = dedupeValidObjectIdStrings(refs);
    const cleanNames = dedupeOrderedStrings(names);
    const resolvedByRefId = new Map();
    const resolvedByName = new Map();

    let candidates = [];
    if (refIds.length > 0 && Package) {
      candidates = await Package
        .find({
          $or: [{ _id: { $in: refIds } }, { originalPackageId: { $in: refIds } }],
        })
        .lean();
    }

    const candidateBaseNames = candidates
      .filter((doc) => toIdStr(doc.tenantId) !== tid)
      .map((doc) => doc.packageName)
      .filter(Boolean);

    const lookupNames = dedupeOrderedStrings([...cleanNames, ...candidateBaseNames]);
    const tenantDocsByName = new Map();
    const baseDocsByName = new Map();

    if (lookupNames.length > 0 && Package) {
      const nameDocs = await Package
        .find({ packageName: { $in: lookupNames } })
        .lean();

      for (const doc of nameDocs) {
        const docTid = toIdStr(doc.tenantId);
        const docName = String(doc.packageName || "").trim().toLowerCase();
        if (!docName) continue;
        if (tid && docTid === tid) {
          if (!tenantDocsByName.has(docName)) tenantDocsByName.set(docName, doc);
        } else {
          if (!baseDocsByName.has(docName)) baseDocsByName.set(docName, doc);
        }
      }
    }

    const pkgWinners = [];
    for (const refId of refIds) {
      const relevant = candidates.filter(
        (doc) => toIdStr(doc._id) === refId || toIdStr(doc.originalPackageId) === refId
      );
      const winner = pickBestScopedMatch({
        candidates: relevant,
        refId,
        tid,
        originalField: "originalPackageId",
        nameField: "packageName",
        tenantDocsByName,
      });
      if (winner) {
        const clone = { ...winner };
        resolvedByRefId.set(refId, clone);
        pkgWinners.push(clone);
      }
    }

    for (const name of cleanNames) {
      const norm = name.toLowerCase();
      const winner = tenantDocsByName.get(norm) || baseDocsByName.get(norm) || null;
      if (winner && !resolvedByName.has(norm)) {
        const existingClone = pkgWinners.find((p) => toIdStr(p._id) === toIdStr(winner._id));
        const clone = existingClone || { ...winner };
        resolvedByName.set(norm, clone);
        if (!existingClone) pkgWinners.push(clone);
      }
    }

    // Batch-resolve every package test and panel (with populated child tests).
    const allTestRefs = [];
    const fallbackTestNames = [];
    const allPanelRefs = [];
    const fallbackPanelNames = [];

    for (const pkg of pkgWinners) {
      const testRefs = Array.isArray(pkg.testIds) ? pkg.testIds : [];
      testRefs.forEach((r) => {
        const id = toIdStr(r);
        if (id) allTestRefs.push(id);
      });
      if (testRefs.length === 0 && Array.isArray(pkg.testname) && pkg.testname.length > 0) {
        fallbackTestNames.push(...pkg.testname);
      }

      const panelRefs = Array.isArray(pkg.pannelIds) ? pkg.pannelIds : [];
      panelRefs.forEach((r) => {
        const id = toIdStr(r);
        if (id) allPanelRefs.push(id);
      });
      if (panelRefs.length === 0 && Array.isArray(pkg.pannelname) && pkg.pannelname.length > 0) {
        fallbackPanelNames.push(...pkg.pannelname);
      }
    }

    const [{ resolvedByRefId: pkgTestsById, resolvedByName: pkgTestsByName }, { resolvedByRefId: pkgPanelsById, resolvedByName: pkgPanelsByName, childTestsById }] =
      await Promise.all([
        allTestRefs.length > 0 || fallbackTestNames.length > 0
          ? resolveTestsByRefs({ refs: allTestRefs, names: fallbackTestNames, tenantId: tid })
          : { resolvedByRefId: new Map(), resolvedByName: new Map() },
        allPanelRefs.length > 0 || fallbackPanelNames.length > 0
          ? resolvePanelsByRefs({ refs: allPanelRefs, names: fallbackPanelNames, tenantId: tid })
          : { resolvedByRefId: new Map(), resolvedByName: new Map(), childTestsById: new Map() },
      ]);

    // Check if any package had an ID ref that failed to resolve, and rescue via pkg.testname/pannelname.
    const rescueTestNames = [];
    const rescuePanelNames = [];
    for (const pkg of pkgWinners) {
      const testRefs = Array.isArray(pkg.testIds) ? pkg.testIds : [];
      const testNames = Array.isArray(pkg.testname) ? pkg.testname : [];
      testRefs.forEach((r, idx) => {
        const id = toIdStr(r);
        if ((!id || !pkgTestsById.has(id)) && testNames[idx]) {
          rescueTestNames.push(testNames[idx]);
        }
      });

      const panelRefs = Array.isArray(pkg.pannelIds) ? pkg.pannelIds : [];
      const panelNames = Array.isArray(pkg.pannelname) ? pkg.pannelname : [];
      panelRefs.forEach((r, idx) => {
        const id = toIdStr(r);
        if ((!id || !pkgPanelsById.has(id)) && panelNames[idx]) {
          rescuePanelNames.push(panelNames[idx]);
        }
      });
    }

    if (rescueTestNames.length > 0) {
      const extraTests = await resolveTestsByRefs({ names: rescueTestNames, tenantId: tid });
      extraTests.resolvedByName.forEach((doc, k) => {
        if (!pkgTestsByName.has(k)) pkgTestsByName.set(k, doc);
      });
    }
    if (rescuePanelNames.length > 0) {
      const extraPanels = await resolvePanelsByRefs({ names: rescuePanelNames, tenantId: tid });
      extraPanels.resolvedByName.forEach((doc, k) => {
        if (!pkgPanelsByName.has(k)) pkgPanelsByName.set(k, doc);
      });
    }

    const combinedTestsById = new Map([...pkgTestsById, ...childTestsById]);

    for (const pkg of pkgWinners) {
      const seenTestIds = new Set();
      const resolvedTests = [];
      const testRefs = Array.isArray(pkg.testIds) ? pkg.testIds : [];
      const testNames = Array.isArray(pkg.testname) ? pkg.testname : [];

      testRefs.forEach((r, idx) => {
        const id = toIdStr(r);
        const byId = id ? pkgTestsById.get(id) : null;
        const byName = !byId && testNames[idx]
          ? pkgTestsByName.get(String(testNames[idx]).trim().toLowerCase())
          : null;
        const doc = byId || byName || (typeof r === "object" && (r.Name || r.Short_name) ? r : null);
        const docId = toIdStr(doc);
        if (doc && docId && !seenTestIds.has(docId)) {
          seenTestIds.add(docId);
          resolvedTests.push(doc);
          combinedTestsById.set(docId, doc);
        }
      });

      if (testNames.length > resolvedTests.length) {
        testNames.forEach((name) => {
          const norm = String(name || "").trim().toLowerCase();
          const doc = norm ? pkgTestsByName.get(norm) : null;
          const docId = toIdStr(doc);
          if (doc && docId && !seenTestIds.has(docId)) {
            seenTestIds.add(docId);
            resolvedTests.push(doc);
            combinedTestsById.set(docId, doc);
          }
        });
      }

      const seenPanelIds = new Set();
      const resolvedPanels = [];
      const panelRefs = Array.isArray(pkg.pannelIds) ? pkg.pannelIds : [];
      const panelNames = Array.isArray(pkg.pannelname) ? pkg.pannelname : [];

      panelRefs.forEach((r, idx) => {
        const id = toIdStr(r);
        const byId = id ? pkgPanelsById.get(id) : null;
        const byName = !byId && panelNames[idx]
          ? pkgPanelsByName.get(String(panelNames[idx]).trim().toLowerCase())
          : null;
        const doc = byId || byName || (typeof r === "object" && (r.name || r.Short_name) ? r : null);
        const docId = toIdStr(doc);
        if (doc && docId && !seenPanelIds.has(docId)) {
          seenPanelIds.add(docId);
          resolvedPanels.push(doc);
        }
      });

      if (panelNames.length > resolvedPanels.length) {
        panelNames.forEach((name) => {
          const norm = String(name || "").trim().toLowerCase();
          const doc = norm ? pkgPanelsByName.get(norm) : null;
          const docId = toIdStr(doc);
          if (doc && docId && !seenPanelIds.has(docId)) {
            seenPanelIds.add(docId);
            resolvedPanels.push(doc);
          }
        });
      }

      pkg.testIds = resolvedTests;
      pkg.pannelIds = resolvedPanels;
    }

    return {
      resolvedByRefId,
      resolvedByName,
      resolvedTestsById: combinedTestsById,
      resolvedPanelsById: pkgPanelsById,
    };
  };

  return {
    resolveTestsByRefs,
    resolvePanelsByRefs,
    resolvePackagesByRefs,
  };
};

const addWithLineageDedupe = ({ doc, seenKeys, targetArray, originalField }) => {
  if (!doc || typeof doc !== "object") return false;
  const primaryId = toIdStr(doc._id);
  const originalId = originalField ? toIdStr(doc[originalField]) : "";

  if (!primaryId && !originalId) return false;
  if ((primaryId && seenKeys.has(primaryId)) || (originalId && seenKeys.has(originalId))) {
    return false;
  }

  if (primaryId) seenKeys.add(primaryId);
  if (originalId) seenKeys.add(originalId);
  targetArray.push(doc);
  return true;
};

/**
 * Resolve ALL booked tests, panels, and packages for Lab Report (`getTestNameController`).
 * Combines `acceptedBarcode.barcodes`, `newBooking.tableData`, and `newBooking.selectedItems`
 * and expands every booked package A-to-Z (without sampleType filtering drops) so no test or
 * panel inside a package (including Fluoride / Random Blood Sugar or partial tubes) can disappear.
 */
export const resolveBookedInvestigationsForLabReport = async ({
  tenantId,
  acceptedBarcodeDoc = null,
  bookingDoc = null,
  resolvers,
  hydrateCategories = null,
}) => {
  const tid = toIdStr(tenantId);
  const barcodesObject = acceptedBarcodeDoc
    ? (acceptedBarcodeDoc.toObject ? acceptedBarcodeDoc.toObject() : { ...acceptedBarcodeDoc })
    : {
        tenantId,
        bookingId: bookingDoc?.bookingId || "",
        createdAt: bookingDoc?.createdAt || new Date(),
        barcodes: [],
      };

  barcodesObject.barcodes = Array.isArray(barcodesObject.barcodes)
    ? barcodesObject.barcodes.map((entry) => ({ ...(entry?.toObject ? entry.toObject() : entry) }))
    : [];

  // Merge any booking tableData rows whose barcode was not yet recorded in acceptedBarcode.barcodes
  const existingBarcodeSet = new Set(
    barcodesObject.barcodes
      .map((entry) => String(entry?.barcode || "").trim())
      .filter(Boolean)
  );

  const tableDataRows = Array.isArray(bookingDoc?.tableData) ? bookingDoc.tableData : [];
  for (const row of tableDataRows) {
    const rowBarcode = String(row?.confirmBarcodeId || row?.barcodeId || "").trim();
    const fallbackBarcode = rowBarcode || String(row?.typeOfSample || bookingDoc?.bookingId || "").trim();
    if (!fallbackBarcode || existingBarcodeSet.has(fallbackBarcode)) continue;
    existingBarcodeSet.add(fallbackBarcode);

    const rowTestIds = (Array.isArray(row?.ids) ? row.ids : [])
      .filter((item) => item && item.id)
      .map((item) => ({
        id: item.id,
        collectionName: canonicalCollectionName(item.collectionName) || item.collectionName,
      }));

    const rowNames = row?.testName
      ? String(row.testName).split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    barcodesObject.barcodes.push({
      barcode: rowBarcode || fallbackBarcode,
      testandpannelArray: rowNames,
      sampleType: row?.typeOfSample || row?.sampleType || "",
      testIds: rowTestIds,
    });
  }

  // Gather ALL referenced IDs across acceptedBarcode, booking.tableData, and booking.selectedItems
  const testRefIds = [];
  const panelRefIds = [];
  const packageRefIds = [];
  const legacyItemNames = [];

  const collectRef = (rawId, rawType) => {
    const id = toIdStr(rawId);
    const itemType = normalizeBookingItemType(rawType);
    if (!id) return;
    if (itemType === "test") testRefIds.push(id);
    else if (itemType === "panel") panelRefIds.push(id);
    else if (itemType === "package") packageRefIds.push(id);
  };

  for (const entry of barcodesObject.barcodes) {
    for (const obj of entry?.testIds || []) {
      collectRef(obj?.id ?? obj?._id, obj?.collectionName ?? obj?.itemType);
    }
  }

  for (const row of tableDataRows) {
    const rowIds = Array.isArray(row?.ids) ? row.ids : [];
    for (const obj of rowIds) {
      collectRef(obj?.id ?? obj?._id, obj?.collectionName ?? obj?.itemType);
    }
    if (rowIds.length === 0 && row?.testName) {
      String(row.testName)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((n) => legacyItemNames.push(n));
    }
  }

  const selectedItems = Array.isArray(bookingDoc?.selectedItems) ? bookingDoc.selectedItems : [];
  for (const item of selectedItems) {
    collectRef(item?.itemId ?? item?.id ?? item?._id, item?.itemType ?? item?.collectionName);
    if (!toIdStr(item?.itemId ?? item?.id) && item?.itemName) {
      legacyItemNames.push(String(item.itemName).trim());
    }
  }

  // Batch-resolve packages, panels, and tests (plus any legacy name-only entries)
  const [pkgResolution, panelResolution, testResolution] = await Promise.all([
    packageRefIds.length > 0 || legacyItemNames.length > 0
      ? resolvers.resolvePackagesByRefs({ refs: packageRefIds, names: legacyItemNames, tenantId: tid })
      : { resolvedByRefId: new Map(), resolvedByName: new Map() },
    panelRefIds.length > 0 || legacyItemNames.length > 0
      ? resolvers.resolvePanelsByRefs({ refs: panelRefIds, names: legacyItemNames, tenantId: tid })
      : { resolvedByRefId: new Map(), resolvedByName: new Map() },
    testRefIds.length > 0 || legacyItemNames.length > 0
      ? resolvers.resolveTestsByRefs({ refs: testRefIds, names: legacyItemNames, tenantId: tid })
      : { resolvedByRefId: new Map(), resolvedByName: new Map() },
  ]);

  const seenTestKeys = new Set();
  const seenPanelKeys = new Set();
  const seenPackageKeys = new Set();

  const singleTests = [];
  const panels = [];
  const packages = [];

  const registerTest = (doc) =>
    addWithLineageDedupe({ doc, seenKeys: seenTestKeys, targetArray: singleTests, originalField: "originalTestId" });

  const registerPanel = (doc) =>
    addWithLineageDedupe({ doc, seenKeys: seenPanelKeys, targetArray: panels, originalField: "originalPanelId" });

  const registerPackage = (doc) => {
    const added = addWithLineageDedupe({
      doc,
      seenKeys: seenPackageKeys,
      targetArray: packages,
      originalField: "originalPackageId",
    });
    // Always expand A-to-Z tests and panels of every booked package (even if already registered earlier)
    for (const pkgTest of doc?.testIds || []) {
      registerTest(pkgTest);
    }
    for (const pkgPanel of doc?.pannelIds || []) {
      registerPanel(pkgPanel);
    }
    return added;
  };

  // Register in deterministic order: first items on barcodes, then booking tableData & selectedItems
  for (const entry of barcodesObject.barcodes) {
    for (const obj of entry?.testIds || []) {
      const id = toIdStr(obj?.id ?? obj?._id);
      const itemType = normalizeBookingItemType(obj?.collectionName ?? obj?.itemType);
      if (!id) continue;
      if (itemType === "test") registerTest(testResolution.resolvedByRefId.get(id));
      else if (itemType === "panel") registerPanel(panelResolution.resolvedByRefId.get(id));
      else if (itemType === "package") registerPackage(pkgResolution.resolvedByRefId.get(id));
    }
  }

  for (const row of tableDataRows) {
    for (const obj of row?.ids || []) {
      const id = toIdStr(obj?.id ?? obj?._id);
      const itemType = normalizeBookingItemType(obj?.collectionName ?? obj?.itemType);
      if (!id) continue;
      if (itemType === "test") registerTest(testResolution.resolvedByRefId.get(id));
      else if (itemType === "panel") registerPanel(panelResolution.resolvedByRefId.get(id));
      else if (itemType === "package") registerPackage(pkgResolution.resolvedByRefId.get(id));
    }
  }

  for (const item of selectedItems) {
    const id = toIdStr(item?.itemId ?? item?.id ?? item?._id);
    const itemType = normalizeBookingItemType(item?.itemType ?? item?.collectionName);
    if (!id) continue;
    if (itemType === "test") registerTest(testResolution.resolvedByRefId.get(id));
    else if (itemType === "panel") registerPanel(panelResolution.resolvedByRefId.get(id));
    else if (itemType === "package") registerPackage(pkgResolution.resolvedByRefId.get(id));
  }

  // Legacy name-only entries (when booking row lacked object IDs)
  for (const name of legacyItemNames) {
    const norm = name.toLowerCase();
    const pkgMatch = pkgResolution.resolvedByName.get(norm);
    if (pkgMatch) {
      registerPackage(pkgMatch);
      continue;
    }
    const panelMatch = panelResolution.resolvedByName.get(norm);
    if (panelMatch) {
      registerPanel(panelMatch);
      continue;
    }
    const testMatch = testResolution.resolvedByName.get(norm);
    if (testMatch) {
      registerTest(testMatch);
    }
  }

  let finalSingleTests = singleTests;
  let finalPanels = panels;

  if (typeof hydrateCategories === "function") {
    const hydrated = await hydrateCategories({
      tenantId,
      singleTests,
      panels,
    });
    finalSingleTests = hydrated?.singleTests || singleTests;
    finalPanels = hydrated?.panels || panels;
  }

  // Build ID-to-Name map reflecting latest DB names across resolved tests, panels, and packages
  const idToNameMap = new Map();
  finalSingleTests.forEach((test) => {
    const name = test?.Short_name || test?.Name;
    const id = toIdStr(test?._id);
    const origId = toIdStr(test?.originalTestId);
    if (id && name) idToNameMap.set(id, name);
    if (origId && name) idToNameMap.set(origId, name);
  });

  finalPanels.forEach((panel) => {
    const id = toIdStr(panel?._id);
    const origId = toIdStr(panel?.originalPanelId);
    if (id && panel?.name) idToNameMap.set(id, panel.name);
    if (origId && panel?.name) idToNameMap.set(origId, panel.name);
  });

  packages.forEach((pkg) => {
    const id = toIdStr(pkg?._id);
    const origId = toIdStr(pkg?.originalPackageId);
    if (id && pkg?.packageName) idToNameMap.set(id, pkg.packageName);
    if (origId && pkg?.packageName) idToNameMap.set(origId, pkg.packageName);
  });

  const allResolvedInvestigations = [];
  barcodesObject.barcodes.forEach((element) => {
    const resolvedNames = [];
    if (Array.isArray(element.testIds) && element.testIds.length > 0) {
      element.testIds.forEach((item) => {
        const idKey = toIdStr(item?.id ?? item?._id);
        if (idKey && idToNameMap.has(idKey)) {
          resolvedNames.push(idToNameMap.get(idKey));
        }
      });
    }

    if (resolvedNames.length > 0) {
      element.testandpannelArray = [...new Set(resolvedNames)];
      allResolvedInvestigations.push(...element.testandpannelArray);
    } else if (Array.isArray(element.testandpannelArray)) {
      allResolvedInvestigations.push(...element.testandpannelArray);
    }
  });

  // Ensure every resolved package, panel, and standalone test is represented in investigations
  packages.forEach((pkg) => {
    if (pkg?.packageName) allResolvedInvestigations.push(pkg.packageName);
  });
  finalPanels.forEach((panel) => {
    if (panel?.name) allResolvedInvestigations.push(panel.name);
  });
  finalSingleTests.forEach((test) => {
    const label = test?.Short_name || test?.Name;
    if (label) allResolvedInvestigations.push(label);
  });

  return {
    barcodes: barcodesObject,
    singleTests: finalSingleTests,
    panels: finalPanels,
    packages,
    investigations: dedupeOrderedStrings(allResolvedInvestigations),
  };
};

/**
 * Hydrate `_liveSampleTypes` on panel and package catalog documents from their live child tests/panels
 * so booking catalogs never omit newly added or re-typed sample tubes (e.g. Fluoride / RBS).
 */
export const hydrateLiveCatalogSampleTypes = async ({
  tests = [],
  panels = [],
  packages = [],
  testSchema,
  addPannel,
} = {}) => {
  const testsById = new Map();
  for (const test of tests) {
    const id = toIdStr(test?._id);
    if (id) testsById.set(id, test);
    const origId = toIdStr(test?.originalTestId);
    if (origId && !testsById.has(origId)) testsById.set(origId, test);
  }

  const panelsById = new Map();
  for (const panel of panels) {
    const id = toIdStr(panel?._id);
    if (id) panelsById.set(id, panel);
    const origId = toIdStr(panel?.originalPanelId);
    if (origId && !panelsById.has(origId)) panelsById.set(origId, panel);
  }

  // Fetch any package-referenced panels missing from the current panels slice.
  const missingPanelIds = [];
  for (const pkg of packages) {
    for (const ref of pkg?.pannelIds || []) {
      const id = toIdStr(ref);
      if (id && !panelsById.has(id) && mongoose.Types.ObjectId.isValid(id)) {
        missingPanelIds.push(id);
      }
    }
  }

  if (missingPanelIds.length > 0 && addPannel) {
    const uniqueMissingPanelIds = [...new Set(missingPanelIds)];
    const extraPanels = await addPannel
      .find({ _id: { $in: uniqueMissingPanelIds } })
      .select("name Short_name testsId sample_types originalPanelId")
      .lean();
    for (const panel of extraPanels) {
      const id = toIdStr(panel?._id);
      if (id) panelsById.set(id, panel);
    }
  }

  // Fetch any test docs referenced by panels or packages that are not yet in testsById.
  const missingTestIds = [];
  const collectMissingTestId = (ref) => {
    const id = toIdStr(ref);
    if (id && !testsById.has(id) && mongoose.Types.ObjectId.isValid(id)) {
      missingTestIds.push(id);
    }
  };

  for (const panel of panelsById.values()) {
    for (const ref of panel?.testsId || []) {
      collectMissingTestId(ref);
    }
  }
  for (const pkg of packages) {
    for (const ref of pkg?.testIds || []) {
      collectMissingTestId(ref);
    }
  }

  if (missingTestIds.length > 0 && testSchema) {
    const uniqueMissingTestIds = [...new Set(missingTestIds)];
    const extraTests = await testSchema
      .find({
        $or: [
          { _id: { $in: uniqueMissingTestIds } },
          { originalTestId: { $in: uniqueMissingTestIds } },
        ],
      })
      .select("Name Short_name sampleType sample_type sampleTypes originalTestId")
      .lean();

    for (const test of extraTests) {
      const id = toIdStr(test?._id);
      if (id && !testsById.has(id)) testsById.set(id, test);
      const origId = toIdStr(test?.originalTestId);
      if (origId && !testsById.has(origId)) testsById.set(origId, test);
    }
  }

  const hydratedPanels = panels.map((panel) => ({
    ...panel,
    _liveSampleTypes: deriveLivePanelSampleTypes(panel, testsById),
  }));

  const hydratedPackages = packages.map((pkg) => ({
    ...pkg,
    _liveSampleTypes: deriveLivePackageSampleTypes(pkg, testsById, panelsById),
  }));

  return {
    tests,
    panels: hydratedPanels,
    packages: hydratedPackages,
  };
};

/**
 * Expand tests, panels, and packages across a booking's `tableData` rows in batch,
 * ensuring every test and panel inside every booked package is assigned to a matching sample row
 * or rescued onto the package's primary row (never dropped).
 */
export const resolveExpandedItemsForBookingRows = async ({
  rows = [],
  tenantId,
  resolvers,
}) => {
  const rowList = Array.isArray(rows) ? rows : [];
  if (rowList.length === 0) return [];

  const tid = toIdStr(tenantId);
  const testRefIds = [];
  const panelRefIds = [];
  const packageRefIds = [];

  for (const row of rowList) {
    for (const obj of Array.isArray(row?.ids) ? row.ids : []) {
      const id = toIdStr(obj?.id ?? obj?._id);
      const itemType = normalizeBookingItemType(obj?.collectionName ?? obj?.itemType);
      if (!id) continue;
      if (itemType === "test") testRefIds.push(id);
      else if (itemType === "panel") panelRefIds.push(id);
      else if (itemType === "package") packageRefIds.push(id);
    }
  }

  const [testRes, panelRes, pkgRes] = await Promise.all([
    testRefIds.length > 0
      ? resolvers.resolveTestsByRefs({ refs: testRefIds, tenantId: tid })
      : { resolvedByRefId: new Map() },
    panelRefIds.length > 0
      ? resolvers.resolvePanelsByRefs({ refs: panelRefIds, tenantId: tid })
      : { resolvedByRefId: new Map() },
    packageRefIds.length > 0
      ? resolvers.resolvePackagesByRefs({ refs: packageRefIds, tenantId: tid })
      : { resolvedByRefId: new Map(), resolvedTestsById: new Map(), resolvedPanelsById: new Map() },
  ]);

  // Group all booking rows referencing each package so contents distribute accurately without drops.
  const packageRowIndicesMap = new Map();
  rowList.forEach((row, rowIdx) => {
    for (const obj of Array.isArray(row?.ids) ? row.ids : []) {
      const id = toIdStr(obj?.id ?? obj?._id);
      if (normalizeBookingItemType(obj?.collectionName ?? obj?.itemType) !== "package" || !id) continue;
      const resolvedPkg = pkgRes.resolvedByRefId.get(id);
      const canonicalPkgId = toIdStr(resolvedPkg?._id) || id;
      if (!packageRowIndicesMap.has(canonicalPkgId)) {
        packageRowIndicesMap.set(canonicalPkgId, []);
      }
      const indices = packageRowIndicesMap.get(canonicalPkgId);
      if (!indices.includes(rowIdx)) {
        indices.push(rowIdx);
      }
    }
  });

  const packageDistributionMap = new Map();
  for (const [canonicalPkgId, indices] of packageRowIndicesMap.entries()) {
    // Locate the resolved package document matching this canonical ID
    let pkgDoc = null;
    for (const candidate of pkgRes.resolvedByRefId.values()) {
      if ((toIdStr(candidate?._id) || "") === canonicalPkgId) {
        pkgDoc = candidate;
        break;
      }
    }
    if (!pkgDoc) continue;

    const rowSamples = indices.map((idx) =>
      String(rowList[idx]?.typeOfSample ?? rowList[idx]?.sampleType ?? "").trim()
    );
    const distributed = distributePackageContentsAcrossRows({
      pkgDoc,
      rowSamples,
      resolvedTestsById: pkgRes.resolvedTestsById,
      resolvedPanelsById: pkgRes.resolvedPanelsById,
    });

    const perRowIndexMap = new Map();
    indices.forEach((bookingRowIdx, allocIdx) => {
      perRowIndexMap.set(
        bookingRowIdx,
        distributed.allocations[allocIdx] || { tests: [], panels: [] }
      );
    });
    packageDistributionMap.set(canonicalPkgId, perRowIndexMap);
  }

  return rowList.map((row, rowIdx) => {
    const names = [];
    const objects = [];
    const processedPackagesInRow = new Set();

    for (const obj of Array.isArray(row?.ids) ? row.ids : []) {
      const id = toIdStr(obj?.id ?? obj?._id);
      const itemType = normalizeBookingItemType(obj?.collectionName ?? obj?.itemType);
      if (!id) continue;

      if (itemType === "test") {
        const doc = testRes.resolvedByRefId.get(id);
        if (doc) {
          const name = doc.Name || doc.Short_name || "";
          if (name) names.push(name);
          objects.push({ id: doc._id, collectionName: "testSchema" });
        }
        continue;
      }

      if (itemType === "panel") {
        const doc = panelRes.resolvedByRefId.get(id);
        if (doc) {
          const name = doc.name || doc.Short_name || "";
          if (name) names.push(name);
          objects.push({ id: doc._id, collectionName: "addPannel" });
        }
        continue;
      }

      if (itemType === "package") {
        const doc = pkgRes.resolvedByRefId.get(id);
        if (!doc) continue;
        const canonicalPkgId = toIdStr(doc._id) || id;
        if (processedPackagesInRow.has(canonicalPkgId)) continue;
        processedPackagesInRow.add(canonicalPkgId);

        const allocation = packageDistributionMap.get(canonicalPkgId)?.get(rowIdx);
        if (!allocation) continue;

        for (const test of allocation.tests) {
          const name = test?.Name || test?.Short_name || "";
          if (name) names.push(name);
          objects.push({ id: test._id, collectionName: "testSchema" });
        }

        for (const panel of allocation.panels) {
          const name = panel?.name || panel?.Short_name || "";
          if (name) names.push(name);
          objects.push({ id: panel._id, collectionName: "addPannel" });
        }
      }
    }

    const testnames = [...new Set(names.filter(Boolean))];
    const seenObjKeys = new Set();
    const testObjects = [];
    for (const obj of objects) {
      const idStr = toIdStr(obj?.id);
      if (!idStr || !obj?.collectionName) continue;
      const key = `${idStr}_${obj.collectionName}`;
      if (!seenObjKeys.has(key)) {
        seenObjKeys.add(key);
        testObjects.push(obj);
      }
    }

    return { testnames, testObjects };
  });
};
