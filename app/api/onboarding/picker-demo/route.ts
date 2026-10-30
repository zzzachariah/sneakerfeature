import { after } from "next/server";
import { demoInputSchema } from "@/lib/onboarding/picker-demo-contract";
import { demoVisitor, readDemo, reserveDemo } from "@/lib/onboarding/server-picker-demo";
import { onboardingJson, onboardingError, OnboardingError, requireSameOrigin, readSmallJson } from "@/lib/onboarding/server";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function GET(request: Request) {
  try { const {visitor} = await demoVisitor(request); return onboardingJson(await readDemo(visitor)); }
  catch(error) { return onboardingError(error); }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = demoInputSchema.safeParse(await readSmallJson(request));
    if (!input.success) throw new OnboardingError("invalid_request", "Choose two positions, three priorities and two shoes.",400);
    const {visitor,network} = await demoVisitor(request);
    const reservation = await reserveDemo(visitor,network,input.data);
    if (reservation.run) after(reservation.run);
    return onboardingJson(reservation.snapshot, reservation.run ? 202 : 200);
  } catch(error) { return onboardingError(error); }
}
