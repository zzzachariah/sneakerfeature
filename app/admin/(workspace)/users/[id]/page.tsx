import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Coins,
  Compass,
  Footprints,
  Heart,
  MessageSquare,
  Send,
  Settings2,
  Smartphone,
  Sparkles,
  Star,
  TrendingUp,
  UserCircle2,
  Users as UsersIcon,
} from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { loadUserDetail, type ShoeRef } from "@/lib/admin/user-detail";
import { Card } from "@/components/ui/card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(t));
}

function relative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "never";
  const diff = Date.now() - t;
  const day = 86_400_000;
  const days = Math.floor(diff / day);
  if (days < 1) {
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 1) return "just now";
    return `${hours}h ago`;
  }
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPageContext();
  const { id } = await params;
  const detail = await loadUserDetail(id);
  if (!detail) notFound();

  const { profile, totals, creditTransactions, recentChats, topShoes, recentComments, recentRatings, recentFavorites, recentSubmissions } = detail;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-xs font-medium soft-text transition hover:text-[rgb(var(--text))]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All members
        </Link>
      </div>

      <AdminPageHeader
        title={`@${profile.username || "member"}`}
        description={profile.email}
        icon={UserCircle2}
      />

      {/* Hero: account info + last active. */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-start">
          <Avatar src={profile.avatarUrl} username={profile.username} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-[-0.014em]">
                @{profile.username}
              </h2>
              <RolePill role={profile.role} />
              {profile.personalizedPushEnabled ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-emerald-600">
                  <Bell className="h-3 w-3" />
                  Push on
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--text)/0.06)] px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-[rgb(var(--text)/0.55)]">
                  Push off
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-sm soft-text">{profile.email}</p>
            {profile.bio && (
              <p className="mt-2 text-sm text-[rgb(var(--text)/0.85)]">{profile.bio}</p>
            )}
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <DefBlock label="Joined" value={formatDate(profile.createdAt)} />
              <DefBlock label="Last updated" value={formatDate(profile.updatedAt)} />
              <DefBlock label="Last active" value={relative(totals.lastActiveAt)} title={formatDate(totals.lastActiveAt, true)} />
              <DefBlock
                label="Push devices"
                value={
                  Object.entries(totals.pushTokensByPlatform).length === 0
                    ? "—"
                    : Object.entries(totals.pushTokensByPlatform)
                        .map(([p, n]) => `${n} ${p}`)
                        .join(" · ")
                }
              />
            </dl>
          </div>
        </div>
      </Card>

      {/* KPI tiles. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi icon={MessageSquare} label="Comments" value={totals.comments} />
        <Kpi icon={Star} label="Ratings" value={totals.ratings} />
        <Kpi icon={Heart} label="Favorites" value={totals.favorites} />
        <Kpi icon={Send} label="Submissions" value={totals.submissions} />
        <Kpi icon={Sparkles} label="Smart Picker chats" value={totals.smartPickerChats} />
        <Kpi icon={Coins} label="AI credits" value={totals.aiCreditBalance} />
        <Kpi icon={Footprints} label="Foot scans" value={totals.footScans} />
        <Kpi icon={TrendingUp} label="Shoes viewed" value={totals.shoeViews} />
      </section>

      {/* Profile composition cards. */}
      <section className="grid gap-4 lg:grid-cols-2">
        <PersonaCard persona={profile.persona} />
        <RatingFocusCard focus={profile.ratingFocus} />
        <FootProfileCard footProfile={profile.footProfile} footScans={totals.footScans} />
        <NotificationCard
          enabled={profile.personalizedPushEnabled}
          pushTokensByPlatform={totals.pushTokensByPlatform}
        />
      </section>

      {/* Activity sections. */}
      <section className="grid gap-4 lg:grid-cols-2">
        <CardSection
          icon={Sparkles}
          title="AI Smart Picker"
          subtitle={`${totals.smartPickerChats} chats · ${totals.smartPickerMessages} messages`}
          empty="No chats yet."
          items={recentChats.map((c) => ({
            key: c.id,
            primary: c.title?.trim() ? c.title : "Untitled chat",
            secondary: relative(c.updatedAt),
          }))}
        />

        <CardSection
          icon={Coins}
          title="AI credit history"
          subtitle={`Balance ${totals.aiCreditBalance.toLocaleString()} · last check-in ${relative(totals.lastCheckinAt)}`}
          empty="No transactions yet."
          items={creditTransactions.map((t) => ({
            key: t.id,
            primary: t.reason + (t.packageLabel ? ` · ${t.packageLabel}` : ""),
            secondary: relative(t.createdAt),
            extra: (
              <span
                className={`num-display font-semibold ${
                  t.delta > 0 ? "text-emerald-500" : "text-rose-500"
                }`}
              >
                {t.delta > 0 ? `+${t.delta}` : t.delta}
              </span>
            ),
          }))}
        />

        <CardSection
          icon={TrendingUp}
          title="Top viewed shoes"
          subtitle={`${totals.shoeViews} total views`}
          empty="Nothing browsed yet."
          items={topShoes.map((s) => ({
            key: s.shoeId,
            primary: `${s.brand} ${s.shoeName}`.trim() || "Unknown shoe",
            secondary: `${relative(s.lastViewedAt)} · ${s.viewCount} views`,
            href: s.slug ? `/shoes/${s.slug}` : undefined,
          }))}
        />

        <CardSection
          icon={MessageSquare}
          title="Recent comments"
          subtitle={`${totals.comments} total`}
          empty="No comments yet."
          items={recentComments.map((c) => ({
            key: c.id,
            primary: c.content.slice(0, 120) + (c.content.length > 120 ? "…" : ""),
            secondary: `${shoeLabel(c.shoe)} · ${relative(c.createdAt)}`,
            href: c.shoe?.slug ? `/shoes/${c.shoe.slug}` : undefined,
          }))}
        />

        <CardSection
          icon={Star}
          title="Recent ratings"
          subtitle={`${totals.ratings} total`}
          empty="No ratings yet."
          items={recentRatings.map((r) => ({
            key: r.id,
            primary: shoeLabel(r.shoe),
            secondary: relative(r.createdAt),
            extra: <span className="num-display font-semibold">{r.rating.toFixed(1)}★</span>,
            href: r.shoe?.slug ? `/shoes/${r.shoe.slug}` : undefined,
          }))}
        />

        <CardSection
          icon={Heart}
          title="Recent favorites"
          subtitle={`${totals.favorites} total`}
          empty="No favorites yet."
          items={recentFavorites.map((f) => ({
            key: f.shoeId,
            primary: shoeLabel(f.shoe),
            secondary: relative(f.createdAt),
            href: f.shoe?.slug ? `/shoes/${f.shoe.slug}` : undefined,
          }))}
        />

        <CardSection
          icon={Send}
          title="Recent submissions"
          subtitle={`${totals.submissions} total`}
          empty="No submissions yet."
          items={recentSubmissions.map((s) => ({
            key: s.id,
            primary: `${s.status}`,
            secondary: relative(s.createdAt),
            href: `/admin/review`,
          }))}
        />

        <ModerationCard totals={totals} />
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Components                                                                 */
/* -------------------------------------------------------------------------- */

