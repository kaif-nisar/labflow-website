/**
 * ============================================================================
 * LABFLOW SELECTIVE REPORT & SUBSET FILTERING ENGINE
 * ============================================================================
 * Shared pure ES module used by:
 *   - Enter Result (`private/pages/pages/labreport.js`)
 *   - Report Action Shared Helpers (`private/pages/pages/reportAction.shared.js`)
 *   - All Report Format Viewers (Formats 1, 2/Standard, 3, 4, 5)
 *
 * Design Guarantees:
 *   1. Non-destructive: Never mutates the original `fullReport` object or
 *      saved database `ReportData` / `Customization` records.
 *   2. Default-all: When no items are unchecked (or `mode === "full"`), 100%
 *      of tests, panels, packages, remarks, and investigations render as-is.
 *   3. Hierarchy-aware: Supports selecting Packages (expanding to their
 *      constituent panels & single tests), Panels, Single Tests, Documented
 *      Tests, and individual sub-parameters inside multi-parameter blocks
 *      while automatically keeping parent multi-parameter headings intact.
 * ============================================================================
 */

const STORAGE_PREFIX = "labflow.selectiveManifest.v1.";

export function normalizeSelText(raw) {
  return String(raw ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function stripHtmlPlain(raw) {
  return String(raw ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRowMultiParamChild(test) {
  if (!test) return false;
  if (test.isParameter === true) return true;
  return /id=["']parameters["']/i.test(String(test.testName || test.Name || ""));
}

function isRowDocumented(test) {
  return Boolean(test?.isDocumented || test?.document);
}

function isRowPureHeading(test, siblingTests = [], index = 0) {
  if (!test || isRowDocumented(test) || isRowMultiParamChild(test)) return false;
  if (test.isMultiParameterHeading || test.isMultiHeader) return true;

  const hasVal = String(test.value ?? test.result ?? test.currentvalue ?? "").trim() !== "";
  const hasUnit = String(test.unit ?? "").trim() !== "";
  const hasRef = String(test.reference ?? test.normalRange ?? test.text ?? "").trim() !== "";
  const hasName = stripHtmlPlain(test.Name || test.testName || "") !== "";

  if (hasName && !hasVal && !hasUnit && !hasRef) {
    const nextRow = siblingTests[index + 1];
    return !nextRow || isRowMultiParamChild(nextRow);
  }
  return false;
}

/**
 * Assigns stable deterministic selection keys to every category/panel and
 * test/parameter row in `report.CategoryAndTest` so selection round-trips
 * identically between `labreport.js` and every Report Format viewer.
 */
export function buildReportSelectionTree(report = {}, barcodeMeta = null) {
  const categories = Array.isArray(report?.CategoryAndTest) ? report.CategoryAndTest : [];
  const tree = [];
  const pkgIndex = new Map();

  // Map package memberships from getbarcodeTests metadata if available
  const metaObj = Array.isArray(barcodeMeta) ? barcodeMeta[0] : barcodeMeta;
  const packages = Array.isArray(metaObj?.packages) ? metaObj.packages : [];

  packages.forEach((pkg, pIdx) => {
    const pkgName = String(pkg?.packageName || "").trim();
    if (!pkgName) return;
    const pkgId = String(pkg._id || pkg.originalPackageId || `pkg_${pIdx}`);
    const testNames = new Set();
    const panelNames = new Set();
    (pkg.testIds || []).forEach((t) => {
      const n = normalizeSelText(t?.Name || t?.testName);
      if (n) testNames.add(n);
    });
    (pkg.pannelIds || []).forEach((pn) => {
      const n = normalizeSelText(pn?.name || pn?.panelName);
      if (n) panelNames.add(n);
    });
    pkgIndex.set(pkgId, {
      id: pkgId,
      name: pkgName,
      shortName: String(pkg?.Short_name || pkg?.shortName || pkgName).trim(),
      testNames,
      panelNames,
    });
  });

  const occCount = new Map();
  const nextUniqueKey = (prefix, rawLabel) => {
    const norm = normalizeSelText(rawLabel) || "item";
    const base = `${prefix}:${norm}`;
    const n = (occCount.get(base) || 0) + 1;
    occCount.set(base, n);
    return n > 1 ? `${base}#${n}` : base;
  };

  categories.forEach((cat, catIdx) => {
    if (!cat) return;
    const catName = String(cat.category || "").trim() || "Other";
    const panelTitle = String(cat.title || "").trim();
    const hasPanelTitle =
      Boolean(panelTitle) &&
      normalizeSelText(panelTitle) !== normalizeSelText(catName) &&
      !panelTitle.includes("Unknown Title");

    const sectionKey = nextUniqueKey(
      "sec",
      hasPanelTitle ? `${catName}::${panelTitle}` : catName
    );
    const displayTitle = hasPanelTitle ? panelTitle : catName;

    const rawTests = Array.isArray(cat.tests) ? cat.tests : [];
    const items = [];
    let currentGroupKey = null;

    rawTests.forEach((test, tIdx) => {
      if (!test) return;

      // Remark / details standalone objects (where testName === null) attach to preceding test
      if (!test.testName && !test.Name && !isRowDocumented(test)) {
        return;
      }

      if (isRowDocumented(test)) {
        currentGroupKey = null;
        const label = stripHtmlPlain(test.Name || test.testName || "Documented Report").slice(0, 65) || "Documented Test";
        const key = nextUniqueKey("doc", `${sectionKey}::${label}`);
        items.push({
          key,
          kind: "documented",
          catIdx,
          testIdx: tIdx,
          label,
          shortLabel: String(test.Short_name || test.shortName || label).trim(),
          parentKey: null,
        });
        return;
      }

      // Nested parameters array (rare JSON format in some imported reports)
      if (Array.isArray(test.parameters) && test.parameters.length > 1) {
        const gLabel = stripHtmlPlain(test.Name || test.testName || "Test Profile");
        const gKey = nextUniqueKey("grp", `${sectionKey}::${gLabel}`);
        items.push({
          key: gKey,
          kind: "group",
          catIdx,
          testIdx: tIdx,
          label: gLabel,
          shortLabel: String(test.Short_name || test.shortName || gLabel).trim(),
          parentKey: null,
        });
        test.parameters.forEach((p, pIdx) => {
          const pLabel = stripHtmlPlain(p.Para_name || p.parameterName || p.name || `Parameter ${pIdx + 1}`);
          const pKey = nextUniqueKey("param", `${gKey}::${pLabel}`);
          items.push({
            key: pKey,
            kind: "param",
            catIdx,
            testIdx: tIdx,
            paramIdx: pIdx,
            label: pLabel,
            shortLabel: pLabel,
            parentKey: gKey,
          });
        });
        currentGroupKey = null;
        return;
      }

      const rawLabel = stripHtmlPlain(test.Name || test.testName || "");
      if (!rawLabel) return;

      if (isRowPureHeading(test, rawTests, tIdx)) {
        const gKey = nextUniqueKey("grp", `${sectionKey}::${rawLabel}`);
        currentGroupKey = gKey;
        items.push({
          key: gKey,
          kind: "group",
          catIdx,
          testIdx: tIdx,
          label: rawLabel,
          shortLabel: String(test.Short_name || test.shortName || rawLabel).trim(),
          parentKey: null,
        });
        return;
      }

      if (isRowMultiParamChild(test)) {
        const pKey = nextUniqueKey("param", `${currentGroupKey || sectionKey}::${rawLabel}`);
        items.push({
          key: pKey,
          kind: "param",
          catIdx,
          testIdx: tIdx,
          label: rawLabel,
          shortLabel: rawLabel,
          parentKey: currentGroupKey,
        });
        return;
      }

      currentGroupKey = null;
      const tKey = nextUniqueKey("test", `${sectionKey}::${rawLabel}`);
      items.push({
        key: tKey,
        kind: "test",
        catIdx,
        testIdx: tIdx,
        label: rawLabel,
        shortLabel: String(test.Short_name || test.shortName || rawLabel).trim(),
        parentKey: null,
      });
    });

    const matchedPackageIds = [];
    const normSectionPanel = normalizeSelText(panelTitle || catName);
    pkgIndex.forEach((pkg, pkgId) => {
      if (hasPanelTitle && pkg.panelNames.has(normSectionPanel)) {
        matchedPackageIds.push(pkgId);
      }
    });

    tree.push({
      sectionKey,
      catIdx,
      categoryName: catName,
      panelTitle: hasPanelTitle ? panelTitle : "",
      displayTitle,
      isPanel: hasPanelTitle,
      matchedPackageIds,
      items,
    });
  });

  // Attach package match hints at item level too (for single tests inside packages)
  tree.forEach((sec) => {
    sec.items.forEach((item) => {
      if (sec.matchedPackageIds.length) {
        item.packageIds = [...sec.matchedPackageIds];
        return;
      }
      const normLabel = normalizeSelText(item.label);
      const itemPkgs = [];
      pkgIndex.forEach((pkg, pkgId) => {
        if (pkg.testNames.has(normLabel)) itemPkgs.push(pkgId);
      });
      item.packageIds = itemPkgs;
    });
  });

  return {
    sections: tree,
    packages: Array.from(pkgIndex.values()).map((p) => ({
      id: p.id,
      name: p.name,
      shortName: p.shortName,
    })),
  };
}

/**
 * Produces a filtered shallow/deep clone of `fullReport` containing ONLY the items
 * selected in `manifest`, updating `uniquetestArray`, `investigationShortNames`, and
 * `selectiveMeta` while leaving `fullReport` 100% untouched.
 */
export function filterReportBySelection(fullReport, manifest, barcodeMeta = null) {
  if (!fullReport || typeof fullReport !== "object") return fullReport;
  if (!manifest || manifest.mode !== "selected" || manifest.allSelected) {
    return fullReport;
  }

  const tree = buildReportSelectionTree(fullReport, barcodeMeta);
  const selectedItemKeys = new Set(Array.isArray(manifest.selectedItemKeys) ? manifest.selectedItemKeys : []);
  const selectedSectionKeys = new Set(Array.isArray(manifest.selectedSectionKeys) ? manifest.selectedSectionKeys : []);
  const selectedLabels = new Set(
    (Array.isArray(manifest.selectedLabels) ? manifest.selectedLabels : [])
      .map(normalizeSelText)
      .filter(Boolean)
  );
  const selectedPanelNames = new Set(
    (Array.isArray(manifest.selectedPanelNames) ? manifest.selectedPanelNames : [])
      .map(normalizeSelText)
      .filter(Boolean)
  );

  const isKeyMatch = (item, sec) => {
    if (selectedItemKeys.has(item.key)) return true;
    if (selectedSectionKeys.has(sec.sectionKey)) return true;
    const normSecPanel = normalizeSelText(sec.panelTitle);
    if (normSecPanel && selectedPanelNames.has(normSecPanel)) return true;
    const normItemLabel = normalizeSelText(item.label);
    if (normItemLabel && selectedLabels.has(normItemLabel)) return true;
    return false;
  };

  const filteredCategories = [];
  const includedInvestigations = [];
  const seenInvest = new Set();
  const pushInvest = (raw) => {
    const clean = String(raw ?? "").trim();
    const norm = normalizeSelText(clean);
    if (clean && norm && !seenInvest.has(norm)) {
      seenInvest.add(norm);
      includedInvestigations.push(clean);
    }
  };

  const rawCategories = Array.isArray(fullReport.CategoryAndTest) ? fullReport.CategoryAndTest : [];

  tree.sections.forEach((sec) => {
    const rawCat = rawCategories[sec.catIdx];
    if (!rawCat) return;
    const rawTests = Array.isArray(rawCat.tests) ? rawCat.tests : [];

    // Decide which logical items in this section are kept
    const keptTestIndices = new Set();
    const itemByKey = new Map(sec.items.map((it) => [it.key, it]));
    const childrenByGroup = new Map();

    sec.items.forEach((it) => {
      if (it.kind === "param" && it.parentKey) {
        if (!childrenByGroup.has(it.parentKey)) childrenByGroup.set(it.parentKey, []);
        childrenByGroup.get(it.parentKey).push(it);
      }
    });

    let sectionIncludedAnyItem = false;

    sec.items.forEach((it) => {
      if (it.kind === "group") {
        const children = childrenByGroup.get(it.key) || [];
        const groupExplicit = isKeyMatch(it, sec);
        const keptChildren = children.filter((ch) => groupExplicit || isKeyMatch(ch, sec));
        if (keptChildren.length > 0 || (children.length === 0 && groupExplicit)) {
          keptTestIndices.add(it.testIdx);
          keptChildren.forEach((ch) => keptTestIndices.add(ch.testIdx));
          sectionIncludedAnyItem = true;
          if (!sec.isPanel) {
            pushInvest(it.shortLabel || it.label);
          }
        }
        return;
      }

      if (it.kind === "param") {
        if (it.parentKey && itemByKey.has(it.parentKey)) {
          // Handled cleanly under parent group above so multi-param header stays attached
          return;
        }
        if (isKeyMatch(it, sec)) {
          keptTestIndices.add(it.testIdx);
          sectionIncludedAnyItem = true;
          if (!sec.isPanel) pushInvest(it.shortLabel || it.label);
        }
        return;
      }

      if (isKeyMatch(it, sec)) {
        keptTestIndices.add(it.testIdx);
        sectionIncludedAnyItem = true;
        if (!sec.isPanel) {
          pushInvest(it.shortLabel || it.label);
        }
      }
    });

    if (!sectionIncludedAnyItem) {
      return;
    }

    if (sec.isPanel) {
      pushInvest(sec.panelTitle);
    }

    // Build filtered tests array while preserving trailing standalone remark/details attached to kept rows
    // and handling nested `test.parameters` arrays if present.
    const nextTests = [];
    let lastPrecedingRowWasKept = false;

    rawTests.forEach((rawTest, tIdx) => {
      if (!rawTest) return;

      // Trailing remark / details row (`testName === null`) belongs to previous test row
      if (!rawTest.testName && !rawTest.Name && !isRowDocumented(rawTest)) {
        if (lastPrecedingRowWasKept) {
          nextTests.push({ ...rawTest });
        }
        return;
      }

      if (!keptTestIndices.has(tIdx)) {
        lastPrecedingRowWasKept = false;
        return;
      }

      lastPrecedingRowWasKept = true;

      if (Array.isArray(rawTest.parameters) && rawTest.parameters.length > 1) {
        const gItem = sec.items.find((it) => it.kind === "group" && it.testIdx === tIdx);
        const groupExplicit = gItem ? isKeyMatch(gItem, sec) : false;
        const paramItems = gItem ? (childrenByGroup.get(gItem.key) || []) : [];
        const keptParams = rawTest.parameters.filter((p, pIdx) => {
          if (groupExplicit) return true;
          const pItem = paramItems.find((pi) => pi.paramIdx === pIdx);
          return pItem ? isKeyMatch(pItem, sec) : true;
        });
        nextTests.push({ ...rawTest, parameters: keptParams.map((p) => ({ ...p })) });
        return;
      }

      nextTests.push({ ...rawTest });
    });

    if (nextTests.length > 0) {
      filteredCategories.push({
        ...rawCat,
        tests: nextTests,
      });
    }
  });

  // Preserve package short names in header if an entire package is selected
  (tree.packages || []).forEach((pkg) => {
    const pkgSectionsAndItems = [];
    tree.sections.forEach((sec) => {
      sec.items.forEach((it) => {
        if (Array.isArray(it.packageIds) && it.packageIds.includes(pkg.id)) {
          pkgSectionsAndItems.push({ sec, it });
        }
      });
    });
    if (
      pkgSectionsAndItems.length > 0 &&
      pkgSectionsAndItems.every(({ sec, it }) => isKeyMatch(it, sec))
    ) {
      // Package was selected completely — prefer concise package display alongside or as needed
      // Only prepend if package list explicitly opted in; individual selected tests/panels are already exact.
    }
  });

  const keepMoreDetails = manifest.includeMoreDetails !== false && filteredCategories.length > 0;

  return {
    ...fullReport,
    CategoryAndTest: filteredCategories,
    uniquetestArray: includedInvestigations,
    investigationShortNames: includedInvestigations,
    MoreDetails: keepMoreDetails ? fullReport.MoreDetails : "",
    isSelectiveReport: true,
    selectiveSummary: {
      selectedCount: includedInvestigations.length,
      selectedLabels: includedInvestigations,
      manifestId: manifest.id || "",
    },
  };
}

export function generateSelectiveManifestKey(reportOrBookingId = "report") {
  const safe = String(reportOrBookingId || "report").replace(/[^a-zA-Z0-9_-]/g, "");
  return `${safe}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function saveSelectionManifest(manifestKey, manifest) {
  if (!manifestKey || !manifest || typeof window === "undefined") return false;
  const serialized = JSON.stringify(manifest);
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${manifestKey}`, serialized);
  } catch { /* ignore */ }
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${manifestKey}`, serialized);
  } catch { /* ignore */ }
  return true;
}

export function loadSelectionManifest(manifestKey) {
  if (!manifestKey || typeof window === "undefined") return null;
  const fullKey = `${STORAGE_PREFIX}${manifestKey}`;
  try {
    const raw = sessionStorage.getItem(fullKey) || localStorage.getItem(fullKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSelectionManifest(manifestKey) {
  if (!manifestKey || typeof window === "undefined") return;
  const fullKey = `${STORAGE_PREFIX}${manifestKey}`;
  try { sessionStorage.removeItem(fullKey); } catch { /* ignore */ }
  try { localStorage.removeItem(fullKey); } catch { /* ignore */ }
}
