import assert from "node:assert/strict";
import type OpenAI from "openai";
import type {Shoe} from "../lib/types";
import {recommendShoes} from "../lib/ai/recommend";
import {confirmedSourceMatches, type ConfirmedRecommendationError} from "../lib/ai/confirmed-recommend";
import {HAIKU_MODEL, PACKY_MODEL} from "../lib/ai/packy-client";
import {startDeadline} from "../lib/ai/budget";

type Request = {
  model: string; messages: {content: string}[];
  tool_choice?: {function: {name: string}} | "auto"; parallel_tool_calls?: boolean;
  response_format?: {type: string};
  tools?: {function: {name: string; parameters: {properties: {
    candidates?: {minItems: number; maxItems: number};
    recommendations?: {minItems: number; maxItems: number};
  }}}}[];
};
// Node 22's tsx ESM/CJS interop can load the same Error subclass twice.
// Assert its complete public error contract instead of constructor identity.
const expectedFailure = (code: ConfirmedRecommendationError["code"]) => ({
  name:"ConfirmedRecommendationError", message:`confirmed_picker_${code}`, code,
});
const names = Array.from({length:12},(_,index)=>`Confirm Shoe ${index+1}`);
const shoes: Shoe[] = names.map((shoe_name,index)=>({
  id:`confirmed-${index}`,slug:`confirmed-${index}`,brand:"Fixture",shoe_name,release_year:index?2026:2014,weight:index?"355g":null,
  spec:{traction:"Good traction",stability:"Stable",fit:index===2?"Narrow forefoot; instep pressure":"Secure fit",cushioning_feel:"Documented soft cushioning",forefoot_midsole_tech:"Documented forefoot",heel_midsole_tech:"Documented heel",outsole_tech:"Documented rubber",upper_tech:index===0?null:"Documented upper"},
}));
const secret="PRIVATE-NOTE-777";
const currentInput=`Original priorities: traction, stability, fit. [CONFIRMED CORRECTION] Comfort now comes before traction. Wide feet, high instep, outdoor use, budget 800 CNY. Older shoes are acceptable. Additional note: ${secret}.`;
const priorRecommendations={last:[names[7],names[4]],all:names};
const history=[
  ...Array.from({length:8},(_,index)=>({role:"user" as const,content:index===0?"STALE-HISTORY-MUST-BE-OMITTED":`Earlier request ${index}`})),
  {role:"assistant" as const,content:`Earlier price assumptions. ${"x".repeat(1900)} END-OF-PRIOR-RECOMMENDATIONS: ${names[7]}, then ${names[4]}`},
  {role:"user" as const,content:"The first shoe was too expensive; comfort now comes before traction."},
];
const source=(index:number,price=false)=>`https://evidence.example/confirm-shoe-${index+1}/${price?"price":"review"}`;
const variant=(index:number)=>`https://evidence.example/confirm-shoe-${index+1}-ultra-v2/review`;
const originalFetch=globalThis.fetch;
const originalEnv={key:process.env.TAVILY_API_KEY,provider:process.env.WEB_SEARCH_PROVIDER,bocha:process.env.BOCHA_API_KEY};
process.env.TAVILY_API_KEY="fixture-not-real";
process.env.WEB_SEARCH_PROVIDER="tavily";
delete process.env.BOCHA_API_KEY;
let active=0,maxActive=0,round=0,stage:"shortlist"|"search"|"final"="shortlist";
const queries:{round:number;query:string;price:boolean}[]=[];
globalThis.fetch=async(input,init)=>{
  assert.equal(String(input),"https://api.tavily.com/search","No real network endpoint is allowed");
  assert.equal(stage,"search","The model must shortlist before any search, and finish search before final output");
  const request=JSON.parse(String(init?.body));
  assert.equal(request.search_depth,"basic");assert.equal(request.include_answer,false);
  const query=String(request.query);
  assert(!query.includes(secret),"Original notes never go to the search provider");
  const index=names.findIndex(name=>query.includes(`${name} basketball`));
  assert(index>=0);
  const price=query.includes("current price");
  if(price){assert.match(query,/CNY/);assert.match(query,/人民币现价 官方店 在售/);assert.match(query,/\d{4}-\d{2}-\d{2}/);}
  else{
    assert.match(query,/wide feet/);assert.match(query,/high instep/);assert.match(query,/outdoor traction durability/);
    if(index===0){assert.match(query,/measured weight/);assert.match(query,/construction cushioning outsole upper materials/);}
    else {assert.doesNotMatch(query,/measured weight/);assert.doesNotMatch(query,/construction cushioning outsole upper materials/);}
  }
  queries.push({round,query,price});active++;maxActive=Math.max(active,maxActive);
  await new Promise(resolve=>setTimeout(resolve,2));active--;
  if(price&&index===1)return Response.json({results:[],usage:{credits:1}});
  return Response.json({results:[
    {title:`${names[index]} Ultra V2 Basketball Review`,url:variant(index),content:`WRONG-VERSION-SECRET: ${names[index]} was mentioned but this page is about Ultra V2.`},
    {title:`${names[index]} Basketball ${price?"Price History":"Performance Review"}`,url:source(index,price),content:price?"Historical 2021 MSRP was 90 USD; no current CNY retailer price is provided.":"This exact shoe has reported forefoot room with unresolved high-instep pressure; try-on evidence is limited.",published_date:price?"2021-01-01":"2026-11-18"},
    {title:"Different Shoe 99 Basketball Review",url:"https://evidence.example/different-shoe-99",content:`This unrelated review snippet mentions ${names[index]}.`},
  ],usage:{credits:1}});
};

