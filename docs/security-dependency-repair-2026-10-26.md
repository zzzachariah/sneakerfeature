# Dependency security repair — 2026-10-26

The website quality gate detected two Next.js advisories and a Zod advisory in the existing dependency tree. This repair keeps the security gate enabled and retains the current API endpoints, model identifiers, prompts, ONNX runtime and image model resources.

## Fixed dependency set

| Dependency | Fixed version | Reason |
| --- | --- | --- |
| `next`, `eslint-config-next` | `15.5.28` | Same-line security patch for both Next.js advisories. |
| `zod` | `4.6.7` | Patched v4 implementation; no v3 compatibility import. |
| `openai` | `6.0.0` | First official SDK major accepting the Zod4 package as a peer. This application uses core Chat Completions, not Zod helpers. |
| `@imgly/background-removal` | `file:vendor/imgly-background-removal` (`1.7.0-snkrfeature.1`) | Scoped source rebuild replacing the bundled Zod3 configuration validator. |

Official sources: [Next RCE advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Next Server Actions advisory](https://github.com/advisories/GHSA-p3m5-59mp-jv5r), [Next 15.5.28 release](https://github.com/vercel/next.js/releases/tag/v15.5.28), [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [Zod v3 issue and maintainer response](https://github.com/colinhacks/zod/issues/6653), [Zod migration guide](https://zod.dev/v4/changelog), [OpenAI 6.0.0 registry metadata](https://registry.npmjs.org/openai/6.0.0).

## Why IMG.LY is a local source dependency

The official 1.7.0 release still declares Zod3 and embeds Zod3.24.2 in its JavaScript bundles. An override would leave that embedded implementation running. The local package recovers the exact published upstream sources and rebuilds them with an external, exact Zod4.6.7 dependency.

Only its configuration schema changes. Preprocessing defaults, `medium` → `isnet_fp16`, PNG quality 0.8, callback argument/return checks, additional callback arguments, all six runtime exports, ONNX1.21.0 and the upstream 1.7.0 CDN identity are preserved. Original source hashes, npm integrity, licenses and a detailed patch record are under `vendor/imgly-background-removal/`.

The build rejects changed upstream files outside the reviewed schema, stale distributions and bundled Zod3. Its committed ESM/CJS files and source maps can be reproduced with:

```sh
npm run vendor:imgly:build
npm run vendor:imgly:check
```

Third-party source files are excluded from the application's TypeScript project; application imports use the vendor package's public declarations. The modified schema was also checked separately with strict TypeScript.

## Application compatibility

Zod4's GUID validator preserves the previously accepted 8-4-4-4-12 identifier contract, including legacy fixture identifiers. The application keeps its existing validation messages. OpenAI6's function/custom tool-call union is narrowed before accessing function arguments; ordinary function calls and JSON content fallbacks preserve their existing behavior. No model, prompt, endpoint or account permission was changed.

## Verification

`test:core` includes configuration/callback tests, upstream integrity and deterministic build checks, Zod application contract tests, and SDK transport/helper regressions. The SDK test uses a fake transport and no keys or real model calls; its JSON/tools/image bodies, custom base path, SSE extensions, retry and abort cases passed against both the previous 4.104.0 SDK and 6.0.0.

A separate real-image browser regression ran both the local package and original official 1.7.0 on the same 1000×1000 adult Zion4 product photograph. Both loaded the original `isnet_fp16` and ONNX1.21 resources, produced 31 progress events, and returned identical 264,905-byte PNGs with identical decoded RGBA SHA256:

`a56d937728d5725a4a59af2e96306b396459cb369f98fcd00d262cc02a131e79`

The test used a new headless browser profile with no personal session. It is reproducible with any explicit local product photograph:

```sh
# Install the agent/test browser separately; no personal browser profile is used.
node node_modules/playwright-core/cli.js install chromium
npm run test:imgly:browser -- /absolute/product-photo.jpg /absolute/evidence-directory
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select a dedicated test browser binary. `IMG_LY_BASELINE_MODULE` optionally points to the original official 1.7.0 `dist/index.mjs` for an exact pixel comparison. This integration test is separate from fast CI tests because it downloads the real model resources. It never updates catalogue images or database records.

Fresh `npm ci`, application lint/type/core tests, deterministic vendor checks and the Next15.5.28 production build passed. The production audit returned zero vulnerabilities of every severity. PR CI and deployment verification remain required before release; these local results do not by themselves confirm a live deployment.
