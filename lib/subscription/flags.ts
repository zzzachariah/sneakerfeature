// Public feature flag for the membership / subscribe surface.
//
// The membership surface (the /subscribe page, its nav entries, the promo
// popup and the size-advisor upsell) is LIVE by default. To take it back down
// — e.g. if the payment provider needs to be paused — set
// NEXT_PUBLIC_SUBSCRIBE_LIVE="false" and every entry point hides at once while
// admins keep direct access to /subscribe for testing.
//
// NEXT_PUBLIC_ vars are inlined at build time, so this constant is safe to
// import from both server and client components.
export const SUBSCRIBE_LIVE = process.env.NEXT_PUBLIC_SUBSCRIBE_LIVE !== "false";
