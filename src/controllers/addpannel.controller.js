import { addPannel } from "../models/AddPannel.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { pannelCounter } from "../models/counterPannel.model.js";
import { SuperAdmin } from "../models/superAdmin.model.js";
import { User } from "../models/user.model.js";
import mongoose from "mongoose";
import { getNextBookingCodeForScope } from "../utils/bookingCode.js";
import { resolveCategoryForScope } from "../utils/categorySnapshot.js";

const parseBooleanInput = (value) => value === true || value === "true" || value === 1 || value === "1";

const isBlankValue = (value) => value === undefined || value === null || String(value).trim() === "";

const parsePanelOrderPayload = (body = {}) => {
  const { updatedOrder, orderedIds } = body;
  const normalized = [];

  if (Array.isArray(orderedIds) && orderedIds.length > 0) {
    orderedIds.forEach((rawId, idx) => {
      if (mongoose.isValidObjectId(rawId)) {
        normalized.push({ id: new mongoose.Types.ObjectId(rawId), order: idx + 1 });
      }
    });
  } else if (Array.isArray(updatedOrder) && updatedOrder.length > 0) {
    for (const entry of updatedOrder) {
      const rawId = entry?.id ?? entry?._id;
      const numericOrder = Number(entry?.order);
      if (!mongoose.isValidObjectId(rawId)) {
        throw new ApiError(400, `Invalid panel id: ${rawId}`);
      }
      if (!Number.isFinite(numericOrder) || numericOrder < 1) {
        throw new ApiError(400, `Invalid order value for panel ${rawId}`);
      }
      normalized.push({ id: new mongoose.Types.ObjectId(rawId), order: Math.round(numericOrder) });
    }
  }

  if (normalized.length === 0) {
    throw new ApiError(400, "Invalid or empty panel order payload");
  }

  const dedupedMap = new Map();
  for (const item of normalized) {
    dedupedMap.set(String(item.id), item);
  }
  return Array.from(dedupedMap.values());
};

// superAdmin add Panel
const addpannelcontroller = asyncHandler(async (req, res) => {
  const {
    pannelname,
    category,
    price: bodyPrice,
    rawPrice,
    inputarray,
    interpretion,
    interpretation,
    sample_types,
    final_price,
    testsId,
    Short_name,
    short_name,
    shortName
  } = req.body;
  const normalizedHideInterpretation = parseBooleanInput(req.body.hideInterpretation);
  const normalizedHideMethodInstrument = parseBooleanInput(req.body.hideMethodInstrument);
  const normalizedHidePanelInterpretation = parseBooleanInput(req.body.hidePanelInterpretation);
  const resolvedShortName = String(Short_name ?? shortName ?? short_name ?? "").trim();

  const userId = req.user.role === "staff" ? req.user.parentUser : req.user._id;

  if (!pannelname || !category || isBlankValue(final_price)) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const cleanPanelName = String(pannelname).trim();
  const allreadyExistedpannel = await addPannel.findOne({
    name: cleanPanelName,
    createdBy: userId
  });

  if (allreadyExistedpannel) {
    return res
      .status(400)
      .json({ message: "Panel already exists in database" });
  }

  const price = Number(bodyPrice ?? rawPrice ?? 0);

  const lastPanel = await addPannel
    .findOne({ createdBy: userId })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = (Number(lastPanel?.order) || 0) + 1;
  const nextBookingCode = await getNextBookingCodeForScope({
    createdBy: userId,
    createdByRole: "superAdmin"
  });
  const resolvedCategory = await resolveCategoryForScope({
    categoryInput: category,
    tenantId: null,
    createdBy: userId
  });

  const createPannel = {
    order: nextOrder,
    bookingCode: nextBookingCode,
    name: cleanPanelName,
    Short_name: resolvedShortName,
    category: resolvedCategory || category,
    price: Number.isFinite(price) ? price : 0,
    tests: inputarray,
    interpretation: interpretion ?? interpretation ?? "",
    sample_types,
    hideInterpretation: normalizedHideInterpretation,
    hideMethodInstrument: normalizedHideMethodInstrument,
    hidePanelInterpretation: normalizedHidePanelInterpretation,
    hidepanelinterpretation: normalizedHidePanelInterpretation,
    final_price,
    originalPanelId: null,
    isBasePanel: true,
    createdByRole: "superAdmin",
    purchasedFromBasePanel: false,
    tenantId: null,
    createdBy: userId,
    testsId
  };

  const panelCreated = await addPannel.create(createPannel);

  if (!panelCreated) {
    return res.status(400).json({ message: "Failed to create panel" });
  }

  if (req.user.role === "staff") {
    await SuperAdmin.findByIdAndUpdate(req.user._id, {
      $push: {
        activities: {
          activityType: "test_create",
          details: {
            staffId: req.user._id,
            staffName: req.user.fullName,
            action: "Staff created a new Pannel",
            panelName: cleanPanelName,
            panelId: panelCreated._id
          },
          reference: {
            model: "panel",
            id: panelCreated._id
          },
          timestamp: new Date()
        }
      }
    });
  }

  return res.status(200).json(
    { message: "Panel created successfully", panelCreated, status: "success" }
  );
});

