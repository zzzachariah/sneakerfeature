"use client";

import { useEffect, useRef, useState } from "react";
import type { DemoSnapshot, DemoStage } from "@/lib/onboarding/picker-demo-contract";

export type PlaybackPhase = "request" | DemoStage | "sources" | "done";
const sequence: DemoStage[] = ["catalog", "shortlist", "research", "writing"];
const minimum: Record<PlaybackPhase, number> = {request: 5000, catalog: 9000, shortlist: 9000, research: 12000, writing: 9000, sources: 10000, done: 0};
/** Presentation time is independent of server speed. Never invent a stage. */
export function playbackDuration(phase: PlaybackPhase, snapshot: DemoSnapshot) {
  if (phase !== "research") return minimum[phase];
  const queries = [...new Set(snapshot.events.filter(e => e.stage === "research" && e.query).map(e => e.query!))];
  return Math.min(22000, Math.max(minimum.research, queries.join(" ").length * 24 + 5000));
}
export function nextPlaybackPhase(phase: PlaybackPhase, snapshot: DemoSnapshot): PlaybackPhase {
  const observed = sequence.filter(stage => snapshot.events.some(e => e.stage === stage));
  if (phase === "request") return observed[0] ?? phase;
  if (phase === "sources") return "done";
  if (phase === "done") return phase;
  const next = observed.find(stage => sequence.indexOf(stage) > sequence.indexOf(phase));
  return next ?? (snapshot.status === "complete" ? "sources" : phase);
}
export function usePickerPlayback(snapshot: DemoSnapshot, posting: boolean, playing: boolean) {
  const [phase, setPhase] = useState<PlaybackPhase>("request");
  const engaged = useRef(false), identity = useRef<string | undefined>(undefined);
  const latest = useRef({snapshot, playing});
  latest.current = {snapshot, playing};
  useEffect(() => {
    if (posting || snapshot.status === "running") {
      if (!engaged.current || (snapshot.startedAt && identity.current && identity.current !== snapshot.startedAt)) {
        setPhase("request");
      }
      engaged.current = true;
      if (snapshot.startedAt) identity.current = snapshot.startedAt;
    } else if (snapshot.status === "failed" || (snapshot.status === "complete" && !engaged.current)) {
      // Reopening a saved result does not replay the entire waiting sequence.
      setPhase("done");
    }
  }, [posting, snapshot.status, snapshot.startedAt]);
  useEffect(() => {
    let read = 0, previous = performance.now(), content = "";
    const timer = window.setInterval(() => {
      const now = performance.now(), delta = Math.min(now - previous, 300); previous = now;
      const {snapshot: current, playing: enabled} = latest.current;
      if (!engaged.current || !enabled || document.hidden || phase === "done" || current.status === "failed") return;
      const key = JSON.stringify(current.events.filter(e => e.stage === phase).map(e => [e.query, e.state, e.candidates, e.catalogCount, e.sources]));
      // A late query/result gets its own reading interval; polling timestamps do not.
      if (key !== content) { content = key; read = 0; }
      read += delta;
      if (read >= playbackDuration(phase, current)) setPhase(nextPlaybackPhase(phase, current));
    }, 200);
    return () => window.clearInterval(timer);
  }, [phase]);
  return {phase, finish: () => setPhase("done")};
}
