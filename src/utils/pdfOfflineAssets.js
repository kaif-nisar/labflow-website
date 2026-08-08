import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import { UPLOAD_ROOT } from "./localStorage.js";
import {
  getRuntimeRoot,
  getSourceRoot,
  resolveReadablePath,
  resolveRuntimePath,
} from "./runtimePaths.js";

const runtimeRoot = getRuntimeRoot();
const sourceRoot = getSourceRoot();
const publicRoot = resolveReadablePath("public");
const tempRoot = resolveRuntimePath("temp");
const searchableRoots = Array.from(
  new Set([runtimeRoot, sourceRoot, publicRoot, tempRoot, UPLOAD_ROOT])
);

const isInsideAllowedRoot = (candidatePath) => {
  return searchableRoots.some((allowedRoot) => {
    const relativePath = path.relative(allowedRoot, candidatePath);
    return (
      relativePath === "" ||
      (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
    );
  });
};

const tryResolveExistingPath = async (candidatePath) => {
  try {
    const stats = await fs.stat(candidatePath);
    return stats.isFile() ? candidatePath : null;
  } catch {
    return null;
  }
};

export const PUPPETEER_OFFLINE_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--allow-file-access-from-files",
  "--enable-local-file-accesses",
  "--disable-web-security",
];

const normalizeSlashes = (value) => String(value || "").replace(/\\/g, "/");

export const resolveLocalAssetPath = async (assetReference) => {
  if (!assetReference) {
    return null;
  }

  const rawValue = String(assetReference).trim();
  if (!rawValue || rawValue.startsWith("data:")) {
    return null;
  }

  if (rawValue.startsWith("file://")) {
    const filePath = fileURLToPath(rawValue);
    return isInsideAllowedRoot(filePath) ? filePath : null;
  }

  if (/^https?:\/\//i.test(rawValue)) {
    try {
      const url = new URL(rawValue);
      if (["127.0.0.1", "localhost"].includes(url.hostname)) {
        return resolveLocalAssetPath(`${url.pathname}${url.search || ""}`);
      }
      return null;
    } catch {
      return null;
    }
  }

  const sanitized = normalizeSlashes(rawValue).split("?")[0].split("#")[0];
  const relativeCandidates = [];
  const pushCandidate = (candidatePath) => {
    if (!candidatePath) {
      return;
    }

    relativeCandidates.push(path.normalize(candidatePath));
  };

  if (sanitized.startsWith("/uploads/")) {
    pushCandidate(path.join(UPLOAD_ROOT, sanitized.slice("/uploads/".length)));
  } else if (sanitized.startsWith("uploads/")) {
    pushCandidate(path.join(UPLOAD_ROOT, sanitized.slice("uploads/".length)));
  } else if (sanitized.startsWith("/public/")) {
    pushCandidate(path.join(publicRoot, sanitized.slice("/public/".length)));
  } else if (sanitized.startsWith("/temp/")) {
    pushCandidate(path.join(tempRoot, sanitized.slice("/temp/".length)));
  } else if (sanitized.startsWith("/")) {
    pushCandidate(path.join(publicRoot, sanitized.slice(1)));
    pushCandidate(path.join(runtimeRoot, sanitized.slice(1)));
    pushCandidate(path.join(sourceRoot, sanitized.slice(1)));
  } else if (path.isAbsolute(sanitized)) {
    pushCandidate(sanitized);
  } else {
    pushCandidate(path.join(publicRoot, sanitized));
    pushCandidate(path.join(tempRoot, sanitized));
    pushCandidate(path.join(runtimeRoot, sanitized));
    pushCandidate(path.join(sourceRoot, sanitized));
  }

  for (const candidate of relativeCandidates) {
    const normalized = path.normalize(candidate);
    if (!isInsideAllowedRoot(normalized)) {
      continue;
    }

    const resolved = await tryResolveExistingPath(normalized);
    if (resolved) {
      return resolved;
    }
  }

  return null;
};

export const resolveFileUrl = async (assetReference) => {
  const localPath = await resolveLocalAssetPath(assetReference);
  if (!localPath) {
    return assetReference;
  }

  return pathToFileURL(localPath).href;
};

