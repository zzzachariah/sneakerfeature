"use client";

import { useEffect, useRef, useState } from "react";
import type { DemoSnapshot, DemoStage } from "@/lib/onboarding/picker-demo-contract";

export type PlaybackPhase = "request" | DemoStage | "sources" | "done";
const sequence: DemoStage[] = ["catalog", "shortlist", "research", "writing"];
/** Reading time starts only after the section has arrived and finished panning. */
export function playbackDuration() { return 5000; }
export function playbackContentKey(phase: PlaybackPhase, snapshot: DemoSnapshot) {
  return JSON.stringify(snapshot.events.filter(e => e.stage === phase).map(e => [e.query, e.state, e.candidates, e.catalogCount, e.sources]));
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
  const ready = useRef(""), read = useRef(0);
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
    read.current=0;
    let previous = performance.now(), content = "";
    const timer = window.setInterval(() => {
      const now = performance.now(), delta = Math.min(now - previous, 300); previous = now;
      const {snapshot: current, playing: enabled} = latest.current;
      if (!engaged.current || !enabled || document.hidden || phase === "done" || (current.status === "failed" || current.status === "idle")) return;
      const key = playbackContentKey(phase, current);
      // A late query/result gets its own reading interval; polling timestamps do not.
      if (key !== content) { content = key; read.current = 0; }
      if (ready.current !== `${phase}|${key}`) return;
      read.current += delta;
      if (read.current >= playbackDuration()) setPhase(nextPlaybackPhase(phase, current));
    }, 200);
    return () => window.clearInterval(timer);
  }, [phase]);
  return {phase, markMoving: () => {ready.current="";read.current=0;}, markReady: () => { read.current=0; ready.current = `${phase}|${playbackContentKey(phase,snapshot)}`; }, finish: () => setPhase("done")};
}
