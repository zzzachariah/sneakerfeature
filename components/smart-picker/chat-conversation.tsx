"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Check, Download, History, MessageCircle, MoreHorizontal, Pencil, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { haptics } from "@/lib/native/haptics";
import { confirmDialog } from "@/components/native/native-menu";
import { DUR, EASE } from "@/lib/motion/constants";
import { CardPreviewModal } from "@/components/card/card-preview-modal";
import { CreditsPanel } from "@/components/smart-picker/credits-panel";
import { MessageCost } from "@/components/smart-picker/message-cost";
import { MessageInput } from "@/components/smart-picker/message-input";
import { RecommendationGroup } from "@/components/smart-picker/recommendation-group";
import { ClarificationPanel } from "@/components/smart-picker/clarification-panel";
import { ThinkingPanel } from "@/components/smart-picker/thinking-panel";
import { ChatActivityDot } from "@/components/smart-picker/chat-activity-dot";
import { AiOnboarding } from "@/components/onboarding/ai-onboarding";
import { isCjkInput } from "@/lib/i18n/detect-cjk";
import type { AiChatMessage, AiChatSummary, RecommendationItem } from "@/lib/ai/types";
import type { AiClarification, ClarificationAnswers } from "@/lib/ai/clarification";
import { hasUnmeteredBase, type ModelId, type Tier } from "@/lib/subscription/tiers";
import type { CheckinStatus } from "@/lib/ai/checkin";
import styles from "./unified-picker.module.css";

type Props = {
  messages: AiChatMessage[];
  loadingMessages: boolean;
  sending: boolean;
  atTurnLimit: boolean;
  balance: number;
  creditsLoaded: boolean;
  onboardingReady: boolean;
  unlimited: boolean;
  checkin: CheckinStatus;
  allowance: { balance: number; grant: number } | null;
  tier: Tier;
  model: ModelId | null;
  onSelectModel: (id: ModelId) => void;
  initialPrompt?: string;
  chats: AiChatSummary[];
  activeChatId: string | null;
  streamingChatIds: string[];
  unseenChatIds: string[];
  activeTitle: string | null;
  onClaimCheckin: () => Promise<void>;
  onSend: (message: string, count: number) => void;
  onClarification: (value: AiClarification, answers: ClarificationAnswers) => void;
  onRetryClarification: (value: AiClarification) => void;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  mode: "chat" | "find";
  onModeChange: (mode: "chat" | "find") => void;
  modeLocked: boolean;
  canChat: boolean;
  chatUnlimited?: boolean;
  chatsLoading: boolean;
  historyError?: string | null;
  onRetryHistory?: () => void;
  onRenameChat?: (id: string, title: string) => Promise<void>;
  onDeleteChat?: (id: string) => Promise<void>;
};