// admin add Panel
const addpannelcontrollerforadmin = asyncHandler(async (req, res) => {
  const {
    pannelname,
    category,
    price: bodyPrice,
    rawPrice,
    inputarray,
    interpretion,
    interpretation,
    sample_types,
    final_price,
    testsId,
    Short_name,
    short_name,
    shortName
  } = req.body;
  const normalizedHideInterpretation = parseBooleanInput(req.body.hideInterpretation);
  const normalizedHideMethodInstrument = parseBooleanInput(req.body.hideMethodInstrument);
  const normalizedHidePanelInterpretation = parseBooleanInput(req.body.hidePanelInterpretation);
  const resolvedShortName = String(Short_name ?? shortName ?? short_name ?? "").trim();

  const tenantId = req.user.tenantId?._id || req.user.tenantId;
  if (!tenantId) {
    throw new ApiError(403, "Tenant context required");
  }

  if (!pannelname || !category || isBlankValue(final_price)) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const cleanPanelName = String(pannelname).trim();
  const allreadyExistedpannel = await addPannel.findOne({
    name: cleanPanelName,
    tenantId
  });

  if (allreadyExistedpannel) {
    return res
      .status(400)
      .json({ message: "Panel already exists in database" });
  }

  const price = Number(bodyPrice ?? rawPrice ?? 0);

  const lastPanel = await addPannel
    .findOne({ tenantId })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = (Number(lastPanel?.order) || 0) + 1;
  const nextBookingCode = await getNextBookingCodeForScope({ tenantId });
  const resolvedCategory = await resolveCategoryForScope({
    categoryInput: category,
    tenantId,
    createdBy: req.user._id
  });

  const createPannel = {
    order: nextOrder,
    bookingCode: nextBookingCode,
    name: cleanPanelName,
    Short_name: resolvedShortName,
    category: resolvedCategory || category,
    price: Number.isFinite(price) ? price : 0,
    tests: inputarray,
    interpretation: interpretion ?? interpretation ?? "",
    sample_types,
    hideInterpretation: normalizedHideInterpretation,
    hideMethodInstrument: normalizedHideMethodInstrument,
    hidePanelInterpretation: normalizedHidePanelInterpretation,
    hidepanelinterpretation: normalizedHidePanelInterpretation,
    final_price,
    originalPanelId: null,
    isBasePanel: true,
    createdByRole: "admin",
    purchasedFromBasePanel: false,
    tenantId,
    createdBy: req.user._id,
    testsId
  };

  const panelCreated = await addPannel.create(createPannel);

  if (!panelCreated) {
    return res.status(400).json({ message: "Failed to create panel" });
  }

  if (req.user.role === "staff") {
    await User.findByIdAndUpdate(req.user._id, {
      $push: {
        activities: {
          activityType: "test_create",
          details: {
            staffId: req.user._id,
            staffName: req.user.fullName,
            action: "Staff created a new Pannel",
            panelName: cleanPanelName,
            panelId: panelCreated._id
          },
          reference: {
            model: "panel",
            id: panelCreated._id
          },
          timestamp: new Date()
        }
      }
    });
  }

  return res.status(200).json(
    { message: "Panel created successfully", panelCreated, status: "success" }
  );
});

