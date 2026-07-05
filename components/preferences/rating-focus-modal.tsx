"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Info, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { useLocale } from "@/components/i18n/locale-provider";
import { SignInValue } from "@/components/auth/sign-in-value";
import { type DimKey, type RatingFocus } from "@/lib/star-rating";
import { useRatingFocus } from "@/components/preferences/rating-focus-provider";
import { PlaystyleDimGrid } from "@/components/preferences/playstyle-dim-grid";

export function RatingFocusModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { translate } = useLocale();
  const { focus, isLoggedIn, saveFocus, clearFocus, saving, isRefreshing, message, isError } =
    useRatingFocus();
  const [picks, setPicks] = useState<DimKey[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setPicks(focus ? [focus.primary, focus.secondary, focus.tertiary] : []);
      setShowRules(false);
      setPendingClose(false);
    }
  }, [open, focus]);

  useEffect(() => {
    if (pendingClose && !saving && !isRefreshing) {
      setPendingClose(false);
      onCloseRef.current();
    }
  }, [pendingClose, saving, isRefreshing]);

  const busy = saving || isRefreshing;

  function togglePick(key: DimKey) {
    setPicks((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 3) return prev;
      return [...prev, key];
    });
  }

  async function handleSave() {
    if (picks.length !== 3) return;
    const next: RatingFocus = {
      primary: picks[0],
      secondary: picks[1],
      tertiary: picks[2]
    };
    const ok = await saveFocus(next);
    if (ok) setPendingClose(true);
  }

  async function handleClear() {
    const ok = await clearFocus();
    if (ok) setPendingClose(true);
  }

  return (
    <Modal open={open} onClose={onClose} title="Pick playstyle">
      {!isLoggedIn ? (
        <div className="space-y-4">
          <p className="text-sm text-[rgb(var(--text)/0.82)]">{translate("Sign in to pick playstyle")}</p>
          <SignInValue />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" type="button" onClick={onClose}>
              {translate("Cancel")}
            </Button>
            <Button type="button" onClick={() => (window.location.href = "/login")}>
              {translate("Log in")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm soft-text">
            {translate(
              "Pick three dimensions in order. The first is primary, then secondary, then tertiary."
            )}
          </p>

          <PlaystyleDimGrid picks={picks} onToggle={togglePick} disabled={busy} />
          <p className="text-[0.7rem] soft-text">
            {translate("Primary 40% · Secondary 30% · Tertiary 20% · Others share 10%.")}
          </p>

          <button
            type="button"
            onClick={() => setShowRules((v) => !v)}
            className="inline-flex items-center gap-1 text-xs underline-offset-2 soft-text hover:underline"
          >
            <Info className="h-3.5 w-3.5" />
            {translate("How ratings work")}
          </button>

          {showRules && (
            <div className="space-y-2 rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.45)] p-3 text-xs soft-text">
              <p>
                {translate(
                  "Primary 40% · Secondary 30% · Tertiary 20% · Others share 10%."
                )}
              </p>
              <p>
                {translate(
                  "Ratings follow a bell curve based on every shoe's weighted score: 1-2 stars 20%, 3-4 stars 70%, 5 stars 10%."
                )}
              </p>
            </div>
          )}

          {message && <FeedbackMessage message={message} isError={isError} />}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {focus && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--muted)/0.5)] px-2.5 py-1.5 text-xs soft-text transition hover:border-[rgb(var(--text)/0.4)] disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                  {translate("Clear playstyle")}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
                {translate("Cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={busy || picks.length !== 3}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                {busy ? translate("Saving...") : translate("Save playstyle")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
