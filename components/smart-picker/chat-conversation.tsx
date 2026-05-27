"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Menu, Sparkles, Wallet } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { CardPreviewModal } from "@/components/card/card-preview-modal";
import { MessageInput } from "@/components/smart-picker/message-input";
import { RecommendationGroup } from "@/components/smart-picker/recommendation-group";
import { CheckinBadge } from "@/components/smart-picker/checkin-badge";
import type { AiChatMessage, RecommendationItem } from "@/lib/ai/types";
import type { CheckinStatus } from "@/lib/ai/checkin";

type Props = {
  messages: AiChatMessage[];
  loadingMessages: boolean;
  sending: boolean;
  balance: number;
  unlimited: boolean;
  checkin: CheckinStatus;
  activeTitle: string | null;
  onClaimCheckin: () => Promise<void>;
  onSend: (message: string, count: number) => void;
  onOpenSidebar: () => void;
};

export function ChatConversation({
  messages,
  loadingMessages,
  sending,
  balance,
  unlimited,
  checkin,
  activeTitle,
  onClaimCheckin,
  onSend,
  onOpenSidebar
}: Props) {
  const { translate } = useLocale();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [report, setReport] = useState<{ requestText: string; recs: RecommendationItem[] } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const isEmpty = !loadingMessages && messages.length === 0;
  const headerTitle = activeTitle?.trim() || translate("Smart Picker");

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Mobile header */}
      <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--glass-stroke-soft)/0.4)] px-3 py-2 md:hidden">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={translate("Conversations")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-[rgb(var(--text)/0.08)]"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold tracking-[-0.01em]">{headerTitle}</h1>
        <div className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.55)] px-3 text-[0.78rem] font-medium">
          <Wallet className="h-3.5 w-3.5" />
          {unlimited ? "∞" : balance} {translate("credits")}
          <CheckinBadge canClaim={checkin.canClaim} dailyAmount={checkin.dailyAmount} onClaim={onClaimCheckin} />
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden items-center justify-between gap-3 border-b border-[rgb(var(--glass-stroke-soft)/0.4)] px-6 py-3 md:flex">
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
          {unlimited ? "∞" : balance} {translate("credits")}
          <CheckinBadge canClaim={checkin.canClaim} dailyAmount={checkin.dailyAmount} onClaim={onClaimCheckin} />
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 md:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
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

          {messages.map((message, idx) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[rgb(var(--text))] px-3.5 py-2 text-sm text-[rgb(var(--bg))]">
                  {message.content}
                </div>
              </div>
            ) : (
              <div key={message.id} className="flex flex-col gap-2.5">
                {message.content && (
                  <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-[rgb(var(--surface)/0.85)] px-3.5 py-2 text-sm">
                    {message.content}
                  </div>
                )}
                {message.recommendations && message.recommendations.length > 0 && (
                  <>
                    <RecommendationGroup recommendations={message.recommendations} />
                    <button
                      type="button"
                      onClick={() =>
                        setReport({
                          requestText: idx > 0 && messages[idx - 1].role === "user" ? messages[idx - 1].content : "",
                          recs: message.recommendations ?? []
                        })
                      }
                      className="inline-flex h-8 self-start items-center gap-1.5 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.55)] px-3 text-[0.78rem] font-medium transition hover:bg-[rgb(var(--text)/0.06)]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {translate("Download report")}
                    </button>
                  </>
                )}
              </div>
            )
          )}

          {sending && (
            <div className="flex items-center gap-1.5 px-1 text-sm soft-text">
              <span className="h-2 w-2 animate-bounce rounded-full bg-[rgb(var(--subtext))] [animation-delay:-0.2s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[rgb(var(--subtext))] [animation-delay:-0.1s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[rgb(var(--subtext))]" />
              <span className="ml-1">{translate("AI is thinking…")}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl">
        <MessageInput balance={balance} unlimited={unlimited} sending={sending} onSend={onSend} />
      </div>

      <CardPreviewModal
        open={!!report}
        onClose={() => setReport(null)}
        mode={report ? { kind: "report", requestText: report.requestText, recommendations: report.recs } : null}
      />
    </div>
  );
}
