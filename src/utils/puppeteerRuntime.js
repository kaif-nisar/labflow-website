import fs from "fs";
import path from "path";
import { resolveReadablePath, resolveRuntimePath } from "./runtimePaths.js";
import { PUPPETEER_OFFLINE_ARGS } from "./pdfOfflineAssets.js";

const getExecutableCandidates = () => {
    const configuredExecutable = String(process.env.PUPPETEER_EXECUTABLE_PATH || "").trim();
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

    const platformCandidates = process.platform === "win32"
        ? [
            resolveReadablePath("chromium", "chrome-headless-shell-win64", "chrome-headless-shell.exe"),
            resolveReadablePath("chromium", "chrome-win64", "chrome.exe"),
            resolveReadablePath("chromium", "chrome-win", "chrome.exe"),
            path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
            path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
            localAppData ? path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe") : "",
            path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
            path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
        ]
        : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
        : [
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/google-chrome",
            "/usr/bin/chrome",
            "/snap/bin/chromium",
        ];

    return [
        configuredExecutable
            ? (path.isAbsolute(configuredExecutable)
                ? configuredExecutable
                : resolveRuntimePath(configuredExecutable))
            : "",
        ...platformCandidates,
    ].filter(Boolean);
};

export const resolvePuppeteerExecutablePath = () => {
    const executablePath = getExecutableCandidates().find((candidatePath) =>
        fs.existsSync(candidatePath)
    );

    if (executablePath) {
        process.env.PUPPETEER_EXECUTABLE_PATH = executablePath;
        return executablePath;
    }

    return "";
};

export const getPuppeteerLaunchOptions = (overrides = {}) => {
    const executablePath = resolvePuppeteerExecutablePath();
    const launchOptions = {
        headless: "new",
        args: PUPPETEER_OFFLINE_ARGS,
        ...overrides,
    };

    if (executablePath) {
        launchOptions.executablePath = executablePath;
    }

    return launchOptions;
};
