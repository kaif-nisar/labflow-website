import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Ledger } from "../models/ledger.model.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { unitdb } from "../models/category.model.js";
import { User } from "../models/user.model.js";
import { Tenant } from "../models/tenant.model.js";
import {
  prepareUserDeviceSession,
  removeUserDeviceSession,
  replaceUserDeviceSessionToken,
  getSessionTokenHash,
  resolveLocationDataFromRequest,
} from "../../middlewares/auth.middleware.js";

const isChildHierarchyRole = (role, parentRole) => {
  const childRoles = ["superFranchisee", "franchisee", "subFranchisee"];
  if (childRoles.includes(String(role || ""))) return true;
  if (String(role || "") === "staff" && childRoles.includes(String(parentRole || ""))) return true;
  return false;
};

const isTenantSubscriptionLocked = (tenant) => {
  const subscription = tenant?.subscriptionPlan || {};
  const endDate = subscription?.endDate ? new Date(subscription.endDate) : null;
  const graceUntil = subscription?.gracePeriod?.graceUntil
    ? new Date(subscription.gracePeriod.graceUntil)
    : null;
  const effectiveEnd = graceUntil || endDate;
  const expiredByDate = effectiveEnd ? new Date() > effectiveEnd : false;
  const isActiveByFlag = subscription?.isActive === true;
  return !isActiveByFlag || expiredByDate;
};
// generate accessToken and refreshToken for user to close session
const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    // save refresh token in data base

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      501,
      "something went wrong while generating access and refresh token"
    );
  }
};
// User registration Session

const registerUser = asyncHandler(async (req, res) => {
  const {
    fullName,
    email,
    username,
    password,
    state,
    city,
    district,
    postOffice,
    pinCode,
    address,
    phoneNo,
    role,
  } = req.body;
  if (
    [fullName, email, username, password, phoneNo].some(
      (field) => field?.trim() === ""
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const alreadyExist = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (alreadyExist) {
    throw new ApiError(409, "your username and email already exist");
  }
  const user = await User.create({
    fullName,
    username,
    password,
    email,
    role: "admin",
    state,
    city,
    district,
    postOffice,
    pinCode,
    address,
    phoneNo,
    wallet: role == "admin" ? 1000000 : 0,
  });
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );
  if (!createdUser) {
    throw new ApiError(500, "Something went wrong registring the new user");
  }
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "user registerd"));
});

// User login session

// ✅ 1. UPDATED LOGIN CONTROLLER - Subscription check at login
const loginUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  // Ensure either username or email is provided
  if (!(username || email)) {
    return res.status(400).json({ message: "Email or username is required." });
  }

  // Find user by username or email
  const user = await User.findOne({
    $or: [{ username }, { email }],
  }).populate({
    path: "createdBy",
    select: "role tenantId",
  });

  // Check if user exists and password is correct
  if (!user || !(await user.isPasswordCorrect(password))) {
    return res.status(401).json({
      success: false,
      message: "Invalid credentials",
    });
  }

  const tenant = await Tenant.findById(user.tenantId).select("subscriptionPlan");
  if (tenant && isChildHierarchyRole(user.role, user.parentRole) && isTenantSubscriptionLocked(tenant)) {
    return res.status(403).json({
      success: false,
      subscriptionLocked: true,
      message: "Parent client subscription is inactive. Child portal login is blocked until recharge.",
    });
  }

  // ✅ CRITICAL: Check subscription status BEFORE allowing login
  // if (user.isSubscriptionExpired()) {
  //     // Deactivate expired subscription (update in database)
  //     await user.deactivateExpiredSubscription();

  //     return res.status(403).json({
  //         success: false,
  //         message: "Your subscription has expired. Please renew to continue access.",
  //         subscriptionExpired: true,
  //         subscriptionDetails: {
  //             plan: user.subscription.plan,
  //             expiredAt: user.subscription.endDate,
  //             renewalUrl: "/renew-subscription"
  //         }
  //     });
  // }

  // ✅ CRITICAL: Check subscription but allow login for renewal
  let subscriptionStatus = "active";
  let subscriptionMessage = null;

  if (user.isSubscriptionExpired()) {
    subscriptionStatus = "expired";
    subscriptionMessage =
      "Your subscription has expired. Renew to access premium features.";
    // Don't deactivate here - let them login to renew
  } else if (user.isSubscriptionExpiringSoon()) {
    subscriptionStatus = "expiring";
    const daysLeft = Math.ceil(
      (user.subscription.endDate - new Date()) / (1000 * 60 * 60 * 24)
    );
    subscriptionMessage = `Your subscription expires in ${daysLeft} days`;
  }

  // ✅ Allow login even if subscription expired (for renewal process)
  // Only block if account is manually deactivated by admin
  if (!user.isActive && !user.isSubscriptionExpired()) {
    return res.status(403).json({
      success: false,
      message: "Your account has been deactivated. Please contact support.",
      accountDeactivated: true,
    });
  }
  if (!user.parentUser && user.createdBy) {
    user.parentUser = user.createdBy;
  }

  // Generate access and refresh tokens and register the device session before granting access.
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  const decodedAccessToken = jwt.decode(accessToken);
  const accessTokenExpiresAt = decodedAccessToken?.exp
    ? new Date(decodedAccessToken.exp * 1000)
    : null;
  const deviceFingerprint = String(
    req.body?.deviceFingerprint ||
      req.header("x-device-fingerprint") ||
      ""
  ).trim();
  const locationData = resolveLocationDataFromRequest(req);
  const ipAddress = String(
    (req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      ""
  ).trim();
  const userAgent = String(req.headers?.["user-agent"] || "").trim();

  await prepareUserDeviceSession(user, {
    accessToken,
    deviceFingerprint,
    ipAddress,
    userAgent,
    expiresAt: accessTokenExpiresAt,
    location: locationData,
    setFields: {
      refreshToken,
    },
  });

  await user.logActivity("login", {
    deviceFingerprint,
    ipAddress,
    userAgent,
    location: locationData,
    sessionHash: getSessionTokenHash(accessToken),
    loginAt: new Date(),
  });

  // Create user data for frontend
  const userData = {
    _id: user._id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.createdBy?.role || user.role,
    myrole: user.role,
    modelType: user.parentUser?.tenantId?.modelType || user.tenantId?.modelType,
    subscription: {
      plan: user.subscription.plan,
      isActive: user.subscription.isActive,
      endDate: user.subscription.endDate,
      isExpiringSoon: user.isSubscriptionExpiringSoon(),
    },
  };

  // Cookie options for production
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // Only HTTPS in production
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  };

  // Set cookies
  res.cookie("refreshToken", refreshToken, options);
  res.cookie("accessToken", accessToken, options);

  // Send response with subscription warning if needed
  const response = {
    statusCode: 200,
    accessToken,
    refreshToken,
    userData,
    message: "User logged in successfully",
    success: true,
  };

  // Add subscription warning if expiring soon
  if (user.isSubscriptionExpiringSoon()) {
    const daysLeft = Math.ceil(
      (user.subscription.endDate - new Date()) / (1000 * 60 * 60 * 24)
    );
    response.subscriptionWarning = {
      message: `Your subscription expires in ${daysLeft} days`,
      daysLeft: daysLeft,
      renewalUrl: "/renew-subscription",
    };
  }

  return res.status(200).json({
    statusCode: 200,
    accessToken,
    refreshToken,
    userData,
    message: "User logged in successfully",
    success: true,
    ...(user.isSubscriptionExpiringSoon() && {
      subscriptionWarning: {
        message: `Your subscription expires in ${Math.ceil(
          (user.subscription.endDate - new Date()) / (1000 * 60 * 60 * 24)
        )} days`,
        daysLeft: Math.ceil(
          (user.subscription.endDate - new Date()) / (1000 * 60 * 60 * 24)
        ),
        renewalUrl: "/renew-subscription",
      },
    }),
  });
});

