import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { TERMS } from "@/lib/legal/content";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";

const title = "Terms of Use | Sneaker Feature";
const description = "The terms that govern your use of sneakerfeature.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: absoluteUrl("/terms"),
  },
  openGraph: {
    title,
    description,
    type: "website",
    url: absoluteUrl("/terms"),
    images: [{ url: DEFAULT_OG_IMAGE_URL }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [DEFAULT_OG_IMAGE_URL],
  },
};

export default function TermsPage() {
  return <LegalPageLayout doc={TERMS} />;
}
