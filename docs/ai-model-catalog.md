# Availability policy update — 2026-11-22

The user now prioritizes availability over cc-sale. The supported groups are cc and cc-sale; use the regular cc group while cc-sale has no channels. Do not revert to cc-sale just because it is cheaper. Changes to token groups must match the catalogue metadata. Purchases, top-ups and PAYG activation remain prohibited without authorization.

Each slot may include one `fallback: {model, name}`. A picker request can switch to it only on an explicit 429/5xx before its first successful model response, using the same slot credentials. The fallback remains pinned through subsequent tool rounds, and the final response/log records the actual model. Auth/validation errors, network ambiguity and already-started streams are not replayed by this fallback. The existing SDK retry budget still applies. This reduces interruptions; it does not guarantee perpetual availability or independence from Packy. Public slot names should disclose the configured backup. Verify both candidates before relying on recovery.

# Runtime AI model catalogue

The production `app_settings` row `ai_model_catalog_v1` is the only active model mapping. `/api/ai/models` exposes a validated public projection with no credentials. The model picker and every membership model label refresh on entry, focus and every minute while visible. Membership SSR reads the same row. The backend reads it at request start and pins that snapshot across tool rounds. Updating this row does **not** require a deployment.

Three selector IDs intentionally retain their original values for saved preferences and older clients. They represent economy (`claude-haiku-4-5-20251001`), balanced (`deepseek-v4-pro`), and flagship (`claude-opus-5`) slots, not upstream model identities. Entitlements and quotas are applied to the slot before resolving the actual model. Logs record the actual model; the final chat event also returns `actualModel`. Never rename these selectors or change quotas to rotate a model.

Tool support includes tool-choice capabilities: production Fable 5.2 and Sonnet 5.5 reject forced named/required tools with HTTP 400. Their native transport uses `auto` while preserving the tool schemas; clarification and confirmed-recommendation prompts accept either the expected tool or complete JSON, with the same output validation. Other models keep their existing protocol. Verify both tool invocation and forced-choice support when rotating a model; listing tools alone does not establish both.

An intermittent cc-sale pre-generation HTTP 400 with `unknown provider for model claude-...` uses the existing SDK retry budget (one retry in production). The request keeps its model, key and group, and the final error retains its status/body. Ordinary validation/authentication errors and failures after streaming begins are not replayed by this rule. A successful retry is not proof that the provider's routing incident is resolved.

The row shape is:

```json
{
  "version": 1,
  "group": "cc",
  "revision": "2026-11-18-cc-sale",
  "models": {
    "economy": {"model":"claude-haiku-4-5-20251001","name":"Haiku 4.5"},
    "balanced": {"model":"claude-sonnet-5-5","name":"Sonnet 5.5"},
    "flagship": {"model":"claude-fable-5-2","name":"Fable 5.2"}
  }
}
```

Only operators with service-role/database access can update the row. No public write API is provided; the existing RLS SELECT policy is sufficient. This table is publicly readable: NEVER store credentials, balances, account information, internal logs or private evidence in it. The `group` field is validation metadata, not a way to change a provider token's group. Verify the three actual Packy tokens match the configured group separately.

## Maintenance procedure

1. Inspect the current Packy cc-sale catalogue and prices in the built-in browser. Prefer Fable for flagship; pick a reliable lower-cost balanced model and the cheapest supported economy model. Choose a verified supported group for availability; do not buy credits or enable paid subscriptions.
2. Save the current row as the rollback snapshot. Verify candidate availability, native Messages, tools and streaming through the appropriate existing cc-sale key using a minimal request. A model being listed is not proof it works.
3. Prepare a complete JSON object containing all three slots and run `npm run models:validate -- <catalog.json>`. Update all slots atomically in the single `app_settings` row; set `updated_at=now()` and a new revision. Do not change membership permissions, allowances, keys or history.
4. Read back the row and `/api/ai/models`; open Smart Picker and `/subscribe` and verify the actual labels. Test each changed slot through the live picker. Record actual search successes, failures and source links separately from model success.
5. If live verification fails, restore the last verified available mapping atomically, then retest. If no supported group is viable, report the limitation. Invalid configuration/read errors fail AI requests before reserving credits; UI retains the last valid display.
6. Update the existing daily `category=ai_api` report with the fixed run ID and sanitized bilingual evidence, plus uncovered paths. Never claim a configuration test is a live UI test.

`npm run test:model-catalog` verifies hot updates between requests, snapshot stability within a tool loop, native routing, per-slot credentials, invalid-group refusal, legacy preferences and unchanged allowances. `scripts/test-packy-protocol.mts` covers native Messages/stream/tool conversion.

A one-time deployment introduces this mechanism. Subsequent model/name changes require only the verified database update. The scheduled maintenance is responsible for candidate verification; normal page views do not spend AI credits probing models.
