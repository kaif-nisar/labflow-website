import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";

import { SuperAdmin } from "../src/models/superAdmin.model.js";
import { User } from "../src/models/user.model.js";
import { asyncHandler } from "../src/utils/asyncHandler.js";
import { ApiError } from "../src/utils/apiError.js";

const ACCESS_TOKEN_COOKIE = "accessToken";
const REFRESH_TOKEN_COOKIE = "refreshToken";
const DEVICE_SESSION_HEADER = "x-session-token";

const USER_SAFE_SELECT = "-password -refreshToken";
const SUPER_ADMIN_SAFE_SELECT = "-password -refreshToken";

const getTenantSubscriptionGate = (tenant) => {
  const subscription = tenant?.subscriptionPlan || {};
  const endDate = subscription?.endDate ? new Date(subscription.endDate) : null;
  const graceUntil = subscription?.gracePeriod?.graceUntil
    ? new Date(subscription.gracePeriod.graceUntil)
    : null;
  const effectiveEnd = graceUntil || endDate;
  const now = new Date();
  const expiredByDate = effectiveEnd ? now > effectiveEnd : false;
  const isActiveByFlag = subscription?.isActive === true;

  return {
    isLocked: !isActiveByFlag || expiredByDate,
    reason: !isActiveByFlag
      ? "Parent client subscription is inactive"
      : "Parent client subscription has expired",
  };
};

const canWriteDuringSubscriptionLock = (path) => {
  const allowPaths = [
    "/api/v1/user/create-order",
    "/api/v1/user/verify-payment",
    "/api/v1/user/renew-with-commission",
    "/api/v1/user/upload-upi-screenshot",
    "/api/v1/user/check-subscription",
    "/api/v1/user/ReportData",
    "/api/v1/user/ReportData-user",
    "/api/v1/user/isreportready",
    "/api/v1/user/get-pdf",
    "/api/v1/user/get-pdf-user",
    "/api/v1/user/generate-barcode",
    "/api/v1/user/generate-qr",
    "/api/v1/user/getDoctorsSign",
    "/api/v1/user/templates",
    "/api/v1/user/adding-pdf-data",
    "/api/v1/user/logout",
  ];

  return allowPaths.some((allowedPath) => {
    return path === allowedPath || path.startsWith(`${allowedPath}/`);
  });
};

const isReadIntentPath = (path) => {
  const safeKeywords = [
    "get",
    "fetch",
    "find",
    "all",
    "list",
    "search",
    "status",
    "report",
    "details",
    "dashboard",
  ];
  const pathLower = String(path || "").toLowerCase();
  return safeKeywords.some((key) => pathLower.includes(key));
};

const shouldBlockWriteOnExpiry = (req, gate) => {
  if (!gate?.isLocked) {
    return false;
  }

  const method = String(req.method || "").toUpperCase();
  const path = String(req.originalUrl || req.path || "").split("?")[0];

  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return false;
  }

  if (canWriteDuringSubscriptionLock(path)) {
    return false;
  }

  if (method === "POST" && isReadIntentPath(path)) {
    return false;
  }

  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
};

const normalizeSessionType = (value) => {
  if (value === "superAdmin") {
    return "superAdmin";
  }

  if (value === "user") {
    return "user";
  }

  return "any";
};

const buildUnauthorizedError = (message, code = "UNAUTHORIZED") => {
  const error = new ApiError(401, message);
  error.code = code;
  error.clearAuth = true;
  return error;
};

const buildForbiddenError = (message, code = "FORBIDDEN") => {
  const error = new ApiError(403, message);
  error.code = code;
  return error;
};

const extractBearerToken = (authorizationHeader = "") => {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return "";
  }

  return authorizationHeader.slice("Bearer ".length).trim();
};

const getAccessTokenFromRequest = (req) => {
  return (
    req.cookies?.[ACCESS_TOKEN_COOKIE] ||
    req.header(DEVICE_SESSION_HEADER) ||
    extractBearerToken(req.header("Authorization"))
  );
};

