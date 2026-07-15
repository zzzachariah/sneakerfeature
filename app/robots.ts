import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/compare", "/download", "/smart-picker", "/quick-picker", "/search/advanced", "/shoes/", "/announcements", "/terms", "/privacy", "/disclaimer"],
      disallow: ["/dashboard", "/submit", "/admin", "/login", "/signup", "/register", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
