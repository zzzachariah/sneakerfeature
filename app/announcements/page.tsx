import type { Metadata } from "next";
import { AnnouncementsHistory, type HistoryEntry } from "./announcements-client";
import { listAnnouncements } from "@/lib/announcements/store";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";

// Always render fresh so newly-published announcements show up immediately.
export const dynamic = "force-dynamic";

const title = "Announcements | Sneaker Feature";
const description =
  "Every site-wide announcement from sneakerfeature, archived in one place.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absoluteUrl("/announcements") },
  openGraph: {
    title,
    description,
    type: "website",
    url: absoluteUrl("/announcements"),
    images: [{ url: DEFAULT_OG_IMAGE_URL }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [DEFAULT_OG_IMAGE_URL],
  },
};

export default async function AnnouncementsPage() {
  const rows = await listAnnouncements();
  const items: HistoryEntry[] = rows.map((r) => ({
    id: r.id,
    publishedAt: r.publishedAt,
    expiresAt: r.expiresAt,
    duration: r.duration,
    frequency: r.frequency,
    dismissible: r.dismissible,
    enabled: r.enabled,
    title: r.title,
    body: r.body,
    buttonLabel: r.buttonLabel,
    buttonUrl: r.buttonUrl,
    titleZh: r.titleZh,
    bodyZh: r.bodyZh,
    buttonLabelZh: r.buttonLabelZh,
  }));
  return <AnnouncementsHistory items={items} />;
}
