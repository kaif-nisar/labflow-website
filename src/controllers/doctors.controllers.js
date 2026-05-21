import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { doctors } from "../models/doctor.model.js";
import { User } from "../models/user.model.js";
import { DoctorRateCard } from "../models/doctorRateCard.model.js";
import { BookingQuickGroup } from "../models/bookingQuickGroup.model.js";
import {
  ensureSelfDoctorForUser,
  getActorOwnerId,
  getDoctorDisplayName,
  getTenantIdFromReq,
  toObjectIdOrNull,
  toStringId,
  sanitizeDoctorFields,
} from "../utils/doctorPricing.js";

const formatDoctorResponse = (doctor, extra = {}) => {
  const doctorObj = doctor.toObject ? doctor.toObject() : doctor;
  return {
    ...doctorObj,
    displayName: getDoctorDisplayName(doctorObj),
    ...extra,
  };
};

const normalizeDoctorEmail = (value) => String(value || "").trim().toLowerCase();
const doctorEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const rethrowDoctorWriteError = (error) => {
  if (error?.code === 11000 && error?.keyPattern?.email) {
    throw new ApiError(409, "Doctor email already exists");
  }

  throw error;
};

const ensureDoctorEmailAvailability = async ({
  tenantId,
  ownerId,
  email,
  excludeDoctorId = null,
}) => {
  const normalizedEmail = normalizeDoctorEmail(email);
  if (!normalizedEmail) {
    return "";
  }

  if (!doctorEmailRegex.test(normalizedEmail)) {
    throw new ApiError(400, "Doctor email is invalid");
  }

  const query = {
    tenantId,
    createdBy: ownerId,
    email: normalizedEmail,
  };

  if (excludeDoctorId) {
    query._id = { $ne: excludeDoctorId };
  }

  const existingDoctor = await doctors.findOne(query).select("_id");
  if (existingDoctor) {
    throw new ApiError(409, "Doctor email already exists");
  }

  return normalizedEmail;
};

const addDoctorsController = asyncHandler(async (req, res) => {
  const {
    firstname,
    lastname,
    specialization,
    dob,
    gender,
    address,
    remarks,
    email,
  } = req.body;
  if (!(firstname && lastname && specialization && gender)) {
    throw new ApiError(400, "Firstname, lastname, specialization and gender are required");
  }

  const userId = getActorOwnerId(req);
  const tenantId = getTenantIdFromReq(req);
  const normalizedEmail = await ensureDoctorEmailAvailability({
    tenantId,
    ownerId: userId,
    email,
  });

  await ensureSelfDoctorForUser({
    tenantId,
    ownerId: toObjectIdOrNull(userId),
  });

  let createdDoctor;

  try {
    createdDoctor = await doctors.create({
      displayName: `${firstname} ${lastname}`.trim(),
      email: normalizedEmail,
      firstName: firstname,
      lastName: lastname,
      specialization: specialization,
      ...(dob ? { DOB: dob } : {}),
      gender,
      address,
      remarks,
      createdBy: userId,
      tenantId,
    });
  } catch (error) {
    rethrowDoctorWriteError(error);
  }

  if (!createdDoctor) {
    throw new ApiError(400, "something went wrong while creating doctor");
  }

   // अगर staff का parentUser है तो उसे भी notify करें
      if (req.user.role === 'staff') {
        await User.findByIdAndUpdate(req.user._id, {
          $push: {
            activities: {
              activityType: "other",
              details: {
                staffId: req.user._id,
                staffName: req.user.fullName,
                action: "Staff added a new doctor",
                doctorId: createdDoctor._id,
                doctor: createdDoctor.firstName + ' ' + createdDoctor.lastName
              },
              reference: {
                model: "Doctor",
                id: createdDoctor._id
              },
              timestamp: new Date()
            }
          }
        });
      }

  return res.json(new ApiResponse(200, formatDoctorResponse(createdDoctor), "doctor created successfully"));
});

const allDoctorsController = asyncHandler(async (req, res) => {
  const userId = getActorOwnerId(req);
  const tenantId = getTenantIdFromReq(req);

  const ownerId = toObjectIdOrNull(userId);

  if (!ownerId) {
    throw new ApiError(400, "Owner context is required");
  }

  await ensureSelfDoctorForUser({
    tenantId,
    ownerId,
  });

  if (!userId) {
    throw new ApiError(400, "userId is required");
  }

  const allDoctors = await doctors
    .find({ createdBy: userId, tenantId })
    .sort({ isSystemDefault: -1, createdAt: -1 });

  if (!allDoctors) {
    throw new ApiError(400, "something went wrong while fetching doctors");
  }

  const doctorIds = allDoctors.map((doctor) => doctor._id);
  const rateCardCounts = await DoctorRateCard.aggregate([
    { $match: { tenantId, doctorId: { $in: doctorIds } } },
    { $group: { _id: "$doctorId", count: { $sum: 1 } } },
  ]);

  const rateCountMap = new Map(
    rateCardCounts.map((entry) => [toStringId(entry._id), entry.count])
  );

  return res.json(
    allDoctors.map((doctor) => {
      const sanitized = sanitizeDoctorFields(doctor);
      return formatDoctorResponse(sanitized, {
        rateCardCount: rateCountMap.get(toStringId(doctor._id)) || 0,
      });
    })
  );
});

