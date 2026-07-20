"use client";

import Link from "next/link";
import type { Route } from "next";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useLocale } from "@/components/i18n/locale-provider";
import { useCookieConsent } from "@/components/consent/cookie-consent";
import { CONTACT_EMAIL } from "@/lib/legal/content";

// The site footer only appears on normal-scroll content pages. The immersive,
// viewport-sized routes (home / compare / detail / dashboard / submit / the
// hidden tools) size themselves to the viewport and must NOT get a footer
// appended below them, so this returns null everywhere except the allowlist.
// It is the conventional home for legal + cookie settings — the privacy copy
// tells users to change cookie choices "in the footer", so one has to exist.
const FOOTER_ROUTES = [
  "/privacy",
  "/terms",
  "/disclaimer",
  "/announcements",
  "/download",
  "/favorites",
  "/closet",
  "/advisor",
  "/search",
  "/for-you",
];

export function SiteFooter() {
  const pathname = usePathname();
  const { locale, translate } = useLocale();
  const { reopen } = useCookieConsent();
  const zh = locale === "zh";

  const show = FOOTER_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
  if (!show) return null;

  const year = new Date().getFullYear();

  const linkCls =
    "text-sm text-[rgb(var(--subtext))] underline-offset-4 transition-colors hover:text-[rgb(var(--text))] focus-visible:outline-none focus-visible:underline";

  const explore: { href: Route; label: string }[] = [
    { href: "/" as Route, label: translate("Home") },
    { href: "/compare" as Route, label: translate("Compare") },
    { href: "/smart-picker" as Route, label: translate("Smart Picker") },
    { href: "/search/advanced" as Route, label: translate("Advanced Search") },
  ];
  const legal: { href: Route; label: string }[] = [
    { href: "/terms" as Route, label: zh ? "服务条款" : "Terms of Use" },
    { href: "/privacy" as Route, label: zh ? "隐私政策" : "Privacy Policy" },
    { href: "/disclaimer" as Route, label: zh ? "品牌免责声明" : "Brand Disclaimer" },
    { href: "/announcements" as Route, label: zh ? "公告" : "Announcements" },
  ];

  return (
    <footer
      data-no-translate="true"
      className="mt-16 border-t border-[rgb(var(--glass-stroke-soft)/0.4)]"
      style={{ paddingBottom: "calc(var(--mobile-nav-h) + 1.5rem)" }}
    >
      <div className="container-shell py-10 md:py-12">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div className="max-w-xs">
            <span className="inline-flex items-center gap-2">
              <Image src="/logo.png" alt="sneakerfeature" width={26} height={26} className="rounded-md" />
              <span className="text-sm font-semibold tracking-[-0.01em]">sneakerfeature</span>
            </span>
            <p className="mt-3 text-[0.82rem] leading-relaxed soft-text">
              {zh
                ? "把一双篮球鞋的所有信息，聚合在一处 —— 更快地探索、对比与理解。"
                : "Every detail of a basketball shoe, in one place — to explore, compare, and understand faster."}
            </p>
          </div>

          {/* Explore */}
          <nav aria-label={translate("Explore")}>
            <p className="t-eyebrow">{zh ? "探索" : "Explore"}</p>
            <ul className="mt-3 space-y-2">
              {explore.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkCls}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Legal */}
          <nav aria-label={zh ? "法律" : "Legal"}>
            <p className="t-eyebrow">{zh ? "法律" : "Legal"}</p>
            <ul className="mt-3 space-y-2">
              {legal.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkCls}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* More */}
          <div>
            <p className="t-eyebrow">{zh ? "更多" : "More"}</p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href={"/download" as Route} className={linkCls} data-download-entry>
                  {zh ? "下载 App" : "Get the app"}
                </Link>
              </li>
              <li>
                <button type="button" onClick={reopen} className={`${linkCls} text-left`}>
                  {zh ? "Cookie 设置" : "Cookie settings"}
                </button>
              </li>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className={linkCls}>
                  {zh ? "联系我们" : "Contact"}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-[rgb(var(--glass-stroke-soft)/0.3)] pt-6 text-xs soft-text sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} sneakerfeature</span>
          <span>{zh ? "为篮球鞋而造 · 独立项目" : "Built for basketball shoes · an independent project"}</span>
        </div>
      </div>
    </footer>
  );
}
