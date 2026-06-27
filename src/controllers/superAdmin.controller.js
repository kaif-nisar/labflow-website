// superAdmin.controller.js
import { asyncHandler } from "../utils/asyncHandler.js";
import { SuperAdmin } from "../models/superAdmin.model.js";
import { Tenant } from "../models/tenant.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/apiError.js";
import { Ledger } from "../models/ledger.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  purgeUserDeviceSessions,
  trimUserDeviceSessionsToLimit,
} from "../../middlewares/auth.middleware.js";

import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const DAY_MS = 24 * 60 * 60 * 1000;

const normalizePlanType = (value) => {
  const raw = String(value || "").toLowerCase().trim();
  if (raw === "annual") return "yearly";
  if (raw === "quarterly") return "quaterly";
  return ["monthly", "quaterly", "yearly"].includes(raw) ? raw : "monthly";
};

const getPlanDurationDays = (planType) => {
  if (planType === "yearly") return 365;
  if (planType === "quaterly") return 90;
  return 30;
};

const toPositiveInt = (value, fallback = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.floor(num);
};

const buildGracePeriod = (graceInput, baseEndDate) => {
  const graceDays = toPositiveInt(graceInput?.days || graceInput?.graceDays || 0, 0);
  const graceMonths = toPositiveInt(graceInput?.months || graceInput?.graceMonths || 0, 0);
  const graceHours = toPositiveInt(graceInput?.hours || graceInput?.graceHours || 0, 0);
  const enabled = graceDays > 0 || graceMonths > 0 || graceHours > 0;

  let graceUntil = null;
  if (enabled && baseEndDate) {
    graceUntil = new Date(baseEndDate);
    if (graceMonths > 0) graceUntil.setMonth(graceUntil.getMonth() + graceMonths);
    if (graceDays > 0) graceUntil.setDate(graceUntil.getDate() + graceDays);
    if (graceHours > 0) graceUntil.setHours(graceUntil.getHours() + graceHours);
  }

  return {
    days: graceDays,
    months: graceMonths,
    hours: graceHours,
    isEnabled: enabled,
    graceUntil: enabled ? graceUntil : null,
    note: String(graceInput?.note || graceInput?.graceNote || "").trim(),
  };
};

const formatLocationLabel = (location = {}) => {
  const label = String(location?.label || "").trim();
  if (label) return label;

  const parts = [location?.city, location?.state, location?.country]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return parts.length ? parts.join(", ") : "Unknown location";
};

const normalizeActivityDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getSessionKeyFromActivity = (activity = {}) => {
  return String(
    activity?.details?.sessionHash ||
      activity?.details?.sessionTokenHash ||
      activity?.details?.session_token ||
      activity?.details?.sessionId ||
      activity?.details?.deviceFingerprint ||
      activity?.reference?.id ||
      `${activity?.activityType || "activity"}-${activity?.timestamp || ""}`
  ).trim();
};

const getSessionLocation = (session = {}, activity = null) => {
  const location = session?.location || activity?.details?.location || {};
  return {
    latitude: Number.isFinite(Number(location?.latitude)) ? Number(location.latitude) : null,
    longitude: Number.isFinite(Number(location?.longitude)) ? Number(location.longitude) : null,
    city: String(location?.city || "").trim(),
    state: String(location?.state || "").trim(),
    country: String(location?.country || "").trim(),
    label: formatLocationLabel(location),
    source: String(location?.source || "").trim(),
  };
};

const isSessionCurrentlyActive = (session = {}) => {
  const expiresAt = normalizeActivityDate(session?.expires_at);
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return false;
  }

  const lastActivityAt = normalizeActivityDate(session?.last_activity_at);
  if (!lastActivityAt) {
    return Boolean(session?.session_token);
  }

  return Date.now() - lastActivityAt.getTime() <= 15 * 60 * 1000;
};

const buildDailySeries = (activities = [], days = 30) => {
  const bucket = new Map();
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - index);
    const key = date.toISOString().slice(0, 10);
    bucket.set(key, { label: key, value: 0 });
  }

  activities.forEach((activity) => {
    const date = normalizeActivityDate(activity?.timestamp);
    if (!date) return;
    const key = date.toISOString().slice(0, 10);
    if (bucket.has(key)) {
      bucket.get(key).value += 1;
    }
  });

  return Array.from(bucket.values());
};

const buildHourlySeries = (activities = []) => {
  const bucket = Array.from({ length: 24 }, (_, hour) => ({ hour, value: 0 }));

  activities.forEach((activity) => {
    const date = normalizeActivityDate(activity?.timestamp);
    if (!date) return;
    bucket[date.getHours()].value += 1;
  });

  return bucket;
};

const buildSessionTimeline = (activities = [], activeSessions = []) => {
  const opened = new Map();
  const timeline = [];
  const sorted = [...activities]
    .filter((activity) => activity?.activityType === "login" || activity?.activityType === "logout")
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));

  sorted.forEach((activity) => {
    const key = getSessionKeyFromActivity(activity);
    const timestamp = normalizeActivityDate(activity?.timestamp);
    if (!timestamp || !key) return;

    if (activity.activityType === "login") {
      opened.set(key, activity);
      return;
    }

    if (activity.activityType === "logout") {
      const loginActivity = opened.get(key);
      const loginTime = normalizeActivityDate(loginActivity?.timestamp);
      const logoutTime = timestamp;
      timeline.push({
        sessionHash: key,
        status: "closed",
        loginAt: loginTime,
        logoutAt: logoutTime,
        durationMinutes: loginTime ? Math.max(0, Math.round((logoutTime - loginTime) / 60000)) : 0,
        deviceFingerprint: loginActivity?.details?.deviceFingerprint || activity?.details?.deviceFingerprint || "",
        location: getSessionLocation(
          activeSessions.find((session) => String(session?.session_token || "") === key),
          loginActivity || activity
        ),
      });
      opened.delete(key);
    }
  });

  opened.forEach((loginActivity, key) => {
    const loginTime = normalizeActivityDate(loginActivity?.timestamp);
    const matchedSession = activeSessions.find((session) => String(session?.session_token || "") === key);
    const endTime = normalizeActivityDate(matchedSession?.last_activity_at) || new Date();
    timeline.push({
      sessionHash: key,
      status: "open",
      loginAt: loginTime,
      logoutAt: null,
      durationMinutes: loginTime ? Math.max(0, Math.round((endTime - loginTime) / 60000)) : 0,
      deviceFingerprint: loginActivity?.details?.deviceFingerprint || "",
      location: getSessionLocation(matchedSession, loginActivity),
    });
  });

  return timeline.sort((left, right) => new Date(right.loginAt || 0) - new Date(left.loginAt || 0));
};

