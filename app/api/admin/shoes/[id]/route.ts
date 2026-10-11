import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { selectSpecVersion } from "@/lib/data/catalog-quality";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const [shoeRes, specRes, storyRes, sourceRes, historyRes] = await Promise.all([
    supabase.from("shoes").select("*").eq("id", id).maybeSingle(),
    supabase.from("shoe_specs").select("*").eq("shoe_id", id),
    supabase.from("shoe_stories").select("*").eq("shoe_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("sources").select("id, source_label, source_url, source_type, note").eq("shoe_id", id),
    supabase
      .from("admin_audit_logs")
      .select("id, action, note, created_at, profiles!admin_audit_logs_actor_admin_id_fkey(username)")
      .eq("target_shoe_id", id)
      .order("created_at", { ascending: false })
      .limit(100)
  ]);

  if (shoeRes.error || !shoeRes.data) return NextResponse.json({ ok: false, message: "Shoe record not found." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    shoe: shoeRes.data,
    spec: selectSpecVersion(specRes.data),
    story: storyRes.data,
    sources: sourceRes.data ?? [],
    history: historyRes.data ?? []
  });
}
