import { createClient } from "@/lib/supabase/server";
import type {
  OutreachChannelView,
  OutreachCreatorView,
  OutreachLogEntry,
  OutreachSettings
} from "@/lib/outreach/types";

// Every read here goes through the *session-scoped* Supabase client — the anon
// key plus the signed-in admin's cookie — NOT the service-role client the
// sibling admin pages use. Service role bypasses RLS entirely, which would
// make migration 048's policies decorative: one wrong filter and a non-admin
// gets eleven people's email addresses and WeChat IDs. Here the database
// re-checks `profiles.role = 'admin'` on every single statement, so the worst
// case for a bug in this file is an empty page, not a leak.

/** numeric columns arrive as strings over PostgREST; make them numbers once,
 *  at the boundary, so no component has to remember to coerce. */
function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type OutreachData = {
  creators: OutreachCreatorView[];
  channels: OutreachChannelView[];
  settings: OutreachSettings;
  logsByCreator: Record<number, OutreachLogEntry[]>;
  logsByChannel: Record<string, OutreachLogEntry[]>;
};

export async function getOutreachData(): Promise<OutreachData | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const [creatorsRes, channelsRes, settingsRes, logsRes] = await Promise.all([
    supabase.from("outreach_creators_view").select("*").order("id"),
    supabase.from("outreach_channels_view").select("*").order("id"),
    supabase.from("outreach_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("outreach_log").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false })
  ]);

  // A non-admin session satisfies no policy, so these come back empty rather
  // than erroring. Either way there is nothing to render.
  if (!settingsRes.data || creatorsRes.error || channelsRes.error) return null;

  const s = settingsRes.data as Record<string, unknown>;
  const settings: OutreachSettings = {
    commission_rate: num(s.commission_rate, 0.35),
    follow_up_days: num(s.follow_up_days, 5),
    attribution_months: num(s.attribution_months, 12),
    audience_trial_days: num(s.audience_trial_days, 30),
    tracking_prefix: typeof s.tracking_prefix === "string" ? s.tracking_prefix : "",
    sending_waves: Array.isArray(s.sending_waves) ? (s.sending_waves as OutreachSettings["sending_waves"]) : [],
    house_rules: Array.isArray(s.house_rules) ? (s.house_rules as string[]) : []
  };

  const creators: OutreachCreatorView[] = (creatorsRes.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      ...(r as unknown as OutreachCreatorView),
      revenue_usd: num(r.revenue_usd),
      score: num(r.score),
      commission_owed: num(r.commission_owed),
      days_since_last_touch: nullableNum(r.days_since_last_touch),
      days_since_first_sent: nullableNum(r.days_since_first_sent),
      is_parked: r.is_parked === true
    };
  });

  const channels: OutreachChannelView[] = (channelsRes.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      ...(r as unknown as OutreachChannelView),
      revenue_usd: num(r.revenue_usd),
      commission_owed: num(r.commission_owed)
    };
  });

  const logsByCreator: Record<number, OutreachLogEntry[]> = {};
  const logsByChannel: Record<string, OutreachLogEntry[]> = {};
  for (const entry of (logsRes.data ?? []) as OutreachLogEntry[]) {
    if (entry.creator_id !== null) {
      (logsByCreator[entry.creator_id] ??= []).push(entry);
    } else if (entry.channel_id !== null) {
      (logsByChannel[entry.channel_id] ??= []).push(entry);
    }
  }

  return { creators, channels, settings, logsByCreator, logsByChannel };
}
