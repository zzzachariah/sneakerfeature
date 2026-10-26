import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

// Explicit integration test: real local image, real unchanged upstream model,
// fresh headless browser profile. No account, personal profile or API key.
const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: npm run test:imgly:browser -- /absolute/product-image.jpg [evidence-directory]");
const source = await fs.readFile(inputPath);
const mime = source.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" :
  source[0] === 255 && source[1] === 216 ? "image/jpeg" :
  source.toString("ascii", 0, 4) === "RIFF" && source.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
assert.ok(mime, "Use a real PNG/JPEG/WebP product photograph");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "snkr-imgly-regression-"));
const evidence = path.resolve(process.argv[3] ?? temporary);
await fs.mkdir(evidence, { recursive: true });
const modules = { patched: "@imgly/background-removal" };
if (process.env.IMG_LY_BASELINE_MODULE) modules.upstream = path.resolve(process.env.IMG_LY_BASELINE_MODULE);
for (const [label, module] of Object.entries(modules)) {
  await build({ stdin: {
    contents: `import { removeBackground } from ${JSON.stringify(module)}; export { removeBackground };`,
    resolveDir: process.cwd(), sourcefile: `${label}-entry.mjs`,
  }, bundle: true, splitting: true, format: "esm", platform: "browser", target: "es2022",
  outdir: temporary, entryNames: label, outExtension: { ".js": ".mjs" }, logLevel: "silent" });
}
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/input") { res.writeHead(200, { "content-type": mime }); res.end(source); return; }
    if (req.url === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><title>IMG.LY isolated integration test</title>"); return; }
    const name = path.basename(new URL(req.url, "http://localhost").pathname);
    if (!/\.(mjs|js|wasm)$/.test(name)) { res.writeHead(404).end(); return; }
    const body = await fs.readFile(path.join(temporary, name));
    res.writeHead(200, { "content-type": name.endsWith("wasm") ? "application/wasm" : "text/javascript" }); res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
});
const context = await browser.newContext({ serviceWorkers: "block" });
const page = await context.newPage();
page.setDefaultTimeout(180_000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const results = {};
try {
  await page.goto(origin);
  for (const label of Object.keys(modules)) {
    const started = Date.now();
    const result = await page.evaluate(async label => {
      const { removeBackground } = await import(`/${label}.mjs`);
      const input = await (await fetch("/input")).blob();
      const progress = [];
      const output = await removeBackground(input, { progress: (key, current, total) => {
        if (typeof key !== "string" || !Number.isFinite(current) || !Number.isFinite(total)) throw new Error("Invalid progress callback contract");
        progress.push({ key, current, total });
      } });
      const bitmap = await createImageBitmap(output);
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(bitmap, 0, 0);
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0, foreground = 0;
      for (let i = 3; i < rgba.length; i += 4) { if (rgba[i] === 0) transparent++; if (rgba[i] > 128) foreground++; }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", rgba))).map(x => x.toString(16).padStart(2, "0")).join("");
      const encoded = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(output); });
      return { width: canvas.width, height: canvas.height, mime: output.type, bytes: output.size,
        transparentPixels: transparent, foregroundPixels: foreground, pixelSha256: hash, progressEvents: progress.length,
        finalProgressKeys: [...new Set(progress.map(x => x.key))], dataUrl: encoded };
    }, label);
    const { dataUrl, ...metadata } = result;
    assert.equal(metadata.mime, "image/png");
    assert.ok(metadata.width > 0 && metadata.height > 0);
    assert.ok(metadata.transparentPixels > 0 && metadata.foregroundPixels > 0, "Real inference must retain the shoe and remove part of its background");
    assert.ok(metadata.progressEvents > 0, "Actual model load/inference must invoke progress");
    await fs.writeFile(path.join(evidence, `${label}-output.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
    results[label] = { ...metadata, durationMs: Date.now() - started };
  }
  if (results.upstream) {
    assert.equal(results.patched.width, results.upstream.width);
    assert.equal(results.patched.height, results.upstream.height);
    assert.equal(results.patched.pixelSha256, results.upstream.pixelSha256, "The schema-only patch must preserve real model output pixels");
  }
  assert.deepEqual(errors, []);
  const report = { checkedAt: new Date().toISOString(), independentEphemeralBrowser: true, personalBrowserUsed: false,
    inputSha256: createHash("sha256").update(source).digest("hex"), sourceMime: mime, results, errors, passed: true };
  await fs.writeFile(path.join(evidence, "imgly-browser-regression.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
  if (temporary !== evidence) await fs.rm(temporary, { recursive: true, force: true });
}
