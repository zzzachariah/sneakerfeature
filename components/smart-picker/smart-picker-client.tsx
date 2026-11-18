"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatConversation } from "@/components/smart-picker/chat-conversation";
import { conversationHistory, conversationMessages, conversationPath, sortConversations, type PickerMode } from "@/lib/ai/conversation-mode";
import { MAX_CONCURRENT_TURNS, type AiChatMessage, type AiChatSummary, type RecommendationItem } from "@/lib/ai/types";
import type { AiClarification, ClarificationAnswers } from "@/lib/ai/clarification";
import type { CheckinStatus } from "@/lib/ai/checkin";
import { useLocale } from "@/components/i18n/locale-provider";
import { isModelId, type ModelId, type Tier } from "@/lib/subscription/tiers";
import { endPickerActivity, startPickerActivity } from "@/lib/native/live-widgets";
import { readWidgetPrefs } from "@/lib/native/widget-prefs";
import { randomId } from "@/lib/utils";

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
    case "clarifying":
      return "Preparing a few follow-up questions…";
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

export function SmartPickerClient({ initialPrompt, initialMode = "find" }: { initialPrompt?: string; initialMode?: PickerMode }) {
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
  const [chatsLoading, setChatsLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState<PickerMode>(initialMode);
  const modesRef = useRef(new Map<string, PickerMode>());
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [historyLoadVersion, setHistoryLoadVersion] = useState(0);
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
  const [creditsError, setCreditsError] = useState(false);
  const onboardingReady = creditsLoaded && !chatsLoading && !historyError;
  const [checkin, setCheckin] = useState<CheckinStatus>(INITIAL_CHECKIN);
  const [allowance, setAllowance] = useState<{ balance: number; grant: number } | null>(null);
  // Membership tier + the model the picker currently targets. Loaded with the
  // credits payload; selection is optimistic and persists via member prefs so
  // it follows the account across devices.
  const [tier, setTier] = useState<Tier>("free");
  const [model, setModel] = useState<ModelId | null>(null);
  const [unlimited, setUnlimited] = useState(false);
  const [chatUnlimited, setChatUnlimited] = useState(false);

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
  const mode = activeChatId ? modesRef.current.get(activeChatId) ?? "find" : draftMode;
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

  // --- Dynamic Island: "picking your shoes…" ---------------------------------
  //
  // A good answer takes a while, and the whole point of the picker is that you
  // can go do something else. The Live Activity is what makes that safe: the
  // progress leaves the app with you, and a tap brings you back.
  //
  // Driven off "is ANY turn streaming" rather than off markStreaming itself.
  // markStreaming also fires when a turn's key is renamed from NEW_CHAT_KEY to
  // its real chat id mid-stream, and hooking that directly would tear the
  // activity down and build a new one in the middle of a single answer.
  const pickerActivityRef = useRef<string | null>(null);
  const lastPromptRef = useRef("");
  const anyStreaming = streamingKeys.some(key => (modesRef.current.get(key) ?? "find") === "find");

  useEffect(() => {
    if (anyStreaming) {
      if (pickerActivityRef.current) return;
      if (!readWidgetPrefs().pickerActivity) return;
      const id = randomId("picker");
      pickerActivityRef.current = id;
      void startPickerActivity({ id, prompt: lastPromptRef.current, path: "/smart-picker" });
      return;
    }
    const id = pickerActivityRef.current;
    if (!id) return;
    pickerActivityRef.current = null;
    void endPickerActivity({ id, summary: zhUI ? "选鞋结果已就绪" : "Your picks are ready" });
  }, [anyStreaming, zhUI]);

  // Leaving the picker kills the streams that fed the activity, so the activity
  // has to go with them — otherwise it sits in the Island claiming to be
  // thinking until ActivityKit times it out hours later.
  useEffect(() => {
    return () => {
      const id = pickerActivityRef.current;
      if (!id) return;
      pickerActivityRef.current = null;
      void endPickerActivity({ id, summary: "", failed: true });
    };
  }, []);

  const patchThread = useCallback((key: string, updater: (list: AiChatMessage[]) => AiChatMessage[]) => {
    setThreads((prev) => ({ ...prev, [key]: updater(prev[key] ?? EMPTY_THREAD) }));
  }, []);

  const appendTo = useCallback(
    (key: string, message: AiChatMessage) => patchThread(key, (list) => [...list, message]),
    [patchThread]
  );

  const refreshChats = useCallback(async () => {
    const [findRes, chatRes] = await Promise.all([getJson("/api/ai/chats"), getJson("/api/ai/advisor/chats")]);
    const chatAvailable = chatRes?.ok || chatRes?.code === "locked";
    setChats(previous => {
      const findRows = findRes?.ok ? conversationHistory(findRes.chats, "find") : previous.filter(row => row.mode !== "chat");
      const chatRows = chatRes?.ok ? conversationHistory(chatRes.chats, "chat") : previous.filter(row => row.mode === "chat");
      const remote = [...findRows, ...chatRows];
      const pending = previous.filter(row => streamsRef.current.has(row.id) && !remote.some(item => item.id === row.id));
      const combined = sortConversations([...remote, ...pending]);
      for (const row of combined) modesRef.current.set(row.id, row.mode ?? "find");
      return combined;
    });
    setHistoryError(findRes?.ok && chatAvailable ? null : "history");
    setChatsLoading(false);
    return Boolean(findRes?.ok && chatAvailable);
  }, []);

  const refreshCredits = useCallback(async () => {
    setCreditsError(false);
    const creditsRes = await getJson("/api/ai/credits");
    if (!creditsRes?.ok) { setCreditsError(true); return; }
    setBalance(creditsRes.balance);
    setUnlimited(Boolean(creditsRes.unlimited));
    setChatUnlimited(Boolean(creditsRes.chatUnlimited));
    if (creditsRes.checkin) setCheckin(creditsRes.checkin as CheckinStatus);
    setAllowance((creditsRes.allowance as { balance: number; grant: number } | null) ?? null);
    if (creditsRes.tier === "free" || creditsRes.tier === "pro" || creditsRes.tier === "max") setTier(creditsRes.tier);
    if (isModelId(creditsRes.model)) setModel(creditsRes.model);
    setCreditsLoaded(true);
  }, []);

  // Load independent account reads together; a failed read remains retryable.
  // Start a fresh conversation rather than opening the most recent one.
  useEffect(() => { void Promise.all([refreshChats(), refreshCredits()]); }, [refreshChats, refreshCredits]);

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
    setLoadingKeys((prev) => prev.includes(id) ? prev : [...prev, id]);
    void (async () => {
      const threadMode = modesRef.current.get(id) ?? "find";
      const res = await getJson(`${conversationPath(threadMode)}/${id}/messages`);
      setLoadingKeys((prev) => prev.filter((k) => k !== id));
      if (!res?.ok) {
        loadedRef.current.delete(id);
        patchThread(id, () => [localMessage(zhUI ? "对话加载失败，请从历史记录中重新打开。" : "Could not load this conversation. Open it again from history to retry.")]);
        return;
      }
      const fetched = conversationMessages(res.messages, threadMode);
      // Merge rather than replace: a turn sent while this GET was in flight
      // only exists locally, and dropping it is what made a just-sent message
      // vanish. Local ids (temp-/stream-/local-) never collide with saved ones.
      setThreads((prev) => {
        const local = prev[id] ?? EMPTY_THREAD;
        const pending = local.filter((m) => !fetched.some((f) => f.id === m.id));
        return { ...prev, [id]: [...fetched, ...pending] };
      });
    })();
  }, [activeChatId, historyLoadVersion, patchThread, zhUI]);

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
    setDraftMode(modesRef.current.get(id) ?? "find");
    if (!loadedRef.current.has(id)) {
      patchThread(id, () => EMPTY_THREAD);
      setLoadingKeys(previous => previous.includes(id) ? previous : [...previous, id]);
      setHistoryLoadVersion(previous => previous + 1);
    }
    setActiveChatId(id);
  }, [patchThread]);

  const handleRename = useCallback(async (id: string, title: string) => {
    const result = await getJson(`${conversationPath(modesRef.current.get(id) ?? "find")}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
    if (!result?.ok) throw new Error(result?.message ?? failMsg);
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }, [failMsg]);

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await getJson(`${conversationPath(modesRef.current.get(id) ?? "find")}/${id}`, { method: "DELETE" });
      if (!res?.ok) throw new Error(res?.message ?? failMsg);
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
        return next;
      });
      if (activeKeyRef.current === id) handleNewChat();
    },
    [markStreaming, handleNewChat, failMsg]
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
    async (message: string, count: number, request?: { clarification?: { id: string; answers: ClarificationAnswers }; model?: string; retryMessageId?: string }) => {
      // The guard is per-conversation: only a turn already running in THIS
      // conversation blocks a send. Another chat generating does not.
      let key = activeChatId ?? NEW_CHAT_KEY;
      const requestMode = mode;
      if (requestMode === "chat" && tier !== "max") return;
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
      const tempId = `temp-${Date.now()}`;
      const tempUser: AiChatMessage = {
        id: tempId,
        clientKey: tempId,
        role: "user",
        content: message,
        recommendations: null,
        credits_charged: 0,
        created_at: new Date().toISOString()
      };
      const preparingQuestions = requestMode === "find" && !request?.clarification && !(threads[key] ?? []).some(item => item.recommendations?.length);
      if (!request?.retryMessageId) appendTo(key, tempUser);
      if (request?.clarification) patchThread(key, list => list.map(item => item.clarification?.id === request.clarification!.id ? { ...item, clarification: { ...item.clarification, status: "answering", answers: request.clarification!.answers } } : item));
      // What the Dynamic Island shows while this turn runs.
      lastPromptRef.current = message;
      modesRef.current.set(key, requestMode);
      markStreaming(key, true);

      const controller = new AbortController();
      controllersRef.current.set(key, controller);

      // Id of the streaming assistant bubble, and whether the server ever sent a
      // terminal frame. Hoisted so the error paths below can finish THAT bubble
      // instead of appending a second, context-free one.
      let streamingId: string | null = null;
      let sawTerminal = false;
      let answerSucceeded = false;
      let needsRecovery = false;

      // Every write targets `key`, which follows the turn (not the view) — the
      // user can switch conversations mid-stream and the turn keeps filling in
      // its own thread.
      const patch = (updater: (m: AiChatMessage) => AiChatMessage) => {
        const id = streamingId;
        if (!id) return;
        patchThread(key, (list) => list.map((m) => (m.id === id ? updater(m) : m)));
      };
      // Coalesce token deltas so Chat does not re-render its entire layout for
      // every tiny provider chunk. Status/terminal events remain immediate.
      let pendingAdvice = "";
      let adviceTimer: ReturnType<typeof setTimeout> | null = null;
      const flushAdvice = () => {
        if (adviceTimer) clearTimeout(adviceTimer);
        adviceTimer = null;
        const delta = pendingAdvice;
        pendingAdvice = "";
        if (delta) patch(m => ({ ...m, content: m.content + delta }));
      };

      try {
        // Ensure there's a chat to post into.
        let chatId = activeChatId;
        if (!chatId) {
          const created = await getJson(conversationPath(requestMode), { method: "POST" });
          if (!created?.ok) {
            patchThread(NEW_CHAT_KEY, (list) => [
              ...list.filter((m) => m.id !== tempUser.id),
              localMessage(failMsg)
            ]);
            return;
          }
          const newId = created.chat.id as string;
          modesRef.current.set(newId, requestMode);
          setChats((prev) => [{ ...created.chat as AiChatSummary, mode: requestMode }, ...prev]);
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

        const res = await fetch(requestMode === "chat" ? "/api/ai/advisor" : "/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ chatId, message, ...(requestMode === "find" ? { count } : {}), ...((request?.model ?? model) ? { model: request?.model ?? model } : {}), ...(request?.clarification ? { clarification: request.clarification } : {}) }),
          signal: controller.signal
        });

        // Pre-flight failures (auth, insufficient credits, provider not
        // configured…) come back as JSON, not a stream — branch on Content-Type.
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream") || !res.body) {
          const data = await res.json().catch(() => null);
          if (data?.ok && data.clarification && data.assistantMessage) {
            sawTerminal = true;
            const saved = ([data.userMessage, data.assistantMessage].filter(Boolean) as AiChatMessage[]).map(item => item.role === "user" && item.content === tempUser.content ? { ...item, clientKey: tempUser.clientKey } : item);
            patchThread(key, list => {
              const next = list.filter(item => item.id !== tempUser.id);
              for (const item of saved) { const index = next.findIndex(existing => existing.id === item.id); if (index >= 0) next[index] = item; else next.push(item); }
              return next;
            });
            if (data.assistantMessage.clarification?.status === "complete") {
              const history = await getJson(`/api/ai/chats/${key}/messages`);
              if (history?.ok) patchThread(key, () => history.messages as AiChatMessage[]);
            }
            void refreshChats();
            return;
          }
          needsRecovery = Boolean(request?.clarification || preparingQuestions);
          if (data?.ok && data.insufficient) {
            if (requestMode === "chat") setAllowance(previous => previous ? { ...previous, balance: data.balance } : previous);
            else setBalance(data.balance);
            patchThread(key, (list) => [
              ...list.filter((m) => m.id !== tempUser.id),
              localMessage(
                requestMode === "chat" ? (zhUI ? "本月 Chat 额度不足。查看用量后再继续。" : "Your Chat allowance is used up. View usage for details.") : zhUI
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
          clientKey: assistantId,
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
              case "delta": {
                const delta = (data as { text?: string }).text;
                if (delta) {
                  pendingAdvice += delta;
                  if (!adviceTimer) adviceTimer = setTimeout(flushAdvice, 40);
                }
                break;
              }
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
                flushAdvice();
                sawTerminal = true;
                answerSucceeded = true;
                if (request?.clarification) patchThread(key, list => list.map(item => item.clarification?.id === request.clarification!.id ? { ...item, clarification: { ...item.clarification, status: "complete", answers: request.clarification!.answers } } : item));
                const d = data as {
                  assistantMessageId?: string;
                  content?: string;
                  followUp?: string;
                  createdAt?: string;
                  creditsCharged?: number;
                  balance?: number;
                  unlimited?: boolean;
                  billing?: string;
                  userMessageId?: string;
                  title?: string | null;
                };
                patch((m) => ({
                  ...m,
                  id: d.assistantMessageId ?? m.id,
                  content: d.content ?? m.content,
                  followUp: d.followUp?.trim() ? d.followUp : null,
                  billing:
                    d.billing === "credits" || d.billing === "allowance" || d.billing === "unlimited"
                      ? d.billing
                      : undefined,
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
                if (requestMode === "find" && typeof d.unlimited === "boolean") setUnlimited(d.unlimited);
                if (requestMode === "chat" && d.userMessageId) {
                  patchThread(key, list => list.map(item => item.id === tempUser.id ? { ...item, id: d.userMessageId! } : item));
                }
                if (d.title) setChats(previous => previous.map(chat => chat.id === key ? { ...chat, title: d.title! } : chat));
                void refreshChats();
                break;
              }
              case "error": {
                flushAdvice();
                sawTerminal = true;
                needsRecovery = Boolean(request?.clarification);
                const msg = (data as { message?: string }).message ?? failMsg;
                patch((m) => ({ ...m, content: requestMode === "chat" && m.content ? `${m.content}\n\n${msg}` : msg, steps: undefined, recommendations: null }));
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
          flushAdvice();
          needsRecovery = Boolean(request?.clarification || preparingQuestions);
          patch((m) => ({
            ...m,
            content: m.content || dropMsg,
            steps: m.steps?.map((s) => (s.kind === "status" && !s.done ? { ...s, done: true } : s))
          }));
        }
      } catch {
        flushAdvice();
        // The conversation was deleted mid-turn — its thread is gone, so there
        // is nothing to report into.
        if (controller.signal.aborted) return;
        needsRecovery = Boolean(request?.clarification || preparingQuestions);
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
        flushAdvice();
        if (needsRecovery && !answerSucceeded && !controller.signal.aborted && key !== NEW_CHAT_KEY) {
          const recovered = await getJson(`/api/ai/chats/${key}/messages`);
          if (recovered?.ok) patchThread(key, list => {
            const notices = list.filter(item => item.id.startsWith("local-") || (item.id === streamingId && Boolean(item.content)));
            return [...recovered.messages as AiChatMessage[], ...notices];
          });
          else if (request?.retryMessageId) patchThread(key, list => list.map(item => item.clarification && item.clarification.id === request.retryMessageId ? { ...item, clarification: { ...item.clarification, status: "failed" } } : item));
        }
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
    [activeChatId, refreshChats, zhUI, failMsg, dropMsg, model, mode, tier, appendTo, patchThread, markStreaming, threads]
  );

  // Restore a question or recommendation run after a reload or dropped stream.
  // A live local stream remains authoritative; history polling never overwrites it.
  const waitingOnServer = messages.some(item => item.clarification?.status === "generating" || item.clarification?.status === "answering");
  useEffect(() => {
    if (!activeChatId || sending || !waitingOnServer) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      if (streamsRef.current.has(activeChatId)) return;
      const res = await getJson(`/api/ai/chats/${activeChatId}/messages`);
      if (!stopped && res?.ok && !streamsRef.current.has(activeChatId)) patchThread(activeChatId, () => res.messages as AiChatMessage[]);
    }, 2500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [activeChatId, sending, waitingOnServer, patchThread]);

  const handleClarification = useCallback((value: AiClarification, answers: ClarificationAnswers) => {
    const lang = /[㐀-鿿]/.test(value.originalMessage) ? "zh" : "en";
    const summary = value.questions.map(question => `${question.prompt[lang]} ${question.options.find(option => option.value === answers.choices[question.id])?.label[lang] ?? ""}`).join("\n");
    const content = `${summary}${answers.note ? `\n\n${lang === "zh" ? "补充：" : "Additional context: "}${answers.note}` : ""}`;
    void handleSend(content, value.count, { clarification: { id: value.id, answers }, model: value.model });
  }, [handleSend]);
  const retryClarification = useCallback((value: AiClarification) => {
    patchThread(activeChatId ?? NEW_CHAT_KEY, list => list.map(item => item.clarification?.id === value.id ? { ...item, clarification: { ...item.clarification, status: "generating" } } : item));
    void handleSend(value.originalMessage, value.count, { model: value.model, retryMessageId: value.id });
  }, [handleSend, activeChatId, patchThread]);

  return (
    <div className="slide-viewport-h flex flex-col overflow-hidden">
      {creditsError && <div role="alert" className="px-6 py-3 text-center text-sm soft-text">
        {zhUI ? "用量暂时无法加载。" : "Your allowance could not be loaded."}{" "}
        <button type="button" className="underline underline-offset-4" onClick={() => void refreshCredits()}>{zhUI ? "重试" : "Retry"}</button>
      </div>}
      <ChatConversation
        mode={mode}
        onModeChange={next => { if (!activeChatId && messages.length === 0 && !sending) setDraftMode(next); }}
        modeLocked={Boolean(activeChatId || messages.length || sending || loadingMessages)}
        canChat={tier === "max"}
        chatUnlimited={chatUnlimited}
        chatsLoading={chatsLoading}
        historyError={historyError ? (zhUI ? "历史记录暂时无法完整加载，请重试。" : "Some conversations could not be loaded. Please retry.") : null}
        onRetryHistory={() => { setChatsLoading(true); void refreshChats(); }}
        onRenameChat={handleRename}
        onDeleteChat={handleDelete}
        messages={messages}
        loadingMessages={loadingMessages}
        sending={sending}
        atTurnLimit={atTurnLimit}
        balance={balance}
        creditsLoaded={creditsLoaded}
        onboardingReady={onboardingReady}
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
        onSend={(text, count) => { void handleSend(text, count); }}
        onClarification={handleClarification}
        onRetryClarification={retryClarification}
        onSelectChat={handleSelect}
        onNewChat={handleNewChat}
      />
    </div>
  );
}
