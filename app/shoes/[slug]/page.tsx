import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShoeDetailClient } from "@/components/detail/shoe-detail-client";
import { RecordView } from "@/components/native/record-view";
import { getShoeBySlug, getShoeImageState, getShoes } from "@/lib/data/shoes";
import { getBloggerReviewsForShoe } from "@/lib/data/blogger-reviews";
import { getCurrentProfile } from "@/lib/data/auth";
import { getMemberContext } from "@/lib/subscription/entitlements";
import { getShoeFit, getFootProfile } from "@/lib/data/shoe-fit";
import { computeSizeAdvice, type ShoeFit } from "@/lib/foot-scan/fit-advisor";
import { SizeAdvisorCard, type SizeAdvisorData } from "@/components/detail/size-advisor";
import { ConciergeCta } from "@/components/detail/concierge-cta";
import { FootReportCard } from "@/components/detail/foot-report-card";
import { buildFootReport, type FootReport } from "@/lib/foot-scan/foot-report";
import { AdminFitEditor } from "@/components/detail/admin-fit-editor";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const shoe = await getShoeBySlug(slug);
  if (!shoe) {
    return {
      title: "Shoe not found | sneakerfeature",
      description: "Shoe not found on sneakerfeature.",
      robots: { index: false, follow: false },
    };
  }

  const title = `${shoe.shoe_name} | sneakerfeature`;
  const description = `${shoe.shoe_name} on sneakerfeature. EVERYTHING u need to know for sneakers.`;
  const url = absoluteUrl(`/shoes/${shoe.slug}`);
  const image = shoe.image_url || DEFAULT_OG_IMAGE_URL;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}

export default async function ShoeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Stage 1: fetch shoe and profile first (fast, single-row queries)
  const [shoe, profile] = await Promise.all([
    getShoeBySlug(slug),
    getCurrentProfile(),
  ]);
  if (!shoe) return notFound();

  const isAdmin = profile?.role === "admin";
  const isLoggedIn = Boolean(profile);

  // Stage 2: now that shoe.id and isAdmin are known, run all remaining fetches in parallel
  const [allShoes, imageState, bloggerReviews] = await Promise.all([
    getShoes(),
    getShoeImageState(shoe.id, isAdmin),
    getBloggerReviewsForShoe(shoe.id),
  ]);

  const related = allShoes.filter((s) => s.brand === shoe.brand && s.id !== shoe.id).slice(0, 3);

  // Premium smart-sizing: gated by tier, personalized by the member's foot scan.
  // `adminFit` is the current per-shoe fit row, surfaced to admins for editing.
  let sizeData: SizeAdvisorData;
  let adminFit: ShoeFit | null = null;
  let showConcierge = false;
  let footReport: FootReport | null = null;
  if (!profile) {
    sizeData = { state: "signed-out" };
  } else {
    const member = await getMemberContext(profile.id);
    showConcierge = isAdmin || member.tier === "max";
    const canUse = isAdmin || member.config.capabilities.preciseSizing;
    if (!canUse) {
      // Highest-intent upsell: if this free user has already scanned their feet,
      // their size for THIS shoe is computable now — surface that it exists
      // (locked), without ever sending the number to the client.
      const foot = await getFootProfile(profile.id);
      sizeData = { state: "gated", hasScan: Boolean(foot?.foot_length_mm) };
    } else {
      const [fit, foot] = await Promise.all([getShoeFit(shoe.id), getFootProfile(profile.id)]);
      adminFit = fit;
      // Max members with a scan also get the standalone deep foot report.
      if (showConcierge && foot && foot.foot_length_mm) footReport = buildFootReport(foot);
      if (!foot || !foot.foot_length_mm) {
        sizeData = { state: "no-profile" };
      } else {
        sizeData = {
          state: "advice",
          advice: computeSizeAdvice(fit, {
            footLengthMm: foot.foot_length_mm,
            width: foot.foot_width,
            instep: foot.instep,
            hallux: foot.hallux ?? null
          })
        };
      }
    }
  }

  const productSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: shoe.shoe_name,
    brand: shoe.brand ? { "@type": "Brand", name: shoe.brand } : undefined,
    image: shoe.image_url || undefined,
    description: shoe.spec.playstyle_summary || `${shoe.shoe_name} on sneakerfeature. EVERYTHING u need to know for sneakers.`,
    category: shoe.category || "Basketball Shoes",
    releaseDate: shoe.release_year ? `${shoe.release_year}-01-01` : undefined,
    sku: shoe.id,
  };

  // Only mark up an aggregateRating when real users have rated the shoe, and use
  // the exact star value shown on the page (shoe.finalStars, 1–5) so the markup
  // matches visible content — a Google requirement for review rich results.
  const ratingCount = shoe.userRatingCount ?? 0;
  const ratingValue = shoe.finalStars ?? 0;
  if (ratingCount > 0 && ratingValue > 0) {
    productSchema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(ratingValue.toFixed(1)),
      bestRating: 5,
      worstRating: 1,
      ratingCount,
    };
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: shoe.shoe_name, item: absoluteUrl(`/shoes/${shoe.slug}`) },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(productSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbSchema) }} />
      <ShoeDetailClient
        shoe={shoe}
        related={related}
        isAdmin={isAdmin}
        isLoggedIn={isLoggedIn}
        imageState={imageState}
        bloggerReviews={bloggerReviews}
        sizeAdvisor={
          <>
            <SizeAdvisorCard data={sizeData} />
            {footReport && <FootReportCard report={footReport} />}
            {showConcierge && <ConciergeCta shoeName={shoe.shoe_name} />}
            {isAdmin && <AdminFitEditor shoeId={shoe.id} initialFit={adminFit} />}
          </>
        }
      />
      <RecordView shoeId={shoe.id} isLoggedIn={isLoggedIn} />
    </>
  );
}
