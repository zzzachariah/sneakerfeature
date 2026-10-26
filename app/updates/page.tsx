import type { Metadata } from "next";
import { getCatalogueUpdates } from "@/lib/data/catalogue-updates";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";
import { UpdatesTimeline } from "@/components/updates/updates-timeline";

export const dynamic = "force-dynamic";
const title = "Catalogue updates | SneakerFeature";
const description = "Weekly basketball-shoe catalogue maintenance: new entries, corrections, reviewed shoes, evidence and unresolved questions.";
export const metadata: Metadata = {
  title, description, alternates: { canonical: absoluteUrl("/updates") },
  openGraph: { title, description, url: absoluteUrl("/updates"), type: "website", images: [{ url: DEFAULT_OG_IMAGE_URL }] },
  twitter: { card: "summary_large_image", title, description, images: [DEFAULT_OG_IMAGE_URL] },
};

export default async function UpdatesPage() {
  return <UpdatesTimeline result={await getCatalogueUpdates()} />;
}
