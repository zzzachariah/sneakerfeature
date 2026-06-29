"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackButton } from "@/components/detail/back-button";
import { ShoeDetailSlides } from "@/components/detail/shoe-detail-slides";
import { type RadarAxis } from "@/components/detail/performance-radar";
import { BloggerReview, Shoe, ShoeImageRecord } from "@/lib/types";
import {
  getBounceScore,
  getCourtFeelScore,
  getCushioningFeelScore,
  getFitScore,
  getPerformanceLabel,
  getStabilityScore,
  getTractionScore
} from "@/lib/shoe-scoring";
import { useLocale } from "@/components/i18n/locale-provider";
import { pickLocalized } from "@/components/i18n/localized-field";

type TechCardConfig = {
  value: string | null | undefined;
  field: string;
};

type ShoeDetailImageState = {
  approved: ShoeImageRecord | null;
  pending: ShoeImageRecord | null;
  latestRejected: ShoeImageRecord | null;
};

export function ShoeDetailClient({
  shoe,
  related,
  isAdmin,
  isLoggedIn,
  imageState,
  bloggerReviews
}: {
  shoe: Shoe;
  related: Shoe[];
  isAdmin: boolean;
  isLoggedIn: boolean;
  imageState: ShoeDetailImageState;
  bloggerReviews: BloggerReview[];
}) {
  const { translate, locale } = useLocale();
  const router = useRouter();
  const [imageActionLoading, setImageActionLoading] = useState<
    "find" | "approve" | "reject" | "preview_url" | "confirm_url" | null
  >(null);
  const [imageActionError, setImageActionError] = useState<string | null>(null);
  const [imageActionSuccess, setImageActionSuccess] = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState("");
  const [previewUpload, setPreviewUpload] = useState<
    { storage_path: string; public_url: string } | null
  >(null);

  // Story title/content + the spec story-summary fallback are pre-translated in
  // Supabase; pick the stored zh (English fallback) per locale.
  const storyTitleLocalized = pickLocalized(locale, shoe.story?.title, shoe.story?.title_zh)?.trim();
  const storyContentLocalized = pickLocalized(locale, shoe.story?.content, shoe.story?.content_zh)?.trim();
  const specSummaryLocalized = pickLocalized(locale, shoe.spec?.story_summary, shoe.spec?.story_summary_zh)?.trim();
  const storyTitle = storyTitleLocalized || undefined;
  const storyContent = storyContentLocalized || specSummaryLocalized || undefined;
  const storySourceLabel = shoe.story?.source_label?.trim() || undefined;
  const storySourceUrl = shoe.story?.source_url?.trim() || undefined;
  const hasStory = Boolean(storyTitle || storyContent);

  const stabilityText = shoe.spec.stability ?? "";
  const tractionText = shoe.spec.traction ?? "";
  const fitText = shoe.spec.fit ?? "";
  const cushioningFeelText = shoe.spec.cushioning_feel ?? "";
  const courtFeelText = shoe.spec.court_feel ?? "";
  const bounceText = shoe.spec.bounce ?? "";

  const stabilityScore = getStabilityScore(stabilityText);
  const tractionScore = getTractionScore(tractionText);
  const fitScore = getFitScore(fitText);
  const cushioningFeelScore = getCushioningFeelScore(cushioningFeelText);
  const courtFeelScore = getCourtFeelScore(courtFeelText);
  const bounceScore = getBounceScore(bounceText);

  const radarAxes: RadarAxis[] = [
    {
      label: "Cushioning Feel",
      rawText: pickLocalized(locale, shoe.spec.cushioning_feel, shoe.spec.cushioning_feel_zh),
      score: cushioningFeelScore,
      tier: getPerformanceLabel(cushioningFeelScore)
    },
    {
      label: "Court Feel",
      rawText: pickLocalized(locale, shoe.spec.court_feel, shoe.spec.court_feel_zh),
      score: courtFeelScore,
      tier: getPerformanceLabel(courtFeelScore)
    },
    {
      label: "Bounce",
      rawText: pickLocalized(locale, shoe.spec.bounce, shoe.spec.bounce_zh),
      score: bounceScore,
      tier: getPerformanceLabel(bounceScore)
    },
    {
      label: "Stability",
      rawText: pickLocalized(locale, shoe.spec.stability, shoe.spec.stability_zh),
      score: stabilityScore,
      tier: getPerformanceLabel(stabilityScore)
    },
    {
      label: "Traction",
      rawText: pickLocalized(locale, shoe.spec.traction, shoe.spec.traction_zh),
      score: tractionScore,
      tier: getPerformanceLabel(tractionScore)
    },
    {
      label: "Fit",
      rawText: pickLocalized(locale, shoe.spec.fit, shoe.spec.fit_zh),
      score: fitScore,
      tier: getPerformanceLabel(fitScore)
    }
  ];

  const extraTechCards: Record<string, TechCardConfig> = {
    "Outsole tech": {
      value: pickLocalized(locale, shoe.spec.outsole_tech, shoe.spec.outsole_tech_zh),
      field: "outsole_tech",
    },
    "Upper tech": {
      value: pickLocalized(locale, shoe.spec.upper_tech, shoe.spec.upper_tech_zh),
      field: "upper_tech",
    },
  };

  const reviewImage = imageState.pending?.public_url ?? imageState.approved?.public_url ?? shoe.image_url;
  const hasPendingImage = Boolean(imageState.pending);

  const specStars = shoe.specStars ?? null;
  const finalStars = shoe.finalStars ?? null;

  async function runAdminImageAction(action: "find" | "approve" | "reject") {
    setImageActionLoading(action);
    setImageActionError(null);
    setImageActionSuccess(null);
    try {
      const res = await fetch(`/api/admin/shoes/${shoe.id}/image`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        const errorText = [json?.error, json?.step ? `step=${json.step}` : null, json?.detail ? `detail=${json.detail}` : null]
          .filter(Boolean)
          .join(" | ");
        throw new Error(errorText || json?.message || translate("Image import failed"));
      }
      setImageActionSuccess(json?.message ?? translate("Image approved"));
      router.refresh();
    } catch (error) {
      setImageActionError(error instanceof Error ? error.message : translate("Image import failed"));
    } finally {
      setImageActionLoading(null);
    }
  }

  async function handlePreviewUrl() {
    const trimmed = pasteUrl.trim();
    if (!trimmed) return;
    setImageActionLoading("preview_url");
    setImageActionError(null);
    setImageActionSuccess(null);
    try {
      const res = await fetch(`/api/admin/shoes/${shoe.id}/image`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preview_url", source_url: trimmed })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        const errorText = [json?.error, json?.step ? `step=${json.step}` : null, json?.detail ? `detail=${json.detail}` : null]
          .filter(Boolean)
          .join(" | ");
        throw new Error(errorText || translate("Image import failed"));
      }
      setPreviewUpload({ storage_path: json.storage_path, public_url: json.public_url });
    } catch (error) {
      setImageActionError(error instanceof Error ? error.message : translate("Image import failed"));
    } finally {
      setImageActionLoading(null);
    }
  }

  async function handleConfirmUpload() {
    if (!previewUpload) return;
    const trimmed = pasteUrl.trim();
    if (!trimmed) return;
    setImageActionLoading("confirm_url");
    setImageActionError(null);
    setImageActionSuccess(null);
    try {
      const res = await fetch(`/api/admin/shoes/${shoe.id}/image`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm_url",
          source_url: trimmed,
          storage_path: previewUpload.storage_path,
          public_url: previewUpload.public_url
        })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        const errorText = [json?.error, json?.step ? `step=${json.step}` : null, json?.detail ? `detail=${json.detail}` : null]
          .filter(Boolean)
          .join(" | ");
        throw new Error(errorText || translate("Image import failed"));
      }
      setImageActionSuccess(json?.message ?? translate("Image imported for review"));
      setPreviewUpload(null);
      setPasteUrl("");
      router.refresh();
    } catch (error) {
      setImageActionError(error instanceof Error ? error.message : translate("Image import failed"));
    } finally {
      setImageActionLoading(null);
    }
  }

  function handleCancelPreview() {
    setPreviewUpload(null);
    setImageActionError(null);
    setImageActionSuccess(null);
  }

  return (
    <main className="relative">
      {/* Top overlay row — the back button (left) and, when logged out, a sign-in
          nudge (right). Both live in ONE container-aligned flex row so (a) the
          back button lands directly under the navbar logo at every width (it used
          to be pinned to the viewport edge and drift away from the centered
          content on desktop) and (b) the two never overlap — the full-width nudge
          previously buried the back button on phones. The row is click-through;
          only its children take pointer events. Inside the iOS app the web pill is
          superseded by a real native Liquid Glass button (see BackButton). */}
      <div
        className="pointer-events-none fixed inset-x-0 z-30"
        style={{ top: "calc(var(--top-nav-h) + 8px)" }}
      >
        <div className="container-shell flex items-start justify-between gap-3">
          <BackButton />

          {!isLoggedIn ? (
            <div className="max-w-[min(22rem,calc(100vw-2*var(--container-gutter)-3.5rem))]">
              <div className="glass glass-rim glass-clip rounded-2xl px-4 py-3 text-sm font-medium text-[rgb(var(--text))] shadow-lift">
                {translate("Log in or sign up for the full sneakerfeature experience.")}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ShoeDetailSlides
        shoe={shoe}
        related={related}
        isAdmin={isAdmin}
        isLoggedIn={isLoggedIn}
        imageState={imageState}
        bloggerReviews={bloggerReviews}
        reviewImage={reviewImage}
        hasPendingImage={hasPendingImage}
        imageActionLoading={imageActionLoading}
        imageActionError={imageActionError}
        imageActionSuccess={imageActionSuccess}
        runAdminImageAction={runAdminImageAction}
        pasteUrl={pasteUrl}
        onPasteUrlChange={setPasteUrl}
        previewUpload={previewUpload}
        onPreviewUrl={handlePreviewUrl}
        onConfirmUpload={handleConfirmUpload}
        onCancelPreview={handleCancelPreview}
        radarAxes={radarAxes}
        extraTechCards={extraTechCards}
        hasStory={hasStory}
        storyTitle={storyTitle}
        storyContent={storyContent}
        storySourceLabel={storySourceLabel}
        storySourceUrl={storySourceUrl}
        specStars={specStars}
        finalStars={finalStars}
      />
    </main>
  );
}