const buildMonitoringSummary = (user) => {
  const activities = Array.isArray(user?.activities) ? user.activities : [];
  const activeSessions = Array.isArray(user?.active_sessions) ? user.active_sessions : [];
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  const loginHistory = activities.filter((activity) => activity.activityType === "login");
  const logoutHistory = activities.filter((activity) => activity.activityType === "logout");
  const hourlySeries = buildHourlySeries(activities);
  const dailySeries = buildDailySeries(activities, 30);
  const weeklyActivity = activities.filter((activity) => {
    const date = normalizeActivityDate(activity?.timestamp);
    return date && date.getTime() >= weekAgo;
  }).length;
  const monthlyActivity = activities.filter((activity) => {
    const date = normalizeActivityDate(activity?.timestamp);
    return date && date.getTime() >= monthAgo;
  }).length;
  const todayActivity = activities.filter((activity) => {
    const date = normalizeActivityDate(activity?.timestamp);
    return date && date.toDateString() === new Date().toDateString();
  }).length;
  const activeHours = hourlySeries.reduce((max, item) => item.value > max.value ? item : max, hourlySeries[0] || { hour: 0, value: 0 });
  const inactiveHours = hourlySeries.filter((item) => item.value === 0).length;
  const sessionTimeline = buildSessionTimeline(activities, activeSessions);
  const totalActiveTimeMinutes = sessionTimeline.reduce((total, session) => total + Number(session.durationMinutes || 0), 0);
  const latestSession = activeSessions
    .slice()
    .sort((left, right) => new Date(right?.last_activity_at || 0) - new Date(left?.last_activity_at || 0))[0] || null;

  return {
    activityCounts: {
      total: activities.length,
      today: todayActivity,
      weekly: weeklyActivity,
      monthly: monthlyActivity,
      login: loginHistory.length,
      logout: logoutHistory.length,
    },
    activityTrends: {
      hourlySeries,
      dailySeries,
      peakHour: activeHours?.hour ?? 0,
      inactiveHours,
    },
    sessionMetrics: {
      activeSessionsCount: activeSessions.length,
      totalActiveTimeMinutes,
      latestSession: latestSession
        ? {
            sessionHash: latestSession.session_token,
            lastActivityAt: latestSession.last_activity_at,
            expiresAt: latestSession.expires_at,
            isActive: isSessionCurrentlyActive(latestSession),
            location: getSessionLocation(latestSession),
          }
        : null,
    },
    sessionTimeline,
  };
};

const buildMonitoringUserRecord = (user) => {
  const activeSessions = Array.isArray(user?.active_sessions) ? user.active_sessions : [];
  const activities = Array.isArray(user?.activities) ? user.activities : [];
  const sortedSessions = activeSessions
    .slice()
    .sort((left, right) => new Date(right?.last_activity_at || 0) - new Date(left?.last_activity_at || 0));
  const latestSession = sortedSessions[0] || null;
  const location = latestSession ? getSessionLocation(latestSession) : null;
  const metrics = buildMonitoringSummary(user);

  return {
    _id: user._id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    role: user.role,
    parentRole: user.parentRole,
    isActive: user.isActive,
    lastLogin: user.lastLogin,
    tenant: user.tenantId || null,
    bookingWallet: user.bookingWallet || 0,
    maxAllowedDevices: Number.isFinite(Number(user.max_allowed_devices)) ? Math.min(4, Math.max(1, Number(user.max_allowed_devices))) : 1,
    deviceRestrictionEnabled: user.is_device_restriction_enabled !== false,
    activeSessionCount: activeSessions.length,
    lastSessionAt: latestSession?.last_activity_at || null,
    latestLocation: location,
    latestDeviceFingerprint: latestSession?.device_fingerprint || "",
    latestIpAddress: latestSession?.ip_address || "",
    latestUserAgent: latestSession?.user_agent || "",
    latestExpiresAt: latestSession?.expires_at || null,
    recentActivities: activities.slice().sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp)).slice(0, 25),
    ...metrics,
  };
};

// SuperAdmin Auth Controllers
export const registerSuperAdmin = asyncHandler(async (req, res) => {
  const { username, email, password, fullName, phone } = req.body;
  console.log("Registering Super Admin:", req.body);

  // Validate required fields
  if (!username || !email || !password || !fullName || !phone) {
    return res.status(400).json({
      success: false,
      message: "All fields are required",
    });
  }

  // Check if super admin already exists
  const existingSuperAdmin = await SuperAdmin.findOne({
    $or: [{ username }, { email }],
  });

  if (existingSuperAdmin) {
    return res.status(409).json({
      success: false,
      message: "Super Admin with this username or email already exists",
    });
  }

  // Create super admin
  const superAdmin = await SuperAdmin.create({
    username,
    email,
    password,
    fullName,
    phoneNo: phone,
    role: "superAdmin",
    
  });

  console.log("Super Admin Created:", superAdmin);

  const createdSuperAdmin = await SuperAdmin.findById(superAdmin._id).select(
    "-password -refreshToken"
  );

  return res.status(201).json({
    success: true,
    message: "Super Admin registered successfully",
    superAdmin: createdSuperAdmin,
  });
});