//user logout functnality
const logOutUser = asyncHandler(async (req, res) => {
  const accessToken =
    req.cookies?.accessToken ||
    req.header("x-session-token") ||
    req.body?.accessToken ||
    "";

  if (accessToken) {
    await req.user.logActivity("logout", {
      sessionHash: getSessionTokenHash(accessToken),
      ipAddress:
        String((req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || req.socket?.remoteAddress || "").trim(),
      userAgent: String(req.headers?.["user-agent"] || "").trim(),
      logoutAt: new Date(),
    });
    await removeUserDeviceSession(req.user._id, accessToken);
  }

  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

// Get current user details
const getCurrentUser = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ApiError(401, "Unauthorized - User not found in request");
  }

  const user = await User.findById(req.user._id).select(
    "-password -refreshToken"
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(
    new ApiResponse(200, user, "Current user retrieved successfully")
  );
});

// GENRATER ACCESS TOKEN AGAIN BASE ON REFRESH TOKEN FOR LOGIN LAST EVENT
const refreshAccessToken = asyncHandler(async (req, res) => {
  const incommingRefreshToken =
    req.cookies?.refreshToken ||
    req.body?.refreshToken ||
    req.header("x-refresh-token");

  if (!incommingRefreshToken) {
    throw new ApiError(402, "unathorized access");
  }

  try {
    const decodedToken = jwt.verify(
      incommingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);
    if (!user) {
      throw new ApiError(402, "invalid refresh Token");
    }

    const currentAccessToken =
      req.cookies?.accessToken ||
      req.header("x-session-token") ||
      req.header("Authorization")?.replace(/^Bearer\s+/i, "") ||
      "";

    if (user.is_device_restriction_enabled !== false) {
      if (!currentAccessToken) {
        throw new ApiError(401, "This session has been revoked. Please login again.");
      }

      const currentSessionHash = getSessionTokenHash(currentAccessToken);
      const hasActiveSession = Array.isArray(user.active_sessions)
        && user.active_sessions.some(
          (session) => String(session?.session_token || "") === currentSessionHash
        );

      if (!hasActiveSession) {
        throw new ApiError(401, "This session has been revoked. Please login again.");
      }
    }

    const accessToken = user.generateAccessToken();
    const newRefreshToken = user.generateRefreshToken();
    const decodedAccessToken = jwt.decode(accessToken);
    const accessTokenExpiresAt = decodedAccessToken?.exp
      ? new Date(decodedAccessToken.exp * 1000)
      : null;
    const deviceFingerprint = String(
      req.body?.deviceFingerprint ||
        req.header("x-device-fingerprint") ||
        ""
    ).trim();
    const locationData = resolveLocationDataFromRequest(req);
    const ipAddress = String(
      (req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() ||
        req.ip ||
        req.socket?.remoteAddress ||
        ""
    ).trim();
    const userAgent = String(req.headers?.["user-agent"] || "").trim();

    if (currentAccessToken) {
      const sessionUpdate = await replaceUserDeviceSessionToken(
        user._id,
        currentAccessToken,
        accessToken,
        {
          deviceFingerprint,
          ipAddress,
          userAgent,
          expiresAt: accessTokenExpiresAt,
          location: locationData,
        }
      );

      if (user.is_device_restriction_enabled !== false && !sessionUpdate?.modifiedCount) {
        throw new ApiError(401, "This session has been revoked. Please login again.");
      }
    } else {
      await prepareUserDeviceSession(user, {
        accessToken,
        deviceFingerprint,
        ipAddress,
        userAgent,
        expiresAt: accessTokenExpiresAt,
        location: locationData,
        setFields: {
          refreshToken: newRefreshToken,
        },
      });
    }

    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    const options = {
      httpOnly: true,
      secure: true,
    };

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshToken: newRefreshToken,
          },
          "Access Token Refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid Refresh Token");
  }
});

