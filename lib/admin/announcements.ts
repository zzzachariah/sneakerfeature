import { promises as fs } from "node:fs";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";

// Site-wide announcement record. Mirrors public/announcement.json so the
// existing GitHub Actions publish flow + the new admin UI stay
// interchangeable.
export type Announcement = {
  id: string;
  enabled: boolean;
  frequency: "once" | "session" | "always";
  dismissible: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  duration?: string;
  title: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  titleZh: string;
  bodyZh: string;
  buttonLabelZh: string;
};

const CURRENT_KEY = "announcement_current";
const HISTORY_KEY = "announcement_history";

const PUBLIC_DIR = path.join(process.cwd(), "public");

function emptyAnnouncement(): Announcement {
  return {
    id: "",
    enabled: false,
    frequency: "once",
    dismissible: true,
    publishedAt: null,
    expiresAt: null,
    title: "",
    body: "",
    buttonLabel: "",
    buttonUrl: "",
    titleZh: "",
    bodyZh: "",
    buttonLabelZh: ""
  };
}

function normalize(input: Record<string, unknown> | null | undefined): Announcement | null {
  if (!input || typeof input !== "object") return null;
  const a = input as Record<string, unknown>;
  if (typeof a.id !== "string" || !a.id) return null;
  return {
    id: a.id,
    enabled: a.enabled === true,
    frequency:
      a.frequency === "session" || a.frequency === "always" ? a.frequency : "once",
    dismissible: a.dismissible !== false,
    publishedAt: typeof a.publishedAt === "string" ? a.publishedAt : null,
    expiresAt: typeof a.expiresAt === "string" && a.expiresAt ? a.expiresAt : null,
    duration: typeof a.duration === "string" ? a.duration : undefined,
    title: typeof a.title === "string" ? a.title : "",
    body: typeof a.body === "string" ? a.body : "",
    buttonLabel: typeof a.buttonLabel === "string" ? a.buttonLabel : "",
    buttonUrl: typeof a.buttonUrl === "string" ? a.buttonUrl : "",
    titleZh: typeof a.titleZh === "string" ? a.titleZh : "",
    bodyZh: typeof a.bodyZh === "string" ? a.bodyZh : "",
    buttonLabelZh: typeof a.buttonLabelZh === "string" ? a.buttonLabelZh : ""
  };
}

async function readFileJson<T>(rel: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(PUBLIC_DIR, rel), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Current announcement (the one rendered in the popup). Reads from DB first;
// falls back to public/announcement.json so a fresh install / local dev still
// shows whatever was last published via the GitHub Action.
export async function getCurrentAnnouncement(): Promise<Announcement | null> {
  const admin = createAdminClient();
  if (admin) {
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", CURRENT_KEY)
      .maybeSingle();
    if (data && data.value !== null) {
      const value = normalize(data.value as Record<string, unknown>);
      if (value) return value;
    }
  }
  const fileValue = await readFileJson<Record<string, unknown>>("announcement.json");
  return normalize(fileValue);
}

export async function getAnnouncementHistory(): Promise<Announcement[]> {
  const admin = createAdminClient();
  if (admin) {
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", HISTORY_KEY)
      .maybeSingle();
    if (data && Array.isArray(data.value)) {
      const list = (data.value as Array<Record<string, unknown>>)
        .map(normalize)
        .filter((x): x is Announcement => x !== null);
      if (list.length > 0) return list;
    }
  }
  const fileValue = await readFileJson<Array<Record<string, unknown>>>(
    "announcements-history.json"
  );
  if (!Array.isArray(fileValue)) return [];
  return fileValue
    .map(normalize)
    .filter((x): x is Announcement => x !== null);
}

async function writeCurrent(value: Announcement | null, adminUserId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");
  const { error } = await admin
    .from("app_settings")
    .upsert(
      {
        key: CURRENT_KEY,
        value: value as unknown as Record<string, unknown> | null,
        updated_at: new Date().toISOString(),
        updated_by: adminUserId
      },
      { onConflict: "key" }
    );
  if (error) throw error;
}

async function writeHistory(value: Announcement[], adminUserId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");
  const { error } = await admin
    .from("app_settings")
    .upsert(
      {
        key: HISTORY_KEY,
        value: value as unknown as Record<string, unknown>[],
        updated_at: new Date().toISOString(),
        updated_by: adminUserId
      },
      { onConflict: "key" }
    );
  if (error) throw error;
}

// Human-picked duration → absolute expiry. "forever" → null.
function expiryFromDuration(duration: string, publishedAt: Date): string | null {
  const seconds: Record<string, number> = {
    "1 day": 86_400,
    "3 days": 259_200,
    "1 week": 604_800,
    "2 weeks": 1_209_600,
    "1 month": 2_592_000
  };
  const s = seconds[duration];
  if (!s) return null;
  return new Date(publishedAt.getTime() + s * 1000).toISOString();
}

function generateId(now: Date, seed: number): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const stamp =
    now.getUTCFullYear().toString() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    "-" +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds());
  return `${stamp}-${seed}`;
}

