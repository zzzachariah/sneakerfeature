import assert from "node:assert/strict";
import OpenAI from "openai";
import { createPackyFetch } from "../lib/ai/packy-fetch";
import { normalizeBaseURL } from "../lib/ai/packy-client";

const calls: { url: string; body: any; headers: Headers; signal: AbortSignal }[] = [];
const model = "claude-haiku-4-5-20251001";
const key = "fixture-not-a-real-key";
const native = { id: "msg_fixture", model, type: "message", role: "assistant",
  content: [{ type: "text", text: '{"ok":true}' }], stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 5 } };
let reply = () => new Response(JSON.stringify(native), { headers: { "content-type": "application/json" } });
const transport: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  calls.push({ url: request.url, body: await request.json(), headers: request.headers, signal: request.signal });
  return reply();
};
const client = new OpenAI({ apiKey: key, baseURL: "https://cf.api.fan/v1", maxRetries: 0,
  fetch: createPackyFetch(transport) });
const payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
  model, max_tokens: 1600, temperature: 0.5, response_format: { type: "json_object" },
  messages: [{ role: "system", content: "Keep the original system instruction." },
    { role: "user", content: [{ type: "text", text: "Inspect this fixture" },
      { type: "image_url", image_url: { url: "data:image/png;base64,ZmFrZQ==" } }] }]
};
const result = await client.chat.completions.create(payload);
assert.equal(result.choices[0].message.content, '{"ok":true}');
assert.equal(calls[0].url, "https://cf.api.fan/v1/messages");
assert.equal(calls[0].headers.get("authorization"), `Bearer ${key}`);
assert.equal(calls[0].headers.get("anthropic-version"), "2023-06-01");
assert.equal(calls[0].body.temperature, 0.5);
assert.equal(calls[0].body.max_tokens, 1600);
assert.equal(calls[0].body.response_format, undefined);
assert.equal(calls[0].body.system[0].text, "Keep the original system instruction.");
assert.match(calls[0].body.system[1].text, /valid JSON/);
assert.deepEqual(calls[0].body.messages[0].content[1], {
  type: "image", source: { type: "base64", media_type: "image/png", data: "ZmFrZQ==" }
});

// Native tool blocks must retain their exact signature on the next request;
// the app still sees its existing Chat Completions tool_call representation.
const thought = { type: "thinking", thinking: "fixture thought", signature: "fixture signature" };
reply = () => new Response(JSON.stringify({ ...native, stop_reason: "tool_use", content: [thought,
  { type: "tool_use", id: "tool_fixture", name: "web_search", input: { query: "grip" } }] }));
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [{ type: "function", function: {
  name: "web_search", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
} }];
const toolResult = await client.chat.completions.create({ ...payload, model: "claude-opus-5", tools,
  tool_choice: { type: "function", function: { name: "web_search" } } });
assert.equal(toolResult.choices[0].finish_reason, "tool_calls");
assert.equal(calls.at(-1)!.body.temperature, undefined);
assert.deepEqual(calls.at(-1)!.body.tool_choice, { type: "tool", name: "web_search" });
assert.equal(calls.at(-1)!.body.tools[0].input_schema.type, "object");
await client.chat.completions.create({ ...payload, model: "claude-opus-5", tools, messages: [
  { role: "user", content: "Find grip evidence" }, toolResult.choices[0].message,
  { role: "tool", tool_call_id: "tool_fixture", content: "fixture evidence" },
  { role: "user", content: "Now finish" }
] });
const continued = calls.at(-1)!.body.messages;
assert.deepEqual(continued[1].content[0], thought);
assert.deepEqual(continued[2].content, [
  { type: "tool_result", tool_use_id: "tool_fixture", content: [{ type: "text", text: "fixture evidence" }] },
  { type: "text", text: "Now finish" }
]);

const events = [
  { type: "message_start", message: { ...native, content: [] } },
  { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "fixture thought" } },
  { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "fixture signature" } },
  { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "抓地" } },
  { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "tool_stream", name: "web_search", input: {} } },
  { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"query":' } },
  { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '"grip"}' } },
  { type: "message_delta", delta: { stop_reason: "tool_use" } },
  { type: "message_stop" }
];
function sse(items: object[]) {
  const bytes = new TextEncoder().encode(items.map((item: any) => `event: ${item.type}\r\ndata: ${JSON.stringify(item)}\r\n\r\n`).join(""));
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    if (offset === bytes.length) controller.close();
    else { controller.enqueue(bytes.slice(offset, offset + 7)); offset = Math.min(offset + 7, bytes.length); }
  } }), { headers: { "content-type": "text/event-stream" } });
}
reply = () => sse(events);
const stream = await client.chat.completions.create({ ...payload, tools, stream: true });
const chunks = [];
for await (const chunk of stream) chunks.push(chunk);
assert.equal(chunks.map((c) => c.choices[0]?.delta.content ?? "").join(""), "抓地");
const toolChunks = chunks.flatMap((c) => c.choices[0]?.delta.tool_calls ?? []);
assert.equal(toolChunks[0].index, 0, "native content index 2 must map to tool index 0");
assert.equal(toolChunks.map((c) => c.function?.arguments ?? "").join(""), '{"query":"grip"}');
assert.equal(chunks.at(-1)!.choices[0].finish_reason, "tool_calls");
reply = () => new Response(JSON.stringify(native));
await client.chat.completions.create({ ...payload, tools, messages: [
  { role: "user", content: "Continue stream fixture" },
  { role: "assistant", content: "抓地", tool_calls: [{ id: "tool_stream", type: "function", function: { name: "web_search", arguments: '{"query":"grip"}' } }] },
  { role: "tool", tool_call_id: "tool_stream", content: "done" }
] });
assert.deepEqual(calls.at(-1)!.body.messages[1].content[0], thought);

reply = () => sse(events.slice(0, -1));
await assert.rejects(async () => {
  for await (const _ of await client.chat.completions.create({ ...payload, stream: true })) { /* consume */ }
}, /message_stop/, "a truncated native stream must not appear successful");
reply = () => sse([{ type: "error", error: { type: "overloaded_error", message: "fixture overloaded" } }]);
await assert.rejects(async () => {
  for await (const _ of await client.chat.completions.create({ ...payload, stream: true })) { /* consume */ }
}, /fixture overloaded/);
reply = () => new Response(JSON.stringify({ error: { message: "fixture denied" } }), { status: 401 });
await assert.rejects(client.chat.completions.create(payload), (e: unknown) => e instanceof OpenAI.APIError && e.status === 401);

reply = () => sse(events);
for await (const _ of await client.chat.completions.create({ ...payload, stream: true })) break;
assert.equal(calls.at(-1)!.signal.aborted, true, "cancelling the client stream must abort the native upstream request");
const deepseek = { ...payload, model: "deepseek-v4-pro" };
reply = () => new Response(JSON.stringify({ id: "deepseek", choices: [] }));
await client.chat.completions.create(deepseek);
assert.equal(calls.at(-1)!.url, "https://cf.api.fan/v1/chat/completions");
assert.deepEqual(calls.at(-1)!.body, deepseek, "non-Claude calls must retain the original wire contract");
assert.equal(normalizeBaseURL(" https://cf.api.fan/ "), "https://cf.api.fan/v1");
assert.equal(normalizeBaseURL("https://relay.invalid/custom/v1/"), "https://relay.invalid/custom/v1");
console.log("Packy protocol: native text/images/tools, signed thinking replay, split SSE, errors, truncation, cancellation and DeepSeek passthrough passed.");
