const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy
 *
 * Built from what the app actually loads:
 * - Next.js injects inline bootstrap scripts and next-themes injects an inline
 *   script, so script-src needs 'unsafe-inline' (a nonce-based CSP would force every
 *   page to dynamic rendering; not worth it here). 'unsafe-eval' is only allowed in
 *   development (React/Next dev tooling).
 * - Firebase Auth popup sign-in: apis.google.com (gapi), *.firebaseapp.com iframe/popup,
 *   accounts.google.com, identitytoolkit/securetoken APIs.
 * - Firestore client reads (getFacultyById, user profile): firestore.googleapis.com
 *   (long-polling/streaming fallbacks use the same host).
 * - App Check with reCAPTCHA Enterprise: google.com/recaptcha, gstatic.com/recaptcha,
 *   recaptchaenterprise + firebaseappcheck APIs.
 * - Vercel Analytics / Speed Insights: same-origin /_vercel/* scripts; beacons go to
 *   same-origin /_vercel/* or vitals.vercel-insights.com.
 * - Faculty photos come from arbitrary external CDNs (getFacultyPhoto), so img-src
 *   allows any https origin.
 *
 * Rollout: the policy is sent as Content-Security-Policy-Report-Only by default so a
 * missed origin cannot break sign-in in production. Set CSP_MODE=enforce at build
 * time once the browser console shows no violations (see README "Security headers").
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://apis.google.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.google.com https://vitals.vercel-insights.com wss://*.firebaseio.com",
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const cspHeaderName =
  process.env.CSP_MODE === "enforce"
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Production only: browsers ignore HSTS over plain HTTP, and sending it in dev
  // would pin localhost to HTTPS. No includeSubDomains/preload: those are
  // hard-to-undo commitments that should be a deliberate decision.
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
    : []),
  // CSP is only applied in production builds; dev tooling needs eval/HMR sockets.
  ...(isProd ? [{ key: cspHeaderName, value: csp }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "vitap-backend.s3.ap-south-1.amazonaws.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
