import {
    SITE,
    SITE_URL,
    CTA_LINKS,
    PRIMARY_NAV,
    TRUST_BADGES,
    FEATURE_PILLARS,
    FAQ_BASE,
    blogPosts
} from "../content/marketingContent.js";

const DEFAULT_SOCIAL_IMAGE = "/images/dashboard.png";
const normalizeSiteOrigin = (value = SITE_URL) => String(value || SITE_URL).replace(/\/+$/, "");
const formatUrl = (pathname = "/", siteOrigin = SITE_URL) => `${normalizeSiteOrigin(siteOrigin)}${pathname === "/" ? "" : pathname}`;

const escapeHtml = (value = "") => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const serializeJsonLd = (value) => JSON.stringify(value).replace(/<\//g, "<\\/");

const sectionParagraph = (text) => `<p>${escapeHtml(text)}</p>`;

const buildBreadcrumbs = (pathname, title, siteOrigin) => {
    const crumbs = [{ name: "Home", item: normalizeSiteOrigin(siteOrigin) }];
    if (pathname !== "/") {
        crumbs.push({ name: title, item: formatUrl(pathname, siteOrigin) });
    }
    return crumbs;
};

const buildFaqSchema = (faqItems = []) => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqItems.map((item) => ({
        "@type": "Question",
        "name": item.question,
        "acceptedAnswer": {
            "@type": "Answer",
            "text": item.answer
        }
    }))
});

const buildCommonSchemas = (page, pathname, siteOrigin) => {
    const schemas = [];
    const canonicalUrl = formatUrl(pathname, siteOrigin);
    const baseUrl = normalizeSiteOrigin(siteOrigin);

    schemas.push({
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${baseUrl}#organization`,
        "name": SITE.brandName,
        "logo": formatUrl("/logoPng.png", siteOrigin),
        "url": baseUrl,
        "email": SITE.supportEmail,
        "telephone": SITE.supportPhone,
        "sameAs": SITE.socialLinks,
        "description": SITE.foundingDescription,
        "contactPoint": [
            {
                "@type": "ContactPoint",
                "contactType": "sales",
                "telephone": SITE.supportPhone,
                "email": SITE.supportEmail,
                "areaServed": ["IN", "AE", "UK", "US", "NP", "BD"],
                "availableLanguage": ["en", "hi"]
            }
        ]
    });

    schemas.push({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${baseUrl}#website`,
        "url": baseUrl,
        "name": SITE.brandName,
        "publisher": {
            "@id": `${baseUrl}#organization`
        },
        "potentialAction": {
            "@type": "SearchAction",
            "target": `${baseUrl}/blog?query={search_term_string}`,
            "query-input": "required name=search_term_string"
        }
    });

    schemas.push({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "@id": `${canonicalUrl}#software`,
        "name": SITE.brandName,
        "applicationCategory": "MedicalApplication",
        "operatingSystem": "Web",
        "url": canonicalUrl,
        "image": formatUrl(DEFAULT_SOCIAL_IMAGE, siteOrigin),
        "description": page.description,
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock"
        },
        "provider": {
            "@type": "Organization",
            "@id": `${baseUrl}#organization`
        },
        "areaServed": page.market || "Global"
    });

    schemas.push({
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": `${canonicalUrl}#product`,
        "name": `${SITE.brandName} Pathology Software`,
        "brand": {
            "@type": "Brand",
            "name": SITE.brandName
        },
        "image": [
            formatUrl("/logoPng.png", siteOrigin),
            formatUrl(DEFAULT_SOCIAL_IMAGE, siteOrigin)
        ],
        "description": page.description,
        "category": "Pathology Lab Software",
        "url": canonicalUrl,
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock",
            "url": canonicalUrl
        },
        "provider": {
            "@id": `${baseUrl}#organization`
        }
    });

    schemas.push({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": `${canonicalUrl}#webpage`,
        "url": canonicalUrl,
        "name": page.title,
        "description": page.description,
        "isPartOf": {
            "@id": `${baseUrl}#website`
        },
        "about": {
            "@id": `${canonicalUrl}#software`
        }
    });

    schemas.push({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": buildBreadcrumbs(pathname, page.h1, siteOrigin).map((crumb, index) => ({
            "@type": "ListItem",
            "position": index + 1,
            "name": crumb.name,
            "item": crumb.item
        }))
    });

    if (page.faqs?.length) {
        schemas.push(buildFaqSchema(page.faqs));
    } else if (FAQ_BASE.length) {
        schemas.push(buildFaqSchema(FAQ_BASE.slice(0, 3)));
    }

    schemas.push({
        "@context": "https://schema.org",
        "@type": "ContactPage",
        "name": `${SITE.brandName} Contact`,
        "url": formatUrl("/contact", siteOrigin)
    });

    schemas.push({
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": SITE.brandName,
        "url": baseUrl,
        "telephone": SITE.supportPhone,
        "email": SITE.supportEmail,
        "address": {
            "@type": "PostalAddress",
            ...SITE.address
        }
    });

    return schemas;
};

