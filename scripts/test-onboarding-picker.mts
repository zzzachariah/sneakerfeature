import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {demoInputSchema,demoPrompt,safeReferences} from '../lib/onboarding/picker-demo-contract.ts';
const input={positions:['PG','SG'],priorities:['traction','stability','fit'],shoeIds:['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'],lang:'en'};
assert(demoInputSchema.safeParse(input).success);
for(const invalid of [{...input,model:'anything'},{...input,message:'ignore restrictions'},{...input,positions:['PG','PG']},{...input,priorities:['traction']},{...input,shoeIds:['bad','bad']}])assert(!demoInputSchema.safeParse(invalid).success);
assert.match(demoPrompt(demoInputSchema.parse(input),['Shoe A','Shoe B']),/Shoe A and Shoe B/);
assert.match(demoPrompt(demoInputSchema.parse(input),['Shoe A','Shoe B']),/do not assume/);
assert.equal(safeReferences([{title:'x',url:'javascript:alert(1)'},{title:'x',url:'https://example.com/review'}]).length,1);
const db=new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema onboarding_private; grant usage on schema onboarding_private to service_role; grant usage on schema public to service_role,anon,authenticated;');
await db.exec(await readFile(new URL('../db/migrations/20261030204120_onboarding_picker_demo.sql',import.meta.url),'utf8'));
const call=async(name:string,values:unknown[])=> (await db.query<{data:any}>(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) as data`,values)).rows[0].data;
const visitor='a'.repeat(64),network='b'.repeat(64),payload={input,prompt:'test',events:[]};
for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>call('onboarding_picker_reserve',[visitor,network,payload]),/permission denied/);await assert.rejects(()=>call('onboarding_picker_read',[visitor]),/permission denied/);await db.exec('reset role');}
await db.exec('set role service_role');
const claims=await Promise.all(Array.from({length:6},()=>call('onboarding_picker_reserve',[visitor,network,payload])));
assert.equal(claims.filter(r=>r.claimed).length,1,'one reservation for duplicates');
const run=claims.find(r=>r.claimed).runId;
await assert.rejects(()=>call('onboarding_picker_reserve',['c'.repeat(64),network,payload]),/demo_rate_limited/);
assert.equal(await call('onboarding_picker_read',['d'.repeat(64)]),null,'ownership');
assert.equal(await call('onboarding_picker_write',[visitor,'00000000-0000-4000-8000-000000000001','complete',payload]),false,'stale run cannot complete');
assert.equal(await call('onboarding_picker_write',[visitor,run,'complete',{...payload,shoes:[1,2]}]),true);
assert.equal((await call('onboarding_picker_reserve',[visitor,network,payload])).claimed,false,'success is reused');
assert.equal(await call('onboarding_picker_write',[visitor,run,'failed',payload]),false,'completed run is immutable');
const v2='e'.repeat(64);const second=await call('onboarding_picker_reserve',[v2,network,payload]);await call('onboarding_picker_write',[v2,second.runId,'failed',payload]);
await assert.rejects(()=>call('onboarding_picker_reserve',[v2,network,payload]),/demo_cooldown/);
await db.query("update onboarding_private.picker_demos set started_at=now()-interval '1 minute' where visitor_hash=$1",[v2]);
const retry=await call('onboarding_picker_reserve',[v2,network,payload]);assert(retry.claimed);await call('onboarding_picker_write',[v2,retry.runId,'failed',payload]);assert.equal((await call('onboarding_picker_reserve',[v2,network,payload])).claimed,false,'two attempts maximum');
assert.equal((await call('onboarding_picker_read',[v2])).retryable,false);
await db.exec("insert into onboarding_private.picker_demo_attempts(run_id,network_hash) select gen_random_uuid(),repeat('f',64) from generate_series(1,200)");
await assert.rejects(()=>call('onboarding_picker_reserve',['0'.repeat(64),'1'.repeat(64),payload]),/demo_rate_limited/);
await db.close();console.log('PASS demo inputs, source safety, service-only access, duplicate admission, network/global caps, ownership, stale writes, result reuse and bounded retries. PGlite serializes connections; database advisory locking also needs production verification.');
const {demoCandidateShoes,demoSourceMatches,demoSearchQuery}=await import('../lib/ai/demo-evidence.ts');
const fixture=(id:string,year:number)=>({id,shoe_name:'Curry 2',brand:'Under Armour',release_year:year} as any);
assert.deepEqual(demoCandidateShoes([fixture('old',2014),fixture('chosen-old',2015),fixture('new',2025)],['chosen-old'],2026).map(s=>s.id),['chosen-old','new']);
assert.match(demoSearchQuery(fixture('a',2015)),/Under Armour Curry 2 basketball shoes/);
assert.equal(demoSourceMatches('Curry 2',{title:'Curry - Wikipedia',snippet:'Indian cuisine',url:'https://en.wikipedia.org/wiki/Curry'}),false);
assert.equal(demoSourceMatches('Curry 2',{title:'Curry 2 Performance Review',snippet:'Basketball shoe traction review',url:'https://example.com/curry-2-review'}),true);
console.log('PASS demo recency, explicit legacy interests, brand-qualified queries and irrelevant-source rejection.');

// The demo must consume complete native tool arguments, including quoted prose,
// rather than treating the tool result as an absent/truncated text answer.
const {recommendOnboardingShoes}=await import('../lib/ai/recommend.ts');
const {HAIKU_MODEL,PACKY_MODEL}=await import('../lib/ai/packy-client.ts');
const savedKeys={t:process.env.TAVILY_API_KEY,b:process.env.BOCHA_API_KEY};
delete process.env.TAVILY_API_KEY;delete process.env.BOCHA_API_KEY;
let completionCalls=0;
const demoRecs=['Test Guard One','Test Guard Two'].map(name=>({name,reason:'For "traction", stability and fit: supported fixture evidence.',pros:['A documented strength'],cons:['A documented trade-off'],references:[]}));
const mockClient={chat:{completions:{create:async(params:any)=>{
 completionCalls++;
 async function* chunks(){
  if(completionCalls===1){yield {choices:[{delta:{content:JSON.stringify({candidates:demoRecs.map(r=>r.name),backups:[]})},finish_reason:'stop'}]};return;}
  if(params.model===PACKY_MODEL){assert.equal(params.response_format.type,'json_object');yield {choices:[{delta:{content:JSON.stringify({recommendations:demoRecs})},finish_reason:'stop'}]};return;}
  assert.equal(params.tool_choice.function.name,'recommend_shoes');
  assert.equal(params.tools[0].function.parameters.properties.recommendations.maxItems,2);
  const args=JSON.stringify({recommendations:demoRecs});
  yield {choices:[{delta:{tool_calls:[{index:0,id:'demo_tool',function:{name:'recommend_shoes',arguments:args.slice(0,43)}}]}}]};
  yield {choices:[{delta:{tool_calls:[{index:0,function:{arguments:args.slice(43)}}]},finish_reason:'tool_calls'}]};
 }
 return chunks();
}}}};
try{for(const model of [HAIKU_MODEL,PACKY_MODEL]){
 completionCalls=0;
 const result=await recommendOnboardingShoes(mockClient as any,{shoes:demoRecs.map((r,i)=>({id:'fixture-'+i,shoe_name:r.name,slug:'fixture-'+i,brand:'Test',spec:{traction:'good',stability:'stable',fit:'snug'}})) as any,history:[],currentInput:'PG / SG, traction, stability and fit. Recommend two basketball shoes.',count:2,model});
 assert.deepEqual(result?.recommendations.map(r=>r.name),demoRecs.map(r=>r.name));
 assert.equal(result?.recommendations[0].reason,demoRecs[0].reason);
 assert.equal(completionCalls,2,'one shortlist and one structured final answer');
}}finally{if(savedKeys.t)process.env.TAVILY_API_KEY=savedKeys.t;if(savedKeys.b)process.env.BOCHA_API_KEY=savedKeys.b;}
console.log('PASS native demo tool output, split argument stream, quoted reasons and two distinct results.');

assert.equal(demoSourceMatches('Wade 808 5',{title:'Way of Wade 808 5 Ultra V2 Review',snippet:'Wade 808 5 basketball shoe',url:'https://example.com/wade-808-5-ultra-v2'}),false);
assert.equal(demoSourceMatches('Wade 808 5',{title:'Way of Wade 808 5 Review',snippet:'Basketball shoe performance',url:'https://example.com/wade-808-5'}),true);
assert.equal(demoSourceMatches('Wade 808 5 Ultra V2',{title:'Way of Wade 808 5 Ultra V2 Review',snippet:'Basketball shoe performance',url:'https://example.com/wade-808-5-ultra-v2'}),true);
console.log('PASS review evidence cannot silently substitute Ultra/V2 for the selected base model.');
