(() => {
    const SESSION_KEYS = [
        "accessToken",
        "refreshToken",
        "token",
        "user",
        "superAdminData",
        "currentUser",
        "userData",
    ];

    const state = {
        config: {
            loginPath: "/franchiseelogin.html",
            homePath: "/index.html",
            useFetchGuard: false,
            useGlobalErrorHandlers: true,
            useFatalErrorPage: false,
            // Which portal /api/session should validate ("superAdmin" | "user" | "any")
            sessionType: "any",
            // Retry a session lookup once when the server answers 5xx / the network drops
            transientRetryDelayMs: 1200,
        },
        redirectScheduled: false,
        sessionRecoveryPromise: null,
    };

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const buildSearchParams = (params) => {
        const query = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
                query.set(key, String(value));
            }
        });

        return query.toString();
    };

    const safeJsonParse = (value, fallback = null) => {
        try {
            return value ? JSON.parse(value) : fallback;
        } catch (error) {
            return fallback;
        }
    };

    const setJson = (key, value) => {
        if (value === undefined || value === null) {
            localStorage.removeItem(key);
            return;
        }

        localStorage.setItem(key, JSON.stringify(value));
    };

    const clearStoredSession = () => {
        SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
        sessionStorage.removeItem("authRedirectInFlight");
    };

    const buildErrorUrl = ({
        status = 500,
        title,
        message,
        loginPath,
        homePath,
        returnTo,
    } = {}) => {
        const query = buildSearchParams({
            status,
            title,
            message,
            login: loginPath || state.config.loginPath,
            home: homePath || state.config.homePath,
            returnTo,
        });

        return `/error.html?${query}`;
    };

    const getLoginPathForKind = (kind) => {
        return kind === "superAdmin" ? "/login.html" : "/franchiseelogin.html";
    };

    const syncSession = (session) => {
        if (!session?.authenticated) {
            return;
        }

        if (session.kind === "superAdmin") {
            setJson("superAdminData", session.superAdmin);

            if (session.accessToken) {
                localStorage.setItem("token", session.accessToken);
            }

            return;
        }

        setJson("user", session.user);

        if (session.accessToken) {
            localStorage.setItem("accessToken", session.accessToken);
        }
    };

    const attachFatalActions = ({ loginPath, homePath }) => {
        const reloadButton = document.getElementById("portalFatalReload");
        const loginButton = document.getElementById("portalFatalLogin");
        const homeButton = document.getElementById("portalFatalHome");

        if (reloadButton) {
            reloadButton.addEventListener("click", () => window.location.reload());
        }

        if (loginButton) {
            loginButton.addEventListener("click", () => {
                clearStoredSession();
                window.location.replace(loginPath || state.config.loginPath);
            });
        }

        if (homeButton) {
            homeButton.addEventListener("click", () => {
                window.location.replace(homePath || state.config.homePath);
            });
        }
    };

    const showFatalError = ({
        status = 500,
        title = "Something Went Wrong",
        message = "An unexpected application error occurred. Please reload the page or login again.",
        loginPath,
        homePath,
    } = {}) => {
        document.body.innerHTML = `
            <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(circle at top,#17345e 0%,#09111f 45%,#04070e 100%);font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#ecf3ff;">
                <div style="width:min(100%,720px);background:rgba(9,18,36,.86);border:1px solid rgba(160,186,255,.22);border-radius:28px;padding:32px;box-shadow:0 24px 80px rgba(0,0,0,.45);backdrop-filter:blur(14px);">
                    <div style="display:inline-flex;align-items:center;gap:10px;padding:8px 14px;border-radius:999px;background:rgba(110,168,255,.12);color:#9fc2ff;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Error ${status}</div>
                    <h1 style="margin:18px 0 12px;font-size:clamp(28px,4vw,44px);line-height:1.05;">${title}</h1>
                    <p style="margin:0 0 28px;color:#c4d2ea;font-size:16px;line-height:1.7;">${message}</p>
                    <div style="display:flex;flex-wrap:wrap;gap:12px;">
                        <button id="portalFatalReload" type="button" style="border:none;border-radius:14px;padding:14px 20px;background:#f6fbff;color:#04101f;font-weight:700;cursor:pointer;">Reload</button>
                        <button id="portalFatalLogin" type="button" style="border:none;border-radius:14px;padding:14px 20px;background:#4e8cff;color:#fff;font-weight:700;cursor:pointer;">Login Again</button>
                        <button id="portalFatalHome" type="button" style="border:1px solid rgba(167,191,255,.26);border-radius:14px;padding:14px 20px;background:transparent;color:#d7e5ff;font-weight:700;cursor:pointer;">Go Home</button>
                    </div>
                </div>
            </div>
        `;

        attachFatalActions({ loginPath, homePath });
    };

    const redirectToErrorPage = ({
        clearSession = false,
        ...options
    } = {}) => {
        if (state.redirectScheduled) {
            return;
        }

        state.redirectScheduled = true;

        if (clearSession) {
            clearStoredSession();
        }

        window.location.replace(buildErrorUrl(options));
    };

    const handleSessionFailure = ({
        loginPath,
        message = "Your session is no longer valid. Please login again to continue.",
        title = "Session Expired",
        status = 401,
        homePath,
    } = {}) => {
        if (state.redirectScheduled) {
            return;
        }

        state.redirectScheduled = true;
        clearStoredSession();

        const targetLogin = loginPath || state.config.loginPath || "/login.html";
        const currentPath = `${window.location.pathname}${window.location.search}`;

        if (window.location.pathname.toLowerCase().includes("login")) {
            return;
        }

        const query = buildSearchParams({
            sessionExpired: "1",
            returnTo: currentPath,
        });

        window.location.replace(`${targetLogin}?${query}`);
    };

    const installFetchGuard = () => {
        if (window.__portalFetchGuardInstalled) {
            return;
        }

        window.__portalFetchGuardInstalled = true;
        const originalFetch = window.fetch.bind(window);

        // Several parallel API calls can fail with 401 at the same moment (the
        // access token expired while the tab stayed open). Only one silent
        // refresh may run - the other requests reuse its result.
        const recoverSession = () => {
            if (state.sessionRecoveryPromise) {
                return state.sessionRecoveryPromise;
            }

            state.sessionRecoveryPromise = restoreSession({
                type: state.config.sessionType || "any",
                strict: false,
            })
                .catch((error) => {
                    console.error("[PortalGuard] Session recovery failed:", error);
                    return { authenticated: false, transient: true, error };
                })
                .then((session) => {
                    state.sessionRecoveryPromise = null;
                    return session;
                });

            return state.sessionRecoveryPromise;
        };

        window.fetch = async (input, init) => {
            const requestInit = init || {};
            const response = await originalFetch(input, requestInit);

            try {
                const requestUrl =
                    typeof input === "string"
                        ? input
                        : input?.url || "";

                const isApiRequest = requestUrl.includes("/api/");
                const isSessionRequest = requestUrl.includes("/api/session");
                const canReplayRequest = typeof input === "string" || !input?.body;

                if (
                    isApiRequest &&
                    !isSessionRequest &&
                    response.status === 401 &&
                    canReplayRequest &&
                    !requestInit.__portalRetried
                ) {
                    let payload = null;

                    try {
                        payload = await response.clone().json();
                    } catch (error) {
                        payload = null;
                    }

                    // A 24h access token can expire while a tab stays open. Use
                    // the refresh cookie to restore the session and replay this
                    // request instead of logging the user straight out.
                    const recoveredSession = await recoverSession();

                    if (recoveredSession?.authenticated) {
                        return originalFetch(input, { ...requestInit, __portalRetried: true });
                    }

                    if (recoveredSession?.transient) {
                        return response;
                    }

                    // Only trigger session failure redirect if session lookup explicitly confirmed invalid session
                    if (recoveredSession?.authenticated === false && !recoveredSession?.transient) {
                        handleSessionFailure({
                            loginPath: payload?.loginPath || state.config.loginPath,
                            message: payload?.message,
                            homePath: payload?.homePath || state.config.homePath,
                        });
                    }
                }
            } catch (error) {
                console.error("Portal fetch guard error:", error);
            }

            return response;
        };
    };

    const installGlobalErrorHandlers = () => {
        if (window.__portalGlobalErrorsInstalled || state.config.useGlobalErrorHandlers === false) {
            return;
        }

        window.__portalGlobalErrorsInstalled = true;

        window.addEventListener("error", (event) => {
            if (!event?.error) {
                return;
            }

            console.error("[PortalGuard] Uncaught error:", event.error);

            if (state.config.useFatalErrorPage) {
                showFatalError({
                    title: "Unexpected Error",
                    message: "A page error interrupted the application. You can reload the page or login again.",
                    loginPath: state.config.loginPath,
                    homePath: state.config.homePath,
                });
            }
        });

        window.addEventListener("unhandledrejection", (event) => {
            const reason = event?.reason;

            if (reason?.status === 401) {
                return;
            }

            console.error("[PortalGuard] Unhandled rejection:", reason);

            if (state.config.useFatalErrorPage) {
                showFatalError({
                    title: "Something Went Wrong",
                    message:
                        typeof reason === "string" && reason.trim()
                            ? reason
                            : "We ran into an unexpected problem while processing this page.",
                    loginPath: state.config.loginPath,
                    homePath: state.config.homePath,
                });
            }
        });
    };

    const api = {};

    const configure = (options = {}) => {
        state.config = {
            ...state.config,
            ...options,
        };

        if (state.config.useFetchGuard) {
            installFetchGuard();
        }

        installGlobalErrorHandlers();
        return api;
    };

    const restoreSession = async ({ type = "any", strict = false, retryOnTransient = true } = {}) => {
        const query = buildSearchParams({
            type,
            strict: strict ? "true" : "false",
        });

        let response = null;

        try {
            response = await fetch(`/api/session?${query}`, {
                method: "GET",
                credentials: "include",
                cache: "no-store",
            });
        } catch (error) {
            // Offline / proxy / connection reset. This is NOT a logout, so the
            // stored session is kept and the lookup is retried once.
            console.warn("[PortalGuard] Session lookup failed (network):", error);

            if (retryOnTransient) {
                await wait(state.config.transientRetryDelayMs);
                return restoreSession({ type, strict, retryOnTransient: false });
            }

            return {
                authenticated: false,
                transient: true,
                networkError: true,
                error,
                response: null,
                payload: null,
            };
        }

        let payload = null;

        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (response.ok && payload?.authenticated) {
            syncSession(payload);
            return payload;
        }

        // 5xx / 429 mean the server (or its database) is in trouble - not that the
        // user's login is invalid. Never wipe the session in that case, otherwise
        // one slow MongoDB response logs everybody out.
        const isTransientFailure = response.status >= 500 || response.status === 429;

        if (isTransientFailure) {
            if (retryOnTransient) {
                await wait(state.config.transientRetryDelayMs);
                return restoreSession({ type, strict, retryOnTransient: false });
            }

            return {
                authenticated: false,
                transient: true,
                status: response.status,
                response,
                payload,
            };
        }

        clearStoredSession();
        return {
            authenticated: false,
            response,
            payload,
        };
    };

    const ensureSession = async ({
        type = "user",
        strict = true,
        expectedPortalRole,
        loginPath,
    } = {}) => {
        const session = await restoreSession({ type, strict });

        if (!session?.authenticated) {
            if (session?.transient) {
                // Server (or its database) is unavailable: keep the login and
                // offer a retry instead of destroying a valid session.
                redirectToErrorPage({
                    status: session?.status || 503,
                    title: "Server Busy",
                    message:
                        session?.payload?.message ||
                        "We could not verify your session because the server is temporarily unavailable. Your login is still saved - please retry in a few moments.",
                    loginPath: loginPath || state.config.loginPath,
                    homePath: state.config.homePath,
                    returnTo: `${window.location.pathname}${window.location.search}`,
                    clearSession: false,
                });

                return null;
            }

            handleSessionFailure({
                loginPath: loginPath || state.config.loginPath,
                message: session?.payload?.message,
            });
            return null;
        }

        if (expectedPortalRole && session.portalRole !== expectedPortalRole) {
            redirectToErrorPage({
                status: 403,
                title: "Access Denied",
                message: "You do not have permission to open this portal.",
                loginPath: loginPath || getLoginPathForKind(session.kind),
                homePath: session.redirectTo || state.config.homePath,
                clearSession: false,
            });
            return null;
        }

        return session;
    };

    const autoLoginFromSession = async ({
        type = "any",
        strict = false,
        onSuccess,
        onFailure,
    } = {}) => {
        try {
            const session = await restoreSession({ type, strict });

            if (session?.authenticated) {
                if (typeof onSuccess === "function") {
                    onSuccess(session);
                } else {
                    window.location.replace(session.redirectTo || state.config.homePath);
                }

                return session;
            }

            if (typeof onFailure === "function") {
                onFailure(session);
            }

            return session;
        } catch (error) {
            console.error("Auto-login session restore failed:", error);

            if (typeof onFailure === "function") {
                onFailure({ authenticated: false, error });
            }

            return null;
        }
    };

    Object.assign(api, {
        configure,
        clearStoredSession,
        restoreSession,
        ensureSession,
        syncSession,
        handleSessionFailure,
        redirectToErrorPage,
        showFatalError,
        autoLoginFromSession,
        getStoredUser() {
            return safeJsonParse(localStorage.getItem("user"));
        },
        getStoredSuperAdmin() {
            return safeJsonParse(localStorage.getItem("superAdminData"));
        },
        getLoginPathForKind,
    });

    window.AppPortalGuard = api;

    installGlobalErrorHandlers();
})();
