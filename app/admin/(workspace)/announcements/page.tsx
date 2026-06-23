import { Megaphone } from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { listAnnouncements } from "@/lib/announcements/store";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AnnouncementsManager } from "@/components/admin/announcements/announcements-manager";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  await requireAdminPageContext();
  const items = await listAnnouncements();
  return (
    <>
      <AdminPageHeader
        title="Announcements"
        description="Publish, edit, or take down the site-wide popup. Updates land instantly across web + iOS + Android."
        icon={Megaphone}
      />
      <AnnouncementsManager initialItems={items} />
    </>
  );
}
