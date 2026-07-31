import type { Metadata } from "next";
import { Radio } from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { getOutreachData } from "@/lib/outreach/data";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { OutreachClient } from "./outreach-client";

// This route holds eleven real people's email addresses and WeChat IDs.
//
// Access is gated three times over, deliberately:
//   1. middleware.ts redirects to /login without a session cookie;
//   2. the (workspace) layout calls requireAdminPageContext(), which redirects
//      non-admins to /admin/login BEFORE this component runs — nothing is
//      queried and no data reaches the payload;
//   3. every query below runs under the caller's own session, so RLS refuses
//      a non-admin at the database even if 1 and 2 were bypassed.
//
// It is also unlinked from public navigation, absent from the sitemap,
// disallowed in robots.ts and noindex'd by app/admin/layout.tsx.
export const metadata: Metadata = {
  title: "Outreach",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function AdminOutreachPage() {
  await requireAdminPageContext();
  const data = await getOutreachData();

  if (!data) {
    return (
      <>
        <AdminPageHeader
          title="Creator outreach"
          description="Outreach tracking for creators and growth channels."
          icon={Radio}
        />
        <section className="surface-card premium-border rounded-2xl p-4">
          <p className="text-sm soft-text">
            No outreach data. Run <code className="font-mono">db/migrations/048_outreach_console.sql</code>{" "}
            against the project, then reload.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Creator outreach"
        description="Records outreach — it never sends anything. Contacts are personal data: admin-only, never public."
        icon={Radio}
      />
      <OutreachClient
        initialCreators={data.creators}
        initialChannels={data.channels}
        initialLogsByCreator={data.logsByCreator}
        initialLogsByChannel={data.logsByChannel}
        settings={data.settings}
      />
    </>
  );
}
