import { readFile } from 'node:fs/promises';
import { modelCatalogSchema } from '../lib/ai/model-catalog';
const path=process.argv[2];
if(!path)throw new Error('Usage: tsx scripts/validate-model-catalog.mts <catalog.json>');
const parsed=modelCatalogSchema.safeParse(JSON.parse(await readFile(path,'utf8')));
if(!parsed.success)throw new Error('Invalid model catalogue; must contain only the supported public fields and cc-sale group.');
console.log('Model catalogue format valid. Live provider checks are still required before activation.');
