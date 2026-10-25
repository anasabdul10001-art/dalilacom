import helmet from "helmet";

/**
 * Executable inline script blocks now live in same-origin JavaScript files, so script-src no longer
 * needs unsafe-inline. The existing hand-built pages still contain inline event-handler attributes
 * and styles; those remain explicitly scoped to script-src-attr and style-src until they are
 * migrated. Other protections (frame-ancestors, object-src, HSTS, sniffing, referrer policy) stay on.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      // Remaining onclick/onchange attributes in the existing HTML and rendered app markup.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org", "https://cdnjs.cloudflare.com"], // cdnjs: the map library's own pin pictures
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
