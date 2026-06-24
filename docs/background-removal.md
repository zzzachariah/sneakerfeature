# Background removal for shoe images

One-time, **local** batch that cuts the background out of every shoe photo and
re-uploads the transparent version so the site serves clean cut-outs with zero
runtime cost.

## Why local + batch (not at render time)

PR #320 tried to remove backgrounds in the browser at render time with
`@imgly/background-removal`. Every card kicked off its own WASM job, which
thrashed the main thread and made scrolling/tapping laggy — it was reverted
(`05917b0`). Doing the work once, offline, and storing the result avoids all of
that: the app just shows the already-transparent PNGs.

## How images flow

- Stored in Supabase Storage bucket `shoe-images`, path `shoes/{shoeId}/…`.
- The image shown anywhere on the site is the **latest `approved` row** in the
  `shoe_images` table (`lib/data/shoes.ts` → `resolveApprovedImage`). One source,
  so swapping it updates cards, detail, compare, picker — everywhere at once.
- History is kept: the script inserts a new `approved` row and demotes the old
  one to `rejected`. **Fully reversible** — nothing is deleted.

## Prerequisites

1. **rembg** (the cut-out engine) on your PATH:
   ```bash
   pip install "rembg[cli]" onnxruntime
   ```
   The first run downloads the model to `~/.u2net` — be patient.
2. **Node deps** (includes `sharp` for QA + framing):
   ```bash
   npm install
   ```
3. **`.env.local`** at the repo root with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=…
   SUPABASE_SERVICE_ROLE_KEY=…        # service-role bypasses RLS; keep it secret
   ```

## Run it

Always dry-run first — it writes preview PNGs to a temp dir and uploads nothing:

```bash
npm run images:nobg                 # DRY RUN, all approved images
npm run images:nobg -- --slug nike-foo   # one shoe
npm run images:nobg -- --limit 5    # first 5 only
```

Inspect the previews — they're written to `bgremove-preview/` at the repo root
(gitignored; the exact path is printed at the end). When happy, go live:

```bash
npm run images:nobg -- --apply           # upload + swap the live image
npm run images:nobg -- --apply --force   # also redo ones already processed
```

It's **idempotent**: processed rows are tagged `provider="rembg"`, so re-runs
skip them unless you pass `--force`.

### Flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--apply` | off (dry run) | actually upload and swap the live image |
| `--force` | off | reprocess images already cut out |
| `--slug <slug>` | — | only this shoe |
| `--limit <n>` | — | only the first N |
| `--size <px>` | 1000 | output square size |
| `--format webp\|png` | webp | upload format. WebP is 5-10× smaller than PNG at near-lossless quality, so uploads are much faster on slow networks |
| `--concurrency <n>` | 2 | parallel workers. Each runs `download → rembg → upload` for one shoe; with N>1 the network parts overlap with the CPU-bound rembg step, so wall-clock time drops noticeably. Raise it if your CPU + bandwidth allow; back off to 1 if rembg starts OOM-ing |

### Resilience

Every Supabase Storage call (download/upload) and database write goes through a
retry-with-exponential-backoff helper (1s → 2s → 4s → 8s, max 4 attempts), so a
single network blip — the classic `fetch failed` — no longer abandons that
shoe. The retry messages are printed inline; the run only counts a shoe as
"errored" after every attempt has failed.

### Quality gate

After each cut-out the script measures alpha coverage. If < 2% (rembg ate the
shoe) or > 98.5% (nothing was removed), it **keeps the original** and reports the
skip, so a bad cut never goes live. The shoe is then scaled proportionally
(contain-fit, never cropped) and re-centered in a padded square so framing is
uniform.

After `--apply`, trigger a redeploy (or wait for ISR) so the site picks up the
new images.

## Cross-theme look

Transparent cut-outs are rendered on an **adaptive stage** instead of a flat
page background (see `.shoe-stage` / `.shoe-img` in `app/globals.css` and
`components/shoe/shoe-image.tsx`):

- A mid-tone radial gradient — light grey on the light theme, charcoal on dark —
  guarantees edge contrast for **both** near-white and near-black shoes (a flat
  white or flat black backdrop would hide one of them).
- A `drop-shadow` that follows the shoe's alpha silhouette lifts it off the
  stage. The dark theme adds a faint light rim so black shoes still separate.
  It's GPU-composited, so it has none of the cost of the reverted WASM approach.

Originals that haven't been processed yet (still on a white plate) render that
plate over the stage and degrade cleanly, so a partial rollout looks fine.
