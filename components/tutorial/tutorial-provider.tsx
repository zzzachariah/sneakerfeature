"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { TUTORIAL_STEPS, isStepAvailable, type TutorialStep } from "@/lib/tutorial/steps";
import { useAuthState } from "@/components/auth/auth-state-provider";

const STORAGE_KEY = "tutorial_completed_v1";
// Separate flag so hiding the launcher pill is its own decision: a visitor can
// dismiss the invitation without ever running (or finishing) the tour.
const LAUNCHER_KEY = "tutorial_launcher_dismissed_v1";
// Marks the one re-offer a visitor gets after signing up / signing in, so the
// pill can come back at the moment the tour is finally worth taking — but only
// that once, no matter how often they sign in and out.
const SIGNIN_OFFER_KEY = "tutorial_signin_offer_v1";

type TutorialContextValue = {
  active: boolean;
  stepIndex: number;
  totalSteps: number;
  steps: TutorialStep[];
  start: () => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
  goTo: (index: number) => void;
  /** Whether the "take the tour" pill should be offered right now. */
  launcherVisible: boolean;
  /** Hide the pill for good on this device. */
  dismissLauncher: () => void;
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

// Only the steps whose target is actually present on this device/page, so the
// tour never lands on a hidden control (e.g. desktop-only navbar icons on phones).
function computeSteps(): TutorialStep[] {
  const filtered = TUTORIAL_STEPS.filter(isStepAvailable);
  return filtered.length ? filtered : TUTORIAL_STEPS;
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [steps, setSteps] = useState<TutorialStep[]>(TUTORIAL_STEPS);
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  // The tour is opt-in: nothing ever opens it on its own. A first-time visitor
  // is offered a dismissible pill (TutorialLauncher) and the "Site tour" menu
  // entry; both call `start`.
  const [launcherVisible, setLauncherVisible] = useState(false);

  const { signedIn, loaded } = useAuthState();
  // Baseline captured the first time auth resolves, so an already-signed-in
  // user opening the app isn't mistaken for a fresh sign-up.
  const baselineSignedInRef = useRef<boolean | null>(null);

  const persistDone = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  const dismissLauncher = useCallback(() => {
    setLauncherVisible(false);
    try {
      window.localStorage.setItem(LAUNCHER_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  const begin = useCallback(() => {
    const resolved = computeSteps();
    stepsRef.current = resolved;
    setSteps(resolved);
    setStepIndex(0);
    setActive(true);
  }, []);

  const start = useCallback(() => {
    // Taking the tour retires the invitation, however the tour ends.
    dismissLauncher();
    begin();
  }, [begin, dismissLauncher]);

  const stop = useCallback(() => {
    setActive(false);
    persistDone();
  }, [persistDone]);

  const next = useCallback(() => {
    setStepIndex((i) => {
      const nextIdx = i + 1;
      if (nextIdx >= stepsRef.current.length) {
        setActive(false);
        persistDone();
        return i;
      }
      return nextIdx;
    });
  }, [persistDone]);

  const prev = useCallback(() => {
    setStepIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= stepsRef.current.length) return;
    setStepIndex(index);
  }, []);

  // Offer the pill once per device: never after it's been dismissed, and never
  // to someone who has already been through the tour. Decided on the client
  // after mount so the server render and the first paint agree.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(LAUNCHER_KEY)) return;
      if (window.localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }
    setLauncherVisible(true);
  }, []);

  // Signing up is the point where the tour actually pays off (the profile it
  // ends on is saved to the account), so bring the pill back once for someone
  // who dismissed it while signed out. Still an offer, never an auto-open.
  useEffect(() => {
    if (!loaded) return;
    if (baselineSignedInRef.current === null) {
      baselineSignedInRef.current = signedIn;
      return;
    }
    if (!signedIn) {
      baselineSignedInRef.current = false;
      return;
    }
    if (baselineSignedInRef.current) return;
    baselineSignedInRef.current = true;
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) return;
      if (window.localStorage.getItem(SIGNIN_OFFER_KEY)) return;
      window.localStorage.setItem(SIGNIN_OFFER_KEY, "1");
      window.localStorage.removeItem(LAUNCHER_KEY);
    } catch {
      return;
    }
    setLauncherVisible(true);
  }, [loaded, signedIn]);

  const value = useMemo<TutorialContextValue>(
    () => ({
      active,
      stepIndex,
      totalSteps: steps.length,
      steps,
      start,
      next,
      prev,
      stop,
      goTo,
      launcherVisible,
      dismissLauncher
    }),
    [active, stepIndex, steps, start, next, prev, stop, goTo, launcherVisible, dismissLauncher]
  );

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial must be used inside TutorialProvider");
  return ctx;
}