const getRefreshTokenFromRequest = (req) => {
  return (
    req.cookies?.[REFRESH_TOKEN_COOKIE] ||
    req.body?.refreshToken ||
    req.header("x-refresh-token")
  );
};

const getUserPortalRole = (user) => {
  if (user?.role === "staff" && user?.parentRole) {
    return user.parentRole;
  }

  return user?.role || null;
};

const normalizeDeviceLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(4, Math.max(1, parsed));
};

const hashDeviceSessionToken = (token) => {
  return createHash("sha256").update(String(token || "")).digest("hex");
};

const getDeviceSessionTokenFromRequest = (req) => {
  return (
    req.header(DEVICE_SESSION_HEADER) ||
    req.cookies?.[ACCESS_TOKEN_COOKIE] ||
    extractBearerToken(req.header("Authorization")) ||
    ""
  );
};

const getDeviceFingerprintFromRequest = (req) => {
  return String(
    req.header("x-device-fingerprint") ||
      req.body?.deviceFingerprint ||
      req.query?.deviceFingerprint ||
      ""
  ).trim();
};

const getClientIpAddress = (req) => {
  const forwardedFor = req.headers?.["x-forwarded-for"];
  if (forwardedFor) {
    return String(forwardedFor).split(",")[0].trim();
  }

  return String(req.ip || req.socket?.remoteAddress || "").trim();
};

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeLocationData = (locationData = {}) => {
  const latitude = toFiniteNumber(
    locationData.latitude ??
      locationData.lat ??
      locationData.coords?.latitude ??
      locationData.coords?.lat
  );
  const longitude = toFiniteNumber(
    locationData.longitude ??
      locationData.lng ??
      locationData.lon ??
      locationData.coords?.longitude ??
      locationData.coords?.lng ??
      locationData.coords?.lon
  );
  const city = String(locationData.city || locationData.town || locationData.village || "").trim();
  const state = String(locationData.state || locationData.region || "").trim();
  const country = String(locationData.country || locationData.countryName || "").trim();
  const label = String(
    locationData.label ||
      locationData.locationLabel ||
      [city, state, country].filter(Boolean).join(", ")
  ).trim();
  const source = String(locationData.source || locationData.provider || "").trim();

  const hasLocation =
    latitude !== null ||
    longitude !== null ||
    Boolean(city || state || country || label || source);

  if (!hasLocation) {
    return null;
  }

  return {
    latitude,
    longitude,
    city,
    state,
    country,
    label,
    source,
  };
};

const getLocationDataFromRequest = (req) => {
  const locationPayload =
    req.body?.locationData ||
    req.body?.location ||
    req.query?.locationData ||
    {};

  const headerLocation = normalizeLocationData({
    latitude: req.header("x-location-latitude") || req.header("x-latitude"),
    longitude: req.header("x-location-longitude") || req.header("x-longitude"),
    city: req.header("x-location-city"),
    state: req.header("x-location-state"),
    country: req.header("x-location-country"),
    label: req.header("x-location-label"),
    source: req.header("x-location-source"),
  });

  const bodyLocation = normalizeLocationData(locationPayload);
  return bodyLocation || headerLocation;
};

const getActiveDeviceSessions = (user) => {
  return Array.isArray(user?.active_sessions) ? user.active_sessions : [];
};

const getDeviceSessionMatch = (user, sessionToken) => {
  const sessionHash = hashDeviceSessionToken(sessionToken);
  return getActiveDeviceSessions(user).find(
    (entry) => String(entry?.session_token || "") === sessionHash
  );
};

const buildDeviceSessionRecord = ({
  accessToken,
  deviceFingerprint,
  ipAddress,
  userAgent,
  expiresAt,
  location,
}) => {
  return {
    session_token: hashDeviceSessionToken(accessToken),
    device_fingerprint: String(deviceFingerprint || "").trim(),
    last_activity_at: new Date(),
    ip_address: String(ipAddress || "").trim(),
    user_agent: String(userAgent || "").trim(),
    ...(location ? { location } : {}),
    expires_at: expiresAt ? new Date(expiresAt) : null,
  };
};

