import assert from "node:assert/strict";

import { parseTokenDurationToMs } from "../middlewares/auth.middleware.js";
import {
    MAX_TRACKED_REFRESH_TOKENS,
    clearRefreshTokens,
    isRefreshTokenTracked,
    readRotatedRefreshToken,
    registerRefreshToken,
    rememberRotatedRefreshToken,
} from "../src/utils/refreshTokenRegistry.js";

const results = [];
const check = (name, fn) => {
    try {
        fn();
        results.push(`PASS  ${name}`);
    } catch (error) {
        results.push(`FAIL  ${name} -> ${error.message}`);
        process.exitCode = 1;
    }
};

// --- cookie/token lifetime parsing -----------------------------------------
check("10d -> 10 days in ms", () => assert.equal(parseTokenDurationToMs("10d", 1), 864000000));
check("1d -> 1 day in ms", () => assert.equal(parseTokenDurationToMs("1d", 1), 86400000));
check("12h -> 12 hours in ms", () => assert.equal(parseTokenDurationToMs("12h", 1), 43200000));
check("900 (number) -> seconds", () => assert.equal(parseTokenDurationToMs(900, 1), 900000));
check("missing value -> fallback", () => assert.equal(parseTokenDurationToMs(undefined, 777), 777));
check("garbage value -> fallback", () => assert.equal(parseTokenDurationToMs("abc", 777), 777));

// --- multi device refresh token tracking -----------------------------------
check("first token is tracked", () => {
    const principal = {};
    registerRefreshToken(principal, "token-1");

    assert.equal(principal.refreshToken, "token-1");
    assert.equal(principal.refreshTokenHashes.length, 1);
    assert.equal(isRefreshTokenTracked(principal, "token-1"), true);
});

check("login on a second device keeps the first device signed in", () => {
    const principal = {};
    registerRefreshToken(principal, "laptop-token");
    registerRefreshToken(principal, "phone-token");

    assert.equal(isRefreshTokenTracked(principal, "laptop-token"), true);
    assert.equal(isRefreshTokenTracked(principal, "phone-token"), true);
});

check(`history is capped at ${MAX_TRACKED_REFRESH_TOKENS} devices`, () => {
    const principal = {};

    for (let index = 0; index < MAX_TRACKED_REFRESH_TOKENS + 2; index += 1) {
        registerRefreshToken(principal, `token-${index}`);
    }

    assert.equal(principal.refreshTokenHashes.length, MAX_TRACKED_REFRESH_TOKENS);
    assert.equal(isRefreshTokenTracked(principal, "token-0"), false);
    assert.equal(isRefreshTokenTracked(principal, `token-${MAX_TRACKED_REFRESH_TOKENS + 1}`), true);
});

check("unknown/forged token is not tracked", () => {
    const principal = {};
    registerRefreshToken(principal, "real-token");

    assert.equal(isRefreshTokenTracked(principal, "forged-token"), false);
    assert.equal(isRefreshTokenTracked(principal, ""), false);
});

check("legacy single refreshToken still validates", () => {
    const principal = { refreshToken: "legacy-token" };

    assert.equal(isRefreshTokenTracked(principal, "legacy-token"), true);
});

check("logout revokes every tracked token", () => {
    const principal = {};
    registerRefreshToken(principal, "token-1");
    registerRefreshToken(principal, "token-2");

    clearRefreshTokens(principal);

    assert.equal(principal.refreshToken, null);
    assert.deepEqual(principal.refreshTokenHashes, []);
    assert.equal(isRefreshTokenTracked(principal, "token-1"), false);
    assert.equal(isRefreshTokenTracked(principal, "token-2"), false);
});

// --- rotation grace cache (parallel tabs / parallel API calls) -------------
check("a racing request replays the already rotated session", () => {
    const rotatedSession = { authenticated: true, tokens: { accessToken: "a", refreshToken: "b" } };

    rememberRotatedRefreshToken("previous-token", rotatedSession);

    assert.deepEqual(readRotatedRefreshToken("previous-token"), rotatedSession);
    assert.equal(readRotatedRefreshToken("other-token"), null);
});

console.log(results.join("\n"));
console.log(process.exitCode ? "\nSome checks failed" : "\nAll checks passed");
