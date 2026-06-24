import { Megaphone } from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAnnouncements } from "@/lib/announcements/store";
import { countViewsForMany } from "@/lib/announcements/views";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AnnouncementsManager } from "@/components/admin/announcements/announcements-manager";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  await requireAdminPageContext();
  const items = await listAnnouncements();

  // Reach numbers in two pieces: read count per id (deduped via
  // announcement_views), and the active member denominator so the table can
  // also show "% of members" alongside the raw reach.
  const ids = items.map((i) => i.id);
  const db = createAdminClient();
  const [reads, memberCountResult] = await Promise.all([
    countViewsForMany(ids),
    db ? db.from("profiles").select("id", { count: "exact", head: true }) : Promise.resolve(null),
  ]);
  const memberCount =
    memberCountResult && "count" in memberCountResult ? memberCountResult.count ?? 0 : 0;

  return (
    <>
      <AdminPageHeader
        title="Announcements"
        description="Publish, edit, or take down the site-wide popup. Updates land instantly across web + iOS + Android."
        icon={Megaphone}
      />
      <AnnouncementsManager initialItems={items} initialReads={reads} memberCount={memberCount} />
    </>
  );
}
