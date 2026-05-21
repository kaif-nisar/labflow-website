import mongoose from "mongoose";
import { doctors } from "../models/doctor.model.js";
import { DoctorRateCard } from "../models/doctorRateCard.model.js";
import { BookingQuickGroup } from "../models/bookingQuickGroup.model.js";
import { testSchema } from "../models/newTest.model.js";
import { addPannel } from "../models/AddPannel.model.js";
import { Package } from "../models/addPackage.model.js";
import { ensureBookingCodesForScope } from "./bookingCode.js";

const SELF_DOCTOR_DOB = new Date("2000-01-01T00:00:00.000Z");

const BOOKING_ITEM_MODEL_BY_TYPE = {
  test: testSchema,
  panel: addPannel,
  package: Package,
};

const BOOKING_ITEM_COLLECTION_BY_TYPE = {
  test: "testSchema",
  panel: "addPannel",
  package: "Package",
};

const BOOKING_ITEM_TYPE_BY_COLLECTION = {
  testSchema: "test",
  addPannel: "panel",
  Package: "package",
};

const DEFAULT_SELF_DOCTOR = {
  displayName: "Self",
  firstName: "Self",
  lastName: "Doctor",
  specialization: "Walk-in / Default",
  DOB: SELF_DOCTOR_DOB,
  gender: "other",
  remarks: "System default doctor for walk-in bookings",
};

const toStringId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (typeof value === "object" && value._id) return toStringId(value._id);
  return String(value);
};

const toObjectIdOrNull = (value) => {
  const normalized = toStringId(value);
  if (!normalized || !mongoose.Types.ObjectId.isValid(normalized)) {
    return null;
  }

  return new mongoose.Types.ObjectId(normalized);
};

const uniqueStrings = (items = []) => [...new Set(items.filter(Boolean))];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getActorOwnerId = (req) => (
  req.user?.role === "staff" ? req.user.parentUser : req.user?._id
);

const getTenantIdFromReq = (req) => {
  const tenantId = req.user?.tenantId?._id || req.user?.tenantId;
  const normalized = toObjectIdOrNull(tenantId);

  if (!normalized) {
    throw new Error("Tenant context is missing");
  }

  return normalized;
};

const isAdminCatalogContext = (req) => (
  req.user?.role === "admin" ||
  (req.user?.role === "staff" && req.user?.parentRole === "admin")
);

const getAssignedPriceForUser = (doc, bookingUserId) => {
  const bookingUserKey = toStringId(bookingUserId);
  if (!bookingUserKey) return null;

  return doc.assignedPrices?.find(
    (entry) => toStringId(entry?.userId) === bookingUserKey
  ) || null;
};

const getDocumentNameByType = (doc, itemType) => {
  if (itemType === "test") return doc.Name || "";
  if (itemType === "panel") return doc.name || "";
  return doc.packageName || "";
};

const getDocumentShortNameByType = (doc, itemType) => {
  if (itemType === "test") return doc.Short_name || "";
  return "";
};

const getDocumentSampleTypesByType = (doc, itemType) => {
  if (itemType === "test") {
    return uniqueStrings([doc.sampleType]);
  }

  if (itemType === "panel") {
    return uniqueStrings(doc.sample_types || []);
  }

  return uniqueStrings([...(doc.testSample || []), ...(doc.pannelSample || [])]);
};

const getDocumentBookingCodeByType = (doc, itemType) => {
  if (itemType === "test" || itemType === "panel" || itemType === "package") {
    if (Number.isFinite(Number(doc.bookingCode))) {
      return Number(doc.bookingCode);
    }

    return Number.isFinite(Number(doc.order)) ? Number(doc.order) : null;
  }

  return null;
};

const getBasePriceByType = (doc, itemType) => {
  if (itemType === "test") return toNumber(doc.Price);
  if (itemType === "panel") return toNumber(doc.price);
  return toNumber(doc.packageFee);
};

const getMrpPriceByType = (doc, itemType) => {
  if (itemType === "test") return toNumber(doc.final_price);
  if (itemType === "panel") return toNumber(doc.final_price);
  return toNumber(doc.final_price);
};

