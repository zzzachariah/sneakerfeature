"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Share2 } from "lucide-react";
import { CardPreviewModal } from "@/components/card/card-preview-modal";
import { CommentSection } from "@/components/detail/comment-section";
import { BloggerReviewsSlideBody } from "@/components/detail/blogger-reviews-slide";
import { PerformanceRadar, type RadarAxis } from "@/components/detail/performance-radar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { DynamicTranslatedText } from "@/components/i18n/dynamic-translated-text";
import { pickLocalized } from "@/components/i18n/localized-field";
import { useLocale } from "@/components/i18n/locale-provider";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRatingSlot } from "@/components/shoe/star-rating-slot";
import { DimRatingList } from "@/components/shoe/dim-rating-list";
import { Reveal } from "@/components/motion/reveal";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { cn } from "@/lib/utils";
import type { BloggerReview, Shoe, ShoeImageRecord } from "@/lib/types";

type ImageAction = "find" | "approve" | "reject";
type ImageActionLoading = ImageAction | "preview_url" | "confirm_url";

type ShoeDetailImageState = {
  approved: ShoeImageRecord | null;
  pending: ShoeImageRecord | null;
  latestRejected: ShoeImageRecord | null;
};

type TechCardConfig = {
  value: string | null | undefined;
  field: string;
};

type PreviewUpload = {
  storage_path: string;
  public_url: string;
};

type Props = {
  shoe: Shoe;
  related: Shoe[];
  isAdmin: boolean;
  isLoggedIn: boolean;
  imageState: ShoeDetailImageState;
  reviewImage: string | null | undefined;
  hasPendingImage: boolean;
  imageActionLoading: ImageActionLoading | null;
  imageActionError: string | null;
  imageActionSuccess: string | null;
  runAdminImageAction: (action: ImageAction) => void;
  pasteUrl: string;
  onPasteUrlChange: (value: string) => void;
  previewUpload: PreviewUpload | null;
  onPreviewUrl: () => void;
  onConfirmUpload: () => void;
  onCancelPreview: () => void;
  radarAxes: RadarAxis[];
  extraTechCards: Record<string, TechCardConfig>;
  hasStory: boolean;
  storyTitle: string | undefined;
  storyContent: string | undefined;
  storySourceLabel: string | undefined;
  storySourceUrl: string | undefined;
  specStars: number | null;
  finalStars: number | null;
  bloggerReviews: BloggerReview[];
};

// Legacy in-page hashes → continuous-scroll section ids.
const HASH_TO_ID: Record<string, string> = {
  "#overview": "detail-overview",
  "#performance": "detail-performance",
  "#reviews": "detail-reviews",
  "#story": "detail-story",
  "#comments": "detail-comments",
  "#related": "detail-related"
};

export function ShoeDetailSlides(props: Props) {
  const { translate } = useLocale();
  const [shareOpen, setShareOpen] = useState(false);

  useNavScrollSections([
    { id: "detail-overview", label: translate("Overview") },
    { id: "detail-performance", label: translate("Performance") },
    { id: "detail-reviews", label: translate("Pro reviews") },
    { id: "detail-story", label: translate("Story") },
    { id: "detail-comments", label: translate("Comments") },
    { id: "detail-related", label: translate("Related") }
  ]);

  // Honor legacy #section links on entry.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = HASH_TO_ID[window.location.hash.toLowerCase()];
    if (!id) return;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, []);

  const jumpTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      <div className="has-mobile-nav-pad">
        <DetailSection id="detail-overview">
          <OverviewSection
            {...props}
            onShareCard={() => setShareOpen(true)}
            onJumpToComments={() => jumpTo("detail-comments")}
          />
        </DetailSection>

        <DetailSection id="detail-performance">
          <PerformanceSection
            shoe={props.shoe}
            extraTechCards={props.extraTechCards}
            radarAxes={props.radarAxes}
          />
        </DetailSection>

        <DetailSection id="detail-reviews">
          <ReviewsSection bloggerReviews={props.bloggerReviews} />
        </DetailSection>

        <DetailSection id="detail-story">
          <StorySection {...props} />
        </DetailSection>

        <DetailSection id="detail-comments">
          <CommentsSection {...props} />
        </DetailSection>

        <DetailSection id="detail-related">
          <RelatedSection {...props} />
        </DetailSection>
      </div>

      <CardPreviewModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        mode={{ kind: "single", shoe: props.shoe, axes: props.radarAxes }}
      />
    </>
  );
}