// superFranchisee create
const superFranchiseeCreate = asyncHandler(async (req, res) => {
  try {
    const {
      username,
      email,
      fullName,
      role,
      password,
      phoneNo,
      address,
      pinCode,
      state,
      city,
      district,
      postOffice,
    } = req.body;
    // Get creator's information
    let userId;
    let userRole;
    if (req.user.role === "staff") {
      // Agar staff hai to parentUser ke according test lana hai
      userId = req.user.parentUser;
      userRole = req.user.parentRole;
    } else {
      userId = req.user._id;
      userRole = req.user.role;
    }
    const creator = req.user;
    const tenantId = creator.tenantId;
    // Check if user has permission to create this role

    const canCreate = checkCreationPermission(
      userRole,
      role,
      tenantId.modelType
    );
    console.log("canCreate", canCreate);

    if (!canCreate) {
      return res.status(403).json({
        success: false,
        message: `As a ${creator.role}, you don't have permission to create a ${role}`,
      });
    }

    // Check if username or email already exists
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Username or Email already exists",
      });
    }

    // Create new user
    const newUser = await User.create({
      username: (req.user.username + username),
      email,
      fullName,
      role,
      password,
      phoneNo,
      address,
      pinCode,
      state,
      city,
      district,
      postOffice,
      parentUser: userId,
      parentRole: creator.role,
      tenantId: tenantId._id,
      createdBy: userId,
    });

    if (!newUser) {
      res.status(402).json({ massage: "Something went wrong creating franchisee" })
    }
    // Update the creator's createdUsers array
    await User.findByIdAndUpdate(userId, {
      $push: { createdUsers: newUser._id },
    });

    // Update tenant analytics
    await Tenant.findByIdAndUpdate(tenantId._id, {
      $inc: { "analytics.totalUsers": 1 },
    });

    // अगर staff का parentUser है तो उसे भी notify करें
    if (req.user.role === 'staff') {
      await User.findByIdAndUpdate(req.user._id, {
        $push: {
          activities: {
            activityType: "user_management",
            details: {
              staffId: req.user._id,
              staffName: req.user.fullName,
              action: `${req.user.fullName} created has new franchisee`,
              franchiseeName: fullName,
              franchiseeId: newUser._id
            },
            reference: {
              model: "franchisee",
              id: newUser._id
            },
            timestamp: new Date()
          }
        }
      });
    }

    return res.status(201).json({
      success: true,
      message: `${role} created successfully`,
      user: {
        _id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        fullName: newUser.fullName,
      },
    });
  } catch (error) {
    console.error("Create user error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Helper function to check if user can create specific role
function checkCreationPermission(creatorRole, newRole, modelType) {
  // console.log(creatorRole, newRole, modelType)
  // Create a hierarchy of roles
  const roleHierarchy = {
    admin: ["superFranchisee", "franchisee", "subFranchisee"],
    superFranchisee: ["franchisee", "subFranchisee"],
    franchisee: ["subFranchisee"],
    subFranchisee: [],
  };

  // Check if creator can create this role
  if (!roleHierarchy[creatorRole].includes(newRole)) {
    console.log(`Role ${creatorRole} cannot create ${newRole} we are fail`);
    return false;
  }

  // Check model type restrictions
  switch (modelType) {
    case "1layer":
      // Admin can only create regular users, not franchisees
      return false;
    case "2layer":
      // Admin can create superFranchisees only
      return newRole === "superFranchisee";
    case "3layer":
      // Only allow creating roles up to franchisee level
      return newRole !== "superFranchisee";
    case "4layer":
      // All roles can be created
      return true;
    default:
      return false;
  }
}

const getMyFranchisees = asyncHandler(async (req, res) => {
  // Assuming you have user info in req.user
  let userId;
  if (req.user.role === 'staff') {
    userId = req.user.parentUser;
  } else {
    userId = req.user._id;
  }
  const tid = req.user.tenantId._id;
  const franchisees = await User.find({
    tenantId: tid,
    createdBy: userId,
    role: { $ne: 'staff' }
  })
    .select("-password -refreshToken") // Exclude sensitive info
    .populate("createdUsers", "fullName username"); // Optionally populate created users

  if (!franchisees.length) {
    return res
      .status(200)
      .json(new ApiResponse(200, [], "No franchisees found"));
  }

  return res
    .status(200)
    .json(new ApiResponse(200, franchisees, "Get franchisee successfully"));
  // return res.status(200).json(new ApiResponse(200, franchisees, "Franchisees retrieved successfully"));
});

// Utility function to generate transaction number

function generateTransactionNumber() {
  const prefix = "#CR";
  const timestamp = Date.now().toString(); // Current timestamp as a unique number
  return prefix + timestamp;
}

// Send money from Admin to Super Franchisee
const moneyDebitFromSuperFranchisee = asyncHandler(async (req, res) => {

  const { adminId, superId, amount } = req.body;

  console.log("adminId:", adminId);
  console.log("superID:", superId);
  console.log("amount:", amount);
  console.log(typeof adminId);
  console.log(typeof superd);
  const admin = await User.findById(adminId);
  const superFranchisee = await User.findById(superId);

  if (!admin || !superFranchisee) {
    return res
      .status(404)
      .json({ message: "Admin or Super Franchisee not found" });
  }

  if (admin.bookingWallet < amount) {
    return res.status(400).json({ message: "Insufficient admin balance" });
  }

  admin.bookingWallet -= amount;
  superFranchisee.bookingWallet += amount;

  await admin.save();
  await superFranchisee.save();

  const transactionNumber = generateTransactionNumber();

  // Create ledger entry for Admin
  await Ledger.create({
    userId: admin._id,
    amount: amount,
    type: "debit",
    description: `Transferred to Super Franchisee ID: ${superFranchisee._id}`,
    balanceAfterTransaction: admin.bookingWallet,
    transactionId: transactionNumber,
    remarks: `Online payment`,
    username: `${admin.username}/${superFranchisee.username}`,
  });

  // Create ledger entry for Super Franchisee
  await Ledger.create({
    userId: superFranchisee._id,
    amount: amount,
    type: "credit",
    description: `Received from Admin ID: ${admin._id}`,
    balanceAfterTransaction: superFranchisee.bookingWallet,
    transactionId: transactionNumber,
    remarks: `Online Payment`,
    username: `${superFranchisee.username}/${admin.username}`,
  });
  if (req.user.role === 'staff') {
    await User.findByIdAndUpdate(req.user._id, {
      $push: {
        activities: {
          activityType: "payment",
          details: {
            staffId: req.user._id,
            staffName: req.user.fullName,
            action: "Staff Deduct money to Franchisee",
            franchiseeName: superFranchisee.fullName,
            franchiseeId: superFranchisee._id,
            Amount: amount
          },
          reference: {
            model: "franchisee",
            id: superFranchisee._id
          },
          timestamp: new Date()
        }
      }
    });
  }
  return res.status(200).json({ 
    success: true,
    data: {
      adminWallet: admin.bookingWallet
    }
   });
});

const moneyDebitFromFranchisee = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { adminId, franchiseeId, amount } = req.body;

    // 🛑 Validation
    if (!amount || amount <= 0) {
      throw new Error("Invalid transfer amount");
    }

    const admin = await User.findById(adminId).session(session);
    const franchisee = await User.findById(franchiseeId).session(session);

    if (!admin || !franchisee) {
      throw new Error("Admin or Franchisee not found");
    }

    // 🛑 Check franchisee balance (IMPORTANT FIX)
    if (franchisee.bookingWallet < amount) {
      throw new Error("Franchisee has insufficient balance");
    }

    // 💸 TRANSFER (Franchisee ➜ Admin)
    franchisee.bookingWallet -= amount; // debit from franchisee
    admin.bookingWallet += amount;      // credit to admin

    await franchisee.save({ session });
    await admin.save({ session });

    const transactionNumber = generateTransactionNumber();

    // 📒 Ledger — Franchisee (DEBIT)
    await Ledger.create([{
      userId: franchisee._id,
      amount: amount,
      type: "debit",
      description: `Transferred to Admin ID: ${admin._id}`,
      balanceAfterTransaction: franchisee.bookingWallet,
      transactionId: transactionNumber,
      remarks: "Wallet Transfer",
      username: `${franchisee.username}/${admin.username}`,
    }], { session });

    // 📒 Ledger — Admin (CREDIT)
    await Ledger.create([{
      userId: admin._id,
      amount: amount,
      type: "credit",
      description: `Received from Franchisee ID: ${franchisee._id}`,
      balanceAfterTransaction: admin.bookingWallet,
      transactionId: transactionNumber,
      remarks: "Wallet Transfer",
      username: `${admin.username}/${franchisee.username}`,
    }], { session });

    // 👨‍💼 Staff Activity Log
    if (req.user.role === "staff") {
      await User.findByIdAndUpdate(
        req.user._id,
        {
          $push: {
            activities: {
              activityType: "payment",
              details: {
                staffId: req.user._id,
                staffName: req.user.fullName,
                action: "Staff collected money from Franchisee",
                franchiseeName: franchisee.fullName,
                franchiseeId: franchisee._id,
                amount: amount,
              },
              reference: {
                model: "franchisee",
                id: franchisee._id,
              },
              timestamp: new Date(),
            },
          },
        },
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Money debited from Franchisee to Admin successfully",
      data: {
        adminWallet: admin.bookingWallet,
        franchiseeWallet: franchisee.bookingWallet,
        transactionId: transactionNumber,
      },
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(400).json({ message: error.message });
  }
});

const moneyDebitFromSubFranchisee = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { adminId, subId, amount } = req.body;

    // 🛑 Validation
    if (!amount || amount <= 0) {
      throw new Error("Invalid transfer amount");
    }

    const admin = await User.findById(adminId).session(session);
    const subFranchisee = await User.findById(subId).session(session);

    if (!admin || !subFranchisee) {
      throw new Error("Admin or Sub Franchisee not found");
    }

    // 🛑 Check Sub balance (FIX)
    if (subFranchisee.bookingWallet < amount) {
      throw new Error("Sub Franchisee has insufficient balance");
    }

    // 💸 TRANSFER (Sub ➜ Admin)
    subFranchisee.bookingWallet -= amount; // debit from sub
    admin.bookingWallet += amount;        // credit to admin

    await subFranchisee.save({ session });
    await admin.save({ session });

    const transactionNumber = generateTransactionNumber();

    // 📒 Ledger — Sub Franchisee (DEBIT)
    await Ledger.create([{
      userId: subFranchisee._id,
      amount: amount,
      type: "debit",
      description: `Transferred to Admin ID: ${admin._id}`,
      balanceAfterTransaction: subFranchisee.bookingWallet,
      transactionId: transactionNumber,
      remarks: "Wallet Transfer",
      username: `${subFranchisee.username}/${admin.username}`,
    }], { session });

    // 📒 Ledger — Admin (CREDIT)
    await Ledger.create([{
      userId: admin._id,
      amount: amount,
      type: "credit",
      description: `Received from Sub Franchisee ID: ${subFranchisee._id}`,
      balanceAfterTransaction: admin.bookingWallet,
      transactionId: transactionNumber,
      remarks: "Wallet Transfer",
      username: `${admin.username}/${subFranchisee.username}`,
    }], { session });

    // 👨‍💼 Staff Activity Log
    if (req.user.role === "staff") {
      await User.findByIdAndUpdate(
        req.user._id,
        {
          $push: {
            activities: {
              activityType: "payment",
              details: {
                staffId: req.user._id,
                staffName: req.user.fullName,
                action: "Staff collected money from Sub Franchisee",
                franchiseeName: subFranchisee.fullName,
                franchiseeId: subFranchisee._id,
                amount: amount,
              },
              reference: {
                model: "franchisee",
                id: subFranchisee._id,
              },
              timestamp: new Date(),
            },
          },
        },
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Money debited from Sub Franchisee to Admin successfully",
      data: {
        adminWallet: admin.bookingWallet,
        subFranchiseeWallet: subFranchisee.bookingWallet,
        transactionId: transactionNumber,
      },
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(400).json({ message: error.message });
  }
});


