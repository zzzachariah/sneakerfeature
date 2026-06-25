"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { StarRating } from "@/components/shoe/star-rating";
import { Reveal } from "@/components/motion/reveal";
import { useLocale } from "@/components/i18n/locale-provider";
import { haptics } from "@/lib/native/haptics";
import { DIM_KEYS, DIM_LABELS, type DimKey } from "@/lib/star-rating";

type Picks = Partial<Record<DimKey, number>>;

export function DimRatingForm({
  shoeId,
  initialMyRatings,
  isLoggedIn
}: {
  shoeId: string;
  initialMyRatings: Partial<Record<DimKey, number>> | null;
  isLoggedIn: boolean;
}) {
  const { translate } = useLocale();
  const router = useRouter();
  const [picks, setPicks] = useState<Picks>(initialMyRatings ?? {});
  const [posting, setPosting] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    setPicks(initialMyRatings ?? {});
  }, [initialMyRatings]);

  const allFilled = useMemo(
    () => DIM_KEYS.every((k) => typeof picks[k] === "number"),
    [picks]
  );

  const hasExistingRating = initialMyRatings !== null;
  const busy = posting || isRefreshing;

  function setDim(key: DimKey, value: number) {
    setPicks((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!allFilled) return;
    setPosting(true);
    setMessage("");
    const res = await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shoeId, ...picks })
    });
    const data = await res.json();
    setPosting(false);
    if (!data?.ok) {
      haptics.error();
      setIsError(true);
      setMessage(data?.message ?? translate("Save failed"));
      return;
    }
    haptics.success();
    setIsError(false);
    setMessage(
      translate(hasExistingRating ? "Rating updated." : "Rating saved.")
    );
    startRefresh(() => {
      router.refresh();
    });
  }

  async function handleClear() {
    setPosting(true);
    setMessage("");
    const res = await fetch("/api/ratings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shoeId })
    });
    const data = await res.json();
    setPosting(false);
    if (!data?.ok) {
      haptics.error();
      setIsError(true);
      setMessage(data?.message ?? translate("Clear failed"));
      return;
    }
    haptics.success();
    setIsError(false);
    setMessage(translate("Rating cleared."));
    setPicks({});
    startRefresh(() => {
      router.refresh();
    });
  }

  return (
    <div className="surface-card premium-border rounded-3xl p-5 md:p-6">
      <div className="flex items-center gap-2">
        <Star className="h-4 w-4 text-amber-400" />
        <h3 className="text-lg font-medium">{translate("Your rating")}</h3>
      </div>
      <p className="mt-1 text-xs soft-text">
        {translate("Rate every dimension to save")}
      </p>

      <ul className="mt-4 grid gap-3 md:grid-cols-2 md:gap-x-6">
        {DIM_KEYS.map((k, i) => (
          <Reveal as="li" key={k} index={i} className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium tracking-[-0.01em]">
              {translate(DIM_LABELS[k])}
            </span>
            <StarRating
              value={picks[k] ?? 0}
              userRating={picks[k] ?? null}
              interactive
              isLoggedIn={isLoggedIn}
              onSubmit={(v) => setDim(k, v)}
              size="md"
              showNumber
              busy={busy}
            />
          </Reveal>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        {hasExistingRating ? (
          <button
            type="button"
            onClick={handleClear}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--muted)/0.5)] px-2.5 py-1.5 text-xs soft-text transition hover:border-[rgb(var(--text)/0.4)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)]"
          >
            <X className="h-3 w-3" />
            {translate("Clear my ratings")}
          </button>
        ) : (
          <span />
        )}
        <Button type="button" onClick={handleSave} disabled={busy || !allFilled}>
          {busy ? translate("Saving...") : translate("Save my ratings")}
        </Button>
      </div>

      {!isLoggedIn && (
        <p className="mt-3 text-xs soft-text">{translate("Sign in to rate")}</p>
      )}
      {message && (
        <div className="mt-3">
          <FeedbackMessage message={message} isError={isError} />
        </div>
      )}
    </div>
  );
}
