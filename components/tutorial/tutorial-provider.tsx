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
import { TUTORIAL_STEPS } from "@/lib/tutorial/steps";
import { useAuthState } from "@/components/auth/auth-state-provider";

const STORAGE_KEY = "tutorial_completed_v1";

type TutorialContextValue = {
  active: boolean;
  stepIndex: number;
  totalSteps: number;
  start: (fromIntro?: boolean) => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
  goTo: (index: number) => void;
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const { signedIn, loaded } = useAuthState();
  // Baseline captured the first time auth resolves so an already-signed-in
  // user opening the app doesn't re-trigger the tour on every visit.
  const baselineSignedInRef = useRef<boolean | null>(null);

  const persistDone = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const stop = useCallback(() => {
    setActive(false);
    persistDone();
  }, [persistDone]);

  const next = useCallback(() => {
    setStepIndex((i) => {
      const nextIdx = i + 1;
      if (nextIdx >= TUTORIAL_STEPS.length) {
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
    if (index < 0 || index >= TUTORIAL_STEPS.length) return;
    setStepIndex(index);
  }, []);

  useEffect(() => {
    if (!loaded) return;

    if (baselineSignedInRef.current === null) {
      baselineSignedInRef.current = signedIn;
      return;
    }

    if (!baselineSignedInRef.current && signedIn) {
      baselineSignedInRef.current = true;
      let completed: string | null = null;
      try {
        completed = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        return;
      }
      if (completed) return;
      const t = window.setTimeout(() => {
        setStepIndex(0);
        setActive(true);
      }, 650);
      return () => window.clearTimeout(t);
    }

    if (!signedIn) {
      baselineSignedInRef.current = false;
    }
  }, [signedIn, loaded]);

  const value = useMemo<TutorialContextValue>(
    () => ({
      active,
      stepIndex,
      totalSteps: TUTORIAL_STEPS.length,
      start,
      next,
      prev,
      stop,
      goTo
    }),
    [active, stepIndex, start, next, prev, stop, goTo]
  );

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial must be used inside TutorialProvider");
  return ctx;
}