const updateActiveDeviceSessionActivity = async (userId, sessionToken, req) => {
  const sessionHash = hashDeviceSessionToken(sessionToken);
  const deviceFingerprint = getDeviceFingerprintFromRequest(req);
  const ipAddress = getClientIpAddress(req);
  const location = getLocationDataFromRequest(req);

  await User.updateOne(
    { _id: userId, "active_sessions.session_token": sessionHash },
    {
      $set: {
        "active_sessions.$.last_activity_at": new Date(),
        "active_sessions.$.ip_address": ipAddress,
        ...(deviceFingerprint
          ? { "active_sessions.$.device_fingerprint": deviceFingerprint }
          : {}),
        ...(location ? { "active_sessions.$.location": location } : {}),
      },
    }
  );
};

const pruneExpiredDeviceSessions = async (user) => {
  const sessions = getActiveDeviceSessions(user);
  const now = Date.now();
  const filtered = sessions.filter((session) => {
    if (!session?.expires_at) {
      return true;
    }

    const expiresAt = new Date(session.expires_at).getTime();
    return Number.isFinite(expiresAt) ? expiresAt > now : true;
  });

  if (filtered.length === sessions.length) {
    return user;
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { active_sessions: filtered } }
  );
  user.active_sessions = filtered;
  return user;
};

const validateUserDeviceSession = async (req, user) => {
  if (!user) {
    throw buildUnauthorizedError("Unauthorized request", "ACCESS_TOKEN_REQUIRED");
  }

  if (user.is_device_restriction_enabled === false) {
    return {
      restricted: false,
      matchedSession: null,
    };
  }

  const sessionToken = getDeviceSessionTokenFromRequest(req);
  if (!sessionToken) {
    throw buildUnauthorizedError(
      "Access token is required",
      "ACCESS_TOKEN_REQUIRED"
    );
  }

  await pruneExpiredDeviceSessions(user);

  const matchedSession = getDeviceSessionMatch(user, sessionToken);
  if (!matchedSession) {
    const error = buildUnauthorizedError(
      "This session has been revoked. Please sign in again.",
      "DEVICE_SESSION_INVALIDATED"
    );
    error.clearAuth = true;
    throw error;
  }

  await updateActiveDeviceSessionActivity(user._id, sessionToken, req);

  return {
    restricted: true,
    matchedSession,
  };
};

export const prepareUserDeviceSession = async (
  user,
  { accessToken, deviceFingerprint, ipAddress, userAgent, expiresAt, location, setFields = {} }
) => {
  const limit = normalizeDeviceLimit(user?.max_allowed_devices);
  const prunedUser = await pruneExpiredDeviceSessions(user);
  const sessions = getActiveDeviceSessions(prunedUser);

  if (prunedUser?.is_device_restriction_enabled !== false && sessions.length >= limit) {
    throw buildForbiddenError(
      "Device limit exceeded",
      "DEVICE_LIMIT_EXCEEDED"
    );
  }

  const sessionRecord = buildDeviceSessionRecord({
    accessToken,
    deviceFingerprint,
    ipAddress,
    userAgent,
    expiresAt,
    location,
  });

  await User.updateOne(
    { _id: prunedUser._id },
    {
      $set: {
        lastLogin: new Date(),
        ...setFields,
      },
      $push: {
        active_sessions: sessionRecord,
      },
    }
  );

  return sessionRecord;
};

