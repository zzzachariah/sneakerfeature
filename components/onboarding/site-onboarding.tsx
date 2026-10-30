"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, GraduationCap, Languages, LogOut, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { useCookieConsent } from "@/components/consent/cookie-consent";
import { useLocale } from "@/components/i18n/locale-provider";
import { createClient } from "@/lib/supabase/client";
import { setOnboardingActivity } from "@/lib/onboarding/activity";
import { entryPhaseShowsGate, entryRequestMatches, failedEntryPhase, hasSeenSiteIntro, resolveEntryPhase, type EntryRequest } from "@/lib/onboarding/entry-policy";
import type { OnboardingPageviews } from "@/lib/onboarding/server-contract";
import { reconcilePageviews } from "@/lib/onboarding/metrics";
import { EASE } from "@/lib/motion/constants";
import { BrandLogo, SiteStory, type StoryCatalog, type StoryShoe } from "./site-stories";
import { CountReveal, AnimatedCount } from "./animated-count";
import { DiscoveryIntro } from "./discovery-intro";
import { OnboardingAuth } from "./onboarding-auth";
import { OnboardingProfile } from "./onboarding-profile";
import { ScrollHint } from "./scroll-hint";
import styles from "./site-onboarding.module.css";

const SITE_KEY = "sf-onboarding-site-v2";
type Phase = "checking" | "boot" | "intro" | "auth" | "welcome" | "profile" | "complete" | "error";
type Status = {
  userId: string | null; username: string | null; memberNumber: number | null;
  requiresOnboarding: boolean; stage: "welcome" | "profile" | "complete" | null;
  tours: { site: "skipped" | "completed" | null; ai: "skipped" | "completed" | null };
  registeredUsers: number | null;
  pageviews: OnboardingPageviews;
};
type LiveMetrics = {
  registeredUsers: number; catalogCount: number; brandCount: number;
  pageviews: OnboardingPageviews; countsAsOf: string;
};
type Flight = { from: DOMRect; to: DOMRect; after: () => void; target: HTMLElement; snapshot?: HTMLElement };
class StatusError extends Error { constructor(message: string, public code?: string) { super(message); } }
let sessionIntro: string | null = null;
function readIntro() { try { return localStorage.getItem(SITE_KEY) || sessionIntro; } catch { return sessionIntro; } }
function rememberIntro(value: string) { sessionIntro = value; try { localStorage.setItem(SITE_KEY, value); } catch { /* memory preserves this session */ } }
function event(kind: string, detail?: unknown) { window.dispatchEvent(new CustomEvent(kind, { detail })); }
function formatMetricTime(value: string, zh: boolean, includeDate = false) {
  return new Date(value).toLocaleString(zh ? "zh-CN" : "en-GB", {
    ...(includeDate ? { month: "short", day: "numeric" } as const : {}),
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });
}
function validMetrics(value: unknown): value is LiveMetrics {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const pageviews = item.pageviews as Record<string, unknown> | null | undefined;
  if (!pageviews || typeof pageviews !== "object" || pageviews.source !== "vercel" ||
      !["live", "stale", "snapshot", "unavailable"].includes(String(pageviews.status)) ||
      typeof pageviews.snapshot !== "boolean") return false;
  const validDate = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
  const validPageviews = pageviews.status === "unavailable"
    ? pageviews.total === null && pageviews.asOf === null
    : typeof pageviews.total === "number" && Number.isSafeInteger(pageviews.total) && pageviews.total >= 0 && validDate(pageviews.asOf);
  return validPageviews && [pageviews.since, pageviews.rangeThrough].every((date) => date === null || validDate(date)) &&
    ["registeredUsers", "catalogCount", "brandCount"].every((key) =>
    typeof item[key] === "number" && Number.isSafeInteger(item[key]) && Number(item[key]) >= 0) &&
    validDate(item.countsAsOf);
}

/** Counts never update the account state or restart a tutorial step. */
function useLiveMetrics(enabled: boolean) {
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [connection, setConnection] = useState<"loading" | "ready" | "offline">("loading");
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let pending: AbortController | null = null;
    const refresh = async () => {
      if (stopped || document.hidden || pending) return;
      if (!navigator.onLine) { setConnection("offline"); return; }
      const controller = new AbortController();
      pending = controller;
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch("/api/onboarding/metrics", { cache: "no-store", signal: controller.signal });
        const data: unknown = await response.json();
        if (!response.ok || !validMetrics(data)) throw new Error("metrics_unavailable");
        if (!stopped) {
          setMetrics((previous) => ({ ...data, pageviews: reconcilePageviews(previous?.pageviews, data.pageviews) }));
          setConnection("ready");
        }
      } catch {
        // Keep the last confirmed values with their original timestamp. A
        // missing migration or unavailable service must never turn into zeros.
        if (!stopped) setConnection("offline");
      } finally {
        window.clearTimeout(timeout);
        if (pending === controller) pending = null;
      }
    };
    const resume = () => { void refresh(); };
    const offline = () => { setConnection("offline"); pending?.abort(); };
    void refresh();
    const interval = window.setInterval(resume, 15_000);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", resume);
    return () => {
      stopped = true; pending?.abort(); window.clearInterval(interval);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [enabled]);
  return { metrics, connection };
}
function snapshotCard(source?: HTMLElement | null) {
  if (!source) return undefined;
  const copy = source.cloneNode(true) as HTMLElement;
  copy.setAttribute("aria-hidden", "true");
  [copy, ...Array.from(copy.querySelectorAll<HTMLElement>("*"))].forEach((node) => {
    node.removeAttribute("id"); node.removeAttribute("data-testid"); node.setAttribute("tabindex", "-1");
    node.style.animation = "none";
    node.style.transition = "none";
  });
  copy.style.margin = "0"; copy.style.width = "100%"; copy.style.height = "100%"; copy.style.transform = "none";
  return copy;
}
function FlightPreview({ snapshot }: { snapshot?: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !snapshot) return;
    node.replaceChildren(snapshot);
    return () => node.replaceChildren();
  }, [snapshot]);
  return <div ref={ref} style={{ width: "100%", height: "100%" }}>{!snapshot ? <GraduationCap size={36}/> : null}</div>;
}

