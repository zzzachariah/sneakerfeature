"use client";

// A polished, self-contained card rendered off-screen and screenshotted into the
// shareable / downloadable image. Uses explicit inline styling (not theme CSS
// vars) so the exported image looks the same regardless of light/dark mode.

import { forwardRef } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import {
  WIDTH_LABEL,
  INSTEP_LABEL,
  TOE_SHORT,
  HALLUX_LABEL,
  HALLUX_SCALE,
  WIDTH_SCALE,
  INSTEP_SCALE,
  SIDE_LABEL,
  TOE_ORDER,
  type FootScanResult
} from "@/lib/foot-scan/types";

const ACCENT = "#8b7bff";

function Bar({ value, leftLabel, rightLabel }: { value: number; leftLabel: string; rightLabel: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ position: "relative", height: 10, borderRadius: 999, background: "rgba(255,255,255,0.12)" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: `${Math.round(value * 100)}%`,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${ACCENT}, #56d8e6)`
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -3,
            height: 16,
            width: 16,
            marginLeft: -8,
            left: `${Math.round(value * 100)}%`,
            borderRadius: 999,
            background: "#fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.4)"
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>{label}</span>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{value}</span>
      </div>
      {children}
    </div>
  );
}

export const ReportCard = forwardRef<HTMLDivElement, { result: FootScanResult }>(function ReportCard({ result }, ref) {
  const { translate } = useLocale();
  const p = result.primary;
  const m = p.measurements;

  return (
    <div
      ref={ref}
      style={{
        width: 460,
        boxSizing: "border-box",
        padding: 32,
        borderRadius: 28,
        background: "linear-gradient(155deg, #0d1326 0%, #1a1233 55%, #251038 100%)",
        color: "#ffffff",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: ACCENT, fontWeight: 700 }}>
          {translate("Foot Scan")}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.85 }}>sneakerfeature</span>
      </div>

      <h1 style={{ margin: "14px 0 2px", fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>
        {translate("My Foot Type")}
      </h1>
      <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{translate(SIDE_LABEL[p.side])}</p>

      <Row label={translate("Width")} value={translate(WIDTH_LABEL[p.traits.width])}>
        <Bar value={WIDTH_SCALE[p.traits.width]} leftLabel={translate("Narrow")} rightLabel={translate("Wide")} />
      </Row>

      <Row label={translate("Instep")} value={translate(INSTEP_LABEL[p.traits.instep])}>
        <Bar value={INSTEP_SCALE[p.traits.instep]} leftLabel={translate("Low instep")} rightLabel={translate("High instep")} />
      </Row>

      <Row label={translate("Big-toe alignment")} value={translate(HALLUX_LABEL[p.traits.hallux ?? "none"])}>
        <Bar value={HALLUX_SCALE[p.traits.hallux ?? "none"]} leftLabel={translate("Straight")} rightLabel={translate("Leaning")} />
      </Row>

      <div style={{ marginTop: 18 }}>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>{translate("Toe shape")}</span>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {TOE_ORDER.map((tt) => {
            const active = tt === p.traits.toe_shape;
            return (
              <span
                key={tt}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "7px 4px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: active ? 700 : 500,
                  background: active ? ACCENT : "rgba(255,255,255,0.08)",
                  color: active ? "#10101a" : "rgba(255,255,255,0.7)"
                }}
              >
                {translate(TOE_SHORT[tt])}
              </span>
            );
          })}
        </div>
      </div>

      <div
        style={{
          marginTop: 22,
          paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,0.12)",
          display: "flex",
          gap: 24,
          fontFamily: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: 13,
          color: "rgba(255,255,255,0.7)"
        }}
      >
        <span>
          {translate("Length")} <b style={{ color: "#fff" }}>~{(m.foot_length_mm / 10).toFixed(1)}cm</b>
        </span>
        {m.foot_width_mm !== null && (
          <span>
            {translate("Width")} <b style={{ color: "#fff" }}>~{(m.foot_width_mm / 10).toFixed(1)}cm</b>
          </span>
        )}
      </div>

      <p style={{ margin: "16px 0 0", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>snkrfeature.com</p>
    </div>
  );
});
