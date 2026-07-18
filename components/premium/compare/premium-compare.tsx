"use client";

// Premium compare recomposer — four genuinely different pages. Each skin composes
// its OWN re-designed components (PremiumPlinths = the shoe as a cover plate /
// diagnostic card / pedestal / trading card; PremiumVerdict = a pull-quote /
// terminal / statement / scoreboard) inside its own layout. The radar + spec
// table are the shared analytic blocks, framed to match. Standard users get the
// original CompareSlides via CompareSwitch; this file is premium-only.

import { Bookmark, Plus, Share2 } from "lucide-react";
import { CompareRadar } from "@/components/compare/compare-radar";
import { CompareSpecTable } from "@/components/compare/compare-spec-table";
import { PremiumPlinths } from "@/components/premium/compare/premium-plinths";
import { PremiumVerdict } from "@/components/premium/compare/premium-verdict";
import { PremiumDiff } from "@/components/premium/compare/premium-diff";
import { PremiumMasthead } from "@/components/premium/page/premium-masthead";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import type { Props as CompareProps } from "@/components/compare/compare-slides";
import type { PremiumVariant } from "@/components/premium/variants";

const OFFSET = { scrollMarginTop: "var(--top-nav-h)" } as const;
type LayoutProps = CompareProps & { variant: Exclude<PremiumVariant, "standard"> };

export function PremiumCompare(props: LayoutProps) {
  switch (props.variant) {
    case "editorial":
      return <EditorialCompare {...props} />;
    case "instrument":
      return <InstrumentCompare {...props} />;
    case "gallery":
      return <GalleryCompare {...props} />;
    default:
      return <ArenaCompare {...props} />;
  }
}

type ActionProps = Pick<CompareProps, "canAdd" | "canSave" | "canShare" | "onAdd" | "onSave" | "onShare" | "onClear">;

function ActionBar({ canAdd, canSave, canShare, onAdd, onSave, onShare, onClear, center, className = "" }: ActionProps & { center?: boolean; className?: string }) {
  const { translate } = useLocale();
  return (
    <div className={`flex flex-wrap items-center gap-2 ${center ? "justify-center" : ""} ${className}`}>
      <ActionButton onClick={onAdd} disabled={!canAdd} icon={<Plus className="h-3.5 w-3.5" />} label={translate("Add shoe")} />
      {canSave ? <ActionButton onClick={onSave} icon={<Bookmark className="h-3.5 w-3.5" />} label={translate("Save compare")} /> : null}
      {canShare ? <ActionButton onClick={onShare} icon={<Share2 className="h-3.5 w-3.5" />} label={translate("Share card")} /> : null}
      <button type="button" onClick={onClear} className="tap-44 rounded-md border border-transparent px-2 py-1 text-[0.72rem] soft-text transition hover:text-[rgb(var(--text))]">
        {translate("Clear all")}
      </button>
    </div>
  );
}

function ActionButton({ onClick, disabled, icon, label }: { onClick: () => void; disabled?: boolean; icon?: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="tap-44 inline-flex items-center gap-1 rounded-md border border-[rgb(var(--glass-stroke-soft)/0.4)] px-2.5 py-1 text-[0.75rem] soft-text transition hover:border-[rgb(var(--text)/0.4)] hover:text-[rgb(var(--text))] disabled:cursor-not-allowed disabled:opacity-40">
      {icon}
      {label}
    </button>
  );
}

function Names({ shoes }: { shoes: CompareProps["shoes"] }) {
  return (
    <>
      {shoes.map((shoe, i) => (
        <span key={shoe.id}>
          <span className="text-[rgb(var(--text)/0.9)]">{shoe.shoe_name}</span>
          {i < shoes.length - 1 ? <span className="mx-2 opacity-40">/</span> : null}
        </span>
      ))}
    </>
  );
}

function avgRating(shoes: CompareProps["shoes"]) {
  const rated = shoes.filter((s) => s.finalStars != null);
  if (!rated.length) return "—";
  return (rated.reduce((a, s) => a + (s.finalStars ?? 0), 0) / rated.length).toFixed(1);
}

const actionKeys = (p: LayoutProps): ActionProps => ({
  canAdd: p.canAdd, canSave: p.canSave, canShare: p.canShare, onAdd: p.onAdd, onSave: p.onSave, onShare: p.onShare, onClear: p.onClear,
});

