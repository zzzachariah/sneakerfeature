import { onboardingRecoverySchema } from "@/lib/onboarding/server-contract";
import {
  onboardingContext, onboardingError, onboardingJson, OnboardingError,
  readSmallJson, recoverOnboardingProfile, requireSameOrigin
} from "@/lib/onboarding/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = onboardingRecoverySchema.safeParse(await readSmallJson(request));
    if (!parsed.success) throw new OnboardingError("invalid_request", "Choose a username between 3 and 80 characters.", 400);
    return onboardingJson(await recoverOnboardingProfile(await onboardingContext(true), parsed.data.username));
  } catch (error) { return onboardingError(error); }
}
