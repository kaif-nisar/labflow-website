/**
 * Refresh token registry
 * ======================
 * Portal sessions used to store a single `refreshToken` per account. That made
 * every new login (second device / second browser) invalidate the older device,
 * which showed up as "random auto logout" for the super admin portal.
 *
 * This registry keeps a small, capped list of SHA-256 hashed refresh tokens per
 * account so that:
 *   - up to MAX_TRACKED_REFRESH_TOKENS devices stay signed in at the same time,
 *   - logging out still revokes every tracked token for that account,
 *   - a token that was already rotated seconds ago (parallel tabs calling
 *     /api/session at the same moment) is replayed from a short in-memory grace
 *     cache instead of being treated as a stolen/revoked token.
 */
import { createHash } from "node:crypto";

export const MAX_TRACKED_REFRESH_TOKENS = 5;

// A rotated refresh token stays "replayable" for this long. Two tabs that both
// hit /api/session with the same cookie inside this window receive the exact
// same fresh token pair, so no browser ends up with an invalidated cookie.
export const ROTATION_GRACE_WINDOW_MS = 2 * 60 * 1000;

const ROTATION_CACHE_MAX_ENTRIES = 500;

const rotationCache = new Map();

export const hashRefreshToken = (token) =>
  createHash("sha256").update(String(token || "")).digest("hex");

const getRotationCacheEntry = (previousToken) => {
  const key = hashRefreshToken(previousToken);
  const entry = rotationCache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    rotationCache.delete(key);
    return null;
  }

  return entry;
};

export const pruneRotationCache = () => {
  const now = Date.now();

  for (const [key, entry] of rotationCache) {
    if (entry.expiresAt <= now) {
      rotationCache.delete(key);
    }
  }

  while (rotationCache.size > ROTATION_CACHE_MAX_ENTRIES) {
    const oldestKey = rotationCache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    rotationCache.delete(oldestKey);
  }
};

/**
 * Stores the session that replaced `previousToken` so a racing request can be
 * served with the very same tokens instead of triggering another rotation.
 */
export const rememberRotatedRefreshToken = (previousToken, session) => {
  if (!previousToken || !session) {
    return;
  }

  pruneRotationCache();

  rotationCache.set(hashRefreshToken(previousToken), {
    session,
    expiresAt: Date.now() + ROTATION_GRACE_WINDOW_MS,
  });
};

export const readRotatedRefreshToken = (previousToken) => {
  const entry = getRotationCacheEntry(previousToken);
  return entry ? entry.session : null;
};

export const forgetRotatedRefreshToken = (previousToken) => {
  if (!previousToken) {
    return;
  }

  rotationCache.delete(hashRefreshToken(previousToken));
};

export const clearRotationCache = () => {
  rotationCache.clear();
};

export const getTrackedRefreshTokenHashes = (principal) => {
  const tracked = Array.isArray(principal?.refreshTokenHashes)
    ? principal.refreshTokenHashes
    : [];

  return tracked
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());
};

/**
 * True when the presented refresh token is still valid for this account, either
 * because it is the newest one (`refreshToken`, legacy field) or because it is
 * still inside the tracked multi-device list.
 */
export const isRefreshTokenTracked = (principal, token) => {
  if (!principal || !token) {
    return false;
  }

  if (principal.refreshToken && principal.refreshToken === token) {
    return true;
  }

  return getTrackedRefreshTokenHashes(principal).includes(hashRefreshToken(token));
};

/**
 * Marks a refresh token as valid for the account and makes it the newest one.
 * Always used together with `principal.save()` by the caller.
 */
export const registerRefreshToken = (principal, token) => {
  if (!principal || !token) {
    return principal;
  }

  const hash = hashRefreshToken(token);
  const tracked = [hash, ...getTrackedRefreshTokenHashes(principal).filter((value) => value !== hash)];

  principal.refreshTokenHashes = tracked.slice(0, MAX_TRACKED_REFRESH_TOKENS);
  principal.refreshToken = token;

  return principal;
};

/**
 * Revokes every refresh token of the account (full logout / password reset).
 */
export const clearRefreshTokens = (principal) => {
  if (!principal) {
    return principal;
  }

  principal.refreshTokenHashes = [];
  principal.refreshToken = null;

  return principal;
};

export const getRefreshTokensForLogout = () => ({
  refreshToken: null,
  refreshTokenHashes: [],
});
