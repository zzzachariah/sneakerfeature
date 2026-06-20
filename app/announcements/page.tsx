import type { Metadata } from "next";
import { promises as fs } from "node:fs";
import path from "node:path";
import { AnnouncementsHistory, type HistoryEntry } from "./announcements-client";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";

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

async function loadHistory(): Promise<HistoryEntry[]> {
  const file = path.join(process.cwd(), "public", "announcements-history.json");
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export default async function AnnouncementsPage() {
  const items = await loadHistory();
  return <AnnouncementsHistory items={items} />;
}
