"use client";

import { useEffect, useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2, Wallet, X } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { AiChatSummary } from "@/lib/ai/types";

type Props = {
  chats: AiChatSummary[];
  activeChatId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
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

export function ChatSidebar({
  chats,
  activeChatId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  balance,
  onOpenRecharge,
  onClose
}: Props) {
  const { translate } = useLocale();
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuId]);

  const startRename = (chat: AiChatSummary) => {
    setMenuId(null);
    setRenamingId(chat.id);
    setDraft(chat.title ?? "");
  };

  const commitRename = (id: string) => {
    const title = draft.trim();
    setRenamingId(null);
    const current = chats.find((c) => c.id === id)?.title ?? "";
    if (title && title !== current) onRename(id, title);
  };

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
                if (renamingId === chat.id) {
                  return (
                    <li key={chat.id}>
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(chat.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onBlur={() => commitRename(chat.id)}
                        maxLength={60}
                        className="w-full rounded-lg bg-[rgb(var(--surface))] px-2.5 py-2 text-sm outline-none ring-1 ring-[rgb(var(--text)/0.25)]"
                      />
                    </li>
                  );
                }
                return (
                  <li key={chat.id}>
                    <div
                      className={`group/item relative flex items-center rounded-lg transition ${
                        active ? "bg-[rgb(var(--text)/0.1)]" : "hover:bg-[rgb(var(--text)/0.06)]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(chat.id)}
                        className={`min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm ${active ? "font-medium" : ""}`}
                      >
                        {chat.title?.trim() || translate("New conversation")}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuId(menuId === chat.id ? null : chat.id);
                        }}
                        aria-label={translate("More")}
                        className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[rgb(var(--subtext))] opacity-100 transition hover:bg-[rgb(var(--text)/0.1)] hover:text-[rgb(var(--text))] md:opacity-0 md:group-hover/item:opacity-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      {menuId === chat.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="nav-dropdown-panel absolute right-1 top-[calc(100%-0.25rem)] z-30 w-36 rounded-xl p-1"
                        >
                          <button
                            type="button"
                            onClick={() => startRename(chat)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-[rgb(var(--text)/0.06)]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            {translate("Rename")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuId(null);
                              if (window.confirm(translate("Delete this conversation?"))) onDelete(chat.id);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[rgb(var(--error))] transition hover:bg-[rgb(var(--error)/0.1)]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {translate("Delete")}
                          </button>
                        </div>
                      )}
                    </div>
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