// Debit money from Super Franchisee back to Admin
const moneySendToSuperFranchisee = asyncHandler(async (req, res) => {
  const { adminId, superId, amount } = req.body;

  const admin = await User.findById(adminId);
  const superFranchisee = await User.findById(superId);

  if (!admin || !superFranchisee) {
    return res
      .status(404)
      .json({ message: "Admin or Super Franchisee not found" });
  }

  superFranchisee.bookingWallet -= amount; // Reduce from Super Franchisee
  admin.bookingWallet += amount; // Add to Admin

  await admin.save();
  await superFranchisee.save();

  const transactionNumber = generateTransactionNumber();

  // Create ledger entry for Admin (Credit)
  await Ledger.create({
    userId: admin._id,
    amount: amount,
    type: "credit",
    description: `Received from Super Franchisee ID: ${superFranchisee._id}`,
    balanceAfterTransaction: admin.bookingWallet,
    transactionId: transactionNumber,
    remarks: `Online Payment`,
    username: `${admin.username}/${superFranchisee.username}`,
  });

  // Create ledger entry for Super Franchisee (Debit)
  await Ledger.create({
    userId: superFranchisee._id,
    amount: amount,
    type: "debit",
    description: `Transferred to Admin ID: ${admin._id}`,
    balanceAfterTransaction: superFranchisee.bookingWallet,
    transactionId: transactionNumber,
    remarks: `Online Payment`,
    username: `${superFranchisee.username}/${admin.username}`,
  });
  if (req.user.role === 'staff') {
    await User.findByIdAndUpdate(req.user._id, {
      $push: {
        activities: {
          activityType: "payment",
          details: {
            staffId: req.user._id,
            staffName: req.user.fullName,
            action: "Staff Send money to Franchisee",
            franchiseeName: superFranchisee.fullName,
            franchiseeId: superFranchisee._id,
            Amount: amount
          },
          reference: {
            model: "franchisee",
            id: superFranchisee._id
          },
          timestamp: new Date()
        }
      }
    });
  }
  return res.status(200).json({ success: true, data: {adminWallet: admin.bookingWallet} });
});