export const loginSuperAdmin = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;
  const identifier = String(username || email || "").trim().toLowerCase();

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      message: "Username/email and password are required",
    });
  }

  // Find super admin
  const superAdmin = await SuperAdmin.findOne({
    $or: [{ username: identifier }, { email: identifier }],
  });

  if (!superAdmin) {
    console.warn(`❌ Login failed: SuperAdmin not found with username/email: ${username || email}`);
    return res.status(401).json({
      success: false,
      message: "Invalid credentials",
    });
  }

  // Check password
  const isPasswordValid = await superAdmin.isPasswordCorrect(password);

  if (!isPasswordValid) {
    console.warn(`❌ Login failed: Invalid password for user ${superAdmin.username}`);
    return res.status(401).json({
      success: false,
      message: "Invalid credentials",
    });
  }

  // Generate tokens
  const accessToken = superAdmin.generateAccessToken();
  const refreshToken = superAdmin.generateRefreshToken();

  // Update refresh token in database
  superAdmin.refreshToken = refreshToken;
  superAdmin.lastLogin = new Date();
  await superAdmin.save({ validateBeforeSave: false });

  console.log(`✅ Login successful for user: ${superAdmin.username}`);

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json({
      success: true,
      message: "Super Admin logged in successfully",
      superAdmin: {
        _id: superAdmin._id,
        username: superAdmin.username,
        email: superAdmin.email,
        fullName: superAdmin.fullName,
      },
      accessToken,
    });
});

