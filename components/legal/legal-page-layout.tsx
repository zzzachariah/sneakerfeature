"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import type { BilingualLegalDoc } from "@/lib/legal/content";

/**
 * Shared chrome for the legal pages (Terms / Privacy / Disclaimer).
 *
 * Renders the hand-authored bilingual content from a {@link BilingualLegalDoc},
 * selecting the current language with `doc[locale]`. Styling reuses the app's
 * existing design tokens and classes (`container-shell`, `surface-card`,
 * `premium-border`, `t-display-sm`, `t-eyebrow`, `soft-text`) so the pages match
 * the rest of the site and adapt to dark mode automatically.
 *
 * `data-no-translate` stops the dynamic machine-translation layer from touching
 * this content — language switching here is handled by re-rendering `doc[locale]`.
 */
export function LegalPageLayout({ doc }: { doc: BilingualLegalDoc }) {
  const { locale } = useLocale();
  const d = doc[locale];
  const tocLabel = locale === "zh" ? "目录" : "Contents";

  return (
    <main
      className="container-shell pt-10 md:pt-16"
      style={{ paddingBottom: "calc(var(--mobile-nav-h) + 2rem)" }}
      data-no-translate="true"
    >
      <div className="mx-auto max-w-3xl">
        <header>
          <p className="t-eyebrow">{d.eyebrow}</p>
          <h1 className="t-display-sm mt-2">{d.title}</h1>
          <p className="mt-3 text-sm soft-text">
            {d.lastUpdated} · sneakerfeature
          </p>
        </header>

        {d.intro && d.intro.length > 0 && (
          <div className="mt-5 space-y-3">
            {d.intro.map((p, i) => (
              <p key={i} className="text-[0.95rem] leading-[1.7] soft-text">
                {p}
              </p>
            ))}
          </div>
        )}

        {/* Table of contents */}
        <nav
          aria-label={tocLabel}
          className="surface-soft mt-6 rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.45)] p-4 md:p-5"
        >
          <p className="t-eyebrow">{tocLabel}</p>
          <ol className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {d.sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-[0.86rem] text-[rgb(var(--subtext))] underline-offset-4 transition-colors hover:text-[rgb(var(--text))] hover:underline"
                >
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Body */}
        <article className="surface-card premium-border mt-6 space-y-8 rounded-3xl p-6 md:space-y-10 md:p-10">
          {d.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-lg font-semibold tracking-[-0.01em] md:text-xl">
                {s.heading}
              </h2>
              {s.paragraphs?.map((p, i) => (
                <p key={i} className="mt-3 text-[0.92rem] leading-[1.7] soft-text">
                  {p}
                </p>
              ))}
              {s.bullets && s.bullets.length > 0 && (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[0.92rem] leading-[1.7] soft-text">
                  {s.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>

        {/* Contact callout */}
        <div className="surface-soft mt-6 rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.5)] p-5">
          <p className="text-[0.92rem] leading-[1.7] soft-text">
            {d.contactNote}{" "}
            <a
              href={`mailto:${d.contactEmail}`}
              className="font-medium text-[rgb(var(--text))] underline-offset-4 hover:underline"
            >
              {d.contactEmail}
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