const replaceCssUrlReferences = async (content) => {
  const matches = [...content.matchAll(/url\((['"]?)([^'")]+)\1\)/gi)];
  let updated = content;

  for (const match of matches) {
    const originalReference = match[2];
    if (!originalReference || originalReference.startsWith("data:")) {
      continue;
    }

    const fileUrl = await resolveFileUrl(originalReference);
    if (fileUrl && fileUrl !== originalReference) {
      updated = updated.replace(match[0], `url("${fileUrl}")`);
    }
  }

  return updated;
};

export const sanitizePdfMarkup = (markup = "") => {
  const rawMarkup = String(markup || "");
  if (!rawMarkup.trim()) {
    return "";
  }

  const $ = cheerio.load(rawMarkup, { decodeEntities: false });

  $("script, noscript").remove();

  $("*").each((_, element) => {
    const attributes = element.attribs || {};
    for (const [attributeName, attributeValue] of Object.entries(attributes)) {
      const normalizedAttribute = String(attributeName || "").toLowerCase();
      const normalizedValue = String(attributeValue || "").trim().toLowerCase();

      if (normalizedAttribute.startsWith("on")) {
        $(element).removeAttr(attributeName);
        continue;
      }

      if (
        ["href", "src", "xlink:href", "action", "formaction"].includes(normalizedAttribute) &&
        normalizedValue.startsWith("javascript:")
      ) {
        $(element).removeAttr(attributeName);
      }
    }
  });

  if ($("body").length > 0) {
    return $("body").html() || "";
  }

  return $.root().html() || "";
};

export const sanitizePdfCss = (css = "") => {
  const rawCss = String(css || "");
  if (!rawCss.trim()) {
    return "";
  }

  let sanitizedCss = rawCss
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "$1");

  const embeddedStyleBlocks = [
    ...sanitizedCss.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi),
  ];

  if (embeddedStyleBlocks.length > 0) {
    sanitizedCss = embeddedStyleBlocks
      .map(([, blockContent = ""]) => String(blockContent || ""))
      .join("\n");
  }

  sanitizedCss = sanitizedCss
    .replace(/<\/?style\b[^>]*>/gi, "")
    .replace(/<\/?script\b[^>]*>/gi, "")
    .replace(/url\((['"]?)\s*javascript:[^)]+\1\)/gi, 'url("")')
    .replace(/@import\s+(?:url\()?['"]?\s*javascript:[^;]+;?/gi, "")
    .replace(/\0/g, "")
    .trim();

  return sanitizedCss;
};

export const rewriteHtmlForOfflinePdf = async (html = "") => {
  let markup = String(html || "");
  if (!markup.trim()) {
    return markup;
  }

  const $ = cheerio.load(markup, { decodeEntities: false });
  const assetAttributes = ["src", "href", "poster"];

  const nodes = $("img, source, link, script, video, audio");
  for (const element of nodes.toArray()) {
    const node = $(element);
    for (const attribute of assetAttributes) {
      const originalValue = node.attr(attribute);
      if (!originalValue || originalValue.startsWith("data:")) {
        continue;
      }

      const fileUrl = await resolveFileUrl(originalValue);
      if (fileUrl && fileUrl !== originalValue) {
        node.attr(attribute, fileUrl);
      }
    }

    const styleValue = node.attr("style");
    if (styleValue) {
      node.attr("style", await replaceCssUrlReferences(styleValue));
    }
  }

  markup = $.html();
  return replaceCssUrlReferences(markup);
};

export const readAssetAsBuffer = async (assetReference) => {
  if (!assetReference) {
    return null;
  }

  const rawValue = String(assetReference).trim();
  if (!rawValue) {
    return null;
  }

  if (rawValue.startsWith("data:")) {
    const match = rawValue.match(/^data:([^;,]+)(?:;[^;,]+)*;base64,(.+)$/is);
    if (!match) {
      return null;
    }

    const mimeType = match[1].trim() || "image/png";
    const base64Payload = match[2].replace(/\s+/g, "");
    if (!base64Payload) {
      return null;
    }

    return {
      buffer: Buffer.from(base64Payload, "base64"),
      mimeType,
    };
  }

  const localPath = await resolveLocalAssetPath(rawValue);
  if (localPath) {
    const buffer = await fs.readFile(localPath);
    return {
      buffer,
      mimeType: getMimeType(localPath),
    };
  }

  if (/^https?:\/\//i.test(rawValue)) {
    const response = await axios.get(rawValue, {
      responseType: "arraybuffer",
      timeout: 10000,
    });

    return {
      buffer: Buffer.from(response.data),
      mimeType: response.headers["content-type"] || getMimeType(rawValue),
    };
  }

  return null;
};

export const getMimeType = (filePath) => {
  const extension = path.extname(String(filePath || "")).toLowerCase();
  const mimeMap = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".gif": "image/gif",
  };

  return mimeMap[extension] || "application/octet-stream";
};

const delay = (timeoutMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });

export const waitForOfflineAssets = async (page) => {
  const pageUrl = page.url();
  let networkIdleReached = false;

  try {
    if (typeof page.waitForNetworkIdle === "function") {
      await page.waitForNetworkIdle({
        idleTime: 300,
        timeout: 2500,
      });
      networkIdleReached = true;
    }
  } catch (error) {
    console.warn("[pdf] Offline asset wait did not reach network-idle cleanly.", {
      message: error?.message || String(error),
      stack: error?.stack || "",
      pageUrl,
    });
  }

  await delay(350);

  return {
    ok: true,
    pageUrl,
    networkIdleReached,
  };
};

const ensureDirectory = async (targetPath) => {
  await fs.mkdir(targetPath, { recursive: true });
};

export const loadOfflineHtmlIntoPage = async (
  page,
  htmlContent,
  { waitUntil = "networkidle0", logContext = "pdf-render" } = {}
) => {
  const offlineHtml = await rewriteHtmlForOfflinePdf(htmlContent);
  const renderRoot = path.join(tempRoot, "pdf-render-cache");
  await ensureDirectory(renderRoot);

  const tempFilePath = path.join(
    renderRoot,
    `render-${Date.now()}-${Math.random().toString(36).slice(2)}.html`
  );

  await fs.writeFile(tempFilePath, offlineHtml, "utf8");
  const tempFileUrl = pathToFileURL(tempFilePath).href;

  try {
    await page.setJavaScriptEnabled(false);
    await page.goto(tempFileUrl, { waitUntil });
    await page.waitForSelector("body", { timeout: 5e3 });
    await waitForOfflineAssets(page);
    await page.emulateMediaType("screen");
  } catch (error) {
    console.error("[pdf] Failed to load offline HTML into Puppeteer.", {
      context: logContext,
      message: error?.message || String(error),
      stack: error?.stack || "",
      tempFilePath,
      tempFileUrl,
      waitUntil,
    });
    await fs.unlink(tempFilePath).catch(() => {});
    throw error;
  }

  return async () => {
    await fs.unlink(tempFilePath).catch(() => {});
  };
};
