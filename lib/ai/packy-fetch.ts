import type OpenAI from "openai";
import { Stream } from "openai/core/streaming";

// Packy now exposes Claude only through Anthropic Messages. Keep the app's
// Chat Completions contract (including images, tools and streaming), and adapt
// only Claude requests at the transport boundary. Other models pass through.
type Params = OpenAI.Chat.Completions.ChatCompletionCreateParams;
type Block = { type: string; [key: string]: unknown };
type ClaudeMessage = {
  id: string; model: string; content: Block[]; stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};
type Event = {
  type: string; index: number; message?: ClaudeMessage;
  content_block?: Block; delta?: Block & { stop_reason?: string };
};

function blocks(content: OpenAI.Chat.Completions.ChatCompletionMessageParam["content"]): Block[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  return (content ?? []).map((part): Block => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "image_url") {
      const url = part.image_url.url;
      const data = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/s.exec(url);
      return { type: "image", source: data
        ? { type: "base64", media_type: data[1], data: data[2] }
        : { type: "url", url } };
    }
    throw new Error(`Unsupported Claude content type: ${part.type}`);
  });
}

type ThinkingCache = Map<string, Block[]>;

function rememberThinking(cache: ThinkingCache, ids: string[], thinking: Block[]) {
  if (!thinking.length) return;
  for (const id of ids) cache.set(id, thinking);
  // Client-local only: tool continuations in this turn need the exact signed
  // blocks. Never persist them or share them between users.
  while (cache.size > 128) cache.delete(cache.keys().next().value!);
}

function toMessages(p: Params, thinkingCache: ThinkingCache) {
  const system: Block[] = [];
  const messages: { role: "user" | "assistant"; content: Block[] }[] = [];
  const append = (role: "user" | "assistant", content: Block[]) => {
    if (!content.length) return;
    const last = messages.at(-1);
    if (last?.role === role) last.content.push(...content);
    else messages.push({ role, content });
  };
  for (const message of p.messages) {
    if (message.role === "system" || message.role === "developer") {
      system.push(...blocks(message.content));
    } else if (message.role === "tool") {
      append("user", [{ type: "tool_result", tool_use_id: message.tool_call_id, content: blocks(message.content) }]);
    } else if (message.role === "user" || message.role === "assistant") {
      const content = blocks(message.content);
      if (message.role === "assistant") {
        const signedThinking = (message.tool_calls ?? []).map((call) => thinkingCache.get(call.id)).find(Boolean);
        if (signedThinking) content.unshift(...signedThinking);
        for (const call of message.tool_calls ?? []) {
          if (call.type !== "function") throw new Error("Unsupported Claude tool type");
          content.push({ type: "tool_use", id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments || "{}") });
        }
      }
      append(message.role, content);
    } else throw new Error(`Unsupported Claude role: ${message.role}`);
  }
  // JSON mode is an OpenAI-only parameter. The application validates the JSON
  // response itself; carry the output instruction into Claude's system prompt.
  if (p.response_format?.type === "json_object") {
    system.push({ type: "text", text: "Return only a valid JSON object matching the requested shape. Do not wrap it in Markdown or add prose outside the JSON." });
  }
  const tools = p.tools?.map((tool) => {
    if (tool.type !== "function") throw new Error("Unsupported Claude tool type");
    return { name: tool.function.name, description: tool.function.description,
      input_schema: tool.function.parameters ?? { type: "object", properties: {} } };
  });
  const choice = p.tool_choice;
  const toolChoice = typeof choice === "object"
    ? choice.type === "function" ? { type: "tool", name: choice.function.name } : undefined
    : choice ? { type: choice === "required" ? "any" : choice } : undefined;
  return {
    model: p.model, max_tokens: p.max_completion_tokens ?? p.max_tokens ?? 4096,
    messages, stream: p.stream ?? false,
    ...(system.length ? { system } : {}),
    ...(tools?.length ? { tools } : {}),
    ...(toolChoice ? { tool_choice: { ...toolChoice,
      ...(p.parallel_tool_calls === false ? { disable_parallel_tool_use: true } : {}) } } : {}),
    ...(p.stop ? { stop_sequences: typeof p.stop === "string" ? [p.stop] : p.stop } : {}),
    // Newer Opus models reject sampling parameters. Haiku 4.5 still supports
    // them, including the deliberate variation used by foot-scan samples.
    ...(p.model === "claude-haiku-4-5-20251001" && p.temperature != null ? { temperature: p.temperature } : {})
  };
}

function finishReason(reason?: string) {
  return reason === "tool_use" ? "tool_calls" : reason === "max_tokens" ? "length" : "stop";
}

function toCompletion(message: ClaudeMessage) {
  const tool_calls = message.content.filter((b) => b.type === "tool_use").map((b) => ({
    id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input) }
  }));
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const prompt_tokens = message.usage?.input_tokens ?? 0;
  const completion_tokens = message.usage?.output_tokens ?? 0;
  return { id: message.id, model: message.model, object: "chat.completion", created: Math.floor(Date.now() / 1000),
    choices: [{ index: 0, message: { role: "assistant", content: text || null,
      ...(tool_calls.length ? { tool_calls } : {}) }, finish_reason: finishReason(message.stop_reason) }],
    usage: { prompt_tokens, completion_tokens, total_tokens: prompt_tokens + completion_tokens } };
}