// Assign money from Admin to Franchisee
const moneySendToFranchisee = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { franchiseeId, amount, remarks } = req.body;

    // Input validation
    if (!franchiseeId) {
      return res.status(400).json({
        success: false,
        message: "Franchisee ID is required"
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required"
      });
    }

    // Parse amount to number
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount)) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid number"
      });
    }

    const adminId = req.user.role === "staff" ? req.user.parentUser._id : req.user._id;
    // Find admin and franchisee
    const admin = await User.findById(adminId).session(session);
    const franchisee = await User.findById(franchiseeId).session(session);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    if (!franchisee) {
      return res.status(404).json({
        success: false,
        message: "Franchisee not found"
      });
    }

    // Check if admin has sufficient balance
    if (admin.bookingWallet < parsedAmount) {
      console.log("Admin balance:", admin.bookingWallet, "Requested amount:", parsedAmount);
      return res.status(400).json({
        success: false,
        message: "Insufficient balance in your wallet",
        currentBalance: admin.bookingWallet,
        requestedAmount: parsedAmount
      });
    }

    // // Check if franchisee belongs to admin (optional security check)
    // if (franchisee.createdBy && franchisee.createdBy.toString() !== admin._id.toString()) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Unauthorized: This franchisee does not belong to you"
    //   });
    // }

    // Calculate new balances
    const adminNewBalance = admin.bookingWallet - parsedAmount;
    const franchiseeNewBalance = franchisee.bookingWallet + parsedAmount;

    // Generate transaction ID
    const transactionNumber = generateTransactionNumber();

    // Update wallets
    admin.bookingWallet = adminNewBalance;
    franchisee.bookingWallet = franchiseeNewBalance;

    // Save both users
    await admin.save({ session });
    await franchisee.save({ session });

    // Create ledger entry for Admin (Debit - money going out)
    const adminLedgerEntry = new Ledger({
      userId: admin._id,
      username: admin.username,
      amount: parsedAmount,
      type: "debit",
      description: `Amount assigned to Franchisee: ${franchisee.fullName || franchisee.username}`,
      balanceAfterTransaction: adminNewBalance,
      transactionId: transactionNumber,
      remarks: remarks || `Amount assignment to franchisee`,
      receivedBy: franchisee.username,
      assignedTo: franchiseeId,
      transactionType: "wallet_assignment"
    });

    await adminLedgerEntry.save({ session });

    // Create ledger entry for Franchisee (Credit - money coming in)
    const franchiseeLedgerEntry = new Ledger({
      userId: franchisee._id,
      username: franchisee.username,
      amount: parsedAmount,
      type: "credit",
      description: `Amount received from Admin: ${admin.fullName || admin.username}`,
      balanceAfterTransaction: franchiseeNewBalance,
      transactionId: transactionNumber,
      remarks: remarks || `Amount received from admin`,
      receivedFrom: admin.username,
      assignedBy: admin._id,
      transactionType: "wallet_assignment"
    });

    await franchiseeLedgerEntry.save({ session });

    // Log staff activity if user is staff
    if (req.user.role === 'staff') {
      await User.findByIdAndUpdate(
        req.user._id,
        {
          $push: {
            activities: {
              activityType: "payment",
              details: {
                staffId: req.user._id,
                staffName: req.user.fullName || req.user.username,
                action: "Amount assigned to Franchisee",
                franchiseeName: franchisee.fullName || franchisee.username,
                franchiseeId: franchisee._id,
                amount: parsedAmount,
                transactionId: transactionNumber
              },
              reference: {
                model: "User",
                id: franchisee._id
              },
              timestamp: new Date()
            }
          }
        },
        { session }
      );
    }

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Amount assigned successfully",
      data: {
        transactionId: transactionNumber,
        adminWallet: adminNewBalance,
        franchiseeWallet: franchiseeNewBalance,
        assignedAmount: parsedAmount,
        franchiseeDetails: {
          id: franchisee._id,
          name: franchisee.fullName || franchisee.username,
          newBalance: franchiseeNewBalance
        }
      }
    });

  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    session.endSession();

    console.error("Error in assignAmountToFranchisee:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error while assigning amount",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Alternative function for deducting amount from franchisee (if needed)
const deductAmountFromFranchisee = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { franchiseeId, amount, remarks } = req.body;

    // Input validation
    if (!franchiseeId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid franchisee ID and amount are required"
      });
    }

    const parsedAmount = Number(amount);

    const admin = await User.findById(req.user._id).session(session);
    const franchisee = await User.findById(franchiseeId).session(session);

    if (!admin || !franchisee) {
      return res.status(404).json({
        success: false,
        message: "Admin or Franchisee not found"
      });
    }

    // Check if franchisee has sufficient balance
    if (franchisee.bookingWallet < parsedAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance in franchisee wallet",
        currentBalance: franchisee.bookingWallet,
        requestedAmount: parsedAmount
      });
    }

    const transactionNumber = generateTransactionNumber();

    // Deduct from franchisee, add to admin
    franchisee.bookingWallet -= parsedAmount;
    admin.bookingWallet += parsedAmount;

    await admin.save({ session });
    await franchisee.save({ session });

    // Create ledger entries
    const adminLedgerEntry = new Ledger({
      userId: admin._id,
      username: admin.username,
      amount: parsedAmount,
      type: "credit",
      description: `Amount received from Franchisee: ${franchisee.fullName || franchisee.username}`,
      balanceAfterTransaction: admin.bookingWallet,
      transactionId: transactionNumber,
      remarks: remarks || `Amount deducted from franchisee`,
      receivedFrom: franchisee.username
    });

    const franchiseeLedgerEntry = new Ledger({
      userId: franchisee._id,
      username: franchisee.username,
      amount: parsedAmount,
      type: "debit",
      description: `Amount transferred to Admin: ${admin.fullName || admin.username}`,
      balanceAfterTransaction: franchisee.bookingWallet,
      transactionId: transactionNumber,
      remarks: remarks || `Amount transferred to admin`,
      transferredTo: admin.username
    });

    await adminLedgerEntry.save({ session });
    await franchiseeLedgerEntry.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Amount deducted successfully",
      data: {
        transactionId: transactionNumber,
        adminWallet: admin.bookingWallet,
        franchiseeWallet: franchisee.bookingWallet,
        deductedAmount: parsedAmount
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error in deductAmountFromFranchisee:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error while deducting amount",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

const moneySendToSubFranchisee = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { adminId, subId, amount } = req.body;

    // 🛑 Basic validation
    if (!amount || amount <= 0) {
      throw new Error("Invalid amount");
    }

    const admin = await User.findById(adminId).session(session);
    const subFranchisee = await User.findById(subId).session(session);

    if (!admin || !subFranchisee) {
      throw new Error("Admin or Sub Franchisee not found");
    }

    // 🛑 Balance check
    if (admin.bookingWallet < amount) {
      throw new Error("Admin wallet has insufficient balance");
    }

    // 💸 Wallet Transfer (Admin ➜ Sub)
    admin.bookingWallet -= amount;
    subFranchisee.bookingWallet += amount;

    await admin.save({ session });
    await subFranchisee.save({ session });

    const transactionNumber = generateTransactionNumber();

    // 📒 Ledger — Admin (DEBIT)
    await Ledger.create([{
      userId: admin._id,
      amount: amount,
      type: "debit",
      description: `Transferred to Sub Franchisee ID: ${subFranchisee._id}`,
      balanceAfterTransaction: admin.bookingWallet,
      transactionId: transactionNumber,
      remarks: "Wallet Transfer",
      username: `${admin.username}/${subFranchisee.username}`,
    }], { session });

    // 📒 Ledger — Sub Franchisee (CREDIT)
    await Ledger.create([{
      userId: subFranchisee._id,
      amount: amount,
      type: "credit",
      description: `Received from Admin ID: ${admin._id}`,
      balanceAfterTransaction: subFranchisee.bookingWallet,
      transactionId: transactionNumber,
      remarks: "Wallet Transfer",
      username: `${subFranchisee.username}/${admin.username}`,
    }], { session });

    // 👨‍💼 Staff Activity Log
    if (req.user.role === "staff") {
      await User.findByIdAndUpdate(
        req.user._id,
        {
          $push: {
            activities: {
              activityType: "payment",
              details: {
                staffId: req.user._id,
                staffName: req.user.fullName,
                action: "Staff sent money to Sub Franchisee",
                franchiseeName: subFranchisee.fullName,
                franchiseeId: subFranchisee._id,
                Amount: amount,
              },
              reference: {
                model: "franchisee",
                id: subFranchisee._id,
              },
              timestamp: new Date(),
            },
          },
        },
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Money transferred successfully",
      data: {
        adminWallet: admin.bookingWallet,
        subFranchiseeWallet: subFranchisee.bookingWallet,
        transactionId: transactionNumber,
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(400).json({ message: error.message });
  }
});

// fetch  all franchisee
const fetchAllFranchisee = asyncHandler(async (req, res) => {
  // Fetch all users for the tenant but exclude users with role 'staff'
  const franchisees = await User.find({
    tenantId: req.user.tenantId._id,
    role: { $ne: 'staff' }
  })
    .select('-password -refreshToken'); // hide sensitive fields

  if (!franchisees || franchisees.length === 0) {
    return res.status(200).json(new ApiResponse(200, [], "No franchisees found"));
  }

  return res.status(200).json(new ApiResponse(200, franchisees, "Franchisee"));
});

const amountUpdate = asyncHandler(async (req, res) => {
  // Log userId
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(403).send("User not found");

    res.json({ wallet: user.bookingWallet });
  } catch (error) {
    throw new ApiError(500, "something went wrong fetching amount");
  }
});