const serializeCatalogDocument = ({ doc, itemType, bookingUserId, req }) => {
  const isAdminContext = isAdminCatalogContext(req);
  const assignedPrice = !isAdminContext
    ? getAssignedPriceForUser(doc, bookingUserId)
    : null;

  if (!isAdminContext && !assignedPrice) {
    return null;
  }

  const basePrice = isAdminContext
    ? getBasePriceByType(doc, itemType)
    : toNumber(assignedPrice?.price);

  return {
    itemId: toStringId(doc._id),
    itemType,
    collectionName: BOOKING_ITEM_COLLECTION_BY_TYPE[itemType],
    itemName: getDocumentNameByType(doc, itemType),
    shortName: getDocumentShortNameByType(doc, itemType),
    bookingCode: getDocumentBookingCodeByType(doc, itemType),
    sampleTypes: getDocumentSampleTypesByType(doc, itemType),
    basePrice,
    mrpPrice: getMrpPriceByType(doc, itemType),
    catalogPrice: getBasePriceByType(doc, itemType),
  };
};

const buildCatalogKey = (itemType, itemId) => (
  `${normalizeBookingItemType(itemType)}:${toStringId(itemId)}`
);

const normalizeBookingItemType = (value) => {
  if (!value) return null;

  const normalized = String(value).trim().toLowerCase();

  if (normalized === "test" || normalized === "testschema") return "test";
  if (normalized === "panel" || normalized === "panels" || normalized === "pannel" || normalized === "addpannel") {
    return "panel";
  }
  if (normalized === "package" || normalized === "packages") return "package";
  if (BOOKING_ITEM_TYPE_BY_COLLECTION[value]) return BOOKING_ITEM_TYPE_BY_COLLECTION[value];

  return null;
};

const ensureValidDoctorFilter = (tenantId, ownerId, doctorId) => ({
  _id: doctorId,
  tenantId,
  createdBy: ownerId,
});

const getDoctorDisplayName = (doctor) => {
  if (!doctor) return "";
  if (doctor.displayName?.trim()) return doctor.displayName.trim();
  return `${doctor.firstName || ""} ${doctor.lastName || ""}`.trim();
};

/**
 * Ensure doctor has all required fields with defaults
 */
const sanitizeDoctorFields = (doctor) => {
  if (!doctor) return doctor;

  const doctorObj = doctor.toObject ? doctor.toObject() : doctor;

  // Ensure system default doctors have proper values
  if (doctorObj.isSystemDefault) {
    if (!String(doctorObj.firstName || "").trim()) {
      doctorObj.firstName = DEFAULT_SELF_DOCTOR.firstName;
    }
    if (!String(doctorObj.lastName || "").trim()) {
      doctorObj.lastName = DEFAULT_SELF_DOCTOR.lastName;
    }
    if (!String(doctorObj.specialization || "").trim()) {
      doctorObj.specialization = DEFAULT_SELF_DOCTOR.specialization;
    }
    if (!doctorObj.gender || !["male", "female", "other"].includes(String(doctorObj.gender).toLowerCase())) {
      doctorObj.gender = DEFAULT_SELF_DOCTOR.gender;
    }
  } else {
    // For regular doctors, provide sensible defaults if fields are missing
    if (!String(doctorObj.firstName || "").trim()) {
      doctorObj.firstName = doctorObj.displayName?.split(' ')?.[0] || "Doctor";
    }
    if (!String(doctorObj.lastName || "").trim()) {
      doctorObj.lastName = doctorObj.displayName?.split(' ')?.[1] || "Self";
    }
    if (!String(doctorObj.specialization || "").trim()) {
      doctorObj.specialization = "General";
    }
    if (!doctorObj.gender || !["male", "female", "other"].includes(String(doctorObj.gender).toLowerCase())) {
      doctorObj.gender = "other";
    }
  }

  return doctorObj;
};


