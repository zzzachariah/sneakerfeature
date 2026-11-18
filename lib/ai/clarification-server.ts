import "server-only";
import type OpenAI from "openai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { reserveAiRequest } from "./reservations";
import { clarificationQuestionsSchema, clarificationOptions, clarificationQuestionPrompt, groundedProfilePrompt, groundedClarificationQuestions, type AiClarification, type ClarificationContext, type ClarificationAnswers } from "./clarification";
export type ClarificationRow = {
    id: string;
    chat_id: string;
    user_id: string;
    status: AiClarification["status"];
    original_message: string;
    context: ClarificationContext;
    requested_count: number;
    model: string;
    lang: "zh" | "en";
    questions: unknown;
    answers: ClarificationAnswers | null;
    user_message_id: string;
    assistant_message_id: string;
    answer_message_id: string | null;
    request_id: string;
    expires_at: string;
    created_at: string;
    error: string | null;
};
type Db = NonNullable<ReturnType<typeof createAdminClient>>;
type QuestionFailureCode = "provider" | "empty_response" | "truncated_response" | "invalid_json" | "invalid_questions" | "claim_failed" | "save_failed";
class QuestionFailure extends Error {
    constructor(readonly code: QuestionFailureCode, cause?: unknown, readonly output?: { finishReason?: string | null; toolCalls: number; characters: number }) {
        super(`clarification_${code}`, { cause });
        this.name = "QuestionFailure";
    }
}
/** Log operational metadata only: provider bodies and validation messages can
 * contain private profile/request text, so never send them to server logs. */