const getFilteredTransactionHistory = asyncHandler(async (req, res) => {
  const { startDate, endDate, transactionType, userId, timeStamp } = req.query;
  // Validate userId

  const filter = { userId: new mongoose.Types.ObjectId(userId) };

  if (startDate && endDate) {
    filter.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  } else {
    // Correctly set the date range to the past 7 days
    const now = new Date();
    const pastWeek = new Date();
    pastWeek.setDate(now.getDate() - 1);

    if (timeStamp) {
      pastWeek.setDate(now.getDate() - timeStamp);
    }

    // Subtract 7 days from the current date

    filter.createdAt = {
      $gte: pastWeek,
      $lte: now,
    };
  }
  if (transactionType) {
    filter.type = transactionType;
  }
  // Find transactions that match the filter
  // Add remarks filter for "Online Payment"
  filter.remarks = "Online Payment";
  // Fetch filtered transactions
  const transactions = await Ledger.find(filter)
    .sort({ createdAt: -1 })
    .limit(50);

  // Check for missing transactionId and update in bulk
  const transactionsToUpdate = [];
  transactions.forEach((transaction) => {
    if (!transaction.transactionId) {
      transaction.transactionId = generateTransactionNumber();
      transactionsToUpdate.push(transaction);
    }
  });

  // Save all updated transactions if there are any missing transactionIds
  if (transactionsToUpdate.length > 0) {
    await Ledger.bulkWrite(
      transactionsToUpdate.map((tx) => ({
        updateOne: {
          filter: { _id: tx._id },
          update: { transactionId: tx.transactionId },
        },
      }))
    );
  }

  return res.status(200).json({ transactions });
});

