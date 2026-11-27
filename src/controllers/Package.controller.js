import mongoose from "mongoose";
import { Package } from "../models/addPackage.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { SuperAdmin } from "../models/superAdmin.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { getNextBookingCodeForScope } from "../utils/bookingCode.js";

const parsePackageOrderPayload = (body = {}) => {
  if (Array.isArray(body.updatedOrder) && body.updatedOrder.length > 0) {
    return body.updatedOrder;
  }
  if (Array.isArray(body.orderedIds) && body.orderedIds.length > 0) {
    return body.orderedIds.map((id, idx) => ({ id, order: idx + 1 }));
  }
  return [];
};

// add package superAdmin
const addPackagecontroller = asyncHandler(async (req, res) => {
  const {
    final_price,
    testname = [],
    testSample = [],
    pannelname = [],
    pannelSample = [],
    packageName,
    packageFee,
    packagegender,
    packageGender,
    testIds = [],
    pannelIds = []
  } = req.body;

  const resolvedGender = packagegender ?? packageGender;
  const hasTestsOrPanels =
    (Array.isArray(testname) && testname.length > 0) ||
    (Array.isArray(pannelname) && pannelname.length > 0);

  // Check for missing fields
  if (
    !packageName ||
    !packageFee ||
    !resolvedGender ||
    !hasTestsOrPanels
  ) {
    return res.status(400).json({
      message: "Please provide package name, billing price, gender, and at least one test or panel."
    });
  }

  let superAdminId;
  if (req.user.role === 'staff') {
    superAdminId = req.user.parentUser;
  } else {
    superAdminId = req.user._id;
  }

  const allreadyExistedpackage = await Package.findOne({
    createdBy: superAdminId,
    packageName: packageName,
  });

  if (allreadyExistedpackage) {
    return res.status(400).json({ message: "Package already exists in database." });
  }

  const lastPackage = await Package.findOne({
    createdBy: superAdminId,
    createdByRole: 'superAdmin',
  })
    .sort({ order: -1 })
    .select('order');
  const nextOrder = lastPackage ? Number(lastPackage.order || 0) + 1 : 1;
  const nextBookingCode = await getNextBookingCodeForScope({
    createdBy: superAdminId,
    createdByRole: "superAdmin"
  });

  const createPackage = {
    order: nextOrder,
    bookingCode: nextBookingCode,
    testSample,
    testname,
    pannelname,
    pannelSample,
    packageName,
    packageFee,
    final_price: final_price ?? packageFee,
    packageGender: resolvedGender,
    createdBy: superAdminId,
    originalPackageId: null,
    isBasePackage: true,
    createdByRole: 'superAdmin',
    purchasedFromBasePackage: false,
    tenantId: null,
    testIds,
    pannelIds
  };

  const packageCreated = await Package.create(createPackage);

  if (!packageCreated) {
    return res.status(403).json({ message: "Something went wrong while creating the package." });
  }

  if (req.user.role === 'staff') {
    await SuperAdmin.findByIdAndUpdate(req.user._id, {
      $push: {
        activities: {
          activityType: "test_create",
          details: {
            staffId: req.user._id,
            staffName: req.user.fullName,
            action: "Staff created a new package",
            packageName: packageName,
            packageId: packageCreated._id
          },
          reference: {
            model: "package",
            id: packageCreated._id
          },
          timestamp: new Date()
        }
      }
    });
  }

  return res.status(200).json({
    message: "Package created successfully",
    package: packageCreated
  });
});

