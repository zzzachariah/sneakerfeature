"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatSidebar } from "@/components/smart-picker/chat-sidebar";
import { ChatConversation } from "@/components/smart-picker/chat-conversation";
import { MAX_CONCURRENT_TURNS, type AiChatMessage, type AiChatSummary, type RecommendationItem } from "@/lib/ai/types";
import type { CheckinStatus } from "@/lib/ai/checkin";
import { useLocale } from "@/components/i18n/locale-provider";
import { isModelId, type ModelId, type Tier } from "@/lib/subscription/tiers";

const INITIAL_CHECKIN: CheckinStatus = { canClaim: false, nextClaimAt: null, dailyAmount: 3 };

// The blank conversation the picker opens on has no `ai_chats` row until its
// first message is sent, so its thread lives under this reserved key and is
// moved under the real id once the row exists.
const NEW_CHAT_KEY = "new";

// Stable empty thread so a conversation with no messages doesn't hand a fresh
// array to ChatConversation on every render.
const EMPTY_THREAD: AiChatMessage[] = [];

async function getJson(input: string, init?: RequestInit) {
  try {
    const res = await fetch(input, init);
    return await res.json();
  } catch {
    return null;
  }
}

// A client-only assistant bubble (error / notice). Never persisted — it exists
// so the failure is explained where the user is looking.
function localMessage(content: string): AiChatMessage {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: "assistant",
    content,
    recommendations: null,
    credits_charged: 0,
    created_at: new Date().toISOString()
  };
}

// Localized text for a server `status` progress event. The server's `message`
// is zh-CN; a non-Chinese request maps the machine-readable `phase` instead and
// only falls back to the raw message for phases this build doesn't know yet.
// Keyed on the user's INPUT language (not the UI locale) so the live "thought
// process" follows whatever language they typed in.
function statusText(
  d: { phase?: string; message?: string; round?: number },
  zhInput: boolean
): string {
  if (zhInput) return d.message ?? "";
  switch (d.phase) {
    case "start":
      return "Getting started…";
    case "thinking":
      return "Analyzing your request…";
    case "reading":
      return "Reading the shoe catalog and thinking…";
    case "shortlist":
      return "Picking candidate shoes…";
    case "round":
      return `Digging deeper${typeof d.round === "number" ? ` (round ${d.round})` : ""}…`;
    case "searching":
      return "Searching the web…";
    case "writing":
      return "Writing up each recommendation…";
    case "generating":
      return "Generating recommendations…";
    case "finalizing":
      return "Putting the picks together…";
    default:
      return d.message ?? "";
  }
}

