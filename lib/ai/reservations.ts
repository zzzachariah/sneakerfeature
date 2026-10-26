import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export async function recoverAiRequests(userId: string) {
  const db = createAdminClient();
  if (!db) throw new Error("Database unavailable");
  const {error} = await db.rpc("recover_ai_requests", {p_user_id:userId});
  if (error) throw new Error("Pending AI requests could not be recovered");
}

export async function reserveAiRequest(request: Request, userId: string, scope: "chat" | "advisor" | "scan", billing: "credits" | "allowance" | "unlimited", amount: number) {
  const db = createAdminClient();
  const supplied = request.headers.get("Idempotency-Key");
  if (supplied && !z.guid().safeParse(supplied).success) return { error: NextResponse.json({ok:false,message:"Invalid request identifier."},{status:400}) };
  const id = supplied ?? randomUUID();
  const result = db ? await db.rpc("reserve_ai_request", {p_id:id,p_user_id:userId,p_scope:scope,p_billing:billing,p_amount:billing === "unlimited" ? 0 : amount}) : null;
  if (!result || result.error) {
    const message = result?.error?.message ?? "unavailable";
    const busy = /request_in_progress|rate_limited/.test(message);
    const duplicate = message.includes("duplicate_request");
    const insufficient = message.includes("insufficient_");
    const status = busy ? 429 : duplicate ? 409 : insufficient ? 402 : 503;
    console.warn("[ai/reservation] unavailable", {scope, code:result?.error?.code, status});
    return { error: NextResponse.json({ok:false,message: busy ? "已有请求处理中或请求过多，请稍后再试。 / Please wait before trying again." : duplicate ? "此请求已提交，请查看会话记录。 / Request already submitted; check the conversation." : insufficient ? "可用余额不足。 / Insufficient available balance." : "AI 暂时不可用，请稍后重试。 / AI is temporarily unavailable."}, {status,headers:busy ? {"Retry-After":scope === "scan" ? "3600" : "60"} : {}}) };
  }
  let finalized = false;
  return {
    id,
    async complete(chatId: string, content: string, charge: number, recommendations: unknown = null, followUp: string | null = null) {
      const args = {p_id:id,p_user_id:userId,p_chat_id:chatId,p_content:content,p_recommendations:recommendations,p_follow_up:followUp,p_charge:billing === "unlimited" ? 0 : charge};
      // Safe retry after an uncertain transport result: the DB receipt is keyed
      // by reservation ID and the transaction stores both the charge and reply.
      let response = await db!.rpc("complete_ai_request", args);
      if (response.error) response = await db!.rpc("complete_ai_request", args);
      if (response.error || !response.data) throw new Error("AI reply could not be saved");
      finalized = true;
      return response.data as {id:string;created_at:string;credits_charged:number;balance:number};
    },
    async finish(charge: number) {
      const {data,error} = await db!.rpc("finish_ai_request", {p_id:id,p_user_id:userId,p_charge:billing === "unlimited" ? 0 : charge});
      if (error) throw new Error("AI request could not be finalized");
      finalized = true;
      return Number(data ?? 0);
    },
    async refund() {
      if (finalized) return;
      const {error} = await db!.rpc("finish_ai_request", {p_id:id,p_user_id:userId,p_charge:0});
      if (error) console.error("[ai/reservation] refund pending recovery", {id,code:error.code});
      else finalized = true;
    }
  };
}
