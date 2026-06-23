import { promises as fs } from "node:fs";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";

export type DurationChoice =
  | "1 day"
  | "3 days"
  | "1 week"
  | "2 weeks"
  | "1 month"
  | "forever";

export type FrequencyChoice = "once" | "session" | "always";

export type AnnouncementRecord = {
  id: string;
  enabled: boolean;
  duration: DurationChoice;
  frequency: FrequencyChoice;
  dismissible: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  title: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  titleZh: string;
  bodyZh: string;
  buttonLabelZh: string;
};

const DURATION_SECS: Record<DurationChoice, number> = {
  "1 day": 86_400,
  "3 days": 259_200,
  "1 week": 604_800,
  "2 weeks": 1_209_600,
  "1 month": 2_592_000,
  forever: 0,
};

export function expiryFromDuration(duration: DurationChoice, from: Date = new Date()): string | null {
  const secs = DURATION_SECS[duration] ?? 0;
  if (secs <= 0) return null;
  return new Date(from.getTime() + secs * 1000).toISOString();
}

type Row = {
  id: string;
  enabled: boolean;
  duration: string;
  frequency: string;
  dismissible: boolean;
  published_at: string | null;
  expires_at: string | null;
  title: string;
  body: string;
  button_label: string;
  button_url: string;
  title_zh: string;
  body_zh: string;
  button_label_zh: string;
};

function rowToRecord(r: Row): AnnouncementRecord {
  return {
    id: r.id,
    enabled: r.enabled,
    duration: (r.duration as DurationChoice) ?? "forever",
    frequency: (r.frequency as FrequencyChoice) ?? "once",
    dismissible: r.dismissible,
    publishedAt: r.published_at,
    expiresAt: r.expires_at,
    title: r.title ?? "",
    body: r.body ?? "",
    buttonLabel: r.button_label ?? "",
    buttonUrl: r.button_url ?? "",
    titleZh: r.title_zh ?? "",
    bodyZh: r.body_zh ?? "",
    buttonLabelZh: r.button_label_zh ?? "",
  };
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() >= t;
}

/** Back-compat: read the static JSON files written by the GitHub Action.
 * Used as a fallback when the DB is empty / unavailable so the legacy
 * publishing path keeps working without manual migration.
 */
async function readStaticActive(): Promise<AnnouncementRecord | null> {
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "public", "announcement.json"),
      "utf-8"
    );
    const a = JSON.parse(raw);
    if (!a || typeof a !== "object") return null;
    return {
      id: String(a.id ?? ""),
      enabled: Boolean(a.enabled),
      duration: (a.duration as DurationChoice) ?? "forever",
      frequency: (a.frequency as FrequencyChoice) ?? "once",
      dismissible: a.dismissible !== false,
      publishedAt: a.publishedAt ?? null,
      expiresAt: a.expiresAt ?? null,
      title: a.title ?? "",
      body: a.body ?? "",
      buttonLabel: a.buttonLabel ?? "",
      buttonUrl: a.buttonUrl ?? "",
      titleZh: a.titleZh ?? "",
      bodyZh: a.bodyZh ?? "",
      buttonLabelZh: a.buttonLabelZh ?? "",
    };
  } catch {
    return null;
  }
}

async function readStaticHistory(): Promise<AnnouncementRecord[]> {
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "public", "announcements-history.json"),
      "utf-8"
    );
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((a) => ({
      id: String(a.id ?? ""),
      enabled: Boolean(a.enabled ?? true),
      duration: (a.duration as DurationChoice) ?? "forever",
      frequency: (a.frequency as FrequencyChoice) ?? "once",
      dismissible: a.dismissible !== false,
      publishedAt: a.publishedAt ?? null,
      expiresAt: a.expiresAt ?? null,
      title: a.title ?? "",
      body: a.body ?? "",
      buttonLabel: a.buttonLabel ?? "",
      buttonUrl: a.buttonUrl ?? "",
      titleZh: a.titleZh ?? "",
      bodyZh: a.bodyZh ?? "",
      buttonLabelZh: a.buttonLabelZh ?? "",
    }));
  } catch {
    return [];
  }
}

const SELECT_COLS =
  "id, enabled, duration, frequency, dismissible, published_at, expires_at, title, body, button_label, button_url, title_zh, body_zh, button_label_zh";

