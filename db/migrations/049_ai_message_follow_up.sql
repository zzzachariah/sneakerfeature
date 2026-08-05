-- 049_ai_message_follow_up.sql
--
-- Smart Picker follow-up questions.
--
-- The recommender now returns its "one question worth asking next" in a
-- dedicated `follow_up` field instead of trailing it onto the end of the reply
-- prose, so the UI can render it as its own answerable composer box and the
-- conversation keeps going with a single tap. That question has to survive a
-- reload, so it is persisted per assistant message rather than living only in
-- the streaming client state.
--
-- Nullable and additive: rows written before this migration simply have no
-- follow-up, and the chat route writes the column defensively (it retries the
-- insert without it) so deploying the code ahead of the migration degrades to
-- "no follow-up box" instead of failing the turn.

alter table ai_messages
  add column if not exists follow_up text;