// fetch one doctor by ID
const getDoctorById = asyncHandler(async (req, res) => {
  const doctorId = req.params.doctorId;
  if (!doctorId) {
    throw new ApiError(400, "doctorId is required");
  }

  const doctor = await doctors.findOne({
    _id: doctorId,
    tenantId: getTenantIdFromReq(req),
    createdBy: getActorOwnerId(req),
  });

  if (!doctor) {
    throw new ApiError(404, "doctor not found");
  }

  const sanitized = sanitizeDoctorFields(doctor);
  return res.json(new ApiResponse(200, formatDoctorResponse(sanitized), "Doctor fetched successfully"));
});

// Update doctor controller
const updateDoctorController = asyncHandler(async (req, res) => {
  const {
    doctorId,
    firstname,
    lastname,
    specialization,
    dob,
    gender,
    address,
    remarks,
    email,
  } = req.body;
  if (
    !(doctorId && (firstname || lastname || specialization || dob || gender || address || remarks || email !== undefined))
  ) {
    throw new ApiError(400, "Doctor ID and at least one field are required");
  }

  const existingDoctor = await doctors.findOne({
    _id: doctorId,
    tenantId: getTenantIdFromReq(req),
    createdBy: getActorOwnerId(req),
  });

  if (!existingDoctor) {
    throw new ApiError(404, "Doctor not found");
  }

  if (existingDoctor.isSystemDefault) {
    throw new ApiError(400, "Self doctor cannot be edited");
  }

  const normalizedEmail = await ensureDoctorEmailAvailability({
    tenantId: getTenantIdFromReq(req),
    ownerId: getActorOwnerId(req),
    email,
    excludeDoctorId: doctorId,
  });

  let updatedDoctor;

  try {
    updatedDoctor = await doctors.findByIdAndUpdate(
      doctorId,
      {
        displayName: `${firstname || existingDoctor.firstName} ${lastname || existingDoctor.lastName}`.trim(),
        ...(firstname && { firstName: firstname }),
        ...(lastname && { lastName: lastname }),
        ...(specialization && { specialization }),
        ...(dob && { DOB: dob }),
        ...(gender && { gender }),
        ...(remarks && { remarks }),
        ...(address && { address }),
        ...(email !== undefined && { email: normalizedEmail }),
      },
      { new: true }
    );
  } catch (error) {
    rethrowDoctorWriteError(error);
  }
  if (!updatedDoctor) {
    throw new ApiError(400, "Doctor not found or update failed");
  }

    // अगर staff का parentUser है तो उसे भी notify करें
      if (req.user.role === 'staff') {
        await User.findByIdAndUpdate(req.user._id, {
          $push: {
            activities: {
              activityType: "other",
              details: {
                staffId: req.user._id,
                staffName: req.user.fullName,
                action: "Staff updated a doctor",
                doctorId: updatedDoctor._id,
                doctor: updatedDoctor.firstName + ' ' + updatedDoctor.lastName
              },
              reference: {
                model: "Doctor",
                id: updatedDoctor._id
              },
              timestamp: new Date()
            }
          }
        });
      }

  
  return res.json(
    new ApiResponse(200, "Doctor updated successfully", updatedDoctor)
  );
});

// Delete doctor controller
const deleteDoctorController = asyncHandler(async (req, res) => {
  const { doctorId } = req.body;
  if (!doctorId) {
    throw new ApiError(400, "doctorId is required");
  }

  const doctor = await doctors.findOne({
    _id: doctorId,
    tenantId: getTenantIdFromReq(req),
    createdBy: getActorOwnerId(req),
  });

  if (!doctor) {
    throw new ApiError(404, "Doctor not found or already deleted");
  }

  if (doctor.isSystemDefault) {
    throw new ApiError(400, "Self doctor cannot be deleted");
  }

  await Promise.all([
    DoctorRateCard.deleteMany({
      tenantId: getTenantIdFromReq(req),
      doctorId: doctor._id,
    }),
    BookingQuickGroup.deleteMany({
      tenantId: getTenantIdFromReq(req),
      doctorId: doctor._id,
    }),
  ]);

  const deletedDoctor = await doctors.findByIdAndDelete(doctorId);
  if (!deletedDoctor) {
    throw new ApiError(404, "Doctor not found or already deleted");
  }

    // अगर staff का parentUser है तो उसे भी notify करें
      if (req.user.role === 'staff') {
        await User.findByIdAndUpdate(req.user._id, {
          $push: {
            activities: {
              activityType: "other",
              details: {
                staffId: req.user._id,
                staffName: req.user.fullName,
                action: "Staff deleted a doctor",
                doctorId: deletedDoctor._id,
                doctor: deletedDoctor.firstName + ' ' + deletedDoctor.lastName
              },
              reference: {
                model: "Doctor",
                id: deletedDoctor._id
              },
              timestamp: new Date()
            }
          }
        });
      }

  return res.json(new ApiResponse(200, "Doctor deleted successfully"));
});

export {
  addDoctorsController,
  allDoctorsController,
  updateDoctorController,
  deleteDoctorController,
  getDoctorById
};