async function* completionEvents(response: Response, abort: AbortController, model: string, thinkingCache: ThinkingCache) {
  const encoder = new TextEncoder();
  let id = "";
  let stopped = false;
  const tools = new Map<number, number>();
  const toolIds: string[] = [];
  const thinking = new Map<number, Block>();
  const chunk = (delta: object, reason: string | null = null) => encoder.encode(`data: ${JSON.stringify({
    id, model, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000),
    choices: [{ index: 0, delta, finish_reason: reason }]
  })}\n\n`);
  // Reuse the installed SDK's SSE decoder for UTF-8, CRLF, split frames and
  // upstream error events instead of implementing a second wire parser.
  for await (const event of Stream.fromSSEResponse<Event>(response, abort)) {
    if (event.type === "message_start" && event.message) {
      id = event.message.id;
      model = event.message.model;
      yield chunk({ role: "assistant" });
    } else if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block?.type === "tool_use") {
        const index = tools.size;
        tools.set(event.index, index);
        toolIds.push(String(block.id));
        const args = block.input && Object.keys(block.input as object).length ? JSON.stringify(block.input) : "";
        yield chunk({ tool_calls: [{ index, id: block.id, type: "function", function: { name: block.name, arguments: args } }] });
      } else if (block?.type === "text" && block.text) yield chunk({ content: block.text });
      else if (block?.type === "thinking" || block?.type === "redacted_thinking") thinking.set(event.index, { ...block });
    } else if (event.type === "content_block_delta") {
      const delta = event.delta;
      if (delta?.type === "text_delta") yield chunk({ content: delta.text });
      else if (delta?.type === "thinking_delta") {
        const block = thinking.get(event.index);
        if (block) block.thinking = String(block.thinking ?? "") + String(delta.thinking ?? "");
        yield chunk({ reasoning_content: delta.thinking });
      } else if (delta?.type === "signature_delta") {
        const block = thinking.get(event.index);
        if (block) block.signature = String(block.signature ?? "") + String(delta.signature ?? "");
      }
      else if (delta?.type === "input_json_delta") {
        const index = tools.get(event.index);
        if (index === undefined) throw new Error("Claude returned tool arguments without a tool block");
        yield chunk({ tool_calls: [{ index, function: { arguments: delta.partial_json } }] });
      }
    } else if (event.type === "message_delta" && event.delta?.stop_reason) {
      yield chunk({}, finishReason(event.delta.stop_reason));
    } else if (event.type === "message_stop") {
      stopped = true;
      rememberThinking(thinkingCache, toolIds, [...thinking.values()]);
      yield encoder.encode("data: [DONE]\n\n");
      break;
    }
  }
  if (!stopped && !abort.signal.aborted) throw new Error("Claude stream ended before message_stop");
}

export function createPackyFetch(transport: typeof fetch = globalThis.fetch): typeof fetch {
  const thinkingCache: ThinkingCache = new Map();
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (request.method !== "POST" || !url.pathname.endsWith("/chat/completions")) return transport(input, init);
    const params = await request.clone().json() as Params;
    if (!params.model.startsWith("claude-")) return transport(input, init);

    url.pathname = url.pathname.replace(/\/chat\/completions$/, "/messages");
    const headers = new Headers(request.headers);
    headers.set("anthropic-version", "2023-06-01");
    headers.delete("content-length");
    const abort = new AbortController();
    const response = await transport(url, { method: "POST", headers, body: JSON.stringify(toMessages(params, thinkingCache)),
      signal: AbortSignal.any([request.signal, abort.signal]) });
    // Preserve real HTTP status/body so the SDK's retry and APIError handling
    // continue to work, including auth, rate limits and unavailable models.
    if (!response.ok) return response;
    const responseHeaders = new Headers();
    const requestId = response.headers.get("request-id") ?? response.headers.get("x-oneapi-request-id");
    if (requestId) responseHeaders.set("x-request-id", requestId);
    if (!params.stream) {
      responseHeaders.set("content-type", "application/json");
      const message = await response.json() as ClaudeMessage;
      rememberThinking(thinkingCache, message.content.filter((b) => b.type === "tool_use").map((b) => String(b.id)),
        message.content.filter((b) => b.type === "thinking" || b.type === "redacted_thinking"));
      return new Response(JSON.stringify(toCompletion(message)), { headers: responseHeaders });
    }
    responseHeaders.set("content-type", "text/event-stream");
    const iterator = completionEvents(response, abort, params.model, thinkingCache);
    return new Response(new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const step = await iterator.next();
          if (step.done) controller.close();
          else controller.enqueue(step.value);
        } catch (error) { abort.abort(); controller.error(error); }
      },
      async cancel() { abort.abort(); await iterator.return(); }
    }), { headers: responseHeaders });
  };
}
