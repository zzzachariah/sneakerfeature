import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { displayBrand } from "@/lib/data/catalog-quality";
import { isAuthCookieName } from "@/lib/auth-cookie";
import {
  isSameOriginMutation, safeCount, safePositiveInteger, VERIFIED_VERCEL_SNAPSHOT,
  type OnboardingMember, type OnboardingPageviews, type OnboardingPatch
} from "./server-contract";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0", "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff"
};
type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type Context = { admin: AdminClient; user: User | null };

export class OnboardingError extends Error {
  constructor(public code: string, message: string, public status: number, public retryable = false) {
    super(message);
  }
}

export function onboardingJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: PRIVATE_HEADERS });
}

export function onboardingError(error: unknown) {
  if (error instanceof OnboardingError) {
    const response = onboardingJson({ ok: false, code: error.code, message: error.message, retryable: error.retryable }, error.status);
    if (error.status === 429) response.headers.set("Retry-After", "60");
    return response;
  }
  // Do not return or log raw SQL, auth details, email addresses or tokens.
  console.error("[onboarding] request failed");
  return onboardingJson({ ok: false, code: "unavailable", message: "Onboarding is temporarily unavailable. Please try again.", retryable: true }, 503);
}

function rpcError(error: { message?: string; code?: string } | null): never {
  const message = error?.message ?? "";
  if (message.includes("onboarding_profile_recovery_required")) throw new OnboardingError("profile_recovery_required", "Your account exists. Choose a username to finish setting up its profile.", 409);
  if (message.includes("onboarding_persona_required")) throw new OnboardingError("persona_required", "Save a valid player profile before continuing.", 409);
  if (message.includes("onboarding_stage_conflict")) throw new OnboardingError("stage_conflict", "Continue from the welcome step before completing your player profile.", 409);
  if (message.includes("onboarding_user_not_found")) throw new OnboardingError("authentication_required", "Please sign in again to continue.", 401);
  if (message.includes("onboarding_rate_limited")) throw new OnboardingError("rate_limited", "Please wait a moment before trying again.", 429, true);
  if (message.includes("onboarding_invalid")) throw new OnboardingError("invalid_request", "This onboarding request is not valid.", 400);
  throw new OnboardingError("unavailable", "Onboarding is temporarily unavailable. Please try again.", 503, true);
}

export function requireSameOrigin(request: Request) {
  if (!isSameOriginMutation(request)) throw new OnboardingError("origin_not_allowed", "This request must come from this website.", 403);
}

