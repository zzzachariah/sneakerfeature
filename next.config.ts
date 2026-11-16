import type { NextConfig } from "next";

// Baseline security headers. The Content-Security-Policy itself is ENFORCED
// and nonce-based, so it is generated per request in middleware.ts
// (lib/security/csp.ts) rather than set statically here.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), display-capture=(), speaker-selection=(), ambient-light-sensor=(), accelerometer=(), gyroscope=(), magnetometer=(), document-domain=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Moved out of `experimental` in Next 15.5 (was `experimental.typedRoutes`).
  typedRoutes: true,
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react"],
    // Client router cache: reuse a visited route's payload for 30s so tab
    // switches / back-navigation are instant instead of re-running the full
    // dynamic SSR round-trip on every tap. Personalized bits (favorites,
    // session state) live in client providers that refresh themselves, so a
    // 30s-stale RSC payload is safe.
    staleTimes: { dynamic: 30, static: 300 }
  },
  compiler: {
    removeConsole: { exclude: ["error", "warn"] }
  },
  // Shoe imagery lives in Supabase storage. Serving it through the Next image
  // optimizer resizes to the rendered size and converts to AVIF/WebP — grid
  // thumbnails no longer download full-resolution originals. ShoeImage only
  // opts a source into optimization when it matches these patterns.
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**"
      }
    ]
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