// टेनेंट मैनेजमेंट कंट्रोलर
export const createTenant = asyncHandler(async (req, res) => {
  // Extract all details from request body
  const {
    name,
    modelType,
    adminDetails,
    subscriptionPlan,
    addressDetails,
    referralCodeProvided,
  } = req.body;

  // Validate required fields
  if (
    !name ||
    !modelType ||
    !adminDetails ||
    !subscriptionPlan ||
    !addressDetails
  ) {
    return res.status(400).json({ message: "All required fields must be provided" });
  }

  // ✅ FIXED: Validate required admin details
  if (
    !adminDetails.username ||
    !adminDetails.email ||
    !adminDetails.password ||
    !addressDetails.fullName
  ) {
    return res.status(400).json({ message: "Username, email, password, and fullName are required" });
  }

  // Check if requesting user is a superadmin
  const requestingUser = req.user;
  // console.log("Requesting User:", requestingUser.role);
  if (requestingUser.role !== "superAdmin") {
    return res.status(403).json({ message: "Only superadmins can assign tenants" });
  }

  // Check if email or username already exists
  const existingUser = await User.findOne({
    $or: [{ email: adminDetails.email }, { username: adminDetails.username }],
  });

  // console.log("Existing User:", existingUser);
  if (existingUser) {
    return res.status(409).json({ message: "Email or username already exists" });
  }

  // ✅ FIXED: Check referral code validity before transaction
  let referrer = null;
  if (referralCodeProvided) {
    referrer = await User.findOne({
      "referral.referralCode": referralCodeProvided,
    });
    if (!referrer) {
      return res.status(400).json({ message: "Invalid referral code provided" });
    }
  }

  // Create unique code for tenant
  const code =
    name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now().toString(36);

  // ✅ FIXED: Add retry logic for write conflicts
  const MAX_RETRIES = 3;
  let attempt = 0;
  
  while (attempt < MAX_RETRIES) {
    const session = await mongoose.startSession();
    session.startTransaction();

    const normalizedPlanType = normalizePlanType(subscriptionPlan.planType);
    let durationInDays = getPlanDurationDays(normalizedPlanType);
    const requestedDurationDays = toPositiveInt(
      subscriptionPlan.activeForDays || subscriptionPlan.durationDays || 0,
      0
    );
    if (requestedDurationDays > 0) {
      durationInDays = requestedDurationDays;
    }

    const monthlyPrice = Number(subscriptionPlan?.prices?.monthly || 0);
    const quaterlyPrice = Number(subscriptionPlan?.prices?.quaterly || subscriptionPlan?.prices?.quarterly || 0);
    const yearlyPrice = Number(subscriptionPlan?.prices?.yearly || subscriptionPlan?.prices?.annual || 0);
    const fallbackBase = Number(subscriptionPlan?.price || 0);

    const baseMonthly = monthlyPrice > 0
      ? monthlyPrice
      : normalizedPlanType === "yearly" && fallbackBase > 0
        ? fallbackBase / 12
        : normalizedPlanType === "quaterly" && fallbackBase > 0
          ? fallbackBase / 3
          : fallbackBase;

    const resolvedPrices = {
      monthly: Math.round(baseMonthly > 0 ? baseMonthly : 0),
      quaterly: Math.round(quaterlyPrice > 0 ? quaterlyPrice : (baseMonthly > 0 ? baseMonthly * 3 : 0)),
      yearly: Math.round(yearlyPrice > 0 ? yearlyPrice : (baseMonthly > 0 ? baseMonthly * 12 : 0)),
    };

    const selectedPlanPrice =
      normalizedPlanType === "yearly"
        ? resolvedPrices.yearly
        : normalizedPlanType === "quaterly"
          ? resolvedPrices.quaterly
          : resolvedPrices.monthly;

    const startDate = subscriptionPlan?.startDate ? new Date(subscriptionPlan.startDate) : new Date();
    const customEndDate = subscriptionPlan?.endDate ? new Date(subscriptionPlan.endDate) : null;
    const endDate = customEndDate && !Number.isNaN(customEndDate.getTime())
      ? customEndDate
      : new Date(startDate.getTime() + durationInDays * DAY_MS);
    const gracePeriod = buildGracePeriod(subscriptionPlan?.gracePeriod || subscriptionPlan, endDate);

    try {
      // Create tenant
      const tenant = await Tenant.create(
        [
          {
            name,
            modelType,
            code,
            status: "active",
            adminDetails: {
              email: adminDetails.email,
              username: adminDetails.username,
            },
            subscriptionPlan: {
              planType: normalizedPlanType,
              durationDays: durationInDays,
              startDate: startDate,
              endDate: endDate,
              price: selectedPlanPrice || subscriptionPlan.price,
              paymentStatus: subscriptionPlan.paymentStatus || "pending",
              gracePeriod,
            },
            planCatalog: {
              monthly: { price: resolvedPrices.monthly || 0 },
              quaterly: { price: resolvedPrices.quaterly || 0 },
              yearly: { price: resolvedPrices.yearly || 0 },
              currency: subscriptionPlan.currency || "INR",
            },
          },
        ],
        { session }
      );

      // ✅ FIXED: Create admin user data with proper validation
      const adminUserData = {
        username: adminDetails.username.toLowerCase().trim(),
        email: adminDetails.email.toLowerCase().trim(),
        fullName: addressDetails.fullName.toLowerCase().trim(),
        password: adminDetails.password,
        role: "admin",
        bookingWallet: 100000,
        commissionWallet: 0,
        phoneNo: addressDetails.phoneNo ? parseInt(addressDetails.phoneNo) : null,
        state: addressDetails.state?.trim() || "",
        city: addressDetails.city?.trim() || "",
        district: addressDetails.district?.trim() || "",
        postOffice: addressDetails.postOffice?.trim() || "",
        pinCode: addressDetails.pinCode?.trim() || "",
        address: addressDetails.address?.trim() || "",
        createdBy: requestingUser._id,
        parentUser: requestingUser._id,
        parentRole: requestingUser.role,
        tenantId: tenant[0]._id,
        isActive: true,

        // ✅ FIXED: Proper subscription setup
        subscription: {
          plan: normalizedPlanType || "basic",
          amount: selectedPlanPrice || subscriptionPlan.price || 2000,
          durationDays: durationInDays,
          startDate: startDate,
          endDate: endDate,
          isActive: true,
          autoRenew: false,
          gracePeriod,
          renewalHistory: [],
        },

        // ✅ FIXED: Referral system setup
        referral: {
          referredBy: referrer ? referrer._id : null,
          referralCode: null, // Will be auto-generated in pre-save hook
          referredUsers: [],
          totalReferrals: 0,
          totalCommissionEarned: 0,
        },

        // ✅ Required fields initialization
        refreshToken: null,
        lastLogin: null,
        bookingLedger: [],
        commissionLedger: [],
        permissions: {
          canManageBookings: true,
          canManageTest: true,
          canManagePayments: true,
          canViewReports: true,
          canManageUsers: true,
        },
        createdUsers: [],
        pdfFormat: addressDetails.pdfFormat || "reportFormat1",
        activities: [],
        showtestdatabase: addressDetails.showtestdatabase,
        showprintsetting: addressDetails.showprintsetting,
        showRandomBtn: addressDetails.showRandomBtn || false,
      };

      // Create admin user for tenant
      const admin = await User.create([adminUserData], { session });

      // ✅ FIXED: Handle referral within transaction using direct updates
      if (referrer && admin[0]) {
        // ✅ FIXED: Update referrer using session-based operations
        const referralUpdateData = {
          $push: {
            "referral.referredUsers": {
              userId: admin[0]._id,
              joinedAt: new Date(),
              totalCommissionEarned: 0,
            },
            activities: {
              activityType: "other",
              details: {
                type: "new_referral",
                referredUser: adminUserData.fullName,
                referredUserEmail: adminUserData.email,
                referredUserRole: "admin",
                joinedAt: new Date(),
              },
              timestamp: new Date(),
            },
          },
          $inc: {
            "referral.totalReferrals": 1,
          },
          // ✅ Initialize referral fields if they don't exist
          $setOnInsert: {
            "referral.referredBy": referrer.referral?.referredBy || null,
            "referral.referralCode": referrer.referral?.referralCode || null,
            "referral.totalCommissionEarned": referrer.referral?.totalCommissionEarned || 0,
          },
        };

        await User.updateOne(
          { _id: referrer._id },
          referralUpdateData,
          { session, upsert: false }
        );
      }

      // Update tenant with admin user ID
      await Tenant.updateOne(
        { _id: tenant[0]._id },
        { "adminDetails.userId": admin[0]._id },
        { session }
      );

      // Add this new user to the creator's createdUsers array
      await User.updateOne(
        { _id: requestingUser._id },
        { $push: { createdUsers: admin[0]._id } },
        { session }
      );

      // ✅ FIXED: Handle superadmin wallet and ledger
      const currentWallet = Number(requestingUser.bookingWallet) || 0;

      // Record transaction in superadmin's ledger if payment is made
      if (subscriptionPlan.paymentStatus === "paid") {
        const newBalance = currentWallet + (selectedPlanPrice || subscriptionPlan.price || 0);

        // ✅ FIXED: Create ledger entry properly
        await Ledger.create([{
          userId: requestingUser._id,
          username: requestingUser.username,
          role: requestingUser.role,
          transactionId: `TXN-${Date.now()}`,
          type: "credit",
          amount: selectedPlanPrice || subscriptionPlan.price || 0,
          description: `Tenant subscription payment from ${name}`,
          balanceAfterTransaction: newBalance,
          createdAt: new Date(),
        }], { session });

        // Update superadmin's booking wallet
        await User.updateOne(
          { _id: requestingUser._id },
          { bookingWallet: newBalance },
          { session }
        );
      }

      await session.commitTransaction();
      await session.endSession();

      return res.status(201).json({
        success: true,
        message: "Tenant created successfully with admin user",
        tenant: {
          _id: tenant[0]._id,
          name: tenant[0].name,
          modelType: tenant[0].modelType,
          code: tenant[0].code,
          adminDetails: {
            userId: admin[0]._id,
            email: admin[0].email,
            username: admin[0].username,
            referralCode: admin[0].referral.referralCode,
          },
        },
      });

    } catch (error) {
      await session.abortTransaction();
      await session.endSession();

      // ✅ FIXED: Check if it's a write conflict and retry
      if (error.code === 112 && attempt < MAX_RETRIES - 1) {
        attempt++;
        console.log(`Write conflict detected. Retrying... Attempt ${attempt + 1}/${MAX_RETRIES}`);
        // Add a small delay before retry
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
        continue;
      }

      console.error("Tenant creation error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create tenant",
        error: error.message,
      });
    }
  }

  // If we've exhausted all retries
  return res.status(500).json({
    success: false,
    message: "Failed to create tenant after multiple attempts",
    error: "Write conflict - please try again",
  });
});

