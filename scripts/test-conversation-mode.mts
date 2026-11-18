import assert from 'node:assert/strict';
import { conversationHistory, conversationMessages, conversationPath, sortConversations } from '../lib/ai/conversation-mode';
import type { AiChatMessage, AiChatSummary } from '../lib/ai/types';
const old: AiChatSummary = { id:'find', title:'Old picks', created_at:'2026-11-01T10:00:00Z', updated_at:'2026-11-01T10:00:00Z' };
const recent = { ...old, id:'chat', title:'Advice', updated_at:'2026-11-18T10:00:00Z' };
const all = [...conversationHistory([old], 'find'), ...conversationHistory([recent], 'chat')];
assert.deepEqual(sortConversations(all).map(row => [row.id, conversationPath(row.mode!)]), [['chat','/api/ai/advisor/chats'], ['find','/api/ai/chats']]);
assert.equal(all[0].id, 'find'); // Sorting may not change the original state.
assert.equal(old.mode, undefined); // Legacy records stay unchanged.
const message: AiChatMessage = { id:'saved', role:'assistant', content:'Advice', recommendations:null, credits_charged:3, created_at:old.created_at };
const advisor = conversationMessages([{ ...message, allowance_charged:1 }], 'chat')[0];
assert.equal(advisor.content, 'Advice'); assert.equal(advisor.credits_charged,1); assert.equal(advisor.billing,'allowance');
assert.equal(conversationMessages([{ ...message, allowance_charged:0 }], 'chat')[0].credits_charged, 0);
assert.equal(conversationMessages([message], 'find')[0],message);
console.log('Unified history preserves engine routing, recency, legacy records and separate billing.');