const ensureSelfDoctorForUser = async ({ tenantId, ownerId }) => {
  const existing = await doctors.findOne({
    tenantId,
    createdBy: ownerId,
    isSystemDefault: true,
  });

  if (existing) {
    const patch = {};

    if (!String(existing.displayName || "").trim()) patch.displayName = DEFAULT_SELF_DOCTOR.displayName;
    if (!String(existing.firstName || "").trim()) patch.firstName = DEFAULT_SELF_DOCTOR.firstName;
    if (!String(existing.lastName || "").trim()) patch.lastName = DEFAULT_SELF_DOCTOR.lastName;
    if (!String(existing.specialization || "").trim()) patch.specialization = DEFAULT_SELF_DOCTOR.specialization;
    if (!existing.DOB) patch.DOB = DEFAULT_SELF_DOCTOR.DOB;
    if (!["male", "female", "other"].includes(String(existing.gender || "").toLowerCase())) {
      patch.gender = DEFAULT_SELF_DOCTOR.gender;
    }
    if (typeof existing.remarks !== "string") patch.remarks = DEFAULT_SELF_DOCTOR.remarks;

    if (Object.keys(patch).length > 0) {
      await doctors.updateOne({ _id: existing._id }, { $set: patch });
      Object.assign(existing, patch);
    }

    return sanitizeDoctorFields(existing);
  }

  const newDoctor = await doctors.create({
    ...DEFAULT_SELF_DOCTOR,
    tenantId,
    createdBy: ownerId,
    isSystemDefault: true,
  });

  return sanitizeDoctorFields(newDoctor);
};

const resolveBookingDoctor = async ({ req, doctorId }) => {
  const tenantId = getTenantIdFromReq(req);
  const ownerId = toObjectIdOrNull(getActorOwnerId(req));

  if (!ownerId) {
    throw new Error("Owner context is missing");
  }

  const selfDoctor = await ensureSelfDoctorForUser({ tenantId, ownerId });
  const requestedDoctorId = toObjectIdOrNull(doctorId);

  if (!requestedDoctorId || toStringId(requestedDoctorId) === toStringId(selfDoctor._id)) {
    return {
      doctor: selfDoctor,
      selfDoctor,
      isSelfDoctor: true,
    };
  }

  const doctor = await doctors.findOne(
    ensureValidDoctorFilter(tenantId, ownerId, requestedDoctorId)
  );

  if (!doctor) {
    throw new Error("Selected doctor was not found");
  }

  return {
    doctor: sanitizeDoctorFields(doctor),
    selfDoctor,
    isSelfDoctor: false,
  };
};

const fetchCatalogDocuments = async ({ req, bookingUserId, itemIdsByType = null }) => {
  const tenantId = getTenantIdFromReq(req);
  const isAdminContext = isAdminCatalogContext(req);
  const normalizedBookingUserId = toObjectIdOrNull(bookingUserId) || toObjectIdOrNull(getActorOwnerId(req));
  const idFilter = itemIdsByType || {};

  await ensureBookingCodesForScope({ tenantId });

  const buildQuery = (type) => {
    const query = { tenantId };

    if (!isAdminContext && normalizedBookingUserId) {
      query["assignedPrices.userId"] = normalizedBookingUserId;
    }

    const ids = idFilter[type] || [];
    if (ids.length > 0) {
      query._id = { $in: ids };
    }

    return query;
  };

  const [tests, panels, packages] = await Promise.all([
    testSchema.find(buildQuery("test")).sort({ Name: 1 }),
    addPannel.find(buildQuery("panel")).sort({ name: 1 }),
    Package.find(buildQuery("package")).sort({ packageName: 1 }),
  ]);

  return {
    tests,
    panels,
    packages,
    bookingUserId: normalizedBookingUserId,
  };
};

const buildBaseBookingCatalog = async ({ req, bookingUserId }) => {
  const { tests, panels, packages, bookingUserId: resolvedBookingUserId } =
    await fetchCatalogDocuments({ req, bookingUserId });

  return {
    tests: tests
      .map((doc) => serializeCatalogDocument({ doc, itemType: "test", bookingUserId: resolvedBookingUserId, req }))
      .filter(Boolean),
    panels: panels
      .map((doc) => serializeCatalogDocument({ doc, itemType: "panel", bookingUserId: resolvedBookingUserId, req }))
      .filter(Boolean),
    packages: packages
      .map((doc) => serializeCatalogDocument({ doc, itemType: "package", bookingUserId: resolvedBookingUserId, req }))
      .filter(Boolean),
  };
};

const getDoctorRateCardEntries = async ({ tenantId, doctorId }) => {
  if (!doctorId) return [];

  return DoctorRateCard.find({
    tenantId,
    doctorId,
  }).lean();
};

const createDoctorRateMap = (entries = []) => {
  const rateMap = new Map();
  entries.forEach((entry) => {
    rateMap.set(buildCatalogKey(entry.itemType, entry.itemId), {
      ...entry,
      price: toNumber(entry.price),
    });
  });
  return rateMap;
};