// superAdmin fetch all Panels
const allPannelcontroller = asyncHandler(async function (req, res) {
  const query = {
    createdBy: req.user.role === "staff" ? req.user.parentUser : req.user._id,
    createdByRole: "superAdmin"
  };

  const allpanels = await addPannel.find(query).sort({ order: 1, _id: 1 });
  return res.json(allpanels);
});

const onePannelcontroller = asyncHandler(async function (req, res) {
  const { value1 } = req.params;

  const Apannel = await addPannel
    .findOne({ _id: value1 })
    .populate("testsId", "Name");

  if (!Apannel) {
    throw new ApiError(404, "Panel not found");
  }

  Apannel.tests = (Apannel.testsId || [])
    .filter(Boolean)
    .map((obj) => obj.Name || obj.name)
    .filter(Boolean);

  res.set("Cache-Control", "no-store");
  return res.json(Apannel);
});

// superAdmin editPannel controller
const editPannelController = asyncHandler(async (req, res) => {
  const { value1 } = req.params;

  const {
    final_price,
    pannelname,
    category,
    price,
    inputarray,
    sample_types,
    interpretation,
    interpretion,
    testsId,
    Short_name,
    short_name,
    shortName
  } = req.body;
  const normalizedHideInterpretation = parseBooleanInput(req.body.hideInterpretation);
  const normalizedHideMethodInstrument = parseBooleanInput(req.body.hideMethodInstrument);
  const normalizedHidePanelInterpretation = parseBooleanInput(req.body.hidePanelInterpretation);

  if (isBlankValue(final_price) || !pannelname || !category || isBlankValue(price)) {
    return res.status(400).json({ message: "Missing required fields", status: "error" });
  }

  const ownerId = req.user.role === "staff" ? req.user.parentUser : req.user._id;
  const resolvedCategory = await resolveCategoryForScope({
    categoryInput: category,
    tenantId: null,
    createdBy: ownerId
  });
  const editedPannel = await addPannel.findOneAndUpdate(
    { _id: value1, createdBy: ownerId },
    {
      name: String(pannelname).trim(),
      category: resolvedCategory || category,
      price,
      tests: inputarray,
      sample_types,
      interpretation: interpretation ?? interpretion ?? "",
      hideInterpretation: normalizedHideInterpretation,
      hideMethodInstrument: normalizedHideMethodInstrument,
      hidePanelInterpretation: normalizedHidePanelInterpretation,
      hidepanelinterpretation: normalizedHidePanelInterpretation,
      final_price,
      testsId,
      ...(Short_name !== undefined || shortName !== undefined || short_name !== undefined
        ? { Short_name: String(Short_name ?? shortName ?? short_name ?? "").trim() }
        : {})
    },
    { new: true }
  );

  if (!editedPannel) {
    return res.status(404).json({ message: "Panel not found or access denied", status: "error" });
  }

  if (req.user.role === "staff") {
    await SuperAdmin.findByIdAndUpdate(req.user._id, {
      $push: {
        activities: {
          activityType: "test_create",
          details: {
            staffId: req.user._id,
            staffName: req.user.fullName,
            action: "Staff Update a Pannel",
            panelName: editedPannel.name,
            panelId: editedPannel._id
          },
          reference: {
            model: "panel",
            id: editedPannel._id
          },
          timestamp: new Date()
        }
      }
    });
  }

  return res.status(200).json({ message: "Panel updated successfully", status: "success", edited: editedPannel });
});

