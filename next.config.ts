import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
    optimizePackageImports: ["framer-motion", "lucide-react"]
  },
  compiler: {
    removeConsole: { exclude: ["error", "warn"] }
  }
};

export default nextConfig;
