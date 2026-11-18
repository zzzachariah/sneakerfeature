import "server-only";
import { localizePickerShoes } from "./server-picker-language";
import { recoverPickerRun, pickerFailureDiagnostic, PickerResultError } from "./picker-recovery";
import OpenAI from "openai";
import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getFreshPublicShoes, getPublicShoes } from "@/lib/data/shoes";
import { createPackyClientForModel, HAIKU_MODEL, PACKY_MODEL, resolvedKeyEnvName } from "@/lib/ai/packy-client";
import { recommendOnboardingShoes, matchShoeByName } from "@/lib/ai/recommend";
import { startDeadline } from "@/lib/ai/budget";
import { OnboardingError, requireOnboardingAdmin } from "./server";
import { demoPrompt, safeReferences, type DemoInput, type DemoSnapshot, type DemoEvent, type DemoShoe } from "./picker-demo-contract";
import { generatePickerQuestions } from "./server-picker-questions";
import { pickerQuestionSetSchema, validatePickerAnswers, pickerAnswersContext, pickerResearchFocus, pickerPriceResearchFocus, type PickerAnswers } from "./picker-questions";
import type { RecommendProgress } from "@/lib/ai/types";

const COOKIE = "sf-picker-demo-v1";
type Stored = {runId?: string; status: DemoSnapshot["status"]; startedAt: string; retryable: boolean; error?: string; payload: Partial<DemoSnapshot>};
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
  return { ...row.payload, runId: row.runId, status: row.status, startedAt: row.startedAt, retryable: row.status === "failed" && row.retryable, error: row.error || row.payload.error, events: row.payload.events || [] };
}
export async function readDemo(visitor: string) {
  const {data,error} = await requireOnboardingAdmin().rpc("onboarding_picker_read", {p_visitor: visitor});
  if (error) throw new Error("demo_storage_unavailable");
  return snapshot(data as Stored | null);
}
function pickerModel() {
  const model = resolvedKeyEnvName(HAIKU_MODEL)?.includes("HAIKU") ? HAIKU_MODEL : PACKY_MODEL;
  const client = createPackyClientForModel(model);
  if (!client) throw new OnboardingError("unavailable", "The AI demo is temporarily unavailable.", 503, true);
  return {model,client};
}
function admissionError(message: string): never {
  if (/demo_(rate_limited|cooldown)/.test(message)) throw new OnboardingError("demo_busy", "The demo is busy. Please try again shortly.", 429, true);
  if (message.includes("demo_stale")) throw new OnboardingError("stale_questions", "These questions have changed. Reload the current questions.", 409, true);
  throw new Error("demo_storage_unavailable");
}
export async function reserveDemo(visitor: string, network: string, input: DemoInput) {
  const existing = await readDemo(visitor);
  if (["running","awaiting_answers","complete"].includes(existing.status)) return {snapshot:existing,run:null};
  if (existing.phase === "recommendations" && existing.input && existing.questions && existing.answers) {
    // A retry after research/generation failure reuses the one completed answer
    // round. Never ask the visitor to repeat clarification or erase corrections.
    const questions = pickerQuestionSetSchema.parse(existing.questions);
    const answers = validatePickerAnswers(questions,existing.answers);
    const {model,client} = pickerModel();
    const payload: Partial<DemoSnapshot> = {input:existing.input,phase:"recommendations",questions,answers,interests:existing.interests,events:[]};
    const {data,error} = await requireOnboardingAdmin().rpc("onboarding_picker_reserve", {p_visitor:visitor,p_network:network,p_payload:payload});
    if (error) admissionError(error.message);
    const reservation = data as {claimed:boolean;runId?:string;snapshot:Stored};
    return {snapshot:snapshot(reservation.snapshot),run:reservation.claimed && reservation.runId
      ? recommendationRun(visitor,reservation.runId,reservation.snapshot.payload,existing.input,questions,answers,client,model) : null};
  }
  const shoes = await getPublicShoes();
  const selected = input.shoeIds.map(id => shoes.find(shoe => shoe.id === id));
  if (selected.some(shoe => !shoe)) throw new OnboardingError("invalid_shoes", "Choose two available shoes from the wall.", 400);
  const {model,client} = pickerModel();
  const names = selected.map(shoe => shoe!.shoe_name);
  const payload: Partial<DemoSnapshot> = {input, phase:"questions", interests:selected.map(shoe=>({id:shoe!.id,slug:shoe!.slug,name:shoe!.shoe_name,image:shoe!.image_url??null})), events:[]};
  const admin = requireOnboardingAdmin();
  const {data,error} = await admin.rpc("onboarding_picker_reserve", {p_visitor:visitor,p_network:network,p_payload:payload});
  if (error) admissionError(error.message);
  const reservation = data as {claimed:boolean;runId?:string;snapshot:Stored};
  return {snapshot:snapshot(reservation.snapshot),run:reservation.claimed && reservation.runId ? async () => {
    try {
      const questions = await generatePickerQuestions(client,model,input,names);
      const result = await admin.rpc("onboarding_picker_write", {p_visitor:visitor,p_run:reservation.runId!,p_status:"awaiting_answers",p_payload:{...payload,questions}});
      if (result.error || result.data!==true) throw new Error("demo_write_failed");
    } catch (cause) {
      console.error("[onboarding/demo] Questions did not complete", pickerFailureDiagnostic(cause));
      await admin.rpc("onboarding_picker_write", {p_visitor:visitor,p_run:reservation.runId!,p_status:"failed",p_payload:{...payload,error:"unavailable",finishedAt:new Date().toISOString()}});
    }
  } : null};
}
export async function answerDemo(visitor: string, network: string, runId: string, rawAnswers: unknown) {
  const existing = await readDemo(visitor);
  if (existing.runId !== runId) throw new OnboardingError("stale_questions", "These questions have changed. Reload the current questions.",409,true);
  if (existing.status!=="awaiting_answers") return {snapshot:existing,run:null};
  const questions = pickerQuestionSetSchema.parse(existing.questions);
  if (!existing.input) throw new Error("demo_input_missing");
  let answers: PickerAnswers;
  try { answers = validatePickerAnswers(questions,rawAnswers); }
  catch { throw new OnboardingError("invalid_answers", "Answer each question and include any correction or budget in the notes.",400); }
  const {model,client} = pickerModel();
  const {data,error} = await requireOnboardingAdmin().rpc("onboarding_picker_resume", {p_visitor:visitor,p_run:runId,p_network:network,p_answers:answers});
  if (error) admissionError(error.message);
  const reservation = data as {claimed:boolean;runId?:string;snapshot:Stored};
  return {snapshot:snapshot(reservation.snapshot),run:reservation.claimed && reservation.runId
    ? recommendationRun(visitor,reservation.runId,reservation.snapshot.payload,existing.input,questions,answers,client,model) : null};
}
function recommendationRun(visitor:string,runId:string,payload:Partial<DemoSnapshot>,input:DemoInput,questions:ReturnType<typeof pickerQuestionSetSchema.parse>,answers:PickerAnswers,client:OpenAI,model:string) {
  return async () => {
    const admin = requireOnboardingAdmin();
    const deadline = startDeadline(120_000);
    let current: Partial<DemoSnapshot> & {events: DemoEvent[]} = { ...payload, phase: "recommendations", events: [] };
    let chain = Promise.resolve();
    const persist = (status: "running" | "complete" | "failed") => {
      const value = JSON.parse(JSON.stringify(current));
      chain = chain.catch(() => {}).then(async () => {
        const result = await admin.rpc("onboarding_picker_write", {p_visitor:visitor,p_run:runId,p_status:status,p_payload:value});
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
      // Questions and the user's one answer round precede this database read.
      // The count records exactly the current full catalog given to the model.
      const shoes = await getFreshPublicShoes();
      const prompt = demoPrompt(input, (payload.interests ?? []).map(shoe => shoe.name)) + pickerAnswersContext(questions, answers, input.lang);
      current = {...current, prompt, events: [{id:0, at:new Date().toISOString(), stage:"catalog", kind:"status", catalogCount:shoes.length, catalogScope:"full"}]};
      await persist("running");
      const backupModel = model === HAIKU_MODEL ? PACKY_MODEL : HAIKU_MODEL;
      const backupClient = backupModel === HAIKU_MODEL && !resolvedKeyEnvName(HAIKU_MODEL)?.includes("HAIKU") ? null : createPackyClientForModel(backupModel);
      const recommend = async (target: OpenAI, targetModel: string) => {
        const result = await recommendOnboardingShoes(target,{shoes,history:[],currentInput:prompt,replyLanguage:input.lang,count:2,model:targetModel,deadline,researchFocus:pickerResearchFocus(answers),priceResearchFocus:pickerPriceResearchFocus(answers)},progress);
        const allowed = new Set(current.events.flatMap(e => e.sources ?? []).map(s => s.url));
        const used = new Set<string>();
        const recommendations: DemoShoe[] = (result?.recommendations ?? []).flatMap(rec => {
          const shoe = matchShoeByName(rec.name, shoes);
          if (!shoe || used.has(shoe.id) || !rec.reason.trim() || !rec.pros.length || !rec.cons.length) return [];
          used.add(shoe.id);
          return [{id:shoe.id,slug:shoe.slug,name:shoe.shoe_name,brand:shoe.brand,image:shoe.image_url ?? null,reason:rec.reason.slice(0,2400),pros:rec.pros.slice(0,3),cons:rec.cons.slice(0,3),references:safeReferences(rec.references).filter(ref => allowed.has(ref.url))}];
        }).slice(0,2);
        if (recommendations.length !== 2) throw new PickerResultError();
        return recommendations;
      };
      const recommendations = await recoverPickerRun({
        primary: () => recommend(client,model), backup: backupClient ? () => recommend(backupClient,backupModel) : null, deadline,
        onFailure: (error,backup) => console.warn("[onboarding/demo] Model attempt failed", {model:backup?backupModel:model,stage:current.events.at(-1)?.stage,...pickerFailureDiagnostic(error)}),
        onRecovery: async () => {
          current = {...current,events:[...current.events,{id:current.events.length,at:new Date().toISOString(),stage:current.events.at(-1)?.stage??"catalog",kind:"recovery"}]};
          await persist("running");
        },
      });
      current = {...current,shoes:await localizePickerShoes(recommendations,input.lang),finishedAt:new Date().toISOString()};
      await persist("complete");
    } catch (cause) {
      console.error("[onboarding/demo] Run did not complete", {stage:current.events.at(-1)?.stage,...pickerFailureDiagnostic(cause)});
      const code = Date.now()>=deadline.at-2000 || (cause instanceof Error && /timeout|timed out/i.test(cause.message)) ? "timeout" : cause instanceof OpenAI.APIError ? cause.status===429?"provider_busy":"provider_unavailable" : cause instanceof Error && cause.message==="incomplete" ? "incomplete" : "unavailable";
      current = {...current,error:code,finishedAt:new Date().toISOString()};
      await persist("failed").catch(() => {console.error("[onboarding/demo] Could not persist completion");});
    }
  };
}