// Get all tenants (for superadmin)
const getAllTenants = asyncHandler(async (req, res) => {
  // Check if requesting user is a superadmin
  const requestingUser = req.user;
  
  const tenants = await Tenant.find().populate({
    path: "adminDetails.userId",
    select: "username email fullName",
  });

  return res
    .status(200)
    .json(new ApiResponse(200, tenants, "Tenants fetched successfully"));
});

// Get tenant by ID
const getTenantById = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  console.log(tenantId);
  if (!tenantId) {
    throw new ApiError(400, "Tenant ID is required");
  }
  const tenant = await Tenant.findById(tenantId).populate({
    path: "adminDetails.userId",
  });

  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, tenant, "Tenant fetched successfully"));
});

const getUserMonitoringDashboard = asyncHandler(async (req, res) => {
  const page = Math.max(1, toPositiveInt(req.query.page || 1, 1));
  const limit = Math.min(100, Math.max(1, toPositiveInt(req.query.limit || 20, 20)));
  const search = String(req.query.search || "").trim();
  const roleFilter = String(req.query.role || "all").trim();
  const statusFilter = String(req.query.status || "all").trim();
  const requestedUserId = String(req.query.userId || "").trim();

  const query = {
    role: { $ne: "superAdmin" },
  };

  if (roleFilter && roleFilter !== "all") {
    query.role = roleFilter;
  }

  if (statusFilter === "active") {
    query.isActive = true;
  } else if (statusFilter === "inactive") {
    query.isActive = false;
  }

  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { username: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { state: { $regex: search, $options: "i" } },
      { city: { $regex: search, $options: "i" } },
      { district: { $regex: search, $options: "i" } },
    ];
  }

  const total = await User.countDocuments(query);
  const users = await User.find(query)
    .select(
      "fullName username email role parentRole isActive lastLogin bookingWallet max_allowed_devices is_device_restriction_enabled active_sessions activities tenantId createdAt updatedAt"
    )
    .populate({
      path: "tenantId",
      select: "name modelType code status subscriptionPlan analytics",
    })
    .sort({ lastLogin: -1, updatedAt: -1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  const mappedUsers = users.map((user) => buildMonitoringUserRecord(user));
  const allUsers = await User.find(query)
    .select(
      "fullName username email role parentRole isActive lastLogin bookingWallet max_allowed_devices is_device_restriction_enabled active_sessions activities tenantId createdAt updatedAt"
    )
    .populate({
      path: "tenantId",
      select: "name modelType code status subscriptionPlan analytics",
    })
    .sort({ lastLogin: -1, updatedAt: -1, createdAt: -1 });

  const summary = allUsers.reduce(
    (acc, user) => {
      const record = buildMonitoringUserRecord(user);
      acc.totalUsers += 1;
      if (record.isActive) acc.activeUsers += 1;
      if (record.activeSessionCount > 0) acc.onlineUsers += 1;
      acc.totalSessions += record.activeSessionCount;
      acc.totalActivityEvents += record.activityCounts.total;
      acc.totalDeviceLimit += record.maxAllowedDevices;
      if (record.latestLocation?.latitude !== null || record.latestLocation?.longitude !== null) {
        acc.usersWithCoordinates += 1;
      }
      return acc;
    },
    {
      totalUsers: 0,
      activeUsers: 0,
      onlineUsers: 0,
      totalSessions: 0,
      totalActivityEvents: 0,
      totalDeviceLimit: 0,
      usersWithCoordinates: 0,
    }
  );

  const selectedUserDoc =
    (requestedUserId
      ? allUsers.find((user) => String(user._id) === requestedUserId)
      : allUsers[0]) || null;
  const selectedUser = selectedUserDoc ? buildMonitoringUserRecord(selectedUserDoc) : null;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        summary: {
          ...summary,
          averageDeviceLimit: summary.totalUsers
            ? Number((summary.totalDeviceLimit / summary.totalUsers).toFixed(2))
            : 0,
          pagination: {
            page,
            limit,
            total,
            pages: Math.max(1, Math.ceil(total / limit)),
          },
        },
        users: mappedUsers,
        selectedUser,
      },
      "User monitoring data fetched successfully"
    )
  );
});

// Update tenant subscription
const updateTenantSubscription = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { planType, endDate, price, paymentStatus } = req.body;

  if (!tenantId) {
    throw new ApiError(400, "Tenant ID is required");
  }

  // Check if requesting user is a superadmin
  const requestingUser = req.user;
  if (requestingUser.role !== "admin") {
    throw new ApiError(403, "Unauthorized access");
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }

  // Update subscription details
  const updatedTenant = await Tenant.findByIdAndUpdate(
    tenantId,
    {
      "subscription.planType": planType || tenant.subscription.planType,
      "subscription.endDate": endDate || tenant.subscription.endDate,
      "subscription.price": price || tenant.subscription.price,
      "subscription.paymentStatus":
        paymentStatus || tenant.subscription.paymentStatus,
    },
    { new: true }
  );

  // Record transaction if payment status changed to paid
  if (
    paymentStatus === "paid" &&
    tenant.subscription.paymentStatus !== "paid"
  ) {
    await User.findByIdAndUpdate(requestingUser._id, {
      $push: {
        ledger: {
          transactionId: `TXN-${Date.now()}`,
          type: "credit",
          amount: price || tenant.subscription.price,
          description: `Tenant subscription payment from ${tenant.name}`,
          balanceAfterTransaction:
            requestingUser.wallet + (price || tenant.subscription.price),
        },
      },
      $inc: { wallet: price || tenant.subscription.price },
    });
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedTenant,
        "Tenant subscription updated successfully"
      )
    );
});

