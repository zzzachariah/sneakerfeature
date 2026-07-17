// Public feature flag for the membership / subscribe surface. While the Stripe
// payment flow is being finished, set NEXT_PUBLIC_SUBSCRIBE_LIVE anything other
// than "true" (or leave it unset): the /subscribe page and its nav links are
// hidden from the public, but admins can still reach /subscribe directly to test
// the real checkout end-to-end. Flip to "true" to open it to everyone.
//
// NEXT_PUBLIC_ vars are inlined at build time, so this constant is safe to
// import from both server and client components.
export const SUBSCRIBE_LIVE = process.env.NEXT_PUBLIC_SUBSCRIBE_LIVE === "true";