// Admin editPannel controller
const adminEditPannelController = asyncHandler(async (req, res) => {
  const { value1 } = req.params;

  const {
    final_price,
    pannelname,
    category,
    price,
    inputarray,
    sample_types,
    interpretation,
    interpretion,
    testsId,
    Short_name,
    short_name,
    shortName
  } = req.body;
  const normalizedHideInterpretation = parseBooleanInput(req.body.hideInterpretation);
  const normalizedHideMethodInstrument = parseBooleanInput(req.body.hideMethodInstrument);
  const normalizedHidePanelInterpretation = parseBooleanInput(req.body.hidePanelInterpretation);

  if (isBlankValue(final_price) || !pannelname || !category || isBlankValue(price)) {
    return res.status(400).json({ message: "Missing required fields", status: "error" });
  }

  const tenantId = req.user.tenantId?._id || req.user.tenantId;
  const filter = tenantId ? { _id: value1, tenantId } : { _id: value1 };
  const resolvedCategory = await resolveCategoryForScope({
    categoryInput: category,
    tenantId,
    createdBy: req.user._id
  });

  const editedPannel = await addPannel.findOneAndUpdate(
    filter,
    {
      name: String(pannelname).trim(),
      category: resolvedCategory || category,
      price,
      tests: inputarray,
      sample_types,
      interpretation: interpretation ?? interpretion ?? "",
      hideInterpretation: normalizedHideInterpretation,
      hideMethodInstrument: normalizedHideMethodInstrument,
      hidePanelInterpretation: normalizedHidePanelInterpretation,
      hidepanelinterpretation: normalizedHidePanelInterpretation,
      final_price,
      testsId,
      ...(Short_name !== undefined || shortName !== undefined || short_name !== undefined
        ? { Short_name: String(Short_name ?? shortName ?? short_name ?? "").trim() }
        : {})
    },
    { new: true }
  );

  if (!editedPannel) {
    return res.status(404).json({ message: "Panel not found or access denied", status: "error" });
  }

  if (req.user.role === "staff") {
    await User.findByIdAndUpdate(req.user._id, {
      $push: {
        activities: {
          activityType: "test_create",
          details: {
            staffId: req.user._id,
            staffName: req.user.fullName,
            action: "Staff Update a Pannel",
            panelName: editedPannel.name,
            panelId: editedPannel._id
          },
          reference: {
            model: "panel",
            id: editedPannel._id
          },
          timestamp: new Date()
        }
      }
    });
  }

  return res.status(200).json({ message: "Panel updated successfully", status: "success", edited: editedPannel });
});

const updatePannelOrder = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId?._id || req.user?.tenantId;
  if (!tenantId) {
    throw new ApiError(403, "Tenant context required");
  }

  const entries = parsePanelOrderPayload(req.body);
  const bulkOperations = entries.map(({ id, order }) => ({
    updateOne: {
      filter: { _id: id, tenantId },
      update: { $set: { order } }
    }
  }));

  await addPannel.bulkWrite(bulkOperations, { ordered: false });

  return res.status(200).json({
    status: 200,
    message: "Panel order updated successfully"
  });
});

// update panel order super
const updatePannelOrdersuper = asyncHandler(async (req, res) => {
  const ownerId = req.user.role === "staff" ? req.user.parentUser : req.user._id;
  if (!ownerId) {
    throw new ApiError(403, "Owner context required");
  }

  const entries = parsePanelOrderPayload(req.body);
  const bulkOperations = entries.map(({ id, order }) => ({
    updateOne: {
      filter: { _id: id, createdBy: ownerId },
      update: { $set: { order } }
    }
  }));

  await addPannel.bulkWrite(bulkOperations, { ordered: false });

  return res.status(200).json({
    status: 200,
    message: "Panel order updated successfully"
  });
});

const tenantAllPanel = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId?._id || req.user?.tenantId;
  if (!tenantId) {
    throw new ApiError(403, "Tenant context required");
  }

  const panels = await addPannel.find({ tenantId }).sort({ order: 1, _id: 1 });

  return res.status(200).json({
    status: 200,
    message: "Panels fetched successfully",
    count: panels.length,
    panels
  });
});

const deletePanelsController = asyncHandler(async (req, res) => {
  const { panelIds } = req.body;
  if (!panelIds || !Array.isArray(panelIds) || panelIds.length === 0) {
    throw new ApiError(400, "panelIds array is required");
  }

  const tenantId = req.user?.tenantId?._id || req.user?.tenantId;
  const ownerId = req.user.role === "staff" ? req.user.parentUser : req.user._id;
  const scope = tenantId ? { tenantId } : { createdBy: ownerId };

  const deletedPanels = await addPannel.deleteMany({
    _id: { $in: panelIds },
    ...scope
  });

  return res.status(200).json(new ApiResponse(200, deletedPanels, "Panels deleted successfully"));
});

export {
  addpannelcontroller,
  allPannelcontroller,
  onePannelcontroller,
  editPannelController,
  updatePannelOrder,
  updatePannelOrdersuper,
  tenantAllPanel,
  addpannelcontrollerforadmin,
  adminEditPannelController,
  deletePanelsController
};