const updateAdminById = async (req, res) => {
  try {
    const { tenantId } = req.params; // or req.params.id if route differs
    if (!tenantId)
      return res
        .status(400)
        .json({ success: false, message: "modelId is required" });

    // 1. Fetch tenant and populate admin user
    const tenant = await Tenant.findById(tenantId).populate("adminDetails.userId");
    if (!tenant)
      return res.status(404).json({ success: false, message: "Tenant not found" });

    const adminUser = tenant.adminDetails?.userId;
    if (!adminUser) {
      return res.status(404).json({ success: false, message: "Tenant admin user not found" });
    }

    const userId = adminUser._id;

    // 2. Prepare basic updates for User and Tenant
    const userUpdate = {
      fullName: req.body.fullName,
      username: req.body.username,
      email: req.body.email,
      role: req.body.role,
      phoneNo: req.body.phoneNo,
      state: req.body.state,
      district: req.body.district,
      pinCode: req.body.pinCode,
      address: req.body.address,
      bookingWallet: req.body.wallet, // if provided
      isActive: req.body.isActive,
      pdfFormat: req.body.pdfFormat,
      showprintsetting: req.body.showprintsetting,
      showtestdatabase: req.body.showtestdatabase,
      showRandomBtn: req.body.showRandomBtn,
    };

    const currentDeviceLimit = Number.isFinite(Number(adminUser.max_allowed_devices))
      ? Math.min(4, Math.max(1, Number(adminUser.max_allowed_devices)))
      : 1;
    const requestedDeviceLimit = Number.isFinite(Number(req.body.max_allowed_devices ?? req.body.maxAllowedDevices))
      ? Math.min(4, Math.max(1, Number(req.body.max_allowed_devices ?? req.body.maxAllowedDevices)))
      : currentDeviceLimit;
    const requestedDeviceRestriction = req.body.is_device_restriction_enabled;
    const shouldEnableDeviceRestriction = requestedDeviceRestriction === undefined
      ? adminUser.is_device_restriction_enabled !== false
      : requestedDeviceRestriction === true || requestedDeviceRestriction === "true";

    userUpdate.is_device_restriction_enabled = shouldEnableDeviceRestriction;
    userUpdate.max_allowed_devices = requestedDeviceLimit;

    const normalizedPlanType = normalizePlanType(
      req.body.planType || tenant.subscriptionPlan?.planType || adminUser.subscription?.plan
    );
    const durationDaysInput = toPositiveInt(req.body.activeForDays || req.body.durationDays || 0, 0);
    const computedDurationDays = durationDaysInput > 0 ? durationDaysInput : getPlanDurationDays(normalizedPlanType);

    const catalogMonthly = Number(req.body.monthlyPrice ?? req.body.planMonthlyPrice ?? tenant?.planCatalog?.monthly?.price ?? 0);
    const catalogQuaterly = Number(req.body.quaterlyPrice ?? req.body.planQuaterlyPrice ?? tenant?.planCatalog?.quaterly?.price ?? 0);
    const catalogYearly = Number(req.body.yearlyPrice ?? req.body.planYearlyPrice ?? tenant?.planCatalog?.yearly?.price ?? 0);
    const fallbackPrice = Number(req.body.price ?? tenant.subscriptionPlan?.price ?? adminUser.subscription?.amount ?? 0);
    const normalizedCatalog = {
      monthly: catalogMonthly > 0 ? catalogMonthly : fallbackPrice,
      quaterly: catalogQuaterly > 0 ? catalogQuaterly : (catalogMonthly > 0 ? catalogMonthly * 3 : fallbackPrice),
      yearly: catalogYearly > 0 ? catalogYearly : (catalogMonthly > 0 ? catalogMonthly * 12 : fallbackPrice),
    };
    const planPriceByType =
      normalizedPlanType === "yearly"
        ? normalizedCatalog.yearly
        : normalizedPlanType === "quaterly"
          ? normalizedCatalog.quaterly
          : normalizedCatalog.monthly;
    const resolvedPlanPrice = Number(req.body.price ?? planPriceByType ?? fallbackPrice ?? 0);

    const tenantUpdate = {
      "subscriptionPlan.planType": normalizedPlanType,
      "subscriptionPlan.durationDays": computedDurationDays,
      "subscriptionPlan.price": resolvedPlanPrice,
      "subscriptionPlan.paymentStatus": req.body.paymentStatus,
      "planCatalog.monthly.price": Number(normalizedCatalog.monthly || 0),
      "planCatalog.quaterly.price": Number(normalizedCatalog.quaterly || 0),
      "planCatalog.yearly.price": Number(normalizedCatalog.yearly || 0),
      name: req.body.fullName,
      status: req.body.isActive,
      "adminDetails.email": req.body.email,
      "adminDetails.username": req.body.username,
    };

    // 3. Apply updates to User
    await User.findByIdAndUpdate(userId, userUpdate, { new: true });

    if (req.body.purgeAllSessions === true || req.body.purgeAllSessions === "true") {
      await purgeUserDeviceSessions(userId);
    } else if (shouldEnableDeviceRestriction && requestedDeviceLimit < currentDeviceLimit) {
      await trimUserDeviceSessionsToLimit(userId, requestedDeviceLimit);
    }

    const findUser = await User.findById(userId);
    // 4. Handle manual activation / payment

    // Accept either paymentAmount OR manualActivate flag OR paymentStatus === 'paid'
    const paymentAmount = Number(req.body.paymentAmount || 0);
    const manualActivate = req.body.manualActivate === true || req.body.manualActivate === 'true';
    const paymentStatus = req.body.paymentStatus;
    const planType = normalizedPlanType;
    const customEndDateInput = req.body.customExpiryDate || req.body.endDate || null;
    const explicitEndDate = customEndDateInput ? new Date(customEndDateInput) : null;
    const hasExplicitEndDate = explicitEndDate && !Number.isNaN(explicitEndDate.getTime());
    const hasGraceInput = ["graceDays", "graceMonths", "graceHours", "graceNote"].some((key) => req.body[key] !== undefined);
    const hasSubscriptionOverrides =
      durationDaysInput > 0 ||
      hasExplicitEndDate ||
      hasGraceInput ||
      req.body.planType !== undefined ||
      req.body.price !== undefined ||
      req.body.monthlyPrice !== undefined ||
      req.body.quaterlyPrice !== undefined ||
      req.body.yearlyPrice !== undefined;

    let shouldActivate = false;
    if (manualActivate || paymentStatus === 'paid' || paymentAmount > 0 || hasSubscriptionOverrides) shouldActivate = true;

    if (shouldActivate) {
      // Compute duration based on planType
      const now = new Date();
      let durationDays = computedDurationDays;
      if (!durationDays || durationDays <= 0) durationDays = getPlanDurationDays(planType);
      const extendFromCurrent = req.body.extendFromCurrent === true || req.body.extendFromCurrent === 'true';

      // Compute new end date by extending existing endDate if subscription is already active
      const tenantCurrentEnd = tenant.subscriptionPlan?.endDate ? new Date(tenant.subscriptionPlan.endDate) : null;
      const userCurrentEnd = adminUser.subscription?.endDate ? new Date(adminUser.subscription.endDate) : null;

      const addedMs = durationDays * DAY_MS;

      let newTenantEnd;
      if (hasExplicitEndDate) {
        newTenantEnd = explicitEndDate;
      } else if (extendFromCurrent && tenantCurrentEnd && tenant.subscriptionPlan?.isActive && tenantCurrentEnd.getTime() > now.getTime()) {
        newTenantEnd = new Date(tenantCurrentEnd.getTime() + addedMs);
      } else {
        newTenantEnd = new Date(now.getTime() + addedMs);
      }

      let newUserEnd;
      if (hasExplicitEndDate) {
        newUserEnd = explicitEndDate;
      } else if (extendFromCurrent && userCurrentEnd && adminUser.subscription?.isActive && userCurrentEnd.getTime() > now.getTime()) {
        newUserEnd = new Date(userCurrentEnd.getTime() + addedMs);
      } else {
        // If user has no prior subscription, set startDate to now
        newUserEnd = new Date(now.getTime() + addedMs);
      }

      const gracePeriod = buildGracePeriod(req.body, newTenantEnd);

      // Update Tenant subscriptionPlan (set startDate to existing start if present and active)
      const tenantStartToSet = (tenant.subscriptionPlan?.isActive && tenant.subscriptionPlan?.startDate) ? tenant.subscriptionPlan.startDate : now;

      await Tenant.findByIdAndUpdate(tenantId, {
        $set: {
          'subscriptionPlan.isActive': true,
          'subscriptionPlan.paymentStatus': paymentStatus || 'paid',
          'subscriptionPlan.planType': planType,
          'subscriptionPlan.durationDays': durationDays,
          'subscriptionPlan.startDate': tenantStartToSet,
          'subscriptionPlan.endDate': newTenantEnd,
          'subscriptionPlan.price': resolvedPlanPrice,
          'subscriptionPlan.gracePeriod': gracePeriod,
        }
      }, { new: true });

      // Update admin user's subscription too (preserve existing startDate if active)
      const userStartToSet = (adminUser.subscription?.isActive && adminUser.subscription?.startDate) ? adminUser.subscription.startDate : now;

      // Create a shared transaction id to use in renewal history and ledger
      const txnId = `TXN-${Date.now()}`;

      await User.findByIdAndUpdate(userId, {
        $set: {
          'subscription.plan': planType,
          'subscription.amount': resolvedPlanPrice,
          'subscription.durationDays': durationDays,
          'subscription.startDate': userStartToSet,
          'subscription.endDate': newUserEnd,
          'subscription.gracePeriod': gracePeriod,
          'subscription.isActive': true,
          isActive: true,
        },
        $push: {
          'subscription.renewalHistory': {
            renewedAt: now,
            amount: paymentAmount || req.body.price || tenant.subscriptionPlan?.price || 0,
            paymentMethod: paymentAmount > 0 ? (req.body.paymentMethod || 'cash') : (req.body.paymentMethod || 'manual'),
            transactionId: txnId,
          },
          activities: {
            activityType: 'subscription_renewal',
            details: {
              amount: paymentAmount || req.body.price || tenant.subscriptionPlan?.price || 0,
              method: paymentAmount > 0 ? (req.body.paymentMethod || 'cash') : 'manual',
              processedBy: req.user?._id || null,
            },
            timestamp: new Date()
          }
        }
      }, { new: true });

      // Create ledger entry and update requesting user's bookingWallet (credit)
      if (paymentAmount > 0 && findUser && findUser._id) {
        // Get fresh requesting user document
        const requestingUser = await User.findById(findUser._id);

        const previousWallet = Number(requestingUser?.bookingWallet || 0);

        const newBalance = previousWallet + paymentAmount;

        // Create central ledger entry (use Ledger model). We won't push into requesting user's bookingLedger.
        await Ledger.create({
          userId: findUser._id,
          username: (requestingUser && requestingUser.username) || (findUser && findUser.username) || 'superAdmin',
          role: (requestingUser && requestingUser.role) || (findUser && findUser.role) || 'superAdmin',
          transactionId: txnId,
          type: 'credit',
          amount: paymentAmount,
          description: `Manual subscription payment for tenant ${tenant.name}`,
          balanceAfterTransaction: newBalance,
          createdAt: new Date(),
        });
      }
    }

    // 5. Update Tenant with general fields
    await Tenant.findByIdAndUpdate(tenantId, { $set: tenantUpdate }, { new: true });

    return res.json({
      success: true,
      message: 'Admin & subscription updated successfully!',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Update failed', error: err.message });
  }
};
// Deactivate tenant
const deactivateTenant = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;

  if (!tenantId) {
    throw new ApiError(400, "Tenant ID is required");
  }

  // Check if requesting user is a superadmin
  const requestingUser = req.user;
  if (requestingUser.role !== "admin") {
    throw new ApiError(403, "Unauthorized access");
  }

  const updatedTenant = await Tenant.findByIdAndUpdate(
    tenantId,
    { isActive: false },
    { new: true }
  );

  if (!updatedTenant) {
    throw new ApiError(404, "Tenant not found");
  }

  // Also deactivate the admin user
  await User.findByIdAndUpdate(updatedTenant.admin, { isActive: false });

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedTenant, "Tenant deactivated successfully")
    );
});

