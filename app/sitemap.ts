import type { MetadataRoute } from "next";
import { getShoes } from "@/lib/data/shoes";
import { getCatalogueUpdates } from "@/lib/data/catalogue-updates";
import { SITE_URL } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [shoes, updates] = await Promise.all([getShoes(), getCatalogueUpdates()]);
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now },
    { url: `${SITE_URL}/compare`, lastModified: now },
    { url: `${SITE_URL}/download`, lastModified: now },
    { url: `${SITE_URL}/smart-picker`, lastModified: now },
    { url: `${SITE_URL}/quick-picker`, lastModified: now },
    { url: `${SITE_URL}/search/advanced`, lastModified: now },
    { url: `${SITE_URL}/terms`, lastModified: now },
    { url: `${SITE_URL}/privacy`, lastModified: now },
    { url: `${SITE_URL}/disclaimer`, lastModified: now },
    { url: `${SITE_URL}/announcements`, lastModified: now },
    { url: `${SITE_URL}/updates`, lastModified: now },
  ];

  const shoePages: MetadataRoute.Sitemap = shoes.map((shoe) => ({
    url: `${SITE_URL}/shoes/${shoe.slug}`,
    lastModified: now,
  }));

  const updatePages: MetadataRoute.Sitemap = updates.runs.map((run) => ({
    url: `${SITE_URL}/updates/${run.id}`,
    lastModified: new Date(run.completed_at),
  }));
  return [...staticPages, ...shoePages, ...updatePages];
}
