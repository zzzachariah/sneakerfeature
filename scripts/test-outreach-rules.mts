// Domain rules for the outreach console — the ones that make it not a generic
// CRM. Pure functions, no database, no env: runnable any time.
//
//   npx tsx scripts/test-outreach-rules.mts
//
// The RLS half of the story (an anonymous client reads zero rows) lives in
// scripts/test-outreach-rls.mts, which needs a real project to talk to.

import {
  actionFor,
  buildFunnel,
  buildQueue,
  canFollowUp,
  canSend,
  deriveIsParked,
  needsNudge
} from "../lib/outreach/queue";
import type {
  OutreachChannelView,
  OutreachCreatorView,
  OutreachSettings
} from "../lib/outreach/types";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`, extra ?? "");
  }
}

const settings: OutreachSettings = {
  commission_rate: 0.35,
  follow_up_days: 5,
  attribution_months: 12,
  audience_trial_days: 30,
  tracking_prefix: "https://snkrfeature.com/?utm_content=",
  sending_waves: ["A"],
  house_rules: []
};

function creator(over: Partial<OutreachCreatorView> = {}): OutreachCreatorView {
  const base: OutreachCreatorView = {
    id: 1,
    wave: "A",
    name: "Test Creator",
    market: "Global / English",
    identity: "",
    positioning: "",
    contact: "someone@example.com",
    channel: "email",
    verified: "yes",
    verify_note: null,
    partnership: "",
    fit: 5,
    reply_odds: 4,
    paid_odds: 4,
    ref_code: "test",
    stage: "new",
    followed_up: false,
    first_sent: null,
    reply_date: null,
    last_touch: null,
    outcome: null,
    notes: null,
    clicks: 0,
    registrations: 0,
    paid_count: 0,
    revenue_usd: 0,
    sources: [],
    score: 4.45,
    commission_owed: 0,
    days_since_last_touch: null,
    days_since_first_sent: null,
    is_parked: false
  };
  const merged = { ...base, ...over };
  // Keep the fixture honest: is_parked is derived in SQL, so a test can't hand
  // itself an impossible row unless it sets is_parked explicitly.
  if (!("is_parked" in over)) merged.is_parked = deriveIsParked(merged);
  return merged;
}

console.log("Rule 1 — verification gates sending:");
for (const state of ["no", "partial"] as const) {
  const c = creator({ verified: state });
  check(`verified='${state}' produces no send`, !canSend(c, settings));
  check(`verified='${state}' produces a verify line`, actionFor(c, settings) === "verify");
}
check("verified='yes' in a sending wave can send", canSend(creator(), settings));

console.log("\nRule 3 — waves gate who is contacted:");
check(
  "wave C produces no send even when verified",
  !canSend(creator({ wave: "C", verified: "yes" }), settings)
);
check(
  "wave B produces no send while only A is sending",
  !canSend(creator({ wave: "B", verified: "yes" }), settings)
);
check(
  "wave C verified creator produces NO queue line at all",
  actionFor(creator({ wave: "C", verified: "yes" }), settings) === null
);
check(
  "adding C to sending_waves unlocks it",
  canSend(creator({ wave: "C" }), { ...settings, sending_waves: ["A", "C"] })
);

console.log("\nRule 2 — one follow-up, then stop:");
const sent4d = creator({ stage: "sent", first_sent: "2026-07-27", days_since_first_sent: 4 });
check("no follow-up before the window elapses", !canFollowUp(sent4d, settings));
const sent5d = creator({ stage: "sent", first_sent: "2026-07-26", days_since_first_sent: 5 });
check("follow-up appears at exactly follow_up_days", canFollowUp(sent5d, settings));
check("…and it is the queue line", actionFor(sent5d, settings) === "follow");

const parked = creator({
  stage: "sent",
  first_sent: "2026-07-01",
  days_since_first_sent: 30,
  days_since_last_touch: 25,
  followed_up: true
});
check("followed up + no reply = parked", parked.is_parked);
check("parked produces no follow-up", !canFollowUp(parked, settings));
check("parked produces no send", !canSend(parked, settings));
check("parked's only line is informational", actionFor(parked, settings) === "parked");

const repliedAfterFollow = creator({
  stage: "replied",
  first_sent: "2026-07-01",
  reply_date: "2026-07-20",
  days_since_last_touch: 1,
  followed_up: true
});
check("a reply un-parks the record", !repliedAfterFollow.is_parked);

console.log("\nRule 4 — one action per creator, in priority order:");
const priority = [
  { name: "verify wins over everything", c: creator({ verified: "no" }), want: "verify" },
  { name: "send when verified and unsent", c: creator(), want: "send" },
  {
    name: "follow when the window has passed",
    c: creator({ stage: "sent", first_sent: "2026-07-20", days_since_first_sent: 11 }),
    want: "follow"
  },
  {
    name: "nudge a quiet conversation",
    c: creator({ stage: "talking", first_sent: "2026-07-01", reply_date: "2026-07-10", days_since_last_touch: 8 }),
    want: "nudge"
  },
  { name: "parked is terminal", c: parked, want: "parked" }
] as const;
for (const p of priority) {
  check(p.name, actionFor(p.c, settings) === p.want, actionFor(p.c, settings));
}
check(
  "a fresh conversation produces no line",
  actionFor(
    creator({ stage: "talking", first_sent: "2026-07-25", reply_date: "2026-07-30", days_since_last_touch: 1 }),
    settings
  ) === null
);
check(
  "nudge only applies to replied/talking",
  !needsNudge(creator({ stage: "live", days_since_last_touch: 40 }), settings)
);

console.log("\nQueue assembly:");
const roster = [
  creator({ id: 1, name: "Unverified A", verified: "no", score: 4.45 }),
  creator({ id: 2, name: "Unverified B", verified: "no", score: 4.7 }),
  creator({ id: 3, name: "Ready to send", score: 4.0 }),
  creator({ id: 4, name: "Wave C verified", wave: "C", score: 4.2 }),
  { ...parked, id: 5, name: "Parked" },
  creator({
    id: 6,
    name: "Due a follow-up",
    stage: "sent",
    first_sent: "2026-07-20",
    days_since_first_sent: 11,
    score: 3.7
  })
];
const queue = buildQueue(roster, settings);
check("one line per creator, at most", queue.length === new Set(queue.map((l) => l.creator.id)).size);
check("wave C verified contributes no line", !queue.some((l) => l.creator.id === 4), queue.map((l) => l.creator.id));
check(
  "ordered verify → send → follow → parked",
  queue.map((l) => l.action).join(",") === "verify,verify,send,follow,parked",
  queue.map((l) => l.action)
);
check(
  "inside a group, higher score first",
  queue[0].creator.name === "Unverified B" && queue[1].creator.name === "Unverified A",
  queue.slice(0, 2).map((l) => l.creator.name)
);
check("no send line exists for any unverified creator, anywhere",
  !queue.some((l) => l.action === "send" && l.creator.verified !== "yes"));

console.log("\nFunnel:");
const channels: OutreachChannelView[] = [
  {
    id: "C1",
    name: "Reddit",
    kind: "Community",
    first_action: "",
    why: "",
    expected: "",
    cost: "0",
    ref_code: "reddit_bballshoes",
    status: "running",
    clicks: 300,
    registrations: 30,
    paid_count: 3,
    revenue_usd: 60,
    commission_owed: 21
  }
];
const funnelRoster = [
  creator({ id: 1, first_sent: "2026-07-01", reply_date: "2026-07-05", clicks: 100, registrations: 20, paid_count: 2, revenue_usd: 40 }),
  creator({ id: 2, first_sent: "2026-07-02", clicks: 50, registrations: 0, paid_count: 0, revenue_usd: 0 }),
  creator({ id: 3 })
];
const funnel = buildFunnel(funnelRoster, channels, settings);
check("sent counts creators with a first_sent", funnel.sent === 2, funnel.sent);
check("replies count creators with a reply_date", funnel.replies === 1, funnel.replies);
check("clicks combine creators and channels", funnel.clicks === 450, funnel.clicks);
check("signups combine both", funnel.registrations === 50, funnel.registrations);
check("paid combines both", funnel.paid === 5, funnel.paid);
check("reg→paid %", funnel.regToPaidPct === 10, funnel.regToPaidPct);
check("revenue combines both", funnel.revenue === 100, funnel.revenue);
check("commission owed = revenue × 0.35", funnel.commissionOwed === 35, funnel.commissionOwed);
check(
  "reg→paid is null rather than NaN with no signups",
  buildFunnel([creator()], [], settings).regToPaidPct === null
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