export function clarificationFailureDiagnostic(error: unknown) {
    const failure = error instanceof QuestionFailure ? error : null;
    const cause = failure?.cause ?? error;
    const fields = cause && typeof cause === "object" ? cause as Record<string, unknown> : {};
    const safeToken = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_.[\]-]{1,96}$/.test(value) ? value : undefined;
    const issuePaths = cause instanceof z.ZodError ? cause.issues.slice(0, 8).map(issue => ({
        code: issue.code,
        path: issue.path.map(part => typeof part === "number" ? part : ["intro", "questions", "id", "prompt", "reason", "zh", "en"].includes(String(part)) ? part : "field").join(".")
    })) : undefined;
    return {
        failure: failure?.code ?? (cause instanceof z.ZodError ? "invalid_questions" : "unexpected"),
        status: typeof fields.status === "number" ? fields.status : undefined,
        code: safeToken(fields.code),
        type: safeToken(fields.type),
        param: safeToken(fields.param),
        providerRequestId: safeToken(fields.request_id),
        errorName: cause instanceof Error && ["APIError", "APIConnectionError", "APITimeoutError", "APIConnectionTimeoutError", "BadRequestError", "RateLimitError", "InternalServerError", "AuthenticationError", "PermissionDeniedError", "TypeError", "SyntaxError", "ZodError", "Error"].includes(cause.name) ? cause.name : undefined,
        ...(failure?.output ? { output: failure.output } : {}),
        ...(issuePaths ? { issues: issuePaths } : {})
    };
}
export function publicClarification(row: ClarificationRow): AiClarification {
    const q = clarificationQuestionsSchema.safeParse(row.questions);
    return { id: row.id, status: row.status, originalMessage: row.original_message, count: row.requested_count, model: row.model, intro: q.success ? q.data.intro : { zh: "先确认几个细节，再为你选鞋。", en: "A few details before your recommendations." }, questions: q.success ? q.data.questions.map(question => ({ ...question, options: clarificationOptions(question.id) })) : [], ...(row.answers ? { answers: row.answers } : {}), ...(row.error ? { error: row.error } : {}) };
}
export async function readChatClarification(db: Db, chatId: string, userId: string): Promise<ClarificationRow | null> {
    const { data, error } = await db.from("ai_chat_clarifications").select("*").eq("chat_id", chatId).eq("user_id", userId).maybeSingle();
    if (error)
        throw new Error("Clarification storage unavailable");
    if (!data)
        return null;
    let row = data as ClarificationRow;
    if (row.status === "answering" || row.status === "awaiting_answers") {
        const { data: reservation } = await db.from("ai_request_reservations").select("result,status,expires_at").eq("id", row.request_id).eq("user_id", userId).maybeSingle();
        if (reservation?.result) {
            await db.from("ai_chat_clarifications").update({ status: "complete", error: null }).eq("id", row.id).eq("request_id", row.request_id).in("status", ["answering", "awaiting_answers"]);
            row = { ...row, status: "complete" };
        }
        else if (row.status === "answering" && ((reservation && (reservation.status !== "pending" || Date.parse(reservation.expires_at) <= Date.now())) || Date.parse(row.expires_at) <= Date.now())) {
            await db.from("ai_chat_clarifications").update({ status: "awaiting_answers", error: "interrupted" }).eq("id", row.id).eq("request_id", row.request_id).eq("status", "answering");
            row = { ...row, status: "awaiting_answers", error: "interrupted" };
        }
    }
    else if (row.status === "generating" && Date.parse(row.expires_at) <= Date.now()) {
        await db.from("ai_chat_clarifications").update({ status: "failed", error: "interrupted" }).eq("id", row.id).eq("request_id", row.request_id).eq("status", "generating");
        row = { ...row, status: "failed", error: "interrupted" };
    }
    return row;
}
export async function clarificationResponse(db: Db, row: ClarificationRow) {
    const { data, error } = await db.from("ai_messages").select("id,role,content,recommendations,credits_charged,created_at").in("id", [row.user_message_id, row.assistant_message_id]);
    if (error)
        throw new Error("Clarification messages unavailable");
    const userMessage = data?.find(message => message.id === row.user_message_id);
    const assistant = data?.find(message => message.id === row.assistant_message_id);
    if (!userMessage || !assistant)
        throw new Error("Clarification messages unavailable");
    return { ok: true, clarification: true, userMessage, assistantMessage: { ...assistant, clarification: publicClarification(row) } };
}
export async function generateClarificationQuestions(client: OpenAI, model: string, message: string, context: ClarificationContext) {
    const native = model.startsWith("claude-");
    const toolName = "ask_clarifying_questions";
    const params = { model, temperature: .2, max_tokens: 9000, messages: [{ role: "user" as const, content: clarificationQuestionPrompt(message, context) }], ...(native ? { tools: [{ type: "function" as const, function: { name: toolName, description: "Ask the single fitting clarification round", parameters: z.toJSONSchema(clarificationQuestionsSchema, { unrepresentable: "any" }) } }], tool_choice: { type: "function" as const, function: { name: toolName } }, parallel_tool_calls: false } : { response_format: { type: "json_object" as const } }) };
    let result: OpenAI.Chat.Completions.ChatCompletion;
    try {
        result = await client.chat.completions.create(params, { timeout: 25_000, maxRetries: 0 });
    } catch (error) {
        throw new QuestionFailure("provider", error);
    }
    const choice = result.choices[0]?.message;
    const tool = choice?.tool_calls?.find(call => call.type === "function" && call.function.name === toolName);
    const raw = tool?.type === "function" ? tool.function.arguments : choice?.content ?? "";
    const output = { finishReason: result.choices[0]?.finish_reason, toolCalls: choice?.tool_calls?.length ?? 0, characters: raw.length };
    if (output.finishReason === "length") throw new QuestionFailure("truncated_response", undefined, output);
    if (!raw.trim()) throw new QuestionFailure("empty_response", undefined, output);
    let json: unknown;
    try { json = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
    catch (error) { throw new QuestionFailure("invalid_json", error, output); }
    let parsed: z.infer<typeof clarificationQuestionsSchema>;
    try { parsed = parseClarificationQuestionOutput(json); }
    catch (error) { throw new QuestionFailure("invalid_questions", error, output); }
    parsed.questions[0].prompt = groundedProfilePrompt(message, context);
    parsed.questions[0].reason = { zh: "确认档案与这次需求是否一致；本次更正优先。", en: "Confirm the saved profile still fits this request; your corrections take priority." };
    if (/室外|外场|室内|木地板|outdoor|indoor/i.test(message) && parsed.questions[3].id === "court") {
        parsed.questions[3] = { id: "budget", prompt: { zh: "场地需求已经明确。预算上，你更倾向哪种选择？", en: "Your court needs are clear. How should I approach your budget?" }, reason: { zh: "价格和币种会在推荐时针对具体鞋款核实。", en: "Current prices and currency will be checked for the exact models." } };
    }
    return clarificationQuestionsSchema.parse(parsed);
}

/** Generated copy may include harmless extra keys or a different topic order.
 * Keep only the declared bilingual copy, then validate all four unique topics.
 * Options remain exclusively server-owned. Invalid/missing answers are not guessed. */
export function parseClarificationQuestionOutput(value: unknown): z.infer<typeof clarificationQuestionsSchema> {
    const object = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
    const localized = (v: unknown) => { const item = object(v); return item ? { zh: item.zh, en: item.en } : v; };
    const input = object(value);
    if (!input || !Array.isArray(input.questions)) return clarificationQuestionsSchema.parse(value);
    const order = ["profile", "age", "fit", "court", "budget"];
    const questions = input.questions.map(value => {
        const q = object(value);
        return q ? { id: q.id, prompt: localized(q.prompt), reason: localized(q.reason) } : value;
    }).sort((a, b) => order.indexOf(String(object(a)?.id)) - order.indexOf(String(object(b)?.id)));
    return clarificationQuestionsSchema.parse({ intro: localized(input.intro), questions });
}
export async function prepareChatClarification(args: {
    db: Db;
    request: Request;
    userId: string;
    chatId: string;
    message: string;
    count: number;
    model: string;
    actualModel: string;
    lang: "zh" | "en";
    context: ClarificationContext;
    client: OpenAI;
    existing: ClarificationRow | null;
}) {
    if (args.existing && args.existing.status !== "failed")
        return clarificationResponse(args.db, args.existing);
    const reservation = await reserveAiRequest(args.request, args.userId, "chat", "unlimited", 0);
    if ("error" in reservation)
        return reservation.error;
    let row: ClarificationRow | null = null;
    let stage: "claim" | "generation" | "save" | "settlement" | "response" = "claim";
    const startedAt = Date.now();
    try {
        const claimed = await args.db.rpc("begin_ai_chat_clarification", { p_chat_id: args.chatId, p_user_id: args.userId, p_request_id: reservation.id, p_message: args.message, p_context: args.context, p_count: args.count, p_model: args.model, p_lang: args.lang });
        if (claimed.error)
            throw new QuestionFailure("claim_failed", claimed.error);
        const value = claimed.data as {
            claimed: boolean;
            row: ClarificationRow;
        };
        row = value.row;
        if (!value.claimed)
            return clarificationResponse(args.db, row);
        stage = "generation";
        let questions: z.infer<typeof clarificationQuestionsSchema>;
        try {
            questions = await generateClarificationQuestions(args.client, args.actualModel, row.original_message, row.context);
        } catch (error) {
            console.warn("[ai/clarification] grounded question fallback", { stage, elapsedMs: Date.now() - startedAt, model: args.actualModel, modelSlot: args.model, clarificationId: row.id, requestId: reservation.id, ...clarificationFailureDiagnostic(error) });
            questions = groundedClarificationQuestions(row.original_message, row.context);
        }
        stage = "save";
        const saved = await args.db.rpc("finish_ai_chat_clarification", { p_id: row.id, p_user_id: args.userId, p_request_id: reservation.id, p_questions: questions });
        if (saved.error || !saved.data)
            throw new QuestionFailure("save_failed", saved.error);
        row = saved.data as ClarificationRow;
        stage = "settlement";
        await reservation.finish(0);
        stage = "response";
        return await clarificationResponse(args.db, row);
    }
    catch (error) {
        console.error("[ai/clarification] failed", { stage, elapsedMs: Date.now() - startedAt, model: args.actualModel, modelSlot: args.model, clarificationId: row?.id, requestId: reservation.id, ...clarificationFailureDiagnostic(error) });
        if (row?.status === "generating") {
            await args.db.from("ai_chat_clarifications").update({ status: "failed", error: "questions_unavailable" }).eq("id", row.id).eq("request_id", reservation.id).eq("status", "generating");
            row = { ...row, status: "failed", error: "questions_unavailable" };
        }
        if (row) return clarificationResponse(args.db, row);
        throw new Error("Clarification unavailable");
    }
    finally {
        await reservation.refund();
    }
}
