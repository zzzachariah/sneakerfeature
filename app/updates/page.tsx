import type { Metadata } from "next";
import { getCatalogueUpdates } from "@/lib/data/catalogue-updates";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";
import { UpdatesTimeline } from "@/components/updates/updates-timeline";
import { summarizeMaintenanceRun } from "@/lib/catalogue-updates";

export const dynamic = "force-dynamic";
const title = "Maintenance updates | SneakerFeature";
const description = "Weekly basketball-shoe catalogue updates and daily AI API maintenance: changes, verification results, evidence and unresolved findings.";
export const metadata: Metadata = {
  title, description, alternates: { canonical: absoluteUrl("/updates") },
  openGraph: { title, description, url: absoluteUrl("/updates"), type: "website", images: [{ url: DEFAULT_OG_IMAGE_URL }] },
  twitter: { card: "summary_large_image", title, description, images: [DEFAULT_OG_IMAGE_URL] },
};

export default async function UpdatesPage() {
  const result = await getCatalogueUpdates();
  // The archive sends only card summaries; evidence belongs to the detail route.
  return <UpdatesTimeline result={{ ...result, runs: result.runs.map(summarizeMaintenanceRun) }} />;
}
