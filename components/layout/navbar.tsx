"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Languages, Search, Sliders, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { AccountMenu } from "@/components/layout/account-menu";
import { AboutModal } from "@/components/layout/about-modal";
import { useLocale } from "@/components/i18n/locale-provider";
import { useRatingFocus } from "@/components/preferences/rating-focus-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { DIM_LABELS } from "@/lib/star-rating";
import { NAV_ORDER } from "@/lib/nav-order";

type NavHref = "/" | "/compare" | "/submit" | "/dashboard" | "/admin" | "/search/advanced";

const NAV_LABELS: Record<(typeof NAV_ORDER)[number], string> = {
  "/": "Home",
  "/compare": "Compare",
  "/submit": "Submit",
  "/dashboard": "Dashboard",
  "/admin": "Admin"
};

export function Navbar() {
  const pathname = usePathname();
  const { locale, requestLocaleChange, translate } = useLocale();
  const { focus: ratingFocus, isLoggedIn: focusLoggedIn, openModal: openFocusModal } = useRatingFocus();
  const { isAdmin } = useAuthState();
  const [langOpen, setLangOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!langOpen) return;
    const onClick = () => setLangOpen(false);
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [langOpen]);

  useEffect(() => {
    if (!focusOpen) return;
    const onClick = () => setFocusOpen(false);
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [focusOpen]);

  const navItems = useMemo(() => {
    return NAV_ORDER.filter((href) => href !== "/admin" || isAdmin).map((href) => ({
      href: href as NavHref,
      label: NAV_LABELS[href]
    }));
  }, [isAdmin]);

  const iconBtn =
    "relative inline-flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--subtext))] transition-[background-color,color] duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[rgb(var(--text)/0.08)] hover:text-[rgb(var(--text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] md:h-8 md:w-8";

  return (
    <header
      className={`sticky top-0 z-40 transition-[background-color,backdrop-filter,border-color] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        scrolled
          ? "border-b border-[rgb(var(--glass-stroke-soft)/0.4)] bg-[rgb(var(--bg)/0.72)] backdrop-blur-[16px] backdrop-saturate-[180%]"
          : "border-b border-transparent bg-transparent"
      }`}
      data-no-translate="true"
    >
      <div className="container-shell relative flex h-16 items-center">
        <Link
          href="/"
          className="max-w-[6.5rem] truncate text-[0.88rem] font-bold tracking-[-0.02em] sm:max-w-[9.5rem] sm:text-[0.9rem] md:max-w-none"
        >
          snkrfeature
        </Link>

        <nav className="pointer-events-auto absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative inline-flex flex-col items-center px-3 py-2 text-[0.825rem] font-medium transition-colors duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none ${
                  active
                    ? "text-[rgb(var(--text))]"
                    : "text-[rgb(var(--subtext))] hover:text-[rgb(var(--text))]"
                }`}
              >
                {translate(item.label)}
                <span
                  aria-hidden
                  className="mt-1.5 h-[2px] rounded-sm transition-[width,background-color] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:bg-[rgb(var(--text)/0.4)]"
                  style={{
                    width: active ? 22 : 4,
                    background: active
                      ? "rgb(var(--text)/0.8)"
                      : "rgb(var(--muted)/0.55)"
                  }}
                />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <Link
            href="/search/advanced"
            className={iconBtn}
            aria-label={translate("Advanced Search")}
            title={translate("Advanced Search")}
          >
            <Search className="h-[18px] w-[18px] md:h-4 md:w-4" />
          </Link>

          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLangOpen((prev) => !prev)}
              className={iconBtn}
              aria-haspopup="menu"
              aria-expanded={langOpen}
              aria-label={translate("Language")}
              title={locale === "en" ? "English" : "中文"}
              data-translation-lock="true"
            >
              <Languages className="h-[18px] w-[18px] md:h-4 md:w-4" />
            </button>
            {langOpen && (
              <div className="nav-dropdown-panel absolute right-0 top-[calc(100%+0.4rem)] z-50 w-[9rem] rounded-xl p-1">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[rgb(var(--text)/0.06)]"
                  onClick={() => {
                    requestLocaleChange("en");
                    setLangOpen(false);
                  }}
                >
                  English
                  {locale === "en" ? <Check className="h-4 w-4" /> : null}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[rgb(var(--text)/0.06)]"
                  onClick={() => {
                    requestLocaleChange("zh");
                    setLangOpen(false);
                  }}
                >
                  中文
                  {locale === "zh" ? <Check className="h-4 w-4" /> : null}
                </button>
              </div>
            )}
          </div>

          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setFocusOpen((prev) => !prev)}
              className={iconBtn}
              aria-haspopup="menu"
              aria-expanded={focusOpen}
              aria-label={translate("Rating focus")}
              title={translate("Rating focus")}
            >
              <Sliders className="h-[18px] w-[18px] md:h-4 md:w-4" />
            </button>
            {focusOpen && (
              <div className="nav-dropdown-panel absolute right-0 top-[calc(100%+0.4rem)] z-50 w-[15rem] rounded-xl p-2">
                <p className="px-2 pb-1 text-[0.65rem] uppercase tracking-[0.14em] soft-text">
                  {translate("Rating focus")}
                </p>
                {ratingFocus ? (
                  <ul className="grid gap-0.5 px-1 pb-2 text-sm">
                    <li className="flex items-center justify-between gap-2">
                      <span>{translate("Primary")}</span>
                      <span className="text-amber-300">
                        {translate(DIM_LABELS[ratingFocus.primary])} · 40%
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-2">
                      <span>{translate("Secondary")}</span>
                      <span className="text-amber-300">
                        {translate(DIM_LABELS[ratingFocus.secondary])} · 30%
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-2">
                      <span>{translate("Tertiary")}</span>
                      <span className="text-amber-300">
                        {translate(DIM_LABELS[ratingFocus.tertiary])} · 20%
                      </span>
                    </li>
                  </ul>
                ) : (
                  <p className="px-1 pb-2 text-xs soft-text">
                    {focusLoggedIn
                      ? translate("Pick playstyle to see ratings")
                      : translate("Sign in to pick playstyle")}
                  </p>
                )}
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[rgb(var(--text)/0.06)]"
                  onClick={() => {
                    setFocusOpen(false);
                    if (!focusLoggedIn) {
                      window.location.href = "/login";
                      return;
                    }
                    openFocusModal();
                  }}
                >
                  {ratingFocus ? translate("Edit playstyle") : translate("Pick playstyle")}
                </button>
              </div>
            )}
          </div>

          <ThemeToggle />
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className={`${iconBtn} hidden md:inline-flex`}
            aria-label={translate("About")}
            title={translate("About")}
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <AccountMenu />
        </div>
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </header>
  );
}
