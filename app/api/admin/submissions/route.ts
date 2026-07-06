/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/route-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const { searchParams } = new URL(request.url);

  const q = (searchParams.get("q") ?? "").trim();
  const status = searchParams.get("status") ?? "queue";
  const brand = searchParams.get("brand") ?? "all";
  const submitter = (searchParams.get("submitter") ?? "").trim();
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("user_submissions")
    // email is not consumed in this list view (only username is), and the anon
    // key can no longer read profiles.email (migration 038), so don't embed it.
    .select("id, user_id, status, created_at, updated_at, raw_payload, profiles!user_submissions_user_id_fkey(username)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status === "queue") query = query.in("status", ["pending", "normalized", "draft"]);
  else if (status !== "all") query = query.eq("status", status);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  const filtered = (data ?? []).filter((row: any) => {
    const payload = (row.raw_payload ?? {}) as Record<string, unknown>;
    const shoeName = String(payload.shoe_name ?? "");
    const rowBrand = String(payload.brand ?? "");
    const username = Array.isArray(row.profiles) ? row.profiles[0]?.username ?? "" : row.profiles?.username ?? "";

    const matchesQ = q.length === 0 || `${shoeName} ${rowBrand}`.toLowerCase().includes(q.toLowerCase());
    const matchesBrand = brand === "all" || rowBrand.toLowerCase() === brand.toLowerCase();
    const matchesSubmitter = submitter.length === 0 || username.toLowerCase().includes(submitter.toLowerCase());

    return matchesQ && matchesBrand && matchesSubmitter;
  });

  return NextResponse.json({ ok: true, submissions: filtered });
}
