import "server-only";
import { localizePickerShoes } from "./server-picker-language";
import OpenAI from "openai";
import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getPublicShoes } from "@/lib/data/shoes";
import { createPackyClientForModel, HAIKU_MODEL, PACKY_MODEL, resolvedKeyEnvName } from "@/lib/ai/packy-client";
import { recommendOnboardingShoes, matchShoeByName } from "@/lib/ai/recommend";
import { demoCandidateShoes } from "@/lib/ai/demo-evidence";
import { startDeadline } from "@/lib/ai/budget";
import { OnboardingError, requireOnboardingAdmin } from "./server";
import { demoPrompt, safeReferences, type DemoInput, type DemoSnapshot, type DemoEvent, type DemoShoe } from "./picker-demo-contract";
import type { RecommendProgress } from "@/lib/ai/types";

const COOKIE = "sf-picker-demo-v1";
type Stored = {status: DemoSnapshot["status"]; startedAt: string; retryable: boolean; error?: string; payload: Partial<DemoSnapshot>};
export async function demoVisitor(request: Request) {
  requireOnboardingAdmin();
  const jar = await cookies();
  let token = jar.get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = randomBytes(32).toString("hex");
    jar.set(COOKIE, token, {httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400});
  }
  const hash = (value: string) => createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`picker-demo-v1:${value}`).digest("hex");
  const ip = (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0,128);
  return {visitor: hash(token), network: hash(`network:${ip}`)};
}
function snapshot(row: Stored | null): DemoSnapshot {
  if (!row) return {status: "idle", events: []};
  return { ...row.payload, status: row.status, startedAt: row.startedAt, retryable: row.status === "failed" && row.retryable, error: row.error || row.payload.error, events: row.payload.events || [] };
}
export async function readDemo(visitor: string) {
  const {data,error} = await requireOnboardingAdmin().rpc("onboarding_picker_read", {p_visitor: visitor});
  if (error) throw new Error("demo_storage_unavailable");
  return snapshot(data as Stored | null);
}
export async function reserveDemo(visitor: string, network: string, input: DemoInput) {
  const shoes = demoCandidateShoes(await getPublicShoes(),input.shoeIds);
  const selected = input.shoeIds.map(id => shoes.find(shoe => shoe.id === id));
  if (selected.some(shoe => !shoe)) throw new OnboardingError("invalid_shoes", "Choose two available shoes from the wall.", 400);
  const model = resolvedKeyEnvName(HAIKU_MODEL)?.includes("HAIKU") ? HAIKU_MODEL : PACKY_MODEL;
  const client = createPackyClientForModel(model);
  if (!client) throw new OnboardingError("unavailable", "The AI demo is temporarily unavailable.", 503, true);
  const prompt = demoPrompt(input, selected.map(shoe => shoe!.shoe_name));
  const payload: Partial<DemoSnapshot> = {input, prompt, interests: selected.map(s=>({id:s!.id,slug:s!.slug,name:s!.shoe_name,image:s!.image_url??null})), events: [{id: 0, at: new Date().toISOString(), stage: "catalog", kind: "status", catalogCount: shoes.length}]};
  const {data,error} = await requireOnboardingAdmin().rpc("onboarding_picker_reserve", {p_visitor:visitor,p_network:network,p_payload:payload});
  if (error) {
    if (/demo_(rate_limited|cooldown)/.test(error.message)) throw new OnboardingError("demo_busy", "The demo is busy. You can continue and try later.",429,true);
    throw new Error("demo_storage_unavailable");
  }
  const reservation = data as {claimed: boolean; runId?: string; snapshot: Stored};
  return {snapshot: snapshot(reservation.snapshot), run: reservation.claimed && reservation.runId ? async () => {
    const admin = requireOnboardingAdmin();
    const deadline = startDeadline(120_000);
    let current = { ...payload, events: [...payload.events!] };
    let chain = Promise.resolve();
    const persist = (status: "running" | "complete" | "failed") => {
      const value = JSON.parse(JSON.stringify(current));
      chain = chain.catch(() => {}).then(async () => {
        const result = await admin.rpc("onboarding_picker_write", {p_visitor:visitor,p_run:reservation.runId!,p_status:status,p_payload:value});
        if (result.error || result.data !== true) throw new Error("demo_write_failed");
      });
      return chain;
    };
    const progress = (event: RecommendProgress) => {
      // Raw model text can contain hidden reasoning. Only observable operations
      // and actual tool outputs cross this boundary or enter persistence.
      if (event.type === "text" || current.events.length >= 60) return;
      const stage = event.type === "search" ? "research" : event.phase === "searching" ? "research" : ["writing","generating","finalizing"].includes(event.phase) ? "writing" : "shortlist";
      const safe: DemoEvent = {id:current.events.length,at:new Date().toISOString(),stage,kind:event.type === "search" ? "search" : event.candidates ? "candidates" : "status"};
      if (event.type === "search") Object.assign(safe,{query:event.query.slice(0,240),state:event.state,resultCount:event.resultCount,cached:event.cached,sources:safeReferences(event.sources)});
      else if (event.candidates) safe.candidates=event.candidates.slice(0,8);
      current = {...current,events:[...current.events,safe]};
      void persist("running").catch(() => {});
    };
    try {
      const result = await recommendOnboardingShoes(client,{shoes,history:[],currentInput:prompt,replyLanguage:input.lang,count:2,model,deadline},progress);
      const allowed = new Set(current.events.flatMap(e => e.sources ?? []).map(s => s.url));
      const used = new Set<string>();
      const recommendations: DemoShoe[] = (result?.recommendations ?? []).flatMap(rec => {
        const shoe = matchShoeByName(rec.name, shoes);
        if (!shoe || used.has(shoe.id) || !rec.reason.trim() || !rec.pros.length || !rec.cons.length) return [];
        used.add(shoe.id);
        return [{id:shoe.id,slug:shoe.slug,name:shoe.shoe_name,brand:shoe.brand,image:shoe.image_url ?? null,reason:rec.reason.slice(0,2400),pros:rec.pros.slice(0,3),cons:rec.cons.slice(0,3),references:safeReferences(rec.references).filter(ref => allowed.has(ref.url))}];
      }).slice(0,2);
      if (recommendations.length !== 2) throw new Error("incomplete");
      current = {...current,shoes:await localizePickerShoes(recommendations,input.lang),finishedAt:new Date().toISOString()};
      await persist("complete");
    } catch (cause) {
      const code = Date.now()>=deadline.at-2000 || (cause instanceof Error && /timeout|timed out/i.test(cause.message)) ? "timeout" : cause instanceof OpenAI.APIError ? cause.status===429?"provider_busy":"provider_unavailable" : cause instanceof Error && cause.message==="incomplete" ? "incomplete" : "unavailable";
      current = {...current,error:code,finishedAt:new Date().toISOString()};
      await persist("failed").catch(() => {console.error("[onboarding/demo] Could not persist completion");});
    }
  } : null};
}
