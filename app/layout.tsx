import "./globals.css";
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
const GeistMono = localFont({
  src: "../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Roboto Mono", "Menlo", "Monaco", "Liberation Mono", "DejaVu Sans Mono", "Courier New", "monospace"],
  weight: "100 900",
});
import { Navbar } from "@/components/layout/navbar";
import { CapacitorBridge } from "@/components/native/capacitor-bridge";
import { ServiceWorkerRegister } from "@/components/native/service-worker-register";
import { RouteProgress } from "@/components/layout/route-progress";
import { PushRegistration } from "@/components/native/push-registration";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { NativeBottomNav } from "@/components/native/native-bottom-nav";
import { NativeTopBar } from "@/components/native/native-top-bar";
import { NativePullToRefresh } from "@/components/native/native-gestures";
import { NativeBottomReload } from "@/components/native/native-bottom-reload";
import { NavScrollIndicatorProvider } from "@/components/layout/nav-scroll-indicator";
import { RouteMemory } from "@/components/auth/route-memory";
import {
  CookieConsentProvider,
  CookieBanner,
  AnalyticsGate,
  VercelAnalyticsGate,
} from "@/components/consent/cookie-consent";
import { ThemeInitScript } from "@/components/theme/theme-toggle";
import { SkinInitScript } from "@/components/theme/skin-init";
import { GlassFilterDefs } from "@/components/ui/glass-filter";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { LanguageFirstRun } from "@/components/i18n/language-first-run";
import { AnnouncementModal } from "@/components/announce/announcement-modal";
import { RatingFocusProvider } from "@/components/preferences/rating-focus-provider";
import { PersonaProvider } from "@/components/preferences/persona-provider";
import { AuthStateProvider } from "@/components/auth/auth-state-provider";
import { FavoritesProvider } from "@/components/favorites/favorites-provider";
import { TutorialProvider } from "@/components/tutorial/tutorial-provider";
import { TutorialOverlay } from "@/components/tutorial/tutorial-overlay";
import { DEFAULT_OG_IMAGE_URL, HOME_DESCRIPTION, HOME_TITLE, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  manifest: "/manifest.webmanifest",
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
  // Pinch-zoom stays enabled for accessibility (WCAG 1.4.4 — low-vision users
  // must be able to magnify). The reason zoom used to be locked was iOS
  // auto-zooming on input focus; that's prevented the right way instead — form
  // fields are kept ≥16px on mobile (see globals.css @layer base) so iOS never
  // triggers the focus zoom.
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        <link rel="preconnect" href="https://challenges.cloudflare.com" crossOrigin="anonymous" />
      </head>
      <body>
        <ThemeInitScript />
        <SkinInitScript />
        <GlassFilterDefs />
        <CapacitorBridge />
        <ServiceWorkerRegister />
        <RouteProgress />
        <RouteMemory />
        <LocaleProvider>
          <LanguageFirstRun />
          <CookieConsentProvider>
            <AuthStateProvider>
              <FavoritesProvider>
              <RatingFocusProvider>
                <PersonaProvider>
                  <TutorialProvider>
                    <NavScrollIndicatorProvider>
                      <div className="relative flex min-h-[100dvh] flex-col">
                        <div className="app-ambient-bg pointer-events-none fixed inset-0 -z-10" />
                        <Navbar />
                        <NativeTopBar />
                        <div className="flex-1">{children}</div>
                        <MobileBottomNav />
                        <NativeBottomNav />
                      </div>
                    </NavScrollIndicatorProvider>
                    <TutorialOverlay />
                    <PushRegistration />
                    <NativePullToRefresh />
                    <NativeBottomReload />
                  </TutorialProvider>
                </PersonaProvider>
              </RatingFocusProvider>
              </FavoritesProvider>
            </AuthStateProvider>
            <CookieBanner />
            <AnalyticsGate />
            <VercelAnalyticsGate />
            <AnnouncementModal />
          </CookieConsentProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
