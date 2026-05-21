import jwt from "jsonwebtoken";

import { SuperAdmin } from "../src/models/superAdmin.model.js";
import { User } from "../src/models/user.model.js";
import { asyncHandler } from "../src/utils/asyncHandler.js";
import { ApiError } from "../src/utils/apiError.js";

const ACCESS_TOKEN_COOKIE = "accessToken";
const REFRESH_TOKEN_COOKIE = "refreshToken";

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
