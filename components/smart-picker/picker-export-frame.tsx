"use client";

import { useState, type ReactNode } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { proxiedImageSrc } from "@/lib/card/proxy-image";
import styles from "./picker-export.module.css";

export const PICK_COLORS = ["#245f8b", "#b75730", "#38786d", "#775d92"];

export function PickerExportFrame({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  return <article className={styles.frame} data-picker-export={compact ? "share" : "report"}>
    <header className={styles.header}>
      <div className={styles.brand}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon.png" alt="" width={32} height={32} />sneakerfeature
      </div>
      <span className={styles.eyebrow}>Picker / {compact ? (zh ? "推荐卡片" : "Shortlist") : (zh ? "选鞋报告" : "Field report")}</span>
    </header>
    <div className={`${styles.body} ${compact ? styles.shareBody : ""}`}>{children}</div>
    <footer className={styles.footer}>
      <div><strong>Find your next pair.</strong><p>{zh ? "你的需求，你的打法，你的下一双球鞋。" : "Your game. Your preferences. Your next pair."}</p><p>snkrfeature.com</p></div>
      <div className={styles.qr}><span>{zh ? "扫码开始\n你的选鞋" : "Find your\nnext pair"}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/qrcode.png" alt={zh ? "访问 snkrfeature.com" : "Visit snkrfeature.com"} width={88} height={88} />
      </div>
    </footer>
  </article>;
}

export function PickImage({ src }: { src: string | null }) {
  const { translate } = useLocale();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return src && failedSrc !== src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={proxiedImageSrc(src)} alt="" crossOrigin="anonymous" onError={() => setFailedSrc(src)} />
  ) : <span className={styles.noImage}>{translate("No image")}</span>;
}

export function PickRating({ value }: { value: number | null }) {
  const { locale } = useLocale();
  return <span className={styles.rating} aria-label={locale === "zh" ? "推荐评分" : "Recommendation rating"}>
    {value == null ? "—" : value.toFixed(1)}<small> / 5</small>
  </span>;
}

export function summaryMarkup(text: string) {
  return text.trim().replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    return bold ? <strong key={i}>{bold[1]}</strong> : <span key={i}>{part}</span>;
  });
}
