"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatSidebar } from "@/components/smart-picker/chat-sidebar";
import { ChatConversation } from "@/components/smart-picker/chat-conversation";
import type { AiChatMessage, AiChatSummary, RecommendationItem } from "@/lib/ai/types";
import type { CheckinStatus } from "@/lib/ai/checkin";

const INITIAL_CHECKIN: CheckinStatus = { canClaim: false, nextClaimAt: null, dailyAmount: 3 };

async function getJson(input: string, init?: RequestInit) {
  try {
    const res = await fetch(input, init);
    return await res.json();
  } catch {
    return null;
  }
}

export function SmartPickerClient() {
  const [chats, setChats] = useState<AiChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [balance, setBalance] = useState(0);
  const [checkin, setCheckin] = useState<CheckinStatus>(INITIAL_CHECKIN);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [unlimited, setUnlimited] = useState(false);

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
      }
    })();
  }, []);

  // Load messages whenever the active chat changes.
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    void (async () => {
      const res = await getJson(`/api/ai/chats/${activeChatId}/messages`);
      if (cancelled) return;
      if (res?.ok) setMessages(res.messages as AiChatMessage[]);
      setLoadingMessages(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeChatId]);

  const refreshChats = useCallback(async () => {
    const res = await getJson("/api/ai/chats");
    if (res?.ok) setChats(res.chats as AiChatSummary[]);
  }, []);

  const handleNewChat = useCallback(async () => {
    const res = await getJson("/api/ai/chats", { method: "POST" });
    if (res?.ok) {
      setChats((prev) => [res.chat as AiChatSummary, ...prev]);
      setMessages([]);
      setActiveChatId(res.chat.id);
    }
  }, []);

  const handleSelect = useCallback((id: string) => {
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

  const handleDelete = useCallback(async (id: string) => {
    const res = await getJson(`/api/ai/chats/${id}`, { method: "DELETE" });
    if (!res?.ok) return;
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      setActiveChatId((cur) => (cur === id ? next[0]?.id ?? null : cur));
      return next;
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
      if (sending) return;

      // Ensure there's a chat to post into.
      let chatId = activeChatId;
      if (!chatId) {
        const created = await getJson("/api/ai/chats", { method: "POST" });
        if (!created?.ok) return;
        chatId = created.chat.id as string;
        setChats((prev) => [created.chat as AiChatSummary, ...prev]);
        setMessages([]);
        setActiveChatId(chatId);
      }

      const tempUser: AiChatMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: message,
        recommendations: null,
        credits_charged: 0,
        created_at: new Date().toISOString()
      };
      setMessages((prev) => [...prev, tempUser]);
      setSending(true);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message, count })
        });

        // Pre-flight failures (auth, insufficient credits, provider not
        // configured…) come back as JSON, not a stream — branch on Content-Type.
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream") || !res.body) {
          const data = await res.json().catch(() => null);
          if (data?.ok && data.insufficient) {
            setBalance(data.balance);
            setMessages((prev) => [
              ...prev.filter((m) => m.id !== tempUser.id),
              {
                id: `err-${Date.now()}`,
                role: "assistant",
                content: `积分不足（当前余额 ${data.balance}）。每日签到可领取免费积分。`,
                recommendations: null,
                credits_charged: 0,
                created_at: new Date().toISOString()
              }
            ]);
            return;
          }
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: "assistant",
              content: data?.message ?? "请求失败，请稍后重试。",
              recommendations: null,
              credits_charged: 0,
              created_at: new Date().toISOString()
            }
          ]);
          return;
        }

        // Streaming path: one assistant message that fills in live — the AI's
        // prose and search activity arrive as `steps`, then the cards. The
        // bubble renders nothing until the first step, so an empty placeholder
        // is invisible (the typing dots cover the "thinking" gap).
        const assistantId = `stream-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            recommendations: null,
            credits_charged: 0,
            created_at: new Date().toISOString(),
            steps: []
          }
        ]);
        const patch = (updater: (m: AiChatMessage) => AiChatMessage) =>
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? updater(m) : m)));

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
                  const text = `🔍 正在联网搜索：${d.query ?? ""}`;
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
                          text: state === "ok" && resultCount ? `${s.text}（${resultCount} 条）` : s.text
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
                const d = data as {
                  assistantMessageId?: string;
                  content?: string;
                  createdAt?: string;
                  creditsCharged?: number;
                  balance?: number;
                  unlimited?: boolean;
                };
                patch((m) => ({
                  ...m,
                  id: d.assistantMessageId ?? m.id,
                  content: d.content ?? m.content,
                  credits_charged: d.creditsCharged ?? 0,
                  created_at: d.createdAt ?? m.created_at
                }));
                if (typeof d.balance === "number") setBalance(d.balance);
                if (typeof d.unlimited === "boolean") setUnlimited(d.unlimited);
                void refreshChats();
                break;
              }
              case "error": {
                const msg = (data as { message?: string }).message ?? "请求失败，请稍后重试。";
                patch((m) => ({ ...m, content: msg, steps: undefined, recommendations: null }));
                break;
              }
              default:
                break; // status / keep-alive → ignore
            }
          }
        }
      } catch {
        // Network/transport error — surface a transient error bubble.
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: "请求失败，请稍后重试。",
            recommendations: null,
            credits_charged: 0,
            created_at: new Date().toISOString()
          }
        ]);
      } finally {
        setSending(false);
      }
    },
    [activeChatId, refreshChats, sending]
  );

  return (
    <div className="slide-viewport-h flex overflow-hidden">
      <aside className="hidden w-72 shrink-0 border-r border-[rgb(var(--glass-stroke-soft)/0.4)] md:flex">
        <ChatSidebar
          chats={chats}
          activeChatId={activeChatId}
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
        balance={balance}
        unlimited={unlimited}
        checkin={checkin}
        chats={chats}
        activeChatId={activeChatId}
        activeTitle={chats.find((c) => c.id === activeChatId)?.title ?? null}
        onClaimCheckin={handleClaimCheckin}
        onSend={handleSend}
        onSelectChat={handleSelect}
        onNewChat={handleNewChat}
      />
    </div>
  );
}
