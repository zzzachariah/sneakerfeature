import { onboardingPatchSchema } from "@/lib/onboarding/server-contract";
import {
  getOnboardingStatus, onboardingContext, onboardingError, onboardingJson,
  OnboardingError, patchOnboardingStatus, readSmallJson, requireSameOrigin
} from "@/lib/onboarding/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return onboardingJson(await getOnboardingStatus(await onboardingContext()));
  } catch (error) { return onboardingError(error); }
}

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = onboardingPatchSchema.safeParse(await readSmallJson(request));
    if (!parsed.success) throw new OnboardingError("invalid_request", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    return onboardingJson(await patchOnboardingStatus(await onboardingContext(true), parsed.data));
  } catch (error) { return onboardingError(error); }
}
