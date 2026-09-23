import helmet from "helmet";

/**
 * The existing hand-rolled pages (public/admin.html, public/app/, public/index.html) use inline
 * <script>/<style> blocks and dozens of onclick="..." handlers — there's no nonce/hash-based CSP
 * possible without rewriting those pages into a real frontend (explicitly out of scope for this
 * phase). So script-src/style-src keep 'unsafe-inline' as a deliberate, documented trade-off;
 * everything else (frame-ancestors, object-src, HSTS, sniffing, referrer policy) is locked down.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      // Helmet's default CSP sets script-src-attr to 'none', which would silently disable every
      // onclick="..." handler in admin.html/app.js (a CSP3 distinction from script-src itself) —
      // must be opened up explicitly for the same reason scriptSrc allows 'unsafe-inline'.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  // HSTS only makes sense over HTTPS; Render terminates TLS in front of the app, so this is safe
  // to send always — browsers ignore it over plain http anyway.
  hsts: { maxAge: 15552000, includeSubDomains: true },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  crossOriginResourcePolicy: { policy: "same-site" },
});
