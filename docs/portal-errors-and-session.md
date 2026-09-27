# Super Admin portal: 500 / 502 / 504 errors and "auto logout"

This document explains what the HTTP errors mean, what caused the repeated
logouts on the super admin portal, and how to check the live server.

---

## 1. What the error codes mean

| Code | Name | Who sends it | What actually happened |
|------|------|--------------|------------------------|
| **400** | Bad Request | Node app | The request body / session query was malformed. |
| **401** | Unauthorized | Node app | The access token is missing or expired, or the refresh token could not restore the session. Only this status logs a user out. |
| **403** | Forbidden | Node app | Signed in, but the role / device / subscription does not allow this action. |
| **429** | Too Many Requests | Rate limiter | More than the allowed requests per minute from one IP. |
| **500** | Internal Server Error | Node app (`Global Error Handler`) | An unhandled exception inside a route or controller. Check the log for `💥 Global Error Handler`. |
| **502** | Bad Gateway | nginx / load balancer (the app never answered) | The Node process was **down or restarting** (crash, OOM, `process.exit`, deploy) or a keep-alive socket was closed before the proxy used it. |
| **503** | Service Unavailable | Node app | Deliberate "busy / maintenance" answer. `/api/session` returns this for a **temporary** database or proxy problem and keeps the login alive. |
| **504** | Gateway Timeout | nginx / load balancer | The app was still working after the proxy timeout (60s by default). Typical for PDF/report generation with Puppeteer or a very slow MongoDB query. |

Rule of thumb:

* **502 / 504 are not produced by this application** - they come from the reverse
  proxy in front of it, and always mean "the proxy did not get a timely answer
  from Node".
* **500 means a bug inside the application** (the stack trace is in the log).
* **401 is the only status that logs a user out** (apart from an explicit logout).

## 2. Why the portal kept logging the super admin out

Everything below is fixed in this repository, but the list is useful for future
debugging:

1. **Refresh never worked (the main bug).**
   `loadUserSession` / `loadSuperAdminSession` load the account with
   `.select("-password -refreshToken")`, and the rotation code compared the
   *presented* refresh token with that (missing) field, so
   `user.refreshToken !== refreshToken` was always `true` and every refresh
   attempt returned `null` -> `401` -> cookies cleared. As soon as the 24h access
   token expired the portal forced a fresh login.
   *Fix:* rotation now loads the document **with** the refresh token
   (`loadUserSessionForRotation` / `loadSuperAdminSessionForRotation`), while the
   payload sent to the browser is always re-read with the safe loader.

2. **A login on a second device/PC killed the first device.**
   Only one `refreshToken` was stored per account, so logging in on the phone
   invalidated the laptop, which then logged out within a day.
   *Fix:* `refreshTokenHashes` (capped list of 5) keeps several devices signed in
   while logout still revokes everything.

3. **Parallel refreshes cancelled each other.**
   Two tabs (or two parallel API calls) sending the same refresh cookie made one
   request rotate the token and the other fail with 401 -> logout.
   *Fix:* `src/utils/refreshTokenRegistry.js` keeps a 2 minute grace cache, so a
   racing request is replayed with the same freshly rotated tokens.

4. **A temporary server problem was treated as "session expired".**
   `GET /api/session` cleared the auth cookies for *any* error, including a slow
   MongoDB, and the client cleared its stored session on any non-200 answer.
   *Fix:* only real token errors (`isTokenValidationError`) produce 401; anything
   else answers **503 + `transient: true` + `Retry-After: 5`** and the cookies stay
   untouched. The guard retries once and never deletes the session for 5xx.

5. **Any API 401 logged the user out instantly.**
   The fetch guard redirected to the "Session Expired" page on the first 401,
   even though the refresh cookie was still valid.
   *Fix:* on a 401 the guard calls `/api/session` once (all parallel 401s share
   that single refresh) and replays the original request. Logout only happens when
   the refresh token itself is invalid.

6. **Cookies were session cookies (no `maxAge`).**
   Closing the browser or the phone overnight deleted the login, and the login
   route's 24h `maxAge` did not match the 10 day refresh token.
   *Fix:* `getAccessTokenCookieOptions()` / `getRefreshTokenCookieOptions()` set
   the real token lifetimes (`ACCESS_TOKEN_EXPIRY` / `REFRESH_TOKEN_EXPIRY`), and
   login, session restore and logout now use the same options everywhere.

7. **Expired access token on a page request returned raw JSON.**
   `/superAdmin/superAdmin.html` answered `401 {"error":...}` and the browser
   rendered that JSON as a broken page.
   *Fix:* HTML navigations are redirected to
   `/login.html?sessionExpired=1&returnTo=...`, and that page silently restores
   the session through the refresh cookie (the user often never sees the form).

8. **One stray promise could kill the whole process.**
   `process.on('unhandledRejection')` called `process.exit(1)`, so a single
   forgotten `catch` caused a PM2 restart and every connected user got **502**
   plus a lost in-flight request.
   *Fix:* unhandled rejections are logged instead of being fatal.
   `uncaughtException` still restarts (the state is unsafe at that point).

9. **Node's 5 second keep-alive vs the proxy.**
   Node closes idle sockets after 5s by default while nginx/ALB usually reuse
   them, which shows up as sporadic **502 Bad Gateway**.
   *Fix:* `server.keepAliveTimeout = 65s` and `server.headersTimeout = 66s`
   (overridable with `KEEP_ALIVE_TIMEOUT_MS` / `HEADERS_TIMEOUT_MS`).

10. **504 on heavy PDF/report actions.** Puppeteer rendering can take longer than
    the proxy timeout. Raise the proxy timeouts (section 3) and watch memory/CPU
    while reports are generated.

## 3. Server checklist (VPS + PM2 + nginx)

```bash
pm2 status                                   # is "labflowlis" online or restarting in a loop?
pm2 logs labflowlis --lines 200 --nostream   # look for 💥, UNHANDLED, restart reasons
pm2 describe labflowlis | head -40           # restart count, uptime, memory

free -m                                      # OOM / swap pressure
sudo tail -n 200 /var/log/nginx/error.log    # "upstream prematurely closed",
                                             # "upstream timed out", "connect() failed"
```

If nginx reports `upstream timed out`, raise the timeouts for the site location:

```nginx
location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 504 fix: let long PDF/report requests finish
    proxy_connect_timeout 15s;
    proxy_send_timeout    300s;
    proxy_read_timeout    300s;
    send_timeout          300s;

    # 502 fix: keep upstream connections alive longer than Node's keep-alive
    keepalive_timeout 75s;
}
```

Apply with `sudo nginx -t && sudo systemctl reload nginx`.

## 4. Testing after deploying

1. Log in on the portal, then also log in from a second browser - **both must
   stay signed in** (multi-device refresh tokens).
2. Open `/superAdmin/superAdmin.html` in two tabs, keep one idle longer than the
   access token lifetime (or temporarily set `ACCESS_TOKEN_EXPIRY=2m` on staging),
   then click something in the old tab: the action must succeed without a trip to
   the login screen (silent refresh + replay).
3. `GET /api/session?type=superAdmin&strict=true` while MongoDB is paused must
   answer `503 {"authenticated":false,"transient":true,...}` and the `accessToken`
   cookie must still exist afterwards.
4. Watch `/health` (memory, uptime) while generating several reports; if memory
   keeps climbing, that is the source of the 502 restarts.


