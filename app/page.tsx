import { Suspense } from "react";
import { HomeView } from "@/components/home/home-view";
import { MembershipPromo } from "@/components/subscribe/membership-promo";
import { PageLoader } from "@/components/ui/page-loader";
import { getForYouData } from "@/lib/personalize/for-you-data";
import { buildCollections } from "@/lib/home/collections";
import { getShoes } from "@/lib/data/shoes";
import { getCurrentProfile } from "@/lib/data/auth";
import { getMemberContext } from "@/lib/subscription/entitlements";
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

// Awaits the full data pipeline (catalog + personalization). Lives below a
// Suspense boundary so the document shell + loader flush to the WebView
// immediately instead of blocking first byte on Supabase.
async function HomeContent({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const shoes = await getShoes();
  const brands = new Set(shoes.map((s) => s.brand)).size;
  const forYou = await getForYouData(shoes);
  const collections = buildCollections(shoes);

  // Member-personalized section order (paid tiers). Best-effort — never blocks
  // the home render.
  let sectionOrder: string[] | undefined;
  const profile = await getCurrentProfile();
  if (profile) {
    const member = await getMemberContext(profile.id);
    if (member.prefs.homeOrder.length > 0) sectionOrder = member.prefs.homeOrder;
  }

  return (
    <HomeView
      shoes={shoes}
      shoesCount={shoes.length}
      brandsCount={brands}
      initialQuery={q ?? ""}
      forYou={forYou}
      collections={collections}
      sectionOrder={sectionOrder}
    />
  );
}

export default function HomePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
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
      <Suspense fallback={<PageLoader label="Loading" />}>
        <HomeContent searchParams={searchParams} />
      </Suspense>
      <MembershipPromo />
    </main>
  );
}