// add staff
const addSuperStaff = asyncHandler(async (req, res) => {
  const { fullName, email, phoneNo, username, password, permissions } =
    req.body;
  const requestingUser = req.user;

  console.log("Requesting User:", requestingUser);
  console.log("Requesting User ID:", requestingUser._id);

  // Validate required field
  if (!fullName || !email || !phoneNo || !username || !password) {
    return res.status(400).json({
      success: false,
      message: "All fields are required",
    });
  }
  // Check if email or username already exists
  const existingUser = await SuperAdmin.findOne({
    $or: [{ email }, { username }],
  });
  if (existingUser) {
    throw new ApiError(400, "Email or username already exists");
  }
  // Create new staff user
  const staff = await SuperAdmin.create({
    username,
    email,
    fullName,
    password,
    role: "staff",
    phoneNo,
    createdBy: requestingUser._id,
    hierarchyPath: "/",
    isActive: true,
    parentRole: requestingUser.role,
    parentUser: requestingUser._id,
    permissions: permissions || {},
  });
  if (!staff) {
    throw new ApiError(500, "Failed to create staff user");
  }
  // Add this new user to the creator's createdUsers array
  // await
  // SuperAdmin.find
  //   .findByIdAndUpdate(requestingUser._id, {
  //     $push: { createdUsers: staff._id },
  //   });
  // Return success response
  return res.status(201).json({
    success: true,

    message: "Staff created successfully",
    staff: {
      _id: staff._id,
      username: staff.username,
      email: staff.email,
      fullName: staff.fullName,
      role: staff.role,
    },
  });
});

