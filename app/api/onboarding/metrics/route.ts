import { getLiveOnboardingMetrics, onboardingError, onboardingJson } from "@/lib/onboarding/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    // A Vercel outage is represented by pageviews.status; catalogue/account
    // counts can still succeed, with their own independent source timestamps.
    return onboardingJson(await getLiveOnboardingMetrics());
  } catch (error) { return onboardingError(error); }
}
