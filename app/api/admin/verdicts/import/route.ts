import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/route-auth";

// Bulk-import of per-shoe one-line verdicts (pro_summary / con_summary, + their
// _zh counterparts) from a CSV. Content is authored externally (Claude chat) and
// matched to shoes by slug (primary) or brand+shoe_name (fallback). See
// docs/verdict-import.md for the CSV format and the generation prompt.

export const dynamic = "force-dynamic";

const schema = z.object({
  csv: z.string().min(1, "CSV is empty."),
  // overwrite: a non-empty CSV cell replaces the stored value.
  // fill: a non-empty CSV cell is written only where the stored value is empty.
  // Either way, a BLANK cell never wipes an existing value.
  mode: z.enum(["overwrite", "fill"]).optional()
});

const VERDICT_FIELDS = ["pro_summary", "pro_summary_zh", "con_summary", "con_summary_zh"] as const;
type VerdictField = (typeof VERDICT_FIELDS)[number];

// Header name -> canonical column. Lets the CSV use friendly headers in any order.
const HEADER_ALIASES: Record<string, string> = {
  slug: "slug",
  brand: "brand",
  shoe_name: "shoe_name",
  "shoe name": "shoe_name",
  name: "shoe_name",
  model: "shoe_name",
  pro_summary: "pro_summary",
  "pro summary": "pro_summary",
  pro: "pro_summary",
  pro_en: "pro_summary",
  pro_summary_zh: "pro_summary_zh",
  "pro summary zh": "pro_summary_zh",
  pro_zh: "pro_summary_zh",
  con_summary: "con_summary",
  "con summary": "con_summary",
  con: "con_summary",
  con_en: "con_summary",
  con_summary_zh: "con_summary_zh",
  "con summary zh": "con_summary_zh",
  con_zh: "con_summary_zh"
};

// Minimal RFC-4180-ish parser: quoted fields, "" escapes, commas/newlines inside
// quotes, CRLF, and a leading BOM. Returns rows of raw string cells.
function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // swallow; handled by the \n branch
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  row.push(field);
  rows.push(row);

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
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
  const rows = parseCsv(parsed.data.csv);
  if (rows.length < 2) return badRequest("CSV needs a header row and at least one data row.");

  // Map each header column to a canonical key (unknown columns are ignored).
  const header = rows[0].map((h) => HEADER_ALIASES[normKey(h)] ?? null);
  const colOf = (key: string) => header.indexOf(key);

  const hasSlug = colOf("slug") !== -1;
  const hasBrand = colOf("brand") !== -1;
  const hasName = colOf("shoe_name") !== -1;
  if (!hasSlug && !(hasBrand && hasName)) {
    return badRequest("CSV must have a 'slug' column, or both 'brand' and 'shoe_name' columns, to match shoes.");
  }
  const presentVerdictCols = VERDICT_FIELDS.filter((f) => colOf(f) !== -1);
  if (presentVerdictCols.length === 0) {
    return badRequest("CSV must include at least one of: pro_summary, pro_summary_zh, con_summary, con_summary_zh.");
  }

  // Build shoe lookup tables once.
  const { data: shoes, error: shoesError } = await supabase
    .from("shoes")
    .select("id, slug, brand, shoe_name");
  if (shoesError) return badRequest(`Could not load shoes: ${shoesError.message}`);

  const bySlug = new Map<string, string>();
  const byBrandName = new Map<string, string>();
  for (const s of shoes ?? []) {
    if (s.slug) bySlug.set(normKey(s.slug), s.id);
    byBrandName.set(`${normKey(s.brand)}|${normKey(s.shoe_name)}`, s.id);
  }

  // Current verdict values per shoe (only needed for "fill" mode).
  const existingByShoe = new Map<string, Partial<Record<VerdictField, string>>>();
  if (mode === "fill") {
    const { data: specs } = await supabase
      .from("shoe_specs")
      .select("shoe_id, pro_summary, pro_summary_zh, con_summary, con_summary_zh");
    for (const sp of specs ?? []) {
      const cur: Partial<Record<VerdictField, string>> = {};
      for (const f of VERDICT_FIELDS) {
        const v = (sp as Record<string, unknown>)[f];
        if (typeof v === "string" && v.trim()) cur[f] = v;
      }
      existingByShoe.set(sp.shoe_id as string, cur);
    }
  }

  const cell = (row: string[], key: string): string => {
    const i = colOf(key);
    return i === -1 ? "" : (row[i] ?? "").trim();
  };

  const unmatched: string[] = [];
  let matched = 0;
  let updated = 0;
  let inserted = 0;
  let skippedNoData = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const slug = cell(row, "slug");
    const brand = cell(row, "brand");
    const name = cell(row, "shoe_name");

    const shoeId =
      (slug && bySlug.get(normKey(slug))) ||
      (brand && name && byBrandName.get(`${normKey(brand)}|${normKey(name)}`)) ||
      null;

    if (!shoeId) {
      unmatched.push(slug || (brand || name ? `${brand} ${name}`.trim() : `row ${r + 1}`));
      continue;
    }
    matched++;

    const existing = existingByShoe.get(shoeId) ?? {};
    const payload: Partial<Record<VerdictField, string>> = {};
    for (const f of presentVerdictCols) {
      const value = cell(row, f);
      if (!value) continue; // blank cell never wipes an existing value
      if (mode === "fill" && existing[f]) continue; // keep what's already there
      payload[f] = value;
    }

    if (Object.keys(payload).length === 0) {
      skippedNoData++;
      continue;
    }

    const writePayload = { ...payload, updated_at: new Date().toISOString() };
    const { data: updatedSpecs, error: updateError } = await supabase
      .from("shoe_specs")
      .update(writePayload)
      .eq("shoe_id", shoeId)
      .select("id");
    if (updateError) return badRequest(`Update failed for ${slug || name || shoeId}: ${updateError.message}`);

    if (!updatedSpecs || updatedSpecs.length === 0) {
      const { error: insertError } = await supabase
        .from("shoe_specs")
        .insert({ shoe_id: shoeId, ...payload });
      if (insertError) return badRequest(`Insert failed for ${slug || name || shoeId}: ${insertError.message}`);
      inserted++;
    } else {
      updated++;
    }
  }

  revalidateTag("shoes");

  return NextResponse.json({
    ok: true,
    message: `Imported ${matched} shoe(s): ${updated} updated, ${inserted} created, ${skippedNoData} skipped (no verdict text), ${unmatched.length} unmatched.`,
    matched,
    updated,
    inserted,
    skippedNoData,
    unmatched
  });
}