/** The fading shell must release the page before nested layout exits settle. */
function OnboardingShell({ children, shellRef, label, phase, reduced }: {
  children: ReactNode; shellRef: RefObject<HTMLDivElement | null>;
  label: string; phase: string; reduced: boolean | null;
}) {
  const present = useIsPresent();
  const [visibleFrame, setVisibleFrame] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      // A soft keyboard can shrink only the visual viewport. Do not resize
      // the dialog around a user's pinch zoom, which must remain available.
      if (Math.abs(viewport.scale - 1) > .01) return;
      const next = { height: viewport.height, top: viewport.offsetTop };
      setVisibleFrame(current => current?.height === next.height && current.top === next.top ? current : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
    };
  }, []);
  return <motion.div ref={shellRef} className={styles.shell}
    role={present ? "dialog" : undefined} aria-modal={present ? true : undefined} aria-label={label}
    inert={!present} aria-hidden={!present || undefined} style={{ pointerEvents: present ? undefined : "none", height: visibleFrame?.height, top: visibleFrame?.top, bottom: visibleFrame ? "auto" : undefined }}
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: reduced ? .15 : .25 } }} transition={{ duration: reduced ? .15 : .4, ease: EASE }}
    data-testid="site-onboarding" data-phase={phase} data-exiting={!present || undefined}>
    <LayoutGroup id="sf-onboarding">{children}</LayoutGroup>
  </motion.div>;
}

