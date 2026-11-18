import type { AiChatMessage, AiChatSummary } from "@/lib/ai/types";

export type PickerMode = "chat" | "find";

export function conversationPath(mode: PickerMode): string {
  return mode === "chat" ? "/api/ai/advisor/chats" : "/api/ai/chats";
}

export function conversationHistory(rows: AiChatSummary[], mode: PickerMode): AiChatSummary[] {
  return rows.map(row => ({ ...row, mode }));
}

export function sortConversations(rows: AiChatSummary[]): AiChatSummary[] {
  return [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function conversationMessages(
  rows: (AiChatMessage & { allowance_charged?: number })[], mode: PickerMode
): AiChatMessage[] {
  if (mode === "find") return rows;
  return rows.map(row => ({
    ...row,
    recommendations: null,
    credits_charged: row.allowance_charged ?? 0,
    billing: "allowance" as const
  }));
}
