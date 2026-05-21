import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  BOOKING_ITEM_MODEL_BY_TYPE,
  applyDoctorPricingToCatalog,
  buildBaseBookingCatalog,
  buildCatalogKey,
  buildCatalogLookup,
  createDoctorRateMap,
  ensureSelfDoctorForUser,
  getActorOwnerId,
  getAvailableGroupsForDoctor,
  getDoctorDisplayName,
  getDoctorRateCardEntries,
  getTenantIdFromReq,
  normalizeBookingItemType,
  resolveBookingDoctor,
  toNumber,
  toObjectIdOrNull,
  toStringId,
} from "../utils/doctorPricing.js";
import { DoctorRateCard } from "../models/doctorRateCard.model.js";
import { BookingQuickGroup } from "../models/bookingQuickGroup.model.js";
import { doctors } from "../models/doctor.model.js";

const formatDoctorSummary = (doctor) => ({
  _id: doctor._id,
  displayName: getDoctorDisplayName(doctor),
  isSystemDefault: !!doctor.isSystemDefault,
});

const getDefaultBookingUserId = (req) => getActorOwnerId(req);

const buildRateCardCatalogItems = ({ catalog, rateEntries, isSelfDoctor }) => {
  const rateMap = createDoctorRateMap(rateEntries);

  return [
    ...(catalog.tests || []),
    ...(catalog.panels || []),
    ...(catalog.packages || []),
  ]
    .map((item) => {
      const rateEntry = rateMap.get(buildCatalogKey(item.itemType, item.itemId));

      return {
        ...item,
        doctorPrice: isSelfDoctor ? item.basePrice : rateEntry?.price ?? null,
        hasDoctorPrice: isSelfDoctor ? true : Boolean(rateEntry),
      };
    })
    .sort((left, right) => left.itemName.localeCompare(right.itemName));
};

const normalizeRateCardPayload = (items = []) => {
  const normalizedMap = new Map();

  items.forEach((item) => {
    const itemType = normalizeBookingItemType(item?.itemType);
    const itemId = toObjectIdOrNull(item?.itemId);
    const price = toNumber(item?.price);

    if (!itemType || !itemId) {
      return;
    }

    normalizedMap.set(buildCatalogKey(itemType, itemId), {
      itemType,
      itemId,
      price,
    });
  });

  return Array.from(normalizedMap.values());
};

const fetchExistingCatalogItems = async ({ tenantId, items }) => {
  const validationChecks = await Promise.all(
    items.map(async (item) => {
      const model = BOOKING_ITEM_MODEL_BY_TYPE[item.itemType];
      const doc = await model.findOne({
        _id: item.itemId,
        tenantId,
      }).select("_id");

      if (!doc) {
        throw new ApiError(404, `Catalog item not found for ${item.itemType}`);
      }

      return item;
    })
  );

  return validationChecks;
};

const upsertDoctorRateCardEntries = async ({
  tenantId,
  doctorId,
  ownerId,
  items,
  replaceAll = true,
}) => {
  const normalizedItems = normalizeRateCardPayload(items);
  const currentEntries = await DoctorRateCard.find({
    tenantId,
    doctorId,
  }).lean();
  const keepKeys = new Set(
    normalizedItems.map((item) => buildCatalogKey(item.itemType, item.itemId))
  );

  const bulkOperations = normalizedItems.map((item) => ({
    updateOne: {
      filter: {
        tenantId,
        doctorId,
        itemType: item.itemType,
        itemId: item.itemId,
      },
      update: {
        $set: {
          price: item.price,
          updatedBy: ownerId,
        },
        $setOnInsert: {
          createdBy: ownerId,
        },
      },
      upsert: true,
    },
  }));

  if (replaceAll) {
    const removableEntryIds = currentEntries
      .filter((entry) => !keepKeys.has(buildCatalogKey(entry.itemType, entry.itemId)))
      .map((entry) => entry._id);

    if (removableEntryIds.length > 0) {
      bulkOperations.push({
        deleteMany: {
          filter: {
            _id: { $in: removableEntryIds },
          },
        },
      });
    }
  }

  if (bulkOperations.length === 0 && replaceAll) {
    await DoctorRateCard.deleteMany({ tenantId, doctorId });
    return 0;
  }

  if (bulkOperations.length > 0) {
    await DoctorRateCard.bulkWrite(bulkOperations, { ordered: false });
  }

  return normalizedItems.length;
};

