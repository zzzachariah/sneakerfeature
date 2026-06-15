"use client";

import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { NativeChrome, type NativeNavButton, type NativeMenuNode } from "@/components/native/native-chrome";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { useTutorial } from "@/components/tutorial/tutorial-provider";
import { useCookieConsent } from "@/components/consent/cookie-consent";
import { AboutModal } from "@/components/layout/about-modal";
import { createClient } from "@/lib/supabase/client";
import { CONTACT_EMAIL } from "@/lib/legal/content";

// Drives the native iOS glass top bar (UINavigationBar + UIMenu dropdowns). On
// every other platform this renders only the (closed) About modal and never
// touches the plugin — the web Navbar stays in charge. The web header is hidden
// in-app via the `native-topbar-active` class, added only after configureNavBar
// resolves, so a missing/broken plugin leaves the web header visible.
const nativeBarAvailable = () =>
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "ios" &&
  Capacitor.isPluginAvailable("NativeChrome");

export function NativeTopBar() {
  const router = useRouter();
  const { locale, translate, requestLocaleChange } = useLocale();
  const { isLoggedIn: personaLoggedIn, openModal: openPersonaModal } = usePersona();
  const { signedIn, isAdmin } = useAuthState();
  const { start: startTutorial } = useTutorial();
  const { reopen: reopenCookieConsent } = useCookieConsent();
  const [aboutOpen, setAboutOpen] = useState(false);
  const zh = locale === "zh";

  // Kept in a ref so the single navAction listener always sees fresh state.
  const handleAction = (key: string) => {
    if (key === "home") router.push("/" as Route);
    else if (key.startsWith("nav:")) router.push(key.slice(4) as Route);
    else if (key === "persona") {
      if (personaLoggedIn) openPersonaModal();
      else router.push("/login" as Route);
    } else if (key === "tutorial") startTutorial();
    else if (key === "about") setAboutOpen(true);
    else if (key === "lang:en") requestLocaleChange("en");
    else if (key === "lang:zh") requestLocaleChange("zh");
    else if (key === "contact") window.location.href = `mailto:${CONTACT_EMAIL}`;
    else if (key === "cookie") reopenCookieConsent();
    else if (key === "logout") {
      const supabase = createClient();
      void supabase?.auth.signOut();
    }
  };
  const actionRef = useRef(handleAction);
  actionRef.current = handleAction;

  // (Re)build the native bar whenever its contents change.
  useEffect(() => {
    if (!nativeBarAvailable()) {
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") {
        console.warn("[native-chrome] plugin not available — keeping the web top bar.");
      }
      return;
    }

    const accountMenu: NativeMenuNode[] = signedIn
      ? [
          { key: "nav:/dashboard", label: translate("Dashboard"), symbol: "square.grid.2x2" },
          ...(isAdmin ? [{ key: "nav:/admin", label: translate("Admin"), symbol: "shield" }] : []),
          {
            key: "logout",
            label: translate("Log out"),
            symbol: "rectangle.portrait.and.arrow.right",
            destructive: true
          }
        ]
      : [
          { key: "nav:/login", label: translate("Log in"), symbol: "person.crop.circle" },
          { key: "nav:/signup", label: translate("Sign up"), symbol: "person.badge.plus" }
        ];

    const moreMenu: NativeMenuNode[] = [
      { key: "nav:/search/advanced", label: translate("Advanced Search"), symbol: "magnifyingglass" },
      { key: "persona", label: translate("Player profile"), symbol: "person.fill" },
      { key: "tutorial", label: translate("Site tour"), symbol: "questionmark.circle" },
      { key: "about", label: translate("About"), symbol: "sparkles" },
      {
        key: "language",
        label: translate("Language"),
        symbol: "globe",
        children: [
          { key: "lang:en", label: "English", checked: locale === "en" },
          { key: "lang:zh", label: "中文", checked: locale === "zh" }
        ]
      },
      {
        key: "legal",
        label: zh ? "法律信息" : "Legal",
        symbol: "doc.text",
        children: [
          { key: "nav:/terms", label: zh ? "服务条款" : "Terms of Use" },
          { key: "nav:/privacy", label: zh ? "隐私政策" : "Privacy Policy" },
          { key: "nav:/disclaimer", label: zh ? "品牌免责声明" : "Brand Disclaimer" },
          { key: "contact", label: zh ? "联系" : "Contact" },
          { key: "cookie", label: zh ? "Cookie 设置" : "Cookie settings" }
        ]
      }
    ];

    const buttons: NativeNavButton[] = [
      { key: "more", symbol: "line.3.horizontal", menu: moreMenu },
      { key: "account", symbol: signedIn ? "person.crop.circle.fill" : "person.crop.circle", menu: accountMenu }
    ];

    NativeChrome.configureNavBar({ title: "sneakerfeature", buttons })
      .then(() => document.documentElement.classList.add("native-topbar-active"))
      .catch((err) => console.warn("[native-chrome] configureNavBar failed:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, isAdmin, locale, translate]);

  // One navAction listener for the bar's lifetime; dispatch through the ref.
  useEffect(() => {
    if (!nativeBarAvailable()) return;
    let remove: (() => void) | undefined;
    void (async () => {
      const handle = await NativeChrome.addListener("navAction", ({ key }) => actionRef.current(key));
      remove = () => void handle.remove();
    })();
    return () => remove?.();
  }, []);

  return <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />;
}
