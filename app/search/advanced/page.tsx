import { getShoes } from "@/lib/data/shoes";
import { AdvancedSearchClient } from "@/components/search/advanced-search-client";
import type { Metadata } from "next";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";

const title = "Advanced sneaker search | sneakerfeature";
const description = "Search basketball shoe specs, tags, tech, and player data.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: absoluteUrl("/search/advanced"),
  },
  openGraph: {
    title,
    description,
    type: "website",
    url: absoluteUrl("/search/advanced"),
    images: [{ url: DEFAULT_OG_IMAGE_URL }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [DEFAULT_OG_IMAGE_URL],
  },
};

export default async function AdvancedSearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const shoes = await getShoes();
  return <AdvancedSearchClient shoes={shoes} initialQuery={params.q ?? ""} />;
}
