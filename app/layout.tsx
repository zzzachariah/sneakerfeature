import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Navbar } from "@/components/layout/navbar";
import { CapacitorBridge } from "@/components/native/capacitor-bridge";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import {
  CookieConsentProvider,
  CookieBanner,
  AnalyticsGate,
} from "@/components/consent/cookie-consent";
import { ThemeInitScript } from "@/components/theme/theme-toggle";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { RatingFocusProvider } from "@/components/preferences/rating-focus-provider";
import { PersonaProvider } from "@/components/preferences/persona-provider";
import { AuthStateProvider } from "@/components/auth/auth-state-provider";
import { TutorialProvider } from "@/components/tutorial/tutorial-provider";
import { TutorialOverlay } from "@/components/tutorial/tutorial-overlay";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { DEFAULT_OG_IMAGE_URL, HOME_DESCRIPTION, HOME_TITLE, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: HOME_TITLE,
    template: "%s",
  },
  description: HOME_DESCRIPTION,
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    type: "website",
    url: SITE_URL,
    images: [{ url: DEFAULT_OG_IMAGE_URL }],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE_URL],
  },
};

// viewport-fit=cover lets the layout extend under the status bar / home
// indicator so safe-area-inset-* env() values resolve inside the native app.
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeInitScript />
        <CapacitorBridge />
        <LocaleProvider>
          <CookieConsentProvider>
            <AuthStateProvider>
              <RatingFocusProvider>
                <PersonaProvider>
                  <TutorialProvider>
                    <div className="relative flex min-h-[100dvh] flex-col">
                      <div className="app-ambient-bg pointer-events-none fixed inset-0 -z-10" />
                      <Navbar />
                      <div className="flex-1">{children}</div>
                      <MobileBottomNav />
                    </div>
                    <TutorialOverlay />
                  </TutorialProvider>
                </PersonaProvider>
              </RatingFocusProvider>
            </AuthStateProvider>
            <CookieBanner />
            <AnalyticsGate />
          </CookieConsentProvider>
        </LocaleProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
