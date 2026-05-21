"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import type { RecommendationItem } from "@/lib/ai/types";

function starString(stars: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(stars)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

// Print-only report (hidden on screen; isolated via the .print-report rules in
// globals.css). Uses explicit black-on-white inline styles so the PDF looks the
// same regardless of light/dark theme.
export function ReportDocument({
  requestText,
  recommendations
}: {
  requestText: string;
  recommendations: RecommendationItem[];
}) {
  const { translate } = useLocale();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const date = new Date().toLocaleString();

  return (
    <div className="print-report" style={{ color: "#000", background: "#fff", fontSize: "12px", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 4px" }}>{translate("Recommendation report")}</h1>
      <div style={{ color: "#555", marginBottom: "12px" }}>{date}</div>
      {requestText && (
        <p style={{ margin: "0 0 16px" }}>
          <strong>{translate("Request")}：</strong>
          {requestText}
        </p>
      )}

      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {recommendations.map((rec, i) => (
          <li key={rec.shoe_id} style={{ borderTop: "1px solid #ddd", padding: "12px 0", breakInside: "avoid" }}>
            <div style={{ fontSize: "15px", fontWeight: 700 }}>
              {i + 1}. {rec.shoe_name} <span style={{ fontWeight: 400, color: "#666" }}>· {rec.brand}</span>
            </div>
            <div style={{ color: "#b8860b", margin: "2px 0 6px" }}>
              {translate("Recommendation")}: {starString(rec.stars)} {rec.stars.toFixed(1)}
            </div>
            {rec.summary && <div style={{ margin: "0 0 6px" }}>{rec.summary}</div>}
            {rec.pros.length > 0 && (
              <div style={{ margin: "0 0 4px" }}>
                <strong>{translate("Pros")}：</strong>
                {rec.pros.join("；")}
              </div>
            )}
            {rec.cons.length > 0 && (
              <div style={{ margin: "0 0 4px" }}>
                <strong>{translate("Cons")}：</strong>
                {rec.cons.join("；")}
              </div>
            )}
            <div style={{ color: "#555", fontSize: "11px" }}>
              {origin}/shoes/{rec.slug}
            </div>
          </li>
        ))}
      </ol>

      <div style={{ marginTop: "16px", color: "#888", fontSize: "11px" }}>snkrfeature · 智能选鞋</div>
    </div>
  );
}
