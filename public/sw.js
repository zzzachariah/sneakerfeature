// sneakerfeature service worker — conservative caching to speed up repeat loads
// and add offline resilience, WITHOUT ever risking stale personalized content.
//
//   • static assets / fonts (hashed, immutable) → stale-while-revalidate
//   • same-origin images                        → stale-while-revalidate
//   • full-page navigations                     → network-first, cache fallback
//   • RSC fetches, /api, non-GET, cross-origin  → passthrough (never cached)
//
// Bump VERSION to roll caches. skipWaiting + clients.claim push updates fast.

const VERSION = "v1";
const STATIC_CACHE = `sf-static-${VERSION}`;
const IMAGE_CACHE = `sf-images-${VERSION}`;
const PAGE_CACHE = `sf-pages-${VERSION}`;
const KEEP = new Set([STATIC_CACHE, IMAGE_CACHE, PAGE_CACHE]);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || /\.(?:css|js|woff2?|ttf|otf)$/.test(url.pathname);
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return cached || (await network) || fetch(request);
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Only our own origin; never API; never the React Server Component data fetches
  // (those must always be fresh so auth/personalization is never stale).
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }
  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGE_CACHE));
    return;
  }
  // Everything else: let the network handle it.
});