function Avatar({ src, username }: { src: string | null; username: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={username}
        className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-[rgb(var(--glass-stroke-soft)/0.6)]"
      />
    );
  }
  const initial = (username || "?").slice(0, 1).toUpperCase();
  return (
    <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--accent)/0.12)] text-2xl font-semibold text-[rgb(var(--accent))] ring-2 ring-[rgb(var(--glass-stroke-soft)/0.6)]">
      {initial}
    </span>
  );
}

function RolePill({ role }: { role: "user" | "admin" }) {
  if (role === "admin") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--accent)/0.18)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[rgb(var(--accent))]">
        Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--text)/0.06)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[rgb(var(--text)/0.55)]">
      Member
    </span>
  );
}

function DefBlock({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div>
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] soft-text">{label}</dt>
      <dd className="mt-0.5 text-sm" title={title}>
        {value}
      </dd>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Heart; label: string; value: number | string }) {
  return (
    <div className="surface-card premium-border rounded-2xl p-4">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]">
        <Icon className="h-4 w-4" />
      </span>
      <p className="num-display mt-3 text-2xl font-semibold leading-none">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="mt-1 text-sm soft-text truncate">{label}</p>
    </div>
  );
}

function PersonaCard({ persona }: { persona: import("@/lib/admin/user-detail").Persona | null }) {
  return (
    <ProfileCard icon={UserCircle2} title="Player persona">
      {!persona ? (
        <EmptyHint>Not filled out yet.</EmptyHint>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Def label="Positions" value={(persona.positions ?? []).join(" / ") || "—"} />
          <Def label="Skill level" value={persona.skill_level ?? "—"} />
          <Def label="Height" value={persona.height_cm ? `${persona.height_cm} cm` : "—"} />
          <Def label="Weight" value={persona.weight_kg ? `${persona.weight_kg} kg` : "—"} />
          <Def label="Flat foot" value={persona.flat_foot === undefined ? "—" : persona.flat_foot ? "Yes" : "No"} />
        </dl>
      )}
    </ProfileCard>
  );
}

