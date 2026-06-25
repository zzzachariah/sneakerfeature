"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Download, History, Plus, Sparkles, Wallet } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { DUR, EASE } from "@/lib/motion/constants";
import { CardPreviewModal } from "@/components/card/card-preview-modal";
import { MessageInput } from "@/components/smart-picker/message-input";
import { RecommendationGroup } from "@/components/smart-picker/recommendation-group";
import { ThinkingPanel } from "@/components/smart-picker/thinking-panel";
import { CheckinBadge } from "@/components/smart-picker/checkin-badge";
import { SneakerLoader } from "@/components/ui/sneaker-loader";
import type { AiChatMessage, AiChatSummary, RecommendationItem } from "@/lib/ai/types";
import type { CheckinStatus } from "@/lib/ai/checkin";

type Props = {
  messages: AiChatMessage[];
  loadingMessages: boolean;
  sending: boolean;
  balance: number;
  creditsLoaded: boolean;
  unlimited: boolean;
  checkin: CheckinStatus;
  chats: AiChatSummary[];
  activeChatId: string | null;
  activeTitle: string | null;
  onClaimCheckin: () => Promise<void>;
  onSend: (message: string, count: number) => void;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
};

export function ChatConversation({
  messages,
  loadingMessages,
  sending,
  balance,
  creditsLoaded,
  unlimited,
  checkin,
  chats,
  activeChatId,
  activeTitle,
  onClaimCheckin,
  onSend,
  onSelectChat,
  onNewChat
}: Props) {
  const { translate } = useLocale();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [report, setReport] = useState<{ requestText: string; summary: string; recs: RecommendationItem[] } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // Close the mobile history popover on outside click / Escape.
  useEffect(() => {
    if (!historyOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (historyRef.current?.contains(e.target as Node)) return;
      setHistoryOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHistoryOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [historyOpen]);

  const isEmpty = !loadingMessages && messages.length === 0;
  const headerTitle = activeTitle?.trim() || translate("Smart Picker");
  const lastMessage = messages[messages.length - 1];
  const reduce = useReducedMotion();
  // Bubble entrance — plays once on mount (keyed by message id), so it doesn't
  // replay while the assistant turn streams its content in.
  const bubbleIn = (x: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 6, x },
          animate: { opacity: 1, y: 0, x: 0 },
          transition: { duration: DUR.slow, ease: EASE }
        };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Mobile header */}
      <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--glass-stroke-soft)/0.4)] px-[var(--container-gutter)] py-2 md:hidden">
        {/* Conversation history — anchored dropdown popover (not a full-screen takeover). */}
        <div ref={historyRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setHistoryOpen((prev) => !prev)}
            aria-label={translate("Conversations")}
            aria-haspopup="menu"
            aria-expanded={historyOpen}
            className="tap-44 relative inline-flex h-9 items-center gap-1 rounded-full px-2 transition-colors hover:bg-[rgb(var(--text)/0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)]"
          >
            <History className="h-5 w-5" />
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
          </button>
          {historyOpen && (
            <ConversationHistoryPopover
              chats={chats}
              activeChatId={activeChatId}
              onSelect={(id) => {
                onSelectChat(id);
                setHistoryOpen(false);
              }}
              onNewChat={() => {
                onNewChat();
                setHistoryOpen(false);
              }}
            />
          )}
        </div>
        <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold tracking-[-0.01em]">{headerTitle}</h1>
        <div className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.55)] px-3 text-[0.78rem] font-medium">
          <Wallet className="h-3.5 w-3.5" />
          {creditsLoaded ? (
            <>{unlimited ? "∞" : balance} {translate("credits")}</>
          ) : (
            <span aria-hidden className="skeleton inline-block h-3.5 w-12" />
          )}
          {creditsLoaded && (
            <CheckinBadge canClaim={checkin.canClaim} dailyAmount={checkin.dailyAmount} onClaim={onClaimCheckin} />
          )}
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden items-center justify-between gap-3 border-b border-[rgb(var(--glass-stroke-soft)/0.4)] px-[var(--container-gutter)] py-3 md:flex">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[rgb(var(--text)/0.14)] to-[rgb(var(--text)/0.02)]">
            <Sparkles className="h-4 w-4 text-[rgb(var(--subtext))]" />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-sm font-semibold tracking-[-0.01em]">{headerTitle}</h1>
            <p className="truncate text-[0.7rem] soft-text">{translate("AI shoe recommendations from our database")}</p>
          </div>
        </div>
        <div className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.55)] px-3 text-[0.78rem] font-medium">
          <Wallet className="h-3.5 w-3.5" />
          {creditsLoaded ? (
            <>{unlimited ? "∞" : balance} {translate("credits")}</>
          ) : (
            <span aria-hidden className="skeleton inline-block h-3.5 w-12" />
          )}
          {creditsLoaded && (
            <CheckinBadge canClaim={checkin.canClaim} dailyAmount={checkin.dailyAmount} onClaim={onClaimCheckin} />
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-[var(--container-gutter)] py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {/* Loading a past conversation from history — animated spinner while it fetches. */}
          {loadingMessages && (
            <div className="mt-16 flex justify-center" aria-live="polite" aria-busy="true">
              <SneakerLoader label={translate("Loading...")} />
            </div>
          )}

          {isEmpty && (
            <div className="mt-10 flex flex-col items-center gap-3 text-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[rgb(var(--text)/0.14)] to-[rgb(var(--text)/0.02)] shadow-[0_8px_24px_rgb(var(--glass-shadow)/0.18)]">
                <Sparkles className="h-7 w-7 text-[rgb(var(--text))]" />
              </span>
              <h2 className="text-lg font-semibold">{translate("Find your next pair")}</h2>
              <p className="max-w-md text-sm soft-text">
                {translate("Tell me your playstyle, position, and the feel you want — I'll recommend shoes from our database.")}
              </p>
              <p className="max-w-md rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--surface)/0.6)] p-3 text-[0.78rem] leading-relaxed soft-text">
                {translate("1 credit = 1 recommended shoe. Asking AI for 10 shoes at once costs 10 credits. Please choose the number before sending.")}
              </p>
            </div>
          )}

          {!loadingMessages && messages.map((message, idx) => {
            if (message.role === "user") {
              return (
                <div key={message.id} className="flex justify-end">
                  <motion.div
                    {...bubbleIn(12)}
                    className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[rgb(var(--text))] px-3.5 py-2 text-sm text-[rgb(var(--bg))]"
                  >
                    {message.content}
                  </motion.div>
                </div>
              );
            }

            // The streaming turn is always the last message while `sending`.
            const active = sending && idx === messages.length - 1;
            // Show the reasoning timeline when there are steps, or keep an animated
            // placeholder alive while this turn is still streaming.
            const showThinking = (message.steps?.length ?? 0) > 0 || active;

            return (
              <div key={message.id} className="flex flex-col gap-2.5">
                {showThinking && <ThinkingPanel steps={message.steps ?? []} active={active} />}

                {/* The clean answer. Code/JSON the relay sometimes emits is filtered
                    server-side, so it never reaches this bubble or the timeline. */}
                {message.content && (
                  <motion.div
                    {...bubbleIn(-12)}
                    className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-[rgb(var(--surface)/0.85)] px-3.5 py-2 text-sm"
                  >
                    {message.content}
                  </motion.div>
                )}

                {message.recommendations && message.recommendations.length > 0 && (
                  <>
                    <RecommendationGroup recommendations={message.recommendations} />
                    <button
                      type="button"
                      onClick={() =>
                        setReport({
                          requestText: idx > 0 && messages[idx - 1].role === "user" ? messages[idx - 1].content : "",
                          summary: message.content,
                          recs: message.recommendations ?? []
                        })
                      }
                      className="relative tap-44 inline-flex h-8 self-start items-center gap-1.5 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.55)] px-3 text-[0.78rem] font-medium transition hover:bg-[rgb(var(--text)/0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {translate("Download report")}
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {/* Sending has begun but the streaming assistant bubble hasn't been
              inserted yet — keep the thinking animation visible without a gap. */}
          {sending && lastMessage?.role !== "assistant" && <ThinkingPanel steps={[]} active />}
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl">
        <MessageInput balance={balance} unlimited={unlimited} sending={sending} onSend={onSend} />
      </div>

      <CardPreviewModal
        open={!!report}
        onClose={() => setReport(null)}
        mode={report ? { kind: "report", requestText: report.requestText, summary: report.summary, recommendations: report.recs } : null}
      />
    </div>
  );
}

function historyGroupKey(iso: string): "today" | "yesterday" | "earlier" {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return "today";
  if (t >= startOfToday - 86_400_000) return "yesterday";
  return "earlier";
}

const HISTORY_GROUP_LABEL: Record<"today" | "yesterday" | "earlier", string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier"
};

/**
 * Compact, anchored dropdown listing past conversations. Replaces the previous
 * full-screen sidebar takeover on mobile — tapping the history button now opens
 * this popover instead of covering the whole interface.
 */
function ConversationHistoryPopover({
  chats,
  activeChatId,
  onSelect,
  onNewChat
}: {
  chats: AiChatSummary[];
  activeChatId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}) {
  const { translate } = useLocale();
  const groups: { key: "today" | "yesterday" | "earlier"; chats: AiChatSummary[] }[] = [];
  for (const key of ["today", "yesterday", "earlier"] as const) {
    const list = chats.filter((c) => historyGroupKey(c.updated_at) === key);
    if (list.length) groups.push({ key, chats: list });
  }

  return (
    <div className="nav-dropdown-panel absolute left-0 top-[calc(100%+0.4rem)] z-50 max-h-[70vh] w-[16rem] overflow-y-auto rounded-xl p-1">
      <button
        type="button"
        onClick={onNewChat}
        className="mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition hover:bg-[rgb(var(--text)/0.06)]"
      >
        <Plus className="h-4 w-4 shrink-0" />
        {translate("New chat")}
      </button>

      {groups.length === 0 && (
        <p className="px-2.5 py-4 text-center text-[0.78rem] soft-text">{translate("No conversations yet.")}</p>
      )}

      {groups.map((group) => (
        <div key={group.key} className="mb-1">
          <p className="px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.1em] soft-text">
            {translate(HISTORY_GROUP_LABEL[group.key])}
          </p>
          <ul className="space-y-0.5">
            {group.chats.map((chat) => {
              const active = chat.id === activeChatId;
              return (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(chat.id)}
                    className={`block w-full truncate rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-[rgb(var(--text)/0.06)] ${
                      active ? "bg-[rgb(var(--text)/0.1)] font-medium" : ""
                    }`}
                  >
                    {chat.title?.trim() || translate("New conversation")}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
