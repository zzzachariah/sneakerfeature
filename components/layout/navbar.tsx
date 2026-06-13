"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Gavel, HelpCircle, Languages, Menu, Search, Sparkles, User } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useTutorial } from "@/components/tutorial/tutorial-provider";
import { AccountMenu } from "@/components/layout/account-menu";
import { NavScrollIndicator } from "@/components/layout/nav-scroll-indicator";
import { AboutModal } from "@/components/layout/about-modal";
import { TutorialTrigger } from "@/components/tutorial/tutorial-trigger";
import { Tooltip } from "@/components/ui/tooltip";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { NAV_ORDER } from "@/lib/nav-order";
import { useCookieConsent } from "@/components/consent/cookie-consent";
import { CONTACT_EMAIL } from "@/lib/legal/content";

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
  const zh = locale === "zh";
  const { reopen: reopenCookieConsent } = useCookieConsent();
  const { isLoggedIn: personaLoggedIn, openModal: openPersonaModal } = usePersona();
  const { isAdmin } = useAuthState();
  const { start: startTutorial } = useTutorial();
  const [langOpen, setLangOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    if (!legalOpen) return;
    const onClick = () => setLegalOpen(false);
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [legalOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Close the mobile menu when navigating between routes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      data-no-translate="true"
    >
      <div className="container-shell relative flex h-16 items-center">
        <Link
          href="/"
          aria-label="sneakerfeature — home"
          className="inline-flex items-center transition-opacity hover:opacity-80"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="sneakerfeature" className="nav-logo h-7 w-7 rounded-md" />
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
                className={`group relative inline-flex flex-col items-center rounded-lg px-3 py-2 text-[0.825rem] font-medium transition-colors duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] ${
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

        {/* Mobile-only in-page scroll indicator — lives in the otherwise empty
            center of the navbar on phones (continuous-scroll pages publish their
            sections to it). */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center md:hidden">
          <NavScrollIndicator />
        </div>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <Tooltip label={translate("Advanced Search")} className="hidden md:inline-flex">
            <Link
              href="/search/advanced"
              className={iconBtn}
              aria-label={translate("Advanced Search")}
              data-tutorial="nav-search"
            >
              <Search className="h-[18px] w-[18px] md:h-4 md:w-4" />
            </Link>
          </Tooltip>

          <div className="relative hidden md:block" onClick={(e) => e.stopPropagation()} data-tutorial="nav-language">
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

          <Tooltip label={translate("Player profile")} className="hidden md:inline-flex">
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

          <span className="hidden md:inline-flex" data-tutorial="nav-theme">
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
          <div className="relative hidden md:block" onClick={(e) => e.stopPropagation()}>
            <Tooltip label={zh ? "法律信息" : "Legal"}>
              <button
                type="button"
                onClick={() => setLegalOpen((prev) => !prev)}
                className={iconBtn}
                aria-haspopup="menu"
                aria-expanded={legalOpen}
                aria-label={zh ? "法律信息" : "Legal"}
              >
                <Gavel className="h-[18px] w-[18px] md:h-4 md:w-4" />
              </button>
            </Tooltip>
            {legalOpen && (
              <div className="nav-dropdown-panel absolute right-0 top-[calc(100%+0.4rem)] z-50 w-[11rem] rounded-xl p-1">
                {[
                  { href: "/terms" as const, label: zh ? "服务条款" : "Terms of Use" },
                  { href: "/privacy" as const, label: zh ? "隐私政策" : "Privacy Policy" },
                  { href: "/disclaimer" as const, label: zh ? "品牌免责声明" : "Brand Disclaimer" }
                ].map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setLegalOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm transition hover:bg-[rgb(var(--text)/0.06)]"
                  >
                    {l.label}
                  </Link>
                ))}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  onClick={() => setLegalOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm transition hover:bg-[rgb(var(--text)/0.06)]"
                >
                  {zh ? "联系" : "Contact"}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    reopenCookieConsent();
                    setLegalOpen(false);
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[rgb(var(--text)/0.06)]"
                >
                  {zh ? "Cookie 设置" : "Cookie settings"}
                </button>
              </div>
            )}
          </div>
          <span className="hidden md:inline-flex">
            <TutorialTrigger className={iconBtn} />
          </span>

          {/* Mobile-only hamburger: collapses the icon cluster into a labeled menu.
              `order-last` keeps it at the far right of the cluster (after the
              username + account avatar) on phones. */}
          <div ref={menuRef} className="relative order-last md:hidden" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className={iconBtn}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={translate("Menu")}
            >
              <Menu className="h-[18px] w-[18px]" />
            </button>
            {menuOpen && (
              <div className="nav-dropdown-panel absolute right-0 top-[calc(100%+0.4rem)] z-50 w-[13rem] rounded-xl p-1">
                <Link
                  href="/search/advanced"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.06)]"
                >
                  <Search className="h-4 w-4 shrink-0" />
                  {translate("Advanced Search")}
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    if (!personaLoggedIn) {
                      window.location.href = "/login";
                      return;
                    }
                    openPersonaModal();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.06)]"
                >
                  <User className="h-4 w-4 shrink-0" />
                  {translate("Player profile")}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    startTutorial();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.06)]"
                >
                  <HelpCircle className="h-4 w-4 shrink-0" />
                  {translate("Site tour")}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAboutOpen(true);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.06)]"
                >
                  <Sparkles className="h-4 w-4 shrink-0" />
                  {translate("About")}
                </button>

                <div className="my-1 h-px bg-[rgb(var(--glass-stroke-soft)/0.5)]" />

                {/* Language */}
                <div className="px-3 pb-1 pt-1 text-[0.7rem] font-medium uppercase tracking-wide text-[rgb(var(--subtext))]">
                  {translate("Language")}
                </div>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.06)]"
                  data-translation-lock="true"
                  onClick={() => {
                    requestLocaleChange("en");
                    setMenuOpen(false);
                  }}
                >
                  <span className="flex items-center gap-3">
                    <Languages className="h-4 w-4 shrink-0" />
                    English
                  </span>
                  {locale === "en" ? <Check className="h-4 w-4" /> : null}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.06)]"
                  data-translation-lock="true"
                  onClick={() => {
                    requestLocaleChange("zh");
                    setMenuOpen(false);
                  }}
                >
                  <span className="flex items-center gap-3">
                    <Languages className="h-4 w-4 shrink-0" />
                    中文
                  </span>
                  {locale === "zh" ? <Check className="h-4 w-4" /> : null}
                </button>

                {/* Theme — reuse the existing ThemeToggle button (icon shows current state) */}
                <div className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm text-[rgb(var(--text))]">
                  <span>{translate("Theme")}</span>
                  <ThemeToggle />
                </div>

                <div className="my-1 h-px bg-[rgb(var(--glass-stroke-soft)/0.5)]" />

                {[
                  { href: "/terms" as const, label: zh ? "服务条款" : "Terms of Use" },
                  { href: "/privacy" as const, label: zh ? "隐私政策" : "Privacy Policy" },
                  { href: "/disclaimer" as const, label: zh ? "品牌免责声明" : "Brand Disclaimer" }
                ].map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.06)]"
                  >
                    <Gavel className="h-4 w-4 shrink-0" />
                    {l.label}
                  </Link>
                ))}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.06)]"
                >
                  <Gavel className="h-4 w-4 shrink-0" />
                  {zh ? "联系" : "Contact"}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    reopenCookieConsent();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.06)]"
                >
                  <Gavel className="h-4 w-4 shrink-0" />
                  {zh ? "Cookie 设置" : "Cookie settings"}
                </button>
              </div>
            )}
          </div>

          <span className="inline-flex" data-tutorial="nav-account">
            <AccountMenu />
          </span>
        </div>
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </header>
  );
}
