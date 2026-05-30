import { ComparePageClient } from "@/components/compare/compare-page-client";
import { getShoes } from "@/lib/data/shoes";
import type { Metadata } from "next";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";

const MAX_SHOES = 5;

const title = "Compare basketball shoes | Sneaker Feature";
const description = "Data-driven basketball shoe specs & comparisons.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: absoluteUrl("/compare"),
  },
  openGraph: {
    title,
    description,
    type: "website",
    url: absoluteUrl("/compare"),
    images: [{ url: DEFAULT_OG_IMAGE_URL }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [DEFAULT_OG_IMAGE_URL],
  },
};

export default async function ComparePage({
  searchParams
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const shoes = await getShoes();

  const selectedIds = Array.from(new Set(ids?.split(",").filter(Boolean) ?? [])).slice(0, MAX_SHOES);
  const shoesById = new Map(shoes.map((shoe) => [shoe.id, shoe]));
  const selected = selectedIds
    .map((id) => shoesById.get(id))
    .filter((shoe): shoe is NonNullable<typeof shoe> => Boolean(shoe));

  return <ComparePageClient selected={selected} allShoes={shoes} />;
}
