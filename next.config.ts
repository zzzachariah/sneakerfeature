import type { NextConfig } from "next";

// Baseline security headers. Kept deliberately permissive enough not to
// regress UX: no CSP (would need an audit of every inline-script /
// third-party origin Vercel Analytics + framer-motion use), and frames
// are sameorigin so the in-app Capacitor shell still works.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" }
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
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
