# Scoped security fork of IMG.LY Background Removal 1.7.0

This local package is `@imgly/background-removal@1.7.0-snkrfeature.1`. It uses the exact published 1.7.0 source-map sources. `UPSTREAM.json` records npm tarball integrity and SHA256. Original package metadata, README, changelog, AGPL license and all third-party licenses are retained.

The only runtime source change is `src/schema.ts`: configuration validation uses Zod 4.6.7. Upstream's npm bundle inlined Zod 3.24.2; overriding only its dependency declaration would leave the old implementation running. These distributions are rebuilt from source, and Zod is now external and pinned to 4.6.7.

- `prefault` preserves recursive defaults and preprocessing: omitted model `medium` still resolves to `isnet_fp16`, and omitted output still becomes PNG at quality 0.8.
- Progress callbacks retain string/number/number argument validation, preserved extra arguments, and an undefined return requirement. Callbacks are wrapped, not just accepted by `typeof`.
- Resource identity stays at upstream version 1.7.0, including explicit `${PACKAGE_VERSION}` substitution. The default is `https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/`.
- The six public runtime exports, model bytes, ONNX 1.21.0, inference resolution, execution paths, image codecs and output processing are unchanged. Public `Config` stays structurally compatible and also describes existing model aliases.

After installing the repository's pinned dependencies:

```
node vendor/imgly-background-removal/scripts/build.mjs
node vendor/imgly-background-removal/scripts/build.mjs --check
npx tsx scripts/test-imgly-config.mts
```

Build uses repository esbuild 0.28.1, checks exact upstream exports, rejects inlined Zod/old Zod3, and records bundle hashes. It does not patch installed third-party packages or use postinstall hooks.

Upstream sources and corresponding modifications remain available under the retained AGPL license. No upstream license text was changed.