/* ── EDITORIAL — the Face-Off spread ──────────────────────────────────────── */
function EditorialCompare(props: LayoutProps) {
  const { shoes, onAdd, onRemove, canAdd } = props;
  const { translate } = useLocale();
  useNavScrollSections([
    { id: "compare-lineup", label: translate("Lineup") },
    { id: "compare-profile", label: translate("Profile") },
    { id: "compare-specs", label: translate("Specs") },
  ]);
  const multi = shoes.length > 1;
  return (
    <div className="has-mobile-nav-pad">
      <section className="container-shell pt-6">
        <PremiumMasthead variant="editorial" kicker={translate("Head to Head")} title={translate("The Face-Off")} meta={translate("Compare")} />
        <p className="pui-serif -mt-2 mb-4 text-[0.9rem] text-[rgb(var(--subtext))]"><Names shoes={shoes} /></p>
        <ActionBar {...actionKeys(props)} />
      </section>

      <section id="compare-lineup" style={OFFSET} className="container-shell pui-section-sm">
        <PremiumPlinths variant="editorial" shoes={shoes} onRemove={onRemove} onAdd={onAdd} canAdd={canAdd} />
      </section>

      <section id="compare-profile" style={OFFSET} className="container-shell pui-section">
        {multi ? (
          <>
            <p className="pui-kicker mb-6">{translate("The verdict")}</p>
            <div className="mb-12"><PremiumVerdict variant="editorial" shoes={shoes} /></div>
          </>
        ) : null}
        <p className="pui-kicker mb-6">{translate("By the numbers")}</p>
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-x-14">
          <CompareRadar shoes={shoes} />
          {multi ? <PremiumDiff variant="editorial" shoes={shoes} /> : null}
        </div>
      </section>

      <section id="compare-specs" style={OFFSET} className="container-shell pui-section">
        <p className="pui-kicker mb-4">{translate("The record")}</p>
        <div className="pui-record"><CompareSpecTable shoes={shoes} /></div>
      </section>
    </div>
  );
}

/* ── INSTRUMENT — the Cockpit ─────────────────────────────────────────────── */
function InstrumentCompare(props: LayoutProps) {
  const { shoes, onAdd, onRemove, canAdd } = props;
  const { translate } = useLocale();
  useNavScrollSections([
    { id: "compare-lineup", label: translate("Bay") },
    { id: "compare-profile", label: translate("Gauges") },
    { id: "compare-specs", label: translate("Data") },
  ]);
  const multi = shoes.length > 1;
  return (
    <div className="has-mobile-nav-pad">
      <div className="container-shell">
        <div className="pui-hud mt-4">
          <div className="pui-hud-cell"><span className="v pui-mono">{translate("Compare")}</span><span className="k">{translate("Decision console")}</span></div>
          <div className="pui-hud-cell"><span className="v pui-mono">{String(shoes.length).padStart(2, "0")}</span><span className="k">{translate("in the bay")}</span></div>
          <div className="pui-hud-cell"><span className="v pui-mono">{avgRating(shoes)}</span><span className="k">{translate("avg rating")}</span></div>
          <span className="ml-auto pui-hud-live">{translate("Live")}</span>
        </div>
        <ActionBar className="mt-4" {...actionKeys(props)} />

        <section id="compare-lineup" style={OFFSET} className="pui-section-sm">
          <PremiumPlinths variant="instrument" shoes={shoes} onRemove={onRemove} onAdd={onAdd} canAdd={canAdd} />
        </section>

        {multi ? (
          <section className="pui-section-sm">
            <span className="pui-panel-tag mb-2 inline-block">{translate("Readout")}</span>
            <PremiumVerdict variant="instrument" shoes={shoes} />
          </section>
        ) : null}

        <section id="compare-profile" style={OFFSET} className="pui-section">
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <div className="pui-panel"><span className="pui-panel-tag">{translate("Radar")}</span><CompareRadar shoes={shoes} /></div>
            <div className="pui-panel"><span className="pui-panel-tag">{translate("Delta")}</span>{multi ? <PremiumDiff variant="instrument" shoes={shoes} /> : <p className="text-[0.82rem] soft-text">{translate("Add another shoe to see the delta.")}</p>}</div>
          </div>
        </section>

        <section id="compare-specs" style={OFFSET} className="pui-section">
          <div className="pui-panel"><span className="pui-panel-tag">{translate("Data grid")}</span><CompareSpecTable shoes={shoes} /></div>
        </section>
      </div>
    </div>
  );
}

