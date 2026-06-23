import { Megaphone } from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import {
  getAnnouncementHistory,
  getCurrentAnnouncement
} from "@/lib/admin/announcements";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AnnouncementsAdmin } from "./announcements-client";

export default async function AdminAnnouncementsPage() {
  await requireAdminPageContext();
  const [current, history] = await Promise.all([
    getCurrentAnnouncement(),
    getAnnouncementHistory()
  ]);

  return (
    <>
      <AdminPageHeader
        title="Announcements"
        description="Edit the live popup, publish a new one, or fix entries in the public archive."
        icon={Megaphone}
      />
      <AnnouncementsAdmin initialCurrent={current} initialHistory={history} />
    </>
  );
}
