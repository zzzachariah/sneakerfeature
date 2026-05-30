"use client";

import Link from "next/link";
import { useLocale } from "@/components/i18n/locale-provider";
import { useCookieConsent } from "@/components/consent/cookie-consent";
import { CONTACT_EMAIL } from "@/lib/legal/content";

/**
 * Global site footer. Hosts the legal links (Terms / Privacy / Disclaimer) and a
 * Contact mailto — fulfilling the "press contact at the bottom of any page" promise
 * made in the About modal and signup gate.
 *
 * Bilingual labels use the `locale` branch (not `translate()`) so Chinese is
 * guaranteed without touching the UI dictionary. `pb-[var(--mobile-nav-h)]` clears
 * the fixed MobileBottomNav on mobile (that variable is 0px on desktop, where the
 * bottom nav is hidden).
 */
export function Footer() {
  const { locale } = useLocale();
  const { reopen } = useCookieConsent();
  const zh = locale === "zh";

  const links = [
    { href: "/terms" as const, label: zh ? "服务条款" : "Terms of Use" },
    { href: "/privacy" as const, label: zh ? "隐私政策" : "Privacy Policy" },
    { href: "/disclaimer" as const, label: zh ? "品牌免责声明" : "Brand Disclaimer" },
  ];

  const linkClass =
    "text-sm text-[rgb(var(--subtext))] underline-offset-4 transition-colors hover:text-[rgb(var(--text))] hover:underline";

  return (
    <footer
      data-no-translate="true"
      className="border-t border-[rgb(var(--glass-stroke-soft)/0.4)] pb-[var(--mobile-nav-h)]"
    >
      <div className="container-shell flex flex-col gap-5 py-8 md:flex-row md:items-center md:justify-between md:py-10">
        <div className="space-y-1">
          <p className="text-[0.9rem] font-bold tracking-[-0.02em]">sneakerfeature</p>
          <p className="text-xs soft-text">
            {zh ? "独立篮球鞋信息与社区平台" : "Independent basketball-sneaker info & community"}
          </p>
          <p className="text-xs soft-text">
            © {new Date().getFullYear()} sneakerfeature. {zh ? "保留所有权利。" : "All rights reserved."}
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass}>
              {l.label}
            </Link>
          ))}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
            {zh ? "联系" : "Contact"}
          </a>
          <button type="button" onClick={reopen} className={`${linkClass} cursor-pointer`}>
            {zh ? "Cookie 设置" : "Cookie settings"}
          </button>
        </nav>
      </div>
    </footer>
  );
}
