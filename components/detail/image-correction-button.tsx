"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ImagePlus, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { useLocale } from "@/components/i18n/locale-provider";

const MAX_BYTES = 6 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

// User-facing "图片纠错" control on the shoe detail page: a logged-in user can
// upload a photo they believe better represents the shoe. It is queued for admin
// review; once approved it becomes the shoe's live image.
export function ImageCorrectionButton({ shoeId, isLoggedIn }: { shoeId: string; isLoggedIn: boolean }) {
  const { translate } = useLocale();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setNote("");
    setMessage("");
    setIsError(false);
    setDone(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    setOpen(false);
    reset();
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    setMessage("");
    setIsError(false);
    if (!picked) return;
    if (!ACCEPTED.includes(picked.type)) {
      setIsError(true);
      setMessage(translate("Only JPG, PNG, or WebP images are allowed."));
      return;
    }
    if (picked.size > MAX_BYTES) {
      setIsError(true);
      setMessage(translate("Image is too large. Keep it under 6 MB."));
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  }

  async function onSubmit() {
    if (!file) {
      setIsError(true);
      setMessage(translate("Please choose an image to upload."));
      return;
    }
    setSubmitting(true);
    setIsError(false);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("shoe_id", shoeId);
      formData.append("file", file);
      if (note.trim()) formData.append("note", note.trim());

      const res = await fetch("/api/image-corrections", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setIsError(true);
        setMessage(data?.message ?? translate("Upload failed. Please try again."));
        return;
      }
      setDone(true);
      setMessage(data.message ?? translate("Thanks! Your image was submitted for admin review."));
    } catch {
      setIsError(true);
      setMessage(translate("Network error. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
        {translate("Fix image")}
      </Button>

      <Modal open={open} onClose={close} title="Suggest a better image">
        {!isLoggedIn ? (
          <div className="space-y-4">
            <p className="text-sm soft-text">
              {translate("Please log in to suggest an image correction.")}
            </p>
            <Link href="/login">
              <Button type="button">{translate("Log in")}</Button>
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-4">
            <FeedbackMessage message={message} />
            <div className="flex justify-end">
              <Button type="button" onClick={close}>
                {translate("Done")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm soft-text">
              {translate("Upload a clearer or correct photo of this shoe. An admin will review it before it goes live.")}
            </p>

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPick}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[rgb(var(--glass-stroke-soft)/0.6)] bg-[rgb(var(--surface)/0.6)] p-6 text-sm soft-text transition hover:border-[rgb(var(--text)/0.4)]"
            >
              {preview ? (
                <span className="aspect-square w-40 overflow-hidden rounded-lg border border-[rgb(var(--muted)/0.45)] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt={translate("Selected image preview")} className="h-full w-full object-contain" />
                </span>
              ) : (
                <UploadCloud className="h-8 w-8" />
              )}
              <span>{file ? file.name : translate("Choose an image (JPG, PNG, WebP · max 6 MB)")}</span>
            </button>

            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={translate("Optional: tell us what's wrong with the current image")}
              rows={3}
              maxLength={500}
            />

            {message && <FeedbackMessage message={message} isError={isError} />}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close} disabled={submitting}>
                {translate("Cancel")}
              </Button>
              <Button type="button" onClick={onSubmit} disabled={submitting || !file}>
                {submitting ? translate("Uploading...") : translate("Submit for review")}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