const resolveGroupItems = async ({ req, items }) => {
  const incomingItems = Array.isArray(items) ? items : [];
  if (incomingItems.length === 0) {
    return [];
  }

  const catalog = await buildBaseBookingCatalog({
    req,
    bookingUserId: getDefaultBookingUserId(req),
  });
  const catalogLookup = buildCatalogLookup(catalog);
  const normalizedItems = [];
  const seen = new Set();

  incomingItems.forEach((item) => {
    const itemType = normalizeBookingItemType(item?.itemType);
    const itemId = toStringId(item?.itemId);
    if (!itemType || !itemId) return;

    const lookupItem = catalogLookup.get(buildCatalogKey(itemType, itemId));
    if (!lookupItem) return;

    const key = buildCatalogKey(itemType, itemId);
    if (seen.has(key)) return;

    seen.add(key);
    normalizedItems.push({
      itemType,
      itemId: toObjectIdOrNull(itemId),
      itemName: lookupItem.itemName,
      sampleTypes: lookupItem.sampleTypes || [],
    });
  });

  return normalizedItems;
};

const getDoctorBookingCatalogController = asyncHandler(async (req, res) => {
  const bookingUserId = req.query.bookingUserId || getDefaultBookingUserId(req);
  const { doctor, selfDoctor, isSelfDoctor } = await resolveBookingDoctor({
    req,
    doctorId: req.query.doctorId,
  });
  const tenantId = getTenantIdFromReq(req);
  const baseCatalog = await buildBaseBookingCatalog({
    req,
    bookingUserId,
  });
  const rateEntries = isSelfDoctor
    ? []
    : await getDoctorRateCardEntries({
        tenantId,
        doctorId: doctor._id,
      });
  const effectiveCatalog = applyDoctorPricingToCatalog({
    catalog: baseCatalog,
    rateEntries,
    isSelfDoctor,
  });
  const catalogLookup = buildCatalogLookup(effectiveCatalog);
  const groups = await getAvailableGroupsForDoctor({
    tenantId,
    doctorId: doctor._id,
    catalogLookup,
  });

  return res.status(200).json({
    success: true,
    selectedDoctor: formatDoctorSummary(doctor),
    selfDoctorId: selfDoctor._id,
    catalog: effectiveCatalog,
    groups,
  });
});

const getDoctorRateCardController = asyncHandler(async (req, res) => {
  const { doctor, selfDoctor, isSelfDoctor } = await resolveBookingDoctor({
    req,
    doctorId: req.params.doctorId,
  });
  const tenantId = getTenantIdFromReq(req);
  const baseCatalog = await buildBaseBookingCatalog({
    req,
    bookingUserId: getDefaultBookingUserId(req),
  });
  const rateEntries = isSelfDoctor
    ? []
    : await getDoctorRateCardEntries({
        tenantId,
        doctorId: doctor._id,
      });

  return res.status(200).json({
    success: true,
    doctor: formatDoctorSummary(doctor),
    selfDoctorId: selfDoctor._id,
    items: buildRateCardCatalogItems({
      catalog: baseCatalog,
      rateEntries,
      isSelfDoctor,
    }),
  });
});

const saveDoctorRateCardController = asyncHandler(async (req, res) => {
  const { doctor, isSelfDoctor } = await resolveBookingDoctor({
    req,
    doctorId: req.params.doctorId,
  });

  if (isSelfDoctor) {
    throw new ApiError(400, "Self doctor always uses current catalog prices");
  }

  const tenantId = getTenantIdFromReq(req);
  const ownerId = toObjectIdOrNull(getActorOwnerId(req));
  const replaceAll = req.body.replaceAll !== false;
  const normalizedItems = normalizeRateCardPayload(req.body.items || []);

  await fetchExistingCatalogItems({
    tenantId,
    items: normalizedItems,
  });

  const count = await upsertDoctorRateCardEntries({
    tenantId,
    doctorId: doctor._id,
    ownerId,
    items: normalizedItems,
    replaceAll,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { savedCount: count }, "Doctor rate card saved successfully"));
});

