import { Receipt } from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PaymentsClient } from "./payments-client";

export default async function AdminPaymentsPage() {
  await requireAdminPageContext();
  return (
    <>
      <AdminPageHeader
        title="Payment orders"
        description="Review uploaded payment screenshots, verify OCR results, approve or reject orders."
        icon={Receipt}
      />
      <PaymentsClient />
    </>
  );
}
