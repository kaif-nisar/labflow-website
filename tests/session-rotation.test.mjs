/**
 * Integration check for the "refresh never worked -> auto logout" bug.
 * Runs without MongoDB: the SuperAdmin model is stubbed, so nothing is written
 * anywhere. It only proves the rotation logic itself.
 */
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

process.env.SUPER_ADMIN_ACCESS_TOKEN_SECRET = "test-access-secret";
process.env.SUPER_ADMIN_REFRESH_TOKEN_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRY = "1d";
process.env.REFRESH_TOKEN_EXPIRY = "10d";

const { SuperAdmin } = await import("../src/models/superAdmin.model.js");
const { resolvePortalSession, isTokenValidationError } = await import("../middlewares/auth.middleware.js");
const { hashRefreshToken } = await import("../src/utils/refreshTokenRegistry.js");

const results = [];
const check = async (name, fn) => {
    try {
        await fn();
        results.push(`PASS  ${name}`);
    } catch (error) {
        results.push(`FAIL  ${name} -> ${error.message}`);
        process.exitCode = 1;
    }
};

const adminId = new mongoose.Types.ObjectId();

const signRefresh = () =>
    jwt.sign({ _id: adminId }, process.env.SUPER_ADMIN_REFRESH_TOKEN_SECRET, {
        expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    });

const buildStoredDoc = (refreshToken) => {
    const doc = {
        _id: adminId,
        role: "superAdmin",
        username: "check-admin",
        email: "check-admin@labflow.local",
        refreshToken,
        refreshTokenHashes: [hashRefreshToken(refreshToken)],
        saves: 0,
        generateAccessToken() {
            return jwt.sign({ _id: this._id, role: "superAdmin" }, process.env.SUPER_ADMIN_ACCESS_TOKEN_SECRET, {
                expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
            });
        },
        generateRefreshToken() {
            return signRefresh();
        },
        async save() {
            this.saves += 1;
        },
    };

    return doc;
};

const buildSafeDoc = (source) => ({
    _id: source._id,
    role: "superAdmin",
    username: source.username,
    email: source.email,
});

const storedDoc = buildStoredDoc(signRefresh());
let rotationLoads = 0;

// loadSuperAdminSessionForRotation() uses .select("-password") and needs the
// stored token; loadSuperAdminSession() uses .select("-password -refreshToken")
// so the payload sent to the browser can never contain the refresh token.
SuperAdmin.findById = () => ({
    select: async (fields) => {
        if (String(fields).includes("-refreshToken")) {
            return buildSafeDoc(storedDoc);
        }

        rotationLoads += 1;
        return storedDoc;
    },
});

const makeRequest = ({ accessToken = null, refreshToken = null } = {}) => ({
    cookies: {
        ...(accessToken ? { accessToken } : {}),
        ...(refreshToken ? { refreshToken } : {}),
    },
    headers: {},
    body: {},
    query: {},
    ip: "",
    socket: {},
    header: () => undefined,
});

await check("an expired/missing access token + valid refresh cookie restores the session", async () => {
    const session = await resolvePortalSession(makeRequest({ refreshToken: storedDoc.refreshToken }), {
        type: "superAdmin",
        strict: true,
        allowRefresh: true,
    });

    assert.ok(session, "expected a restored session, got null (this was the auto-logout bug)");
    assert.equal(session.kind, "superAdmin");
    assert.equal(session.superAdmin.username, "check-admin");
    assert.ok(session.tokens?.accessToken, "expected a fresh access token");
    assert.ok(session.tokens?.refreshToken, "expected a rotated refresh token");
    assert.equal(storedDoc.saves, 1, "the rotated token must be persisted for this account");
    assert.equal(session.superAdmin.refreshToken, undefined, "refresh token must not leak to the client payload");
    assert.equal(rotationLoads, 1);
});

await check("a racing request with the SAME old cookie replays the rotated tokens", async () => {
    const firstRotation = await resolvePortalSession(makeRequest({ refreshToken: storedDoc.refreshToken }), {
        type: "superAdmin",
        strict: true,
        allowRefresh: true,
    });

    // Simulates the second tab that still sends the already rotated cookie.
    const racingRotation = await resolvePortalSession(makeRequest({ refreshToken: storedDoc.refreshToken }), {
        type: "superAdmin",
        strict: true,
        allowRefresh: true,
    });

    assert.ok(racingRotation, "the racing request must not be logged out");
    assert.deepEqual(racingRotation.tokens, firstRotation.tokens, "both requests must share the same token pair");
});

await check("the rotated (newest) refresh token keeps the session alive", async () => {
    const session = await resolvePortalSession(makeRequest({ refreshToken: storedDoc.refreshToken }), {
        type: "superAdmin",
        strict: true,
        allowRefresh: true,
    });

    const nextToken = session.tokens.refreshToken;

    // What the browser stores after the rotation above:
    storedDoc.refreshToken = nextToken;
    storedDoc.refreshTokenHashes.push(hashRefreshToken(nextToken));

    const secondSession = await resolvePortalSession(makeRequest({ refreshToken: nextToken }), {
        type: "superAdmin",
        strict: true,
        allowRefresh: true,
    });

    assert.ok(secondSession, "the newest refresh token must still restore the session");
});

await check("a valid access token never rotates the refresh token", async () => {
    const accessToken = storedDoc.generateAccessToken();
    const refreshBefore = storedDoc.refreshToken;

    const session = await resolvePortalSession(makeRequest({ accessToken, refreshToken: refreshBefore }), {
        type: "superAdmin",
        strict: true,
        allowRefresh: true,
    });

    assert.ok(session, "expected the access token to be accepted");
    assert.equal(session.tokens, null, "no rotation should happen for a valid access token");
    assert.equal(storedDoc.refreshToken, refreshBefore);
});

await check("an unknown token for this account is rejected (logout is still possible)", async () => {
    // A token signed with the right secret but never issued/stored for this
    // account (different payload -> different signature).
    const forgedToken = jwt.sign({ _id: adminId, nonce: "forged-by-someone-else" }, process.env.SUPER_ADMIN_REFRESH_TOKEN_SECRET, {
        expiresIn: "10d",
    });

    const session = await resolvePortalSession(makeRequest({ refreshToken: forgedToken }), {
        type: "superAdmin",
        strict: true,
        allowRefresh: true,
    });

    assert.equal(session, null);
});

await check("an expired token is reported as a token error (401, not 503)", () => {
    const expired = jwt.sign({ _id: adminId }, process.env.SUPER_ADMIN_REFRESH_TOKEN_SECRET, { expiresIn: "-1s" });

    try {
        jwt.verify(expired, process.env.SUPER_ADMIN_REFRESH_TOKEN_SECRET);
        throw new Error("expected jwt.verify to throw");
    } catch (error) {
        assert.equal(isTokenValidationError(error), true);
    }

    assert.equal(isTokenValidationError(new Error("MongoServerSelectionError: connection timed out")), false);
});

console.log(results.join("\n"));
console.log(process.exitCode ? "\nSome checks failed" : "\nAll checks passed");

