import { build, version as esbuildVersion } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
if (esbuildVersion !== '0.28.1') throw new Error(`Expected esbuild 0.28.1, found ${esbuildVersion}`);
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (pkg.dependencies.zod !== '4.6.7') throw new Error('The reviewed Zod dependency must remain pinned to 4.6.7');
const upstream = JSON.parse(await readFile(path.join(root, 'UPSTREAM.json'), 'utf8'));
for (const [file, expectedHash] of Object.entries({
  ...upstream.original_source_sha256,
  ...upstream.original_retained_files_sha256
})) {
  if (file === 'src/schema.ts') continue;
  const hash = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
  if (hash !== expectedHash) throw new Error(`Unreviewed upstream source or license change: ${file}`);
}
const expectedExports = ['alphamask', 'applySegmentationMask', 'preload', 'removeBackground', 'removeForeground', 'segmentForeground'];
const manifest = { package: `${pkg.name}@${pkg.version}`, esbuild: esbuildVersion, files: {} };
for (const [format, extension] of [['esm', 'mjs'], ['cjs', 'cjs']]) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['src/index.ts'],
    bundle: true,
    sourcemap: true,
    platform: 'browser',
    external: ['onnxruntime-web', 'onnxruntime-web/*', 'zod'],
    format,
    outfile: `dist/index.${extension}`,
    metafile: true,
    write: false
  });
  if (Object.keys(result.metafile.inputs).some((name) => /(?:^|\/)zod(?:\/|@)/.test(name))) {
    throw new Error('Zod must remain external; stale inlined validation code is forbidden');
  }
  const entry = result.metafile.outputs[`dist/index.${extension}`];
  if (format === 'esm' && JSON.stringify([...entry.exports].sort()) !== JSON.stringify(expectedExports)) {
    throw new Error(`Public exports changed: ${entry.exports.join(', ')}`);
  }
  for (const output of result.outputFiles) {
    const relative = path.relative(root, output.path).split(path.sep).join('/');
    if (/(?:zod@3|ZodFirstPartyTypeKind|node_modules.*zod\/v3)/.test(output.text)) {
      throw new Error(`Old Zod 3 code found in ${relative}`);
    }
    manifest.files[relative] = createHash('sha256').update(output.contents).digest('hex');
    if (check) {
      const current = await readFile(output.path);
      if (!current.equals(Buffer.from(output.contents))) throw new Error(`Build output is stale: ${relative}`);
    } else {
      await mkdir(path.dirname(output.path), { recursive: true });
      await writeFile(output.path, output.contents);
    }
  }
}
const manifestPath = path.join(root, 'dist/BUILD_MANIFEST.json');
const serialized = JSON.stringify(manifest, null, 2) + '\n';
if (check) {
  if (await readFile(manifestPath, 'utf8') !== serialized) throw new Error('Build manifest is stale');
  console.log('IMG.LY fork build is reproducible; exports and absence of bundled Zod 3 verified.');
} else {
  await writeFile(manifestPath, serialized);
  console.log('Built IMG.LY fork with external Zod 4, original ONNX runtime and original data version.');
}
