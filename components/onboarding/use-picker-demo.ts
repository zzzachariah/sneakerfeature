"use client";
import { useLocale } from "@/components/i18n/locale-provider";
import { useEffect, useState } from "react";
import type { DemoInput, DemoSnapshot } from "@/lib/onboarding/picker-demo-contract";
export const PICKER_PENDING = "sf-intro-picker-pending-v1";
let state: DemoSnapshot = {status:"idle",events:[]};
let translationFailed=false;
let activeLanguage = "en", stateLanguage = "";
let connection: "loading" | "ready" | "offline" = "loading";
let posting = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(fn => fn()); }
async function refresh() {
  if (request) return request;
  const language = activeLanguage;
  translationFailed=false; if(stateLanguage!==language)connection="loading"; emit();
  request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(`/api/onboarding/picker-demo?lang=${language}`,{cache:"no-store",signal:controller.signal});
      const data = await response.json();
      if (language===activeLanguage&&data.code==="language_unavailable")translationFailed=true;
      if (!response.ok || !Array.isArray(data.events)) throw new Error("unavailable");
      if (language === activeLanguage) {state = data; stateLanguage = language; connection="ready";}
    } catch { if(language===activeLanguage)connection="offline"; }
    finally { clearTimeout(timeout); request=null; emit(); if (language !== activeLanguage) void refresh(); else schedule(); }
  })();
  return request;
}
function schedule() {
  if (timer) clearTimeout(timer);
  if (!translationFailed && listeners.size && (state.status==="running" || connection==="offline")) timer=setTimeout(() => {
    if (document.hidden) schedule(); else void refresh();
  },connection==="offline"?5000:1400);
}
export function usePickerDemo(enabled=true) {
  const {locale} = useLocale();
  const [,render] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    activeLanguage=locale;
    const update=()=>render(v=>v+1);
    const focus=()=>{if(!document.hidden)void refresh();};
    listeners.add(update); void refresh();
    document.addEventListener("visibilitychange",focus); window.addEventListener("online",focus);
    return()=>{listeners.delete(update);document.removeEventListener("visibilitychange",focus);window.removeEventListener("online",focus);if(!listeners.size&&timer)clearTimeout(timer);};
  },[enabled,locale]);
  async function run(input: DemoInput) {
    if (posting || state.status==="running" || state.status==="complete") return;
    posting=true; emit();
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
    try {
      // Establish the opaque visitor cookie before admission; a lost POST
      // response is recovered by GET, never blindly retried or charged twice.
      await refresh();
      if(connection!=="ready")throw new Error("network");
      const response=await fetch("/api/onboarding/picker-demo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:controller.signal});
      const data=await response.json();
      if(!response.ok)throw new Error(data.code||"unavailable");
      if(data.status==="complete"){await refresh();}else{state=data; stateLanguage=input.lang; connection="ready";}
      try { localStorage.setItem(PICKER_PENDING,"1"); } catch {}
      window.dispatchEvent(new Event("sf:picker-demo-started"));
    } catch(error) {
      await refresh();
      if(state.status==="idle")state={status:"failed",events:[],retryable:true,error:error instanceof Error?error.message:"network"};
    } finally {clearTimeout(timeout);posting=false;emit();schedule();}
  }
  const matched=stateLanguage===locale;
  return {snapshot:translationFailed?{status:"failed" as const,error:"language_unavailable",events:[]}:matched?state:{status:"idle" as const,events:[]},connection:matched?connection:connection==="offline"?"offline" as const:"loading" as const,posting,run,refresh};
}