async function api(body?: Record<string, unknown>): Promise<Status> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("/api/onboarding", {
      cache: "no-store", signal: controller.signal,
      ...(body ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {})
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new StatusError(data.message || "Please try again.", data.code);
    return data as Status;
  } finally { clearTimeout(timeout); }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuthState();
  const { locale, requestLocaleChange } = useLocale();
  const zh = locale === "zh";
  const reduced = useReducedMotion();
  const consent = useCookieConsent();
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>(pathname === "/" ? "checking" : "complete");
  const [status, setStatus] = useState<Status | null>(null);
  const [catalog, setCatalog] = useState<StoryCatalog | null>(null);
  const [step, setStep] = useState(0);
  const [introDemoRunKey, setIntroDemoRunKey] = useState(0);
  const [selectedShoes, setSelectedShoes] = useState<StoryShoe[]>([]);
  const [wallExpanded, setWallExpanded] = useState(false);
  const [direction, setDirection] = useState(1);
  const [replay, setReplay] = useState(false);
  const [library, setLibrary] = useState(false);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [recoveryName, setRecoveryName] = useState("");
  const [busy, setBusy] = useState(false);
  const [authMounted, setAuthMounted] = useState(false);
  const [profileMounted, setProfileMounted] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [hint, setHint] = useState<{ rect: DOMRect; menu: boolean } | null>(null);
  const [replayGlow, setReplayGlow] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const welcomeContentRef = useRef<HTMLDivElement>(null);
  const authIntroRef = useRef<HTMLDivElement>(null);
  const profileIntroRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const replayRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const libraryRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const entryIdentity = useRef<EntryRequest>({ pathname, loaded: auth.loaded, signedIn: auth.signedIn, userId: auth.userId });
  entryIdentity.current = { pathname, loaded: auth.loaded, signedIn: auth.signedIn, userId: auth.userId };
  const knownVisitor = useRef(false);
  if (auth.signedIn) knownVisitor.current = true;
  const foregroundCheck = useRef(false);
  const entryNeedsRetry = useRef(false);
  const phaseRef = useRef(phase);
  const replayRefState = useRef(replay);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  phaseRef.current = phase;
  replayRefState.current = replay;
  const onHome = pathname === "/";
  const showing = !library && (replay || (onHome && entryPhaseShowsGate(phase)));
  const [retainShell, setRetainShell] = useState(showing);
  const showingRef = useRef(showing);
  showingRef.current = showing;
  const showingIntro = showing && (replay || phase === "intro");
  const active = showing || library;
  const { metrics, connection: metricsConnection } = useLiveMetrics(active);
  const transition = { duration: reduced ? .15 : .6, ease: EASE };

  const later = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => { timers.current.delete(timer); callback(); }, delay);
    timers.current.add(timer);
    return timer;
  }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  useLayoutEffect(() => { setMounted(true); }, []);
  useLayoutEffect(() => {
    if (showing) { setRetainShell(true); return; }
    // Shared-layout descendants can outlive their opacity animation. Bound the
    // entire presence tree so an interrupted child cannot leave an invisible
    // full-screen overlay in the DOM. Reopening cancels this cleanup.
    const timer = window.setTimeout(() => setRetainShell(false), reduced ? 200 : 350);
    return () => window.clearTimeout(timer);
  }, [showing, reduced]);
  useLayoutEffect(() => {
    // Route entry starts on the real website. No dialog, inert attribute or
    // body lock is installed while identity/status are checked in background.
    requestId.current += 1;
    foregroundCheck.current = false;
    entryNeedsRetry.current = false;
    setPhase(onHome ? "checking" : "complete");
    setReplay(false); setLibrary(false); setFlight(null); setHint(null);
  }, [onHome, pathname]);
  useLayoutEffect(() => {
    requestId.current += 1;
    setStatus(null);
    setBusy(false);
    setPhase(onHome ? "checking" : "complete");
    // Explicit replay is independent of account restoration and keeps its step.
  }, [onHome, auth.loaded, auth.signedIn, auth.userId]);

  const loadStatus = useCallback(async function refreshStatus({ foreground = false, attempt = 0 }: { foreground?: boolean; attempt?: number } = {}) {
    const identity = entryIdentity.current;
    if (identity.pathname !== "/" || !identity.loaded) return;
    if (foreground) foregroundCheck.current = true;
    const id = ++requestId.current;
    const current = () => id === requestId.current && entryRequestMatches(identity, entryIdentity.current);
    try {
      const data = await api();
      if (!current()) return;
      const next = resolveEntryPhase(identity, data, hasSeenSiteIntro(readIntro()) || knownVisitor.current);
      if (next === "checking") {
        entryNeedsRetry.current = true;
        if (attempt < 2) later(() => {
          if (current()) void refreshStatus({ foreground, attempt: attempt + 1 });
        }, 350 * (attempt + 1));
        else if (foregroundCheck.current) throw new StatusError("Your session is still syncing. Please retry.");
        return;
      }
      entryNeedsRetry.current = false;
      foregroundCheck.current = false;
      setStatus(data); setError(""); setRecovery(false);
      setPhase(next);
    } catch (cause) {
      if (!current()) return;
      entryNeedsRetry.current = true;
      setError(cause instanceof Error ? cause.message : "Unable to connect. Please retry.");
      setRecovery(cause instanceof StatusError && cause.code === "profile_recovery_required");
      // A background outage must not interrupt a restored member. A confirmed
      // anonymous visitor can still see the intro; no visit marker is written.
      setPhase(failedEntryPhase(identity, hasSeenSiteIntro(readIntro()) || knownVisitor.current, foregroundCheck.current));
    }
  }, [later]);

  useEffect(() => {
    if (!onHome || !auth.loaded) return;
    void loadStatus();
    return () => { requestId.current += 1; };
  }, [onHome, auth.loaded, auth.signedIn, auth.userId, loadStatus]);
  useEffect(() => {
    const retry = () => {
      if (entryNeedsRetry.current && !document.hidden && navigator.onLine) void loadStatus();
    };
    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    return () => { window.removeEventListener("focus", retry); window.removeEventListener("online", retry); };
  }, [loadStatus]);
  useEffect(() => {
    if (phase === "auth") setAuthMounted(true);
    if (phase === "profile") setProfileMounted(true);
    if (phase === "complete") { setAuthMounted(false); setProfileMounted(false); }
  }, [phase]);

  useEffect(() => {
    if (!(showing || library) || catalog) return;
    let cancelled = false;
    const controller = new AbortController();
    fetch("/api/onboarding/catalog", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      if (!cancelled) setCatalog(data);
    }).catch(() => {});
    return () => { cancelled = true; controller.abort(); };
  }, [showing, library, catalog]);

  useLayoutEffect(() => {
    if (!mounted) return;
    setOnboardingActivity("site", active);
    const chrome = document.getElementById("sf-site-chrome");
    const oldOverflow = document.body.style.overflow;
    const oldRootOverflow = document.documentElement.style.overflow;
    if (active) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      chrome?.setAttribute("inert", "");
      chrome?.setAttribute("aria-hidden", "true");
    }
    return () => {
      setOnboardingActivity("site", false);
      document.body.style.overflow = oldOverflow;
      document.documentElement.style.overflow = oldRootOverflow;
      chrome?.removeAttribute("inert");
      chrome?.removeAttribute("aria-hidden");
    };
  }, [active, mounted]);

  useEffect(() => {
    const openLibrary = () => setLibrary(true);
    const replayTour = (e: Event) => {
      if ((e as CustomEvent<{ kind: string }>).detail?.kind !== "site") return;
      setLibrary(false); setStep(0); setWallExpanded(false); setDirection(1); setIntroDemoRunKey((current) => current + 1); setReplay(true);
    };
    window.addEventListener("sf:tutorial-library", openLibrary);
    window.addEventListener("sf:replay-tutorial", replayTour);
    return () => {
      window.removeEventListener("sf:tutorial-library", openLibrary);
      window.removeEventListener("sf:replay-tutorial", replayTour);
    };
  }, []);

  // A menu dialog has its own focus boundary, including a keyboard-only exit.
  useEffect(() => {
    if (!library) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = libraryRef.current;
    node?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setLibrary(false); }
      if (e.key !== "Tab" || !node) return;
      const buttons = Array.from(node.querySelectorAll<HTMLButtonElement>("button"));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [library]);

  // Keep an in-flight destination attached to the actual control on rotation.
  useEffect(() => {
    const reposition = () => setFlight((current) => current && current.target.isConnected ? { ...current, to: current.target.getBoundingClientRect() } : current);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, []);

  useEffect(() => {
    if (!showing || !mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    if (showingIntro || phase === "welcome" || phase === "error") (headingRef.current || shellRef.current?.querySelector<HTMLElement>("h1"))?.focus({ preventScroll: true });
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !shellRef.current) return;
      const focusable = Array.from(shellRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter((el) => el.getClientRects().length > 0 && !el.closest("[hidden]"));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !shellRef.current.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [showing, showingIntro, phase, step, mounted]);

  const showHint = useCallback((rect: DOMRect, menu = false) => {
    setHint({ rect, menu }); setReplayGlow(true);
    later(() => { setHint(null); setReplayGlow(false); }, 2800);
  }, [later]);

  const revealMenu = useCallback((from?: DOMRect, snapshot?: HTMLElement) => {
    event("sf:show-tutorial-entry");
    later(() => {
      const row = Array.from(document.querySelectorAll<HTMLElement>("[data-onboarding-replay]")).find((el) => el.getClientRects().length > 0);
      if (!row) return;
      const arrive = () => {
        setFlight(null);
        row.classList.add(styles.menuHighlight);
        showHint(row.getBoundingClientRect(), true);
        row.focus({ preventScroll: true });
        later(() => { row.classList.remove(styles.menuHighlight); event("sf:hide-tutorial-entry"); }, 2800);
      };
      if (from && !reduced) setFlight({ from, to: row.getBoundingClientRect(), target: row, snapshot, after: arrive });
      else arrive();
    }, reduced ? 30 : 260);
  }, [later, reduced, showHint]);

  const finishIntro = useCallback((result: "skipped" | "completed") => {
    if (flight) return;
    rememberIntro(result);
    if (status?.userId) void api({ tour: "site", status: result }).catch(() => {});
    const done = () => {
      setFlight(null);
      if (replayRefState.current) {
        setReplay(false);
        if (phaseRef.current === "complete" || !onHome) {
          revealMenu(storyRef.current?.getBoundingClientRect());
          return;
        }
      }
      else setPhase("auth");
      const target = replayRef.current?.getBoundingClientRect();
      if (target) showHint(target);
    };
    const source = storyRef.current?.querySelector<HTMLElement>(`[data-testid="onboarding-scene-${step}"]`);
    const from = source?.getBoundingClientRect();
    const snapshot = snapshotCard(source);
    const to = replayRef.current?.getBoundingClientRect();
    if (replay && (phase === "complete" || !onHome)) { setReplay(false); revealMenu(from, snapshot); }
    else if (from && to && replayRef.current && !reduced) setFlight({ from, to, snapshot, target: replayRef.current, after: done });
    else done();
  }, [flight, status?.userId, reduced, showHint, replay, phase, onHome, revealMenu, step]);

  useEffect(() => {
    if (!showingIntro) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); finishIntro("skipped"); }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [showingIntro, finishIntro]);

  async function continueToProfile() {
    const identity = entryIdentity.current;
    if (!identity.loaded || !identity.signedIn || !identity.userId) return;
    const id = ++requestId.current;
    const current = () => id === requestId.current && entryRequestMatches(identity, entryIdentity.current);
    setBusy(true); setError("");
    try {
      const data = await api({ stage: "profile" });
      if (!current()) return;
      if (data.userId !== identity.userId) throw new Error("Your session changed. Please retry.");
      setStatus(data); setPhase("profile");
    }
    catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : "Please retry."); }
    finally { if (current()) setBusy(false); }
  }
  async function completeProfile() {
    const identity = entryIdentity.current;
    // A profile can finish its own save after its account was unmounted.
    if (!identity.loaded || !identity.signedIn || !identity.userId || identity.userId !== auth.userId) return;
    const id = ++requestId.current;
    const current = () => id === requestId.current && entryRequestMatches(identity, entryIdentity.current);
    const data = await api({ stage: "complete" });
    if (!current()) return;
    if (data.userId !== identity.userId) throw new Error("Your session changed. Please retry.");
    if (data.requiresOnboarding) throw new Error(zh ? "档案尚未确认保存，请重试。" : "Your profile has not been confirmed. Please retry.");
    const from = shellRef.current?.querySelector<HTMLElement>("[data-onboarding-profile-card]")?.getBoundingClientRect() || shellRef.current?.getBoundingClientRect();
    setStatus(data); setPhase("complete"); setReplay(false);
    event("sf:persona-refresh"); router.refresh();
    later(() => { if (current()) revealMenu(from); }, reduced ? 30 : 280);
  }
  async function recoverProfile(e: React.FormEvent) {
    e.preventDefault();
    const identity = entryIdentity.current;
    if (!identity.loaded || !identity.signedIn || !identity.userId) return;
    const id = ++requestId.current;
    const current = () => id === requestId.current && entryRequestMatches(identity, entryIdentity.current);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/onboarding/recover-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: recoveryName }) });
      const data = await response.json();
      if (!current()) return;
      if (!response.ok || !data.ok) throw new Error(data.message || "Please retry.");
      setBusy(false);
      await loadStatus({ foreground: true });
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : "Please retry."); }
    finally { if (current()) setBusy(false); }
  }
  async function signOut() {
    requestId.current += 1;
    foregroundCheck.current = false;
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    setStatus(null); setBusy(false); setAuthMounted(false); setProfileMounted(false); setPhase("auth"); setError("");
    router.refresh();
  }
  function changeStep(next: number) { if (flight || (next > 0 && selectedShoes.length < 2)) return; storyRef.current?.scrollTo({ top: 0, behavior: "instant" }); copyRef.current?.scrollTo({ top: 0, behavior: "instant" }); setDirection(next > step ? 1 : -1); setStep(Math.max(0, Math.min(3, next))); }
  function openReplay() { setStep(0); setWallExpanded(false); setDirection(1); setIntroDemoRunKey((current) => current + 1); setReplay(true); }
  function selectShoe(shoe: StoryShoe) { setSelectedShoes((current) => current.some((item) => item.slug === shoe.slug) ? current.filter((item) => item.slug !== shoe.slug) : current.length < 2 ? [...current, shoe] : current); }
  const titles = zh
    ? [["找到更适合", "你打法的篮球鞋。"], ["你选的两双，", "差别在这里。"], ["你的打法，", "让推荐更贴近你。"], ["告诉 AI 你的需求，", "也可以自己挑。"]]
    : [["A better pair.", "For your game."], ["See the details.", "Feel the difference."], ["Your game.", "Your starting point."], ["Talk it through.", "Find your next pair."]];
  const descriptions = zh
    ? ["浏览、比较、了解。把关于篮球鞋的信息，变成对你有用的选择。", "试着切换雷达图例、查看真实配置。你在这里看到的，就是网站对比页使用的资料。", "建立球员档案，让位置、身体条件与打法成为选鞋的参考。", "让 Smart Picker 帮你梳理需求，或者自由搜索、浏览和比较。选择的节奏，由你决定。"]
    : ["Explore, compare and understand basketball shoes. Turn information into a choice that makes sense for you.", "Cushioning, traction and stability, together in one place. Get a clearer picture before you choose.", "Build your player profile. Let your position, measurements and playstyle inform your choices.", "Let Smart Picker help you think it through. Or search, explore and compare freely. You set the pace."];

  // One first reveal for the whole confirmed batch. The key deliberately stays
  // unchanged on later polls, so updates settle from the displayed digits.
  const pageviews = metrics?.pageviews ?? status?.pageviews;
  const pageviewsStale = metricsConnection === "offline" || pageviews?.status === "stale" || pageviews?.status === "snapshot";
  const catalogStats = <CountReveal key={metrics ? "live-metrics-ready" : "live-metrics-loading"} runKey="live-metrics">
    <div className={styles.stats} data-intro-counts>
      <div className={styles.stat}><strong>{metrics ? <AnimatedCount value={metrics.catalogCount}/> : <span aria-label={zh ? "统计尚未就绪" : "Statistics unavailable"}>—</span>}</strong><span>{zh ? "款球鞋资料" : "shoes to explore"}</span></div>
      <div className={styles.stat}><strong>{metrics ? <AnimatedCount value={metrics.brandCount}/> : <span aria-label={zh ? "统计尚未就绪" : "Statistics unavailable"}>—</span>}</strong><span>{zh ? "个品牌" : "brands"}</span></div>
    </div>
    <div className={styles.viewNote} data-intro-metrics-note data-connection={metricsConnection} data-pageviews-status={pageviews?.status ?? "loading"}>
      {metrics ? <span title={zh ? "注册人数来自现有账号；浏览量来自 Vercel，涵盖公开网站自启用统计以来的全部页面。" : "Current registered accounts; Vercel pageviews cover every production page since Web Analytics was enabled."}>
        <AnimatedCount value={metrics.registeredUsers}/>{zh ? " 位用户 · " : " players · "}
        {pageviews?.total != null ? <>{zh ? "全站浏览 " : "Site views "}<AnimatedCount value={pageviews.total}/>{zh ? " 次" : ""}</> : <span>{zh ? "全站浏览量暂不可用" : "Site views unavailable"}</span>}
      </span> : null}
      <small>
        {metrics ? <>
          {pageviews?.asOf ? <>
            <span role="status" aria-live="polite">{pageviewsStale ? (zh ? "浏览量暂未连接 · " : "Views disconnected · ") : "Vercel · "}</span>
            <time dateTime={pageviews.asOf} title={new Date(pageviews.asOf).toLocaleString(zh ? "zh-CN" : "en-US")}>{zh ? (pageviewsStale ? "上次核实 " : "更新于 ") : (pageviewsStale ? "last checked " : "updated ")}{formatMetricTime(pageviews.asOf, zh, pageviewsStale)}</time>
          </> : <>
            <span role="status" aria-live="polite">{metricsConnection === "offline" ? (zh ? "统计暂未连接 · " : "Statistics disconnected · ") : ""}</span>
            <time dateTime={metrics.countsAsOf} title={new Date(metrics.countsAsOf).toLocaleString(zh ? "zh-CN" : "en-US")}>{zh ? "鞋库与账号更新于 " : "Catalogue & players updated "}{formatMetricTime(metrics.countsAsOf, zh, metricsConnection === "offline")}</time>
          </>}
        </> : <span role="status" aria-live="polite">{metricsConnection === "loading" ? (zh ? "正在获取最新统计…" : "Loading current statistics…") : (zh ? "实时统计尚未就绪，暂不展示数字。" : "Live statistics are not ready yet. Figures are unavailable.")}</span>}
      </small>
    </div>
  </CountReveal>;

  const shell = showing ? (
    <OnboardingShell key="site-onboarding" shellRef={shellRef} label={zh ? "snkrfeature 新手体验" : "Welcome to snkrfeature"} phase={showingIntro ? "intro" : phase} reduced={reduced}>
        <header className={styles.topbar}>
          <div className={styles.wordmark}>{phase !== "boot" && phase !== "error" && (!showingIntro || step > 0) ? <BrandLogo compact/> : <span className={styles.wordmarkDot}/>}<span>snkrfeature</span></div>
          <div className={styles.headerActions}><button className={styles.quietButton} type="button" onClick={() => requestLocaleChange(zh ? "en" : "zh")} aria-label={zh ? "Switch to English" : "切换中文"}><Languages size={15}/><span className={styles.languageLabel}>{zh ? "EN" : "中文"}</span></button>
            {auth.signedIn && phase !== "complete" ? <button className={styles.quietButton} type="button" onClick={() => void signOut()} aria-label={zh ? "退出登录" : "Sign out"}><LogOut size={15}/></button> : null}
            {showingIntro ? <button className={styles.quietButton} type="button" onClick={() => finishIntro("skipped")} disabled={!!flight}>{replay ? (zh ? "结束重播" : "Close tour") : (zh ? "跳过介绍" : "Skip intro")}</button> : null}
            <div className={styles.replayAnchor}><button ref={replayRef} className={styles.replayButton + (replayGlow ? " " + styles.replayGlow : "")} type="button" onClick={openReplay} disabled={!!flight} aria-label={zh ? "重看介绍" : "Replay introduction"} data-onboarding-shell-replay><RotateCcw size={14}/><span>{zh ? "重看介绍" : "Replay"}</span></button><AnimatePresence>{hint && !hint.menu ? <motion.div className={styles.replayHint + " " + styles.shellHint} role="status" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>{zh ? "想再看一次？随时从这里开始。" : "Want another look? Your introduction is always here."}</motion.div> : null}</AnimatePresence></div>
          </div>
        </header>
        {showingIntro ? (
          <>
            <motion.div className={step === 0 ? styles.discoveryBody : styles.body} ref={storyRef} role={step ? "region" : undefined} tabIndex={step ? 0 : undefined} aria-label={step ? (zh ? "导览内容" : "Introduction content") : undefined} data-onboarding-content animate={{ opacity: flight ? 0 : 1 }} transition={{ duration: reduced ? .15 : .3 }}>
              {step === 0 ? <DiscoveryIntro catalog={catalog} selected={selectedShoes} onSelect={selectShoe} zh={zh} stats={catalogStats} expanded={wallExpanded} onExpand={() => setWallExpanded(true)}/> : <>
              <div ref={copyRef} className={styles.copy} role="region" tabIndex={0} aria-label={zh ? "功能介绍与入口" : "Feature introduction and navigation"}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div key={step} initial={reduced ? { opacity: 0 } : { opacity: 0, y: direction * 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -direction * 8 }} transition={{ duration: reduced ? .15 : .38, ease: EASE }}>
                    <p className={styles.eyebrow}>{["WELCOME TO YOUR GAME", "KNOW YOUR SNEAKERS", "MAKE IT PERSONAL", "YOUR NEXT MOVE"][step]}</p>
                    <h1 ref={headingRef} tabIndex={-1} className={styles.heading}>{titles[step][0]}<br/><span className={styles.accent}>{titles[step][1]}</span></h1>
                    <p className={styles.description}>{descriptions[step]}</p>
                    <div className={styles.wayfinding}>
                      <span>{zh ? "以后，在这里找到它" : "FIND IT ON SNKRFEATURE"}</span>
                      {step === 1 ? <>
                        <p><strong>Compare</strong><ArrowRight size={13}/>{zh ? "添加两双或更多球鞋" : "Add two or more shoes"}<ArrowRight size={13}/>{zh ? "雷达与配置对比" : "Radar & specifications"}</p>
                        <small>{zh ? "电脑：顶部 Compare · 手机：底部「对比」。想看单鞋资料，点首页里的球鞋卡片。" : "Desktop: Compare in the top bar. Mobile: Compare in the bottom bar. Open any homepage shoe card for its details."}</small>
                        <div className={styles.wayfindingLinks}><Link href="/compare" target="_blank" rel="noopener noreferrer">{zh ? "打开 Compare" : "Open Compare"}<ArrowRight size={12}/></Link>{selectedShoes[0] ? <Link href={`/shoes/${selectedShoes[0].slug}`} target="_blank" rel="noopener noreferrer">{zh ? "看看球鞋详情" : "Open shoe details"}<ArrowRight size={12}/></Link> : null}</div>
                      </> : step === 2 ? <>
                        <p><strong>{zh ? "更多 / 菜单" : "More / Menu"}</strong><ArrowRight size={13}/>{zh ? "球员档案" : "Player profile"}</p>
                        <small>{zh ? "注册后会带你建立档案。以后想改位置、身体信息或打法，可以回到这里；评分偏好在选鞋页面的偏好入口调整。" : "We’ll build your profile after signup. Return here to update your position, build and playstyle; adjust rating priorities from the preferences control on shoe browsing pages."}</small>
                      </> : <>
                        <p><strong>Smart Picker</strong><ArrowRight size={13}/>{zh ? "输入需求，或填写选鞋问卷" : "Describe your needs, or use the questionnaire"}</p>
                        <small>{zh ? "电脑：顶部 Smart Picker · 手机：底部 Picker。进入后，标题旁的「使用指南」会进一步教你操作。" : "Desktop: Smart Picker in the top bar. Mobile: Picker in the bottom bar. The Guide beside its title explains the next steps."}</small>
                        <div className={styles.wayfindingLinks}><Link href="/smart-picker" target="_blank" rel="noopener noreferrer">{zh ? "查看 Smart Picker 入口" : "Open Smart Picker"}<ArrowRight size={12}/></Link></div>
                      </>}
                    </div>
                  </motion.div>
                </AnimatePresence>
                <ScrollHint targetRef={copyRef} zh={zh}/>
              </div>
              <SiteStory step={step} catalog={catalog} zh={zh} selectedShoes={selectedShoes} introDemoRunKey={introDemoRunKey} onChangeSelection={() => changeStep(0)}/><div className={styles.compactBodyHint}><ScrollHint targetRef={storyRef} zh={zh}/></div></>}
            </motion.div>
            <div className={styles.controls}>
              <nav className={styles.steps} aria-label={zh ? "介绍步骤" : "Introduction steps"}>{[0, 1, 2, 3].map((n) => <button key={n} className={styles.stepDot} type="button" aria-current={step === n ? "step" : undefined} aria-label={(zh ? "第 " : "Step ") + (n + 1)} onClick={() => changeStep(n)} disabled={!!flight || (n > 0 && selectedShoes.length < 2)}/>)}</nav>
              <div className={styles.controlActions}>
                {step > 0 ? <button className={styles.quietButton} type="button" onClick={() => changeStep(step - 1)} aria-label={zh ? "上一步" : "Previous step"}><ArrowLeft size={18}/></button> : null}
                <motion.button whileTap={reduced ? undefined : { scale: .98 }} type="button" className={styles.primary} disabled={!!flight || (step === 0 && selectedShoes.length < 2)} onClick={() => step === 3 ? finishIntro("completed") : changeStep(step + 1)}>{step === 3 ? (replay ? (zh ? "完成介绍" : "Finish introduction") : (zh ? "创建账号，开始探索" : "Create your account")) : step === 0 ? (selectedShoes.length === 2 ? (zh ? "对比这两双" : "Compare these two") : (zh ? "先选两双球鞋" : "Choose two shoes")) : (zh ? "继续探索" : "Keep exploring")}<ArrowRight size={17}/></motion.button>
              </div>
            </div>
          </>
        ) : null}
        <div hidden={showingIntro || phase !== "auth"} className={styles.formBody}>
          <motion.div ref={authIntroRef} className={styles.formIntro} role="region" tabIndex={0} aria-label={zh ? "账号介绍" : "About your account"} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={transition}><p className={styles.eyebrow}>YOUR GAME STARTS HERE</p><h1 className={styles.heading}>{zh ? "下一双，" : "Your next pair."}<br/><span className={styles.accent}>{zh ? "从你开始。" : "It starts with you."}</span></h1><p className={styles.description}>{zh ? "留下你的球员身份，把每一次探索变成更了解自己的过程。" : "Make room for your player profile, your discoveries and the choices ahead."}</p><div className={styles.formVisual}><span className={styles.formSeal}><ShieldCheck size={28}/></span><p><strong>{zh ? "属于你的选鞋旅程" : "A space for your game"}</strong>{zh ? "真实档案 · 自由浏览 · 持续探索" : "Your profile. Your discoveries. Your pace."}</p></div><ScrollHint targetRef={authIntroRef} zh={zh}/></motion.div>
          <motion.div layoutId={!showingIntro && phase === "auth" ? "sf-feature-stage" : undefined} transition={transition} className={styles.formStage}>{authMounted ? <OnboardingAuth onAuthenticated={() => loadStatus({ foreground: true })}/> : null}</motion.div>
        </div>
        <div hidden={showingIntro || phase !== "profile"} className={styles.formBody}>
          <motion.div ref={profileIntroRef} className={styles.formIntro} role="region" tabIndex={0} aria-label={zh ? "球员档案介绍" : "About your player profile"} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={transition}><p className={styles.eyebrow}>GET TO KNOW YOUR GAME</p><h1 className={styles.heading}>{zh ? "让每一次选择，" : "A little about you."}<br/><span className={styles.accent}>{zh ? "更贴近你。" : "A better starting point."}</span></h1><p className={styles.description}>{zh ? "你在球场上的样子，是我们了解一双鞋是否适合你的起点。" : "How you move on court is the starting point for understanding what might work for you."}</p><div className={styles.formVisual}><span className={styles.formSeal}><Sparkles size={28}/></span><p><strong>{zh ? "你的资料，随时可修改" : "Your profile can evolve"}</strong>{zh ? "以后可以从菜单里的球员档案更新。" : "Update it anytime from Player profile in the menu."}</p></div><ScrollHint targetRef={profileIntroRef} zh={zh}/></motion.div>
          <motion.div layoutId={!showingIntro && phase === "profile" ? "sf-player-card" : undefined} transition={transition} className={styles.formStage} data-onboarding-profile-card>{profileMounted ? <OnboardingProfile key={status?.userId || auth.userId || "pending"} onComplete={completeProfile} onBack={() => setPhase("welcome")}/> : null}</motion.div>
        </div>
        {!showingIntro && phase === "welcome" ? <motion.div className={styles.welcome} initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={transition}><div ref={welcomeContentRef} className={styles.welcomeContent} role="region" tabIndex={0} aria-label={zh ? "欢迎与球员编号" : "Welcome and player number"}><p className={styles.eyebrow}>YOU ARE PART OF THE GAME</p><h1 ref={headingRef} tabIndex={-1} className={styles.heading}>{zh ? "很荣幸，你来到这里。" : "Glad you’re here."}</h1><p className={styles.description}>{zh ? "欢迎加入 snkrfeature。属于你的球鞋探索，现在开始。" : "Welcome to snkrfeature. Your next discovery starts here."}</p><CountReveal runKey={status?.memberNumber || "pending"}><motion.div layoutId={reduced ? undefined : "sf-player-card"} className={styles.memberCard} transition={transition}><div className={styles.memberCardTop}><span>SNKRFEATURE PLAYER</span><Check size={18}/></div><strong className={styles.memberNumber} aria-label={status?.memberNumber != null ? "#" + status.memberNumber : undefined}>{status?.memberNumber != null ? <AnimatedCount value={status.memberNumber} prefix="#" pad={5}/> : (zh ? "正在确认编号" : "Confirming your number")}</strong><span className={styles.memberName}>{status?.username || auth.username || (zh ? "新球员" : "New player")}</span><span className={styles.memberLabel}>{zh ? "你的固定球员编号" : "Your permanent player number"}</span></motion.div><p className={styles.arrivalView} data-welcome-pageviews>{pageviews?.total != null ? <>{zh ? "全站累计浏览 " : "Lifetime site views: "}<strong><AnimatedCount value={pageviews.total}/></strong>{zh ? " 次" : ""}</> : (zh ? "全站累计浏览量暂不可用" : "Lifetime site views are temporarily unavailable")}<small>{pageviews?.asOf ? <>{pageviewsStale ? (zh ? "Vercel · 上次核实 " : "Vercel · Last confirmed ") : (zh ? "Vercel · 更新于 " : "Vercel · Updated ")}<time dateTime={pageviews.asOf}>{formatMetricTime(pageviews.asOf, zh, true)}</time></> : (zh ? "来自 Vercel 全站历史统计" : "From Vercel’s lifetime website analytics")}</small></p></CountReveal><ScrollHint targetRef={welcomeContentRef} zh={zh}/></div><motion.button type="button" whileTap={{ scale: .98 }} className={styles.primary} onClick={() => void continueToProfile()} disabled={busy}>{zh ? "建立我的球员档案" : "Build my player profile"}<ArrowRight size={17}/></motion.button>{error ? <p role="alert" className={styles.error}>{error}</p> : null}</motion.div> : null}
        {!showingIntro && (phase === "boot" || phase === "error") ? <div ref={statusRef} className={styles.status}><BrandLogo shared={false}/><h1 ref={headingRef} tabIndex={-1} className={styles.heading}>{phase === "boot" ? (zh ? "准备好你的球场。" : "Making room for you.") : (zh ? "我们再试一次。" : "Let's try that again.")}</h1>{phase === "boot" ? <div className={styles.loadingMark}><span/></div> : <><p>{error}</p>{recovery ? <form onSubmit={recoverProfile} className={styles.recoveryForm}><p>{zh ? "你的账号已经创建。选择一个可用的用户名，即可继续。" : "Your account exists. Choose an available username to continue."}</p><label htmlFor="onboarding-recovery-name">{zh ? "用户名" : "Username"}</label><input id="onboarding-recovery-name" value={recoveryName} onChange={(e) => setRecoveryName(e.target.value)} minLength={3} maxLength={80} required autoComplete="username"/><button type="submit" className={styles.primary} disabled={busy}>{zh ? "恢复并继续" : "Continue setup"}</button></form> : null}<button className={styles.quietButton} type="button" onClick={() => { setPhase("boot"); void loadStatus({ foreground: true }); }}>{zh ? "重新连接" : "Reconnect"}</button></>}<ScrollHint targetRef={statusRef} zh={zh}/></div> : null}
        <footer className={styles.footer}>
          {consent.ready && !consent.blocked && consent.consent === null ? <div className={styles.consent}><span>{zh ? "允许匿名使用统计，帮助我们改善体验？" : "Allow analytics to help us improve your experience?"}</span><button type="button" onClick={() => consent.setConsent("rejected")}>{zh ? "拒绝" : "Decline"}</button><button type="button" onClick={() => consent.setConsent("accepted")}>{zh ? "接受" : "Accept"}</button></div> : <span>{zh ? "为你的打法，找到更多可能。" : "More possibilities for the way you play."}</span>}
          <Link href="/privacy">{zh ? "隐私政策" : "Privacy policy"}</Link>
        </footer>
    </OnboardingShell>
  ) : null;

  return <>{children}{mounted ? createPortal(<>
    {showing || retainShell ? <AnimatePresence onExitComplete={() => { if (!showingRef.current) setRetainShell(false); }}>{shell}</AnimatePresence> : null}
    <AnimatePresence>{flight ? <motion.div key="flight" className={styles.flyingCard} style={{ left: flight.from.left, top: flight.from.top, width: flight.from.width, height: flight.from.height, transformOrigin: "top left" }} initial={{ opacity: .75, x: 0, y: 0, scaleX: 1, scaleY: 1 }} animate={{ opacity: [.9, .9, 0], x: flight.to.left - flight.from.left, y: flight.to.top - flight.from.top, scaleX: flight.to.width / flight.from.width, scaleY: flight.to.height / flight.from.height }} transition={{ duration: .65, ease: EASE, opacity: { duration: .65, times: [0, .55, 1], ease: EASE } }} onAnimationComplete={flight.after}><FlightPreview snapshot={flight.snapshot}/></motion.div> : null}</AnimatePresence>
    <AnimatePresence>{hint?.menu ? <motion.div key="replay-hint" className={styles.replayHint} role="status" style={{ top: Math.min(hint.rect.bottom + 12, window.innerHeight - 110), right: Math.max(18, window.innerWidth - hint.rect.right) }} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>{hint.menu ? (zh ? `以后从「${window.innerWidth >= 768 ? "更多" : "菜单"} → Site Intro」重看。` : `Replay anytime from ${window.innerWidth >= 768 ? "More" : "Menu"} → Site Intro.`) : (zh ? "想再看一次？随时从这里开始。" : "Want another look? Your introduction is always here.")}</motion.div> : null}</AnimatePresence>
    <AnimatePresence>{library ? <motion.div className={styles.libraryBackdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLibrary(false)}><motion.div ref={libraryRef} className={styles.library} role="dialog" aria-modal="true" aria-label={zh ? "Site Intro 与功能指南" : "Site Intro & guides"} initial={reduced ? { opacity: 0 } : { opacity: 0, scale: .96, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} transition={transition} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape") setLibrary(false); }}><div className={styles.libraryHeader}><h2>{zh ? "随时，再认识一次。" : "A fresh look. Anytime."}</h2><button className={styles.quietButton} type="button" autoFocus onClick={() => setLibrary(false)} aria-label={zh ? "关闭" : "Close"}><X size={18}/></button></div><button className={styles.libraryChoice} type="button" onClick={() => { setLibrary(false); openReplay(); }}><GraduationCap size={22}/><span><strong>{zh ? "Site Intro · 网站介绍" : "Site Intro · Meet snkrfeature"}</strong><small>{zh ? "了解功能，找到自己的选鞋方式。" : "Explore the tools. Find your own way."}</small></span><ArrowRight size={17}/></button><button className={styles.libraryChoice} type="button" onClick={() => { setLibrary(false); if (pathname === "/smart-picker") event("sf:replay-tutorial", { kind: "ai" }); else { try { sessionStorage.setItem("sf-replay-ai-v2", "1"); } catch {} router.push("/smart-picker"); } }}><Sparkles size={22}/><span><strong>{zh ? "AI 选鞋指南" : "Smart Picker guide"}</strong><small>{zh ? "从认识 AI，到发出第一个需求。" : "From meeting your assistant to your first request."}</small></span><ArrowRight size={17}/></button><ScrollHint targetRef={libraryRef} zh={zh}/></motion.div></motion.div> : null}</AnimatePresence>
  </>, document.body) : null}</>;
}
