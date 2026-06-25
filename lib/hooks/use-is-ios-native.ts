"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

// Returns true once we know we're rendering inside the iOS Capacitor shell.
// Starts as false on the server and on first client render so SSR / web output
// stays unchanged; flips after mount when running inside the iOS app. Use this
// to gate iOS-only chrome (collapsed toolbars, glass treatments, native-style
// affordances) without leaking the change to web users.
export function useIsIosNative() {
  const [isIos, setIsIos] = useState(false);
  useEffect(() => {
    setIsIos(Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios");
  }, []);
  return isIos;
}
