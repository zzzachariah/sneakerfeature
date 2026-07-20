// Pure helpers for the shoe closet / rotation manager: cushion-life decay,
// retirement status and cost-per-wear. Kept free of DB/React dependencies so
// both the API routes and the UI read the same numbers.

// A hooper's midsole is typically cooked after ~300 on-court hours (roughly a
// year of 3×2h weekly runs). A deliberately simple, transparent model — the UI
// presents it as an estimate, never a verdict.
export const CUSHION_LIFE_HOURS = 300;

export type WearStatus = "fresh" | "broken_in" | "aging" | "retire";

export type ClosetItemRow = {
  user_id?: string;
  shoe_id: string;
  size_label: string | null;
  purchase_price: number | null;
  purchased_at: string | null;
  play_hours: number;
  sessions: number;
  retired: boolean;
  retired_at: string | null;
  created_at: string;
  updated_at?: string;
};

export type WearLogRow = {
  id: string;
  shoe_id: string;
  hours: number;
  note: string | null;
  played_at: string;
  created_at: string;
};

/** 0..1+ share of the estimated cushion life already used. */
export function wearRatio(playHours: number): number {
  if (!Number.isFinite(playHours) || playHours <= 0) return 0;
  return playHours / CUSHION_LIFE_HOURS;
}

export function wearStatus(playHours: number): WearStatus {
  const r = wearRatio(playHours);
  if (r < 0.35) return "fresh";
  if (r < 0.7) return "broken_in";
  if (r < 0.9) return "aging";
  return "retire";
}

export const WEAR_STATUS_LABEL: Record<WearStatus, string> = {
  fresh: "Fresh",
  broken_in: "Broken in",
  aging: "Aging",
  retire: "Time to retire"
};

/** Whether the closet list should surface a retirement nudge for this item. */
export function shouldNudgeRetirement(item: Pick<ClosetItemRow, "play_hours" | "retired">): boolean {
  return !item.retired && wearStatus(item.play_hours) === "retire";
}

/** Price per session; null when the price or sessions are missing. */
export function costPerSession(item: Pick<ClosetItemRow, "purchase_price" | "sessions">): number | null {
  if (item.purchase_price == null || item.purchase_price <= 0 || item.sessions <= 0) return null;
  return item.purchase_price / item.sessions;
}

/** Price per on-court hour; null when the price or hours are missing. */
export function costPerHour(item: Pick<ClosetItemRow, "purchase_price" | "play_hours">): number | null {
  if (item.purchase_price == null || item.purchase_price <= 0 || item.play_hours <= 0) return null;
  return item.purchase_price / item.play_hours;
}

// Free members can register a taste of the closet; the full rotation is a paid
// perk. Server-enforced in app/api/closet/route.ts, mirrored in the UI.
export const FREE_CLOSET_LIMIT = 3;

// --- Max analytics ----------------------------------------------------------

export type MonthlyWear = { month: string; hours: number; sessions: number };

/** Aggregate wear logs into per-month totals (last `months`, oldest first). */
export function monthlyWear(logs: WearLogRow[], months = 6, now = new Date()): MonthlyWear[] {
  const buckets = new Map<string, MonthlyWear>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, { month: key, hours: 0, sessions: 0 });
  }
  for (const log of logs) {
    const key = log.played_at.slice(0, 7);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.hours += log.hours;
    bucket.sessions += 1;
  }
  return Array.from(buckets.values());
}
