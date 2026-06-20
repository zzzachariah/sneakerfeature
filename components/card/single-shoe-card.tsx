"use client";

import { CardFrame } from "@/components/card/card-frame";
import { CardStaticRadar } from "@/components/card/card-static-radar";
import { useTranslatedText } from "@/components/i18n/use-translated-text";
import { useLocale } from "@/components/i18n/locale-provider";
import { pickLocalized } from "@/components/i18n/localized-field";
import type { RadarAxis } from "@/components/detail/performance-radar";
import { proxiedImageSrc } from "@/lib/card/proxy-image";
import { storyExcerpt } from "@/lib/card/story-excerpt";
import type { Shoe } from "@/lib/types";

type Props = {
  shoe: Shoe;
  axes: RadarAxis[];
};

const TECH_FIELDS: Array<{
  key: keyof Shoe["spec"];
  // Stored Chinese counterpart column for `key`.
  zhKey: keyof Shoe["spec"];
  // The label is looked up against translate() — using the underscore form
  // because the space form is on the protected-no-translate list site-wide.
  labelKey: string;
  englishLabel: string;
}> = [
  { key: "forefoot_midsole_tech", zhKey: "forefoot_midsole_tech_zh", labelKey: "forefoot_midsole_tech", englishLabel: "Forefoot Midsole" },
  { key: "heel_midsole_tech", zhKey: "heel_midsole_tech_zh", labelKey: "heel_midsole_tech", englishLabel: "Heel Midsole" },
  { key: "outsole_tech", zhKey: "outsole_tech_zh", labelKey: "outsole_tech", englishLabel: "Outsole" },
  { key: "upper_tech", zhKey: "upper_tech_zh", labelKey: "upper_tech", englishLabel: "Upper" },
];

function nameFontSize(name: string): number {
  const len = name.length;
  if (len <= 14) return 96;
  if (len <= 20) return 80;
  if (len <= 28) return 68;
  return 56;
}

function PlaystyleSummary({ text }: { text: string }) {
  // `text` is already localized (stored zh / English fallback).
  return (
    <p
      style={{
        fontSize: 17,
        lineHeight: 1.42,
        color: "rgba(0,0,0,0.62)",
        letterSpacing: "-0.005em",
        margin: 0,
        maxWidth: 760,
      }}
    >
      {text}
    </p>
  );
}

function StoryBlock({
  storyTitle,
  content,
}: {
  storyTitle: string;
  content: string | null | undefined;
}) {
  const { translate } = useLocale();
  // storyTitle/content are already localized upstream.
  const excerpt = storyExcerpt(content || "");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        borderLeft: "2px solid rgba(0,0,0,0.85)",
        paddingLeft: 24,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.32em",
          color: "rgba(0,0,0,0.5)",
        }}
      >
        {translate("Story")}
      </span>
      <h3
        style={{
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
          margin: 0,
          color: "rgb(var(--text))",
        }}
      >
        {storyTitle}
      </h3>
      {excerpt ? (
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.55,
            color: "rgba(0,0,0,0.7)",
            letterSpacing: "-0.005em",
            margin: 0,
          }}
        >
          {excerpt}
        </p>
      ) : (
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.55,
            color: "rgba(0,0,0,0.4)",
            letterSpacing: "-0.005em",
            margin: 0,
            fontStyle: "italic",
          }}
        >
          {translate("No editorial story yet.")}
        </p>
      )}
    </div>
  );
}

export function SingleShoeCard({ shoe, axes }: Props) {
  const { translate, locale } = useLocale();
  const storyTitle =
    pickLocalized(locale, shoe.story?.title, shoe.story?.title_zh)?.trim() ||
    `${shoe.brand} ${shoe.shoe_name}`;
  const storyContent = pickLocalized(locale, shoe.story?.content, shoe.story?.content_zh);
  const playstyle = pickLocalized(locale, shoe.spec.playstyle_summary, shoe.spec.playstyle_summary_zh);
  const fontSize = nameFontSize(shoe.shoe_name);
  const translatedCategory = useTranslatedText(shoe.category ?? "", { contentType: "descriptive" });
  const eyebrowParts = [
    shoe.brand,
    shoe.release_year != null ? String(shoe.release_year) : null,
    translatedCategory.trim() ? translatedCategory : null,
  ].filter(Boolean);

  return (
    <CardFrame variant="single">
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateRows: "auto auto 1fr auto auto",
          rowGap: 28,
          paddingTop: 36,
          paddingBottom: 32,
        }}
      >
        {/* Eyebrow + name + playstyle */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <span
            style={{
              fontFamily: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.32em",
              color: "rgba(0,0,0,0.55)",
            }}
          >
            {eyebrowParts.join(" · ")}
          </span>
          <h1
            style={{
              fontSize,
              fontWeight: 900,
              letterSpacing: "-0.045em",
              lineHeight: 0.96,
              color: "rgb(var(--text))",
              margin: 0,
            }}
          >
            {shoe.shoe_name}
          </h1>
          {playstyle ? <PlaystyleSummary text={playstyle} /> : null}
        </div>

        {/* Hairline */}
        <div style={{ height: 1, background: "rgba(0,0,0,0.07)" }} />

        {/* Hero image */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            minHeight: 0,
          }}
        >
          {shoe.image_url ? (
            <div
              style={{
                position: "relative",
                width: "78%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "12%",
                  right: "12%",
                  bottom: "8%",
                  height: 36,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(ellipse at center, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.0) 70%)",
                  filter: "blur(8px)",
                }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proxiedImageSrc(shoe.image_url)}
                alt=""
                crossOrigin="anonymous"
                style={{
                  position: "relative",
                  maxWidth: "100%",
                  maxHeight: "100%",
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                  filter:
                    "drop-shadow(0 60px 80px rgba(0,0,0,0.18)) drop-shadow(0 12px 24px rgba(0,0,0,0.08))",
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: "78%",
                height: "70%",
                border: "1px dashed rgba(0,0,0,0.18)",
                borderRadius: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(0,0,0,0.45)",
                fontSize: 14,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}
            >
              {translate("No image")}
            </div>
          )}
        </div>

        {/* Tech 2x2 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
          }}
        >
          {TECH_FIELDS.map((field) => {
            const value = pickLocalized(
              locale,
              (shoe.spec[field.key] as string | null | undefined) ?? null,
              (shoe.spec[field.zhKey] as string | null | undefined) ?? null
            );
            const translatedLabel = translate(field.labelKey);
            const labelText =
              translatedLabel === field.labelKey ? field.englishLabel : translatedLabel;
            return (
              <div
                key={String(field.key)}
                style={{
                  border: "1px solid rgba(0,0,0,0.1)",
                  borderRadius: 12,
                  padding: "14px 18px",
                  background: "rgba(255,255,255,0.7)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  minHeight: 80,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.28em",
                    color: "rgba(0,0,0,0.5)",
                  }}
                >
                  {labelText}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
                    fontSize: 16,
                    fontWeight: 600,
                    color: value ? "rgb(var(--text))" : "rgba(0,0,0,0.35)",
                    letterSpacing: "-0.01em",
                    lineHeight: 1.25,
                  }}
                >
                  {value ? value : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Radar + Story */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: 36,
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CardStaticRadar axes={axes} size={340} />
          </div>
          <StoryBlock storyTitle={storyTitle} content={storyContent} />
        </div>
      </div>
    </CardFrame>
  );
}
