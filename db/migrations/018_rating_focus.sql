-- Per-user rating focus: pick three dimensions in priority order.
-- example value: {"primary":"court_feel","secondary":"bounce","tertiary":"traction"}
-- null = not picked yet → user sees the "pick playstyle" prompt instead of stars.

alter table profiles
  add column if not exists rating_focus jsonb;
