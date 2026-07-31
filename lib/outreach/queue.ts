// The domain rules that make this not a generic CRM.
//
// Pure functions over the view rows, so the same logic decides what the "Do
// Next" queue shows AND which affordances a creator card is allowed to render.
// If a creator can't produce a send action here, no send button exists for them
// anywhere — that's the point. (The database enforces the same two gates inside
// outreach_mark_sent(); this layer decides what to *offer*, that one refuses to
// be lied to.)

import type {
  OutreachChannelView,
  OutreachCreatorView,
  OutreachSettings
} from "@/lib/outreach/types";

export const ACTION_TYPES = ["verify", "send", "follow", "nudge", "parked"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export type QueueLine = {
  creator: OutreachCreatorView;
  action: ActionType;
  /** Days that matter for this action type — elapsed since the relevant date. */
  elapsedDays: number | null;
  /** Why this line exists, in one phrase. Rendered next to the name. */
  reason: string;
};

/** Rule 1 + rule 3: verification gates sending, waves gate who is contacted.
 *  Both must hold before a send affordance may exist. */
export function canSend(creator: OutreachCreatorView, settings: OutreachSettings): boolean {
  if (creator.verified !== "yes") return false;
  if (!settings.sending_waves.includes(creator.wave)) return false;
  if (creator.is_parked) return false;
  // Already sent, or deliberately parked at "hold" / finished at "closed".
  if (creator.first_sent !== null) return false;
  return creator.stage !== "hold" && creator.stage !== "closed";
}

/** Rule 2: exactly one follow-up, and only after the window has elapsed. */
export function canFollowUp(creator: OutreachCreatorView, settings: OutreachSettings): boolean {
  if (creator.first_sent === null) return false;
  if (creator.followed_up) return false;
  if (creator.reply_date !== null) return false;
  if (creator.stage === "closed") return false;
  // A record that has already moved past "sent" is in conversation, not waiting.
  if (["replied", "talking", "live"].includes(creator.stage)) return false;
  const elapsed = creator.days_since_first_sent;
  return elapsed !== null && elapsed >= settings.follow_up_days;
}

/** Rule 4's fourth tier: a live conversation that has gone quiet. */
export function needsNudge(creator: OutreachCreatorView, settings: OutreachSettings): boolean {
  if (!["replied", "talking"].includes(creator.stage)) return false;
  const elapsed = creator.days_since_last_touch;
  return elapsed !== null && elapsed >= settings.follow_up_days;
}

/** Rule 4: at most ONE line per creator, in priority order.
 *
 *  `is_parked` is evaluated first even though it sorts last, because parked is
 *  terminal: "no further action ever surfaced". It suppresses everything else
 *  rather than competing with it. */
export function actionFor(
  creator: OutreachCreatorView,
  settings: OutreachSettings
): ActionType | null {
  if (creator.is_parked) return "parked";
  if (creator.verified !== "yes") return "verify";
  if (canSend(creator, settings)) return "send";
  if (canFollowUp(creator, settings)) return "follow";
  if (needsNudge(creator, settings)) return "nudge";
  return null;
}

const ACTION_ORDER: Record<ActionType, number> = {
  verify: 0,
  send: 1,
  follow: 2,
  nudge: 3,
  parked: 4
};

function elapsedFor(creator: OutreachCreatorView, action: ActionType): number | null {
  switch (action) {
    case "follow":
      return creator.days_since_first_sent;
    case "nudge":
    case "parked":
      return creator.days_since_last_touch;
    default:
      return null;
  }
}

function reasonFor(
  creator: OutreachCreatorView,
  action: ActionType,
  settings: OutreachSettings
): string {
  switch (action) {
    case "verify":
      return creator.verify_note?.trim()
        ? creator.verify_note.trim()
        : creator.verified === "partial"
          ? "Partially verified — confirm the rest before sending"
          : "Contact not confirmed on a public page";
    case "send":
      return `Verified · wave ${creator.wave} is sending`;
    case "follow":
      return `No reply ${creator.days_since_first_sent}d after first send (window ${settings.follow_up_days}d)`;
    case "nudge":
      return `${creator.stage} · quiet for ${creator.days_since_last_touch}d`;
    case "parked":
      return "Followed up once, no reply — parked for good";
  }
}

/** Build the ordered queue. Grouped by action type, then by computed score
 *  descending inside each group, so the highest-value work sits at the top of
 *  the group it belongs to. */
export function buildQueue(
  creators: OutreachCreatorView[],
  settings: OutreachSettings
): QueueLine[] {
  const lines: QueueLine[] = [];
  for (const creator of creators) {
    const action = actionFor(creator, settings);
    if (!action) continue;
    lines.push({
      creator,
      action,
      elapsedDays: elapsedFor(creator, action),
      reason: reasonFor(creator, action, settings)
    });
  }
  return lines.sort((a, b) => {
    const order = ACTION_ORDER[a.action] - ACTION_ORDER[b.action];
    if (order !== 0) return order;
    return b.creator.score - a.creator.score;
  });
}

/** Mirror of outreach_creators_view.is_parked, for optimistic updates only.
 *  The view is the source of truth — this exists so a card can grey itself the
 *  instant "followed up today" is pressed instead of waiting for the round
 *  trip, and the refresh that follows overwrites it with the SQL answer. Keep
 *  the two definitions identical. */
export function deriveIsParked(creator: {
  followed_up: boolean;
  reply_date: string | null;
  stage: string;
}): boolean {
  return (
    creator.followed_up &&
    creator.reply_date === null &&
    !["replied", "talking", "live", "closed"].includes(creator.stage)
  );
}

export type Funnel = {
  sent: number;
  replies: number;
  clicks: number;
  registrations: number;
  paid: number;
  /** registrations → paid, as a percentage. null when nobody has registered. */
  regToPaidPct: number | null;
  revenue: number;
  commissionOwed: number;
};

/** Creators and channels combined — the whole outreach effort in one row. */
export function buildFunnel(
  creators: OutreachCreatorView[],
  channels: OutreachChannelView[],
  settings: OutreachSettings
): Funnel {
  const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

  const clicks = sum(creators.map((c) => c.clicks)) + sum(channels.map((c) => c.clicks));
  const registrations =
    sum(creators.map((c) => c.registrations)) + sum(channels.map((c) => c.registrations));
  const paid = sum(creators.map((c) => c.paid_count)) + sum(channels.map((c) => c.paid_count));
  const revenue = sum(creators.map((c) => c.revenue_usd)) + sum(channels.map((c) => c.revenue_usd));

  return {
    // "Sent" and "replies" are creator-only concepts; a growth channel has a
    // status, not a conversation.
    sent: creators.filter((c) => c.first_sent !== null).length,
    replies: creators.filter((c) => c.reply_date !== null).length,
    clicks,
    registrations,
    paid,
    regToPaidPct: registrations > 0 ? (paid / registrations) * 100 : null,
    revenue,
    // Recomputed here rather than summing the per-row commission_owed so the
    // total can't drift from the rate if a row is stale.
    commissionOwed: revenue * settings.commission_rate
  };
}

/** The full tracking URL for a ref code, e.g. for copying into a DM. */
export function trackingUrl(settings: OutreachSettings, refCode: string): string {
  return `${settings.tracking_prefix}${refCode}`;
}