export const replaceUserDeviceSessionToken = async (
  userId,
  previousAccessToken,
  nextAccessToken,
  { deviceFingerprint, ipAddress, userAgent, expiresAt, location } = {}
) => {
  if (!previousAccessToken) {
    return null;
  }

  const previousHash = hashDeviceSessionToken(previousAccessToken);
  const nextRecord = buildDeviceSessionRecord({
    accessToken: nextAccessToken,
    deviceFingerprint,
    ipAddress,
    userAgent,
    expiresAt,
    location,
  });

  const result = await User.updateOne(
    { _id: userId, "active_sessions.session_token": previousHash },
    {
      $set: {
        "active_sessions.$.session_token": nextRecord.session_token,
        "active_sessions.$.device_fingerprint": nextRecord.device_fingerprint,
        "active_sessions.$.last_activity_at": nextRecord.last_activity_at,
        "active_sessions.$.ip_address": nextRecord.ip_address,
        "active_sessions.$.user_agent": nextRecord.user_agent,
        ...(location ? { "active_sessions.$.location": nextRecord.location } : {}),
        "active_sessions.$.expires_at": nextRecord.expires_at,
      },
    }
  );

  return result;
};

export const removeUserDeviceSession = async (userId, accessToken) => {
  if (!accessToken) {
    return null;
  }

  return User.updateOne(
    { _id: userId },
    {
      $pull: {
        active_sessions: {
          session_token: hashDeviceSessionToken(accessToken),
        },
      },
    }
  );
};

export const purgeUserDeviceSessions = async (userId) => {
  return User.updateOne(
    { _id: userId },
    {
      $set: {
        active_sessions: [],
      },
    }
  );
};

export const trimUserDeviceSessionsToLimit = async (userId, limit) => {
  const user = await User.findById(userId).select("active_sessions");
  if (!user) {
    return null;
  }

  const normalizedLimit = normalizeDeviceLimit(limit);
  const sortedSessions = [...getActiveDeviceSessions(user)].sort((left, right) => {
    const leftTime = new Date(left?.last_activity_at || 0).getTime();
    const rightTime = new Date(right?.last_activity_at || 0).getTime();
    return rightTime - leftTime;
  });

  const trimmedSessions = sortedSessions.slice(0, normalizedLimit);
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        active_sessions: trimmedSessions,
      },
    }
  );

  return trimmedSessions;
};

export const getSessionTokenHash = (sessionToken) => hashDeviceSessionToken(sessionToken);
export const resolveLocationDataFromRequest = (req) => getLocationDataFromRequest(req);

export const getAuthCookieOptions = () => {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  };
};

export const clearAuthCookies = (res) => {
  const cookieOptions = getAuthCookieOptions();

  res.clearCookie(ACCESS_TOKEN_COOKIE, cookieOptions);
  res.clearCookie(REFRESH_TOKEN_COOKIE, cookieOptions);

  return res;
};

const setAuthCookies = (res, tokens) => {
  if (!tokens?.accessToken && !tokens?.refreshToken) {
    return res;
  }

  const cookieOptions = getAuthCookieOptions();

  if (tokens.accessToken) {
    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, cookieOptions);
  }

  if (tokens.refreshToken) {
    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, cookieOptions);
  }

  return res;
};

const loadUserSession = async (userId) => {
  return User.findById(userId)
    .select(USER_SAFE_SELECT)
    .populate("createdBy")
    .populate({
      path: "tenantId",
      populate: {
        path: "adminDetails.userId",
        select: USER_SAFE_SELECT,
      },
    });
};

const loadSuperAdminSession = async (superAdminId) => {
  return SuperAdmin.findById(superAdminId).select(SUPER_ADMIN_SAFE_SELECT);
};

const buildPortalRedirectPath = (kind, principal) => {
  if (kind === "superAdmin") {
    return "/superAdmin/superAdmin.html";
  }

  switch (getUserPortalRole(principal)) {
    case "admin":
      return "/admin/admin.html";
    case "superFranchisee":
      return "/superFranchisee/superFranchisee.html";
    case "franchisee":
      return "/franchisee/franchisee.html";
    case "subFranchisee":
      return "/subFranchisee/subFranchisee.html";
    default:
      return "/franchiseelogin.html";
  }
};

