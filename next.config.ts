import type { NextConfig } from "next";

// Baseline security headers. Kept deliberately permissive enough not to
// regress UX: CSP is report-only so violations are surfaced without breaking
// the app (inline scripts used by ThemeInitScript/SkinInitScript, Vercel
// Analytics, and framer-motion require a nonce-based enforcement upgrade —
// see Next.js App Router CSP docs for that migration path). Frames are
// sameorigin so the in-app Capacitor shell still works.
//
// Permitted third-party origins:
//   - vercel.live / va.vercel-scripts.com  — Vercel Analytics & Speed Insights
//   - fonts.googleapis.com / fonts.gstatic.com — Google Fonts (if used)
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // Scripts: allow self + Vercel telemetry; 'unsafe-inline' + 'unsafe-eval'
  // are needed until inline scripts are migrated to nonces.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://vercel.live",
  // Styles: allow self + inline (framer-motion injects inline styles)
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Fonts
  "font-src 'self' https://fonts.gstatic.com",
  // Images: allow self, data URIs, and common CDNs
  "img-src 'self' data: blob: https:",
  // Connections: allow self + Vercel Analytics endpoints
  "connect-src 'self' https://vitals.vercel-insights.com https://va.vercel-scripts.com https://vercel.live",
  // Frames: sameorigin only (Capacitor shell)
  "frame-src 'self'",
  "frame-ancestors 'self'",
  // Misc
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), display-capture=(), speaker-selection=(), ambient-light-sensor=(), accelerometer=(), gyroscope=(), magnetometer=(), document-domain=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Report-only CSP: captures violations without breaking the app.
  // Migrate to enforced Content-Security-Policy once inline scripts in
  // ThemeInitScript and SkinInitScript are updated to use nonces.
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
    optimizePackageImports: ["framer-motion", "lucide-react"]
  },
  compiler: {
    removeConsole: { exclude: ["error", "warn"] }
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }]
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }]
      },
      {
        source: "/:image(favicon\\.png|logo\\.png|qrcode\\.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }]
      },
      {
        source: "/announcement.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=60, stale-while-revalidate=300" }]
      },
      {
        source: "/announcements-history.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=60, stale-while-revalidate=300" }]
      },
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