const addUnit = asyncHandler(async (req, res) => {

  const { unit } = req.body;

  const unitExists = await unitdb.findOne({ unit });
  if (unitExists) {
    throw new ApiError("Unit already exists");
  }
  const newUnit = new unitdb({ unit });
  await newUnit.save();

  return res.status(201).json({ unit: newUnit.unit });
});

const getUnits = asyncHandler(async (req, res) => {
  const units = await unitdb.find().sort({ unit: 1 });

  return res.status(200).json({ units });
});

const verifyPin = asyncHandler(async (req, res) => {
  const { pin } = req.body;
  if (pin === "3399") {
    return res.json({ success: true, message: "PIN Verified" });
  } else {
    return res.status(401).json({ success: false, message: "Incorrect PIN" });
  }
});

// Get dashboard data based on user role and tenant model
const getDashboardData = async (req, res) => {
  try {
    const user = req.user;
    const tenantId = user.tenantId;

    // Basic stats for all roles
    const stats = {
      role: user.role,
      modelType: tenantId.modelType,
    };

    // Get user hierarchy data
    const hierarchyData = await getUserHierarchyStats(
      user._id,
      user.role,
      tenantId.modelType
    );

    // Get permissions based on role and model type
    const permissions = getPermissions(user.role, tenantId.modelType);

    // Combine all data
    const dashboardData = {
      userInfo: {
        _id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        wallet: user.bookingWallet,
      },
      tenantInfo: {
        name: tenantId.name,
        modelType: tenantId.modelType,
        code: tenantId.code,
        status: tenantId.status,
      },
      stats: hierarchyData,
      permissions,
    };

    return res.status(200).json({
      success: true,
      dashboardData,
    });
  } catch (error) {
    console.error("Dashboard data error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Helper function to get user hierarchy statistics
async function getUserHierarchyStats(userId, role, modelType) {
  const stats = {
    superFranchisees: 0,
    franchisees: 0,
    subFranchisees: 0,
    directUsers: 0,
    indirectUsers: 0,
    totalUsers: 0,
  };

  const userObjId = mongoose.Types.ObjectId.isValid(String(userId))
    ? new mongoose.Types.ObjectId(userId)
    : userId;

  // Single-query graph traversal aggregation pipeline
  const [hierarchyResult] = await User.aggregate([
    { $match: { _id: userObjId } },
    {
      $graphLookup: {
        from: "users",
        startWith: "$_id",
        connectFromField: "_id",
        connectToField: "createdBy",
        as: "network",
        maxDepth: 1, // Depth 0 = direct users, Depth 1 = indirect users
        depthField: "depth"
      }
    },
    {
      $project: {
        directUsers: {
          $filter: {
            input: "$network",
            as: "u",
            cond: { $eq: ["$$u.depth", 0] }
          }
        },
        indirectUsers: {
          $filter: {
            input: "$network",
            as: "u",
            cond: { $eq: ["$$u.depth", 1] }
          }
        }
      }
    }
  ]);

  if (!hierarchyResult) {
    return stats;
  }

  const directUsers = hierarchyResult.directUsers || [];
  const indirectUsers = hierarchyResult.indirectUsers || [];

  directUsers.forEach((u) => {
    if (u.role === "superFranchisee") stats.superFranchisees++;
    if (u.role === "franchisee") stats.franchisees++;
    if (u.role === "subFranchisee") stats.subFranchisees++;
  });

  stats.directUsers = directUsers.length;
  stats.indirectUsers = indirectUsers.length;
  stats.totalUsers = stats.directUsers + stats.indirectUsers;

  return stats;
}

// Helper function to determine user permissions based on role and model type
function getPermissions(role, modelType) {
  const permissions = {
    canCreateSuperFranchisee: false,
    canCreateFranchisee: false,
    canCreateSubFranchisee: false,
    canViewAnalytics: false,
    canManageTests: false,
    canManagePayments: false,
  };

  // Set permissions based on role
  switch (role) {
    case "admin":
      permissions.canViewAnalytics = true;
      permissions.canManageTests = true;
      permissions.canManagePayments = true;

      // Model-specific permissions for admin
      if (
        modelType === "2layer" ||
        modelType === "3layer" ||
        modelType === "4layer"
      ) {
        permissions.canCreateFranchisee = true;
      }

      if (modelType === "3layer" || modelType === "4layer") {
        permissions.canCreateSuperFranchisee = true;
      }
      break;

    case "superFranchisee":
      permissions.canViewAnalytics = true;
      permissions.canManagePayments = true;

      // Model-specific permissions for superFranchisee
      if (modelType === "3layer" || modelType === "4layer") {
        permissions.canCreateFranchisee = true;
      }

      if (modelType === "4layer") {
        permissions.canCreateSubFranchisee = true;
      }
      break;

    case "franchisee":
      permissions.canViewAnalytics = true;

      // Model-specific permissions for franchisee
      if (modelType === "4layer") {
        permissions.canCreateSubFranchisee = true;
      }
      break;

    case "subFranchisee":
      // SubFranchisee has limited permissions
      break;
  }

  return permissions;
}

const superFranchiseeUpdate = asyncHandler(async (req, res) => {
  try {
    const { _id } = req.query;
    const sFranchisee = await User.findOne({ _id });
    // const test = await Testdb.findOne({testName: testName})

    if (!sFranchisee) {
      throw new ApiError(400, "superFranchisee not found");
    }
    res
      .status(200)
      .json(
        new ApiResponse(201, sFranchisee, "superFranchisee found suceessfully")
      );
  } catch (error) {
    throw new ApiError(
      500,
      error,
      "Something went wrong superFranchisee not found"
    );
  }
});

// delete admin user & tenant by super admin 
const deleteAdminAndTenant = asyncHandler(async (req, res) => {
  try {
    const { Id } = req.params;
    // console.log("adminId", Id);
    const tenantUser = await Tenant.findById(Id);
    if (!tenantUser) {
      return res.status(404).json({ message: "Tenant not found" });
    }
    // Delete all users associated with this tenant
    await User.deleteMany({ tenantId: tenantUser._id });
    // Delete the tenant
    await Tenant.findByIdAndDelete(tenantUser._id);
    return res
      .status(200)
      .json({ message: "Tenant and associated users deleted successfully" });
  } catch (error) {
    console.error("Error deleting tenant and users:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Add amount to user's bookingWallet
const addBookingWalletAmount = async (req, res) => {
  try {
    const { amount } = req.body;

    let userId;
    if (req.user.role === 'staff') {
      userId = req.user.parentUser._id;
    } else {
      userId = req.user._id;
    }

    // const userId = req.user._id; // Assuming user ID is available in req.user
    const tenantId = req.user.tenantId._id;
    // Validation
    if (!userId || !amount || !tenantId) {
      return res.status(400).json({
        success: false,
        message: "admin details are required"
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0"
      });
    }

    // Find user and update bookingWallet
    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        tenantId: tenantId
      },
      {
        $inc: { bookingWallet: parseFloat(amount) },
        $set: { updatedAt: new Date() }
      },
      {
        new: true, // Return updated document
        runValidators: true
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const transactionNumber = generateTransactionNumber();
    // Optional: Add transaction record to bookingLedger
    const ledgerEntry = {
      transactionId: transactionNumber,
      amount: parseFloat(amount),
      type: 'credit',
      description: 'Amount added to booking wallet',
      timestamp: new Date(),
      balanceAfterTransaction: user.bookingWallet
    };

    await User.findOneAndUpdate(
      {
        _id: userId,
        tenantId: tenantId
      },
      {
        $push: { bookingLedger: ledgerEntry }
      }
    );

    // Create ledger entry for Admin
    const savedledgerEntry = await Ledger.create({
      userId,
      amount: parseFloat(amount),
      type: "credit",
      description: `Self Amount increased by Admin`,
      balanceAfterTransaction: user.bookingWallet,
      transactionId: transactionNumber,
      remarks: `Amount added to booking wallet`,
      username: `${userId}/${userId}`,
    });

    // Respond with success and updated wallet balance
    if (!savedledgerEntry) {
      return res.status(500).json({
        success: false,
        message: "Failed to create ledger entry"
      });
    }

    return res.status(200).json({
      success: true,
      message: `₹${amount} added successfully to booking wallet`,
      data: {
        userId: user._id,
        previousBalance: user.bookingWallet - parseFloat(amount),
        amountAdded: parseFloat(amount),
        currentBalance: user.bookingWallet,
        updatedAt: user.updatedAt
      }
    });

  } catch (error) {
    console.error('Error adding amount to booking wallet:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

const franchisee = asyncHandler(async (req, res) => {

  let userId;
  if (req.user.role === 'staff') {
    userId = req.user.parentUser;
  } else {
    userId = req.user._id;
  }
  const tenantId = req.user.tenantId._id;
  try {
    const franchisees = await User.find(
      {
        createdBy: userId,
        tenantId: tenantId
      }
    ).select("-password -refreshToken") // Exclude sensitive info

    if (franchisees.length === 0) {
      return res.status(200).json({ success: true, franchisees: [], message: 'No franchisees found' });
    }

    res.status(200).json({ success: true, franchisees });
  } catch (error) {
    console.error('Error fetching franchisees:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Set overdraft permission & limit for a user (franchisee)
const setOverdraft = asyncHandler(async (req, res) => {
  try {
    const { userId, overdraftAllowed, overdraftLimit } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });

    // Only allow superAdmin or admins to set overdraft (route will also be protected)
    if (!['superAdmin', 'admin', 'superFranchisee'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to set overdraft' });
    }

    const updateObj = {};
    if (typeof overdraftAllowed === 'boolean') updateObj.overdraftAllowed = overdraftAllowed;
    if (typeof overdraftLimit !== 'undefined') updateObj.overdraftLimit = Number(overdraftLimit) || 0;

    const updated = await User.findByIdAndUpdate(userId, { $set: updateObj }, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: 'User not found' });

    // Log activity
    await updated.logActivity('user_management', { action: 'set_overdraft', by: req.user._id, overdraftAllowed: updated.overdraftAllowed, overdraftLimit: updated.overdraftLimit });

    return res.status(200).json({ success: true, message: 'Overdraft updated', user: updated });
  } catch (error) {
    console.error('Error in setOverdraft:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export {
  registerUser,
  loginUser,
  logOutUser,
  getCurrentUser,
  refreshAccessToken,
  superFranchiseeCreate,
  // New: set overdraft permission and limit for franchisees
  setOverdraft,
  moneySendToFranchisee,
  moneySendToSubFranchisee,
  moneySendToSuperFranchisee,
  amountUpdate,
  getMyFranchisees,
  fetchAllFranchisee,
  moneyDebitFromSuperFranchisee,
  moneyDebitFromFranchisee,
  moneyDebitFromSubFranchisee,
  getFilteredTransactionHistory,
  addUnit,
  getUnits,
  verifyPin,
  superFranchiseeUpdate,
  deleteAdminAndTenant,
  getDashboardData,
  addBookingWalletAmount,
  franchisee
};
