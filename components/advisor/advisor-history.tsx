"use client";

// The advisor's conversation history — a popover listing past threads with a
// "new chat" action and per-thread delete. Kept lightweight (no rename); the
// title auto-fills from the first message server-side.

import { useEffect, useRef, useState } from "react";
import { MessageSquarePlus, MessagesSquare, Trash2, X } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { confirmDialog } from "@/components/native/native-menu";
import { haptics } from "@/lib/native/haptics";

export type AdvisorChatSummary = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export function AdvisorHistory({
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete
}: {
  chats: AdvisorChatSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const { translate } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          haptics.selection();
          setOpen((v) => !v);
        }}
        aria-label={translate("Conversations")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="tap-44 inline-flex h-8 items-center gap-1.5 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.55)] px-3 text-[0.78rem] font-medium transition hover:bg-[rgb(var(--text)/0.06)]"
      >
        <MessagesSquare className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden min-[420px]:inline">{translate("History")}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="glass-strong absolute right-0 top-10 z-30 w-72 overflow-hidden rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.5)] shadow-[0_18px_44px_-20px_rgb(var(--shadow)/0.5)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--muted)/0.3)] px-3 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] soft-text">{translate("Conversations")}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 soft-text transition hover:text-[rgb(var(--text))]"
              aria-label={translate("Close")}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium transition hover:bg-[rgb(var(--brand)/0.08)]"
          >
            <MessageSquarePlus className="h-4 w-4 text-[rgb(var(--brand))]" aria-hidden />
            {translate("New conversation")}
          </button>

          <div className="max-h-72 overflow-y-auto overscroll-contain">
            {chats.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs soft-text">{translate("No past conversations yet.")}</p>
            ) : (
              chats.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-2 px-3 py-2 transition hover:bg-[rgb(var(--text)/0.05)] ${
                    c.id === activeId ? "bg-[rgb(var(--brand)/0.08)]" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(c.id);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 truncate text-left text-sm"
                  >
                    {c.title || translate("Untitled chat")}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const yes = await confirmDialog({
                        message: translate("Delete this conversation?"),
                        okLabel: translate("Delete"),
                        cancelLabel: translate("Cancel"),
                        destructive: true
                      });
                      if (yes) {
                        haptics.warning();
                        onDelete(c.id);
                      }
                    }}
                    aria-label={translate("Delete")}
                    className="shrink-0 rounded-md p-1.5 text-[rgb(var(--subtext))] opacity-0 transition hover:text-[rgb(var(--error))] group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