export function SmartPickerClient({ initialPrompt }: { initialPrompt?: string }) {
  // User-facing fallback strings were hardcoded Chinese; pick per locale so the
  // English UI never shows untranslated zh (the rest of the app uses translate()).
  const { locale } = useLocale();
  const zhUI = locale === "zh";
  const failMsg = zhUI ? "请求失败，请稍后重试。" : "Request failed — please try again.";
  // A stream that dies after the thinking phase is NOT the same failure as a
  // request that never started: the model did the work and the connection went
  // away. Say so, so it isn't mistaken for the app rejecting the request.
  const dropMsg = zhUI
    ? "与服务器的连接在生成推荐时中断了，请再发送一次。"
    : "The connection dropped while your picks were being generated — please send it again.";
  const [chats, setChats] = useState<AiChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  // One message thread per conversation, keyed by chat id (plus NEW_CHAT_KEY).
  // A single shared `messages` array is what used to make leaving a generating
  // conversation impossible: switching replaced the array under the live
  // stream, so the turn wrote into the wrong chat and its progress was lost.
  const [threads, setThreads] = useState<Record<string, AiChatMessage[]>>({});
  // Conversations currently generating, and those whose history is being
  // fetched. Both are per-chat so activity in one never disables another.
  const [streamingKeys, setStreamingKeys] = useState<string[]>([]);
  const [loadingKeys, setLoadingKeys] = useState<string[]>([]);
  // Conversations that finished generating while the user was reading another
  // one — flagged in history so a background answer doesn't go unnoticed.
  const [unseenChatIds, setUnseenChatIds] = useState<string[]>([]);
  const [balance, setBalance] = useState(0);
  const [creditsLoaded, setCreditsLoaded] = useState(false);
  const [checkin, setCheckin] = useState<CheckinStatus>(INITIAL_CHECKIN);
  const [allowance, setAllowance] = useState<{ balance: number; grant: number } | null>(null);
  // Membership tier + the model the picker currently targets. Loaded with the
  // credits payload; selection is optimistic and persists via member prefs so
  // it follows the account across devices.
  const [tier, setTier] = useState<Tier>("free");
  const [model, setModel] = useState<ModelId | null>(null);
  const [unlimited, setUnlimited] = useState(false);

  // Mirror of `streamingKeys` for synchronous reads inside handleSend (state is
  // a render behind), plus the AbortController of each in-flight stream so a
  // deleted conversation can drop its connection.
  const streamsRef = useRef<Set<string>>(new Set());
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  // Conversations whose thread is already in memory — fetched, or being built
  // live by a stream. Guards the history GET that would otherwise land
  // mid-stream and wipe the optimistic user bubble + the streaming turn.
  const loadedRef = useRef<Set<string>>(new Set());
  // Which conversation the user is actually looking at, readable from inside an
  // async send (the state closure goes stale across an await).
  const activeKeyRef = useRef<string>(NEW_CHAT_KEY);

  const activeKey = activeChatId ?? NEW_CHAT_KEY;
  const messages = threads[activeKey] ?? EMPTY_THREAD;
  const sending = streamingKeys.includes(activeKey);
  const loadingMessages = loadingKeys.includes(activeKey);
  // Every other conversation is already generating: the composer says so and
  // holds the send rather than opening a fourth stream (and silently eating the
  // text the user just typed).
  const atTurnLimit = !sending && streamingKeys.length >= MAX_CONCURRENT_TURNS;

  const markStreaming = useCallback((key: string, on: boolean) => {
    const set = streamsRef.current;
    if (on) set.add(key);
    else set.delete(key);
    setStreamingKeys(Array.from(set));
  }, []);

  const patchThread = useCallback((key: string, updater: (list: AiChatMessage[]) => AiChatMessage[]) => {
    setThreads((prev) => ({ ...prev, [key]: updater(prev[key] ?? EMPTY_THREAD) }));
  }, []);

  const appendTo = useCallback(
    (key: string, message: AiChatMessage) => patchThread(key, (list) => [...list, message]),
    [patchThread]
  );

  // Initial load: chats + balance.
  // Note: we intentionally do NOT auto-select the most recent conversation.
  // Entering Smart Picker always starts on a fresh, empty conversation; the
  // user opens a past one explicitly from the history list.
  useEffect(() => {
    void (async () => {
      const [chatsRes, creditsRes] = await Promise.all([getJson("/api/ai/chats"), getJson("/api/ai/credits")]);
      if (chatsRes?.ok) {
        setChats(chatsRes.chats as AiChatSummary[]);
      }
      if (creditsRes?.ok) {
        setBalance(creditsRes.balance);
        setUnlimited(Boolean(creditsRes.unlimited));
        if (creditsRes.checkin) setCheckin(creditsRes.checkin as CheckinStatus);
        setAllowance((creditsRes.allowance as { balance: number; grant: number } | null) ?? null);
        if (creditsRes.tier === "free" || creditsRes.tier === "pro" || creditsRes.tier === "max") {
          setTier(creditsRes.tier);
        }
        if (isModelId(creditsRes.model)) setModel(creditsRes.model);
      }
      setCreditsLoaded(true);
    })();
  }, []);

  // Fetch a conversation's history the first time it's opened. Already-loaded
  // threads (including one being streamed into right now) are kept as-is, so
  // coming back to a generating conversation shows it still generating.
  useEffect(() => {
    const id = activeChatId;
    activeKeyRef.current = id ?? NEW_CHAT_KEY;
    if (!id) return;
    setUnseenChatIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev));
    if (loadedRef.current.has(id)) return;
    loadedRef.current.add(id);
    setLoadingKeys((prev) => [...prev, id]);
    void (async () => {
      const res = await getJson(`/api/ai/chats/${id}/messages`);
      setLoadingKeys((prev) => prev.filter((k) => k !== id));
      if (!res?.ok) {
        loadedRef.current.delete(id);
        return;
      }
      const fetched = res.messages as AiChatMessage[];
      // Merge rather than replace: a turn sent while this GET was in flight
      // only exists locally, and dropping it is what made a just-sent message
      // vanish. Local ids (temp-/stream-/local-) never collide with saved ones.
      setThreads((prev) => {
        const local = prev[id] ?? EMPTY_THREAD;
        const pending = local.filter((m) => !fetched.some((f) => f.id === m.id));
        return { ...prev, [id]: [...fetched, ...pending] };
      });
    })();
  }, [activeChatId]);

  const refreshChats = useCallback(async () => {
    const res = await getJson("/api/ai/chats");
    if (res?.ok) setChats(res.chats as AiChatSummary[]);
  }, []);

  // Starting a new conversation is purely local — the ai_chats row is created
  // on the first send. That makes "new chat" instant even while another
  // conversation is generating, and keeps empty rows out of history.
  const handleNewChat = useCallback(() => {
    if (!streamsRef.current.has(NEW_CHAT_KEY)) {
      setThreads((prev) => (prev[NEW_CHAT_KEY]?.length ? { ...prev, [NEW_CHAT_KEY]: EMPTY_THREAD } : prev));
    }
    activeKeyRef.current = NEW_CHAT_KEY;
    setActiveChatId(null);
  }, []);

  const handleSelect = useCallback((id: string) => {
    activeKeyRef.current = id;
    setActiveChatId(id);
  }, []);

  const handleRename = useCallback(async (id: string, title: string) => {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    await getJson(`/api/ai/chats/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await getJson(`/api/ai/chats/${id}`, { method: "DELETE" });
      if (!res?.ok) return;
      // Drop the stream with the conversation — the turn has nowhere to land.
      controllersRef.current.get(id)?.abort();
      controllersRef.current.delete(id);
      markStreaming(id, false);
      loadedRef.current.delete(id);
      setThreads((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setUnseenChatIds((prev) => prev.filter((x) => x !== id));
      setChats((prev) => {
        const next = prev.filter((c) => c.id !== id);
        setActiveChatId((cur) => (cur === id ? next[0]?.id ?? null : cur));
        return next;
      });
    },
    [markStreaming]
  );

  // Optimistic model switch; the pref write is fire-and-forget (open to every
  // tier — the server drops unsupported ids). Each send also carries the model
  // explicitly, so the switch applies even before this write lands.
  const handleSelectModel = useCallback((id: ModelId) => {
    setModel(id);
    void getJson("/api/member/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: id })
    });
  }, []);

  const handleClaimCheckin = useCallback(async () => {
    const res = await getJson("/api/ai/checkin/claim", { method: "POST" });
    if (res?.ok) {
      setBalance(res.balance);
      if (res.checkin) setCheckin(res.checkin as CheckinStatus);
    } else if (res?.checkin) {
      // Already claimed (e.g., two tabs raced) — refresh local state so the
      // badge disappears.
      setCheckin(res.checkin as CheckinStatus);
    }
  }, []);

  const handleSend = useCallback(
    async (message: string, count: number) => {
      // The guard is per-conversation: only a turn already running in THIS
      // conversation blocks a send. Another chat generating does not.
      let key = activeChatId ?? NEW_CHAT_KEY;
      if (streamsRef.current.has(key)) return;
      // Belt and braces — the composer already blocks this (`atTurnLimit`).
      if (streamsRef.current.size >= MAX_CONCURRENT_TURNS) return;

      // The live "thought process" (status rows + search chips) follows the
      // language the user typed in — matching the model's own thinking/output —
      // rather than the UI locale. CJK present → treat the request as Chinese.
      const zhInput = /[㐀-鿿]/.test(message);

      // Optimistic UI FIRST: the user's bubble and the thinking indicator must
      // appear the instant they hit send. The old order awaited chat creation
      // before touching state, leaving a dead, feedback-free window on the
      // first message of every fresh conversation.
      const tempUser: AiChatMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: message,
        recommendations: null,
        credits_charged: 0,
        created_at: new Date().toISOString()
      };
      appendTo(key, tempUser);
      markStreaming(key, true);

      const controller = new AbortController();
      controllersRef.current.set(key, controller);

      // Id of the streaming assistant bubble, and whether the server ever sent a
      // terminal frame. Hoisted so the error paths below can finish THAT bubble
      // instead of appending a second, context-free one.
      let streamingId: string | null = null;
      let sawTerminal = false;

      // Every write targets `key`, which follows the turn (not the view) — the
      // user can switch conversations mid-stream and the turn keeps filling in
      // its own thread.
      const patch = (updater: (m: AiChatMessage) => AiChatMessage) => {
        const id = streamingId;
        if (!id) return;
        patchThread(key, (list) => list.map((m) => (m.id === id ? updater(m) : m)));
      };

      try {
        // Ensure there's a chat to post into.
        let chatId = activeChatId;
        if (!chatId) {
          const created = await getJson("/api/ai/chats", { method: "POST" });
          if (!created?.ok) {
            patchThread(NEW_CHAT_KEY, (list) => [
              ...list.filter((m) => m.id !== tempUser.id),
              localMessage(failMsg)
            ]);
            return;
          }
          const newId = created.chat.id as string;
          setChats((prev) => [created.chat as AiChatSummary, ...prev]);
          // Move the optimistic thread under the real id and keep streaming
          // against it. The view only follows if the user is still sitting on
          // the blank conversation — someone who already opened another one
          // must not be yanked back here.
          const from = key;
          key = newId;
          chatId = newId;
          loadedRef.current.add(newId);
          setThreads((prev) => {
            const pending = prev[from] ?? EMPTY_THREAD;
            return { ...prev, [from]: EMPTY_THREAD, [newId]: [...(prev[newId] ?? EMPTY_THREAD), ...pending] };
          });
          markStreaming(from, false);
          markStreaming(newId, true);
          controllersRef.current.delete(from);
          controllersRef.current.set(newId, controller);
          if (activeKeyRef.current === from) {
            activeKeyRef.current = newId;
            setActiveChatId(newId);
          }
        }

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message, count, ...(model ? { model } : {}) }),
          signal: controller.signal
        });

        // Pre-flight failures (auth, insufficient credits, provider not
        // configured…) come back as JSON, not a stream — branch on Content-Type.
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream") || !res.body) {
          const data = await res.json().catch(() => null);
          if (data?.ok && data.insufficient) {
            setBalance(data.balance);
            patchThread(key, (list) => [
              ...list.filter((m) => m.id !== tempUser.id),
              localMessage(
                zhUI
                  ? `积分不足（当前余额 ${data.balance}）。每日签到可领取免费积分。`
                  : `Not enough credits (balance ${data.balance}). Claim free daily credits with the check-in.`
              )
            ]);
            return;
          }
          appendTo(key, localMessage(data?.message ?? failMsg));
          return;
        }

        // Streaming path: one assistant message that fills in live — the AI's
        // prose and search activity arrive as `steps`, then the cards. The
        // bubble renders nothing until the first step, so an empty placeholder
        // is invisible (the typing dots cover the "thinking" gap).
        const assistantId = `stream-${Date.now()}`;
        streamingId = assistantId;
        appendTo(key, {
          id: assistantId,
          role: "assistant",
          content: "",
          recommendations: null,
          credits_charged: 0,
          created_at: new Date().toISOString(),
          steps: []
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          // SSE frames are separated by a blank line; keep the trailing partial.
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const lines = frame.split("\n");
            const eventLine = lines.find((l) => l.startsWith("event:"));
            const dataLine = lines.find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const event = eventLine ? eventLine.slice(6).trim() : "message";
            let data: unknown;
            try {
              data = JSON.parse(dataLine.slice(5).trim());
            } catch {
              continue;
            }
            switch (event) {
              case "status": {
                // Live pipeline phase — the "what am I doing right now" line the
                // user asked for. Each new phase checks off the previous one.
                const d = data as { phase?: string; message?: string; round?: number };
                const text = statusText(d, zhInput);
                if (!text) break;
                patch((m) => {
                  const steps = [...(m.steps ?? [])];
                  const last = steps[steps.length - 1];
                  if (last?.kind === "status" && last.text === text) return m; // dedupe repeats
                  for (let i = steps.length - 1; i >= 0; i--) {
                    const s = steps[i];
                    if (s.kind === "status" && !s.done) {
                      steps[i] = { ...s, done: true };
                      break;
                    }
                  }
                  steps.push({ kind: "status", text });
                  return { ...m, steps };
                });
                break;
              }
              case "text": {
                const delta = (data as { delta?: string }).delta;
                if (delta) {
                  patch((m) => ({ ...m, steps: [...(m.steps ?? []), { kind: "prose", text: delta }] }));
                }
                break;
              }
              case "search": {
                const d = data as { query?: string; state?: "start" | "ok" | "fail"; resultCount?: number };
                if (d.state === "start") {
                  const text = zhInput ? `🔍 正在联网搜索：${d.query ?? ""}` : `🔍 Searching the web: ${d.query ?? ""}`;
                  patch((m) => ({ ...m, steps: [...(m.steps ?? []), { kind: "activity", text, state: "start" }] }));
                } else if (d.state === "ok" || d.state === "fail") {
                  const state = d.state;
                  const resultCount = d.resultCount;
                  patch((m) => {
                    const steps = [...(m.steps ?? [])];
                    // Resolve the most recent in-flight search chip.
                    for (let i = steps.length - 1; i >= 0; i--) {
                      const s = steps[i];
                      if (s.kind === "activity" && s.state === "start") {
                        steps[i] = {
                          ...s,
                          state,
                          text: state === "ok" && resultCount ? (zhInput ? `${s.text}（${resultCount} 条）` : `${s.text} (${resultCount} results)`) : s.text
                        };
                        break;
                      }
                    }
                    return { ...m, steps };
                  });
                }
                break;
              }
              case "recommendations": {
                const items = (data as { items?: RecommendationItem[] }).items ?? [];
                patch((m) => ({ ...m, recommendations: items }));
                break;
              }
              case "done": {
                sawTerminal = true;
                const d = data as {
                  assistantMessageId?: string;
                  content?: string;
                  createdAt?: string;
                  creditsCharged?: number;
                  balance?: number;
                  unlimited?: boolean;
                  billing?: string;
                };
                patch((m) => ({
                  ...m,
                  id: d.assistantMessageId ?? m.id,
                  content: d.content ?? m.content,
                  credits_charged: d.creditsCharged ?? 0,
                  created_at: d.createdAt ?? m.created_at,
                  // The turn is over — check off any status still shown as running.
                  steps: m.steps?.map((s) => (s.kind === "status" && !s.done ? { ...s, done: true } : s))
                }));
                // A premium (allowance-billed) turn drains the monthly meter,
                // not the credits pill — route the returned balance accordingly.
                // An "unlimited" turn spent NEITHER account, so its `balance` is
                // just the route's unread placeholder 0 — writing that into the
                // credits pill would fabricate a zero balance for a paid member.
                if (typeof d.balance === "number" && d.billing !== "unlimited") {
                  const bal = d.balance;
                  if (d.billing === "allowance") setAllowance((a) => (a ? { ...a, balance: bal } : a));
                  else setBalance(bal);
                }
                if (typeof d.unlimited === "boolean") setUnlimited(d.unlimited);
                void refreshChats();
                break;
              }
              case "error": {
                sawTerminal = true;
                const msg = (data as { message?: string }).message ?? failMsg;
                patch((m) => ({ ...m, content: msg, steps: undefined, recommendations: null }));
                break;
              }
              default:
                break; // status / keep-alive → ignore
            }
          }
        }

        // The stream closed without `done` or `error`: the server was cut off
        // mid-turn (function timeout, proxy drop). Without this the bubble sat
        // in "thinking" forever with no explanation.
        if (!sawTerminal) {
          patch((m) => ({
            ...m,
            content: m.content || dropMsg,
            steps: m.steps?.map((s) => (s.kind === "status" && !s.done ? { ...s, done: true } : s))
          }));
        }
      } catch {
        // The conversation was deleted mid-turn — its thread is gone, so there
        // is nothing to report into.
        if (controller.signal.aborted) return;
        // Network/transport error. Finish the streaming bubble in place when
        // there is one — appending a second bubble stranded the user's live
        // "thought process" above a message that looked unrelated to it.
        if (streamingId) {
          patch((m) => ({
            ...m,
            content: m.content || dropMsg,
            steps: m.steps?.map((s) => (s.kind === "status" && !s.done ? { ...s, done: true } : s))
          }));
        } else {
          appendTo(key, localMessage(failMsg));
        }
      } finally {
        markStreaming(key, false);
        if (controllersRef.current.get(key) === controller) controllersRef.current.delete(key);
        // Finished while the user was elsewhere — flag it in history so the
        // answer doesn't sit there unnoticed.
        if (!controller.signal.aborted && key !== NEW_CHAT_KEY && activeKeyRef.current !== key) {
          const finishedId = key;
          setUnseenChatIds((prev) => (prev.includes(finishedId) ? prev : [...prev, finishedId]));
        }
      }
    },
    [activeChatId, refreshChats, zhUI, failMsg, dropMsg, model, appendTo, patchThread, markStreaming]
  );

  return (
    <div className="slide-viewport-h flex overflow-hidden">
      <aside className="hidden w-72 shrink-0 border-r border-[rgb(var(--glass-stroke-soft)/0.4)] md:flex">
        <ChatSidebar
          chats={chats}
          activeChatId={activeChatId}
          streamingChatIds={streamingKeys}
          unseenChatIds={unseenChatIds}
          onSelect={handleSelect}
          onNewChat={handleNewChat}
          onRename={handleRename}
          onDelete={handleDelete}
          balance={balance}
          unlimited={unlimited}
          checkin={checkin}
          onClaimCheckin={handleClaimCheckin}
        />
      </aside>

      <ChatConversation
        messages={messages}
        loadingMessages={loadingMessages}
        sending={sending}
        atTurnLimit={atTurnLimit}
        balance={balance}
        creditsLoaded={creditsLoaded}
        unlimited={unlimited}
        checkin={checkin}
        allowance={allowance}
        tier={tier}
        model={model}
        onSelectModel={handleSelectModel}
        initialPrompt={initialPrompt}
        chats={chats}
        activeChatId={activeChatId}
        streamingChatIds={streamingKeys}
        unseenChatIds={unseenChatIds}
        activeTitle={chats.find((c) => c.id === activeChatId)?.title ?? null}
        onClaimCheckin={handleClaimCheckin}
        onSend={handleSend}
        onSelectChat={handleSelect}
        onNewChat={handleNewChat}
      />
    </div>
  );
}
