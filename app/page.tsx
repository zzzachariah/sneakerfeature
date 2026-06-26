import { HomeView } from "@/components/home/home-view";
import { getForYouData } from "@/lib/personalize/for-you-data";
import { buildCollections } from "@/lib/home/collections";
import { getShoes } from "@/lib/data/shoes";
import type { Metadata } from "next";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL, HOME_DESCRIPTION, HOME_TITLE } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  alternates: {
    canonical: absoluteUrl("/"),
  },
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    type: "website",
    url: absoluteUrl("/"),
    images: [{ url: DEFAULT_OG_IMAGE_URL }],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE_URL],
  },
};

function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const shoes = await getShoes();
  const brands = new Set(shoes.map((s) => s.brand)).size;
  const forYou = await getForYouData(shoes);
  const collections = buildCollections(shoes);

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "sneakerfeature",
            url: absoluteUrl("/"),
            potentialAction: {
              "@type": "SearchAction",
              target: `${absoluteUrl("/search/advanced")}?q={search_term_string}`,
              "query-input": "required name=search_term_string",
            },
          }),
        }}
      />
      <HomeView
        shoes={shoes}
        shoesCount={shoes.length}
        brandsCount={brands}
        initialQuery={q ?? ""}
        forYou={forYou}
        collections={collections}
      />
    </main>
  );
}