/* ── GALLERY — the Monograph ──────────────────────────────────────────────── */
function GalleryCompare(props: LayoutProps) {
  const { shoes, onAdd, onRemove, canAdd } = props;
  const { translate } = useLocale();
  useNavScrollSections([
    { id: "compare-lineup", label: translate("Plates") },
    { id: "compare-specs", label: translate("Specifications") },
    { id: "compare-profile", label: translate("Profile") },
  ]);
  const multi = shoes.length > 1;
  return (
    <div className="has-mobile-nav-pad">
      <section className="container-shell pt-10">
        <PremiumMasthead variant="gallery" kicker={translate("Comparison")} title={translate("Side by Side")} />
        <ActionBar className="mt-5" {...actionKeys(props)} />
      </section>

      <section id="compare-lineup" style={OFFSET} className="container-shell pui-section">
        <PremiumPlinths variant="gallery" shoes={shoes} onRemove={onRemove} onAdd={onAdd} canAdd={canAdd} />
      </section>

      {multi ? (
        <section style={OFFSET} className="container-shell pui-section-sm">
          <PremiumVerdict variant="gallery" shoes={shoes} />
        </section>
      ) : null}

      <section id="compare-specs" style={OFFSET} className="container-shell pui-section">
        <p className="pui-kicker mb-5">{translate("Specifications")}</p>
        <CompareSpecTable shoes={shoes} />
      </section>

      <section id="compare-profile" style={OFFSET} className="container-shell pui-section">
        <p className="pui-kicker mb-6">{translate("Profile")}</p>
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-x-14">
          <CompareRadar shoes={shoes} />
          {multi ? <PremiumDiff variant="gallery" shoes={shoes} /> : null}
        </div>
      </section>
    </div>
  );
}

/* ── ARENA — the Tale of the Tape ─────────────────────────────────────────── */
function ArenaCompare(props: LayoutProps) {
  const { shoes, onAdd, onRemove, canAdd } = props;
  const { translate } = useLocale();
  useNavScrollSections([
    { id: "compare-lineup", label: translate("Fighters") },
    { id: "compare-profile", label: translate("Tale of the tape") },
    { id: "compare-specs", label: translate("Fight card") },
  ]);
  const multi = shoes.length > 1;
  return (
    <div className="has-mobile-nav-pad">
      <section className="container-shell pt-6">
        <div className="pui-banner pui-sweep p-5 text-center">
          <p className="pui-kicker">{translate("Head to Head")}</p>
          <h1 className="pui-arena-title mt-1" style={{ fontSize: "clamp(2rem, 5.5vw, 3.4rem)" }}>{translate("Tale of the Tape")}</h1>
          <p className="mt-2 text-[0.82rem] uppercase tracking-[0.14em] soft-text"><Names shoes={shoes} /></p>
        </div>
        <ActionBar center className="mt-4" {...actionKeys(props)} />
      </section>

      <section id="compare-lineup" style={OFFSET} className="container-shell pui-section-sm">
        <PremiumPlinths variant="arena" shoes={shoes} onRemove={onRemove} onAdd={onAdd} canAdd={canAdd} />
      </section>

      {multi ? (
        <section id="compare-profile" style={OFFSET} className="container-shell pui-section">
          <div className="pui-tape-head mb-6"><span className="pui-kicker shrink-0">{translate("Tale of the tape")}</span></div>
          <PremiumDiff variant="arena" shoes={shoes} />
          <div className="mx-auto mt-10 max-w-2xl"><PremiumVerdict variant="arena" shoes={shoes} /></div>
        </section>
      ) : null}

      <section id="compare-specs" style={OFFSET} className="container-shell pui-section">
        <p className="pui-kicker mb-6 text-center">{translate("Fight card")}</p>
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-x-14">
          <CompareRadar shoes={shoes} />
          <CompareSpecTable shoes={shoes} />
        </div>
      </section>
    </div>
  );
}