// add package Admin
const addPackagecontrollerforadmin = asyncHandler(async (req, res) => {
  const {
    final_price,
    testname = [],
    testSample = [],
    pannelname = [],
    pannelSample = [],
    packageName,
    packageFee,
    packagegender,
    packageGender,
    testIds = [],
    pannelIds = []
  } = req.body;

  const resolvedGender = packagegender ?? packageGender;
  const hasTestsOrPanels =
    (Array.isArray(testname) && testname.length > 0) ||
    (Array.isArray(pannelname) && pannelname.length > 0);

  if (
    !packageName ||
    !packageFee ||
    !resolvedGender ||
    !hasTestsOrPanels
  ) {
    return res.status(400).json({
      message: "Please provide package name, billing price, gender, and at least one test or panel."
    });
  }

  let userId;
  if (req.user.role === 'staff') {
    userId = req.user.parentUser;
  } else {
    userId = req.user._id;
  }

  const tenantid = req.user.tenantId._id;

  const allreadyExistedpackage = await Package.findOne({
    tenantId: tenantid,
    createdByRole: "admin",
    packageName: packageName,
  });

  if (allreadyExistedpackage) {
    return res.status(400).json({ message: "Package already exists in database." });
  }

  const lastPackage = await Package.findOne({
    tenantId: tenantid,
    createdByRole: 'admin',
  })
    .sort({ order: -1 })
    .select('order');
  const nextOrder = lastPackage ? Number(lastPackage.order || 0) + 1 : 1;
  const nextBookingCode = await getNextBookingCodeForScope({ tenantId: tenantid });

  const createPackage = {
    order: nextOrder,
    bookingCode: nextBookingCode,
    testSample,
    testname,
    pannelname,
    pannelSample,
    packageName,
    packageFee,
    final_price: final_price ?? packageFee,
    packageGender: resolvedGender,
    createdBy: userId,
    originalPackageId: null,
    isBasePackage: true,
    createdByRole: 'admin',
    purchasedFromBasePackage: false,
    tenantId: tenantid,
    testIds,
    pannelIds,
  };

  const packageCreated = await Package.create(createPackage);

  if (!packageCreated) {
    return res.status(401).json({ message: "Something went wrong while creating the package." });
  }

  if (req.user.role === 'staff') {
    await User.findByIdAndUpdate(req.user._id, {
      $push: {
        activities: {
          activityType: "test_create",
          details: {
            staffId: req.user._id,
            staffName: req.user.fullName,
            action: "Staff created a new package",
            packageName: packageName,
            packageId: packageCreated._id
          },
          reference: {
            model: "package",
            id: packageCreated._id
          },
          timestamp: new Date()
        }
      }
    });
  }

  return res.status(200).json({
    message: "Package created successfully",
    package: packageCreated
  });
});

const allPackagecontroller = asyncHandler(async function (req, res) {
  let query = {
    createdByRole: "superAdmin"
  };

  if (req.user.role === "staff") {
    query.createdBy = req.user.parentUser;
  } else {
    query.createdBy = req.user._id;
  }

  const allpackages = await Package.find(query).sort({ order: 1, _id: 1 });

  if (!allpackages) {
    throw new ApiError(400, "Internal server error");
  }

  return res.json(allpackages);
});

const onePackagecontroller = asyncHandler(async function (req, res) {
  const { value1 } = req.params;

  const Apackage = await Package.findOne({
    _id: value1,
  }).populate([
    { path: 'testIds', select: 'Name sampleType Price final_price' },
    { path: 'pannelIds', select: 'name sample_types price final_price' }
  ]);

  if (!Apackage) {
    throw new ApiError(404, "Package not found");
  }

  Apackage.testname = Apackage.testIds.map(obj => obj.Name);
  Apackage.pannelname = Apackage.pannelIds.map(obj => obj.name);

  res.set("Cache-Control", "no-store");
  return res.json(Apackage);
});

// superAdmin package edit
const editPackageController = asyncHandler(async (req, res) => {
  const { value1 } = req.params;

  const {
    final_price,
    packageName,
    testname,
    testSample,
    pannelname,
    pannelSample,
    packageFee,
    packagegender,
    packageGender,
    testIds,
    pannelIds
  } = req.body;

  if (!value1) {
    return res.status(400).json({ message: "Package ID is required" });
  }

  const existingPackage = await Package.findOne({ _id: value1 });
  if (!existingPackage) {
    return res.status(404).json({ message: "Package not found" });
  }

  const resolvedGender = packagegender ?? packageGender;

  if (testname !== undefined) existingPackage.testname = testname;
  if (testSample !== undefined) existingPackage.testSample = testSample;
  if (pannelname !== undefined) existingPackage.pannelname = pannelname;
  if (pannelSample !== undefined) existingPackage.pannelSample = pannelSample;
  if (packageFee !== undefined) existingPackage.packageFee = packageFee;
  if (resolvedGender !== undefined) existingPackage.packageGender = resolvedGender;
  if (packageName !== undefined) existingPackage.packageName = packageName;
  if (final_price !== undefined) existingPackage.final_price = final_price;
  if (testIds !== undefined) existingPackage.testIds = testIds;
  if (pannelIds !== undefined) existingPackage.pannelIds = pannelIds;

  const updatedPackage = await existingPackage.save();

  if (!updatedPackage) {
    return res.status(403).json({ message: "Something went wrong while updating the package." });
  }

  if (req.user.role === 'staff') {
    await SuperAdmin.findByIdAndUpdate(req.user._id, {
      $push: {
        activities: {
          activityType: "test_create",
          details: {
            staffId: req.user._id,
            staffName: req.user.fullName,
            action: "Staff updated a package",
            packageName: packageName,
            packageId: updatedPackage._id
          },
          reference: {
            model: "package",
            id: updatedPackage._id
          },
          timestamp: new Date()
        }
      }
    });
  }

  return res.json({
    message: "Package updated successfully",
    updatedPackage: updatedPackage
  });
});