const resolveAccessSession = async (accessToken, type, strict) => {
  if (!accessToken) {
    return null;
  }

  try {
    const decodedToken = jwt.verify(
      accessToken,
      process.env.SUPER_ADMIN_ACCESS_TOKEN_SECRET
    );

    const accessKind = decodedToken?.role === "superAdmin" ? "superAdmin" : "user";
    const candidates = strict
      ? [type]
      : accessKind === "superAdmin"
        ? ["superAdmin"]
        : ["user"];

    for (const candidate of candidates) {
      if (candidate === "any") {
        continue;
      }

      if (candidate === "superAdmin") {
        if (type === "user" && strict) {
          continue;
        }

        const superAdmin = await loadSuperAdminSession(decodedToken?._id);
        if (superAdmin) {
          return {
            kind: "superAdmin",
            principal: superAdmin,
            superAdmin,
            portalRole: "superAdmin",
            redirectTo: buildPortalRedirectPath("superAdmin", superAdmin),
            tokens: null,
          };
        }
      }

      if (candidate === "user") {
        if (type === "superAdmin" && strict) {
          continue;
        }

        const user = await loadUserSession(decodedToken?._id);
        if (user) {
          const deviceSessionResult = await validateUserDeviceSession(
            {
              header: (key) => (key === DEVICE_SESSION_HEADER ? accessToken : ""),
              cookies: { [ACCESS_TOKEN_COOKIE]: accessToken },
              body: {},
              query: {},
              headers: {},
              ip: "",
              socket: {},
            },
            user
          ).catch((error) => {
            if (error?.code === "DEVICE_SESSION_INVALIDATED") {
              return { revoked: true };
            }
            return null;
          });

          if (deviceSessionResult?.revoked) {
            return {
              kind: "user",
              principal: user,
              user,
              portalRole: getUserPortalRole(user),
              redirectTo: buildPortalRedirectPath("user", user),
              tokens: null,
              revoked: true,
            };
          }

          return {
            kind: "user",
            principal: user,
            user,
            portalRole: getUserPortalRole(user),
            redirectTo: buildPortalRedirectPath("user", user),
            tokens: null,
          };
        }
      }
    }
  } catch (error) {
    return null;
  }

  return null;
};

const rotateUserSessionFromRefreshToken = async (refreshToken) => {
  const decodedToken = jwt.verify(
    refreshToken,
    process.env.SUPER_ADMIN_REFRESH_TOKEN_SECRET
  );

  const user = await loadUserSession(decodedToken?._id);

  if (!user || user.refreshToken !== refreshToken) {
    return null;
  }

  const accessToken = user.generateAccessToken();
  const nextRefreshToken = user.generateRefreshToken();

  user.refreshToken = nextRefreshToken;
  await user.save({ validateBeforeSave: false });

  const refreshedUser = await loadUserSession(user._id);

  return {
    kind: "user",
    principal: refreshedUser,
    user: refreshedUser,
    portalRole: getUserPortalRole(refreshedUser),
    redirectTo: buildPortalRedirectPath("user", refreshedUser),
    tokens: {
      accessToken,
      refreshToken: nextRefreshToken,
    },
  };
};

const rotateSuperAdminSessionFromRefreshToken = async (refreshToken) => {
  const decodedToken = jwt.verify(
    refreshToken,
    process.env.SUPER_ADMIN_REFRESH_TOKEN_SECRET
  );

  const superAdmin = await loadSuperAdminSession(decodedToken?._id);

  if (!superAdmin || superAdmin.refreshToken !== refreshToken) {
    return null;
  }

  const accessToken = superAdmin.generateAccessToken();
  const nextRefreshToken = superAdmin.generateRefreshToken();

  superAdmin.refreshToken = nextRefreshToken;
  await superAdmin.save({ validateBeforeSave: false });

  const refreshedSuperAdmin = await loadSuperAdminSession(superAdmin._id);

  return {
    kind: "superAdmin",
    principal: refreshedSuperAdmin,
    superAdmin: refreshedSuperAdmin,
    portalRole: "superAdmin",
    redirectTo: buildPortalRedirectPath("superAdmin", refreshedSuperAdmin),
    tokens: {
      accessToken,
      refreshToken: nextRefreshToken,
    },
  };
};