// Announcements that the GitHub Action published live in static JSON files
// (public/announcement.json + public/announcements-history.json). Those files
// are part of the bundled deploy and the Vercel runtime can't mutate them, so
// an admin "delete" on a file-backed entry can't remove it at the source.
// Instead we record its id here, in the existing `app_settings` table, and
// the read paths below filter the file results through this set.
const LEGACY_DELETED_KEY = "deleted_legacy_announcement_ids";

async function readDeletedLegacyIds(): Promise<Set<string>> {
  const admin = createAdminClient();
  if (!admin) return new Set();
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", LEGACY_DELETED_KEY)
    .maybeSingle();
  const raw = data?.value;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.map((v) => String(v)));
}

async function addDeletedLegacyId(id: string, actorId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");
  const existing = await readDeletedLegacyIds();
  existing.add(id);
  const { error } = await admin
    .from("app_settings")
    .upsert(
      {
        key: LEGACY_DELETED_KEY,
        value: Array.from(existing),
        updated_at: new Date().toISOString(),
        updated_by: actorId,
      },
      { onConflict: "key" }
    );
  if (error) throw error;
}

/** Locate a file-backed (GitHub-Action-published) announcement by id. Used
 * to support edit/delete of legacy entries: the admin UI hands us a legacy
 * id and we resolve it against both the active file and the history file. */
async function readLegacyById(id: string): Promise<AnnouncementRecord | null> {
  const [history, active] = await Promise.all([readStaticHistory(), readStaticActive()]);
  const fromHistory = history.find((h) => h.id === id);
  if (fromHistory) return fromHistory;
  if (active && active.id === id) return active;
  return null;
}

/** Insert a legacy file entry as a real DB row, preserving its id so the
 * announcement-modal "already seen" tracking on visitors' devices keeps
 * working. Called the first time an admin edits a file-backed entry, after
 * which it behaves like any other DB row. */
async function importLegacyAnnouncement(
  legacy: AnnouncementRecord,
  actorId: string
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");
  const { error } = await admin.from("announcements").insert({
    id: legacy.id,
    enabled: legacy.enabled,
    duration: legacy.duration,
    frequency: legacy.frequency,
    dismissible: legacy.dismissible,
    published_at: legacy.publishedAt,
    expires_at: legacy.expiresAt,
    title: legacy.title,
    body: legacy.body,
    button_label: legacy.buttonLabel,
    button_url: legacy.buttonUrl,
    title_zh: legacy.titleZh,
    body_zh: legacy.bodyZh,
    button_label_zh: legacy.buttonLabelZh,
    created_by: actorId,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Active = newest enabled, non-expired row. Falls back to the static JSON
 * file written by the GitHub Action so the legacy flow keeps working.
 */
export async function getActiveAnnouncement(): Promise<AnnouncementRecord | null> {
  const admin = createAdminClient();
  if (admin) {
    const { data, error } = await admin
      .from("announcements")
      .select(SELECT_COLS)
      .eq("enabled", true)
      .order("published_at", { ascending: false })
      .limit(1);
    if (!error && Array.isArray(data) && data.length) {
      const rec = rowToRecord(data[0] as Row);
      if (!isExpired(rec.expiresAt)) return rec;
    }
  }
  const [fallback, deleted] = await Promise.all([readStaticActive(), readDeletedLegacyIds()]);
  if (fallback && fallback.id && deleted.has(fallback.id)) return null;
  if (fallback && fallback.enabled && !isExpired(fallback.expiresAt)) return fallback;
  return null;
}

/** Full history, newest first. Merges DB + static-file entries so historical
 * GitHub-Action-published rows keep showing on /announcements. File entries
 * whose id appears in `deleted_legacy_announcement_ids` are filtered out so
 * an admin "delete" on a file-backed row genuinely hides it everywhere.
 */
export async function listAnnouncements(): Promise<AnnouncementRecord[]> {
  const admin = createAdminClient();
  let db: AnnouncementRecord[] = [];
  if (admin) {
    const { data, error } = await admin
      .from("announcements")
      .select(SELECT_COLS)
      .order("published_at", { ascending: false });
    if (!error && Array.isArray(data)) {
      db = (data as Row[]).map(rowToRecord);
    }
  }
  const [fileEntries, deleted] = await Promise.all([readStaticHistory(), readDeletedLegacyIds()]);
  const seen = new Set(db.map((d) => d.id));
  const fileExtras = fileEntries.filter((f) => f.id && !seen.has(f.id) && !deleted.has(f.id));
  const merged = [...db, ...fileExtras];
  merged.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });
  return merged;
}

export type AnnouncementInput = {
  enabled: boolean;
  duration: DurationChoice;
  frequency: FrequencyChoice;
  dismissible: boolean;
  title: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  titleZh: string;
  bodyZh: string;
  buttonLabelZh: string;
};

export async function createAnnouncement(
  input: AnnouncementInput,
  actorId: string
): Promise<AnnouncementRecord> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");
  const publishedAt = new Date();
  const expiresAt = expiryFromDuration(input.duration, publishedAt);
  const { data, error } = await admin
    .from("announcements")
    .insert({
      enabled: input.enabled,
      duration: input.duration,
      frequency: input.frequency,
      dismissible: input.dismissible,
      published_at: publishedAt.toISOString(),
      expires_at: expiresAt,
      title: input.title,
      body: input.body,
      button_label: input.buttonLabel,
      button_url: input.buttonUrl,
      title_zh: input.titleZh,
      body_zh: input.bodyZh,
      button_label_zh: input.buttonLabelZh,
      created_by: actorId,
      updated_by: actorId,
      updated_at: publishedAt.toISOString(),
    })
    .select(SELECT_COLS)
    .single();
  if (error) throw error;
  return rowToRecord(data as Row);
}