const applyDoctorPricingToCatalog = ({ catalog, rateEntries = [], isSelfDoctor }) => {
  const rateMap = createDoctorRateMap(rateEntries);

  const applyItems = (items = []) => items
    .map((item) => {
      const rateEntry = rateMap.get(buildCatalogKey(item.itemType, item.itemId));

      if (isSelfDoctor) {
        return {
          ...item,
          price: item.basePrice,
          rateSource: "self",
          isDoctorPriced: false,
        };
      }

      if (!rateEntry) {
        return {
          ...item,
          price: item.basePrice,
          rateSource: "catalog-default",
          isDoctorPriced: false,
        };
      }

      return {
        ...item,
        price: rateEntry.price,
        rateSource: "doctor-rate-card",
        isDoctorPriced: true,
      };
    })
    .filter(Boolean);

  return {
    tests: applyItems(catalog.tests),
    panels: applyItems(catalog.panels),
    packages: applyItems(catalog.packages),
  };
};

const flattenBookingCatalog = (catalog) => [
  ...(catalog.tests || []),
  ...(catalog.panels || []),
  ...(catalog.packages || []),
];

const buildCatalogLookup = (catalog) => {
  const map = new Map();

  flattenBookingCatalog(catalog).forEach((item) => {
    map.set(buildCatalogKey(item.itemType, item.itemId), item);
  });

  return map;
};

const getAvailableGroupsForDoctor = async ({ tenantId, doctorId, catalogLookup }) => {
  const groups = await BookingQuickGroup.find({
    tenantId,
    isActive: true,
  })
    .sort({ updatedAt: -1, name: 1 })
    .lean();

  return groups
    .map((group) => {
      const visibleItems = (group.items || [])
        .map((item) => catalogLookup.get(buildCatalogKey(item.itemType, item.itemId)))
        .filter(Boolean);

      if (visibleItems.length === 0) {
        return null;
      }

      return {
        ...group,
        scope: "common",
        doctorId: null,
        itemCount: visibleItems.length,
        items: visibleItems,
      };
    })
    .filter(Boolean);
};

const normalizeSelectedItems = (selectedItems = [], fallbackIds = []) => {
  if (Array.isArray(selectedItems) && selectedItems.length > 0) {
    const map = new Map();

    selectedItems.forEach((item) => {
      const itemType = normalizeBookingItemType(item?.itemType || item?.collectionName);
      const itemId = toStringId(item?.itemId || item?.id);

      if (!itemType || !itemId) return;

      map.set(buildCatalogKey(itemType, itemId), {
        itemType,
        itemId,
        selectedViaGroupId: item?.selectedViaGroupId || null,
        selectedViaGroupName: item?.selectedViaGroupName || "",
      });
    });

    return Array.from(map.values());
  }

  if (!Array.isArray(fallbackIds)) {
    return [];
  }

  return [...new Set(fallbackIds.map((item) => toStringId(item)).filter(Boolean))].map((itemId) => ({
    itemType: null,
    itemId,
  }));
};

const fetchCatalogItemsForSelection = async ({ req, bookingUserId, normalizedItems }) => {
  const idsByType = {
    test: [],
    panel: [],
    package: [],
  };

  normalizedItems.forEach((item) => {
    if (item.itemType) {
      const objectId = toObjectIdOrNull(item.itemId);
      if (objectId) {
        idsByType[item.itemType].push(objectId);
      }
    }
  });

  if (idsByType.test.length || idsByType.panel.length || idsByType.package.length) {
    const catalog = await fetchCatalogDocuments({
      req,
      bookingUserId,
      itemIdsByType: idsByType,
    });

    return {
      tests: catalog.tests.map((doc) =>
        serializeCatalogDocument({ doc, itemType: "test", bookingUserId: catalog.bookingUserId, req })
      ).filter(Boolean),
      panels: catalog.panels.map((doc) =>
        serializeCatalogDocument({ doc, itemType: "panel", bookingUserId: catalog.bookingUserId, req })
      ).filter(Boolean),
      packages: catalog.packages.map((doc) =>
        serializeCatalogDocument({ doc, itemType: "package", bookingUserId: catalog.bookingUserId, req })
      ).filter(Boolean),
    };
  }

  const objectIds = normalizedItems
    .map((item) => toObjectIdOrNull(item.itemId))
    .filter(Boolean);

  if (objectIds.length === 0) {
    return { tests: [], panels: [], packages: [] };
  }

  const tenantId = getTenantIdFromReq(req);
  const [tests, panels, packages] = await Promise.all([
    testSchema.find({ tenantId, _id: { $in: objectIds } }),
    addPannel.find({ tenantId, _id: { $in: objectIds } }),
    Package.find({ tenantId, _id: { $in: objectIds } }),
  ]);

  return {
    tests: tests.map((doc) =>
      serializeCatalogDocument({ doc, itemType: "test", bookingUserId: getActorOwnerId(req), req })
    ).filter(Boolean),
    panels: panels.map((doc) =>
      serializeCatalogDocument({ doc, itemType: "panel", bookingUserId: getActorOwnerId(req), req })
    ).filter(Boolean),
    packages: packages.map((doc) =>
      serializeCatalogDocument({ doc, itemType: "package", bookingUserId: getActorOwnerId(req), req })
    ).filter(Boolean),
  };
};

