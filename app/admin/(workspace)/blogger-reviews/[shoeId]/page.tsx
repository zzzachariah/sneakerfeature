import Link from "next/link";
import { Megaphone, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { Card } from "@/components/ui/card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ShoeReviewsClient } from "./shoe-reviews-client";

export default async function AdminShoeReviewsPage({ params }: { params: Promise<{ shoeId: string }> }) {
  await requireAdminPageContext();
  const { shoeId } = await params;

  const supabase = await createClient();
  let shoe: { shoe_name: string; brand: string | null } | null = null;
  if (supabase) {
    const { data } = await supabase.from("shoes").select("shoe_name, brand").eq("id", shoeId).maybeSingle();
    shoe = data;
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={shoe?.shoe_name ?? "Shoe reviews"}
        description={
          shoe
            ? `${shoe.brand ?? "—"} · view, edit, publish, or delete this shoe's 博主点评 cards.`
            : "View, edit, publish, or delete this shoe's 博主点评 cards."
        }
        icon={Megaphone}
        actions={
          <Link
            href="/admin/blogger-reviews"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev)/0.7)] px-3 py-1.5 text-sm hover:bg-[rgb(var(--muted)/0.25)]"
          >
            <ArrowLeft className="h-4 w-4" />
            All shoes
          </Link>
        }
      />

      {!supabase ? (
        <Card className="p-5">Supabase is not configured.</Card>
      ) : (
        <ShoeReviewsClient shoeId={shoeId} />
      )}
    </div>
  );
}
