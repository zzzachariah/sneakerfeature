"use client";

import { CardFrame } from "@/components/card/card-frame";
import { getLineStyle } from "@/components/compare/compare-metrics";
import { useLocale } from "@/components/i18n/locale-provider";
import { proxiedImageSrc } from "@/lib/card/proxy-image";
import type { RecommendationItem } from "@/lib/ai/types";

// A shareable spec sheet won't fit more than this many shoes legibly, and the
// overlay radar only has five distinct line styles.
const MAX_REPORT = 4;

const RADAR_SIZE = 360;
const RADAR_CX = RADAR_SIZE / 2;
const RADAR_CY = RADAR_SIZE / 2;
const RADAR_R = 132;
const RADAR_RINGS = [0.2, 0.4, 0.6, 0.8, 1];

function StarRow({ value, size = 18 }: { value: number; size?: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 1 }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const pct = Math.max(0, Math.min(100, (value - i) * 100));
        return (
          <span key={i} style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
            <span style={{ position: "absolute", inset: 0, fontSize: size, lineHeight: `${size}px`, color: "rgba(0,0,0,0.15)" }}>★</span>
            <span style={{ position: "absolute", top: 0, left: 0, width: `${pct}%`, height: size, overflow: "hidden", fontSize: size, lineHeight: `${size}px`, color: "#f5a623" }}>★</span>
          </span>
        );
      })}
    </span>
  );
}

