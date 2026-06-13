"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Modal } from "@/components/ui/modal";

// On the very first launch (no stored locale), ask the user to pick a language.
// Once chosen it's remembered, so this never shows again.
export function LanguageFirstRun() {
  const { requestLocaleChange } = useLocale();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("locale") === null) setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  function pick(lang: "en" | "zh") {
    try {
      window.localStorage.setItem("locale", lang);
    } catch {
      /* ignore */
    }
    requestLocaleChange(lang);
    setOpen(false);
  }

  return (
    <Modal open={open} onClose={() => undefined} title="" dismissible={false} zIndexClass="z-[90]">
      <div className="space-y-5 text-center">
        <div>
          <div className="text-3xl">👟</div>
          <p className="mt-2 text-lg font-semibold">Choose your language</p>
          <p className="text-sm text-[rgb(var(--subtext))]">选择语言</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => pick("en")}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] text-sm font-medium transition hover:border-[rgb(var(--text)/0.4)]"
          >
            English
          </button>
          <button
            type="button"
            onClick={() => pick("zh")}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] text-sm font-medium transition hover:border-[rgb(var(--text)/0.4)]"
          >
            中文
          </button>
        </div>
      </div>
    </Modal>
  );
}
