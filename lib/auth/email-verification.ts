import type { SupabaseClient, User } from "@supabase/supabase-js";
import { renderExistingAccountNotice, renderSignupVerification } from "@/lib/email/auth-emails";
import { sendEmail } from "@/lib/email/resend";

// Signup email verification. Accounts are created UNCONFIRMED through
// auth.admin.generateLink, which returns the one-time code and token hash
// without Supabase sending anything; we then mail both a code and a one-tap
// link through Resend. Either one confirms the address (see
// /api/auth/verify-email and /api/auth/confirm).

export type VerifyLinkType = "signup" | "magiclink";
export const VERIFY_LINK_TYPES = new Set<VerifyLinkType>(["signup", "magiclink"]);

export function siteOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "https://snkrfeature.com").trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export function isEmailConfirmed(user: Pick<User, "email_confirmed_at"> | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at);
}

function confirmUrl(tokenHash: string, type: VerifyLinkType, next?: string | null): string {
  const url = new URL(`${siteOrigin()}/api/auth/confirm`);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

async function mailVerification(
  email: string,
  props: { email_otp: string; hashed_token: string },
  type: VerifyLinkType,
  next?: string | null
) {
  const { subject, html } = renderSignupVerification({
    actionUrl: confirmUrl(props.hashed_token, type, next),
    code: props.email_otp
  });
  const sent = await sendEmail({ to: email, subject, html });
  if (!sent.ok) console.error("[email-verification] send failed", sent.status, sent.detail.slice(0, 200));
  return sent.ok;
}

/** Look up an auth user by email via the profiles mirror (admin API has no email filter). */
export async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  const candidates = Array.from(new Set([email.trim(), normalized]));
  const { data: profile } = await admin.from("profiles").select("id").in("email", candidates).limit(1).maybeSingle();
  if (!profile?.id) return null;
  const { data } = await admin.auth.admin.getUserById(profile.id as string);
  return data.user ?? null;
}

export type StartSignupResult =
  | { status: "sent"; userId: string }
  | { status: "existing_verified" }
  | { status: "error"; message: string };

/**
 * Create an unconfirmed account and mail its verification code + link.
 *
 * If the email already belongs to an UNCONFIRMED account, that account is
 * discarded and recreated with the new password. Nobody has proven ownership
 * of an unconfirmed address, so keeping it would let a squatter pre-register a
 * victim's email, wait for the victim to verify, and then sign in with the
 * squatter's password (pre-account takeover).
 */
export async function startSignup(
  admin: SupabaseClient,
  input: { email: string; password: string; username: string; next?: string | null }
): Promise<StartSignupResult> {
  const attempt = () =>
    admin.auth.admin.generateLink({
      type: "signup",
      email: input.email,
      password: input.password,
      options: { data: { username: input.username } }
    });

  let { data, error } = await attempt();

  if (error && /already.*registered|already exists|email_exists/i.test(`${error.message} ${error.code ?? ""}`)) {
    const existing = await findAuthUserByEmail(admin, input.email);
    if (!existing) return { status: "error", message: "lookup_failed" };
    if (isEmailConfirmed(existing)) {
      const origin = siteOrigin();
      const notice = renderExistingAccountNotice({ loginUrl: `${origin}/login`, resetUrl: `${origin}/forgot-password` });
      await sendEmail({ to: input.email, ...notice });
      return { status: "existing_verified" };
    }
    await admin.auth.admin.deleteUser(existing.id);
    ({ data, error } = await attempt());
  }

  if (error || !data?.user || !data.properties) {
    return { status: "error", message: error?.message ?? "generate_link_failed" };
  }

  await mailVerification(input.email, data.properties, "signup", input.next);
  return { status: "sent", userId: data.user.id };
}

/** Re-send a code + link to an existing, still-unconfirmed account. Silent no-op otherwise. */
export async function resendVerification(admin: SupabaseClient, email: string, next?: string | null): Promise<void> {
  const user = await findAuthUserByEmail(admin, email);
  if (!user || isEmailConfirmed(user)) return;
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties) {
    console.error("[email-verification] resend generateLink failed", error?.message);
    return;
  }
  await mailVerification(email, data.properties, "magiclink", next);
}
