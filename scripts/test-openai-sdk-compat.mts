import assert from "node:assert/strict";
import OpenAI from "openai";
import { translateFieldsToZh } from "../lib/ai/translate-content";
import { summarizeBloggerReview } from "../lib/ai/summarize-review";

// No credentials or network: exercise the actual SDK transport against a local
// fetch double, including the relay's existing Chat Completions/SSE contracts.
const key = "test-only-not-a-real-api-key";
const baseURL = "https://relay.invalid/custom/v1";
const completion = {
  id: "compat-completion", object: "chat.completion", created: 1, model: "unchanged-model",
  choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
};
const jsonResponse = () => new Response(JSON.stringify(completion), {
  headers: { "content-type": "application/json", "x-request-id": "compat-request" },
});
type RequestRecord = { url: string; method: string; body: unknown; headers: Headers };
const requests: RequestRecord[] = [];
const record = async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init);
  requests.push({ url: req.url, method: req.method, body: JSON.parse(await req.text()), headers: req.headers });
};
const client = new OpenAI({ apiKey: key, baseURL, maxRetries: 1, timeout: 180_000,
  fetch: async (input, init) => { await record(input, init); return jsonResponse(); },
});

const payloads: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming[] = [
  { model: "unchanged-model", temperature: 0.1, response_format: { type: "json_object" },
    messages: [{ role: "system", content: "Return JSON" }, { role: "user", content: "Existing prompt" }] },
  { model: "unchanged-model", messages: [{ role: "user", content: "Find evidence" }],
    tools: [{ type: "function", function: { name: "web_search", description: "Existing tool", parameters: { type: "object", properties: { query: { type: "string" } } } } }], tool_choice: "auto" },
  { model: "unchanged-model", temperature: 0, messages: [{ role: "user", content: [
    { type: "text", text: "Existing image analysis prompt" },
    { type: "image_url", image_url: { url: "data:image/png;base64,dGVzdA==", detail: "high" } },
  ] }] },
];
for (const payload of payloads) {
  const result = await client.chat.completions.create(payload);
  assert.equal(result.choices[0]?.message.content, "ok");
  const sent = requests.at(-1)!;
  assert.equal(sent.url, `${baseURL}/chat/completions`);
  assert.equal(sent.method, "POST");
  assert.equal(sent.headers.get("authorization"), `Bearer ${key}`);
  assert.match(sent.headers.get("content-type") ?? "", /^application\/json/);
  assert.deepEqual(sent.body, payload, "SDK must preserve every model, prompt, tool and image parameter");
}

const chunk = { id: "compat-stream", object: "chat.completion.chunk", created: 1, model: "unchanged-model",
  choices: [{ index: 0, delta: { content: "answer", reasoning_content: "relay reasoning" }, finish_reason: null }] };
const streamed: RequestRecord[] = [];
const streamClient = new OpenAI({ apiKey: key, baseURL, maxRetries: 0,
  fetch: async (input, init) => {
    await record(input, init); streamed.push(requests.at(-1)!);
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
  },
});
const streamPayload = { ...payloads[0], stream: true as const };
const stream = await streamClient.chat.completions.create(streamPayload);
const chunks = [];
for await (const value of stream) chunks.push(value);
assert.deepEqual(streamed[0].body, streamPayload);
assert.deepEqual(chunks, [chunk], "SSE must retain the relay's reasoning extension and content");

let retries = 0;
const retryClient = new OpenAI({ apiKey: key, baseURL, maxRetries: 1,
  fetch: async () => ++retries === 1
    ? new Response(JSON.stringify({ error: { message: "try again", type: "rate_limit_error" } }), {
      status: 429, headers: { "content-type": "application/json", "retry-after-ms": "1" },
    }) : jsonResponse(),
});
await retryClient.chat.completions.create(payloads[0]);
assert.equal(retries, 2, "the configured single retry must remain active");

const controller = new AbortController();
const abortClient = new OpenAI({ apiKey: key, baseURL, maxRetries: 0,
  fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    setTimeout(() => controller.abort(), 5);
  }),
});
await assert.rejects(abortClient.chat.completions.create(payloads[0], { signal: controller.signal }),
  (error: unknown) => error instanceof OpenAI.APIUserAbortError);

const translation = { items: [{ key: "traction", zh: "抓地稳定" }] };
const review = { relevant: true, pros: ["抓地稳定", "贴合可靠"], cons: ["较闷热", "需要磨合"], summary: "有条件的实穿结论",
  pros_en: ["Secure traction", "Reliable fit"], cons_en: ["Warm upper", "Needs break-in"], summary_en: "A contextual wear review" };
for (const toolType of ["function", "custom"] as const) {
  let helperCalls = 0;
  const helperClient = (payload: unknown) => new OpenAI({ apiKey: key, baseURL, maxRetries: 0,
    fetch: async () => {
      helperCalls++;
      const serialized = JSON.stringify(payload);
      const tool = toolType === "function"
        ? { id: "tool", type: "function", function: { name: "submit_result", arguments: serialized } }
        : { id: "tool", type: "custom", custom: { name: "unsupported_custom_tool", input: "ignored" } };
      return new Response(JSON.stringify({ ...completion, choices: [{ index: 0, finish_reason: "stop",
        message: { role: "assistant", content: toolType === "custom" ? serialized : null, tool_calls: [tool] } }] }),
      { headers: { "content-type": "application/json" } });
    },
  });
  assert.deepEqual(await translateFieldsToZh(helperClient(translation), [{ key: "traction", text: "Secure traction" }]), { traction: "抓地稳定" });
  assert.deepEqual(await summarizeBloggerReview(helperClient(review), { shoeName: "Fixture shoe", bloggerName: "Fixture reviewer", transcript: "A fixture transcript about grip and fit." }), review);
  assert.equal(helperCalls, 2, "function results and custom-tool content fallbacks must not add unexpected API calls");
}
console.log("OpenAI SDK compatibility: 3 request contracts, SSE, retry, abort and 4 application helper paths passed (no network).");
