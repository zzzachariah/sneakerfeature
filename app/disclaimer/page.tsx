import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { DISCLAIMER } from "@/lib/legal/content";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";

const title = "Brand & IP Disclaimer | Sneaker Feature";
const description =
  "sneakerfeature is an independent project and is not affiliated with any brand. Trademarks and images belong to their respective owners.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: absoluteUrl("/disclaimer"),
  },
  openGraph: {
    title,
    description,
    type: "website",
    url: absoluteUrl("/disclaimer"),
    images: [{ url: DEFAULT_OG_IMAGE_URL }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [DEFAULT_OG_IMAGE_URL],
  },
};

export default function DisclaimerPage() {
  return <LegalPageLayout doc={DISCLAIMER} />;
}
