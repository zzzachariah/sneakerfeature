import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { DEFAULT_MODEL_CATALOG, modelCatalogSchema, catalogModel, catalogPickerModels } from '../lib/ai/model-catalog';
import { MODEL_IDS, tierSupportsModel, isAllowanceMetered, TIERS } from '../lib/subscription/tiers';
import { parseMemberPrefs, resolveModelChoice } from '../lib/subscription/resolve';
import { createPackyClientForModel } from '../lib/ai/packy-client';

assert(modelCatalogSchema.safeParse(DEFAULT_MODEL_CATALOG).success);
assert(!modelCatalogSchema.safeParse({...DEFAULT_MODEL_CATALOG, group:'cc-expensive'}).success);
assert(!modelCatalogSchema.safeParse({...DEFAULT_MODEL_CATALOG, apiKey:'never-public'}).success);
assert(!modelCatalogSchema.safeParse({...DEFAULT_MODEL_CATALOG, models:{...DEFAULT_MODEL_CATALOG.models, flagship:{model:'https://evil.test',name:'unsafe'}}}).success);
const next = structuredClone(DEFAULT_MODEL_CATALOG);
next.models.flagship = {model:'claude-fable-next',name:'Fable Next'};
assert.equal(catalogPickerModels(next)[2].name,'Fable Next');
assert.equal(catalogModel(next,MODEL_IDS.opus)?.model,'claude-fable-next');
assert.equal(resolveModelChoice('pro',parseMemberPrefs({modelId:'deepseek-v4-pro'})),MODEL_IDS.deepseek);
assert.equal(resolveModelChoice('max',parseMemberPrefs({modelId:'claude-opus-5'})),MODEL_IDS.opus);
assert(!tierSupportsModel('free',MODEL_IDS.opus));
assert(tierSupportsModel('pro',MODEL_IDS.opus));
assert(isAllowanceMetered('pro',MODEL_IDS.opus));
assert(!isAllowanceMetered('pro',MODEL_IDS.deepseek));
assert.deepEqual([TIERS.pro.capabilities.monthlyAllowance,TIERS.max.capabilities.monthlyAllowance],[120,600]);

// The very same SDK client must stay on one validated snapshot for all tool
// rounds; a NEW request picks up a DB edit without a deployment. Assert routing
// at the actual HTTP boundary, including the slot-specific key and protocol.
const savedFetch = globalThis.fetch;
const savedEnv = {...process.env};
let active = DEFAULT_MODEL_CATALOG;
let reads=0;
const calls:{model:string;key:string|null;url:string}[]=[];
process.env.NEXT_PUBLIC_SUPABASE_URL='https://catalog-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-service';
process.env.PACKYAPI_BASE_URL='https://relay.example/v1';
process.env.PACKYAPI_API_KEY='fixture-balanced';
process.env.PACKYAPI_API_KEY_HAIKU='fixture-economy';
process.env.PACKYAPI_API_KEY_FABLE='fixture-flagship';
delete process.env.PACKYAPI_API_KEY_OPUS;
globalThis.fetch=async (input,init)=>{
 const r=new Request(input,init);
 if(r.url.startsWith('https://catalog-test.supabase.co/')){reads++;return new Response(JSON.stringify({value:active}),{headers:{'content-type':'application/json'}});}
 const body=await r.json();calls.push({model:body.model,key:r.headers.get('authorization'),url:r.url});
 return new Response(JSON.stringify({id:'fixture',model:body.model,content:[{type:'text',text:'ok'}],stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1}}),{headers:{'content-type':'application/json'}});
};
const send=(client:OpenAI,model:string)=>client.chat.completions.create({model,max_tokens:16,messages:[{role:'user',content:'fixture'}]});
try {
 const first=createPackyClientForModel(MODEL_IDS.opus)!;
 await send(first,MODEL_IDS.opus);
 active=next;
 await send(first,MODEL_IDS.opus);
 assert.equal(reads,1);
 assert.equal(calls[0].model,'claude-fable-5-2');
 assert.equal(calls[1].model,'claude-fable-5-2');
 const second=createPackyClientForModel(MODEL_IDS.opus)!;
 await send(second,MODEL_IDS.opus);
 assert.equal(calls[2].model,'claude-fable-next');
 assert.equal(calls[2].key,'Bearer fixture-flagship');
 assert.equal(calls[2].url,'https://relay.example/v1/messages');
 for(const [slot,key] of [[MODEL_IDS.haiku,'fixture-economy'],[MODEL_IDS.deepseek,'fixture-balanced']] as const){
  await send(createPackyClientForModel(slot)!,slot);
  assert.equal(calls.at(-1)!.key,`Bearer ${key}`);
  assert.equal(calls.at(-1)!.model,catalogModel(active,slot)!.model);
 }
 active={...next,group:'cc-expensive'} as any;
 const before=calls.length;
 await assert.rejects(send(createPackyClientForModel(MODEL_IDS.opus)!,MODEL_IDS.opus));
 assert.equal(calls.length,before,'Invalid configuration must not reach provider');
 console.log('Model catalogue: hot swap, pinned tool rounds, native protocol, group validation, credentials and entitlements passed.');
} finally {globalThis.fetch=savedFetch;for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];Object.assign(process.env,savedEnv);}