// admin package edit
const adminEditPackageController = asyncHandler(async (req, res) => {
  const { value1 } = req.params;

  const {
    final_price,
    packageName,
    testname,
    testSample,
    pannelname,
    pannelSample,
    packageFee,
    packagegender,
    packageGender,
    testIds,
    pannelIds
  } = req.body;

  if (!value1) {
    return res.status(400).json({ message: "Package ID is required" });
  }

  const existingPackage = await Package.findOne({ _id: value1 });
  if (!existingPackage) {
    return res.status(404).json({ message: "Package not found" });
  }

  const resolvedGender = packagegender ?? packageGender;

  if (testname !== undefined) existingPackage.testname = testname;
  if (testSample !== undefined) existingPackage.testSample = testSample;
  if (pannelname !== undefined) existingPackage.pannelname = pannelname;
  if (pannelSample !== undefined) existingPackage.pannelSample = pannelSample;
  if (packageFee !== undefined) existingPackage.packageFee = packageFee;
  if (resolvedGender !== undefined) existingPackage.packageGender = resolvedGender;
  if (packageName !== undefined) existingPackage.packageName = packageName;
  if (final_price !== undefined) existingPackage.final_price = final_price;
  if (testIds !== undefined) existingPackage.testIds = testIds;
  if (pannelIds !== undefined) existingPackage.pannelIds = pannelIds;

  const updatedPackage = await existingPackage.save();

  if (!updatedPackage) {
    return res.status(403).json({ message: "Something went wrong while updating the package." });
  }

  if (req.user.role === 'staff') {
    await User.findByIdAndUpdate(req.user._id, {
      $push: {
        activities: {
          activityType: "test_create",
          details: {
            staffId: req.user._id,
            staffName: req.user.fullName,
            action: "Staff updated a package",
            packageName: packageName,
            packageId: updatedPackage._id
          },
          reference: {
            model: "package",
            id: updatedPackage._id
          },
          timestamp: new Date()
        }
      }
    });
  }

  return res.json({
    message: "Package updated successfully",
    updatedPackage: updatedPackage
  });
});

const tenantAllPackage = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId._id;

  try {
    const packages = await Package.find({
      tenantId: tenantId,
    }).sort({ order: 1, _id: 1 });

    res.status(200).json({
      status: 200,
      message: "Packages fetched successfully",
      count: packages.length,
      packages,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch packages", error: error.message });
  }
});

const updatePackageOrder = asyncHandler(async (req, res) => {
  const updatedOrder = parsePackageOrderPayload(req.body);
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
      } else {
        throw new ApiError(400, `Invalid package ID: ${id}`);
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
      await Package.bulkWrite(bulkOperations);
    }

    res.json({
      status: 200,
      updatedCount: bulkOperations.length,
      message: "Package order updated successfully",
    });
  } catch (error) {
    console.error("Error updating package order:", error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to update package order");
  }
});

const updatePackageOrdersuper = asyncHandler(async (req, res) => {
  const updatedOrder = parsePackageOrderPayload(req.body);
  const ownerId = req.user.role === "staff" ? req.user.parentUser : req.user._id;

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
      } else {
        throw new ApiError(400, `Invalid package ID: ${id}`);
      }

      dedupedMap.set(String(id), {
        updateOne: {
          filter: { _id: id, createdBy: ownerId },
          update: { $set: { order: Math.round(numericOrder) } },
        },
      });
    }

    const bulkOperations = Array.from(dedupedMap.values());
    if (bulkOperations.length > 0) {
      await Package.bulkWrite(bulkOperations);
    }

    res.json({
      status: 200,
      updatedCount: bulkOperations.length,
      message: "Package order updated successfully",
    });
  } catch (error) {
    console.error("Error updating package order:", error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to update package order");
  }
});

const deletePackagesController = asyncHandler(async (req, res) => {
  const { packageIds } = req.body;
  if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
    throw new ApiError(400, "packageIds array is required");
  }
  const deletedPackages = await Package.deleteMany({ _id: { $in: packageIds } });
  return res.status(200).json(new ApiResponse(200, deletedPackages, "Packages deleted successfully"));
});

export {
  addPackagecontroller,
  allPackagecontroller,
  onePackagecontroller,
  editPackageController,
  tenantAllPackage,
  addPackagecontrollerforadmin,
  adminEditPackageController,
  deletePackagesController,
  updatePackageOrder,
  updatePackageOrdersuper
};