export async function readSmallJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new OnboardingError("invalid_request", "Send this request as JSON.", 415);
  }
  if (Number(request.headers.get("content-length")) > 2048) throw new OnboardingError("invalid_request", "The request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new OnboardingError("invalid_request", "The request body is missing.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) {
      await reader.cancel();
      throw new OnboardingError("invalid_request", "The request is too large.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(bytes);
  try { return JSON.parse(text); } catch { throw new OnboardingError("invalid_request", "The request is not valid JSON.", 400); }
}

export function requireOnboardingAdmin(): AdminClient {
  const admin = createAdminClient();
  if (!admin) throw new OnboardingError("not_configured", "Account services are not configured. Please try again later.", 503, true);
  return admin;
}

export async function onboardingContext(requireUser = false): Promise<Context> {
  const admin = requireOnboardingAdmin();
  const cookieStore = await cookies();
  const hasCookie = cookieStore.getAll().some((cookie) => isAuthCookieName(cookie.name));
  if (!hasCookie) {
    if (requireUser) throw new OnboardingError("authentication_required", "Please sign in to continue.", 401);
    return { admin, user: null };
  }
  const client = await createClient();
  if (!client) throw new OnboardingError("not_configured", "Account services are not configured. Please try again later.", 503, true);
  // The cookie is only an optimization hint. Auth must verify its identity.
  const { data, error } = await client.auth.getUser();
  if (error) {
    if (!error.status || error.status >= 500) throw new OnboardingError("auth_unavailable", "Account status could not be loaded. Please retry.", 503, true);
    throw new OnboardingError("authentication_required", "Your session has expired. Please sign in again.", 401);
  }
  if (!data.user) throw new OnboardingError("authentication_required", "Please sign in again to continue.", 401);
  return { admin, user: data.user };
}

let vercelCache: { value: OnboardingPageviews; expires: number } | null = null;
let vercelRequest: Promise<OnboardingPageviews> | null = null;

async function getHistoricalPageviews(): Promise<OnboardingPageviews> {
  if (vercelCache && vercelCache.expires > Date.now()) return vercelCache.value;
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  if (!token) return VERIFIED_VERCEL_SNAPSHOT;
  if (vercelRequest) return vercelRequest;
  vercelRequest = (async () => {
    const until = new Date().toISOString();
    const url = new URL("https://api.vercel.com/v1/query/web-analytics/visits/count");
    url.searchParams.set("projectId", "prj_fKFAsXiLsf2avMpOqjKjC0ili15S");
    url.searchParams.set("teamId", "team_YXU6Q9GVndYBNQnFRo221v5l");
    url.searchParams.set("since", VERIFIED_VERCEL_SNAPSHOT.since!);
    url.searchParams.set("until", until);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(1800)
      });
      if (!response.ok) throw new Error("analytics unavailable");
      const body = await response.json() as { data?: { pageviews?: unknown }; query?: { since?: string; until?: string } };
      const total = safeCount(body.data?.pageviews);
      if (total === null) throw new Error("invalid analytics response");
      const value: OnboardingPageviews = { total, source: "vercel", since: body.query?.since ?? VERIFIED_VERCEL_SNAPSHOT.since, asOf: body.query?.until ?? until, snapshot: false };
      vercelCache = { value, expires: Date.now() + 300_000 };
      return value;
    } catch {
      const value = vercelCache ? { ...vercelCache.value, snapshot: true } : VERIFIED_VERCEL_SNAPSHOT;
      vercelCache = { value, expires: Date.now() + 60_000 };
      return value;
    } finally {
      vercelRequest = null;
    }
  })();
  return vercelRequest;
}

function validMember(raw: unknown): OnboardingMember {
  const value = raw as OnboardingMember | null;
  if (!value || typeof value.userId !== "string" || safePositiveInteger(value.memberNumber) === null ||
    !["welcome", "profile", "complete"].includes(value.stage) || !value.tours) {
    throw new OnboardingError("unavailable", "Your onboarding status could not be loaded. Please retry.", 503, true);
  }
  return { ...value, memberNumber: Number(value.memberNumber) };
}

async function statusResponse(context: Context, member: OnboardingMember | null) {
  const [metrics, pageviews] = await Promise.all([
    getLiveOnboardingMetrics(context.admin).catch(() => null), getHistoricalPageviews()
  ]);
  // Failure to read the activation boundary must never misclassify a member.
  // Member status is already server-confirmed; a counts-only error is optional.
  return {
    ok: true,
    ...(member ?? { userId: null, username: null, memberNumber: null, requiresOnboarding: true, stage: null, tours: { site: null, ai: null } }),
    registeredUsers: metrics?.registeredUsers ?? null,
    catalogCount: metrics?.catalogCount ?? null,
    brandCount: metrics?.brandCount ?? null,
    livePageviews: metrics?.livePageviews ?? null,
    countsAsOf: metrics?.countsAsOf ?? null,
    pageviews,
    pageviewStartedAt: metrics?.pageviewStartedAt ?? null
  };
}

