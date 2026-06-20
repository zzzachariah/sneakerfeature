"use client";

import {
  forwardRef,
  ImgHTMLAttributes,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";
import { proxiedImageSrc } from "@/lib/card/proxy-image";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  /** Skip background removal for this image (renders the source as-is). */
  disableBgRemoval?: boolean;
  /** Called with `true` once the processed (transparent) image is shown. */
  onBgRemoved?: (processed: boolean) => void;
};

// In-memory cache so each unique URL is only processed once per page lifetime.
const processedCache = new Map<string, string>();
const inflightJobs = new Map<string, Promise<string>>();

async function runBackgroundRemoval(rawSrc: string): Promise<string> {
  const cached = processedCache.get(rawSrc);
  if (cached) return cached;
  const pending = inflightJobs.get(rawSrc);
  if (pending) return pending;

  const job = (async () => {
    const { removeBackground } = await import("@imgly/background-removal");
    // Route through the proxy so the fetch is same-origin and CORS-clean.
    const fetchUrl = proxiedImageSrc(rawSrc);
    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`fetch_failed_${response.status}`);
    const inputBlob = await response.blob();
    const resultBlob = await removeBackground(inputBlob);
    const objectUrl = URL.createObjectURL(resultBlob);
    processedCache.set(rawSrc, objectUrl);
    return objectUrl;
  })();

  inflightJobs.set(rawSrc, job);
  try {
    return await job;
  } finally {
    inflightJobs.delete(rawSrc);
  }
}

export const BgRemovedImg = forwardRef<HTMLImageElement, Props>(function BgRemovedImg(
  { src, disableBgRemoval, onBgRemoved, ...rest },
  forwardedRef
) {
  const localRef = useRef<HTMLImageElement | null>(null);
  const [displaySrc, setDisplaySrc] = useState<string | undefined>(src ?? undefined);

  useImperativeHandle(forwardedRef, () => localRef.current as HTMLImageElement, []);

  useEffect(() => {
    setDisplaySrc(src ?? undefined);
    onBgRemoved?.(false);

    if (!src || disableBgRemoval) return;

    const cached = processedCache.get(src);
    if (cached) {
      setDisplaySrc(cached);
      onBgRemoved?.(true);
      return;
    }

    let cancelled = false;

    const start = () => {
      runBackgroundRemoval(src)
        .then((result) => {
          if (cancelled) return;
          setDisplaySrc(result);
          onBgRemoved?.(true);
        })
        .catch(() => {
          // Best-effort: keep the original src if processing fails.
        });
    };

    const node = localRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      start();
      return () => {
        cancelled = true;
      };
    }

    // Lazy: a feed of 100 cards shouldn't kick off 100 background-removal jobs.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.disconnect();
            start();
            break;
          }
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [src, disableBgRemoval, onBgRemoved]);

  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img ref={localRef} {...rest} src={displaySrc} />;
});
