import { Wallet } from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CreditsClient } from "./credits-client";

export default async function AdminCreditsPage() {
  await requireAdminPageContext();
  return (
    <>
      <AdminPageHeader
        title="Credits & balances"
        description="Manually grant or reset user credit balances, and browse all balances."
        icon={Wallet}
      />
      <CreditsClient />
    </>
  );
}
