# Nginx / CDN Performance Notes

## Recommended
- Enable Brotli and gzip compression for HTML, CSS, JS, JSON, SVG, XML.
- Cache immutable static assets for 30 days.
- Cache HTML carefully with short TTL if marketing content updates often.
- Serve `sitemap.xml` and `robots.txt` with `text/xml` and `text/plain` content types.
- Use HTTP/2 or HTTP/3 at the edge.
- Put images, CSS, JS behind CDN with stale-while-revalidate.

## Example Ideas
- `Cache-Control: public, max-age=2592000, immutable` for CSS/JS/font assets
- `Cache-Control: public, max-age=3600` for dynamic marketing HTML if edge caching is used
- Enable `etag on;`
- Use Brotli for `text/html text/css application/javascript application/json image/svg+xml application/xml`

## App-Level Notes
- Current marketing layer is server-rendered HTML with minimal client JS.
- Keep third-party scripts off high-intent landing pages unless strictly required.
- Convert heavy screenshots to WebP/AVIF before launch.
