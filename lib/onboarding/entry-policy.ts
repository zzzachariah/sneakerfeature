export type EntryIdentity = { loaded: boolean; signedIn: boolean; userId: string | null };
export type EntryRequest = EntryIdentity & { pathname: string };
export type EntryStatus = {
  userId: string | null;
  requiresOnboarding: boolean;
  stage: "welcome" | "profile" | "complete" | null;
  /** Read from the authenticated, persisted persona; undefined means not verified. */
  profileReady?: boolean;
};
export type EntryPhase = "checking" | "intro" | "auth" | "welcome" | "profile" | "complete";

export function hasSeenSiteIntro(value: string | null) {
  return value === "skipped" || value === "completed";
}

/** A response for an earlier account/route must never open a gate. */
export function entryRequestMatches(request: EntryRequest, current: EntryRequest) {
  return request.pathname === current.pathname && request.loaded === current.loaded &&
    request.signedIn === current.signedIn && request.userId === current.userId;
}

export function resolveEntryPhase(identity: EntryIdentity, status: EntryStatus, seenIntro: boolean): EntryPhase {
  if (!identity.loaded || (identity.signedIn && !identity.userId)) return "checking";
  const expectedUser = identity.signedIn ? identity.userId : null;
  // Cookie propagation and auth restoration can finish in different orders.
  // Stay on the website until they agree, rather than showing a false intro.
  if (status.userId !== expectedUser) return "checking";
  if (!status.userId) return seenIntro ? "auth" : "intro";
  if (!status.requiresOnboarding) return "complete";
  // New registrations go straight into the profile. Persisted `profile` now
  // marks the last welcome as pending, but older clients entered that stage
  // before saving anything. Verify the actual persona before showing arrival.
  if (status.stage !== "profile") return "profile";
  if (status.profileReady === undefined) return "checking";
  return status.profileReady ? "welcome" : "profile";
}

export function failedEntryPhase(identity: EntryIdentity, seenIntro: boolean, foreground: boolean): EntryPhase | "error" {
  if (!identity.loaded) return "checking";
  if (identity.signedIn) return foreground ? "error" : "complete";
  return seenIntro ? "auth" : "intro";
}

export function entryPhaseShowsGate(phase: EntryPhase | "boot" | "error") {
  return phase !== "checking" && phase !== "complete";
}
