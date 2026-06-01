"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Languages, Search, Sparkles, User } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { AccountMenu } from "@/components/layout/account-menu";
import { AboutModal } from "@/components/layout/about-modal";
import { TutorialTrigger } from "@/components/tutorial/tutorial-trigger";
import { Tooltip } from "@/components/ui/tooltip";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { NAV_ORDER } from "@/lib/nav-order";

type NavHref = "/" | "/compare" | "/smart-picker" | "/submit" | "/dashboard" | "/admin" | "/search/advanced";

const NAV_LABELS: Record<(typeof NAV_ORDER)[number], string> = {
  "/": "Home",
  "/compare": "Compare",
  "/smart-picker": "Smart Picker",
  "/submit": "Submit",
  "/dashboard": "Dashboard",
  "/admin": "Admin"
};

export function Navbar() {
  const pathname = usePathname();
  const { locale, requestLocaleChange, translate } = useLocale();
  const { isLoggedIn: personaLoggedIn, openModal: openPersonaModal } = usePersona();
  const { isAdmin } = useAuthState();
  const [langOpen, setLangOpen] = useState(false);
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
          sneakerfeature
        </Link>

        <nav
          className="pointer-events-auto absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex"
          data-tutorial="nav-links"
        >
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
          <Tooltip label={translate("Advanced Search")}>
            <Link
              href="/search/advanced"
              className={iconBtn}
              aria-label={translate("Advanced Search")}
              data-tutorial="nav-search"
            >
              <Search className="h-[18px] w-[18px] md:h-4 md:w-4" />
            </Link>
          </Tooltip>

          <div className="relative" onClick={(e) => e.stopPropagation()} data-tutorial="nav-language">
            <Tooltip label={locale === "en" ? "English" : "中文"}>
              <button
                type="button"
                onClick={() => setLangOpen((prev) => !prev)}
                className={iconBtn}
                aria-haspopup="menu"
                aria-expanded={langOpen}
                aria-label={translate("Language")}
                data-translation-lock="true"
              >
                <Languages className="h-[18px] w-[18px] md:h-4 md:w-4" />
              </button>
            </Tooltip>
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

          <Tooltip label={translate("Player profile")}>
            <button
              type="button"
              onClick={() => {
                if (!personaLoggedIn) {
                  window.location.href = "/login";
                  return;
                }
                openPersonaModal();
              }}
              className={iconBtn}
              aria-label={translate("Player profile")}
              data-tutorial="nav-persona"
            >
              <User className="h-[18px] w-[18px] md:h-4 md:w-4" />
            </button>
          </Tooltip>

          <span className="inline-flex" data-tutorial="nav-theme">
            <ThemeToggle />
          </span>
          <Tooltip label={translate("About")} className="hidden md:inline-flex">
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className={iconBtn}
              aria-label={translate("About")}
            >
              <Sparkles className="h-4 w-4" />
            </button>
          </Tooltip>
          <TutorialTrigger className={iconBtn} />
          <span className="inline-flex" data-tutorial="nav-account">
            <AccountMenu />
          </span>
        </div>
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </header>
  );
}