const buildPageSections = (page) => {
    const keywordLine = `${page.primaryKeyword} matters because labs do not buy software only for a brochure. They buy it to reduce delays, improve confidence, increase repeat patients, and create a workflow the whole team can follow.`;
    return [
        {
            heading: `Why ${page.primaryKeyword} buyers are changing how they evaluate software`,
            paragraphs: [
                keywordLine,
                `The winning pathology software category pages on the web usually focus on generic claims, but decision makers now ask deeper questions. They want to know whether a system can improve booking, billing, barcode tracking, result entry, report delivery, doctor coordination, and branch visibility without making the team slower. LabFlow is positioned around that practical outcome rather than vanity feature lists.`,
                `For ${page.market} buyers, the right software also needs to work as a growth platform. That means cleaner patient handling, better report turnaround, faster communication, and fewer operational mistakes. Labs that still depend on fragmented files, manual registers, or disconnected billing tools often hit a scale ceiling long before demand disappears.`,
                `This page is designed to answer those commercial and operational questions directly so a lab owner, pathologist, manager, or diagnostic entrepreneur can understand where ${page.primaryKeyword} fits into a profitable workflow.`
            ]
        },
        {
            heading: "Core workflows that LabFlow helps organize",
            paragraphs: [
                `The strongest labs usually create repeatable systems around five layers: patient registration, billing, sample tracking, result entry, and report dispatch. When those layers are disconnected, staff depend on memory, hand-written notes, or ad-hoc follow-up. LabFlow reduces that dependency by connecting the workflow from the front desk to the final report.`,
                `In practical terms, that means operators can move from booking to test mapping to barcode-linked samples more predictably. Staff can also work with department-specific report formats and reference ranges without rebuilding process logic every day.`,
                `Labs looking for ${page.secondaryKeywords?.[0] || page.primaryKeyword} usually care about speed as much as control. The goal is not to create software complexity. The goal is to let teams finish routine work with fewer errors and stronger visibility.`,
                `As demand grows through doctors, preventive packages, camps, corporate tie-ups, or franchise expansion, structured workflow becomes a competitive moat.`
            ]
        },
        {
            heading: "Operational advantages beyond feature lists",
            paragraphs: [
                `Many vendors describe features, but buyers often need to translate those features into business outcomes. Faster billing means more patients handled during peak hours. Cleaner barcode tracking means fewer mismatches. Better report delivery means fewer support calls. Role permissions mean lower process dependency on a single person.`,
                `That is why ${page.primaryKeyword} should be evaluated against turnaround time, consistency, trust, and scale-readiness. A lab that improves each of those areas becomes easier to run and easier to grow.`,
                `LabFlow is also positioned for labs that need a practical balance between usability and structure. Teams should not need weeks of retraining to benefit from software. At the same time, leadership should still gain control over visibility, accountability, and process discipline.`,
                `For competitive markets, these software-driven improvements influence brand perception as much as marketing.`
            ]
        },
        {
            heading: `Who this ${page.primaryKeyword} page is built for`,
            paragraphs: [
                `This page is relevant for small pathology labs, fast-growing diagnostic centers, doctor-owned labs, franchise operators, and multi-location businesses reviewing software options.`,
                `It is especially useful for teams that want better reporting, barcode workflow, digital delivery, and cleaner commercial visibility without relying on multiple disconnected tools.`,
                `If you are comparing options such as lab reporting software, pathology billing software, cloud-based pathology software, or a more complete laboratory information system, the best fit usually depends on how tightly your workflow needs to stay connected.`,
                `LabFlow aims to serve buyers who want one structured platform that supports daily execution first and scale second.`
            ]
        },
        {
            heading: "Conversion-focused next step",
            paragraphs: [
                `Software decisions become easier when teams see real booking, billing, barcode, and reporting flow instead of static screenshots. That is why a live demo remains the strongest next step after content research.`,
                `If your goal is to reduce front-desk delays, standardize reports, improve digital patient communication, or bring more control to branch and franchise workflow, the next step should be a process-led demo rather than a generic sales presentation.`,
                `Use the internal links on this page to review pricing, compare workflow benefits, or explore local and global landing pages aligned with your market.`,
                `Then book a demo so your team can validate fit against real operational tasks.`
            ]
        }
    ];
};

