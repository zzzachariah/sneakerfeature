import { requireAdminPageContext } from "@/lib/admin/auth";
import { CreditsClient } from "./credits-client";

export default async function AdminCreditsPage() {
  await requireAdminPageContext();
  return <CreditsClient />;
}
