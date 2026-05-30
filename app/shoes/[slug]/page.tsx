import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShoeDetailClient } from "@/components/detail/shoe-detail-client";
import { getShoeBySlug, getShoeImageState, getShoes } from "@/lib/data/shoes";
import { getCurrentProfile } from "@/lib/data/auth";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const shoe = await getShoeBySlug(slug);
  if (!shoe) {
    return {
      title: "Shoe not found | Sneaker Feature",
      description: "Shoe not found on Sneaker Feature.",
      robots: { index: false, follow: false },
    };
  }

  const title = `${shoe.shoe_name} | Sneaker Feature`;
  const description = `${shoe.shoe_name} on Sneaker Feature. EVERYTHING u need to know for sneakers.`;
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

export default async function ShoeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [shoe, profile, allShoes] = await Promise.all([
    getShoeBySlug(slug),
    getCurrentProfile(),
    getShoes()
  ]);
  if (!shoe) return notFound();

  const isAdmin = profile?.role === "admin";
  const isLoggedIn = Boolean(profile);
  const imageState = await getShoeImageState(shoe.id, isAdmin);

  const related = allShoes.filter((s) => s.brand === shoe.brand && s.id !== shoe.id).slice(0, 3);

  const productSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: shoe.shoe_name,
    brand: shoe.brand ? { "@type": "Brand", name: shoe.brand } : undefined,
    image: shoe.image_url || undefined,
    description: shoe.spec.playstyle_summary || `${shoe.shoe_name} on Sneaker Feature. EVERYTHING u need to know for sneakers.`,
    category: shoe.category || "Basketball Shoes",
    releaseDate: shoe.release_year ? `${shoe.release_year}-01-01` : undefined,
    sku: shoe.id,
  };

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <ShoeDetailClient shoe={shoe} related={related} isAdmin={isAdmin} isLoggedIn={isLoggedIn} imageState={imageState} />
    </>
  );
}