export async function updateAnnouncement(
  id: string,
  input: Partial<AnnouncementInput> & { extendExpiry?: boolean },
  actorId: string
): Promise<AnnouncementRecord> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");

  // The admin UI hands us an id from the merged list (DB + legacy file
  // entries). If the row doesn't exist in the DB yet, look it up in the
  // static files and import it on the fly — from then on every operation
  // treats it as a normal DB row.
  const { data: existingRow } = await admin
    .from("announcements")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!existingRow) {
    const legacy = await readLegacyById(id);
    if (!legacy) throw new Error("Announcement not found.");
    await importLegacyAnnouncement(legacy, actorId);
  }

  // Edits keep the same id so visitors who already dismissed don't get
  // re-prompted. Toggling enabled off is a takedown.
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: actorId,
  };
  const keys = [
    "enabled",
    "duration",
    "frequency",
    "dismissible",
    "title",
    "body",
    "buttonLabel",
    "buttonUrl",
    "titleZh",
    "bodyZh",
    "buttonLabelZh",
  ] as const;
  for (const k of keys) {
    if (input[k] === undefined) continue;
    const dbKey = ({
      enabled: "enabled",
      duration: "duration",
      frequency: "frequency",
      dismissible: "dismissible",
      title: "title",
      body: "body",
      buttonLabel: "button_label",
      buttonUrl: "button_url",
      titleZh: "title_zh",
      bodyZh: "body_zh",
      buttonLabelZh: "button_label_zh",
    } as const)[k];
    patch[dbKey] = input[k];
  }
  if (input.duration && input.extendExpiry) {
    patch.expires_at = expiryFromDuration(input.duration);
    patch.published_at = new Date().toISOString();
  } else if (input.duration && !input.extendExpiry) {
    // Recompute expiry from the original published_at if duration changed
    // without an explicit re-publish. Keeps the timeline consistent.
    const { data: existing } = await admin
      .from("announcements")
      .select("published_at")
      .eq("id", id)
      .maybeSingle();
    const base = existing?.published_at ? new Date(existing.published_at) : new Date();
    patch.expires_at = expiryFromDuration(input.duration, base);
  }
  const { data, error } = await admin
    .from("announcements")
    .update(patch)
    .eq("id", id)
    .select(SELECT_COLS)
    .single();
  if (error) throw error;
  return rowToRecord(data as Row);
}

export async function deleteAnnouncement(id: string, actorId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");
  const { data: dbRow } = await admin
    .from("announcements")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (dbRow) {
    const { error } = await admin.from("announcements").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  // No DB row — must be a legacy file entry. We can't mutate the JSON files
  // at runtime (read-only on Vercel), so we record the id in app_settings;
  // both read paths filter against this set so the entry truly disappears.
  await addDeletedLegacyId(id, actorId);
}

export async function getAnnouncement(id: string): Promise<AnnouncementRecord | null> {
  const admin = createAdminClient();
  if (admin) {
    const { data, error } = await admin
      .from("announcements")
      .select(SELECT_COLS)
      .eq("id", id)
      .maybeSingle();
    if (!error && data) return rowToRecord(data as Row);
  }
  // Fall back to the static files so the admin UI can edit / delete
  // GitHub-Action-published entries by their original id.
  return readLegacyById(id);
}
