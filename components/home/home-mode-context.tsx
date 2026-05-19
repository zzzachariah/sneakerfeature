"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

export type HomeMode = "browse" | "personalized";

type HomeModeContextValue = {
  mode: HomeMode;
  setMode: (m: HomeMode) => void;
};

const HomeModeContext = createContext<HomeModeContextValue | null>(null);

export function HomeModeProvider({
  children,
  defaultMode = "browse"
}: {
  children: React.ReactNode;
  defaultMode?: HomeMode;
}) {
  const [mode, setMode] = useState<HomeMode>(defaultMode);
  const userTouchedRef = useRef(false);

  useEffect(() => {
    if (userTouchedRef.current) return;
    if (defaultMode === "personalized") setMode("personalized");
  }, [defaultMode]);

  const setModeAndTouch = (m: HomeMode) => {
    userTouchedRef.current = true;
    setMode(m);
  };

  return (
    <HomeModeContext.Provider value={{ mode, setMode: setModeAndTouch }}>{children}</HomeModeContext.Provider>
  );
}

export function useHomeMode() {
  const ctx = useContext(HomeModeContext);
  if (!ctx) throw new Error("useHomeMode must be used inside HomeModeProvider");
  return ctx;
}
