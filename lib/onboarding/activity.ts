"use client";

import { useSyncExternalStore } from "react";

// Shared with overlays outside the onboarding provider (consent and announcements).
const owners = new Set<string>();
const listeners = new Set<() => void>();
export function setOnboardingActivity(owner: string, active: boolean) {
  const previous = owners.size > 0;
  if (active) owners.add(owner); else owners.delete(owner);
  if (previous !== (owners.size > 0)) listeners.forEach((listener) => listener());
}
export function onboardingIsActive() { return owners.size > 0; }
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useOnboardingActivity() {
  return useSyncExternalStore(subscribe, onboardingIsActive, () => false);
}
