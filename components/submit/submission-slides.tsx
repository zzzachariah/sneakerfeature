"use client";

import { forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileWidget } from "@/components/ui/turnstile";
import { useLocale } from "@/components/i18n/locale-provider";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";

export type SubmissionSlidesHandle = {
  goTo: (index: number) => void;
};

type FieldDef = {
  name: string;
  label: string;
  required?: boolean;
  type?: "text" | "number";
};

const IDENTITY_FIELDS: FieldDef[] = [
  { name: "shoe_name", label: "Shoe name", required: true },
  { name: "brand", label: "Brand", required: true },
  { name: "model", label: "Model / version" },
  { name: "release_year", label: "Release year", type: "number" }
];

const TECH_FIELDS: FieldDef[] = [
  { name: "forefoot_midsole_tech", label: "Forefoot midsole tech" },
  { name: "heel_midsole_tech", label: "Heel midsole tech" },
  { name: "outsole_tech", label: "Outsole tech" },
  { name: "upper_tech", label: "Upper tech" }
];

const FEEL_FIELDS: FieldDef[] = [
  { name: "cushioning_feel", label: "Cushioning feel" },
  { name: "court_feel", label: "Court feel" },
  { name: "bounce", label: "Bounce" },
  { name: "stability", label: "Stability" },
  { name: "traction", label: "Traction" },
  { name: "fit", label: "Fit / containment" }
];

// Section ids, indexed to match the legacy goTo(step) calls from the form.
const SECTION_IDS = ["submit-identity", "submit-tech", "submit-feel", "submit-story"];
const SECTION_OFFSET = { scrollMarginTop: "var(--top-nav-h)" } as const;

type Props = {
  mode: "new_shoe" | "correction";
  targetShoeLabel?: string;
  initialValues: Record<string, string | number | null | undefined>;
  token: string;
  onToken: (token: string) => void;
  isSubmitting: boolean;
  message: string;
  isError: boolean;
};

