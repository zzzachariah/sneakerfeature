import crypto from "crypto";

// Self-hosted "are you human" verification. The slide-to-verify widget
// (components/ui/human-check.tsx) posts behavioural signals to /api/verify; on
// success the server hands back a short-lived HMAC-signed token that the real
// form submission carries. The protected API route then re-verifies the token
// here. No third-party service, no database row — the token is self-contained.

const TOKEN_TTL_MS = 5 * 60 * 1000; // tokens are good for 5 minutes

export const VERIFY_ACTIONS = [
  "login",
  "register",
  "forgot-password",
  "admin-login",
  "submission",
  "comment"
] as const;

export type VerifyAction = (typeof VERIFY_ACTIONS)[number];

// The signing secret never leaves the server. Prefer a dedicated secret, fall
// back to the Supabase service-role key (always present in production) so the
// flow works with zero extra configuration. The hard-coded default only kicks
// in for an unconfigured local dev box, where forgeable tokens are harmless.
function getSecret(): string {
  const secret =
    process.env.HUMAN_VERIFY_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    console.warn("[human-verify] No HUMAN_VERIFY_SECRET / SUPABASE_SERVICE_ROLE_KEY set; using insecure dev secret.");
  }
  return "sneakerfeature-dev-human-verify-secret";
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

// Mint a verification token bound to a specific action and a short expiry.
export function issueHumanToken(action: VerifyAction): string {
  const payload = Buffer.from(
    JSON.stringify({ a: action, exp: Date.now() + TOKEN_TTL_MS }),
    "utf8"
  ).toString("base64url");
  return `${payload}.${sign(payload, getSecret())}`;
}

type VerifyResult = { success: boolean; message?: string };

// Re-verify a token produced by issueHumanToken: signature, expiry, and (when
// provided) that it was issued for the action being performed.
export function verifyHumanToken(token?: string, expectedAction?: VerifyAction): VerifyResult {
  if (!token) return { success: false, message: "Please complete human verification." };

  const parts = token.split(".");
  if (parts.length !== 2) return { success: false, message: "Human verification failed." };
  const [payload, signature] = parts;

  const expected = sign(payload, getSecret());
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    return { success: false, message: "Human verification failed." };
  }

  let decoded: { a?: string; exp?: number };
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { success: false, message: "Human verification failed." };
  }

  if (typeof decoded.exp !== "number" || Date.now() > decoded.exp) {
    return { success: false, message: "Verification expired. Please verify again." };
  }
  if (expectedAction && decoded.a !== expectedAction) {
    return { success: false, message: "Human verification failed." };
  }

  return { success: true };
}