function stream(output:unknown,native:boolean,tool:string){
  const json=JSON.stringify(output);
  return (async function*(){
    if(native){
      yield {choices:[{delta:{tool_calls:[{index:0,id:`fixture-${tool}`,type:"function",function:{name:tool,arguments:json.slice(0,41)}}]}}]};
      yield {choices:[{delta:{tool_calls:[{index:0,function:{arguments:json.slice(41,137)}}]}}]};
      yield {choices:[{delta:{tool_calls:[{index:0,function:{arguments:json.slice(137)}}]},finish_reason:"tool_calls"}]};
    }else yield {choices:[{delta:{content:json},finish_reason:"stop"}]};
  })();
}

try{
  for(const count of [1,3,8]){
    const wanted=count+2;
    const shortlisted=names.slice(0,wanted);
    const chosen=shortlisted.filter((_,index)=>index!==2).slice(0,count);
    let calls=0;
    stage="shortlist";
    const model=count===3?PACKY_MODEL:HAIKU_MODEL;
    const client={chat:{completions:{create:async(params:Request)=>{
      const phase=calls++===0?"shortlist":"final";
      const text=params.messages.map(message=>message.content).join("\n");
      assert(text.includes(currentInput),"Every phase receives the full original request, corrections and additional notes");
      assert(text.includes(JSON.stringify(priorRecommendations)),"The ordered previous picks explain which shoe 'the first shoe' refers to");
      assert.match(text,/END-OF-PRIOR-RECOMMENDATIONS/);
      assert.match(text,/The first shoe was too expensive/);
      assert.match(text,/newest corrections below override prior advice/);
      assert(!text.includes("STALE-HISTORY-MUST-BE-OMITTED"),"History is bounded to the most recent six turns");
      assert(!text.includes("x".repeat(1801)),"One oversized historical message cannot consume the model context");
      assert(!text.includes("OLD-DEPTH-OVERRIDE"),"Old tier/profile directives cannot undo user corrections");
      if(model===HAIKU_MODEL){
        assert.equal(typeof params.tool_choice==="object"?params.tool_choice.function.name:undefined,phase==="shortlist"?"shortlist_shoes":"recommend_shoes");
        assert.equal(params.parallel_tool_calls,false);assert.equal(params.response_format,undefined);
        const properties=params.tools?.[0].function.parameters.properties;
        assert.equal(phase==="shortlist"?properties?.candidates?.maxItems:properties?.recommendations?.maxItems,phase==="shortlist"?wanted:count);
      }else assert.equal(params.response_format?.type,"json_object");
      if(phase==="shortlist"){
        assert.equal(stage,"shortlist");assert.equal(queries.filter(query=>query.round===round).length,0);
        assert(text.includes('"year":2014'),"Full catalog includes older unselected models");
        assert(text.includes(names[11]),"Shortlist sees all catalog rows, not only likely picks");
        assert(text.includes(`Select exactly ${wanted} distinct plausible models`));
        assert.match(text,/Deprioritize recorded narrow\/tight-fit conflicts/);
        stage="search";
        return stream({candidates:shortlisted,research:shortlisted.map(name=>({name,needs:["fit","price","weight","construction"]}))},model===HAIKU_MODEL,"shortlist_shoes");
      }
      assert.equal(active,0);stage="final";
      assert.equal(queries.filter(query=>query.round===round&&query.price).length,wanted,"All candidate prices are searched live");
      assert.match(text,/Documented forefoot/);assert.match(text,/Documented rubber/);assert.match(text,/Documented upper/);
      assert.match(text,/CURRENT-PRICE SEARCH — retrieved \d{4}-\d{2}-\d{2}/);
      assert.match(text,/FIT\/PERFORMANCE REVIEW — historical prices are not current quotes/);
      assert.match(text,/Historical 2021 MSRP was 90 USD/);
      assert.match(text,/No usable exact-model evidence returned/);
      assert.match(text,/Current CNY price is unverified/);
      assert.match(text,/Cushioning materials do not establish outsole durability/);
      assert.match(text,/do not rationalize a known fit mismatch/);
      assert.doesNotMatch(text,/WRONG-VERSION-SECRET|Different Shoe 99|OLD-DEPTH-OVERRIDE/);
      assert.doesNotMatch(text,/REPLY MUST BE BROKEN UP|FOLLOW-UP GOES IN ITS OWN FIELD/);
      return stream({reply:`${count} researched choices follow the corrected comfort preference. Current CNY prices remain unverified.`,title:"Confirmed needs",follow_up:"Do not preserve this extra model question",recommendations:chosen.map(name=>{
        const index=names.indexOf(name);
        return {name,stars:4,reason:"Comfort is now the priority. Exact-model fit remains unverified for the high instep. Current CNY price is unverified; I cannot confirm it is within budget.",pros:["Documented cushioning"],cons:["Fit needs a try-on"],references:[{title:"Invented title should be canonicalized",url:source(index)},{title:"Wrong version",url:variant(index)},{title:"Another candidate",url:source(index===0?1:0)},{title:"Invented page",url:"https://invented.example/no"}]};
      })},model===HAIKU_MODEL,"recommend_shoes");
    }}}} as unknown as OpenAI;
    const result=await recommendShoes(client,{shoes,history,priorRecommendations,currentInput,count,model,confirmedPreferences:true,replyLanguage:"en",researchFocus:`wide feet high instep outdoor ${secret}`,priceResearchFocus:`current price official retailer CNY ${secret}`,depthSuffix:"OLD-DEPTH-OVERRIDE",deadline:startDeadline(270000)});
    assert.equal(calls,2);assert.deepEqual(result.recommendations.map(rec=>rec.name),chosen);
    assert.equal(result.followUp,"");assert.equal(result.searchStats?.attempts,wanted*2);
    assert(result.recommendations.every(rec=>rec.references?.length===1&&rec.references[0].title===`${rec.name} Basketball Performance Review`),"Only actual same-model references survive, with canonical source titles");
    round++;
  }
  assert.equal(maxActive,3,"Research concurrency is bounded to three");
  assert.equal(queries.filter(query=>query.price).length,3+5+10,"Live prices bypass the review cache");
  assert.equal(queries.filter(query=>!query.price).length,10,"Successful fit research can reuse its cache");
  assert.equal(queries.filter(query=>query.round===2).length,15,"Eight selected picks research all ten candidates with a maximum of twenty probes");

  // Fable 5.2 rejects forced tool_choice. Auto must retain native schemas while
  // accepting either fragmented tool arguments or the explicit JSON fallback.
  for(const output of ["tool","json","prose-shortlist","prose-final"] as const){
    stage="shortlist";
    const beforeSearch=queries.length;
    const shortlisted=names.slice(0,5);
    const chosen=[names[0],names[1],names[3]];
    let calls=0;
    const client={chat:{completions:{create:async(params:Request)=>{
      const phase=calls++===0?"shortlist":"final";
      const tool=phase==="shortlist"?"shortlist_shoes":"recommend_shoes";
      const text=params.messages.map(message=>message.content).join("\n");
      assert.equal(params.model,"claude-fable-5-2");
      assert.equal(params.tool_choice,"auto","Fable 5.2 must never receive a forced tool request");
      assert.equal(params.tools?.[0].function.name,tool,"Auto preserves the native tool schema");
      assert.equal(params.parallel_tool_calls,false);
      assert.equal(params.response_format,undefined);
      assert.match(text,new RegExp(`Prefer calling ${tool}`));
      assert.match(text,/If you do not call the tool, return ONLY the complete JSON object matching its schema/);
      assert(text.includes(currentInput),"Auto and JSON fallback retain all confirmed corrections");
      if(phase==="shortlist"){
        assert.equal(queries.length,beforeSearch,"Fable also shortlists before any research");
        assert.equal(params.tools?.[0].function.parameters.properties.candidates?.minItems,5);
        stage="search";
      }else{
        assert.equal(active,0);stage="final";
        assert.equal(queries.filter(query=>query.round===round&&query.price).length,5);
        assert.match(text,/Current CNY price is unverified/);
        assert.doesNotMatch(text,/WRONG-VERSION-SECRET|Different Shoe 99/);
      }
      if(output===`prose-${phase}`)return (async function*(){yield{choices:[{delta:{content:"I will choose suitable shoes after looking into your needs."},finish_reason:"stop"}]};})();
      return stream(phase==="shortlist"
        ? {candidates:shortlisted,research:shortlisted.map(name=>({name,needs:["fit","price","weight","construction"]}))}
        : {reply:"Comfort comes first; exact-model fit and current CNY prices need verification.",title:"Confirmed choices",follow_up:"",recommendations:chosen.map(name=>({name,stars:4,reason:"Comfort follows the confirmed correction. Fit needs a try-on. Current CNY price is unverified; I cannot confirm it is within budget.",pros:["Documented cushioning"],cons:["Fit needs a try-on"],references:[]}))},output==="tool",tool);
    }}}} as unknown as OpenAI;
    const run=()=>recommendShoes(client,{shoes,history:[],currentInput,count:3,model:"claude-fable-5-2",confirmedPreferences:true,replyLanguage:"en",researchFocus:"wide feet high instep outdoor",priceResearchFocus:"current price CNY"});
    if(output.startsWith("prose-")){
      await assert.rejects(run,expectedFailure(output==="prose-shortlist"?"invalid_shortlist":"invalid_result"));
      assert.equal(calls,output==="prose-shortlist"?1:2,"Prose does not trigger another model or fabricated picks");
      if(output==="prose-shortlist")assert.equal(queries.length,beforeSearch,"Invalid output cannot trigger search");
    }else{
      const result=await run();
      assert.deepEqual(result.recommendations.map(rec=>rec.name),chosen);
      assert.equal(result.followUp,"");assert.equal(calls,2);
    }
    round++;
  }

  const hit={title:"Confirm Shoe 1 Basketball Review",url:source(0),snippet:"Basketball shoe review",siteName:null,datePublished:null};
  assert(confirmedSourceMatches(names[0],hit));
  assert(!confirmedSourceMatches(names[0],{...hit,title:"Confirm Shoe 10 Basketball Review",url:source(9)}));
  assert(!confirmedSourceMatches(names[0],{...hit,title:"Confirm Shoe 1 Pro Basketball Review",url:"https://evidence.example/confirm-shoe-1-pro"}));
  assert(!confirmedSourceMatches(names[0],{...hit,title:"Unrelated Basketball Review",url:"https://evidence.example/unrelated",snippet:"A snippet mentions Confirm Shoe 1"}));

  for (const variant of ["TEAM", "SPEED"]) {
    const variantHit={...hit,title:`ANTA KAI 2 ${variant} Basketball Shoe Guide`,url:`https://anta.com/blogs/kai-2-${variant.toLowerCase()}-guide`,snippet:"Outdoor basketball shoe review"};
    assert(!confirmedSourceMatches("KAI 2",variantHit),"A base shoe must not inherit TEAM or SPEED construction evidence");
    assert(confirmedSourceMatches(`KAI 2 ${variant}`,variantHit),"The exact variant keeps its own evidence");
  }

  const searchTotal=queries.length;
  let invalidCalls=0;
  const invalidClient={chat:{completions:{create:async()=>{
    invalidCalls++;
    return stream({candidates:[secret],research:[]},true,"shortlist_shoes");
  }}}} as unknown as OpenAI;
  await assert.rejects(()=>recommendShoes(invalidClient,{shoes,history:[],currentInput,count:3,confirmedPreferences:true,model:HAIKU_MODEL}),expectedFailure("invalid_shortlist"));
  assert.equal(invalidCalls,1,"Invalid candidates never reach a fallback model or heuristic picks");
  assert.equal(queries.length,searchTotal,"Invalid catalog names never trigger research");
  await assert.rejects(()=>recommendShoes(invalidClient,{shoes,history:[],currentInput,count:3,confirmedPreferences:true,deadline:startDeadline(-1)}),expectedFailure("deadline"));
  assert.equal(invalidCalls,1,"No calls start after the turn deadline");
  for(const count of [0,9])await assert.rejects(()=>recommendShoes(invalidClient,{shoes,history:[],currentInput,count,confirmedPreferences:true}),expectedFailure("invalid_count"));
  await assert.rejects(()=>recommendShoes(invalidClient,{shoes:shoes.slice(0,2),history:[],currentInput,count:3,confirmedPreferences:true}),expectedFailure("insufficient_catalog"));
  assert.equal(invalidCalls,1,"Unsupported counts fail before model work");

  for(const failure of ["outside-candidates","too-few","no-eligible-court","truncated"] as const){
    stage="shortlist";
    let calls=0;
    const count=failure==="too-few"?3:1;
    const shortlist=names.slice(0,count+2);
    const client={chat:{completions:{create:async(params:Request)=>{
      calls++;
      if(calls===1){
        stage="search";
        // Also exercise ordinary JSON when a native Claude tool was requested.
        return stream({candidates:shortlist,research:shortlist.map(name=>({name,needs:["fit","weight","construction"]}))},false,"shortlist_shoes");
      }
      assert.equal(active,0);stage="final";
      const text=params.messages.map(message=>message.content).join("\n");
      assert.match(text,/当前人民币售价未核实，无法确认在预算内/);
      assert.match(text,/不能用抓地或缓震好来合理化不合脚/);
      if(failure==="truncated"&&calls===2)return (async function*(){yield{choices:[{delta:{content:""},finish_reason:"length"}]};})();
      if(failure==="truncated")assert.match(text,/without losing confirmed corrections, fit conflicts, per-shoe budget-currency verification/);
      if(failure==="no-eligible-court"){
        assert.equal(params.tools?.[0].function.parameters.properties.recommendations?.minItems,0,"The model may honestly report no eligible court match");
        return stream({reply:"所有候选都有明确场地冲突，无法推荐。",title:"没有合适候选",follow_up:"",recommendations:[]},true,"recommend_shoes");
      }
      const name=failure==="outside-candidates"?names[11]:names[0];
      return stream({reply:"根据确认后的舒适和宽脚需求选择，人民币现价仍未核实。",title:"确认后的需求",follow_up:"",recommendations:[{name,stars:4,reason:"目录记载缓震特征。宽脚和高脚背的适配仍需试穿。当前人民币售价未核实，无法确认在预算内。",pros:["目录记录缓震"],cons:["现价未核实"],references:[]}]},true,"recommend_shoes");
    }}}} as unknown as OpenAI;
    const run=()=>recommendShoes(client,{shoes,history:[],currentInput,count,confirmedPreferences:true,model:HAIKU_MODEL,replyLanguage:"zh",researchFocus:"wide feet high instep outdoor"});
    if(failure==="truncated"){
      const result=await run();assert.equal(result.recommendations.length,1);assert.equal(calls,3,"A truncated answer retries once without another shortlist");
    }else{
      await assert.rejects(run,expectedFailure("invalid_result"));
      assert.equal(calls,2,"Unresearched or insufficient final picks fail instead of calling generic fallback");
    }
    round++;
  }
  console.log("PASS confirmed Smart Picker counts 1/3/8, native fragmented tools + JSON, Fable auto tool/JSON output and prose rejection, full-catalog shortlist before exact-model research, live prices/cache boundaries, three-worker cap, corrected context, same-model references, and failure without fabricated picks.");
}finally{
  globalThis.fetch=originalFetch;
  if(originalEnv.key===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=originalEnv.key;
  if(originalEnv.provider===undefined)delete process.env.WEB_SEARCH_PROVIDER;else process.env.WEB_SEARCH_PROVIDER=originalEnv.provider;
  if(originalEnv.bocha===undefined)delete process.env.BOCHA_API_KEY;else process.env.BOCHA_API_KEY=originalEnv.bocha;
}
