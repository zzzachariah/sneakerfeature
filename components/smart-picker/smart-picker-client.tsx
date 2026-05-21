"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatSidebar } from "@/components/smart-picker/chat-sidebar";
import { ChatConversation } from "@/components/smart-picker/chat-conversation";
import { RechargeModal } from "@/components/smart-picker/recharge-modal";
import type { AiChatMessage, AiChatSummary } from "@/lib/ai/types";

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
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Initial load: chats + balance.
  useEffect(() => {
    void (async () => {
      const [chatsRes, creditsRes] = await Promise.all([getJson("/api/ai/chats"), getJson("/api/ai/credits")]);
      if (chatsRes?.ok) {
        setChats(chatsRes.chats as AiChatSummary[]);
        if (chatsRes.chats[0]) setActiveChatId(chatsRes.chats[0].id);
      }
      if (creditsRes?.ok) setBalance(creditsRes.balance);
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
    setSidebarOpen(false);
    const res = await getJson("/api/ai/chats", { method: "POST" });
    if (res?.ok) {
      setChats((prev) => [res.chat as AiChatSummary, ...prev]);
      setMessages([]);
      setActiveChatId(res.chat.id);
    }
  }, []);

  const handleSelect = useCallback((id: string) => {
    setActiveChatId(id);
    setSidebarOpen(false);
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

  const handleBalance = useCallback((next: number) => setBalance(next), []);

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

      const res = await getJson("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message, count })
      });
      setSending(false);

      if (res?.ok && res.insufficient) {
        setMessages((prev) => prev.filter((m) => m.id !== tempUser.id));
        setBalance(res.balance);
        setRechargeOpen(true);
        return;
      }
      if (res?.ok && res.assistantMessage) {
        setMessages((prev) => [...prev, res.assistantMessage as AiChatMessage]);
        setBalance(res.balance);
        void refreshChats();
        return;
      }

      // Failure — surface a transient error bubble, keep the typed message.
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: res?.message ?? "请求失败，请稍后重试。",
          recommendations: null,
          credits_charged: 0,
          created_at: new Date().toISOString()
        }
      ]);
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
          onOpenRecharge={() => setRechargeOpen(true)}
        />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-[rgb(var(--glass-overlay)/0.5)]" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[82%] border-r border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--bg))] shadow-[0_30px_72px_rgb(var(--glass-shadow)/0.42)]">
            <ChatSidebar
              chats={chats}
              activeChatId={activeChatId}
              onSelect={handleSelect}
              onNewChat={handleNewChat}
              onRename={handleRename}
              onDelete={handleDelete}
              balance={balance}
              onOpenRecharge={() => {
                setSidebarOpen(false);
                setRechargeOpen(true);
              }}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      <ChatConversation
        messages={messages}
        loadingMessages={loadingMessages}
        sending={sending}
        balance={balance}
        onSend={handleSend}
        onOpenRecharge={() => setRechargeOpen(true)}
        onOpenSidebar={() => setSidebarOpen(true)}
      />

      <RechargeModal
        open={rechargeOpen}
        onClose={() => setRechargeOpen(false)}
        balance={balance}
        onBalance={handleBalance}
      />
    </div>
  );
}
