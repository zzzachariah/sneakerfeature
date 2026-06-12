import { useLocale } from "@/components/i18n/locale-provider";

// Picks the right language for a content field that has a stored Chinese (`*_zh`)
// translation alongside its English source. In zh locale we use the stored
// translation when present and fall back to English when it's empty (e.g. a shoe
// the admin translation job hasn't reached yet). This replaces the old
// render-time machine-translation path for sneaker tech / feel / story content —
// those values are now pre-translated and stored in Supabase.
export function pickLocalized(locale: string, en?: string | null, zh?: string | null): string | null {
  if (locale === "zh") {
    const z = typeof zh === "string" ? zh.trim() : "";
    if (z) return zh as string;
  }
  return typeof en === "string" ? en : null;
}

// Hook form for components already inside the LocaleProvider.
export function useLocalizedField(en?: string | null, zh?: string | null): string | null {
  const { locale } = useLocale();
  return pickLocalized(locale, en, zh);
}
