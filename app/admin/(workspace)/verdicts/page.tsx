import { requireAdminPageContext } from "@/lib/admin/auth";
import { VerdictsImportClient } from "./verdicts-client";

export const dynamic = "force-dynamic";

export default async function VerdictsImportPage() {
  await requireAdminPageContext();
  return <VerdictsImportClient />;
}