export type PublishInput = {
  title: string;
  body: string;
  buttonLabel?: string;
  buttonUrl?: string;
  titleZh?: string;
  bodyZh?: string;
  buttonLabelZh?: string;
  duration?: string;
  frequency?: "once" | "session" | "always";
  dismissible?: boolean;
};

// Publish a brand-new announcement: writes it as the current, archives the
// previous (if it was enabled) to the history list.
export async function publishAnnouncement(
  input: PublishInput,
  adminUserId: string
): Promise<Announcement> {
  if (!input.title || !input.body) {
    throw new Error("Title and body are required.");
  }
  const previousCurrent = await getCurrentAnnouncement();
  const now = new Date();
  const seed = Math.floor(Math.random() * 9000) + 1000;
  const fresh: Announcement = {
    id: generateId(now, seed),
    enabled: true,
    frequency: input.frequency ?? "once",
    dismissible: input.dismissible ?? true,
    publishedAt: now.toISOString(),
    expiresAt: input.duration ? expiryFromDuration(input.duration, now) : null,
    duration: input.duration,
    title: input.title,
    body: input.body,
    buttonLabel: input.buttonLabel ?? "",
    buttonUrl: input.buttonUrl ?? "",
    titleZh: input.titleZh ?? "",
    bodyZh: input.bodyZh ?? "",
    buttonLabelZh: input.buttonLabelZh ?? ""
  };

  // Archive the just-replaced active announcement so it shows up on
  // /announcements with an "Ended" badge instead of vanishing silently.
  const history = await getAnnouncementHistory();
  let nextHistory = history;
  if (previousCurrent && previousCurrent.enabled && previousCurrent.id !== fresh.id) {
    nextHistory = [previousCurrent, ...history.filter((h) => h.id !== previousCurrent.id)];
  }
  // Always put the new entry at the top so /announcements lists it too.
  nextHistory = [fresh, ...nextHistory.filter((h) => h.id !== fresh.id)];

  await writeCurrent(fresh, adminUserId);
  await writeHistory(nextHistory, adminUserId);
  return fresh;
}

export type UpdateInput = Partial<PublishInput> & {
  enabled?: boolean;
};

