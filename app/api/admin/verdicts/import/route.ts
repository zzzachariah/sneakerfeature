import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { VERDICT_FIELDS, normKey, type VerdictField } from "@/lib/admin/verdict-csv";

// Bulk-import of per-shoe one-line verdicts (pro_summary / con_summary, + their
// _zh counterparts). The admin client parses the CSV and POSTs it in small
// BATCHES so it can render a live progress bar; each request handles one batch
// and returns its own tally. Rows are matched to shoes by slug (primary) or
// brand+shoe_name (fallback). See docs/verdict-import.md for the CSV format.

export const dynamic = "force-dynamic";

const optionalText = z.string().optional();

const rowSchema = z.object({
  slug: optionalText,
  brand: optionalText,
  shoe_name: optionalText,
  pro_summary: optionalText,
  pro_summary_zh: optionalText,
  con_summary: optionalText,
  con_summary_zh: optionalText
});

const schema = z.object({
  // One batch of already-parsed rows. Capped so a single serverless invocation
  // stays well within its time budget; the client sends many small batches.
  rows: z.array(rowSchema).min(1).max(200),
  // overwrite: a non-empty cell replaces the stored value.
  // fill: a non-empty cell is written only where the stored value is empty.
  // Either way, a BLANK/absent cell never wipes an existing value.
  mode: z.enum(["overwrite", "fill"]).optional()
});

type VerdictInputRow = z.infer<typeof rowSchema>;

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

function val(row: VerdictInputRow, key: keyof VerdictInputRow): string {
  return (row[key] ?? "").trim();
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload.");

  const mode = parsed.data.mode ?? "overwrite";
  const rows = parsed.data.rows;

  // Build shoe lookup tables for this batch.
  const { data: shoes, error: shoesError } = await supabase.from("shoes").select("id, slug, brand, shoe_name");
  if (shoesError) return badRequest(`Could not load shoes: ${shoesError.message}`);

  const bySlug = new Map<string, string>();
  const byBrandName = new Map<string, string>();
  for (const s of shoes ?? []) {
    if (s.slug) bySlug.set(normKey(s.slug), s.id);
    byBrandName.set(`${normKey(s.brand)}|${normKey(s.shoe_name)}`, s.id);
  }

  const matchShoe = (row: VerdictInputRow): string | null => {
    const slug = val(row, "slug");
    const brand = val(row, "brand");
    const name = val(row, "shoe_name");
    return (
      (slug ? bySlug.get(normKey(slug)) : undefined) ||
      (brand && name ? byBrandName.get(`${normKey(brand)}|${normKey(name)}`) : undefined) ||
      null
    );
  };

  // For "fill" mode, read existing verdict text for the shoes matched in THIS
  // batch so we only write into empty slots.
  const existingByShoe = new Map<string, Partial<Record<VerdictField, string>>>();
  if (mode === "fill") {
    const matchedIds = [...new Set(rows.map(matchShoe).filter((id): id is string => Boolean(id)))];
    if (matchedIds.length) {
      const { data: specs } = await supabase
        .from("shoe_specs")
        .select("shoe_id, pro_summary, pro_summary_zh, con_summary, con_summary_zh")
        .in("shoe_id", matchedIds);
      for (const sp of specs ?? []) {
        const cur: Partial<Record<VerdictField, string>> = {};
        for (const f of VERDICT_FIELDS) {
          const v = (sp as Record<string, unknown>)[f];
          if (typeof v === "string" && v.trim()) cur[f] = v;
        }
        existingByShoe.set(sp.shoe_id as string, cur);
      }
    }
  }

  const unmatched: string[] = [];
  let matched = 0;
  let updated = 0;
  let inserted = 0;
  let skippedNoData = 0;

  for (const row of rows) {
    const shoeId = matchShoe(row);
    if (!shoeId) {
      const slug = val(row, "slug");
      const label = slug || `${val(row, "brand")} ${val(row, "shoe_name")}`.trim();
      unmatched.push(label || "(row with no identifier)");
      continue;
    }
    matched++;

    const existing = existingByShoe.get(shoeId) ?? {};
    const payload: Partial<Record<VerdictField, string>> = {};
    for (const f of VERDICT_FIELDS) {
      const value = val(row, f);
      if (!value) continue; // blank/absent cell never wipes an existing value
      if (mode === "fill" && existing[f]) continue; // keep what's already there
      payload[f] = value;
    }

    if (Object.keys(payload).length === 0) {
      skippedNoData++;
      continue;
    }

    const label = val(row, "slug") || val(row, "shoe_name") || shoeId;
    const writePayload = { ...payload, updated_at: new Date().toISOString() };
    const { data: updatedSpecs, error: updateError } = await supabase
      .from("shoe_specs")
      .update(writePayload)
      .eq("shoe_id", shoeId)
      .select("id");
    if (updateError) return badRequest(`Update failed for ${label}: ${updateError.message}`);

    if (!updatedSpecs || updatedSpecs.length === 0) {
      const { error: insertError } = await supabase.from("shoe_specs").insert({ shoe_id: shoeId, ...payload });
      if (insertError) return badRequest(`Insert failed for ${label}: ${insertError.message}`);
      inserted++;
    } else {
      updated++;
    }
  }

  // Wrote at least one row → bust the cached catalog so detail pages refresh.
  if (updated > 0 || inserted > 0) revalidateTag("shoes");

  return NextResponse.json({ ok: true, matched, updated, inserted, skippedNoData, unmatched });
}
