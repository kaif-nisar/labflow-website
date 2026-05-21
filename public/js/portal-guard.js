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
        },
        redirectScheduled: false,
    };

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
        redirectToErrorPage({
            status,
            title,
            message,
            loginPath: loginPath || state.config.loginPath,
            homePath: homePath || state.config.homePath,
            clearSession: true,
            returnTo: `${window.location.pathname}${window.location.search}`,
        });
    };

    const installFetchGuard = () => {
        if (window.__portalFetchGuardInstalled) {
            return;
        }

        window.__portalFetchGuardInstalled = true;
        const originalFetch = window.fetch.bind(window);

        window.fetch = async (input, init) => {
            const response = await originalFetch(input, init);

            try {
                const requestUrl =
                    typeof input === "string"
                        ? input
                        : input?.url || "";

                const isApiRequest = requestUrl.includes("/api/");
                const isSessionRequest = requestUrl.includes("/api/session");

                if (isApiRequest && !isSessionRequest && response.status === 401) {
                    let payload = null;

                    try {
                        payload = await response.clone().json();
                    } catch (error) {
                        payload = null;
                    }

                    handleSessionFailure({
                        loginPath: payload?.loginPath || state.config.loginPath,
                        message: payload?.message,
                        homePath: payload?.homePath || state.config.homePath,
                    });
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

            console.error(event.error);

            showFatalError({
                title: "Unexpected Error",
                message: "A page error interrupted the application. You can reload the page or login again.",
                loginPath: state.config.loginPath,
                homePath: state.config.homePath,
            });

            if (typeof event.preventDefault === "function") {
                event.preventDefault();
            }
        });

        window.addEventListener("unhandledrejection", (event) => {
            const reason = event?.reason;

            if (reason?.status === 401) {
                return;
            }

            console.error(reason);

            showFatalError({
                title: "Something Went Wrong",
                message:
                    typeof reason === "string" && reason.trim()
                        ? reason
                        : "We ran into an unexpected problem while processing this page.",
                loginPath: state.config.loginPath,
                homePath: state.config.homePath,
            });

            if (typeof event.preventDefault === "function") {
                event.preventDefault();
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

    const restoreSession = async ({ type = "any", strict = false } = {}) => {
        const query = buildSearchParams({
            type,
            strict: strict ? "true" : "false",
        });

        const response = await fetch(`/api/session?${query}`, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
        });

        let payload = null;

        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (!response.ok || !payload?.authenticated) {
            clearStoredSession();
            return {
                authenticated: false,
                response,
                payload,
            };
        }

        syncSession(payload);
        return payload;
    };

    const ensureSession = async ({
        type = "user",
        strict = true,
        expectedPortalRole,
        loginPath,
    } = {}) => {
        const session = await restoreSession({ type, strict });

        if (!session?.authenticated) {
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
