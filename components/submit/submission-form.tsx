"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useLocale } from "@/components/i18n/locale-provider";
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
      slidesRef.current?.goTo(3);
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
          setIsError(true);
          setMessage(`Server returned invalid JSON (status ${res.status}).`);
          return;
        }
      }

      if (!res.ok) {
        setIsError(true);
        setMessage(data?.message ?? `Submit failed with status ${res.status}.`);
        return;
      }

      if (!data) {
        setIsError(true);
        setMessage("Submit failed: server returned an empty response.");
        return;
      }

      setIsError(data.ok === false);
      setMessage(data.message ?? "Submitted");
      if (data.ok !== false) {
        setResultModalOpen(true);
      }
    } catch {
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
    setMessage("");
    setIsError(false);
    slidesRef.current?.goTo(0);
  }

  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <input type="hidden" name="submission_type" value={mode} />
      {targetShoeId && <input type="hidden" name="target_shoe_id" value={targetShoeId} />}
      {originalSnapshot && (
        <input type="hidden" name="original_snapshot" value={JSON.stringify(originalSnapshot)} />
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