// Edit the current announcement in-place — keeps the same `id` so users who
// already dismissed it (frequency=once) still don't get re-popped. Use
// publishAnnouncement instead when you want a fresh id that pops for everyone.
export async function updateCurrentAnnouncement(
  patch: UpdateInput,
  adminUserId: string
): Promise<Announcement> {
  const current = (await getCurrentAnnouncement()) ?? {
    ...emptyAnnouncement(),
    id: generateId(new Date(), Math.floor(Math.random() * 9000) + 1000),
    publishedAt: new Date().toISOString()
  };
  const next: Announcement = {
    ...current,
    enabled: patch.enabled ?? current.enabled,
    frequency: patch.frequency ?? current.frequency,
    dismissible: patch.dismissible ?? current.dismissible,
    title: patch.title ?? current.title,
    body: patch.body ?? current.body,
    buttonLabel: patch.buttonLabel ?? current.buttonLabel,
    buttonUrl: patch.buttonUrl ?? current.buttonUrl,
    titleZh: patch.titleZh ?? current.titleZh,
    bodyZh: patch.bodyZh ?? current.bodyZh,
    buttonLabelZh: patch.buttonLabelZh ?? current.buttonLabelZh
  };
  if (patch.duration !== undefined) {
    next.duration = patch.duration;
    const basePublished = current.publishedAt ? new Date(current.publishedAt) : new Date();
    next.expiresAt = patch.duration
      ? expiryFromDuration(patch.duration, basePublished)
      : null;
  }
  await writeCurrent(next, adminUserId);
  // Reflect the edit in the history list too if it's already archived there
  // (e.g. fixing a typo on the active entry should fix it on /announcements).
  const history = await getAnnouncementHistory();
  if (history.some((h) => h.id === next.id)) {
    const updatedHistory = history.map((h) => (h.id === next.id ? next : h));
    await writeHistory(updatedHistory, adminUserId);
  }
  return next;
}

// Edit a single archived (historical) entry — does not touch the current
// popup unless it happens to share the same id.
export async function updateHistoryEntry(
  id: string,
  patch: UpdateInput,
  adminUserId: string
): Promise<Announcement | null> {
  const history = await getAnnouncementHistory();
  const idx = history.findIndex((h) => h.id === id);
  if (idx === -1) return null;
  const existing = history[idx];
  const next: Announcement = {
    ...existing,
    enabled: patch.enabled ?? existing.enabled,
    frequency: patch.frequency ?? existing.frequency,
    dismissible: patch.dismissible ?? existing.dismissible,
    title: patch.title ?? existing.title,
    body: patch.body ?? existing.body,
    buttonLabel: patch.buttonLabel ?? existing.buttonLabel,
    buttonUrl: patch.buttonUrl ?? existing.buttonUrl,
    titleZh: patch.titleZh ?? existing.titleZh,
    bodyZh: patch.bodyZh ?? existing.bodyZh,
    buttonLabelZh: patch.buttonLabelZh ?? existing.buttonLabelZh
  };
  if (patch.duration !== undefined) {
    next.duration = patch.duration;
    const basePublished = existing.publishedAt ? new Date(existing.publishedAt) : new Date();
    next.expiresAt = patch.duration
      ? expiryFromDuration(patch.duration, basePublished)
      : null;
  }
  const updated = history.slice();
  updated[idx] = next;
  await writeHistory(updated, adminUserId);
  // If the user just edited a row that also happens to be the live popup,
  // mirror the edit to the active record so they don't get out of sync.
  const current = await getCurrentAnnouncement();
  if (current && current.id === next.id) {
    await writeCurrent(next, adminUserId);
  }
  return next;
}

export async function takeDownCurrentAnnouncement(adminUserId: string): Promise<void> {
  const current = await getCurrentAnnouncement();
  if (!current) {
    await writeCurrent(null, adminUserId);
    return;
  }
  const next: Announcement = { ...current, enabled: false };
  await writeCurrent(next, adminUserId);
  // Reflect on the archived entry too so /announcements stops showing "Live".
  const history = await getAnnouncementHistory();
  if (history.some((h) => h.id === next.id)) {
    const updated = history.map((h) => (h.id === next.id ? next : h));
    await writeHistory(updated, adminUserId);
  }
}

export async function deleteHistoryEntry(id: string, adminUserId: string): Promise<boolean> {
  const history = await getAnnouncementHistory();
  const next = history.filter((h) => h.id !== id);
  if (next.length === history.length) return false;
  await writeHistory(next, adminUserId);
  return true;
}

export const DURATION_OPTIONS = ["1 day", "3 days", "1 week", "2 weeks", "1 month", "forever"] as const;
export const FREQUENCY_OPTIONS = ["once", "session", "always"] as const;
