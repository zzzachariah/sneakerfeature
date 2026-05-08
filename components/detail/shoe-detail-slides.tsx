"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Share2 } from "lucide-react";
import { CardPreviewModal } from "@/components/card/card-preview-modal";
import { CommentSection } from "@/components/detail/comment-section";
import { PerformanceRadar, type RadarAxis } from "@/components/detail/performance-radar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { DynamicTranslatedText } from "@/components/i18n/dynamic-translated-text";
import { useLocale } from "@/components/i18n/locale-provider";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRating } from "@/components/shoe/star-rating";
import type { Shoe, ShoeImageRecord } from "@/lib/types";

const EASE = "cubic-bezier(0.22,1,0.36,1)";
const DEFAULT_TRANSITION_MS = 720;
const NAV_HEIGHT = 76;
const SCROLL_DELTA_THRESHOLD = 14;
const TOUCH_DELTA_THRESHOLD = 48;
const TOTAL = 5;

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
  specStars: number;
  finalStars: number;
};

const HASH_TO_INDEX: Record<string, number> = {
  "#overview": 0,
  "#performance": 1,
  "#story": 2,
  "#comments": 3,
  "#related": 4
};

export function ShoeDetailSlides(props: Props) {
  const { translate } = useLocale();
  const [slide, setSlide] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const slideRef = useRef(0);
  const animatingRef = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
  const transitionMs = reducedMotion ? 0 : DEFAULT_TRANSITION_MS;

  useEffect(() => {
    slideRef.current = slide;
  }, [slide]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const idx = HASH_TO_INDEX[window.location.hash.toLowerCase()];
    if (typeof idx === "number" && idx >= 0 && idx < TOTAL) {
      slideRef.current = idx;
      setSlide(idx);
    }
  }, []);

  const goTo = useCallback(
    (next: number) => {
      if (animatingRef.current) return;
      if (next < 0 || next >= TOTAL) return;
      if (next === slideRef.current) return;
      animatingRef.current = true;
      setSlide(next);
      window.setTimeout(() => {
        animatingRef.current = false;
      }, transitionMs);
    },
    [transitionMs]
  );

  useEffect(() => {
    let lastFire = 0;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-detail-scroll-container]")) {
        return;
      }
      const now = Date.now();
      if (now - lastFire < 80) return;
      if (Math.abs(e.deltaY) < SCROLL_DELTA_THRESHOLD) return;
      e.preventDefault();
      lastFire = now;
      if (e.deltaY > 0) goTo(slideRef.current + 1);
      else goTo(slideRef.current - 1);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [goTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input,textarea,[contenteditable]")) return;
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        goTo(slideRef.current + 1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        goTo(slideRef.current - 1);
      } else if (e.key === "Home") {
        goTo(0);
      } else if (e.key === "End") {
        goTo(TOTAL - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  useEffect(() => {
    let startY = 0;
    let startTarget: HTMLElement | null = null;
    const onStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? 0;
      startTarget = e.target as HTMLElement | null;
    };
    const onEnd = (e: TouchEvent) => {
      if (startTarget?.closest("[data-detail-scroll-container]")) return;
      const endY = e.changedTouches[0]?.clientY ?? 0;
      const dy = startY - endY;
      if (Math.abs(dy) < TOUCH_DELTA_THRESHOLD) return;
      if (dy > 0) goTo(slideRef.current + 1);
      else goTo(slideRef.current - 1);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [goTo]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const labels = [
    translate("Overview"),
    translate("Performance"),
    translate("Story"),
    translate("Comments"),
    translate("Related")
  ];

  const viewportHeight = `calc(100vh - ${NAV_HEIGHT}px)`;

  return (
    <>
    <div
      ref={rootRef}
      className="detail-slides relative"
      style={{ height: viewportHeight, overflow: "hidden" }}
    >
      <div
        className="detail-slide-track flex flex-col"
        style={{
          transform: `translateY(calc(${-slide} * (100vh - ${NAV_HEIGHT}px)))`,
          transition: `transform ${transitionMs}ms ${EASE}`,
          willChange: "transform"
        }}
      >
        <SlideFrame height={viewportHeight}>
          <OverviewSlide
            {...props}
            active={slide === 0}
            onShareCard={() => setShareOpen(true)}
            onJumpToComments={() => goTo(3)}
          />
        </SlideFrame>
        <SlideFrame height={viewportHeight}>
          <PerformanceSlide {...props} active={slide === 1} />
        </SlideFrame>
        <SlideFrame height={viewportHeight}>
          <StorySlide {...props} active={slide === 2} />
        </SlideFrame>
        <SlideFrame height={viewportHeight}>
          <CommentsSlide {...props} active={slide === 3} />
        </SlideFrame>
        <SlideFrame height={viewportHeight}>
          <RelatedSlide {...props} active={slide === 4} />
        </SlideFrame>
      </div>

      <div
        className="pointer-events-none absolute right-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-2 md:flex"
        aria-hidden
      >
        <span
          key={slide}
          className="mb-1 select-none text-[0.55rem] font-medium uppercase tracking-[0.22em]"
          style={{
            color: "rgb(var(--subtext)/0.6)",
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            animation: reducedMotion ? undefined : `detailSlideLabelIn 380ms ${EASE}`
          }}
        >
          {labels[slide]}
        </span>
        {Array.from({ length: TOTAL }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Slide ${i + 1} of ${TOTAL}: ${labels[i]}`}
            className="pointer-events-auto rounded-sm border-none p-0 outline-none transition-[background,height] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--text)/0.6)]"
            style={{
              width: 4,
              height: slide === i ? 22 : 4,
              background: slide === i ? "rgb(var(--text)/0.8)" : "rgb(var(--muted)/0.55)",
              transition: `height 320ms ${EASE}, background 220ms ${EASE}`,
              cursor: "pointer"
            }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => goTo(slide + 1)}
        aria-label={translate("Scroll to next slide")}
        className="absolute left-1/2 z-10 -translate-x-1/2 items-center justify-center rounded-full border border-[rgb(var(--glass-stroke-soft)/0.45)] bg-[rgb(var(--bg-elev)/0.7)] text-[rgb(var(--subtext))] shadow-[0_4px_14px_rgb(var(--shadow)/0.18)] backdrop-blur-[12px] transition-[opacity,transform,color] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[rgb(var(--text))]"
        style={{
          bottom: 32,
          width: 36,
          height: 36,
          display: slide < TOTAL - 1 ? "inline-flex" : "none",
          opacity: slide === 0 ? 1 : 0,
          transform: `translateX(-50%) translateY(${slide === 0 ? "0" : "8px"})`
        }}
      >
        <ChevronDown
          className="h-4 w-4"
          style={{ animation: reducedMotion ? undefined : "detailScrollHint 1.8s ease-in-out infinite" }}
        />
      </button>

      <style>{`
        @keyframes detailScrollHint {
          0%, 100% { transform: translateY(0); opacity: 0.7; }
          50% { transform: translateY(3px); opacity: 1; }
        }
        @keyframes detailSlideLabelIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media print {
          .detail-slides {
            height: auto !important;
            overflow: visible !important;
          }
          .detail-slide-track {
            transform: none !important;
          }
        }
      `}</style>
    </div>
    <CardPreviewModal
      open={shareOpen}
      onClose={() => setShareOpen(false)}
      mode={{ kind: "single", shoe: props.shoe, axes: props.radarAxes }}
    />
    </>
  );
}

function SlideFrame({ height, children }: { height: string; children: React.ReactNode }) {
  return (
    <div className="shrink-0 overflow-hidden" style={{ height }}>
      <div className="container-shell h-full pr-10 md:pr-14">{children}</div>
    </div>
  );
}

function slideEntranceClass(active: boolean) {
  return `transition-[opacity,transform] duration-500 delay-150 ${
    active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
  }`;
}

function OverviewSlide({
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
  active,
  onShareCard,
  finalStars,
  onJumpToComments
}: Props & { active: boolean; onShareCard: () => void; onJumpToComments: () => void }) {
  const { translate } = useLocale();
  return (
    <div className={`flex h-full flex-col justify-center py-10 ${slideEntranceClass(active)}`}>
      <div className="grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div className="max-w-2xl">
          <p className="t-eyebrow">
            <span data-field-key="brand">{shoe.brand}</span> · {shoe.release_year ?? "TBD"}
          </p>

          <h1
            data-field-key="shoe_name"
            className="t-display-sm mt-3 text-[rgb(var(--text))]"
          >
            {shoe.shoe_name}
          </h1>

          {shoe.spec.playstyle_summary ? (
            <DynamicTranslatedText
              as="p"
              className="mt-4 text-sm leading-6 soft-text md:text-base"
              text={shoe.spec.playstyle_summary}
            />
          ) : (
            <p className="mt-4 text-sm leading-6 soft-text md:text-base">
              {translate("No playstyle summary available yet.")}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StarRating
              value={finalStars}
              size="lg"
              showNumber
              count={shoe.userRatingCount ?? 0}
            />
            <button
              type="button"
              onClick={onJumpToComments}
              className="text-xs underline-offset-2 soft-text hover:underline"
            >
              {translate("Rate this")}
            </button>
          </div>

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

        <div className="flex flex-col items-center gap-3">
          <div className="w-full max-w-xs rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.22)] bg-[rgb(var(--surface))] p-4 shadow-cinematic md:p-6">
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
    </div>
  );
}

function PerformanceSlide({
  shoe,
  extraTechCards,
  radarAxes,
  active
}: Props & { active: boolean }) {
  const { translate } = useLocale();
  return (
    <div className={`flex h-full min-h-0 flex-row items-stretch gap-2 py-4 md:gap-4 md:py-6 ${slideEntranceClass(active)}`}>
      <div className="flex min-h-0 w-1/2 flex-col gap-2 md:gap-3">
        <Card className="flex min-h-0 flex-1 flex-col justify-center p-2.5 md:p-4">
          <p className="text-[0.6rem] uppercase tracking-wide soft-text md:text-xs">
            {translate("Forefoot midsole tech")}
          </p>
          {shoe.spec.forefoot_midsole_tech ? (
            <p data-field-key="forefoot_midsole_tech" className="mt-1 text-sm font-medium md:mt-2 md:text-base">
              {shoe.spec.forefoot_midsole_tech}
            </p>
          ) : (
            <p data-field-key="forefoot_midsole_tech" className="mt-1 text-sm font-medium md:mt-2 md:text-base">
              {translate("Not yet added")}
            </p>
          )}
        </Card>

        <Card className="flex min-h-0 flex-1 flex-col justify-center p-2.5 md:p-4">
          <p className="text-[0.6rem] uppercase tracking-wide soft-text md:text-xs">
            {translate("Heel midsole tech")}
          </p>
          {shoe.spec.heel_midsole_tech ? (
            <p data-field-key="heel_midsole_tech" className="mt-1 text-sm font-medium md:mt-2 md:text-base">
              {shoe.spec.heel_midsole_tech}
            </p>
          ) : (
            <p data-field-key="heel_midsole_tech" className="mt-1 text-sm font-medium md:mt-2 md:text-base">
              {translate("Not yet added")}
            </p>
          )}
        </Card>

        {Object.entries(extraTechCards).map(([k, data]) => (
          <Card key={k} className="flex min-h-0 flex-1 flex-col justify-center p-2.5 md:p-4">
            <p className="text-[0.6rem] uppercase tracking-wide soft-text md:text-xs">{translate(k)}</p>
            {data.value ? (
              <DynamicTranslatedText
                as="p"
                className="mt-1 text-sm font-medium md:mt-2 md:text-base"
                text={data.value}
                contentType="technology"
              />
            ) : (
              <p data-field-key={data.field} className="mt-1 text-sm font-medium md:mt-2 md:text-base">
                {translate("Not yet added")}
              </p>
            )}
          </Card>
        ))}
      </div>

      <Card className="flex min-h-0 w-1/2 flex-col p-3 md:p-5">
        <p className="t-eyebrow mb-1 text-[0.6rem] md:mb-2 md:text-xs">{translate("Analysis")}</p>
        <h2 className="text-sm font-semibold tracking-[-0.02em] md:text-lg">{translate("Performance profile")}</h2>
        <div className="mt-2 flex min-h-0 flex-1 items-center justify-center md:mt-4">
          <PerformanceRadar axes={radarAxes} />
        </div>
      </Card>
    </div>
  );
}

function StorySlide({ shoe, hasStory, storyTitle, storyContent, active }: Props & { active: boolean }) {
  const { translate } = useLocale();
  return (
    <div className={`flex h-full flex-col justify-center py-10 ${slideEntranceClass(active)}`}>
      <Card className="mx-auto w-full max-w-3xl p-6 md:p-8">
        <p className="t-eyebrow mb-2">{translate("Context")}</p>
        <h2 className="text-lg font-semibold tracking-[-0.02em]">{translate("Story & provenance")}</h2>
        {hasStory ? (
          <div
            data-detail-scroll-container
            className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto pr-2"
          >
            {storyTitle ? (
              <DynamicTranslatedText as="p" className="text-sm font-medium" text={storyTitle} />
            ) : (
              <p data-field-key="shoe_name" className="text-sm font-medium">{`${shoe.brand} ${shoe.shoe_name}`}</p>
            )}

            {storyContent ? (
              <DynamicTranslatedText as="p" className="text-sm soft-text" text={storyContent} />
            ) : (
              <p className="text-sm soft-text">{translate("No editorial story content yet.")}</p>
            )}
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm soft-text">{translate("No editorial story yet.")}</p>
            <div className="mt-4 rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--surface)/0.6)] p-3 text-xs soft-text">
              {translate(
                "Source/evidence: Seed dataset + community validation pipeline. Admin review required before promotion to official records."
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function CommentsSlide({ shoe, specStars, isLoggedIn, active }: Props & { active: boolean }) {
  return (
    <div className={`flex h-full flex-col py-8 ${slideEntranceClass(active)}`}>
      <div data-detail-scroll-container className="h-full overflow-y-auto pr-2">
        <CommentSection
          shoeId={shoe.id}
          specStars={specStars}
          initialMyRating={shoe.myRating ?? null}
          initialAvg={shoe.avgUserRating ?? null}
          initialCount={shoe.userRatingCount ?? 0}
          isLoggedIn={isLoggedIn}
        />
      </div>
    </div>
  );
}

function RelatedSlide({ related, active }: Props & { active: boolean }) {
  const { translate } = useLocale();
  return (
    <div className={`flex h-full flex-col justify-center py-10 ${slideEntranceClass(active)}`}>
      <Card className="mx-auto w-full max-w-4xl p-6 md:p-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-[-0.02em]">{translate("Related shoes")}</h2>
          <Link href="/" className="inline-flex items-center gap-1 text-sm soft-text transition hover:text-[rgb(var(--text))]">
            {translate("Back to database")} <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {related.map((item) => (
            <Link
              key={item.id}
              href={`/shoes/${item.slug}`}
              data-field-key="shoe_name"
              className="rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--surface)/0.6)] p-3 transition hover:border-[rgb(var(--text)/0.35)] hover:bg-[rgb(var(--text)/0.04)]"
            >
              {item.shoe_name}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
