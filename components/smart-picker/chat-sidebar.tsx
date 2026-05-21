"use client";

import { Plus, Wallet, X } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { AiChatSummary } from "@/lib/ai/types";

type Props = {
  chats: AiChatSummary[];
  activeChatId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  balance: number;
  onOpenRecharge: () => void;
  onClose?: () => void;
};

function groupKey(iso: string): "today" | "yesterday" | "earlier" {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return "today";
  if (t >= startOfToday - 86_400_000) return "yesterday";
  return "earlier";
}

const GROUP_LABEL: Record<"today" | "yesterday" | "earlier", string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier"
};

export function ChatSidebar({ chats, activeChatId, onSelect, onNewChat, balance, onOpenRecharge, onClose }: Props) {
  const { translate } = useLocale();

  const groups: { key: "today" | "yesterday" | "earlier"; chats: AiChatSummary[] }[] = [];
  for (const key of ["today", "yesterday", "earlier"] as const) {
    const list = chats.filter((c) => groupKey(c.updated_at) === key);
    if (list.length) groups.push({ key, chats: list });
  }

  return (
    <div className="flex h-full w-full flex-col bg-[rgb(var(--bg)/0.7)]">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] text-sm font-medium transition hover:border-[rgb(var(--text)/0.4)] hover:bg-[rgb(var(--surface))]"
        >
          <Plus className="h-4 w-4" />
          {translate("New chat")}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={translate("Close")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[rgb(var(--text)/0.08)] md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {groups.length === 0 && (
          <p className="px-2 py-6 text-center text-[0.78rem] soft-text">{translate("No conversations yet.")}</p>
        )}
        {groups.map((group) => (
          <div key={group.key} className="mb-3">
            <p className="px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] soft-text">
              {translate(GROUP_LABEL[group.key])}
            </p>
            <ul className="space-y-0.5">
              {group.chats.map((chat) => {
                const active = chat.id === activeChatId;
                return (
                  <li key={chat.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(chat.id)}
                      className={`w-full truncate rounded-lg px-2.5 py-2 text-left text-sm transition ${
                        active ? "bg-[rgb(var(--text)/0.1)] font-medium" : "hover:bg-[rgb(var(--text)/0.06)]"
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

      <div className="border-t border-[rgb(var(--glass-stroke-soft)/0.4)] p-3">
        <button
          type="button"
          onClick={onOpenRecharge}
          className="flex w-full items-center justify-between rounded-xl bg-[rgb(var(--text)/0.05)] px-3 py-2.5 transition hover:bg-[rgb(var(--text)/0.09)]"
        >
          <span className="inline-flex items-center gap-1.5 text-sm soft-text">
            <Wallet className="h-4 w-4" />
            {translate("Balance")}
          </span>
          <span className="text-sm font-semibold">
            {balance} {translate("credits")}
          </span>
        </button>
      </div>
    </div>
  );
}
