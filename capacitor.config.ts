import type { CapacitorConfig } from "@capacitor/cli";

// The mobile app is a thin native shell that loads the live site, mirroring the
// Electron desktop app (see electron/main.js). The Next.js app is server
// rendered and cannot be statically exported, so instead of bundling web assets
// we point the WebView at production. Override with SNEAKERFEATURE_URL to test
// against a local dev server, e.g. SNEAKERFEATURE_URL=http://192.168.1.20:3000.
const SITE_URL = process.env.SNEAKERFEATURE_URL || "https://snkrfeature.com";
const isHttp = SITE_URL.startsWith("http://");

// Cloudflare Turnstile (used by comments/submissions) rejects User-Agents it
// flags as automation, so we append a vanilla marker token — same rationale as
// electron/main.js:24-32.
const USER_AGENT_SUFFIX = "sneakerfeature-mobile";

const config: CapacitorConfig = {
  appId: "com.sneakerfeature.app",
  appName: "sneakerfeature",
  // webDir is only the offline fallback shell; real content comes from server.url.
  webDir: "capacitor-shell",
  server: {
    url: SITE_URL,
    ...(isHttp ? { cleartext: true } : {}),
  },
  backgroundColor: "#0a0a0a",
  ios: {
    appendUserAgent: USER_AGENT_SUFFIX,
    backgroundColor: "#0a0a0a",
    contentInset: "always",
  },
  android: {
    appendUserAgent: USER_AGENT_SUFFIX,
    backgroundColor: "#0a0a0a",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#0a0a0a",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