const logOutSuperAdmin = asyncHandler(async (req, res) => {
  // Clear cookies and remove refresh token from DB if needed
  const user = req.user;
  if (user) {
    // Remove refreshToken from DB (optional, if you store it)
    user.refreshToken = null;
    await user.save({ validateBeforeSave: false });
  }

  res.clearCookie("accessToken").clearCookie("refreshToken").status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});


// // 1. Get all tenants with pagination and filtering
// app.get('/api/tenants', async (req, res) => {
//     try {
//         const { 
//             page = 1, 
//             limit = 50, 
//             status, 
//             search,
//             sortBy = 'createdAt',
//             sortOrder = 'desc'
//         } = req.query;

//         // Build filter object
//         const filter = {};
//         if (status && status !== 'all') {
//             filter.status = status === 'active' ? 'true' : 'false';
//         }
//         if (search) {
//             filter.$or = [
//                 { name: { $regex: search, $options: 'i' } },
//                 { email: { $regex: search, $options: 'i' } },
//                 { 'adminDetails.email': { $regex: search, $options: 'i' } }
//             ];
//         }

//         // Build sort object
//         const sort = {};
//         sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

//         const options = {
//             page: parseInt(page),
//             limit: parseInt(limit),
//             sort
//         };

//         const tenants = await Tenant.find(filter)
//             .sort(sort)
//             .limit(limit * 1)
//             .skip((page - 1) * limit)
//             .exec();

//         const total = await Tenant.countDocuments(filter);

//         res.json({
//             success: true,
//             data: tenants,
//             pagination: {
//                 current: page,
//                 pages: Math.ceil(total / limit),
//                 total,
//                 limit: parseInt(limit)
//             }
//         });
//     } catch (error) {
//         console.error('Error fetching tenants:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to fetch tenants',
//             error: error.message
//         });
//     }
// });

// // 2. Get tenant by ID
// app.get('/api/tenants/:id', async (req, res) => {
//     try {
//         const tenant = await Tenant.findById(req.params.id);

//         if (!tenant) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Tenant not found'
//             });
//         }

//         // Get booking statistics for this tenant
//         const bookingStats = await NewBooking.aggregate([
//             { $match: { tenantId: new mongoose.Types.ObjectId(req.params.id) } },
//             {
//                 $group: {
//                     _id: null,
//                     totalBookings: { $sum: 1 },
//                     totalRevenue: { $sum: '$total' },
//                     activeBookings: {
//                         $sum: { $cond: [{ $eq: ['$status', 'Confirmed'] }, 1, 0] }
//                     },
//                     completedBookings: {
//                         $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] }
//                     }
//                 }
//             }
//         ]);

//         const stats = bookingStats[0] || {
//             totalBookings: 0,
//             totalRevenue: 0,
//             activeBookings: 0,
//             completedBookings: 0
//         };

//         res.json({
//             success: true,
//             data: {
//                 ...tenant.toObject(),
//                 bookingStats: stats
//             }
//         });
//     } catch (error) {
//         console.error('Error fetching tenant:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to fetch tenant',
//             error: error.message
//         });
//     }
// });

export {
  // l
  getAllTenants,
  getTenantById,
  getUserMonitoringDashboard,
  updateTenantSubscription,
  deactivateTenant,
  addSuperStaff,
  updateAdminById,
  logOutSuperAdmin,
};

// अन्य कंट्रोलर्स...