const relatedCards = (related = []) => related.map((href) => `
    <a class="related-card" href="${href}">
        <strong>${escapeHtml(href.replace(/\//g, " ").replace(/-/g, " ").trim() || "Home")}</strong>
        <span>Open page</span>
    </a>
`).join("");

const blogCard = (post) => `
    <article class="blog-card">
        <p class="eyebrow">${escapeHtml(post.category)}</p>
        <h3><a href="/blog/${post.slug}">${escapeHtml(post.title)}</a></h3>
        <p>${escapeHtml(post.description)}</p>
        <a class="text-link" href="/blog/${post.slug}">Read article</a>
    </article>
`;

const commonHead = ({ title, description, canonicalPath, keywords, schemaJson, siteOrigin = SITE_URL, robots = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" }) => `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="keywords" content="${escapeHtml(keywords.join(", "))}">
    <meta name="author" content="${escapeHtml(SITE.brandName)}">
    <meta name="application-name" content="${escapeHtml(SITE.brandName)}">
    <meta name="apple-mobile-web-app-title" content="${escapeHtml(SITE.brandName)}">
    <meta name="robots" content="${robots}">
    <link rel="canonical" href="${formatUrl(canonicalPath, siteOrigin)}">
    <link rel="alternate" hreflang="en-in" href="${formatUrl(canonicalPath, siteOrigin)}">
    <link rel="alternate" hreflang="x-default" href="${formatUrl(canonicalPath, siteOrigin)}">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${formatUrl(canonicalPath, siteOrigin)}">
    <meta property="og:site_name" content="${escapeHtml(SITE.brandName)}">
    <meta property="og:locale" content="en_IN">
    <meta property="og:image" content="${formatUrl(DEFAULT_SOCIAL_IMAGE, siteOrigin)}">
    <meta property="og:image:alt" content="${escapeHtml(`${SITE.brandName} pathology software dashboard preview`)}">
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:title" content="${escapeHtml(title)}">
    <meta property="twitter:description" content="${escapeHtml(description)}">
    <meta property="twitter:image" content="${formatUrl(DEFAULT_SOCIAL_IMAGE, siteOrigin)}">
    <meta property="twitter:url" content="${formatUrl(canonicalPath, siteOrigin)}">
    <meta name="theme-color" content="#0c1733">
    <meta http-equiv="content-language" content="en">
    <link rel="preload" href="/css/marketing-seo.css" as="style">
    <link rel="stylesheet" href="/css/marketing-seo.css">
    <script type="application/ld+json">${serializeJsonLd(schemaJson)}</script>
`;

const navHtml = `
    <header class="site-header">
        <div class="wrap nav-shell">
            <a class="brand" href="/" aria-label="LabFlow home">
                <img class="brand-logo" src="/logoPng.png" alt="LabFlow software logo">
                <span class="brand-copy">
                    <strong>LabFlow</strong>
                    <small>Pathology Software</small>
                </span>
            </a>
            <nav class="top-nav" aria-label="Primary">
                ${PRIMARY_NAV.map((item) => `<a href="${item.href}">${item.label}</a>`).join("")}
            </nav>
            <div class="nav-actions">
                <a class="button nav-login" href="/franchiseelogin.html">Franchisee Login</a>
                <a class="button nav-wa" href="${CTA_LINKS.whatsapp}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
                <a class="button nav-demo" href="${CTA_LINKS.demo}">Book Free Demo</a>
            </div>
            <button class="nav-toggle" id="navToggle" type="button" aria-expanded="false" aria-controls="mobileNav" aria-label="Open menu">
                <span></span>
                <span></span>
                <span></span>
            </button>
        </div>
        <div class="mobile-nav" id="mobileNav" hidden>
            <div class="wrap mobile-nav__inner">
                ${PRIMARY_NAV.map((item) => `<a href="${item.href}">${item.label}</a>`).join("")}
                <a class="button nav-login mobile-nav__cta" href="/franchiseelogin.html">Franchisee Login</a>
                <a class="button nav-demo mobile-nav__cta" href="${CTA_LINKS.demo}">Book Free Demo</a>
                <a class="button nav-wa mobile-nav__cta" href="${CTA_LINKS.whatsapp}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
            </div>
        </div>
    </header>
`;

const footerHtml = `
    <footer class="site-footer">
        <div class="wrap footer-grid">
            <div>
                <a class="brand footer-brand" href="/">
                    <img class="brand-logo footer-logo" src="/logoPng.png" alt="LabFlow software logo">
                    <span class="brand-copy footer-copy">
                        <strong>LabFlow</strong>
                        <small>Pathology Software</small>
                    </span>
                </a>
                <p>${escapeHtml(SITE.foundingDescription)}</p>
                <p><a href="tel:${SITE.supportPhone.replace(/\s+/g, "")}">${escapeHtml(SITE.supportPhone)}</a><br><a href="mailto:${SITE.supportEmail}">${escapeHtml(SITE.supportEmail)}</a></p>
            </div>
            <div>
                <h4>Solution Pages</h4>
                <a href="/pathology-software">Pathology Software</a>
                <a href="/lab-management-software">Lab Management Software</a>
                <a href="/laboratory-information-system">Laboratory Information System</a>
                <a href="/pathology-barcode-software">Barcode Software</a>
            </div>
            <div>
                <h4>Growth Pages</h4>
                <a href="/best-pathology-software-india">Best Pathology Software India</a>
                <a href="/compare">Compare</a>
                <a href="/case-studies">Case Studies</a>
                <a href="/blog">Blog</a>
            </div>
            <div>
                <h4>Contact</h4>
                <a href="/contact">Contact</a>
                <a href="/privacy-policy">Privacy Policy</a>
                <a href="/terms-and-conditions">Terms & Conditions</a>
                <a href="/refund-policy">Refund Policy</a>
            </div>
        </div>
    </footer>
    <div id="exitPopup" class="exit-popup" hidden>
        <div class="exit-popup__box">
            <button class="exit-popup__close" type="button" aria-label="Close popup">×</button>
            <p class="eyebrow">Before you leave</p>
            <h3>Book a free LabFlow demo</h3>
            <p>See patient booking, billing, barcode, reporting, WhatsApp workflow, and admin dashboards with your real lab use case.</p>
            <div class="cta-actions">
                <a class="button primary" href="${CTA_LINKS.demo}">Book Demo</a>
                <a class="button ghost" href="tel:${SITE.supportPhone.replace(/\s+/g, "")}">Call Now</a>
            </div>
        </div>
    </div>
    <a class="sticky-cta sticky-demo" href="${CTA_LINKS.demo}">Book Demo</a>
    <a class="sticky-cta sticky-login" href="/franchiseelogin.html">Franchisee Login</a>
    <a class="sticky-cta sticky-call" href="tel:${SITE.supportPhone.replace(/\s+/g, "")}">Call</a>
    <a class="sticky-cta sticky-wa" href="${CTA_LINKS.whatsapp}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
    <script defer src="/js/marketing-seo.js"></script>
`;

function renderPage(page, pathname, siteOrigin = SITE_URL) {
    const sections = buildPageSections(page);
    const faqs = page.faqs?.length ? page.faqs : FAQ_BASE;
    const schemaJson = buildCommonSchemas(page, pathname, siteOrigin);
    const robots = page.intent === "legal" ? "noindex,follow" : undefined;
    return `<!DOCTYPE html>
<html lang="en">
<head>
${commonHead({
    title: page.title,
    description: page.description,
    canonicalPath: pathname,
    keywords: [page.primaryKeyword, ...(page.secondaryKeywords || []), "LabFlow", "LIS Software India", "Best Pathology Software"],
    siteOrigin,
    schemaJson,
    robots
})}
</head>
<body>
${navHtml}
<main>
    <section class="hero">
        <div class="wrap hero-grid">
            <div>
                <p class="eyebrow">Pathology SaaS for ${escapeHtml(page.market)}</p>
                <h1>${escapeHtml(page.h1)}</h1>
                <p class="lead">${escapeHtml(page.description)}</p>
                <div class="hero-actions">
                    <a class="button primary" href="${CTA_LINKS.demo}">Book Free Demo</a>
                    <a class="button ghost" href="${CTA_LINKS.pricing}">View Pricing</a>
                    <a class="button ghost" href="tel:${SITE.supportPhone.replace(/\s+/g, "")}">Call ${escapeHtml(SITE.supportPhone)}</a>
                </div>
                <div class="badge-row">
                    ${TRUST_BADGES.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}
                </div>
            </div>
            <aside class="hero-card">
                <h2>Why teams shortlist LabFlow</h2>
                ${FEATURE_PILLARS.map((item) => `
                    <div class="feature-snippet">
                        <strong>${escapeHtml(item.title)}</strong>
                        <p>${escapeHtml(item.description)}</p>
                    </div>
                `).join("")}
                <div class="roi-box">
                    <h3>Quick ROI Estimator</h3>
                    <label>Daily bookings <input id="roiBookings" type="number" min="1" value="35"></label>
                    <label>Minutes saved per booking <input id="roiMinutes" type="number" min="1" value="6"></label>
                    <label>Staff cost per hour (INR) <input id="roiHourly" type="number" min="1" value="150"></label>
                    <p id="roiResult">Estimated monthly value unlocked: INR 0</p>
                </div>
            </aside>
        </div>
    </section>

    <section class="section">
        <div class="wrap">
            <div class="section-head">
                <p class="eyebrow">What this page covers</p>
                <h2>${escapeHtml(page.primaryKeyword)} strategy, workflow, and buying clarity</h2>
            </div>
            <div class="content-grid">
                ${sections.map((section) => `
                    <article class="content-card">
                        <h3>${escapeHtml(section.heading)}</h3>
                        ${section.paragraphs.map(sectionParagraph).join("")}
                    </article>
                `).join("")}
            </div>
        </div>
    </section>

    <section class="section section-alt">
        <div class="wrap">
            <div class="section-head">
                <p class="eyebrow">Modules that support ranking + conversion</p>
                <h2>What buyers expect from the best pathology software pages</h2>
            </div>
            <div class="three-col">
                <div class="stack-card"><h3>Operator Value</h3><p>Fast registration, cleaner billing, sample visibility, role control, and fewer avoidable support calls.</p></div>
                <div class="stack-card"><h3>Manager Value</h3><p>Better dashboard visibility, branch or franchise control, cleaner cash-flow oversight, and improved accountability.</p></div>
                <div class="stack-card"><h3>Growth Value</h3><p>More dependable report delivery, improved doctor confidence, stronger digital experience, and easier expansion readiness.</p></div>
            </div>
        </div>
    </section>

    <section class="section">
        <div class="wrap">
            <div class="section-head">
                <p class="eyebrow">FAQs</p>
                <h2>Questions buyers ask before booking a demo</h2>
            </div>
            <div class="faq-list">
                ${faqs.map((faq, index) => `
                    <details ${index === 0 ? "open" : ""}>
                        <summary>${escapeHtml(faq.question)}</summary>
                        <p>${escapeHtml(faq.answer)}</p>
                    </details>
                `).join("")}
            </div>
        </div>
    </section>

    <section class="section section-alt">
        <div class="wrap">
            <div class="section-head">
                <p class="eyebrow">Internal links</p>
                <h2>Explore related LabFlow pages</h2>
            </div>
            <div class="related-grid">
                ${relatedCards(page.related || [])}
            </div>
        </div>
    </section>

    <section class="section">
        <div class="wrap cta-band">
            <div>
                <p class="eyebrow">Demo CTA</p>
                <h2>See booking, barcode, billing, reporting, and admin flow live</h2>
                <p>Book a guided demo to evaluate LabFlow against your real lab workflow, branch model, and patient communication needs.</p>
            </div>
            <div class="cta-actions">
                <a class="button primary" href="${CTA_LINKS.demo}">Book Free Demo</a>
                <a class="button ghost" href="${CTA_LINKS.whatsapp}" target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
            </div>
        </div>
    </section>
</main>
${footerHtml}
</body>
</html>`;
}

function renderBlogIndex(page, pathname, siteOrigin = SITE_URL) {
    const schemaJson = buildCommonSchemas(page, pathname, siteOrigin);
    return `<!DOCTYPE html>
<html lang="en">
<head>
${commonHead({
    title: page.title,
    description: page.description,
    canonicalPath: pathname,
    keywords: [page.primaryKeyword, ...(page.secondaryKeywords || []), "LabFlow blog"],
    siteOrigin,
    schemaJson
})}
</head>
<body>
${navHtml}
<main>
    <section class="hero hero-compact">
        <div class="wrap">
            <p class="eyebrow">Content domination</p>
            <h1>${escapeHtml(page.h1)}</h1>
            <p class="lead">${escapeHtml(page.description)}</p>
        </div>
    </section>
    <section class="section">
        <div class="wrap blog-grid">
            ${blogPosts.map(blogCard).join("")}
        </div>
    </section>
</main>
${footerHtml}
</body>
</html>`;
}

function renderBlogPost(post, pathname, siteOrigin = SITE_URL) {
    const page = {
        title: post.title,
        description: post.description,
        h1: post.title,
        primaryKeyword: post.primaryKeyword,
        secondaryKeywords: ["pathology software", "lab management software", "diagnostic software"],
        faqs: post.faqs
    };
    const schemaJson = [
        ...buildCommonSchemas(page, pathname, siteOrigin),
        {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": post.title,
            "description": post.description,
            "mainEntityOfPage": formatUrl(pathname, siteOrigin),
            "author": {
                "@type": "Organization",
                "@id": `${normalizeSiteOrigin(siteOrigin)}#organization`
            },
            "publisher": {
                "@type": "Organization",
                "@id": `${normalizeSiteOrigin(siteOrigin)}#organization`
            }
        }
    ];
    return `<!DOCTYPE html>
<html lang="en">
<head>
${commonHead({
    title: post.title,
    description: post.description,
    canonicalPath: pathname,
    keywords: [post.primaryKeyword, "LabFlow", "pathology software blog"],
    siteOrigin,
    schemaJson
})}
</head>
<body>
${navHtml}
<main>
    <article class="wrap article-shell">
        <p class="eyebrow">${escapeHtml(post.category)}</p>
        <h1>${escapeHtml(post.title)}</h1>
        <p class="lead">${escapeHtml(post.description)}</p>
        ${post.sections.map((section) => `
            <section class="article-section">
                <h2>${escapeHtml(section.heading)}</h2>
                <p>${escapeHtml(section.body)}</p>
            </section>
        `).join("")}
        <section class="article-section">
            <h2>Frequently asked questions</h2>
            <div class="faq-list">
                ${post.faqs.map((faq) => `<details><summary>${escapeHtml(faq.question)}</summary><p>${escapeHtml(faq.answer)}</p></details>`).join("")}
            </div>
        </section>
        <section class="cta-band">
            <div>
                <p class="eyebrow">Next step</p>
                <h2>Want to turn this strategy into your lab workflow?</h2>
                <p>Book a LabFlow demo to see how billing, reporting, barcode, and admin controls work together.</p>
            </div>
            <div class="cta-actions">
                <a class="button primary" href="${CTA_LINKS.demo}">Book Free Demo</a>
                <a class="button ghost" href="/blog">Read More Articles</a>
            </div>
        </section>
    </article>
</main>
${footerHtml}
</body>
</html>`;
}

export { renderPage, renderBlogIndex, renderBlogPost };
