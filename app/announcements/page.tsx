import type { Metadata } from "next";
import { AnnouncementsHistory, type HistoryEntry } from "./announcements-client";
import { getAnnouncementHistory } from "@/lib/admin/announcements";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";

// The history list is admin-editable, so don't cache the page output between
// requests — a fresh edit in /admin/announcements should reach /announcements
// on the next visit, not on the next deploy.
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
  const items = (await getAnnouncementHistory()) as HistoryEntry[];
  return <AnnouncementsHistory items={items} />;
}
