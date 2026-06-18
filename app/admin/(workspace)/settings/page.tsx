import Link from "next/link";
import { Settings2, ArrowUpRight } from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import {
  getDailyCheckinCredits,
  isSmartPickerPublicEnabled,
  isFootScanPublicEnabled,
  MAX_DAILY_CHECKIN_CREDITS
} from "@/lib/admin/settings";
import { Card } from "@/components/ui/card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { BulkImageImportButton } from "@/components/admin/bulk-image-import-button";
import { BulkTranslationButton } from "@/components/admin/bulk-translation-button";
import { SmartPickerToggle } from "@/components/admin/smart-picker-toggle";
import { FootScanToggle } from "@/components/admin/foot-scan-toggle";
import { DailyCheckinCreditsField } from "@/components/admin/daily-checkin-credits-field";

export default async function AdminSettingsPage() {
  await requireAdminPageContext();
  const [smartPickerPublic, footScanPublic, dailyCheckinCredits] = await Promise.all([
    isSmartPickerPublicEnabled(),
    isFootScanPublicEnabled(),
    getDailyCheckinCredits()
  ]);

  return (
    <>
      <AdminPageHeader
        title="Site settings"
        description="Smart Picker access, daily check-in credits, and one-off maintenance jobs."
        icon={Settings2}
      />

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3 p-4">
          <div>
            <p className="text-sm font-medium">Smart Picker access</p>
            <p className="mt-1 text-xs soft-text">
              Decide whether the AI Smart Picker (chat) is visible to regular users.
            </p>
            <div className="mt-3">
              <SmartPickerToggle initialEnabled={smartPickerPublic} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Foot Scan access</p>
              <Link
                href="/foot-scan"
                className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--accent))] hover:underline"
              >
                Open the tool
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <p className="mt-1 text-xs soft-text">
              Decide whether the hidden Foot Scan tool (/foot-scan) is visible to regular users.
            </p>
            <div className="mt-3">
              <FootScanToggle initialEnabled={footScanPublic} />
            </div>
          </div>
          <DailyCheckinCreditsField
            initialCredits={dailyCheckinCredits}
            maxCredits={MAX_DAILY_CHECKIN_CREDITS}
          />
        </Card>

        <Card className="p-4">
          <p className="text-sm font-medium">Bulk image import</p>
          <p className="mt-1 text-xs soft-text">
            Trigger a one-off background job to backfill product images for published shoes.
          </p>
          <div className="mt-3">
            <BulkImageImportButton />
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-sm font-medium">AI Chinese translation</p>
          <p className="mt-1 text-xs soft-text">
            Pre-translate sneaker tech, feel descriptors and story into Chinese (stored in Supabase)
            so the zh UI reads them directly instead of machine-translating at render time.
          </p>
          <div className="mt-3">
            <BulkTranslationButton />
          </div>
        </Card>
      </section>
    </>
  );
}
