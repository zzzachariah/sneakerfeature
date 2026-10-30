import assert from "node:assert/strict";
import {
  entryPhaseShowsGate, entryRequestMatches, failedEntryPhase,
  hasSeenSiteIntro, resolveEntryPhase, type EntryIdentity, type EntryRequest,
} from "../lib/onboarding/entry-policy.ts";

const loading: EntryIdentity = { loaded: false, signedIn: false, userId: null };
const anonymous: EntryIdentity = { loaded: true, signedIn: false, userId: null };
const member: EntryIdentity = { loaded: true, signedIn: true, userId: "member-a" };
const guestStatus = { userId: null, requiresOnboarding: false, stage: null } as const;
const memberStatus = { userId: "member-a", requiresOnboarding: false, stage: "complete" } as const;

assert.equal(entryPhaseShowsGate("checking"), false, "normal website remains interactive during restoration");
assert.equal(resolveEntryPhase(loading, guestStatus, false), "checking", "no anonymous intro before auth.loaded");
assert.equal(resolveEntryPhase(member, memberStatus, false), "complete", "old member needs no local intro flag");
assert.equal(resolveEntryPhase(anonymous, guestStatus, false), "intro", "a genuine first visit is not silently skipped");
assert.equal(resolveEntryPhase(anonymous, guestStatus, true), "auth", "seen intro resumes required registration");
assert.equal(resolveEntryPhase(member, guestStatus, false), "checking", "stale anonymous response cannot open intro after login");
assert.equal(resolveEntryPhase(anonymous, memberStatus, false), "checking", "wait for client identity when server cookie restores first");
assert.equal(resolveEntryPhase(member, { ...memberStatus, userId: "member-b" }, true), "checking", "another account cannot supply the current profile");
assert.equal(resolveEntryPhase(member, { ...memberStatus, requiresOnboarding: true, stage: "welcome" }, false), "profile", "new signup enters the profile before its final welcome");
assert.equal(resolveEntryPhase(member, { ...memberStatus, requiresOnboarding: true, stage: "welcome", profileReady: true }, false), "profile", "a saved persona without the profile transition still resumes its confirmation step");
assert.equal(resolveEntryPhase(member, { ...memberStatus, requiresOnboarding: true, stage: "profile", profileReady: true }, false), "welcome", "saved profile resumes final arrival after refresh, without marking onboarding complete");
assert.equal(resolveEntryPhase(member, { ...memberStatus, requiresOnboarding: true, stage: "profile", profileReady: true }, true), "welcome", "intro completion does not bypass the final welcome");
assert.equal(resolveEntryPhase(member, { ...memberStatus, requiresOnboarding: true, stage: "profile", profileReady: false }, false), "profile", "old clients may have entered profile before saving a valid persona");
assert.equal(resolveEntryPhase(member, { ...memberStatus, requiresOnboarding: true, stage: "profile" }, false), "checking", "unknown/read-failed persona readiness must not look like saved or missing data");
assert.equal(resolveEntryPhase(member, { ...memberStatus, profileReady: false }, false), "complete", "completed accounts never need a persona read or a repeated final welcome");
assert.equal(resolveEntryPhase(member, { ...memberStatus, userId: "member-b", requiresOnboarding: true, stage: "profile", profileReady: true }, true), "checking", "a different account's saved persona cannot open this account's arrival");
assert.equal(resolveEntryPhase(anonymous, { ...memberStatus, requiresOnboarding: true, stage: "profile", profileReady: true }, true), "checking", "late saved-persona responses cannot open arrival after sign-out");
assert.equal(resolveEntryPhase(loading, { ...memberStatus, requiresOnboarding: true, stage: "profile", profileReady: true }, false), "checking", "profile readiness cannot bypass identity restoration");
assert.equal(failedEntryPhase(member, false, false), "complete", "background failure never replaces a member's website with a gate");
assert.equal(failedEntryPhase(member, false, true), "error", "explicit registration recovery keeps actionable errors");
assert.equal(failedEntryPhase(anonymous, false, false), "intro", "anonymous first visit remains usable while status is unavailable");
assert.equal(failedEntryPhase(loading, false, false), "checking", "an unresolved identity never falls back to intro");
assert.equal(hasSeenSiteIntro("completed"), true);
assert.equal(hasSeenSiteIntro("skipped"), true);
assert.equal(hasSeenSiteIntro(null), false);
assert.equal(hasSeenSiteIntro("checking"), false, "temporary checks are not completion markers");

const started: EntryRequest = { ...anonymous, pathname: "/" };
assert.equal(entryRequestMatches(started, { ...started }), true);
assert.equal(entryRequestMatches(started, { ...member, pathname: "/" }), false, "late guest request is rejected after sign-in");
assert.equal(entryRequestMatches(started, { ...started, pathname: "/shoes/shared" }), false, "late homepage request is rejected on public details");
assert.equal(entryRequestMatches({ ...member, pathname: "/" }, { ...member, userId: "member-b", pathname: "/" }), false);

console.log("Onboarding entry: identity, restoration, profile-readiness, arrival-resume, stale-response, recovery and first-visit checks passed.");
