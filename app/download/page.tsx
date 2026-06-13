import type { Metadata } from "next";
import { DownloadView } from "@/components/download/download-view";
import { absoluteUrl, DEFAULT_OG_IMAGE_URL } from "@/lib/seo";

const title = "Get the App | sneakerfeature";
const description =
  "Download the sneakerfeature app — native on iOS and Android. The Android APK installs directly, no app store needed.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absoluteUrl("/download") },
  openGraph: {
    title,
    description,
    type: "website",
    url: absoluteUrl("/download"),
    images: [{ url: DEFAULT_OG_IMAGE_URL }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [DEFAULT_OG_IMAGE_URL],
  },
};

export default function DownloadPage() {
  return <DownloadView />;
}
