import express from "express";
import { configDotenv } from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import xss from "xss-clean";
import mongoSanitize from "express-mongo-sanitize";
import Connect_DB from "./src/db/index.js";
import userRouter from "./src/routes/user.routes.js";
import qrReportRouter from "./src/routes/qrReport.routes.js";
import offlineReportRouter from "./src/routes/offlineReport.routes.js";
import marketingRouter from "./src/routes/marketing.routes.js";
import {
    verifyJWT,
    verifySuperAdmin,
    resolvePortalSession,
    applyPortalSessionCookies,
    clearAuthCookies
} from "./middlewares/auth.middleware.js";
import { initializeSchedulers } from "./src/utils/subscriptionScheduler.js";
import { cleanupCustomizationsOnStartup } from "./src/utils/customizationCleanup.js";

configDotenv();

const app = express();
const OFFICIAL_SITE_URL = "https://labflowlis.com";
const LEGACY_HOSTS = new Set([
    "www.labflowlis.com",
    "lab.occuhealth.in",
    "www.lab.occuhealth.in",
    "lab.coqher.in",
    "www.lab.coqher.in"
]);
const CANONICAL_REDIRECT_ENABLED = String(process.env.CANONICAL_REDIRECT_ENABLED ?? "true").toLowerCase() === "true";
const TRUST_PROXY_HOPS = Number.parseInt(process.env.TRUST_PROXY_HOPS || "1", 10);
const resolvedTrustProxy = Number.isFinite(TRUST_PROXY_HOPS) && TRUST_PROXY_HOPS >= 0
    ? TRUST_PROXY_HOPS
    : (process.env.NODE_ENV === "production" ? 1 : 0);

app.set("trust proxy", resolvedTrustProxy);

if (process.env.NODE_ENV === "production") {
    process.on('uncaughtException', (error) => {
        console.error('UNCAUGHT EXCEPTION', error);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        console.error('UNHANDLED REJECTION', reason);
        process.exit(1);
    });
}

// ========================
// 📊 MEMORY MONITORING
// ========================

