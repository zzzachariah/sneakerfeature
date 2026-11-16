// Enforced, nonce-based Content Security Policy (edge-safe: no Node APIs).
//
// Every page response gets a fresh nonce. Next.js reads it from the request's
// CSP header and stamps it on its own framework scripts; our pre-paint inline
// scripts and next/script tags receive it via the x-nonce header (see
// app/layout.tsx and components/security/nonce-context.tsx).
//
// 'strict-dynamic' lets a nonce'd script load the scripts it needs (Turnstile,
// gtag, Vercel analytics) without allow-listing every host; browsers that
// support it ignore the https:/'unsafe-inline' fallbacks.

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function supabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const url = new URL(raw);
    return [url.origin, `wss://${url.host}`];
  } catch {
    return [];
  }
}

export function buildCsp(nonce: string, opts: { dev?: boolean } = {}): string {
  const dev = opts.dev ?? process.env.NODE_ENV !== "production";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // Background removal (onnxruntime-web) compiles WebAssembly.
      "'wasm-unsafe-eval'",
      // Fallbacks for browsers without CSP3; ignored when a nonce is present.
      "https:",
      "'unsafe-inline'",
      ...(dev ? ["'unsafe-eval'"] : [])
    ],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "connect-src": [
      "'self'",
      ...supabaseOrigins(),
      "https://challenges.cloudflare.com",
      "https://staticimgly.com",
      "https://vitals.vercel-insights.com",
      "https://va.vercel-scripts.com",
      "https://www.googletagmanager.com",
      "https://www.google-analytics.com",
      "https://*.google-analytics.com",
      "https://*.doubleclick.net",
      "https://www.google.com",
      "blob:",
      "data:",
      ...(dev ? ["ws:", "http://localhost:*"] : [])
    ],
    "media-src": ["'self'", "blob:", "data:"],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'", "https://challenges.cloudflare.com", "https://www.googletagmanager.com", "https://td.doubleclick.net"],
    "frame-ancestors": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "manifest-src": ["'self'"]
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