const copyDoctorRateCardController = asyncHandler(async (req, res) => {
  const { doctor, selfDoctor, isSelfDoctor } = await resolveBookingDoctor({
    req,
    doctorId: req.params.doctorId,
  });

  if (isSelfDoctor) {
    throw new ApiError(400, "Self doctor cannot receive copied pricing");
  }

  const tenantId = getTenantIdFromReq(req);
  const ownerId = toObjectIdOrNull(getActorOwnerId(req));
  const sourceDoctorId = req.body.sourceDoctorId;
  let sourceItems = [];

  if (!sourceDoctorId || toStringId(sourceDoctorId) === toStringId(selfDoctor._id)) {
    const baseCatalog = await buildBaseBookingCatalog({
      req,
      bookingUserId: getDefaultBookingUserId(req),
    });

    sourceItems = [
      ...(baseCatalog.tests || []),
      ...(baseCatalog.panels || []),
      ...(baseCatalog.packages || []),
    ].map((item) => ({
      itemType: item.itemType,
      itemId: item.itemId,
      price: item.basePrice,
    }));
  } else {
    const sourceDoctor = await doctors.findOne({
      _id: sourceDoctorId,
      tenantId,
      createdBy: getActorOwnerId(req),
    });

    if (!sourceDoctor) {
      throw new ApiError(404, "Source doctor not found");
    }

    const sourceRateEntries = await getDoctorRateCardEntries({
      tenantId,
      doctorId: sourceDoctor._id,
    });

    sourceItems = sourceRateEntries.map((entry) => ({
      itemType: entry.itemType,
      itemId: entry.itemId,
      price: entry.price,
    }));
  }

  const count = await upsertDoctorRateCardEntries({
    tenantId,
    doctorId: doctor._id,
    ownerId,
    items: sourceItems,
    replaceAll: true,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { savedCount: count },
      "Doctor rate card copied successfully"
    )
  );
});

const getBookingQuickGroupsController = asyncHandler(async (req, res) => {
  const tenantId = getTenantIdFromReq(req);

  const groups = await BookingQuickGroup.find({
    tenantId,
  })
    .sort({ updatedAt: -1, name: 1 })
    .lean();

  const normalizedGroups = groups.map((group) => ({
    ...group,
    scope: "common",
    doctorId: null,
  }));

  return res.status(200).json({
    success: true,
    selectedDoctor: null,
    groups: normalizedGroups,
    commonGroups: normalizedGroups,
    doctorGroups: [],
  });
});

const createBookingQuickGroupController = asyncHandler(async (req, res) => {
  const tenantId = getTenantIdFromReq(req);
  const ownerId = getActorOwnerId(req);
  const { name, description = "", scope = "common", doctorId = null } = req.body;

  if (!name || !String(name).trim()) {
    throw new ApiError(400, "Group name is required");
  }

  const items = await resolveGroupItems({ req, items: req.body.items });

  if (items.length === 0) {
    throw new ApiError(400, "At least one item is required to create a group");
  }

  try {
    const createdGroup = await BookingQuickGroup.create({
      tenantId,
      name: String(name).trim(),
      description: String(description || "").trim(),
      scope: "common",
      doctorId: null,
      items,
      createdBy: ownerId,
      updatedBy: ownerId,
    });

    return res
      .status(201)
      .json(new ApiResponse(201, createdGroup, "Quick group created successfully"));
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, "A quick group with this name already exists");
    }

    throw error;
  }
});

const updateBookingQuickGroupController = asyncHandler(async (req, res) => {
  const tenantId = getTenantIdFromReq(req);
  const ownerId = getActorOwnerId(req);
  const group = await BookingQuickGroup.findOne({
    _id: req.params.groupId,
    tenantId,
  });

  if (!group) {
    throw new ApiError(404, "Quick group not found");
  }

  const { name, description = "", isActive = true } = req.body;
  const items = await resolveGroupItems({
    req,
    items: req.body.items ?? group.items,
  });

  if (items.length === 0) {
    throw new ApiError(400, "At least one item is required in a quick group");
  }

  group.name = String(name || group.name).trim();
  group.description = String(description || "").trim();
  group.scope = "common";
  group.doctorId = null;
  group.items = items;
  group.isActive = Boolean(isActive);
  group.updatedBy = ownerId;

  try {
    await group.save();
    return res
      .status(200)
      .json(new ApiResponse(200, group, "Quick group updated successfully"));
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, "A quick group with this name already exists");
    }

    throw error;
  }
});

const deleteBookingQuickGroupController = asyncHandler(async (req, res) => {
  const group = await BookingQuickGroup.findOneAndDelete({
    _id: req.params.groupId,
    tenantId: getTenantIdFromReq(req),
  });

  if (!group) {
    throw new ApiError(404, "Quick group not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, group, "Quick group deleted successfully"));
});

export {
  copyDoctorRateCardController,
  createBookingQuickGroupController,
  deleteBookingQuickGroupController,
  getBookingQuickGroupsController,
  getDoctorBookingCatalogController,
  getDoctorRateCardController,
  saveDoctorRateCardController,
  updateBookingQuickGroupController,
};