// ✅ Memory Monitoring with AUTO CLEANUP
setInterval(() => {
    const used = process.memoryUsage();
    console.log(`📊 Memory Usage - RSS: ${Math.round(used.rss / 1024 / 1024)}MB, Heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
    
    // ✅ Auto memory cleanup when heap exceeds 70MB
    if (used.heapUsed > 70 * 1024 * 1024) {
        console.log('🔄 Auto memory cleanup triggered...');
        if (global.gc) {
            global.gc();
        }
        if (global.cache) {
            const keys = Object.keys(global.cache);
            console.log(`🧹 Clearing ${keys.length} cache entries`);
            global.cache = {};
        }
    }
}, 300000); // Every 5 minutes

// ✅ Regular cache cleanup every 1 hour
setInterval(() => {
    console.log('⏰ Scheduled cache cleanup');
    global.cache = {};
}, 60 * 60 * 1000);

// ========================
// 🔐 SECURITY MIDDLEWARES
// ========================

if (process.env.NODE_ENV === 'production') {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "'unsafe-eval'",
                    "blob:",
                    "https:"
                ],
                scriptSrcElem: [
                    "'self'",
                    "'unsafe-inline'",
                    "blob:",
                    "https:"
                ],
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https:",
                    "blob:"
                ],
                styleSrcElem: [
                    "'self'",
                    "'unsafe-inline'",
                    "https:"
                ],
                imgSrc: [
                    "'self'",
                    "data:",
                    "https:",
                    "blob:",
                    "https://res.cloudinary.com"
                ],
                frameSrc: ["'self'", "blob:"],
                connectSrc: [
                    "'self'",
                    "https:",
                    "blob:",
                    "https://res.cloudinary.com",
                    "wss:"
                ],
                fontSrc: ["'self'", "https:", "data:"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'", "https:", "blob:"],
                formAction: ["'self'"],
                baseUri: ["'self'"],
                childSrc: ["'self'", "blob:"]
            },
        },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" }
    }));
} else {
    // ✅ CSP COMPLETELY DISABLED for development
    app.use(helmet({
        contentSecurityPolicy: false
    }));

    app.use((req, res, next) => {
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        next();
    });

    console.log('🔓 CSP: COMPLETELY DISABLED - Development mode');
}

// ========================
// 🚀 RATE LIMITING
// ========================

if (process.env.NODE_ENV === 'production') {
    const generalLimiter = rateLimit({
        windowMs: 1 * 60 * 1000,
        max: 1000,
        message: {
            error: 'Too many requests from this IP, please try again later.'
        },
        standardHeaders: true,
        legacyHeaders: false,
    });

    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: {
            error: 'Too many login attempts, please try again later.'
        }
    });

    const apiLimiter = rateLimit({
        windowMs: 1 * 60 * 1000,
        max: 200,
        message: {
            error: 'Too many API requests, please try again later.'
        }
    });

    app.use(generalLimiter);
    app.use("/api/v1/user/login", authLimiter);
    app.use("/api/v1/user", apiLimiter);

    console.log('🛡️ Production Rate Limiting: ACTIVE');
} else {
    console.log('🔓 Development Mode - Rate Limiting: DISABLED');
}

// ========================
// 🔒 DATA SANITIZATION
// ========================

app.use(mongoSanitize()); // NoSQL Injection Protection
app.use(xss()); // XSS Protection
app.use(hpp()); // HTTP Parameter Pollution Protection

// ========================
// 🌐 CORS CONFIGURATION
// ========================

const defaultCors = cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
});

app.use((req, res, next) => {
    // Electron may issue these requests from a file:// (null) origin. Keep
    // this permissive CORS policy strictly scoped to the no-login offline sync
    // channel; every existing API retains the configured CORS policy below.
    if (req.path.startsWith("/api/v1/offline-reports")) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") return res.sendStatus(204);
        return next();
    }
    return defaultCors(req, res, next);
});

app.use((req, res, next) => {
    if (process.env.NODE_ENV !== "production") {
        return next();
    }

    // Allow ACME HTTP challenge requests to pass through for SSL issuance/renewal.
    if (req.path.startsWith("/.well-known/acme-challenge/")) {
        return next();
    }

    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
    const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim().toLowerCase();
    const rawHost = forwardedHost || String(req.get("host") || "").trim().toLowerCase();
    const host = rawHost.split(":")[0];
    const protocol = forwardedProto || (req.secure ? "https" : "http");

    if (!host || !CANONICAL_REDIRECT_ENABLED) {
        return next();
    }

    const mustRedirectToCanonicalHost = protocol !== "https" || LEGACY_HOSTS.has(host);
    if (mustRedirectToCanonicalHost) {
        return res.redirect(301, `${OFFICIAL_SITE_URL}${req.originalUrl || "/"}`);
    }

    return next();
});

// ========================
// 🔍 DEBUG MIDDLEWARE (Remove in production)
// ========================

if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`📍 ${req.method} ${req.path}`);
        next();
    });
}

// ========================
// 🛡️ CUSTOM SECURITY MIDDLEWARES - FIXED
// ========================

// 1. Block Suspicious User Agents & Bots - FIXED
app.use((req, res, next) => {
    const userAgent = req.get('User-Agent') || '';
    const lowerUA = userAgent.toLowerCase();
    const clientIP = req.ip || req.connection.remoteAddress;

    // ✅ CRITICAL FIX: Skip ALL security checks for API routes
    if (req.path.startsWith('/api/')) {
        return next();
    }

    // Allowed bots (whitelist)
    const allowedBots = ['googlebot', 'bingbot', 'slurp', 'duckduckbot', 'facebookexternalhit'];

    // Suspicious patterns (only actual malicious tools)
    const suspiciousPatterns = [
        'sqlmap',
        'nikto',
        'metasploit',
        'burpsuite',
        'hydra',
        'nmap',
        'masscan',
        'zgrab',
        'gobuster'
    ];

    const isAllowedBot = allowedBots.some(bot => lowerUA.includes(bot));
    if (isAllowedBot) {
        return next();
    }

    const isSuspicious = suspiciousPatterns.some(pattern => lowerUA.includes(pattern));
    if (isSuspicious) {
        console.log(`🚨 Blocked Suspicious UA: ${userAgent} from IP: ${clientIP}`);
        return res.status(403).json({
            error: 'Access denied',
            message: 'Suspicious activity detected'
        });
    }

    next();
});

// 2. Block Malicious HTTP Methods - FIXED
app.use((req, res, next) => {
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'];

    if (!allowedMethods.includes(req.method)) {
        console.log(`🚨 Blocked Suspicious Method: ${req.method} from IP: ${req.ip}`);
        return res.status(405).json({
            error: 'Method not allowed'
        });
    }
    next();
});

// 3. Block Suspicious Paths & Directory Traversal - COMPLETELY FIXED
app.use((req, res, next) => {
    const requestedPath = req.path.toLowerCase();
    const clientIP = req.ip || req.connection.remoteAddress;

    // ✅ CRITICAL FIX: WHITELIST all API routes FIRST
    const safePaths = [
        '/api/',              // ✅ This covers ALL API routes including /api/v1/
        '/health',
        '/security/info',
        '/admin',
        '/superadmin',
        '/superfranchisee',
        '/franchisee',
        '/subfranchisee'
    ];

    // ✅ Check if it's a safe path - IMMEDIATE RETURN
    const isSafePath = safePaths.some(path =>
        requestedPath.startsWith(path.toLowerCase())
    );
    
    if (isSafePath) {
        return next(); // ✅ Allow all API routes without any checks
    }

    // ✅ BLACKLIST: Only for non-API paths
    const suspiciousPaths = [
        '.env', '.git', '.htaccess', '.htpasswd',
        'wp-admin', 'administrator', 'phpmyadmin',
        'mysql', 'config', 'backup', 'debug', 'console'
    ];

    const suspiciousExtensions = ['.php', '.asp', '.aspx', '.jsp', '.sh', '.exe'];

    const hasSuspiciousPath = suspiciousPaths.some(path => requestedPath.includes(path));
    if (hasSuspiciousPath) {
        console.log(`🚨 Blocked Suspicious Path: ${req.path} from IP: ${clientIP}`);
        return res.status(404).json({
            error: 'Not found'
        });
    }

    const hasSuspiciousExtension = suspiciousExtensions.some(ext => requestedPath.endsWith(ext));
    if (hasSuspiciousExtension) {
        console.log(`🚨 Blocked Suspicious Extension: ${req.path} from IP: ${clientIP}`);
        return res.status(404).json({
            error: 'Not found'
        });
    }

    // Block directory traversal
    if (req.url.includes('..') || req.url.includes('~/')) {
        console.log(`🚨 Blocked Directory Traversal: ${req.url} from IP: ${clientIP}`);
        return res.status(400).json({
            error: 'Bad request'
        });
    }

    next();
});

// 4. Request Size Limiter
app.use((req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    const maxRequestSize = 100 * 1024 * 1024; // 100MB

    if (contentLength > maxRequestSize) {
        return res.status(413).json({
            error: 'Request too large'
        });
    }
    next();
});

// ========================
// 📋 STANDARD MIDDLEWARES
// ========================

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(cookieParser());

app.use((req, res, next) => {
    const noindexPaths = [
        "/login.html",
        "/franchiseelogin.html",
        "/resetpassword.html"
    ];
    const noindexPrefixes = [
        "/admin",
        "/superAdmin",
        "/superFranchisee",
        "/franchisee",
        "/subFranchisee",
        "/api/"
    ];

    if (noindexPaths.includes(req.path) || noindexPrefixes.some((prefix) => req.path.startsWith(prefix))) {
        res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    }

    return next();
});

// Global Error Handling Middleware
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        console.error('JSON Parse Error:', error);
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    next();
});

// ========================
// 🚦 ROUTES
// ========================

import targetRouter from "./src/routes/target.routes.js";

app.use("/api/v1/user", userRouter);
app.use("/api/v1/qr-reports", qrReportRouter);
app.use("/api/v1/offline-reports", offlineReportRouter);
app.use("/r", qrReportRouter);
app.use("/api/v1/target", targetRouter);
app.use("/", marketingRouter);
app.use(express.static("public", {
    index: false,
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
    etag: true,
    setHeaders: (res, filePath) => {
        if (/[/\\](sitemap\.xml|robots\.txt)$/i.test(filePath)) {
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
            return;
        }
        if (/\.(png|jpe?g|gif|svg|webp|avif|css|js|woff2?)$/i.test(filePath)) {
            res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
        }
    }
}));

// Health Check Route
app.get('/health', (req, res) => {
    const health = {
        status: 'OK',
        timestamp: new Date(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        env: process.env.NODE_ENV
    };
    res.json(health);
});

// Security Info Route
app.get('/security/info', (req, res) => {
    res.json({
        message: 'Security measures active',
        features: [
            'Rate Limiting',
            'SQL Injection Protection',
            'XSS Protection',
            'DDoS Protection',
            'Bot Detection',
            'Helmet Security Headers'
        ]
    });
});

// Verify token route
app.get('/api/verify-token', verifyJWT, (req, res) => {
    res.json({ isAuthorized: true, user: req.user });
});

app.get('/api/session', async (req, res) => {
    const requestedType = req.query?.type || 'any';
    const strict = String(req.query?.strict || 'false').toLowerCase() === 'true';

    try {
        const session = await resolvePortalSession(req, {
            type: requestedType,
            strict,
            allowRefresh: true
        });

        if (!session) {
            clearAuthCookies(res);
            return res.status(401).json({
                authenticated: false,
                message: 'Your session could not be restored. Please login again.',
                loginPath: requestedType === 'superAdmin' ? '/login.html' : '/franchiseelogin.html',
                homePath: requestedType === 'superAdmin' ? '/login.html' : '/index.html'
            });
        }

        applyPortalSessionCookies(res, session);

        return res.status(200).json({
            authenticated: true,
            kind: session.kind,
            portalRole: session.portalRole,
            redirectTo: session.redirectTo,
            accessToken: session?.tokens?.accessToken || req.cookies?.accessToken || null,
            user: session.user || null,
            superAdmin: session.superAdmin || null
        });
    } catch (error) {
        console.error('Session restore failed:', error);
        clearAuthCookies(res);
        return res.status(401).json({
            authenticated: false,
            message: 'Your session is no longer valid. Please login again.',
            loginPath: requestedType === 'superAdmin' ? '/login.html' : '/franchiseelogin.html',
            homePath: requestedType === 'superAdmin' ? '/login.html' : '/index.html'
        });
    }
});

// ========================
// 🔒 PROTECTED STATIC ROUTES
// ========================

const protectedStatic = (directory) => {
    return express.static(directory, {
        setHeaders: (res, path) => {
            if (path.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript');
            } else if (path.endsWith('.css')) {
                res.setHeader('Content-Type', 'text/css');
            } else if (path.endsWith('.html')) {
                res.setHeader('Content-Type', 'text/html');
            } else if (path.endsWith('.json')) {
                res.setHeader('Content-Type', 'application/json');
            }
        }
    });
};

// Admin routes
app.use('/admin', verifyJWT, (req, res, next) => {
    const user = req.user;

    if (user.role === 'admin' || (user.role === 'staff' && user.parentRole === 'admin')) {
        return next();
    }

    return res.redirect('/index.html');
}, protectedStatic('private'));

app.use('/superFranchisee', verifyJWT, (req, res, next) => {
    const user = req.user;

    if (user.role === 'superFranchisee' || (user.role === 'staff' && user.parentRole === 'superFranchisee')) {
        return next();
    }

    return res.redirect('/index.html');
}, protectedStatic('private'));

app.use('/franchisee', verifyJWT, (req, res, next) => {
    const user = req.user;

    if (user.role === 'franchisee' || (user.role === 'staff' && user.parentRole === 'franchisee')) {
        return next();
    }

    return res.redirect('/index.html');
}, protectedStatic('private'));

app.use('/subFranchisee', verifyJWT, (req, res, next) => {
    const user = req.user;

    if (user.role === 'subFranchisee' || (user.role === 'staff' && user.parentRole === 'subFranchisee')) {
        return next();
    }

    return res.redirect('/index.html');
}, protectedStatic('private'));

app.use('/superAdmin', verifySuperAdmin, (req, res, next) => {
    if (req.superAdmin.role !== 'superAdmin' && req.superAdmin.role !== 'staff') {
        return res.redirect('/login.html');
    }

    if (req.superAdmin.role === 'staff' && req.superAdmin.parentRole !== 'superAdmin') {
        return res.redirect('/login.html');
    }

    next();
}, protectedStatic('private'));

// ========================
// 🎯 ERROR HANDLERS
// ========================

// 404 Handler - MUST BE AFTER ALL ROUTES
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl
    });
});

// Global Error Handler
app.use((error, req, res, next) => {
    console.error('💥 Global Error Handler:', error);

    if (error?.clearAuth) {
        clearAuthCookies(res);
    }

    const statusCode = error?.statusCode || error?.status || 500;
    const errorResponse = {
        error: error?.code || error?.error || 'Something went wrong!',
        message: error?.message || 'Something went wrong!'
    };

    if (process.env.NODE_ENV !== 'production') {
        errorResponse.details = error.message;
        errorResponse.stack = error.stack;
    }

    res.status(statusCode).json(errorResponse);
});

// ========================
// 🚀 SERVER STARTUP
// ========================

Connect_DB()
    .then(async () => {
        await cleanupCustomizationsOnStartup();

        const server = app.listen(process.env.PORT || 3000, () => {
            console.log(`✅ Server is running on port ${process.env.PORT || 3000}`);
            console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🛡️  Security Features: Active`);
            console.log(`🔓 Development Mode - CSP & Rate Limiting: DISABLED`);
            console.log(`🧹 Memory Auto-Cleanup: ACTIVE (70MB threshold)`);

            initializeSchedulers();
        });

        const gracefulShutdown = () => {
            console.log('🛑 Received shutdown signal, closing server gracefully...');
            server.close(() => {
                console.log('✅ Server closed');
                process.exit(0);
            });

            setTimeout(() => {
                console.error('❌ Could not close connections in time, forcefully shutting down');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', gracefulShutdown);
        process.on('SIGINT', gracefulShutdown);
    })
    .catch((err) => {
        console.error("❌ MongoDB connection failed:", err);
        process.exit(1);
    });

export default app;
