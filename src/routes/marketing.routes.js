import { Router } from "express";

import {
    allPages,
    blogPosts,
    blogTopicIdeas,
    redirectMap,
    getAllIndexableUrls,
    getBlogPostBySlug,
    getPageBySlug
} from "../content/marketingContent.js";
import { renderBlogIndex, renderBlogPost, renderPage } from "../utils/marketingRenderer.js";

const router = Router();

const resolveSiteOrigin = (req) => {
    const configuredOrigin = String(process.env.PUBLIC_SITE_URL || process.env.SITE_URL || "").trim();
    if (configuredOrigin) {
        return configuredOrigin.replace(/\/+$/, "");
    }

    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
    const protocol = forwardedProto || req.protocol || "https";
    const host = forwardedHost || req.get("host") || "labflowlis.com";
    return `${protocol}://${host}`.replace(/\/+$/, "");
};

Object.entries(redirectMap).forEach(([from, to]) => {
    router.get(from, (req, res) => {
        res.redirect(301, to);
    });
});

router.get("/robots.txt", (req, res) => {
    const siteOrigin = resolveSiteOrigin(req);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.type("text/plain").send(`User-agent: *
Allow: /

Sitemap: ${siteOrigin}/sitemap.xml
Host: ${siteOrigin.replace(/^https?:\/\//, "")}

Disallow: /admin/
Disallow: /superAdmin/
Disallow: /superFranchisee/
Disallow: /franchisee/
Disallow: /subFranchisee/
Disallow: /private/
`);
});

router.get("/sitemap.xml", (req, res) => {
    const siteOrigin = resolveSiteOrigin(req);
    const urls = getAllIndexableUrls();
    const lastmod = new Date().toISOString().split("T")[0];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${siteOrigin}${url === "/" ? "" : url}</loc><lastmod>${lastmod}</lastmod><changefreq>${url.startsWith("/blog/") ? "monthly" : "weekly"}</changefreq><priority>${url === "/" ? "1.0" : url === "/demo" ? "0.9" : "0.8"}</priority></url>`).join("\n")}
</urlset>`;
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.type("application/xml").send(xml);
});

router.get("/seo-data.json", (req, res) => {
    res.json({
        pages: allPages.map((page) => ({ slug: page.slug, title: page.title, keyword: page.primaryKeyword })),
        blogs: blogPosts.map((post) => ({ slug: `/blog/${post.slug}`, title: post.title, keyword: post.primaryKeyword })),
        blogTopics: blogTopicIdeas
    });
});

router.get("/", (req, res) => {
    const page = getPageBySlug("/");
    res.status(200).type("html").send(renderPage(page, "/", resolveSiteOrigin(req)));
});

router.get("/blog", (req, res) => {
    const page = getPageBySlug("/blog");
    res.status(200).type("html").send(renderBlogIndex(page, "/blog", resolveSiteOrigin(req)));
});

router.get("/blog/:slug", (req, res, next) => {
    const post = getBlogPostBySlug(req.params.slug);
    if (!post) {
        return next();
    }

    return res.status(200).type("html").send(renderBlogPost(post, `/blog/${post.slug}`, resolveSiteOrigin(req)));
});

router.get(allPages.filter((page) => page.slug !== "/" && page.slug !== "/blog").map((page) => page.slug), (req, res, next) => {
    const page = getPageBySlug(req.path);
    if (!page) {
        return next();
    }

    return res.status(200).type("html").send(renderPage(page, req.path, resolveSiteOrigin(req)));
});

export default router;
