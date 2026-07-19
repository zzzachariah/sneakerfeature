"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Download, History, Plus, Wallet } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { haptics } from "@/lib/native/haptics";
import { DUR, EASE } from "@/lib/motion/constants";
import { CardPreviewModal } from "@/components/card/card-preview-modal";
import { MessageInput } from "@/components/smart-picker/message-input";
import { ProfileTip } from "@/components/smart-picker/profile-tip";
import { RecommendationGroup } from "@/components/smart-picker/recommendation-group";
import { ThinkingPanel } from "@/components/smart-picker/thinking-panel";
import { CheckinBadge } from "@/components/smart-picker/checkin-badge";
import { AllowanceMeter } from "@/components/smart-picker/allowance-meter";
import { SneakerLoader } from "@/components/ui/sneaker-loader";
import type { AiChatMessage, AiChatSummary, RecommendationItem } from "@/lib/ai/types";
import type { CheckinStatus } from "@/lib/ai/checkin";
import type { ModelId, Tier } from "@/lib/subscription/tiers";

type Props = {
  messages: AiChatMessage[];
  loadingMessages: boolean;
  sending: boolean;
  balance: number;
  creditsLoaded: boolean;
  unlimited: boolean;
  checkin: CheckinStatus;
  allowance: { balance: number; grant: number } | null;
  tier: Tier;
  model: ModelId | null;
  onSelectModel: (id: ModelId) => void;
  initialPrompt?: string;
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
  allowance,
  tier,
  model,
  onSelectModel,
  initialPrompt,
  chats,
  activeChatId,
  activeTitle,
  onClaimCheckin,
  onSend,
  onSelectChat,
  onNewChat
}: Props) {
  const { translate, locale } = useLocale();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [report, setReport] = useState<{ requestText: string; summary: string; recs: RecommendationItem[] } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement | null>(null);
  // Prefill flows to the composer; suggestion chips on the empty state set it so
  // a fresh conversation has concrete starting points instead of a blank box.
  // The `nonce` bumps on every tap so MessageInput re-fills even when the same
  // chip is tapped twice (identical text, so a text-keyed effect would skip it).
  const [prefill, setPrefill] = useState<{ text: string; nonce: number }>({ text: "", nonce: 0 });
  // Seed the composer once from a deep link (e.g. the Max concierge entry on a
  // shoe page → /smart-picker?ask=…). The member reviews and hits send, so it
  // flows through the normal billed pipeline rather than auto-firing.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !initialPrompt) return;
    seededRef.current = true;
    setPrefill((p) => ({ text: initialPrompt + " ", nonce: p.nonce + 1 }));
  }, [initialPrompt]);
  const suggestions =
    locale === "zh"
      ? ["适合控卫的强抓地球鞋", "给体重较大球员的稳定支撑", "贴地、适合快速后卫", "室外场耐磨又缓震"]
      : [
          "Best traction for quick guards",
          "Stable and supportive for a heavier player",
          "Low-to-the-ground court feel",
          "Great cushioning for outdoor courts"
        ];

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
      {/* Header — history + balance only; the model picker lives in the composer */}
      <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--glass-stroke-soft)/0.4)] px-[var(--container-gutter)] py-2">
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
        {creditsLoaded && allowance && <AllowanceMeter balance={allowance.balance} grant={allowance.grant} />}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-[var(--container-gutter)] py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {/* Loading a past conversation from history — animated spinner while it fetches. */}
          {loadingMessages && (
            <div className="mt-16 flex justify-center" aria-live="polite" aria-busy="true">
              <SneakerLoader label={translate("Loading...")} />
            </div>
          )}

          {/* Centered empty state — title + one-line prompt so a fresh conversation
              isn't a blank panel. Sits in the available vertical space, not pinned. */}
          {isEmpty && (
            <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 text-center">
              <h2 className="text-2xl font-semibold tracking-[-0.01em] md:text-3xl">
                {translate("Find your next pair")}
              </h2>
              <p className="mt-2 max-w-[22rem] text-sm soft-text">
                {translate("Tell me your playstyle, position, and the feel you want — I'll recommend shoes from our database.")}
              </p>
              {/* Concrete starting points — tap to drop one into the composer. */}
              <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setPrefill((p) => ({ text: s + " ", nonce: p.nonce + 1 }));
                    }}
                    className="tap-44 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.6)] px-3.5 py-2 text-[0.8rem] font-medium text-[rgb(var(--text)/0.85)] transition hover:border-[rgb(var(--text)/0.35)] hover:text-[rgb(var(--text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.3)]"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Collapsible hint: a saved player profile skips height/weight and
                  richer detail yields better picks. Collapses to a small pill. */}
              <ProfileTip />
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

      <MessageInput
        balance={balance}
        unlimited={unlimited}
        sending={sending}
        tier={tier}
        model={model}
        onSelectModel={onSelectModel}
        onSend={onSend}
        prefillText={prefill.text}
        prefillNonce={prefill.nonce}
      />

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
