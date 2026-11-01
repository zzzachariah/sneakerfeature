import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type OpenAIType from 'openai';
// Match the application's CommonJS resolution under tsx; the SDK has separate ESM classes.
const OpenAI = createRequire(import.meta.url)('openai').default as typeof OpenAIType;
import { recoverPickerRun, pickerFailureDiagnostic } from '../lib/onboarding/picker-recovery.ts';

const error = (status: number) => new OpenAI.APIError(status, {message:'PRIVATE PROVIDER BODY'}, 'PRIVATE PROVIDER BODY', new Headers());
const attempts: string[] = [];
const primaryError=error(503), backupError=error(429);
const invoke = (primary:()=>Promise<string>, backup:(()=>Promise<string>)|null, remaining=100_000) => recoverPickerRun({primary,backup,deadline:{at:Date.now()+remaining},onFailure:(_,backup)=>attempts.push(backup?'backup failed':'primary failed'),onRecovery:async()=>{attempts.push('recovery recorded');}});
assert.equal(await invoke(async()=> 'ready',async()=>{throw Error('must not run');}),'ready');
assert.deepEqual(attempts,[]);
assert.equal(await invoke(async()=>{throw primaryError;},async()=>{attempts.push('backup');return 'recovered';}),'recovered');
assert.deepEqual(attempts,['primary failed','recovery recorded','backup']);
attempts.length=0;
await assert.rejects(()=>invoke(async()=>{throw primaryError;},async()=>{throw backupError;}),e=>e===backupError);
assert.deepEqual(attempts,['primary failed','recovery recorded','backup failed'],'at most one backup attempt');
for(const cause of [error(400),error(401),error(403),Error('invalid output')]) {
  await assert.rejects(()=>invoke(async()=>{throw cause;},async()=>{assert.fail('nonrecoverable error must not retry');}),e=>e===cause);
}
await assert.rejects(()=>invoke(async()=>{throw primaryError;},async()=>{assert.fail('insufficient time');},10_000),e=>e===primaryError);
await assert.rejects(()=>invoke(async()=>{throw primaryError;},null),e=>e===primaryError);
assert.equal(await invoke(async()=>{throw new OpenAI.APIConnectionError({message:'private socket detail'});},async()=> 'reconnected'),'reconnected');
assert.deepEqual(pickerFailureDiagnostic(primaryError),{httpStatus:503,category:'provider'});
assert.ok(!JSON.stringify(pickerFailureDiagnostic(primaryError)).includes('PRIVATE'));
console.log('PASS bounded model recovery, terminal failure, nonretryable errors, time budget, and safe diagnostics.');
