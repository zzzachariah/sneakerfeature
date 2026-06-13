"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBodyScrollLock } from "@/lib/hooks/use-body-scroll-lock";
import { useSlideSwipe } from "@/components/motion/use-slide-swipe";
import { ChevronDown, Eye, EyeOff, MessageCircle, ThumbsUp, ThumbsDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { useLocale } from "@/components/i18n/locale-provider";
import { PersonalizedPushToggle } from "@/components/preferences/personalized-push-toggle";

const EASE = "cubic-bezier(0.22,1,0.36,1)";
const SLIDE_TRANSITION_MS = 720;
const SCROLL_DELTA_THRESHOLD = 14;
const TOUCH_DELTA_THRESHOLD = 48;
const TOTAL = 4;

export type DashboardComment = {
  id: string;
  content: string;
  created_at: string;
  shoe_id: string;
  shoe_slug: string;
  shoe_name: string;
  likes: number;
  dislikes: number;
};

export type DashboardSubmission = {
  id: string;
  status: string;
  created_at: string;
};

export type DashboardSavedCompare = {
  id: string;
  title: string;
  shoe_ids: string[];
  created_at: string;
};

type ActivityKind = "comment" | "like" | "dislike";

type ActivityItem = DashboardComment & { kind: ActivityKind };

type Props = {
  loading: boolean;
  signedIn: boolean;
  username: string;
  email: string;
  role: "user" | "admin";
  comments: DashboardComment[];
  likedComments: DashboardComment[];
  dislikedComments: DashboardComment[];
  submissions: DashboardSubmission[];
  savedCompares: DashboardSavedCompare[];
  deletingCompareId: string | null;
  onDeleteCompare: (id: string) => void;
  // Settings — profile (username)
  onUsernameChange: (value: string) => void;
  onSaveUsername: () => void;
  savingProfile: boolean;
  profileMessage: string;
  profileError: boolean;
  // Settings — password
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  showCurrentPassword: boolean;
  showNewPassword: boolean;
  showConfirmPassword: boolean;
  onCurrentPasswordChange: (v: string) => void;
  onNewPasswordChange: (v: string) => void;
  onConfirmPasswordChange: (v: string) => void;
  onToggleShowCurrentPassword: () => void;
  onToggleShowNewPassword: () => void;
  onToggleShowConfirmPassword: () => void;
  changingPassword: boolean;
  passwordMessage: string;
  passwordError: boolean;
  onChangePassword: () => void;
};

function trySelfScroll(el: HTMLElement | null, deltaY: number): boolean {
  if (!el) return false;
  if (el.scrollHeight <= el.clientHeight) return false;
  const atTop = el.scrollTop <= 0;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
  if (deltaY > 0 && !atBottom) return true;
  if (deltaY < 0 && !atTop) return true;
  return false;
}

export function DashboardSlides(props: Props) {
  const { translate } = useLocale();
  const [slide, setSlide] = useState(0);
  const slideRef = useRef(0);
  const animatingRef = useRef(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    slideRef.current = slide;
  }, [slide]);

  const goTo = useCallback((next: number) => {
    if (animatingRef.current) return;
    if (next < 0 || next >= TOTAL) return;
    if (next === slideRef.current) return;
    animatingRef.current = true;
    setSlide(next);
    window.setTimeout(() => {
      animatingRef.current = false;
    }, SLIDE_TRANSITION_MS);
  }, []);

  // Wheel
  useEffect(() => {
    let lastFire = 0;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;

      if (target?.tagName === "TEXTAREA" && trySelfScroll(target, e.deltaY)) return;
      const sc = target?.closest("[data-dashboard-scroll-container]") as HTMLElement | null;
      if (sc && trySelfScroll(sc, e.deltaY)) return;

      const now = Date.now();
      if (now - lastFire < 80) return;
      if (Math.abs(e.deltaY) < SCROLL_DELTA_THRESHOLD) return;
      e.preventDefault();
      lastFire = now;
      if (e.deltaY > 0) goTo(slideRef.current + 1);
      else goTo(slideRef.current - 1);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [goTo]);

  // Keyboard — skip when typing in form fields
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        goTo(slideRef.current + 1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        goTo(slideRef.current - 1);
      } else if (e.key === "Home") {
        goTo(0);
      } else if (e.key === "End") {
        goTo(TOTAL - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  // Touch: finger-follow swipe; never page from form controls.
  useSlideSwipe({
    trackRef,
    slideRef,
    animatingRef,
    total: TOTAL,
    ease: EASE,
    durationMs: SLIDE_TRANSITION_MS,
    scrollSelector: "[data-dashboard-scroll-container]",
    blockSelector: "input, textarea, select, button, a",
    threshold: TOUCH_DELTA_THRESHOLD,
    goTo,
  });

  useBodyScrollLock();

  const labels = [
    translate("Overview"),
    translate("Activity"),
    translate("Library"),
    translate("Settings")
  ];

  const slideHeight = "calc(100dvh - var(--top-nav-h, 64px) - var(--mobile-nav-h, 0px))";

  const activityFeed = useMemo<ActivityItem[]>(() => {
    const merged: ActivityItem[] = [
      ...props.comments.map((c) => ({ ...c, kind: "comment" as ActivityKind })),
      ...props.likedComments.map((c) => ({ ...c, kind: "like" as ActivityKind })),
      ...props.dislikedComments.map((c) => ({ ...c, kind: "dislike" as ActivityKind }))
    ];
    return merged.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [props.comments, props.likedComments, props.dislikedComments]);

  return (
    <div className="relative" style={{ height: slideHeight, overflow: "hidden" }}>
      <div
        ref={trackRef}
        className="flex flex-col"
        style={{
          transform: `translate3d(0, calc(${-slide} * ${slideHeight} + var(--drag-offset, 0px)), 0)`,
          transition: `transform ${SLIDE_TRANSITION_MS}ms ${EASE}`,
          willChange: "transform",
          backfaceVisibility: "hidden"
        }}
      >
        {/* Slide 0: Overview */}
        <div className="shrink-0 overflow-hidden" style={{ height: slideHeight }}>
          <div
            className="container-shell h-full overflow-y-auto py-6 md:py-10"
            data-dashboard-scroll-container
          >
            <div className="flex min-h-full flex-col justify-center">
              <div className="mx-auto w-full max-w-4xl">
                <OverviewSlide
                  loading={props.loading}
                  signedIn={props.signedIn}
                  username={props.username}
                  email={props.email}
                  role={props.role}
                  commentsCount={props.comments.length}
                  likedCount={props.likedComments.length}
                  dislikedCount={props.dislikedComments.length}
                  translate={translate}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Slide 1: Activity */}
        <div className="shrink-0 overflow-hidden" style={{ height: slideHeight }}>
          <div className="container-shell flex h-full flex-col py-6 md:py-10">
            <div className="mx-auto flex w-full min-h-0 max-w-4xl flex-1 flex-col">
              <SlideHeader
                eyebrow={translate("Section 2 of 4")}
                title={translate("Activity")}
                description={translate("Your comments and reactions, newest first.")}
              />
              <div
                className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
                data-dashboard-scroll-container
              >
                {!props.signedIn && !props.loading ? (
                  <p className="text-sm soft-text">{translate("Please sign in to view your User Center.")}</p>
                ) : activityFeed.length === 0 ? (
                  <p className="text-sm soft-text">{translate("No activity yet.")}</p>
                ) : (
                  activityFeed.map((item) => (
                    <ActivityCard key={`${item.kind}-${item.id}`} item={item} translate={translate} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Slide 2: Library */}
        <div className="shrink-0 overflow-hidden" style={{ height: slideHeight }}>
          <div className="container-shell flex h-full flex-col py-6 md:py-10">
            <div className="mx-auto flex w-full min-h-0 max-w-4xl flex-1 flex-col">
              <SlideHeader
                eyebrow={translate("Section 3 of 4")}
                title={translate("Library")}
                description={translate("Your submissions and saved comparisons.")}
              />
              <div className="mt-5 grid min-h-0 flex-1 grid-rows-2 gap-6 lg:grid-cols-2 lg:grid-rows-1">
                <section className="flex min-h-0 flex-col">
                  <h3 className="shrink-0 text-sm font-semibold uppercase tracking-[0.18em] soft-text">
                    {translate("Submissions")}
                  </h3>
                  <div
                    className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
                    data-dashboard-scroll-container
                  >
                    {!props.signedIn && !props.loading ? (
                      <p className="text-sm soft-text">{translate("Please sign in to view your User Center.")}</p>
                    ) : props.submissions.length === 0 ? (
                      <p className="text-sm soft-text">{translate("No submissions yet.")}</p>
                    ) : (
                      props.submissions.map((item) => (
                        <div
                          key={item.id}
                          className="premium-hover-lift rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.6)] p-4 text-sm backdrop-blur-md"
                        >
                          <p className="font-medium">
                            {translate("Status")}:{" "}
                            <span className="text-[rgb(var(--text)/0.8)]">{translate(item.status)}</span>
                          </p>
                          <p className="mt-1 text-xs soft-text">{new Date(item.created_at).toLocaleString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="flex min-h-0 flex-col">
                  <h3 className="shrink-0 text-sm font-semibold uppercase tracking-[0.18em] soft-text">
                    {translate("Saved compares")}
                  </h3>
                  <div
                    className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
                    data-dashboard-scroll-container
                  >
                    {!props.signedIn && !props.loading ? null : props.savedCompares.length === 0 ? (
                      <p className="text-sm soft-text">{translate("No saved comparisons yet.")}</p>
                    ) : (
                      props.savedCompares.map((item) => {
                        const openHref = (
                          item.shoe_ids.length ? `/compare?ids=${item.shoe_ids.join(",")}` : "/compare"
                        ) as Route;
                        const deleting = props.deletingCompareId === item.id;
                        return (
                          <div
                            key={item.id}
                            className="premium-hover-lift rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.6)] p-4 text-sm backdrop-blur-md"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{item.title}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs soft-text">
                                  <span>{new Date(item.created_at).toLocaleString()}</span>
                                  <span aria-hidden>·</span>
                                  <span>
                                    {item.shoe_ids.length}{" "}
                                    {item.shoe_ids.length === 1 ? translate("shoe") : translate("shoes")}
                                  </span>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <Link
                                  href={openHref}
                                  className="rounded-lg border border-[rgb(var(--muted)/0.5)] px-3 py-1.5 text-xs font-medium soft-text transition hover:border-[rgb(var(--text)/0.45)] hover:text-[rgb(var(--text))]"
                                >
                                  {translate("Open")}
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => props.onDeleteCompare(item.id)}
                                  disabled={deleting}
                                  aria-label={translate("Delete")}
                                  className="rounded-lg border border-[rgb(var(--muted)/0.5)] p-2 soft-text transition hover:border-[rgb(var(--text)/0.45)] hover:text-[rgb(var(--text))] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>

        {/* Slide 3: Settings */}
        <div className="shrink-0 overflow-hidden" style={{ height: slideHeight }}>
          <div className="container-shell flex h-full flex-col py-6 md:py-10">
            <div className="mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col">
              <SlideHeader
                eyebrow={translate("Section 4 of 4")}
                title={translate("Settings")}
                description={translate("Manage your username and password.")}
              />
              <div
                className="mt-5 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1"
                data-dashboard-scroll-container
              >
                {!props.signedIn && !props.loading ? (
                  <p className="text-sm soft-text">{translate("Please sign in to view your User Center.")}</p>
                ) : (
                  <>
                    {/* Profile */}
                    <section className="rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.6)] p-5 backdrop-blur-md">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] soft-text">
                        {translate("Account details")}
                      </h3>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] soft-text">
                            {translate("Username")}
                          </label>
                          <Input
                            value={props.username}
                            onChange={(e) => props.onUsernameChange(e.target.value)}
                            autoComplete="username"
                            maxLength={20}
                          />
                          <p className="mt-1.5 text-xs soft-text">{translate("3-20 characters")}</p>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] soft-text">
                            {translate("Email (read-only)")}
                          </label>
                          <Input value={props.email} disabled />
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                        <Button
                          type="button"
                          className="w-full sm:w-auto"
                          onClick={props.onSaveUsername}
                          disabled={props.savingProfile}
                        >
                          {props.savingProfile ? translate("Saving...") : translate("Save profile")}
                        </Button>
                        {props.profileMessage && (
                          <FeedbackMessage message={props.profileMessage} isError={props.profileError} />
                        )}
                      </div>
                    </section>

                    {/* Notifications */}
                    <PersonalizedPushToggle />

                    {/* Security */}
                    <section className="rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.6)] p-5 backdrop-blur-md">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] soft-text">
                        {translate("Password")}
                      </h3>
                      <div className="mt-4 space-y-4">
                        <PasswordField
                          label="Current password"
                          value={props.currentPassword}
                          onChange={props.onCurrentPasswordChange}
                          show={props.showCurrentPassword}
                          onToggleShow={props.onToggleShowCurrentPassword}
                          placeholder="Enter current password"
                          autoComplete="current-password"
                          translate={translate}
                        />
                        <div className="grid gap-4 md:grid-cols-2">
                          <PasswordField
                            label="New password"
                            value={props.newPassword}
                            onChange={props.onNewPasswordChange}
                            show={props.showNewPassword}
                            onToggleShow={props.onToggleShowNewPassword}
                            placeholder="At least 8 characters"
                            autoComplete="new-password"
                            translate={translate}
                          />
                          <PasswordField
                            label="Confirm new password"
                            value={props.confirmPassword}
                            onChange={props.onConfirmPasswordChange}
                            show={props.showConfirmPassword}
                            onToggleShow={props.onToggleShowConfirmPassword}
                            placeholder="Re-enter new password"
                            autoComplete="new-password"
                            translate={translate}
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                        <Button
                          type="button"
                          className="w-full sm:w-auto"
                          onClick={props.onChangePassword}
                          disabled={props.changingPassword}
                        >
                          {props.changingPassword ? translate("Updating...") : translate("Update password")}
                        </Button>
                        {props.passwordMessage && (
                          <FeedbackMessage message={props.passwordMessage} isError={props.passwordError} />
                        )}
                      </div>
                    </section>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Left-side text indicator — only when there's enough gutter to sit
          outside the centered max-w-4xl content panel. Shown at xl+ where
          the gutter is generous; below that we fall back to right-side
          dots so the labels never overlap the content. */}
      <div
        className="absolute left-6 top-1/2 z-10 hidden -translate-y-1/2 flex-col items-start gap-5 xl:flex"
      >
        {labels.map((lbl, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`${translate("Go to")} ${lbl}`}
            aria-current={slide === i ? "true" : undefined}
            className="select-none rounded-md border-none bg-transparent p-0 text-left outline-none transition-[font-size,opacity,letter-spacing,color,font-weight] duration-[320ms]"
            style={{
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              fontSize: slide === i ? "1.05rem" : "0.78rem",
              fontWeight: slide === i ? 700 : 500,
              letterSpacing: slide === i ? "0.18em" : "0.1em",
              color: slide === i ? "rgb(var(--text))" : "rgb(var(--subtext)/0.55)",
              opacity: slide === i ? 1 : 0.7,
              cursor: "pointer"
            }}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* Right-side dot indicator — visible everywhere except xl+ (where the
          left-side text indicator takes over). */}
      <div
        className="pointer-events-none absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2 xl:hidden"
        aria-hidden
      >
        {Array.from({ length: TOTAL }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Slide ${i + 1}: ${labels[i]}`}
            className="pointer-events-auto rounded-sm border-none p-0 outline-none"
            style={{
              width: 4,
              height: slide === i ? 22 : 4,
              background: slide === i ? "rgb(var(--text)/0.8)" : "rgb(var(--muted)/0.55)",
              boxShadow: slide === i ? "0 0 0 4px rgb(var(--text)/0.08)" : "none",
              transition: `height 320ms ${EASE},background 220ms ${EASE},box-shadow 320ms ${EASE}`,
              cursor: "pointer"
            }}
          />
        ))}
      </div>

      {/* Scroll-down chevron, hidden on the final slide */}
      <button
        type="button"
        onClick={() => goTo(slide + 1)}
        aria-label={translate("Scroll to next slide")}
        className="absolute left-1/2 z-10 -translate-x-1/2 items-center justify-center rounded-full border border-[rgb(var(--glass-stroke-soft)/0.45)] bg-[rgb(var(--bg-elev)/0.7)] text-[rgb(var(--subtext))] shadow-[0_4px_14px_rgb(var(--shadow)/0.18)] backdrop-blur-[12px] transition-[opacity,transform,color] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[rgb(var(--text))]"
        style={{
          bottom: 32,
          width: 36,
          height: 36,
          display: slide < TOTAL - 1 ? "inline-flex" : "none",
          opacity: slide < TOTAL - 1 ? 1 : 0,
          transform: `translateX(-50%) translateY(${slide < TOTAL - 1 ? "0" : "8px"})`
        }}
      >
        <ChevronDown
          className="h-4 w-4"
          style={{ animation: "scrollHintDashboard 1.8s ease-in-out infinite" }}
        />
      </button>

      <style>{`
        @keyframes scrollHintDashboard {
          0%, 100% { transform: translateY(0); opacity: 0.7; }
          50% { transform: translateY(3px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggleShow,
  placeholder,
  autoComplete,
  translate
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder?: string;
  autoComplete?: string;
  translate: (s: string) => string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] soft-text">
        {translate(label)}
      </label>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={show ? "text" : "password"}
          placeholder={placeholder ? translate(placeholder) : undefined}
          autoComplete={autoComplete}
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? translate("Hide password") : translate("Show password")}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-[rgb(var(--subtext))] transition hover:text-[rgb(var(--text))]"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function SlideHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2 text-center">
      <p className="t-eyebrow">{eyebrow}</p>
      <h2
        className="font-extrabold leading-[1] tracking-[-0.04em]"
        style={{ fontSize: "clamp(1.8rem, 3.6vw, 2.8rem)" }}
      >
        {title}
      </h2>
      <p className="text-sm soft-text">{description}</p>
    </div>
  );
}

function OverviewSlide({
  loading,
  signedIn,
  username,
  email,
  role,
  commentsCount,
  likedCount,
  dislikedCount,
  translate
}: {
  loading: boolean;
  signedIn: boolean;
  username: string;
  email: string;
  role: "user" | "admin";
  commentsCount: number;
  likedCount: number;
  dislikedCount: number;
  translate: (s: string) => string;
}) {
  if (!signedIn && !loading) {
    return (
      <div className="surface-card premium-border rounded-3xl p-8 text-center">
        <p className="text-sm soft-text">{translate("Please sign in to view your User Center.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="t-eyebrow">{translate("user center")}</p>
        <h1
          className="mt-2 font-extrabold leading-[1] tracking-[-0.04em]"
          style={{ fontSize: "clamp(2rem, 4vw, 3.2rem)" }}
        >
          {translate("Welcome back")}
          {!loading && username ? (
            <>
              , <span className="brand-shimmer">{username}</span>
            </>
          ) : null}
          .
        </h1>
        <p className="mt-2 text-sm soft-text">{email}</p>
        {!loading && role === "admin" && (
          <p className="mt-3 inline-flex items-center rounded-full border border-[rgb(var(--muted)/0.6)] bg-[rgb(var(--bg-elev)/0.7)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-[rgb(var(--text))]">
            {translate("Admin account")}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatTile label={translate("My comments")} value={commentsCount} />
        <StatTile label={translate("Liked comments")} value={likedCount} />
        <StatTile label={translate("Disliked comments")} value={dislikedCount} />
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="premium-hover-lift group relative overflow-hidden rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.65)] p-5 backdrop-blur-md">
      <div className="relative z-10">
        <p className="auth-eyebrow">{label}</p>
        <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-[rgb(var(--text))]">
          <AnimatedCounter value={value} />
        </p>
      </div>
      <div className="pointer-events-none absolute inset-x-5 bottom-4 z-10 h-px bg-gradient-to-r from-transparent via-[rgb(var(--text)/0.18)] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
    </div>
  );
}

function ActivityCard({
  item,
  translate
}: {
  item: ActivityItem;
  translate: (s: string) => string;
}) {
  const badgeLabel =
    item.kind === "comment"
      ? translate("You commented")
      : item.kind === "like"
        ? translate("You liked")
        : translate("You disliked");
  const BadgeIcon = item.kind === "comment" ? MessageCircle : item.kind === "like" ? ThumbsUp : ThumbsDown;
  return (
    <div className="premium-hover-lift rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.6)] p-4 text-sm backdrop-blur-md">
      <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--muted)/0.5)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] soft-text">
        <BadgeIcon className="h-3 w-3" />
        {badgeLabel}
      </div>
      <p className="leading-relaxed">{item.content}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs soft-text">
        <span>{new Date(item.created_at).toLocaleString()}</span>
        <span aria-hidden>·</span>
        <span className="font-medium text-[rgb(var(--text)/0.85)]">{item.shoe_name}</span>
        {item.shoe_slug && (
          <>
            <span aria-hidden>·</span>
            <Link
              className="underline underline-offset-4 hover:text-[rgb(var(--text))]"
              href={`/shoes/${item.shoe_slug}`}
            >
              {translate("View shoe")}
            </Link>
          </>
        )}
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1">
          <ThumbsUp className="h-3 w-3" /> {item.likes}
        </span>
        <span className="inline-flex items-center gap-1">
          <ThumbsDown className="h-3 w-3" /> {item.dislikes}
        </span>
      </div>
    </div>
  );
}
