"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { AlertTriangle, Eye, EyeOff, MessageCircle, ThumbsUp, ThumbsDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { useLocale } from "@/components/i18n/locale-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { PersonalizedPushToggle } from "@/components/preferences/personalized-push-toggle";
import { HapticsToggle } from "@/components/preferences/haptics-toggle";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { SwipeRow } from "@/components/motion/swipe-row";

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
  // Settings — danger zone (account deletion)
  deletePassword: string;
  showDeletePassword: boolean;
  onDeletePasswordChange: (v: string) => void;
  onToggleShowDeletePassword: () => void;
  deletingAccount: boolean;
  deleteMessage: string;
  deleteError: boolean;
  onDeleteAccount: () => void;
};

const SECTION_OFFSET = { scrollMarginTop: "var(--top-nav-h)" } as const;

// Continuous-scroll user center (Overview → Activity → Library → Settings).
// The navbar shows a 4-stop indicator. The component name is kept for import
// stability even though it is no longer a slide deck.
export function DashboardSlides(props: Props) {
  const { translate } = useLocale();

  useNavScrollSections([
    { id: "dash-overview", label: translate("Overview") },
    { id: "dash-activity", label: translate("Activity") },
    { id: "dash-library", label: translate("Library") },
    { id: "dash-settings", label: translate("Settings") }
  ]);

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

  const signedOut = !props.signedIn && !props.loading;

  return (
    <div className="has-mobile-nav-pad">
      {/* Overview */}
      <section id="dash-overview" style={SECTION_OFFSET} className="container-shell py-8 md:py-12">
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
      </section>

      {/* Activity */}
      <section id="dash-activity" style={SECTION_OFFSET} className="container-shell py-8 md:py-12">
        <div className="mx-auto w-full max-w-4xl">
          <SlideHeader
            eyebrow={translate("Section 2 of 4")}
            title={translate("Activity")}
            description={translate("Your comments and reactions, newest first.")}
          />
          <div className="mt-5 space-y-3">
            {signedOut ? (
              <p className="text-sm soft-text">{translate("Please sign in to view your User Center.")}</p>
            ) : props.loading ? (
              <ListSkeleton rows={3} />
            ) : activityFeed.length === 0 ? (
              <p className="text-sm soft-text">{translate("No activity yet.")}</p>
            ) : (
              <Stagger className="space-y-3">
                {activityFeed.map((item) => (
                  <StaggerItem key={`${item.kind}-${item.id}`}>
                    <ActivityCard item={item} translate={translate} />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </div>
      </section>

      {/* Library */}
      <section id="dash-library" style={SECTION_OFFSET} className="container-shell py-8 md:py-12">
        <div className="mx-auto w-full max-w-4xl">
          <SlideHeader
            eyebrow={translate("Section 3 of 4")}
            title={translate("Library")}
            description={translate("Your submissions and saved comparisons.")}
          />
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] soft-text">
                {translate("Submissions")}
              </h3>
              <div className="mt-3 space-y-3">
                {signedOut ? (
                  <p className="text-sm soft-text">{translate("Please sign in to view your User Center.")}</p>
                ) : props.loading ? (
                  <ListSkeleton rows={2} />
                ) : props.submissions.length === 0 ? (
                  <p className="text-sm soft-text">{translate("No submissions yet.")}</p>
                ) : (
                  props.submissions.map((item) => (
                    <div
                      key={item.id}
                      className="premium-hover-lift glass-lite rounded-2xl p-4 text-sm"
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

            <section>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] soft-text">
                {translate("Saved compares")}
              </h3>
              <div className="mt-3 space-y-3">
                {signedOut ? null : props.loading ? (
                  <ListSkeleton rows={2} />
                ) : props.savedCompares.length === 0 ? (
                  <p className="text-sm soft-text">{translate("No saved comparisons yet.")}</p>
                ) : (
                  props.savedCompares.map((item) => {
                    const openHref = (
                      item.shoe_ids.length ? `/compare?ids=${item.shoe_ids.join(",")}` : "/compare"
                    ) as Route;
                    const deleting = props.deletingCompareId === item.id;
                    return (
                      <SwipeRow
                        key={item.id}
                        className="rounded-2xl"
                        actions={[
                          {
                            label: translate("Delete"),
                            icon: <Trash2 className="h-4 w-4" />,
                            tone: "danger",
                            onAction: () => props.onDeleteCompare(item.id)
                          }
                        ]}
                      >
                      <div className="premium-hover-lift glass-lite rounded-2xl p-4 text-sm">
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
                      </SwipeRow>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      </section>

      {/* Settings */}
      <section id="dash-settings" style={SECTION_OFFSET} className="container-shell py-8 md:py-12">
        <div className="mx-auto w-full max-w-3xl">
          <SlideHeader
            eyebrow={translate("Section 4 of 4")}
            title={translate("Settings")}
            description={translate("Manage your username, password, and account.")}
          />
          <div className="mt-5 space-y-5">
            {signedOut ? (
              <p className="text-sm soft-text">{translate("Please sign in to view your User Center.")}</p>
            ) : (
              <>
                {/* Profile */}
                <section className="glass glass-rim relative rounded-2xl p-5">
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

                {/* Haptics (native app only) */}
                <HapticsToggle />

                {/* Security */}
                <section className="glass glass-rim relative rounded-2xl p-5">
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

                {/* Danger zone — account deletion */}
                <DeleteAccountSection
                  password={props.deletePassword}
                  show={props.showDeletePassword}
                  onPasswordChange={props.onDeletePasswordChange}
                  onToggleShow={props.onToggleShowDeletePassword}
                  deleting={props.deletingAccount}
                  message={props.deleteMessage}
                  isError={props.deleteError}
                  onConfirm={props.onDeleteAccount}
                  translate={translate}
                />
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function DeleteAccountSection({
  password,
  show,
  onPasswordChange,
  onToggleShow,
  deleting,
  message,
  isError,
  onConfirm,
  translate
}: {
  password: string;
  show: boolean;
  onPasswordChange: (v: string) => void;
  onToggleShow: () => void;
  deleting: boolean;
  message: string;
  isError: boolean;
  onConfirm: () => void;
  translate: (s: string) => string;
}) {
  const [open, setOpen] = useState(false);

  function close() {
    if (deleting) return;
    setOpen(false);
    onPasswordChange("");
  }

  return (
    <section className="relative rounded-2xl border border-red-500/40 bg-[rgb(var(--surface)/0.5)] p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-red-400">
        <AlertTriangle className="h-4 w-4" />
        {translate("Delete account")}
      </h3>
      <p className="mt-3 text-sm leading-relaxed soft-text">
        {translate(
          "Permanently delete your account and all associated data — your profile, comments, reactions, submissions, and saved comparisons. This cannot be undone."
        )}
      </p>
      <Button
        type="button"
        variant="secondary"
        className="mt-4 w-full border-red-500/50 text-red-400 hover:border-red-500 hover:text-red-300 sm:w-auto"
        onClick={() => setOpen(true)}
      >
        {translate("Delete account")}
      </Button>

      <Modal open={open} onClose={close} title="Delete account">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed soft-text">
            {translate(
              "This will permanently delete your account and everything tied to it. This action cannot be undone."
            )}
          </p>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] soft-text">
              {translate("Enter your password to confirm")}
            </label>
            <div className="relative">
              <Input
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                type={show ? "text" : "password"}
                placeholder={translate("Your password")}
                autoComplete="current-password"
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
          {message && <FeedbackMessage message={message} isError={isError} />}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={close} disabled={deleting}>
              {translate("Cancel")}
            </Button>
            <Button
              type="button"
              className="w-full border-red-600 bg-red-600 text-white hover:bg-red-500 sm:w-auto"
              onClick={onConfirm}
              disabled={deleting || !password}
            >
              {deleting ? translate("Deleting...") : translate("Delete my account")}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded-2xl border border-[rgb(var(--muted)/0.35)] bg-[rgb(var(--bg-elev)/0.5)]"
        />
      ))}
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
  // Cached identity (sessionStorage-backed) so the name/email render instantly
  // on entry instead of flashing empty before this page's own fetch resolves.
  const auth = useAuthState();
  const displayName = username || auth.username || "";
  const displayEmail = email || auth.email || "";

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
          {displayName ? (
            <>
              , <span className="brand-shimmer">{displayName}</span>
            </>
          ) : loading ? (
            <>
              ,{" "}
              <span
                aria-hidden
                className="inline-block h-[0.7em] w-32 animate-pulse rounded bg-[rgb(var(--muted)/0.4)] align-middle"
              />
            </>
          ) : null}
          .
        </h1>
        <p className="mt-2 min-h-[1.25rem] text-sm soft-text">{displayEmail}</p>
        {!loading && role === "admin" && (
          <p className="mt-3 inline-flex items-center rounded-full border border-[rgb(var(--muted)/0.6)] bg-[rgb(var(--bg-elev)/0.7)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-[rgb(var(--text))]">
            {translate("Admin account")}
          </p>
        )}
      </div>

      <Stagger className="grid gap-4 md:grid-cols-3" gap={0.07}>
        <StaggerItem><StatTile label={translate("My comments")} value={commentsCount} loading={loading} /></StaggerItem>
        <StaggerItem><StatTile label={translate("Liked comments")} value={likedCount} loading={loading} /></StaggerItem>
        <StaggerItem><StatTile label={translate("Disliked comments")} value={dislikedCount} loading={loading} /></StaggerItem>
      </Stagger>
    </div>
  );
}

function StatTile({ label, value, loading }: { label: string; value: number; loading?: boolean }) {
  return (
    <div className="premium-hover-lift group relative overflow-hidden glass-lite rounded-2xl p-5">
      <div className="relative z-10">
        <p className="auth-eyebrow">{label}</p>
        <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-[rgb(var(--text))]">
          {loading ? (
            <span
              aria-hidden
              className="inline-block h-9 w-14 animate-pulse rounded-lg bg-[rgb(var(--muted)/0.4)] align-middle"
            />
          ) : (
            <AnimatedCounter value={value} />
          )}
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
    <div className="premium-hover-lift glass-lite rounded-2xl p-4 text-sm">
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
