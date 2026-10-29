import { getLiveOnboardingMetrics, onboardingError, onboardingJson } from "@/lib/onboarding/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return onboardingJson(await getLiveOnboardingMetrics());
  } catch (error) { return onboardingError(error); }
}