function ReportRadar({ recs }: { recs: RecommendationItem[] }) {
  const { translate } = useLocale();
  const axes = recs[0]?.radar ?? [];
  const n = axes.length;
  if (n === 0) return null;
  const angles = axes.map((_, i) => ((-90 + i * (360 / n)) * Math.PI) / 180);

  const ringPoints = (ratio: number) =>
    angles.map((a) => `${RADAR_CX + ratio * RADAR_R * Math.cos(a)},${RADAR_CY + ratio * RADAR_R * Math.sin(a)}`).join(" ");

  const shoePoints = (rec: RecommendationItem) =>
    angles
      .map((a, i) => {
        const v = Math.max(0, Math.min(100, rec.radar[i]?.score ?? 0)) / 100;
        return `${RADAR_CX + v * RADAR_R * Math.cos(a)},${RADAR_CY + v * RADAR_R * Math.sin(a)}`;
      })
      .join(" ");

  return (
    <svg
      viewBox={`-44 -30 ${RADAR_SIZE + 88} ${RADAR_SIZE + 60}`}
      width={360}
      height={360}
      style={{ display: "block", overflow: "visible", flexShrink: 0 }}
    >
      {RADAR_RINGS.map((ratio) => (
        <polygon key={ratio} points={ringPoints(ratio)} fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth={0.7} />
      ))}
      {angles.map((a, i) => (
        <line
          key={`spoke-${i}`}
          x1={RADAR_CX}
          y1={RADAR_CY}
          x2={RADAR_CX + RADAR_R * Math.cos(a)}
          y2={RADAR_CY + RADAR_R * Math.sin(a)}
          stroke="rgba(0,0,0,0.08)"
          strokeWidth={0.7}
        />
      ))}
      {recs.map((rec, si) => {
        const style = getLineStyle(si);
        return (
          <polygon
            key={rec.shoe_id}
            points={shoePoints(rec)}
            fill={`rgba(0,0,0,${0.05 + 0.015 * (recs.length - si)})`}
            stroke={`rgba(0,0,0,${style.opacity})`}
            strokeWidth={style.strokeWidth + 0.4}
            strokeDasharray={style.dashArray}
            strokeLinejoin="round"
          />
        );
      })}
      {angles.map((a, i) => {
        const lx = RADAR_CX + (RADAR_R + 28) * Math.cos(a);
        const ly = RADAR_CY + (RADAR_R + 28) * Math.sin(a);
        return (
          <text
            key={`label-${i}`}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fontWeight={700}
            fill="rgba(0,0,0,0.62)"
            letterSpacing="0.14em"
            style={{ textTransform: "uppercase" }}
          >
            {translate(axes[i].label).toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}

function TechLine({ label, value }: { label: string; value: string | null }) {
  const { translate } = useLocale();
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 6, fontSize: 13, lineHeight: 1.35 }}>
      <span style={{ flexShrink: 0, fontWeight: 700, color: "rgb(var(--subtext))", minWidth: 92 }}>{translate(label)}</span>
      <span style={{ color: "rgb(var(--text))" }}>{value}</span>
    </div>
  );
}

// Render the AI's pre-card explanation: turn **…** spans into bold and keep the
// paragraph breaks (the container is pre-wrap and the card grows to fit, so the
// full reply is shown rather than clamped).
function renderSummary(text: string) {
  const normalized = text.trim().replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return normalized.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    return bold ? (
      <strong key={i} style={{ fontWeight: 800 }}>
        {bold[1]}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    );
  });
}

export function RecommendationReportCard({
  requestText,
  summary,
  recommendations
}: {
  requestText: string;
  // The AI's natural-language reply shown above the cards in chat — included so
  // the shared poster carries the same context the user read before the picks.
  summary?: string;
  recommendations: RecommendationItem[];
}) {
  const { translate } = useLocale();
  const recs = recommendations.slice(0, MAX_REPORT);
  const hasSummary = Boolean(summary && summary.trim());

  return (
    <CardFrame variant="compare" grow>
      <div style={{ display: "flex", flexDirection: "column", paddingTop: 30, paddingBottom: 26, gap: 16 }}>
        {/* Title + request */}
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3em", color: "rgb(var(--subtext))" }}>
            {translate("AI Picks")}
          </span>
          <h1 style={{ margin: "6px 0 0", fontSize: 34, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.1, color: "rgb(var(--text))" }}>
            {translate("Recommendation report")}
          </h1>
          {requestText ? (
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 15,
                lineHeight: 1.4,
                color: "rgb(var(--subtext))",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden"
              }}
            >
              <span style={{ fontWeight: 700 }}>{translate("Request")}: </span>
              {requestText}
            </p>
          ) : null}
          {hasSummary ? (
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 15,
                lineHeight: 1.5,
                color: "rgb(var(--text))",
                whiteSpace: "pre-wrap"
              }}
            >
              {renderSummary(summary as string)}
            </p>
          ) : null}
        </div>

        {/* Overlay radar + legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <ReportRadar recs={recs} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, flex: 1 }}>
            {recs.map((rec, i) => {
              const style = getLineStyle(i);
              return (
                <div key={rec.shoe_id} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <svg width={34} height={10} style={{ flexShrink: 0 }} aria-hidden>
                    <line
                      x1={0}
                      y1={5}
                      x2={34}
                      y2={5}
                      stroke={`rgba(0,0,0,${style.opacity})`}
                      strokeWidth={style.strokeWidth + 1}
                      strokeDasharray={style.dashArray}
                    />
                  </svg>
                  <span style={{ flexShrink: 0, fontSize: 15, fontWeight: 800, color: "rgb(var(--text))" }}>{i + 1}.</span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 15,
                      fontWeight: 600,
                      color: "rgb(var(--text))",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    {rec.shoe_name}
                  </span>
                  <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <StarRow value={rec.stars} size={15} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "rgb(var(--subtext))" }}>{rec.stars.toFixed(1)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-pick detail: tech + reason */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {recs.map((rec, i) => (
            <div
              key={rec.shoe_id}
              style={{
                display: "flex",
                gap: 16,
                padding: "14px 0",
                borderTop: "1px solid rgba(0,0,0,0.08)"
              }}
            >
              <div style={{ position: "relative", flexShrink: 0, width: 84, height: 84 }}>
                <span
                  style={{
                    position: "absolute",
                    top: -6,
                    left: -6,
                    zIndex: 1,
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    background: "rgb(var(--text))",
                    color: "rgb(var(--bg))",
                    fontSize: 13,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {i + 1}
                </span>
                {rec.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proxiedImageSrc(rec.image_url)}
                    alt=""
                    crossOrigin="anonymous"
                    style={{ width: 84, height: 84, objectFit: "contain" }}
                  />
                ) : (
                  <div style={{ width: 84, height: 84, borderRadius: 12, background: "rgba(0,0,0,0.05)" }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", color: "rgb(var(--text))" }}>
                    {rec.shoe_name}
                    <span style={{ fontSize: 14, fontWeight: 500, color: "rgb(var(--subtext))" }}> · {rec.brand}</span>
                  </span>
                  <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <StarRow value={rec.stars} size={16} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "rgb(var(--subtext))" }}>{rec.stars.toFixed(1)}</span>
                  </span>
                </div>
                {rec.reason ? (
                  <p
                    style={{
                      margin: "3px 0 7px",
                      fontSize: 14,
                      lineHeight: 1.4,
                      color: "rgb(var(--text))",
                      display: "-webkit-box",
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden"
                    }}
                  >
                    {rec.reason}
                  </p>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 18, rowGap: 3 }}>
                  <TechLine label="Forefoot Midsole" value={rec.tech.forefoot} />
                  <TechLine label="Outsole" value={rec.tech.outsole} />
                  <TechLine label="Heel Midsole" value={rec.tech.heel} />
                  <TechLine label="Upper" value={rec.tech.upper} />
                </div>
                {(rec.pros.length > 0 || rec.cons.length > 0) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 18px", marginTop: 5 }}>
                    {rec.pros.length > 0 && (
                      <span style={{ fontSize: 13, lineHeight: 1.35 }}>
                        <span style={{ fontWeight: 700, color: "#15803d" }}>＋ {translate("Pros")}: </span>
                        <span style={{ color: "rgb(var(--text))" }}>{rec.pros.join(" · ")}</span>
                      </span>
                    )}
                    {rec.cons.length > 0 && (
                      <span style={{ fontSize: 13, lineHeight: 1.35 }}>
                        <span style={{ fontWeight: 700, color: "#be123c" }}>－ {translate("Cons")}: </span>
                        <span style={{ color: "rgb(var(--text))" }}>{rec.cons.join(" · ")}</span>
                      </span>
                    )}
                  </div>
                )}
                {rec.references && rec.references.length > 0 && (
                  <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 700, color: "rgb(var(--subtext))" }}>{translate("References")}: </span>
                    <span style={{ color: "rgb(var(--text))" }}>
                      {rec.references.map((ref, ri) => (
                        <span key={ri}>
                          {ri > 0 && " · "}
                          [{ri + 1}] {ref.title}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </CardFrame>
  );
}