function RatingFocusCard({ focus }: { focus: import("@/lib/admin/user-detail").RatingFocus | null }) {
  return (
    <ProfileCard icon={Compass} title="Rating focus">
      {!focus || !focus.primary ? (
        <EmptyHint>Hasn&apos;t picked a playstyle yet.</EmptyHint>
      ) : (
        <ol className="space-y-1.5 text-sm">
          <li>
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] soft-text">
              Primary
            </span>{" "}
            {focus.primary}
          </li>
          {focus.secondary && (
            <li>
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] soft-text">
                Secondary
              </span>{" "}
              {focus.secondary}
            </li>
          )}
          {focus.tertiary && (
            <li>
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] soft-text">
                Tertiary
              </span>{" "}
              {focus.tertiary}
            </li>
          )}
        </ol>
      )}
    </ProfileCard>
  );
}

function FootProfileCard({
  footProfile,
  footScans,
}: {
  footProfile: import("@/lib/admin/user-detail").FootProfile | null;
  footScans: number;
}) {
  return (
    <ProfileCard icon={Footprints} title="Foot profile" subtitle={`${footScans} scans`}>
      {!footProfile ? (
        <EmptyHint>No foot scan on file.</EmptyHint>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {Object.entries(footProfile)
            .filter(([, v]) => v !== null && v !== undefined && v !== "")
            .slice(0, 8)
            .map(([k, v]) => (
              <Def
                key={k}
                label={k.replace(/_/g, " ")}
                value={typeof v === "number" || typeof v === "string" ? String(v) : JSON.stringify(v)}
              />
            ))}
        </dl>
      )}
    </ProfileCard>
  );
}

function NotificationCard({
  enabled,
  pushTokensByPlatform,
}: {
  enabled: boolean;
  pushTokensByPlatform: Record<string, number>;
}) {
  const platforms = Object.entries(pushTokensByPlatform);
  return (
    <ProfileCard icon={Bell} title="Notifications">
      <div className="space-y-2 text-sm">
        <p>
          Personalized push:{" "}
          <span className={enabled ? "font-semibold text-emerald-500" : "font-semibold soft-text"}>
            {enabled ? "Enabled" : "Disabled"}
          </span>
        </p>
        {platforms.length === 0 ? (
          <EmptyHint>No push tokens registered.</EmptyHint>
        ) : (
          <ul className="space-y-1">
            {platforms.map(([platform, count]) => (
              <li key={platform} className="flex items-center justify-between gap-2 rounded-lg bg-[rgb(var(--text)/0.04)] px-2 py-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5" />
                  {platform}
                </span>
                <span className="num-display font-semibold">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ProfileCard>
  );
}

function ModerationCard({ totals }: { totals: import("@/lib/admin/user-detail").UserDetail["totals"] }) {
  const any = totals.reportsFiled || totals.reportsAgainst || totals.blocksGiven || totals.blocksReceived;
  return (
    <ProfileCard icon={Settings2} title="Moderation footprint">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Def label="Reports filed" value={String(totals.reportsFiled)} />
        <Def label="Reports against" value={String(totals.reportsAgainst)} />
        <Def label="Blocks given" value={String(totals.blocksGiven)} />
        <Def label="Blocks received" value={String(totals.blocksReceived)} />
      </dl>
      {!any && <EmptyHint className="mt-3">No moderation events.</EmptyHint>}
    </ProfileCard>
  );
}

function ProfileCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof UserCircle2;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-[-0.01em]">{title}</h3>
          {subtitle && <p className="text-xs soft-text">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function CardSection({
  icon: Icon,
  title,
  subtitle,
  items,
  empty,
}: {
  icon: typeof UsersIcon;
  title: string;
  subtitle?: string;
  empty: string;
  items: {
    key: string;
    primary: string;
    secondary?: string;
    href?: string;
    extra?: React.ReactNode;
  }[];
}) {
  return (
    <ProfileCard icon={Icon} title={title} subtitle={subtitle}>
      {items.length === 0 ? (
        <EmptyHint>{empty}</EmptyHint>
      ) : (
        <ul className="divide-y divide-[rgb(var(--muted)/0.35)]">
          {items.map((item) => {
            const inner = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.primary}</span>
                  {item.secondary && (
                    <span className="block truncate text-xs soft-text">{item.secondary}</span>
                  )}
                </span>
                {item.extra}
                {item.href && <ChevronRight className="h-3.5 w-3.5 shrink-0 soft-text" />}
              </>
            );
            return (
              <li key={item.key} className="flex items-center gap-3 py-2.5">
                {item.href ? (
                  <Link
                    href={item.href as Route}
                    className="-mx-2 flex flex-1 items-center gap-3 rounded-lg px-2 py-1 transition hover:bg-[rgb(var(--text)/0.04)]"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex flex-1 items-center gap-3">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ProfileCard>
  );
}

function Def({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] soft-text">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function EmptyHint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-xs soft-text ${className ?? ""}`.trim()}>{children}</p>;
}

function shoeLabel(shoe: ShoeRef | null): string {
  if (!shoe) return "Unknown shoe";
  return `${shoe.brand} ${shoe.shoeName}`.trim() || "Unknown shoe";
}
