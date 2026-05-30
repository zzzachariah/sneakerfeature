import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { Navbar } from "@/components/layout/navbar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { Footer } from "@/components/layout/footer";
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

const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeInitScript />
        <LocaleProvider>
          <AuthStateProvider>
            <RatingFocusProvider>
              <PersonaProvider>
                <TutorialProvider>
                  <div className="relative flex min-h-[100dvh] flex-col">
                    <div className="app-ambient-bg pointer-events-none fixed inset-0 -z-10" />
                    <Navbar />
                    <div className="flex-1">{children}</div>
                    <Footer />
                    <MobileBottomNav />
                  </div>
                  <TutorialOverlay />
                </TutorialProvider>
              </PersonaProvider>
            </RatingFocusProvider>
          </AuthStateProvider>
        </LocaleProvider>
        <Analytics />
        <SpeedInsights />
        {GOOGLE_ADS_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-ads-gtag" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GOOGLE_ADS_ID}');
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
