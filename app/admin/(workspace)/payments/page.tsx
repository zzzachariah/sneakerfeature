import { requireAdminPageContext } from "@/lib/admin/auth";
import { PaymentsClient } from "./payments-client";

export default async function AdminPaymentsPage() {
  await requireAdminPageContext();
  return <PaymentsClient />;
}
