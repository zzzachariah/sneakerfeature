import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { validateConfig, ConfigSchema } from '../vendor/imgly-background-removal/src/schema';

let checks = 0;
function check(name: string, test: () => void) {
  test();
  checks++;
  console.log(`PASS ${name}`);
}

const resourceUrl = 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/';
const defaults = {
  publicPath: resourceUrl,
  debug: false,
  rescale: true,
  device: 'cpu',
  proxyToWorker: false,
  fetchArgs: {},
  model: 'isnet_fp16',
  output: { format: 'image/png', quality: 0.8 }
};
check('recursive defaults and medium preprocessing remain upstream-equivalent', () => {
  assert.deepEqual(validateConfig(), defaults);
  assert.deepEqual(validateConfig({}), defaults);
  assert.deepEqual(ConfigSchema.parse(undefined), defaults);
  assert.deepEqual(validateConfig(null as unknown as undefined), defaults);
});
check('model aliases and canonical model identifiers preserve their mapping', () => {
  for (const [input, expected] of [
    ['small', 'isnet_quint8'], ['medium', 'isnet_fp16'], ['large', 'isnet'],
    ['isnet_quint8', 'isnet_quint8'], ['isnet_fp16', 'isnet_fp16'], ['isnet', 'isnet']
  ] as const) assert.equal(validateConfig({ model: input }).model, expected);
});
check('fork package version does not change upstream asset substitution', () => {
  assert.equal(validateConfig({ publicPath: 'https://assets.test/${PACKAGE_NAME}/${PACKAGE_VERSION}/' }).publicPath,
    'https://assets.test/@imgly/background-removal/1.7.0/');
});
check('partial output objects still receive inner defaults', () => {
  assert.deepEqual(validateConfig({ output: {} }).output, defaults.output);
  assert.deepEqual(validateConfig({ output: { quality: 0.4 } }).output, { format: 'image/png', quality: 0.4 });
  assert.deepEqual(validateConfig({ output: { format: 'image/webp' } }).output, { format: 'image/webp', quality: 0.8 });
  for (const format of ['image/png', 'image/jpeg', 'image/webp', 'image/x-rgba8', 'image/x-alpha8'] as const) {
    assert.equal(validateConfig({ output: { format } }).output.format, format);
  }
});
check('explicit runtime choices and fetch arguments remain intact', () => {
  const fetchArgs = { credentials: 'omit', headers: { 'x-test': 'configuration-only' } };
  const result = validateConfig({ device: 'gpu', rescale: false, proxyToWorker: true, fetchArgs });
  assert.equal(result.device, 'gpu');
  assert.equal(result.rescale, false);
  assert.equal(result.proxyToWorker, true);
  assert.equal(result.fetchArgs, fetchArgs);
});
check('unknown keys are stripped at root and nested output as upstream', () => {
  const parsed = ConfigSchema.parse({ unused: true, output: { extra: 'ignored' } });
  assert.equal('unused' in parsed, false);
  assert.equal('extra' in parsed.output, false);
});
check('invalid root values, enums and primitive field types fail', () => {
  for (const value of [false, 1, 'config', [], { device: 'tpu' }, { model: 'other' },
    { publicPath: null }, { debug: 'true' }, { rescale: 0 }, { proxyToWorker: 1 },
    { progress: 'callback' }, { output: null }, { output: { format: 'image/gif' } },
    { output: { quality: '0.8' } }, { output: { quality: NaN } }]) {
    assert.equal(ConfigSchema.safeParse(value).success, false, JSON.stringify(value));
  }
});
check('upstream Infinity number acceptance is preserved while NaN fails', () => {
  assert.equal(validateConfig({ output: { quality: Infinity } }).output.quality, Infinity);
  assert.equal(validateConfig({ output: { quality: -Infinity } }).output.quality, -Infinity);
});
check('callback wrapper preserves validated arguments, extra arguments and this', () => {
  let captured: unknown[] | undefined;
  let context: unknown;
  const callback = function (this: unknown, ...args: unknown[]) { captured = args; context = this; };
  const parsed = validateConfig({ progress: callback });
  assert.notEqual(parsed.progress, callback);
  const thisValue = { marker: 'callback context' };
  Reflect.apply(parsed.progress!, thisValue, ['compute:decode', 0, 4, 'extra']);
  assert.deepEqual(captured, ['compute:decode', 0, 4, 'extra']);
  assert.equal(context, thisValue);
  Reflect.apply(parsed.progress!, undefined, ['legacy:number', Infinity, -Infinity]);
});
check('callback bad input fails before calling user callback', () => {
  let called = 0;
  const wrapped = validateConfig({ progress: () => { called++; } }).progress!;
  for (const args of [[], ['key', 0], [1, 0, 4], ['key', '0', 4], ['key', 0, NaN]]) {
    assert.throws(() => Reflect.apply(wrapped, undefined, args));
  }
  assert.equal(called, 0);
});
check('callback return-value validation and thrown error propagation remain intact', () => {
  const invalidReturn = validateConfig({ progress: () => 7 }).progress!;
  assert.throws(() => invalidReturn('key', 0, 4));
  const invalidAsyncReturn = validateConfig({ progress: async () => undefined }).progress!;
  assert.throws(() => invalidAsyncReturn('key', 0, 4));
  const error = new Error('original callback failure');
  const throws = validateConfig({ progress: () => { throw error; } }).progress!;
  assert.throws(() => throws('key', 0, 4), (actual) => actual === error);
});
check('debug fallback still creates a progress callback', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'crossOriginIsolated');
  const log = console.log;
  const debug = console.debug;
  try {
    Object.defineProperty(globalThis, 'crossOriginIsolated', { value: false, configurable: true });
    console.log = () => {};
    console.debug = () => {};
    const config = validateConfig({ debug: true });
    assert.equal(typeof config.progress, 'function');
    config.progress!('fetch:fixture', 1, 2);
  } finally {
    console.log = log;
    console.debug = debug;
    if (previous) Object.defineProperty(globalThis, 'crossOriginIsolated', previous);
    else Reflect.deleteProperty(globalThis, 'crossOriginIsolated');
  }
});

const fork = new URL('../vendor/imgly-background-removal/', import.meta.url);
const expected = ['alphamask', 'applySegmentationMask', 'preload', 'removeBackground', 'removeForeground', 'segmentForeground'];
const esm = await import(new URL('dist/index.mjs', fork).href);
const cjs = createRequire(import.meta.url)(new URL('dist/index.cjs', fork).pathname) as Record<string, unknown>;
check('ESM and CJS preserve the exact six upstream runtime exports', () => {
  assert.deepEqual(Object.keys(esm).sort(), expected);
  assert.deepEqual(Object.keys(cjs).sort(), expected);
  for (const name of expected) {
    assert.equal(typeof esm[name], 'function');
    assert.equal(typeof cjs[name], 'function');
  }
});
const manifest = JSON.parse(await readFile(new URL('dist/BUILD_MANIFEST.json', fork), 'utf8')) as { files: Record<string, string> };
for (const [file, sha256] of Object.entries(manifest.files)) {
  const content = await readFile(new URL(file, fork));
  check(`committed ${file} hash and no inlined Zod 3`, () => {
    assert.equal(createHash('sha256').update(content).digest('hex'), sha256);
    assert.doesNotMatch(content.toString(), /zod@3|ZodFirstPartyTypeKind|node_modules.*zod\/v3/);
  });
}
console.log(`${checks} IMG.LY compatibility checks passed; no model inference or network calls performed.`);