function DetailSection({
  id,
  children,
  className
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      style={{ scrollMarginTop: "var(--top-nav-h)" }}
      className={cn("container-shell py-9 md:py-14", className)}
    >
      {children}
    </section>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="text-center">
      <p className="t-eyebrow">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] md:text-2xl">{title}</h2>
    </div>
  );
}

function OverviewSection({
  shoe,
  reviewImage,
  imageState,
  hasPendingImage,
  isAdmin,
  imageActionLoading,
  imageActionError,
  imageActionSuccess,
  runAdminImageAction,
  pasteUrl,
  onPasteUrlChange,
  previewUpload,
  onPreviewUrl,
  onConfirmUpload,
  onCancelPreview,
  onShareCard,
  finalStars,
  onJumpToComments
}: Props & { onShareCard: () => void; onJumpToComments: () => void }) {
  const { translate, locale } = useLocale();
  const playstyleSummary = pickLocalized(locale, shoe.spec.playstyle_summary, shoe.spec.playstyle_summary_zh);
  return (
    <div className="grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-center md:gap-10">
      <div className="order-2 max-w-2xl md:order-1">
        <p className="t-eyebrow">
          <span data-field-key="brand">{shoe.brand}</span> · {shoe.release_year ?? "TBD"}
        </p>

        <h1 data-field-key="shoe_name" className="t-display-sm mt-2 text-[rgb(var(--text))] md:mt-3">
          {shoe.shoe_name}
        </h1>

        {playstyleSummary ? (
          <p className="mt-3 text-[0.95rem] leading-7 soft-text md:mt-4 md:text-base">{playstyleSummary}</p>
        ) : (
          <p className="mt-3 text-[0.95rem] leading-7 soft-text md:mt-4 md:text-base">
            {translate("No playstyle summary available yet.")}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StarRatingSlot value={finalStars} size="lg" showNumber count={shoe.userRatingCount ?? 0} />
          {finalStars !== null && (
            <button
              type="button"
              onClick={onJumpToComments}
              className="text-xs underline-offset-2 soft-text hover:underline"
            >
              {translate("Rate this")}
            </button>
          )}
        </div>

        {shoe.dimStars ? (
          <div className="mt-4 max-w-md rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.4)] p-3">
            <p className="mb-2 text-[0.65rem] uppercase tracking-[0.14em] soft-text">{translate("By dimension")}</p>
            <DimRatingList stars={shoe.dimStars} size="sm" />
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {(shoe.spec.tags ?? []).map((tag) => (
            <Badge key={tag}>
              <DynamicTranslatedText as="span" text={tag} contentType="descriptive" />
            </Badge>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={`/compare?ids=${shoe.id}`}>
            <Button>{translate("Add to compare")}</Button>
          </Link>
          <Button type="button" variant="secondary" onClick={onShareCard}>
            <Share2 className="mr-1.5 h-3.5 w-3.5" />
            {translate("Share card")}
          </Button>
          <Link href={`/submit/correction/${shoe.id}`}>
            <Button variant="ghost">{translate("Submit correction")}</Button>
          </Link>
        </div>
      </div>

      <div className="order-1 flex flex-col items-center gap-3 md:order-2">
        <div className="w-full max-w-[220px] rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.22)] bg-[rgb(var(--surface))] p-4 shadow-cinematic sm:max-w-[260px] md:max-w-xs md:p-6">
          <ShoeImage
            src={reviewImage}
            alt={`${shoe.brand} ${shoe.shoe_name}`}
            fallbackLabel={translate("No image")}
            variant="detail"
          />
        </div>
        <div className="text-center text-sm">
          {hasPendingImage ? (
            <p className="font-medium text-amber-400">{translate("Image pending review")}</p>
          ) : imageState.approved ? (
            <p className="font-medium text-emerald-400">{translate("Image approved")}</p>
          ) : imageState.latestRejected ? (
            <p className="font-medium text-rose-400">{translate("Image rejected")}</p>
          ) : (
            <p className="font-medium soft-text">{translate("No image")}</p>
          )}
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" onClick={() => runAdminImageAction("find")} disabled={imageActionLoading !== null}>
              {imageActionLoading === "find"
                ? translate("Searching images...")
                : hasPendingImage
                  ? translate("Search again")
                  : translate("Find image")}
            </Button>
            {hasPendingImage && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => runAdminImageAction("approve")}
                  disabled={imageActionLoading !== null}
                >
                  {translate("Approve image")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => runAdminImageAction("reject")}
                  disabled={imageActionLoading !== null}
                >
                  {translate("Reject image")}
                </Button>
              </>
            )}
          </div>
        )}

        {isAdmin && (
          <div className="flex w-full max-w-xs flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="url"
                value={pasteUrl}
                onChange={(event) => onPasteUrlChange(event.target.value)}
                placeholder={translate("Paste image URL")}
                disabled={imageActionLoading !== null || previewUpload !== null}
                className="flex-1 rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.22)] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--text))] placeholder:soft-text disabled:opacity-50"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={onPreviewUrl}
                disabled={imageActionLoading !== null || previewUpload !== null || !pasteUrl.trim()}
              >
                {imageActionLoading === "preview_url" ? translate("Loading...") : translate("Preview")}
              </Button>
            </div>
            {previewUpload && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.22)] bg-[rgb(var(--surface))] p-3">
                <ShoeImage
                  src={previewUpload.public_url}
                  alt={translate("Pasted image preview")}
                  fallbackLabel={translate("No image")}
                  variant="detail"
                />
                <div className="flex gap-2">
                  <Button type="button" onClick={onConfirmUpload} disabled={imageActionLoading !== null}>
                    {imageActionLoading === "confirm_url" ? translate("Uploading...") : translate("Upload")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onCancelPreview}
                    disabled={imageActionLoading !== null}
                  >
                    {translate("Cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {imageActionError && <FeedbackMessage message={imageActionError} isError />}
        {imageActionSuccess && <FeedbackMessage message={imageActionSuccess} />}
      </div>
    </div>
  );
}

// Performance: radar on top, then a clean spec table below — two columns on
// tablet/desktop, a single column on phones (so the enlarged labels and full,
// untruncated text stay readable).
function PerformanceSection({
  shoe,
  extraTechCards,
  radarAxes
}: Pick<Props, "shoe" | "extraTechCards" | "radarAxes">) {
  const { translate, locale } = useLocale();

  const techItems: Array<{ label: string; field: string; value: string | null | undefined }> = [
    {
      label: "Forefoot midsole tech",
      field: "forefoot_midsole_tech",
      value: pickLocalized(locale, shoe.spec.forefoot_midsole_tech, shoe.spec.forefoot_midsole_tech_zh)
    },
    {
      label: "Heel midsole tech",
      field: "heel_midsole_tech",
      value: pickLocalized(locale, shoe.spec.heel_midsole_tech, shoe.spec.heel_midsole_tech_zh)
    },
    ...Object.entries(extraTechCards).map(([label, cfg]) => ({
      label,
      field: cfg.field,
      value: cfg.value
    }))
  ];

  const dimensionItems: Array<{ label: string; field: string; value: string | null | undefined }> = [
    { label: "Cushioning feel", field: "cushioning_feel", value: pickLocalized(locale, shoe.spec.cushioning_feel, shoe.spec.cushioning_feel_zh) },
    { label: "Court feel", field: "court_feel", value: pickLocalized(locale, shoe.spec.court_feel, shoe.spec.court_feel_zh) },
    { label: "Bounce", field: "bounce", value: pickLocalized(locale, shoe.spec.bounce, shoe.spec.bounce_zh) },
    { label: "Stability", field: "stability", value: pickLocalized(locale, shoe.spec.stability, shoe.spec.stability_zh) },
    { label: "Traction", field: "traction", value: pickLocalized(locale, shoe.spec.traction, shoe.spec.traction_zh) },
    { label: "Fit", field: "fit", value: pickLocalized(locale, shoe.spec.fit, shoe.spec.fit_zh) }
  ];

  const items = [...techItems, ...dimensionItems];

  return (
    <div>
      <SectionHeading eyebrow={translate("Analysis")} title={translate("Performance profile")} />

      <Card className="mx-auto mt-6 max-w-xl p-5 md:p-8">
        <PerformanceRadar axes={radarAxes} />
      </Card>

      <div className="mx-auto mt-6 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((it) => (
          <div
            key={it.field}
            className="rounded-2xl border border-[rgb(var(--muted)/0.4)] bg-[rgb(var(--bg-elev)/0.5)] p-4"
          >
            <p className="text-[0.82rem] font-semibold uppercase tracking-[0.1em] text-[rgb(var(--text)/0.7)]">
              {translate(it.label)}
            </p>
            <p
              data-field-key={it.field}
              className="mt-1.5 text-[0.95rem] leading-relaxed text-[rgb(var(--text))]"
            >
              {it.value?.trim() ? it.value : translate("Not yet added")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewsSection({ bloggerReviews }: { bloggerReviews: BloggerReview[] }) {
  return <BloggerReviewsSlideBody reviews={bloggerReviews} />;
}

function StorySection({
  shoe,
  hasStory,
  storyTitle,
  storyContent,
  storySourceLabel,
  storySourceUrl
}: Props) {
  const { translate } = useLocale();
  const sourceText = storySourceLabel || storySourceUrl;
  return (
    <Card className="mx-auto w-full max-w-3xl p-5 sm:p-7 md:p-10">
      <p className="t-eyebrow mb-2 md:mb-3">{translate("Context")}</p>
      <h2 className="text-xl font-semibold tracking-[-0.02em] md:text-3xl">{translate("Story & provenance")}</h2>
      {hasStory ? (
        <div className="mt-4 space-y-3 md:mt-6 md:space-y-4">
          {storyTitle ? (
            <p className="text-base font-semibold md:text-lg">{storyTitle}</p>
          ) : (
            <p data-field-key="shoe_name" className="text-base font-semibold md:text-lg">
              {`${shoe.brand} ${shoe.shoe_name}`}
            </p>
          )}

          {storyContent ? (
            <p className="whitespace-pre-line text-[0.95rem] leading-7 soft-text md:text-base md:leading-8">
              {storyContent}
            </p>
          ) : (
            <p className="text-[0.95rem] leading-7 soft-text md:text-base md:leading-8">
              {translate("No editorial story content yet.")}
            </p>
          )}

          {sourceText ? (
            <p className="border-t border-[rgb(var(--muted)/0.4)] pt-3 text-xs soft-text md:pt-4 md:text-sm">
              {translate("Source")}:{" "}
              {storySourceUrl ? (
                <a
                  href={storySourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-[rgb(var(--text))]"
                >
                  {storySourceLabel || storySourceUrl}
                </a>
              ) : (
                storySourceLabel
              )}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <p className="mt-4 text-[0.95rem] leading-7 soft-text md:mt-6 md:text-base md:leading-8">
            {translate("No editorial story yet.")}
          </p>
          <div className="mt-4 rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--surface)/0.6)] p-3 text-xs soft-text md:mt-5 md:p-4 md:text-sm">
            {translate(
              "Source/evidence: Seed dataset + community validation pipeline. Admin review required before promotion to official records."
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function CommentsSection({ shoe, specStars, isLoggedIn }: Props) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <CommentSection
        shoeId={shoe.id}
        specStars={specStars}
        initialMyDimRatings={shoe.myDimRatings ?? null}
        isLoggedIn={isLoggedIn}
      />
    </div>
  );
}

function RelatedSection({ related }: Props) {
  const { translate } = useLocale();
  return (
    <Card className="mx-auto w-full max-w-4xl p-6 md:p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">{translate("Related shoes")}</h2>
        <Link href="/" className="inline-flex items-center gap-1 text-sm soft-text transition hover:text-[rgb(var(--text))]">
          {translate("Back to database")} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {related.map((item, i) => (
          <Reveal key={item.id} index={i}>
            <Link
              href={`/shoes/${item.slug}`}
              data-field-key="shoe_name"
              className="block rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--surface)/0.6)] p-3 transition hover:border-[rgb(var(--text)/0.35)] hover:bg-[rgb(var(--text)/0.04)]"
            >
              {item.shoe_name}
            </Link>
          </Reveal>
        ))}
      </div>
    </Card>
  );
}
