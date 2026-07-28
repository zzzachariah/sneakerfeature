"use client";

// The AI advisor chat (Max). A multi-turn conversation that remembers the
// member's persona + foot scan and streams prose replies, metered from the
// monthly allowance. Reuses the SSE contract shape of the Smart Picker but is a
// plain text conversation — no recommendation cards.
//
// The whole surface themes to the member's skin through --brand and the pui-*
// tokens; the per-variant masthead + bubble treatments (pui-adv--<variant>)
// give each of the four skins its own voice.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePremiumVariant } from "@/components/premium/variants";
import { PremiumMasthead } from "@/components/premium/page/premium-masthead";
import { useLocale } from "@/components/i18n/locale-provider";
import { AdvisorComposer } from "@/components/advisor/advisor-composer";
import { AdvisorMessageList, type AdvisorMessage } from "@/components/advisor/advisor-message-list";
import { AdvisorHistory, type AdvisorChatSummary } from "@/components/advisor/advisor-history";
import { AllowanceMeter } from "@/components/smart-picker/allowance-meter";
import { haptics } from "@/lib/native/haptics";

let idSeq = 0;
const nextId = () => `local-${Date.now()}-${idSeq++}`;

export function AdvisorClient({ initialPrompt }: { initialPrompt?: string }) {
  const { translate } = useLocale();
  const variant = usePremiumVariant();

  const [chats, setChats] = useState<AdvisorChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdvisorMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [allowance, setAllowance] = useState<{ balance: number; grant: number } | null>(null);
  const [insufficient, setInsufficient] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipLoadRef = useRef<string | null>(null);

  // Initial load: chat list + allowance.
  useEffect(() => {
    fetch("/api/ai/advisor/chats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && Array.isArray(d.chats)) setChats(d.chats);
      })
      .catch(() => {});
    fetch("/api/ai/credits", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d.allowance) setAllowance(d.allowance);
      })
      .catch(() => {});
  }, []);

  // Load a chat's messages when the active chat changes (skip the one we just
  // created locally to avoid clobbering the optimistic first turn).
  useEffect(() => {
    if (!chatId) return;
    if (skipLoadRef.current === chatId) {
      skipLoadRef.current = null;
      return;
    }
    fetch(`/api/ai/advisor/chats/${chatId}/messages`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && Array.isArray(d.messages)) {
          setMessages(
            d.messages.map((m: { id: string; role: string; content: string }) => ({
              id: m.id,
              role: m.role === "user" ? "user" : "assistant",
              content: m.content
            }))
          );
        }
      })
      .catch(() => {});
  }, [chatId]);

  const startNewChat = useCallback(() => {
    haptics.selection();
    setChatId(null);
    setMessages([]);
    setError(null);
    setInsufficient(false);
  }, []);

  const selectChat = useCallback((id: string) => {
    haptics.selection();
    setChatId(id);
    setError(null);
    setInsufficient(false);
  }, []);

  const deleteChat = useCallback(
    async (id: string) => {
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (chatId === id) startNewChat();
      await fetch(`/api/ai/advisor/chats/${id}`, { method: "DELETE" }).catch(() => {});
    },
    [chatId, startNewChat]
  );

  const send = useCallback(
    async (text: string) => {
      if (streaming) return;
      setError(null);
      setInsufficient(false);

      // Ensure a chat exists.
      let activeChatId = chatId;
      if (!activeChatId) {
        try {
          const res = await fetch("/api/ai/advisor/chats", { method: "POST" });
          const data = await res.json();
          if (!data?.ok || !data.chat?.id) {
            setError(translate("Couldn't start a conversation. Please try again."));
            return;
          }
          activeChatId = data.chat.id as string;
          skipLoadRef.current = activeChatId;
          setChatId(activeChatId);
          setChats((prev) => [data.chat, ...prev]);
        } catch {
          setError(translate("Couldn't start a conversation. Please try again."));
          return;
        }
      }

      const userMsg: AdvisorMessage = { id: nextId(), role: "user", content: text };
      const assistantId = nextId();
      setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "", streaming: true }]);
      setStreaming(true);
      haptics.tap();

      try {
        const res = await fetch("/api/ai/advisor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: activeChatId, message: text })
        });

        // Pre-flight failures stay JSON (locked / insufficient / errors).
        const contentType = res.headers.get("Content-Type") ?? "";
        if (!contentType.includes("text/event-stream")) {
          const data = await res.json().catch(() => null);
          if (data?.insufficient) {
            setInsufficient(true);
            setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id));
          } else {
            setError(data?.message ?? translate("Something went wrong. Please try again."));
            setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          }
          setStreaming(false);
          return;
        }

        // Parse the SSE stream: `delta` appends text, `done` finalizes, `error`
        // replaces the bubble.
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let streamErr = false;
        // Whether the server ever sent a terminal frame. A stream that just
        // stops (function timeout, proxy drop) otherwise left the bubble stuck
        // mid-answer with a blinking caret and no explanation.
        let sawTerminal = false;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const lines = frame.split("\n");
            const evLine = lines.find((l) => l.startsWith("event:"));
            const dataLine = lines.find((l) => l.startsWith("data:"));
            if (!evLine || !dataLine) continue;
            const event = evLine.slice(6).trim();
            let payload: Record<string, unknown> = {};
            try {
              payload = JSON.parse(dataLine.slice(5).trim());
            } catch {
              continue;
            }
            if (event === "delta") {
              const chunk = String(payload.text ?? "");
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m))
              );
            } else if (event === "done") {
              sawTerminal = true;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { id: String(payload.assistantMessageId ?? assistantId), role: "assistant", content: String(payload.content ?? m.content) }
                    : m
                )
              );
              if (typeof payload.balance === "number" && !payload.unlimited) {
                setAllowance((prev) => (prev ? { ...prev, balance: payload.balance as number } : prev));
              }
              if (payload.title) {
                setChats((prev) =>
                  prev.map((c) => (c.id === activeChatId ? { ...c, title: String(payload.title) } : c))
                );
              }
              haptics.success();
            } else if (event === "error") {
              streamErr = true;
              sawTerminal = true;
              setError(String(payload.message ?? translate("Something went wrong.")));
              setMessages((prev) => prev.filter((m) => m.id !== assistantId));
              haptics.error();
            }
          }
        }
        if (streamErr) {
          /* already handled */
        } else if (!sawTerminal) {
          // Cut off mid-answer: keep whatever was streamed (it's real advice)
          // and say the connection dropped, instead of leaving a caret blinking.
          setError(translate("Connection lost. Please try again."));
          setMessages((prev) =>
            prev.flatMap((m) =>
              m.id !== assistantId ? [m] : m.content.trim() ? [{ ...m, streaming: false }] : []
            )
          );
        }
      } catch {
        setError(translate("Connection lost. Please try again."));
        // Keep a partial answer rather than deleting the turn outright.
        setMessages((prev) =>
          prev.flatMap((m) => (m.id !== assistantId ? [m] : m.content.trim() ? [{ ...m, streaming: false }] : []))
        );
      } finally {
        setStreaming(false);
      }
    },
    [chatId, streaming, translate]
  );

  return (
    <main className={`container-shell has-mobile-nav-pad flex min-h-[calc(100dvh-var(--top-nav-h))] flex-col py-6 md:py-8 pui-adv pui-adv--${variant}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        {variant === "standard" ? (
          <div>
            <p className="t-eyebrow mb-1.5 inline-flex items-center gap-2">
              {translate("AI Advisor")}
              <span
                className="rounded-full px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide"
                style={{ color: "#1a1305", background: "linear-gradient(135deg, #ffe38a, #c99a2a)" }}
              >
                Max
              </span>
            </p>
            <h1 className="t-display-sm" style={{ fontSize: "clamp(1.5rem, 3.4vw, 2.2rem)" }}>
              {translate("Your sneaker concierge")}
            </h1>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <PremiumMasthead
              variant={variant}
              kicker={translate("AI Advisor")}
              title={translate("Your sneaker concierge")}
              meta="Max"
            />
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2">
          {allowance ? <AllowanceMeter balance={allowance.balance} grant={allowance.grant} /> : null}
          <AdvisorHistory
            chats={chats}
            activeId={chatId}
            onSelect={selectChat}
            onNew={startNewChat}
            onDelete={deleteChat}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <AdvisorMessageList messages={messages} variant={variant} onSuggestion={send} />
        <AdvisorComposer
          onSend={send}
          disabled={streaming}
          insufficient={insufficient}
          error={error}
          initialValue={initialPrompt}
        />
      </div>
    </main>
  );
}
