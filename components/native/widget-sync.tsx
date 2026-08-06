"use client";

// Keeps the home-screen widgets fed. Renders nothing.
//
// A widget can't ask us anything — it draws whatever was last written into the
// shared App Group container. So the app pushes: on launch, on every return to
// the foreground, when a run is logged, and when the user flips a switch in
// settings. Between those moments the widget is deliberately static, which is
// also what makes it cheap: no background refresh, no polling, no auth token
// sitting on disk for an extension to use.
//
// Off the native shell this is a no-op — publishWidgetSnapshot() resolves false
// when the plugin isn't there, and the fetch never fires.

import { useCallback, useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { applyWidgetPrefs, type WidgetSnapshot } from "@/lib/widgets/snapshot";
import { liveWidgetsSupport, publishWidgetSnapshot } from "@/lib/native/live-widgets";
import { readWidgetPrefs, WIDGET_PREFS_EVENT } from "@/lib/native/widget-prefs";
import { WIDGETS_REFRESH_EVENT } from "@/lib/closet/court-session-store";

/**
 * Don't re-publish more often than this on ordinary resumes. Someone flipping
 * between the app and iMessage shouldn't cost a request per switch — the data
 * on a widget is hours-scale, not seconds-scale. Explicit refreshes (a logged
 * run, a settings change) bypass it.
 */
const MIN_PUBLISH_INTERVAL_MS = 60_000;

export function WidgetSync() {
  const lastPublishRef = useRef(0);
  const inFlightRef = useRef(false);

  const publish = useCallback(async (force: boolean) => {
    if (inFlightRef.current) return;
    const now = Date.now();
    if (!force && now - lastPublishRef.current < MIN_PUBLISH_INTERVAL_MS) return;

    inFlightRef.current = true;
    try {
      const res = await fetch("/api/widgets/snapshot", {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      if (!res.ok) return;
      const body: unknown = await res.json();
      const snapshot = (body as { snapshot?: WidgetSnapshot }).snapshot;
      if (!snapshot || snapshot.v !== 1) return;

      const ok = await publishWidgetSnapshot(applyWidgetPrefs(snapshot, readWidgetPrefs()));
      // Only count a real publish: a failed one shouldn't start the cooldown
      // and leave the widgets stale for another minute.
      if (ok) lastPublishRef.current = Date.now();
    } catch {
      /* offline or signed out mid-flight — the widget keeps its last good data */
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    const cleanups: Array<() => void> = [];

    const onRefresh = () => void publish(true);
    window.addEventListener(WIDGETS_REFRESH_EVENT, onRefresh);
    window.addEventListener(WIDGET_PREFS_EVENT, onRefresh);
    cleanups.push(() => {
      window.removeEventListener(WIDGETS_REFRESH_EVENT, onRefresh);
      window.removeEventListener(WIDGET_PREFS_EVENT, onRefresh);
    });

    void (async () => {
      // Ask once whether this shell can host widgets at all. On an older build
      // it can't, and there's no reason to spend a request per resume finding
      // that out again.
      const support = await liveWidgetsSupport();
      if (disposed || !support.widgets) return;

      void publish(true);

      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void publish(false);
        });
        if (disposed) handle.remove();
        else cleanups.push(() => handle.remove());
      } catch {
        /* app plugin unavailable */
      }
    })();

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, [publish]);

  return null;
}