// Continuous-scroll submission form (Identity → Tech → Feel → Story). The navbar
// shows a 4-stop indicator. No slide deck, so a stray scroll/swipe can never
// jump the form; the validation `goTo(step)` calls scroll to the section. The
// component name is kept for import stability.
export const SubmissionSlides = forwardRef<SubmissionSlidesHandle, Props>(function SubmissionSlides(
  { mode, targetShoeLabel, initialValues, token, onToken, isSubmitting, message, isError },
  ref
) {
  const { translate } = useLocale();

  useNavScrollSections([
    { id: "submit-identity", label: translate("Identity") },
    { id: "submit-tech", label: translate("Tech") },
    { id: "submit-feel", label: translate("Feel") },
    { id: "submit-story", label: translate("Story") }
  ]);

  useImperativeHandle(
    ref,
    () => ({
      goTo: (index: number) => {
        const id = SECTION_IDS[index];
        if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }),
    []
  );

  function valueOf(name: string) {
    const v = initialValues[name];
    return v == null ? "" : String(v);
  }

  return (
    <div className="has-mobile-nav-pad">
      {/* Identity */}
      <section id="submit-identity" style={SECTION_OFFSET} className="container-shell py-8 md:py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <SlideHeader
            eyebrow={translate("Step 1 of 4")}
            title={mode === "correction" ? translate("Submit correction") : translate("Submit sneaker information")}
            description={
              mode === "correction"
                ? `${translate("You're submitting a correction for")} ${targetShoeLabel ?? translate("an existing published shoe")}. ${translate("This goes to the same review queue and approval will update the existing record.")}`
                : translate("Let's start with what shoe this is.")
            }
          />
          <FieldGrid fields={IDENTITY_FIELDS} valueOf={valueOf} translate={translate} cols={2} />
        </div>
      </section>

      {/* Tech */}
      <section id="submit-tech" style={SECTION_OFFSET} className="container-shell py-8 md:py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <SlideHeader
            eyebrow={translate("Step 2 of 4")}
            title={translate("Tech")}
            description={translate("Materials and construction details. All optional.")}
          />
          <FieldGrid fields={TECH_FIELDS} valueOf={valueOf} translate={translate} cols={2} />
        </div>
      </section>

      {/* Feel */}
      <section id="submit-feel" style={SECTION_OFFSET} className="container-shell py-8 md:py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <SlideHeader
            eyebrow={translate("Step 3 of 4")}
            title={translate("Feel")}
            description={translate("Subjective performance qualities, in your own words.")}
          />
          <FieldGrid fields={FEEL_FIELDS} valueOf={valueOf} translate={translate} cols={3} />
        </div>
      </section>

      {/* Story + Submit */}
      <section id="submit-story" style={SECTION_OFFSET} className="container-shell py-8 md:py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <SlideHeader
            eyebrow={translate("Step 4 of 4")}
            title={translate("Story")}
            description={translate("Add story + raw notes + verification, then submit.")}
          />
          <div>
            <label className="mb-1 block text-xs soft-text">{translate("Story title")}</label>
            <Input
              name="story_title"
              defaultValue={valueOf("story_title")}
              placeholder={translate("Short headline for the story.")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs soft-text">{translate("Story / background notes")}</label>
            <Textarea
              name="story_notes"
              defaultValue={valueOf("story_notes")}
              className="min-h-24"
              placeholder={translate("Release context, design intent, notable versions, community notes.")}
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-2 text-xs soft-text">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[rgb(var(--accent))]" />
              {translate("Raw notes (required)")}
            </label>
            <Textarea
              name="raw_text"
              defaultValue={valueOf("raw_text")}
              className="min-h-32"
              placeholder={translate("Paste your full performance observations and source snippets...")}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs soft-text">{translate("Tags (comma separated)")}</label>
              <Input name="tags" defaultValue={valueOf("tags")} placeholder={translate("Tags (comma separated)")} />
            </div>
            <div>
              <label className="mb-1 block text-xs soft-text">{translate("Source links (comma separated)")}</label>
              <Input
                name="source_links"
                defaultValue={valueOf("source_links")}
                placeholder={translate("Source links (comma separated)")}
              />
            </div>
          </div>
          <div className="rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.5)] p-3">
            <TurnstileWidget onToken={onToken} />
          </div>
          <div className="flex flex-col items-stretch gap-3 pt-1 sm:flex-row sm:items-center">
            <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
              {isSubmitting ? translate("Submitting...") : translate("Submit for review")}
            </Button>
            {message && isError && <p className="text-xs text-red-400">{message}</p>}
            {!token && (
              <p className="text-[11px] soft-text">{translate("Complete verification above to enable submit.")}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
});

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
      <h1
        className="font-extrabold leading-[1] tracking-[-0.04em]"
        style={{ fontSize: "clamp(1.8rem, 3.6vw, 2.8rem)" }}
      >
        {title}
      </h1>
      <p className="text-sm soft-text">{description}</p>
    </div>
  );
}

function FieldGrid({
  fields,
  valueOf,
  translate,
  cols
}: {
  fields: FieldDef[];
  valueOf: (name: string) => string;
  translate: (s: string) => string;
  cols: 1 | 2 | 3;
}) {
  const colsClass = cols === 3 ? "md:grid-cols-3" : cols === 2 ? "md:grid-cols-2" : "";
  return (
    <div className={`grid gap-4 ${colsClass}`}>
      {fields.map((f) => (
        <div key={f.name}>
          <label className="mb-1 flex items-center gap-2 text-xs soft-text">
            {f.required && (
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[rgb(var(--accent))]" />
            )}
            {translate(f.label)}
          </label>
          <Input
            name={f.name}
            type={f.type ?? "text"}
            placeholder={translate(f.label)}
            defaultValue={valueOf(f.name)}
          />
        </div>
      ))}
    </div>
  );
}