const resolveRefreshSession = async (refreshToken, type, strict) => {
  if (!refreshToken) {
    return null;
  }

  const candidates = [];

  if (type === "superAdmin") {
    candidates.push("superAdmin");
    if (!strict) {
      candidates.push("user");
    }
  } else if (type === "user") {
    candidates.push("user");
    if (!strict) {
      candidates.push("superAdmin");
    }
  } else {
    candidates.push("user", "superAdmin");
  }

  for (const candidate of candidates) {
    try {
      if (candidate === "user") {
        const userSession = await rotateUserSessionFromRefreshToken(refreshToken);
        if (userSession) {
          return userSession;
        }
      }

      if (candidate === "superAdmin") {
        const superAdminSession =
          await rotateSuperAdminSessionFromRefreshToken(refreshToken);
        if (superAdminSession) {
          return superAdminSession;
        }
      }
    } catch (error) {
      continue;
    }
  }

  return null;
};

export const resolvePortalSession = async (
  req,
  { type = "any", strict = false, allowRefresh = false } = {}
) => {
  const normalizedType = normalizeSessionType(type);
  const accessToken = getAccessTokenFromRequest(req);
  const refreshToken = getRefreshTokenFromRequest(req);

  const accessSession = await resolveAccessSession(
    accessToken,
    normalizedType,
    strict
  );

  if (accessSession) {
    if (accessSession.revoked) {
      return null;
    }
    return accessSession;
  }

  if (!allowRefresh) {
    return null;
  }

  const refreshSession = await resolveRefreshSession(
    refreshToken,
    normalizedType,
    strict
  );

  return refreshSession || null;
};

export const applyPortalSessionCookies = (res, session) => {
  setAuthCookies(res, session?.tokens);
  return res;
};

const requireUserAccess = async (req) => {
  const accessToken = getAccessTokenFromRequest(req);

  if (!accessToken) {
    throw buildUnauthorizedError("Access token is required", "ACCESS_TOKEN_REQUIRED");
  }

  try {
    const decodedToken = jwt.verify(
      accessToken,
      process.env.SUPER_ADMIN_ACCESS_TOKEN_SECRET
    );

    const user = await loadUserSession(decodedToken?._id);

    if (!user) {
      throw buildUnauthorizedError("Invalid or expired token", "INVALID_TOKEN");
    }

    return user;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw buildUnauthorizedError(
      "Unauthorized: Invalid or expired token",
      "INVALID_TOKEN"
    );
  }
};

const requireSuperAdminAccess = async (req) => {
  const accessToken = getAccessTokenFromRequest(req);

  if (!accessToken) {
    throw buildUnauthorizedError("Unauthorized request", "ACCESS_TOKEN_REQUIRED");
  }

  try {
    const decodedToken = jwt.verify(
      accessToken,
      process.env.SUPER_ADMIN_ACCESS_TOKEN_SECRET
    );

    const superAdmin = await loadSuperAdminSession(decodedToken?._id);

    if (!superAdmin) {
      throw buildUnauthorizedError("Invalid access token", "INVALID_TOKEN");
    }

    return superAdmin;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw buildUnauthorizedError(
      error?.message || "Invalid access token",
      "INVALID_TOKEN"
    );
  }
};

export const verifySuperAdmin = asyncHandler(async (req, res, next) => {
  const superAdmin = await requireSuperAdminAccess(req);
  req.superAdmin = superAdmin;
  next();
});

const verifyJWT = asyncHandler(async (req, res, next) => {
  const user = await requireUserAccess(req);
  const gate = getTenantSubscriptionGate(user.tenantId);

  await validateUserDeviceSession(req, user);

  if (shouldBlockWriteOnExpiry(req, gate)) {
    const error = buildForbiddenError(
      "Subscription expired. Write actions are locked until recharge.",
      "SUBSCRIPTION_LOCKED"
    );
    error.subscriptionLocked = true;
    error.reason = gate.reason;
    throw error;
  }

  req.user = user;
  next();
});

export { verifyJWT };
