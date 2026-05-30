import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { PRIVACY } from "@/lib/legal/content";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";

const title = "Privacy Policy | Sneaker Feature";
const description = "How sneakerfeature collects, uses, and shares your information.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: absoluteUrl("/privacy"),
  },
  openGraph: {
    title,
    description,
    type: "website",
    url: absoluteUrl("/privacy"),
    images: [{ url: DEFAULT_OG_IMAGE_URL }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [DEFAULT_OG_IMAGE_URL],
  },
};

export default function PrivacyPage() {
  return <LegalPageLayout doc={PRIVACY} />;
}
