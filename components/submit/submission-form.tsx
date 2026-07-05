"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useLocale } from "@/components/i18n/locale-provider";
import { haptics } from "@/lib/native/haptics";
import {
  SubmissionSlides,
  type SubmissionSlidesHandle
} from "@/components/submit/submission-slides";

type FormMode = "new_shoe" | "correction";

export function SubmissionForm({
  mode,
  initialValues = {},
  targetShoeId,
  targetShoeLabel,
  originalSnapshot
}: {
  mode: FormMode;
  initialValues?: Record<string, string | number | null | undefined>;
  targetShoeId?: string;
  targetShoeLabel?: string;
  originalSnapshot?: Record<string, unknown>;
}) {
  const { translate } = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const slidesRef = useRef<SubmissionSlidesHandle>(null);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // ---- Draft autosave -------------------------------------------------------
  // The form is uncontrolled (defaultValue), so a stray back-swipe or a failed
  // network call used to throw away everything typed. Field values are saved
  // to localStorage (debounced) on every input, restored once after mount by
  // writing straight into the inputs (no re-render → no hydration mismatch),
  // and cleared on a successful submit. Corrections draft per target shoe.
  const draftKey = `sf-submit-draft:${mode}:${targetShoeId ?? "new"}`;
  const draftTimer = useRef<number | null>(null);
  const DRAFT_SKIP = useRef(new Set(["submission_type", "target_shoe_id", "original_snapshot"]));

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as Record<string, string>;
      const form = formRef.current;
      if (!form) return;
      let applied = false;
      for (const [name, value] of Object.entries(draft)) {
        const el = form.elements.namedItem(name);
        if ((el instanceof HTMLInputElement && el.type !== "hidden") || el instanceof HTMLTextAreaElement) {
          el.value = value;
          applied = true;
        }
      }
      if (applied) setDraftRestored(true);
    } catch {
      /* unreadable draft — ignore */
    }
  }, [draftKey]);

  useEffect(() => () => {
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
  }, []);

  function saveDraftSoon() {
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      const out: Record<string, string> = {};
      let hasContent = false;
      new FormData(form).forEach((v, k) => {
        if (DRAFT_SKIP.current.has(k) || typeof v !== "string") return;
        out[k] = v;
        if (v.trim()) hasContent = true;
      });
      try {
        if (hasContent) window.localStorage.setItem(draftKey, JSON.stringify(out));
        else window.localStorage.removeItem(draftKey);
      } catch {
        /* storage full/blocked — ignore */
      }
    }, 800);
  }

  function clearDraft() {
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    setDraftRestored(false);
  }
  // ---------------------------------------------------------------------------

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const shoeName = String(formData.get("shoe_name") ?? "").trim();
    const brand = String(formData.get("brand") ?? "").trim();
    const rawText = String(formData.get("raw_text") ?? "").trim();

    if (!shoeName) {
      slidesRef.current?.goTo(0);
      setIsError(true);
      setMessage(translate("Shoe name is required."));
      return;
    }
    if (!brand) {
      slidesRef.current?.goTo(0);
      setIsError(true);
      setMessage(translate("Brand is required."));
      return;
    }
    if (!rawText) {
      slidesRef.current?.goTo(0);
      setIsError(true);
      setMessage(translate("Raw notes are required."));
      return;
    }
    if (!token) {
      setIsError(true);
      setMessage(translate("Complete the verification first."));
      return;
    }

    setIsSubmitting(true);
    setIsError(false);
    setMessage("");

    try {
      const payload = Object.fromEntries(formData.entries());
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ...payload, verificationToken: token })
      });

      const rawTextResponse = await res.text();
      let data: { ok?: boolean; message?: string } | null = null;

      if (rawTextResponse.trim().length > 0) {
        try {
          data = JSON.parse(rawTextResponse) as { ok?: boolean; message?: string };
        } catch {
          slidesRef.current?.resetVerification();
          setIsError(true);
          setMessage(`Server returned invalid JSON (status ${res.status}).`);
          return;
        }
      }

      if (!res.ok) {
        haptics.error();
        // The server consumed the single-use verification token — run a fresh
        // challenge so the retry doesn't fail verification.
        slidesRef.current?.resetVerification();
        setIsError(true);
        setMessage(data?.message ?? `Submit failed with status ${res.status}.`);
        return;
      }

      if (!data) {
        slidesRef.current?.resetVerification();
        setIsError(true);
        setMessage("Submit failed: server returned an empty response.");
        return;
      }

      setIsError(data.ok === false);
      setMessage(data.message ?? "Submitted");
      if (data.ok !== false) {
        haptics.success();
        clearDraft();
        setResultModalOpen(true);
      } else {
        haptics.error();
        slidesRef.current?.resetVerification();
      }
    } catch {
      haptics.error();
      slidesRef.current?.resetVerification();
      setIsError(true);
      setMessage("Network error while submitting. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleModalConfirm() {
    setResultModalOpen(false);
    formRef.current?.reset();
    setToken("");
    slidesRef.current?.resetVerification();
    setMessage("");
    setIsError(false);
    slidesRef.current?.goTo(0);
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} onInput={saveDraftSoon}>
      <input type="hidden" name="submission_type" value={mode} />
      {targetShoeId && <input type="hidden" name="target_shoe_id" value={targetShoeId} />}
      {originalSnapshot && (
        <input type="hidden" name="original_snapshot" value={JSON.stringify(originalSnapshot)} />
      )}

      {draftRestored && (
        <div className="container-shell pt-4">
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--surface)/0.7)] px-4 py-2.5 text-sm">
            <span className="soft-text">{translate("Restored your unsaved draft.")}</span>
            <button
              type="button"
              onClick={() => {
                haptics.tap();
                clearDraft();
                formRef.current?.reset();
              }}
              className="text-xs font-medium underline-offset-2 soft-text hover:text-[rgb(var(--text))] hover:underline"
            >
              {translate("Discard draft")}
            </button>
          </div>
        </div>
      )}

      <SubmissionSlides
        ref={slidesRef}
        mode={mode}
        targetShoeLabel={targetShoeLabel}
        initialValues={initialValues}
        token={token}
        onToken={setToken}
        isSubmitting={isSubmitting}
        message={message}
        isError={isError}
      />

      <Modal open={resultModalOpen} onClose={handleModalConfirm} title="Submission received">
        <p className="text-sm soft-text">{message}</p>
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={handleModalConfirm}>
            {translate("Back to submit")}
          </Button>
        </div>
      </Modal>
    </form>
  );
}
