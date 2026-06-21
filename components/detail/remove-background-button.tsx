"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { useLocale } from "@/components/i18n/locale-provider";

// Admin-only control on the shoe detail page. Cuts the background out of the
// current image IN THE BROWSER (@imgly/background-removal, dynamically imported
// so it never ships in the main bundle and only loads on click) and queues the
// transparent PNG as the shoe's pending image. The admin then uses the existing
// Approve/Reject controls to confirm or discard it. Single, manual action — not
// the per-tile feed remover that was reverted for thrashing the main thread.
export function RemoveBackgroundButton({ shoeId, imageUrl }: { shoeId: string; imageUrl?: string | null }) {
  const { translate } = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!imageUrl) {
      setError(translate("No image to process yet."));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Pull the current image through the same-origin proxy so the worker isn't
      // blocked by cross-origin restrictions.
      const srcRes = await fetch(`/api/image-proxy?url=${encodeURIComponent(imageUrl)}`);
      if (!srcRes.ok) throw new Error(translate("Could not load the current image."));
      const srcBlob = await srcRes.blob();

      const { removeBackground } = await import("@imgly/background-removal");
      const cutBlob = await removeBackground(srcBlob);

      const fd = new FormData();
      fd.append("file", cutBlob, "cutout.png");
      fd.append("source_url", imageUrl);

      const res = await fetch(`/api/admin/shoes/${shoeId}/remove-background`, { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.message ?? translate("Background removal failed."));

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("Background removal failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={run} disabled={loading || !imageUrl}>
        <Scissors className="mr-1.5 h-3.5 w-3.5" />
        {loading ? translate("Removing background...") : translate("Remove background")}
      </Button>
      {error && <FeedbackMessage message={error} isError />}
    </>
  );
}