/** Read-only aggregates, safe to poll without changing onboarding/account state. */
export async function getLiveOnboardingMetrics(admin: AdminClient = requireOnboardingAdmin()) {
  const publicClient = createPublicClient((input, init) => fetch(input, { ...init, cache: "no-store" }));
  if (!publicClient) throw new OnboardingError("not_configured", "Catalogue services are not configured.", 503, true);
  const [privateResult, catalogResult] = await Promise.all([
    admin.rpc("onboarding_get_summary").abortSignal(AbortSignal.timeout(6500)),
    publicClient.rpc("onboarding_catalog_counts").abortSignal(AbortSignal.timeout(6500))
  ]);
  if (privateResult.error) rpcError(privateResult.error);
  if (catalogResult.error) rpcError(catalogResult.error);
  const summary = privateResult.data as { registeredUsers?: unknown; livePageviews?: unknown; pageviewStartedAt?: string; countsAsOf?: string } | null;
  const catalog = catalogResult.data as { catalogCount?: unknown; brands?: unknown; countsAsOf?: string } | null;
  const registeredUsers = safeCount(summary?.registeredUsers);
  const livePageviews = safeCount(summary?.livePageviews);
  const catalogCount = safeCount(catalog?.catalogCount);
  const brands = catalog?.brands;
  if (registeredUsers === null || livePageviews === null || catalogCount === null ||
      !Array.isArray(brands) || brands.some((brand) => typeof brand !== "string") ||
      brands.length !== catalogCount || !summary?.pageviewStartedAt || !summary?.countsAsOf || !catalog?.countsAsOf) {
    throw new OnboardingError("unavailable", "Live statistics are temporarily unavailable. Please retry.", 503, true);
  }
  return {
    ok: true, registeredUsers, catalogCount,
    brandCount: new Set((brands as string[]).map(displayBrand)).size,
    livePageviews, pageviewStartedAt: summary.pageviewStartedAt,
    countsAsOf: new Date().toISOString(),
    // Each aggregate is fresh. These source times also preserve the boundary
    // between the public RLS snapshot and the private Auth/counter snapshot.
    catalogAsOf: catalog.countsAsOf, accountsAsOf: summary.countsAsOf
  };
}

export async function getOnboardingStatus(context: Context) {
  let member: OnboardingMember | null = null;
  if (context.user) {
    const result = await context.admin.rpc("onboarding_get_status", { p_user_id: context.user.id });
    if (result.error) rpcError(result.error);
    member = validMember(result.data);
  }
  return statusResponse(context, member);
}

export async function patchOnboardingStatus(context: Context, patch: OnboardingPatch) {
  if (!context.user) throw new OnboardingError("authentication_required", "Please sign in to continue.", 401);
  const result = await context.admin.rpc("onboarding_update_status", {
    p_user_id: context.user.id, p_stage: patch.stage ?? null, p_tour: patch.tour ?? null, p_status: patch.status ?? null
  });
  if (result.error) rpcError(result.error);
  return statusResponse(context, validMember(result.data));
}

export async function recoverOnboardingProfile(context: Context, username: string) {
  if (!context.user) throw new OnboardingError("authentication_required", "Please sign in to continue.", 401);
  const result = await context.admin.rpc("onboarding_recover_profile", { p_user_id: context.user.id, p_username: username });
  if (result.error) rpcError(result.error);
  return statusResponse(context, validMember(result.data));
}

export async function recordOnboardingPageview(request: Request, eventId: string) {
  const admin = requireOnboardingAdmin();
  // Vercel supplies this header; the value is HMACed before being sent to the
  // database and is retained there only in a short-lived rate-limit bucket.
  const ip = (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown").slice(0,128);
  const rateKey = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(`onboarding-pageview-v1:${ip}`).digest("hex");
  const result = await admin.rpc("onboarding_record_pageview", { p_event_id: eventId, p_rate_key: rateKey });
  if (result.error) rpcError(result.error);
  const data = result.data as { ordinal?: unknown; startedAt?: string } | null;
  const ordinal = safePositiveInteger(data?.ordinal);
  if (ordinal === null || !data?.startedAt) throw new OnboardingError("unavailable", "The visit number is temporarily unavailable.", 503, true);
  return { ok: true, ordinal, startedAt: data.startedAt };
}
