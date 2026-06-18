import type { Metadata } from "next";
import { getFootScanContext } from "@/lib/foot-scan/access";
import { FootScanClient } from "@/components/foot-scan/foot-scan-client";
import { UnderDevelopment } from "@/components/foot-scan/under-development";

export const metadata: Metadata = {
  title: "Foot Scan | sneakerfeature",
  robots: { index: false, follow: false }
};

export default async function FootScanPage() {
  // Hidden tool — no homepage navigation. Access is granted when:
  //   - the viewer is an admin (always), OR
  //   - the `foot_scan_public_enabled` flag is on (admin-controlled).
  // Otherwise non-admins see the placeholder.
  const ctx = await getFootScanContext();
  if (!ctx) return <UnderDevelopment />;
  return <FootScanClient />;
}
