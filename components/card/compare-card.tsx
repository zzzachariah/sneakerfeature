"use client";

import { CardFrame } from "@/components/card/card-frame";
import { CardCompareRadar } from "@/components/card/card-compare-radar";
import { getLineStyle } from "@/components/compare/compare-metrics";
import { useLocale } from "@/components/i18n/locale-provider";
import { useTranslatedText } from "@/components/i18n/use-translated-text";
import { pickLocalized } from "@/components/i18n/localized-field";
import { proxiedImageSrc } from "@/lib/card/proxy-image";
import { computeVerdict, metricLabel } from "@/components/premium/compare/verdict-compute";
import type { Shoe } from "@/lib/types";

type Props = {
  shoes: Shoe[];
  /** Member skin accent (a light-legible hex) applied to the verdict band and
   *  winner highlight. null → free/no-skin: a neutral graphite verdict. */
  accent?: string | null;
  /** Free (non-member) export: tile a faint wordmark across the card. Members
   *  get the clean, watermark-free version. */
  watermark?: boolean;
};

function gridForCount(count: number): {
  columns: string;
  rows: string;
  imageHeight: number;
  nameSize: number;
  techLabelSize: number;
  techValueSize: number;
} {
  if (count <= 2)
    return {
      columns: "1fr 1fr",
      rows: "1fr",
      imageHeight: 260,
      nameSize: 30,
      techLabelSize: 9,
      techValueSize: 13,
    };
  if (count === 3)
    return {
      columns: "1fr 1fr 1fr",
      rows: "1fr",
      imageHeight: 200,
      nameSize: 22,
      techLabelSize: 8,
      techValueSize: 11,
    };
  return {
    columns: "1fr 1fr",
    rows: "1fr 1fr",
    imageHeight: 150,
    nameSize: 21,
    techLabelSize: 7.5,
    techValueSize: 10.5,
  };
}

const TECH_ROWS: Array<{
  key: keyof Shoe["spec"];
  // Stored Chinese counterpart column for `key`.
  zhKey: keyof Shoe["spec"];
  // Short label key — the compare card's tight cells need a 2-character zh
  // label, so we use the bare body-part word rather than the full
  // "<part> midsole tech" string. Both forms are in the locale dict.
  labelKey: string;
  englishLabel: string;
}> = [
  { key: "forefoot_midsole_tech", zhKey: "forefoot_midsole_tech_zh", labelKey: "forefoot", englishLabel: "Forefoot" },
  { key: "heel_midsole_tech", zhKey: "heel_midsole_tech_zh", labelKey: "heel", englishLabel: "Heel" },
  { key: "outsole_tech", zhKey: "outsole_tech_zh", labelKey: "outsole", englishLabel: "Outsole" },
  { key: "upper_tech", zhKey: "upper_tech_zh", labelKey: "upper", englishLabel: "Upper" },
];