export function ChatConversation({
  messages, loadingMessages, sending, atTurnLimit, balance, creditsLoaded, onboardingReady,
  unlimited, checkin, allowance, tier, model, onSelectModel, initialPrompt, chats,
  activeChatId, streamingChatIds, unseenChatIds, activeTitle, onClaimCheckin, onSend,
  onClarification, onRetryClarification, onSelectChat, onNewChat, mode, onModeChange,
  modeLocked, canChat, chatUnlimited = false, chatsLoading, historyError, onRetryHistory, onRenameChat, onDeleteChat
}: Props) {
  const { translate, locale } = useLocale();
  const zh = locale === "zh";
  const reduced = useReducedMotion();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const followScroll = useRef(true);
  const followRail = useRef(true);
  const composerBefore = useRef<DOMRect | null>(null);
  const composerAnimation = useRef<Animation | null>(null);
  const animateRail = useRef(false);
  const viewedRailItem = useRef<string | null>(null);
  const [report, setReport] = useState<{ requestText: string; summary: string; recs: RecommendationItem[] } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [prefill, setPrefill] = useState({ text: "", nonce: 0 });
  const [composerNotice, setComposerNotice] = useState("");
  const draftNotes = useRef(new Map<string, string>());
  const [noteAddition, setNoteAddition] = useState<{ id: string; text: string; nonce: number } | null>(null);
  const latestClarification = mode === "find" ? messages.findLast(item => item.clarification)?.clarification : null;
  // Only the current round owns the rail. A newer incomplete round hides old picks.
  const activeClarification = latestClarification && latestClarification.status !== "complete" ? latestClarification : null;
  const pendingClarification = activeClarification?.status === "awaiting_answers" ? activeClarification : null;
  const waitingForClarification = activeClarification?.status === "generating" || activeClarification?.status === "answering";
  const resultIndex = messages.findLastIndex(item => Boolean(item.recommendations?.length));
  const resultMessage = resultIndex >= 0 ? messages[resultIndex] : null;
  const hasRecommendations = resultMessage !== null;
  const clarificationComplete = latestClarification?.status === "complete";
  const isEmpty = !modeLocked && !loadingMessages && messages.length === 0;
  const showRail = mode === "find" && !isEmpty && (Boolean(latestClarification?.questions.length) || hasRecommendations);
  const lastMessage = messages[messages.length - 1];
  const preparingQuestions = mode === "find" && sending && !hasRecommendations && !clarificationComplete && activeClarification?.status !== "answering";
  const activityElsewhere = streamingChatIds.some(id => id !== activeChatId) || unseenChatIds.some(id => id !== activeChatId);
  const openUsage = useCallback(() => { setHistoryOpen(false); setUsageOpen(true); }, []);
  const fillComposer = useCallback((text: string) => { setPrefill(previous => ({ text, nonce: previous.nonce + 1 })); }, []);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || !initialPrompt) return;
    seededRef.current = true;
    fillComposer(initialPrompt + " ");
  }, [initialPrompt, fillComposer]);
  useEffect(() => { setComposerNotice(""); }, [activeChatId]);
  // Reset before the scrolling layout effect, including cached history opens.
  // A passive effect here runs too late and leaves the previous chat's scroll.
  useLayoutEffect(() => {
    followScroll.current = true;
    followRail.current = true;
    viewedRailItem.current = null;
  }, [activeChatId]);
  useEffect(() => {
    if (!historyOpen) return;
    const outside = (event: PointerEvent) => { if (!historyRef.current?.contains(event.target as Node)) setHistoryOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setHistoryOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [historyOpen]);
  useEffect(() => () => { composerAnimation.current?.cancel(); }, []);
  useLayoutEffect(() => {
    const before = composerBefore.current;
    if (isEmpty || !before) return;
    composerBefore.current = null;
    const box = composerRef.current?.querySelector<HTMLElement>("[data-picker-composer-box]");
    if (!box || reduced) return;
    const after = box.getBoundingClientRect();
    composerAnimation.current?.cancel();
    composerAnimation.current = box.animate([
      { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` },
      { transform: "translate(0, 0)" }
    ], { duration: 360, easing: "cubic-bezier(.22,1,.36,1)" });
  }, [isEmpty, reduced]);
  // Follow only a reader already at the end. Streaming never pulls them away
  // from earlier messages; a deliberate send opts into following again.
  useLayoutEffect(() => {
    if (loadingMessages) return;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const element = mobile ? workspaceRef.current : scrollRef.current;
    if (!element) return;
    // Use the content actually visible in the rail. Incoming recommendation
    // events remain behind the answering state until the turn is complete.
    const railItem = activeClarification?.questions.length
      ? `questions:${activeClarification.id}`
      : !activeClarification && resultMessage ? `result:${resultMessage.clientKey ?? resultMessage.id}` : null;
    if (showRail && railItem && viewedRailItem.current !== railItem) {
      const rail = railRef.current;
      if (rail && (mobile ? followScroll.current : followRail.current)) {
        if (mobile) element.scrollTop += rail.getBoundingClientRect().top - element.getBoundingClientRect().top - 12;
        else rail.scrollTop = 0;
      }
      viewedRailItem.current = railItem;
    }
    if (followScroll.current && (!mobile || !showRail)) element.scrollTop = element.scrollHeight;
  }, [messages, sending, loadingMessages, activeClarification, resultMessage, showRail, activeChatId]);
  const trackScroll = (element: HTMLDivElement) => {
    followScroll.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  };

  const sendMessage = (text: string, count: number) => {
    if (pendingClarification && !sending) {
      const previous = draftNotes.current.get(pendingClarification.id) ?? pendingClarification.answers?.note ?? "";
      const combined = [previous.trim(), text.trim()].filter(Boolean).join("\n");
      if (combined.length > 500) {
        setComposerNotice(zh ? "补充信息最多 500 字。请在问题末尾整理后再确认；输入框里的内容已保留。" : "Notes can be up to 500 characters. Edit them in the question panel before confirming; your chat draft is still here.");
        return false;
      }
      draftNotes.current.set(pendingClarification.id, combined);
      setNoteAddition(previousNote => ({ id: pendingClarification.id, text: combined, nonce: (previousNote?.nonce ?? 0) + 1 }));
      setComposerNotice(zh ? "已加入本次选鞋的补充信息，回答完问题后一起确认。" : "Added to this request. Review your notes with the questions before confirming.");
      return true;
    }
    if (isEmpty) {
      animateRail.current = true;
      composerBefore.current = composerRef.current?.querySelector<HTMLElement>("[data-picker-composer-box]")?.getBoundingClientRect() ?? null;
    }
    followScroll.current = true;
    followRail.current = true;
    setComposerNotice("");
    onSend(text, count);
    return true;
  };
  const newConversation = () => {
    animateRail.current = false;
    composerAnimation.current?.cancel(); composerBefore.current = null;
    setHistoryOpen(false); setComposerNotice(""); fillComposer(""); onNewChat();
  };
  const selectConversation = (id: string) => {
    animateRail.current = false;
    composerAnimation.current?.cancel(); composerBefore.current = null;
    setHistoryOpen(false); fillComposer(""); onSelectChat(id);
  };
  const suggestions = mode === "find"
    ? (zh ? ["外场、快速后卫，想要灵敏脚感", "宽脚，想要稳固又不挤脚的包裹"] : ["Outdoor courts, quick guards", "More room for wide feet"])
    : (zh ? ["缓震和场地感怎么取舍？", "球鞋的稳定性体现在哪里？"] : ["Cushioning or court feel?", "What does stability feel like?"]);
  const bubbleIn = reduced ? {} : { initial: { opacity: 0, y: 5 }, animate: { opacity: 1, y: 0 }, transition: { duration: DUR.base, ease: EASE } };
  const resultRequest = resultIndex > 0 ? messages.slice(0, resultIndex).findLast(item => item.role === "user")?.content ?? "" : "";
  const clarificationPanel = activeClarification ? <ClarificationPanel
    key={activeClarification.id} value={activeClarification} zh={isCjkInput(activeClarification.originalMessage)}
    busy={sending || atTurnLimit} canAfford={unlimited || hasUnmeteredBase(tier) || balance >= activeClarification.count}
    onConfirm={answers => { followScroll.current = true; followRail.current = true; onClarification(activeClarification, answers); }} onRetry={() => { followRail.current = true; onRetryClarification(activeClarification); }}
    onOpenUsage={openUsage} extraNote={noteAddition?.id === activeClarification.id ? noteAddition : undefined}
    onNoteChange={note => { draftNotes.current.set(activeClarification.id, note); }}/> : null;

  return <div className={styles.shell} data-unified-picker data-mode={mode}>
    <header className={styles.header}>
      <span className={styles.pageName}>Smart Picker</span>
      <div className={styles.headerActions}>
        <AiOnboarding ready={onboardingReady && creditsLoaded}
          busy={loadingMessages || sending || Boolean(activeClarification) || streamingChatIds.length > 0 || historyOpen || usageOpen || Boolean(report)}
          autoBlocked={mode === "chat" || !isEmpty || (lastMessage?.id.startsWith("local-") ?? false)}/>
        <div className={styles.historyWrap} ref={historyRef}>
          <button type="button" className={styles.headerButton} aria-expanded={historyOpen} aria-haspopup="dialog"
            onClick={() => setHistoryOpen(value => !value)}><History size={16}/><span>{zh ? "历史" : "History"}</span>
            {activityElsewhere && <span className={styles.activityDot} aria-label={zh ? "有会话更新" : "Conversation updates"}/>}
          </button>
          {historyOpen && <ConversationHistoryPopover chats={chats} loading={chatsLoading} error={historyError} onRetry={onRetryHistory}
            activeChatId={activeChatId} streamingChatIds={streamingChatIds} unseenChatIds={unseenChatIds}
            onSelect={selectConversation} onNewChat={newConversation} onRename={onRenameChat} onDelete={onDeleteChat}/>}
        </div>
        <button type="button" className={styles.headerButton} onClick={newConversation} aria-label={translate("New conversation")}><Plus size={18}/></button>
      </div>
    </header>

    <div className={styles.workspace} data-empty={isEmpty} data-rail={showRail} data-animate-split={animateRail.current}>
      <div ref={workspaceRef} className={styles.paneFlow} data-picker-workspace
        onScroll={event => { if (window.matchMedia("(max-width: 767px)").matches) trackScroll(event.currentTarget); }}>
      <section className={styles.conversation} aria-label={zh ? "对话" : "Conversation"}>
        {isEmpty ? <div className={styles.greeting}>
          <span className={styles.eyebrow}>SMART PICKER</span>
          <h1>{mode === "find" ? (zh ? "你的下一双，从这里开始。" : "Your next pair starts here.") : (zh ? "聊聊你的球场需求。" : "Let’s talk about your game.")}</h1>
          <p>{mode === "find" ? (zh ? "说出你的需求，找到适合自己的选择。" : "Good questions. Better picks. All about your game.") : (zh ? "下一次选择前，先聊清楚。" : "A little advice before your next move.")}</p>
        </div> : <>
          <p className={styles.threadTitle}>{activeTitle?.trim() || (zh ? "新对话" : "New conversation")}</p>
          <div ref={scrollRef} data-smart-picker-scroll className={styles.transcript}
            onScroll={event => { if (!window.matchMedia("(max-width: 767px)").matches) trackScroll(event.currentTarget); }}>
            {loadingMessages ? <ConversationSkeleton/> : <div className={styles.messages}>
              {messages.map((message, index) => {
                if (message.clarification) return null;
                const active = sending && index === messages.length - 1;
                const requestText = messages.slice(0, index).findLast(item => item.role === "user")?.content ?? "";
                const followUp = index === messages.length - 1 && !active ? message.followUp?.trim() : "";
                return <div key={message.clientKey ?? message.id} className={message.role === "user" ? styles.userRow : styles.assistantRow}>
                  {message.role === "assistant" && ((message.steps?.length ?? 0) > 0 || active) && <ThinkingPanel steps={message.steps ?? []} active={active} zhInput={isCjkInput(requestText || message.content)}/>}
                  {message.content && <motion.div {...bubbleIn} className={message.role === "user" ? styles.userMessage : styles.assistantMessage}>
                    {message.role === "assistant" && <span className={styles.assistantLabel}>Smart Picker</span>}
                    {message.content.split(/\n\s*\n/).filter(Boolean).map((paragraph, i) => <p key={i}>{paragraph}</p>)}
                  </motion.div>}
                  {followUp && <div className={styles.followUp}>
                    <p>{followUp}</p>
                    <div className={styles.followUpChoices}>{quickAnswers(followUp).map(answer => <button key={answer} type="button" className={styles.suggestion}
                      disabled={sending || atTurnLimit} onClick={() => fillComposer(answer)}>{answer}<ArrowUpRight size={12}/></button>)}</div>
                  </div>}
                </div>;
              })}
              {((!showRail && activeClarification?.status === "generating") || (sending && (lastMessage?.role !== "assistant" || Boolean(lastMessage?.clarification)))) && <ThinkingPanel
                steps={preparingQuestions || activeClarification?.status === "generating" ? [{ kind: "status", text: zh ? "正在准备确认问题…" : "Preparing your questions…" }] : []} active zhInput={zh}/>}
              {!showRail && activeClarification?.status === "failed" && clarificationPanel}
            </div>}
          </div>
        </>}
      </section>

      {showRail && <aside ref={railRef} className={styles.rail} data-picker-rail data-animate={animateRail.current}
        onWheel={() => { followRail.current = false; }} onTouchMove={() => { followRail.current = false; }}
        onKeyDown={event => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) followRail.current = false; }}
        aria-label={activeClarification ? (zh ? "确认选鞋需求" : "Confirm your needs") : (zh ? "推荐结果" : "Your shortlist")}>
        {loadingMessages ? <ConversationSkeleton cards/> : activeClarification ? clarificationPanel
          : resultMessage?.recommendations?.length ? <>
            <div className={styles.railHeading}><h2>{zh ? "为你挑选" : "Your shortlist"}</h2><span>{resultMessage.recommendations.length} {zh ? "个选择" : "considered options"}</span></div>
            <RecommendationGroup key={resultMessage.clientKey ?? resultMessage.id} recommendations={resultMessage.recommendations}/>
            <div className={styles.resultActions}>
              <button type="button" className={styles.textButton} onClick={() => setReport({ requestText: resultRequest, summary: resultMessage.content, recs: resultMessage.recommendations ?? [] })}><Download size={13}/>{translate("Download report")}</button>
              {!sending && <MessageCost charged={resultMessage.credits_charged} billing={resultMessage.billing} onOpenUsage={openUsage}/>}
            </div>
          </> : <div className={styles.railWaiting}>
            {sending ? <ConversationSkeleton cards/> : <p>{zh ? "推荐结果会显示在这里。" : "Your picks will appear here."}</p>}
          </div>}
      </aside>}
      </div>

      <div className={styles.composerDock} ref={composerRef}>
        {!modeLocked ? <div className={styles.modeSwitch} role="group" aria-label={zh ? "对话模式" : "Conversation mode"}>
          <button type="button" aria-pressed={mode === "chat"} onClick={() => onModeChange("chat")}><MessageCircle size={14}/>Chat</button>
          <button type="button" aria-pressed={mode === "find"} onClick={() => onModeChange("find")}><Sparkles size={14}/>Find</button>
        </div> : <span className={styles.modeLabel}>{mode === "find" ? <Sparkles size={13}/> : <MessageCircle size={13}/>} {mode === "find" ? "Find" : "Chat"}</span>}
        {composerNotice && <p className={styles.composerNotice} role="status">{composerNotice}</p>}
        <MessageInput balance={balance} unlimited={unlimited} sending={sending || waitingForClarification || loadingMessages} atTurnLimit={atTurnLimit}
          tier={tier} model={model} onSelectModel={onSelectModel} onSend={sendMessage} mode={mode} canChat={canChat} chatUnlimited={chatUnlimited}
          creditsLoaded={creditsLoaded} allowance={allowance} onOpenUsage={openUsage} onMenuOpen={closeHistory}
          freePreparation={mode === "find" && !hasRecommendations && !clarificationComplete} pendingClarification={Boolean(pendingClarification)}
          prefillText={prefill.text} prefillNonce={prefill.nonce}/>
        {isEmpty && <div className={styles.examples} data-onboarding="ai-examples">{suggestions.map(suggestion => <button type="button" key={suggestion} className={styles.suggestion}
          onClick={() => { haptics.selection(); fillComposer(suggestion + " "); }}>{suggestion}<ArrowUpRight size={12}/></button>)}</div>}
      </div>
    </div>

    <CreditsPanel open={usageOpen} onClose={() => setUsageOpen(false)} balance={balance} unlimited={unlimited}
      checkin={checkin} onClaimCheckin={onClaimCheckin} onSelectChat={selectConversation}/>
    <CardPreviewModal open={!!report} onClose={() => setReport(null)}
      mode={report ? { kind: "report", requestText: report.requestText, summary: report.summary, recommendations: report.recs } : null}/>
  </div>;
}

function ConversationSkeleton({ cards = false }: { cards?: boolean }) {
  return <div className={cards ? styles.cardsSkeleton : styles.conversationSkeleton} role="status" aria-label="Loading…" aria-busy="true">
    <span/><span/><span/>
  </div>;
}

function historyGroupKey(iso: string): "today" | "yesterday" | "earlier" {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= today) return "today";
  if (date.getTime() >= today - 86_400_000) return "yesterday";
  return "earlier";
}

function ConversationHistoryPopover({ chats, loading, error, onRetry, activeChatId, streamingChatIds, unseenChatIds, onSelect, onNewChat, onRename, onDelete }: {
  chats: AiChatSummary[]; loading: boolean; error?: string | null; onRetry?: () => void;
  activeChatId: string | null; streamingChatIds: string[]; unseenChatIds: string[];
  onSelect: (id: string) => void; onNewChat: () => void;
  onRename?: (id: string, title: string) => Promise<void>; onDelete?: (id: string) => Promise<void>;
}) {
  const { translate, locale } = useLocale();
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuId) return;
    const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuId(null); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [menuId]);
  const saveTitle = async (chat: AiChatSummary) => {
    if (!onRename || busyId) return;
    const title = draftTitle.trim();
    if (!title || title === (chat.title ?? "")) { setRenamingId(null); return; }
    setBusyId(chat.id); setMutationError("");
    try { await onRename(chat.id, title); setRenamingId(null); }
    catch { setRenamingId(null); setMutationError(locale === "zh" ? "重命名未成功，原名称已保留。请重试。" : "Couldn’t rename this conversation. Its original title is unchanged. Please try again."); }
    finally { setBusyId(null); }
  };
  const deleteChat = async (chat: AiChatSummary) => {
    if (!onDelete || busyId) return;
    setMenuId(null);
    const confirmed = await confirmDialog({ message: translate("Delete this conversation?"), okLabel: translate("Delete"), cancelLabel: translate("Cancel"), destructive: true });
    if (!confirmed) return;
    setBusyId(chat.id); setMutationError("");
    try { await onDelete(chat.id); }
    catch { setMutationError(locale === "zh" ? "删除未成功，对话已保留。请重试。" : "Couldn’t delete this conversation. It is still available. Please try again."); }
    finally { setBusyId(null); }
  };
  const labels = { today: "Today", yesterday: "Yesterday", earlier: "Earlier" };
  return <div role="dialog" aria-label={locale === "zh" ? "对话历史" : "Conversation history"} className={styles.historyPopover}>
    <button type="button" className={styles.historyNew} onClick={onNewChat}><Plus size={15}/>{translate("New chat")}</button>
    {mutationError && <p className={styles.historyError} role="alert">{mutationError}</p>}
    {loading ? <ConversationSkeleton/> : error ? <div className={styles.historyError} role="alert"><p>{error}</p>{onRetry && <button type="button" className={styles.textButton} onClick={onRetry}><RotateCcw size={13}/>{locale === "zh" ? "重试" : "Retry"}</button>}</div>
      : chats.length === 0 ? <p className={styles.historyEmpty}>{translate("No conversations yet.")}</p>
      : (["today", "yesterday", "earlier"] as const).map(key => {
        const group = chats.filter(chat => historyGroupKey(chat.updated_at) === key);
        if (!group.length) return null;
        return <div key={key} className={styles.historyGroup}><p>{translate(labels[key])}</p><ul>{group.map(chat => <li key={chat.id} className={styles.historyRow}>
          {renamingId === chat.id ? <div className={styles.historyRename}>
            <input autoFocus value={draftTitle} maxLength={60} disabled={busyId === chat.id} aria-label={translate("Rename")}
              onChange={event => setDraftTitle(event.target.value)}
              onKeyDown={event => { if (event.nativeEvent.isComposing || event.keyCode === 229) return; if (event.key === "Enter") { event.preventDefault(); void saveTitle(chat); } if (event.key === "Escape") { event.stopPropagation(); setRenamingId(null); } }}/>
            <button type="button" className={styles.historyMore} disabled={busyId === chat.id} aria-label={locale === "zh" ? "保存名称" : "Save name"} onClick={() => void saveTitle(chat)}><Check size={14}/></button>
            <button type="button" className={styles.historyMore} disabled={busyId === chat.id} aria-label={translate("Cancel")} onClick={() => setRenamingId(null)}><X size={14}/></button>
          </div> : <><button type="button" className={styles.historyItem} disabled={busyId === chat.id} aria-current={chat.id === activeChatId ? "true" : undefined} onClick={() => onSelect(chat.id)}>
            <ChatActivityDot streaming={streamingChatIds.includes(chat.id)} unseen={unseenChatIds.includes(chat.id)}/>
            <span>{chat.title?.trim() || translate("New conversation")}</span><small>{(chat as AiChatSummary & { mode?: string }).mode === "chat" ? "Chat" : "Find"}</small>
          </button>
          {(onRename || onDelete) && <div className={styles.historyMenuWrap} ref={menuId === chat.id ? menuRef : undefined}>
            <button type="button" className={styles.historyMore} disabled={Boolean(busyId)} aria-label={translate("More")} aria-haspopup="menu" aria-expanded={menuId === chat.id}
              onClick={() => { setMutationError(""); setMenuId(value => value === chat.id ? null : chat.id); }}><MoreHorizontal size={16}/></button>
            {menuId === chat.id && <div className={styles.historyMenu} role="menu">
              {onRename && <button type="button" role="menuitem" onClick={() => { setMenuId(null); setDraftTitle(chat.title ?? ""); setRenamingId(chat.id); }}><Pencil size={13}/>{translate("Rename")}</button>}
              {onDelete && <button type="button" role="menuitem" onClick={() => void deleteChat(chat)}><Trash2 size={13}/>{translate("Delete")}</button>}
            </div>}
          </div>}</>}
        </li>)}</ul></div>;
      })}
  </div>;
}

function quickAnswers(question: string): string[] {
  const zh = isCjkInput(question);
  if (/室内|室外|场地|indoor|outdoor|court surface/i.test(question)) return zh ? ["主要室内", "主要室外", "两边都打"] : ["Mostly indoor", "Mostly outdoor", "Both"];
  if (/预算|价位|budget|price range/i.test(question)) return zh ? ["更看重性价比", "预算灵活"] : ["Value matters most", "Flexible budget"];
  if (/宽|窄|foot width|wide feet|narrow feet/i.test(question)) return zh ? ["脚偏宽", "标准脚宽", "脚偏窄"] : ["Wide feet", "Standard width", "Narrow feet"];
  return [zh ? "我来补充一下…" : "Let me add some context…"];
}