const buildValidatedSelectionSnapshot = async ({
  req,
  bookingUserId,
  doctorId,
  selectedItems = [],
  fallbackIds = [],
}) => {
  const normalizedItems = normalizeSelectedItems(selectedItems, fallbackIds);

  if (normalizedItems.length === 0) {
    return [];
  }

  const { doctor, isSelfDoctor } = await resolveBookingDoctor({ req, doctorId });
  const tenantId = getTenantIdFromReq(req);
  const baseCatalog = await fetchCatalogItemsForSelection({
    req,
    bookingUserId,
    normalizedItems,
  });
  const rateEntries = isSelfDoctor
    ? []
    : await getDoctorRateCardEntries({ tenantId, doctorId: doctor._id });
  const effectiveCatalog = applyDoctorPricingToCatalog({
    catalog: baseCatalog,
    rateEntries,
    isSelfDoctor,
  });
  const catalogLookup = buildCatalogLookup(effectiveCatalog);

  const snapshots = normalizedItems.map((item) => {
    let resolvedItem = null;

    if (item.itemType) {
      resolvedItem = catalogLookup.get(buildCatalogKey(item.itemType, item.itemId));
    } else {
      resolvedItem = Array.from(catalogLookup.values()).find(
        (catalogItem) => catalogItem.itemId === item.itemId
      ) || null;
    }

    if (!resolvedItem) {
      throw new Error("One or more selected items are not available for the chosen doctor");
    }

    return {
      itemId: toObjectIdOrNull(resolvedItem.itemId),
      itemType: resolvedItem.itemType,
      itemName: resolvedItem.itemName,
      shortName: resolvedItem.shortName || "",
      sampleTypes: resolvedItem.sampleTypes || [],
      price: toNumber(resolvedItem.price),
      basePrice: toNumber(resolvedItem.basePrice),
      mrpPrice: toNumber(resolvedItem.mrpPrice),
      rateSource: resolvedItem.rateSource,
      selectedViaGroupId: toObjectIdOrNull(item.selectedViaGroupId),
      selectedViaGroupName: item.selectedViaGroupName || "",
    };
  });

  return {
    doctor,
    isSelfDoctor,
    selectedItems: snapshots,
    total: snapshots.reduce((sum, item) => sum + toNumber(item.price), 0),
  };
};

export {
  BOOKING_ITEM_COLLECTION_BY_TYPE,
  BOOKING_ITEM_MODEL_BY_TYPE,
  BOOKING_ITEM_TYPE_BY_COLLECTION,
  BookingQuickGroup,
  DoctorRateCard,
  applyDoctorPricingToCatalog,
  buildBaseBookingCatalog,
  buildCatalogKey,
  buildCatalogLookup,
  buildValidatedSelectionSnapshot,
  createDoctorRateMap,
  ensureSelfDoctorForUser,
  fetchCatalogDocuments,
  getActorOwnerId,
  getAvailableGroupsForDoctor,
  getDoctorDisplayName,
  getDoctorRateCardEntries,
  getTenantIdFromReq,
  normalizeBookingItemType,
  resolveBookingDoctor,
  sanitizeDoctorFields,
  toNumber,
  toObjectIdOrNull,
  toStringId,
};
