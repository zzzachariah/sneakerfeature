import type { OnboardingPageviews } from "./server-contract";

/** Serverless instances have independent caches; an older one must not rewind the UI. */
export function reconcilePageviews(previous: OnboardingPageviews | undefined, incoming: OnboardingPageviews): OnboardingPageviews {
  if (previous?.total == null || !previous.asOf) return incoming;
  const stalePrevious = (): OnboardingPageviews => ({ ...previous, status: "stale", snapshot: true });
  if (incoming.total === null || !incoming.asOf) return stalePrevious();
  if (Date.parse(incoming.asOf) < Date.parse(previous.asOf)) {
    // Preserve the newest known value/time, but still disclose a failed poll.
    return incoming.status === "live" ? previous : stalePrevious();
  }
  // A newer Vercel reading is authoritative even if its total was corrected
  // downwards. Taking max(total) would silently fabricate the current count.
  return incoming;
}
