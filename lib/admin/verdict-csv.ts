// Shared CSV helpers for the verdict (pro/con one-liner) import. Used by BOTH the
// admin client (to parse + chunk the file for a live progress bar) and the API
// route (to validate the rows it receives). Keep this module free of server-only
// imports so it can ship in the client bundle.

export const VERDICT_FIELDS = ["pro_summary", "pro_summary_zh", "con_summary", "con_summary_zh"] as const;
export type VerdictField = (typeof VERDICT_FIELDS)[number];

// A single parsed CSV data row, keyed by canonical column. Only non-empty cells
// are kept, so absent/blank cells are simply missing (and never overwrite stored
// values downstream).
export type VerdictRow = {
  slug?: string;
  brand?: string;
  shoe_name?: string;
} & Partial<Record<VerdictField, string>>;

const CANONICAL_KEYS = ["slug", "brand", "shoe_name", ...VERDICT_FIELDS] as const;

// Friendly header name -> canonical column, so the CSV may use any order and a
// few common spellings.
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

// Normalize a key/value for matching: trim, lowercase, collapse inner whitespace.
export function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// Minimal RFC-4180-ish parser: quoted fields, "" escapes, commas/newlines inside
// quotes, CRLF, and a leading BOM. Returns rows of raw string cells; fully-empty
// rows are dropped.
export function parseCsv(input: string): string[][] {
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

export type ParsedVerdictCsv =
  | { ok: true; rows: VerdictRow[]; presentVerdictCols: VerdictField[] }
  | { ok: false; error: string };

// Parse a full CSV into canonical verdict rows, validating that it has a usable
// match key and at least one verdict column. The caller (client) then chunks
// `rows` into batches for the live-progress import.
export function parseVerdictCsv(text: string): ParsedVerdictCsv {
  const raw = parseCsv(text);
  if (raw.length < 2) {
    return { ok: false, error: "CSV needs a header row and at least one data row." };
  }

  const header = raw[0].map((h) => HEADER_ALIASES[normKey(h)] ?? null);
  const colOf = (key: string) => header.indexOf(key);

  const hasSlug = colOf("slug") !== -1;
  const hasBrand = colOf("brand") !== -1;
  const hasName = colOf("shoe_name") !== -1;
  if (!hasSlug && !(hasBrand && hasName)) {
    return {
      ok: false,
      error: "CSV must have a 'slug' column, or both 'brand' and 'shoe_name' columns, to match shoes."
    };
  }

  const presentVerdictCols = VERDICT_FIELDS.filter((f) => colOf(f) !== -1);
  if (presentVerdictCols.length === 0) {
    return {
      ok: false,
      error: "CSV must include at least one of: pro_summary, pro_summary_zh, con_summary, con_summary_zh."
    };
  }

  const rows: VerdictRow[] = [];
  for (let r = 1; r < raw.length; r++) {
    const cells = raw[r];
    const obj: VerdictRow = {};
    for (const key of CANONICAL_KEYS) {
      const i = colOf(key);
      if (i === -1) continue;
      const v = (cells[i] ?? "").trim();
      if (v) obj[key] = v;
    }
    rows.push(obj);
  }

  return { ok: true, rows, presentVerdictCols };
}
