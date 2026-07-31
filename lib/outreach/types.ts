// Outreach console types. Hand-written to match migration 048, following the
// repo convention (there are no generated Supabase types in this project).
//
// The four computed values — score, commission_owed, days_since_* and
// is_parked — live on the *View types only. They are produced by
// outreach_creators_view / outreach_channels_view and have no columns, so a
// plain OutreachCreator can never carry a stale hand-typed copy.

export const WAVES = ["A", "B", "C"] as const;
export type Wave = (typeof WAVES)[number];

export const VERIFICATION_STATES = ["no", "partial", "yes"] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const STAGES = ["new", "sent", "replied", "talking", "live", "closed", "hold"] as const;
export type Stage = (typeof STAGES)[number];

export const CHANNEL_STATUSES = ["not started", "running", "done", "dropped"] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

export type ContactChannel = "email" | "wechat" | "dm";

export type OutreachCreator = {
  id: number;
  wave: Wave;
  name: string;
  market: string;
  identity: string;
  positioning: string;
  /** Personal data — an email address or a WeChat ID for a real person. */
  contact: string;
  channel: ContactChannel;
  verified: VerificationState;
  verify_note: string | null;
  partnership: string;
  fit: number;
  reply_odds: number;
  paid_odds: number;
  /** Live in tracking URLs. Never edited through the UI. */
  ref_code: string;
  stage: Stage;
  followed_up: boolean;
  first_sent: string | null;
  reply_date: string | null;
  last_touch: string | null;
  outcome: string | null;
  notes: string | null;
  clicks: number;
  registrations: number;
  paid_count: number;
  revenue_usd: number;
  sources: string[];
};

export type OutreachCreatorView = OutreachCreator & {
  /** 0.45*fit + 0.25*reply_odds + 0.30*paid_odds — computed in SQL. */
  score: number;
  commission_owed: number;
  days_since_last_touch: number | null;
  days_since_first_sent: number | null;
  /** Followed up once, no reply: no action is ever surfaced again. */
  is_parked: boolean;
};

export type OutreachChannel = {
  id: string;
  name: string;
  kind: string;
  first_action: string;
  why: string;
  expected: string;
  cost: string;
  ref_code: string;
  status: ChannelStatus;
  clicks: number;
  registrations: number;
  paid_count: number;
  revenue_usd: number;
};

export type OutreachChannelView = OutreachChannel & {
  commission_owed: number;
};

export type OutreachLogEntry = {
  id: number;
  creator_id: number | null;
  channel_id: string | null;
  entry_date: string;
  action: string | null;
  note: string;
  created_at: string;
};

export type OutreachSettings = {
  commission_rate: number;
  follow_up_days: number;
  attribution_months: number;
  audience_trial_days: number;
  tracking_prefix: string;
  sending_waves: Wave[];
  house_rules: string[];
};

/** The stat columns typed in by hand from Stripe and analytics. */
export type StatField = "clicks" | "registrations" | "paid_count" | "revenue_usd";

/** Fields the console may edit on a creator. Deliberately excludes identity,
 *  positioning, partnership, scores, wave, sources and ref_code — those change
 *  rarely and belong in a migration. */
export type EditableCreatorField =
  | "stage"
  | "followed_up"
  | "first_sent"
  | "reply_date"
  | "last_touch"
  | "outcome"
  | "notes"
  | StatField;

export type QuickAction = "sent" | "followed_up" | "replied";
