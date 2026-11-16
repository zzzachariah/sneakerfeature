// Server-side Cloudflare Turnstile verification. The widget
// (components/ui/human-check.tsx) renders the Cloudflare challenge and hands the
// resulting token to the protected form submission; the API route then verifies
// it here against Cloudflare's siteverify endpoint. Tokens are single-use and
// validated by Cloudflare, so they cannot be forged or replayed client-side.

const TURNSTILE_TIMEOUT_MS = 8000;

export async function verifyTurnstileToken(token?: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  // No secret configured: accept only outside production so local/demo setups
  // stay usable. In production a missing secret FAILS CLOSED — a deploy that
  // lost its env var must not silently drop bot protection on login/signup.
  // ALLOW_INSECURE_NO_TURNSTILE=1 is an explicit escape hatch for self-hosted demos.
  if (!secret) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_NO_TURNSTILE !== "1") {
      console.error("[turnstile] TURNSTILE_SECRET_KEY is not set; rejecting verification in production");
      return { success: false, message: "Verification is temporarily unavailable. Please try again later." };
    }
    return { success: true, demo: true };
  }
  if (!token) return { success: false, message: "Verification token missing." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: controller.signal
    });

    if (!response.ok) {
      return { success: false, message: "Verification service unavailable. Please retry." };
    }

    const data = await response.json();
    if (!data.success) return { success: false, message: "Human verification failed." };

    return { success: true };
  } catch {
    return { success: false, message: "Verification request timed out. Please retry." };
  } finally {
    clearTimeout(timeout);
  }
}