function clampValue(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function ShoeCell({
  shoe,
  index,
  imageHeight,
  nameSize,
  techLabelSize,
  techValueSize,
  noImageLabel,
  valueClamp,
}: {
  shoe: Shoe;
  index: number;
  imageHeight: number;
  nameSize: number;
  techLabelSize: number;
  techValueSize: number;
  noImageLabel: string;
  valueClamp: number;
}) {
  const { translate, locale } = useLocale();
  const style = getLineStyle(index);
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 14,
        padding: 16,
        background: "rgba(255,255,255,0.6)",
        display: "grid",
        gridTemplateRows: `${imageHeight}px auto 1fr`,
        rowGap: 10,
        minHeight: 0,
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "10%",
            right: "10%",
            bottom: "6%",
            height: 18,
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 70%)",
            filter: "blur(6px)",
          }}
        />
        {shoe.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxiedImageSrc(shoe.image_url)}
            alt=""
            crossOrigin="anonymous"
            style={{
              position: "relative",
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.14))",
            }}
          />
        ) : (
          <div
            style={{
              color: "rgba(0,0,0,0.35)",
              fontSize: 11,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            {noImageLabel}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width={22} height={4} aria-hidden style={{ flexShrink: 0 }}>
            <line
              x1={0}
              y1={2}
              x2={22}
              y2={2}
              stroke={`rgba(0,0,0,${style.opacity})`}
              strokeWidth={style.strokeWidth + 0.4}
              strokeDasharray={style.dashArray}
            />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
              fontSize: 8.5,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.28em",
              color: "rgba(0,0,0,0.5)",
            }}
          >
            {[shoe.brand, shoe.release_year].filter(Boolean).join(" · ")}
          </span>
        </div>
        <span
          style={{
            fontSize: nameSize,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            color: "rgb(var(--text))",
          }}
        >
          {shoe.shoe_name}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          columnGap: 10,
          rowGap: 4,
          alignContent: "start",
        }}
      >
        {TECH_ROWS.map((row) => {
          const value = pickLocalized(
            locale,
            (shoe.spec[row.key] as string | null | undefined) ?? null,
            (shoe.spec[row.zhKey] as string | null | undefined) ?? null
          );
          const translatedLabel = translate(row.labelKey);
          const labelText =
            translatedLabel === row.labelKey ? row.englishLabel : translatedLabel;
          return (
            <div
              key={String(row.key)}
              style={{ display: "contents" }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
                  fontSize: techLabelSize,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.22em",
                  color: "rgba(0,0,0,0.5)",
                  alignSelf: "center",
                  whiteSpace: "nowrap",
                }}
              >
                {labelText}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
                  fontSize: techValueSize,
                  fontWeight: 600,
                  color: value ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.3)",
                  letterSpacing: "-0.005em",
                  lineHeight: 1.25,
                  overflow: "hidden",
                }}
              >
                {value ? clampValue(value, valueClamp) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CompareCard({ shoes, accent = null, watermark = false }: Props) {
  const { translate } = useLocale();
  const safe = shoes.slice(0, 4);
  const grid = gridForCount(safe.length);
  const verdict = computeVerdict(safe);
  // Pre-fetch translation for the title summary (no-op in en).
  const translatedHeadToHead = useTranslatedText("Head to Head", { contentType: "descriptive" });
  const translatedShoes = useTranslatedText("shoes", { contentType: "descriptive" });

  return (
    <CardFrame variant="compare">
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateRows: "auto auto 1fr auto auto",
          rowGap: 22,
          paddingTop: 30,
          paddingBottom: 26,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span
            style={{
              fontFamily: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.34em",
              color: "rgba(0,0,0,0.55)",
            }}
          >
            {translatedHeadToHead} · {safe.length} {translatedShoes}
          </span>
          <h1
            style={{
              fontSize: 58,
              fontWeight: 900,
              letterSpacing: "-0.045em",
              lineHeight: 0.95,
              margin: 0,
              color: "rgb(var(--text))",
            }}
          >
            {safe.map((s) => s.shoe_name).join("  /  ")}
          </h1>
        </div>

        <VerdictBand verdict={verdict} accent={accent} translate={translate} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: grid.columns,
            gridTemplateRows: grid.rows,
            gap: 18,
            minHeight: 0,
          }}
        >
          {safe.map((shoe, i) => (
            <ShoeCell
              key={shoe.id}
              shoe={shoe}
              index={i}
              imageHeight={grid.imageHeight}
              nameSize={grid.nameSize}
              techLabelSize={grid.techLabelSize}
              techValueSize={grid.techValueSize}
              noImageLabel={translate("No image")}
              valueClamp={safe.length >= 4 ? 26 : safe.length === 3 ? 32 : 42}
            />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingTop: 4,
          }}
        >
          <CardCompareRadar shoes={safe} size={380} />
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: 18,
          }}
        >
          {safe.map((shoe, i) => {
            const style = getLineStyle(i);
            return (
              <div key={shoe.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width={26} height={6} aria-hidden>
                  <line
                    x1={0}
                    y1={3}
                    x2={26}
                    y2={3}
                    stroke={`rgba(0,0,0,${style.opacity})`}
                    strokeWidth={style.strokeWidth + 0.4}
                    strokeDasharray={style.dashArray}
                  />
                </svg>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "rgba(0,0,0,0.78)",
                    letterSpacing: "-0.005em",
                  }}
                >
                  {shoe.shoe_name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {watermark ? <Watermark /> : null}
    </CardFrame>
  );
}

// The verdict band — the compare page's conclusion, reused on the share card.
// A left accent rule (member skin color, or graphite when free) leads into the
// winner line and a top scenario, so the shared image carries a real takeaway,
// not just a table.
function VerdictBand({
  verdict,
  accent,
  translate,
}: {
  verdict: ReturnType<typeof computeVerdict>;
  accent: string | null;
  translate: (s: string) => string;
}) {
  const bar = accent ?? "rgba(0,0,0,0.82)";
  const winnerColor = accent ?? "rgb(var(--text))";
  if (!verdict.ok) {
    return <div style={{ height: 0 }} />;
  }
  const a0 = Math.round(verdict.averages[0].avg);
  const a1 = Math.round(verdict.averages[1].avg);
  const topScenario = verdict.scenarios[0];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 18,
        padding: "16px 20px",
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.08)",
        background: accent
          ? `linear-gradient(90deg, ${accent}14, rgba(255,255,255,0.5))`
          : "rgba(255,255,255,0.6)",
      }}
    >
      <div style={{ width: 4, borderRadius: 4, background: bar, flexShrink: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontFamily: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.3em",
            color: "rgba(0,0,0,0.5)",
          }}
        >
          {translate("The verdict")}
        </span>
        <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1, color: "rgb(var(--text))" }}>
          {verdict.evenMatch ? (
            translate("A dead heat.")
          ) : (
            <>
              <span style={{ color: winnerColor }}>{verdict.averages[0].name}</span> {translate("takes it.")}
            </>
          )}
        </span>
        {topScenario ? (
          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,0.6)", letterSpacing: "-0.005em" }}>
            {translate("Best for")} {translate(metricLabel(topScenario.metrics[0]))}: {topScenario.name}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, color: winnerColor }}>{a0}</span>
          <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(0,0,0,0.45)" }}>
            {translate("avg score")}
          </span>
        </div>
        <span style={{ fontSize: 18, fontWeight: 600, color: "rgba(0,0,0,0.3)" }}>vs</span>
        <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, color: "rgba(0,0,0,0.4)" }}>{a1}</span>
      </div>
    </div>
  );
}

// Free-tier watermark: a faint diagonal lattice of the wordmark tiled across the
// whole card. Rendered as real DOM so modern-screenshot rasterizes it into the
// PNG. Members export without it.
function Watermark() {
  const rows = Array.from({ length: 9 });
  const cols = Array.from({ length: 6 });
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 3,
        pointerEvents: "none",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-around",
        transform: "rotate(-24deg) scale(1.4)",
        transformOrigin: "center",
      }}
    >
      {rows.map((_, r) => (
        <div key={r} style={{ display: "flex", justifyContent: "space-around", gap: 48 }}>
          {cols.map((__, c) => (
            <span
              key={c}
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "0.06em",
                whiteSpace: "nowrap",
                color: "rgba(0,0,0,0.045)",
              }}
            >
              snkrfeature.com
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
