import { z } from "zod";

export const onboardingPatchSchema = z.object({
  stage: z.enum(["profile", "complete"]).optional(),
  tour: z.enum(["site", "ai"]).optional(),
  status: z.enum(["skipped", "completed"]).optional()
}).strict().refine((v) => (v.tour === undefined) === (v.status === undefined), {
  message: "Choose both a tutorial and its result."
}).refine((v) => v.stage !== undefined || v.tour !== undefined, {
  message: "Choose an onboarding update."
});

export const onboardingPageviewSchema = z.object({
  eventId: z.string().uuid(),
  // Consent is currently kept in localStorage, not an authenticated cookie.
  // The caller must check the existing provider (including native blocking).
  // Requiring this explicit assertion also rejects old/unconsented callers.
  consent: z.literal("accepted")
}).strict();

export const onboardingRecoverySchema = z.object({
  username: z.string().trim().min(3).max(80)
}).strict();

export type OnboardingPatch = z.infer<typeof onboardingPatchSchema>;
export type TutorialResult = "skipped" | "completed" | null;
export type OnboardingMember = {
  userId: string;
  username: string | null;
  memberNumber: number;
  requiresOnboarding: boolean;
  stage: "welcome" | "profile" | "complete";
  tours: { site: TutorialResult; ai: TutorialResult };
};

export type OnboardingPageviews = {
  total: number | null;
  /** When Vercel was actually read, never the API's rounded future until. */
  asOf: string | null;
  source: "vercel";
  since: string | null;
  rangeThrough: string | null;
  status: "live" | "stale" | "snapshot" | "unavailable";
  snapshot: boolean;
};

export const UNAVAILABLE_VERCEL_PAGEVIEWS: OnboardingPageviews = {
  total: null,
  since: null,
  asOf: null,
  rangeThrough: null,
  source: "vercel",
  status: "unavailable",
  snapshot: true
};

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site" || fetchSite === "same-site") return false;
  if (!origin) return fetchSite === "same-origin";
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function isExcludedPageview(request: Request): boolean {
  const purpose = `${request.headers.get("purpose") ?? ""} ${request.headers.get("sec-purpose") ?? ""}`;
  const agent = request.headers.get("user-agent") ?? "";
  return /prefetch|prerender/i.test(purpose) || request.headers.has("next-router-prefetch") ||
    /bot\b|crawler|spider|slurp|facebookexternalhit|headlesschrome/i.test(agent) ||
    request.headers.get("x-sf-platform") === "ios";
}

export function safePositiveInteger(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function safeCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
