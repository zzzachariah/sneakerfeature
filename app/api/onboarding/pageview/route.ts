import { isExcludedPageview, onboardingPageviewSchema } from "@/lib/onboarding/server-contract";
import {
  onboardingError, onboardingJson, OnboardingError, readSmallJson,
  recordOnboardingPageview, requireSameOrigin
} from "@/lib/onboarding/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = onboardingPageviewSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) throw new OnboardingError("invalid_request", "A visit ID and accepted analytics consent are required.", 400);
    if (isExcludedPageview(request)) return onboardingJson({ ok: true, recorded: false, ordinal: null, startedAt: null });
    return onboardingJson(await recordOnboardingPageview(request, parsed.data.eventId));
  } catch (error) { return onboardingError(error); }
}
