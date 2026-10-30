/* eslint-disable @next/next/no-img-element -- Approved catalog cutouts retain their original aspect ratio. */
"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ExternalLink, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { EASE } from "@/lib/motion/constants";
import { demoPrompt, type DemoInput, type DemoStage, type DemoEvent } from "@/lib/onboarding/picker-demo-contract";
import { ProfileSelections } from "./profile-selections";
import { usePickerDemo } from "./use-picker-demo";
import { useNarrativeScroll } from "./use-narrative-scroll";
import type { StoryShoe } from "./site-stories";
import styles from "./picker-narrative.module.css";
const stages: DemoStage[]=["catalog","shortlist","research","writing"];
const labels: Record<DemoStage,[string,string]>={catalog:["读取你的选择","Reading your choices"],shortlist:["筛选候选球鞋","Finding candidates"],research:["搜集实战资料","Gathering evidence"],writing:["整理两双推荐","Shaping your two picks"]};
function failure(code:string|undefined,zh:boolean) {
  const messages:Record<string,[string,string]>={
    timeout:["这次模型响应超时，未能及时完成两双推荐。已查到的资料还在下面。","The model took too long to finish both recommendations. The evidence gathered so far is still here."],
    incomplete:["AI 没有返回两双资料完整的球鞋，因此这次没有发布推荐。","The AI did not return two complete shoe recommendations, so this result was not published."],
    provider_busy:["模型服务正在限流，这次请求未能完成。","The model provider is busy and could not finish this request."],
    provider_unavailable:["模型服务暂时无法响应，这次没有生成推荐。","The model service could not respond. No recommendations were generated."],
    demo_busy:["演示名额暂时已满。你可以先完成注册，稍后在 Smart Picker 继续。","The demo is at capacity. You can finish signing up and use Smart Picker later."],
    network:["连接中断，正在核对服务器是否已经完成。无需重新提交。","The connection was interrupted. We’re checking whether the server finished; no need to submit again."],
    unavailable:["这次 AI 请求未能完成。已有查询记录会保留，你仍可继续注册。","This AI request could not finish. Completed searches are retained, and you can continue signing up."]
  };
  return (messages[code||"unavailable"]||messages.unavailable)[zh?0:1];
}
function SourceList({events,zh}:{events:DemoEvent[];zh:boolean}) {
  const queries=Array.from(new Map(events.filter(e=>e.query).map(e=>[e.query,e])).values());
  return <div className={styles.queries}>{queries.map(event=><article key={event.query}>
    <p><span className={styles.queryState}>{event.state==="start"?<LoaderCircle size={13} className={styles.spinner}/>:event.state==="ok"?<Check size={13}/>:"—"}</span>{event.query}</p>
    {event.state==="ok"?<small>{event.resultCount} {zh?"条真实搜索结果":"search results"}{event.cached?(zh?" · 已有查询缓存":" · cached search"):""}</small>:event.state==="fail"?<small>{zh?"这次查询未完成，继续参考其他资料。":"This search failed; other evidence remains available."}</small>:null}
    {event.sources?.map(source=><a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title||new URL(source.url).hostname}<ExternalLink size={11}/></a>)}
  </article>)}</div>;
}
export function PickerNarrative({zh,reduced,input,shoes,onBack}:{zh:boolean;reduced:boolean;input:DemoInput|null;shoes:StoryShoe[];onBack:()=>void}) {
  const {snapshot,connection,posting,run}=usePickerDemo();
  const [beat,setBeat]=useState(reduced?2:0);
  const [history,setHistory]=useState<DemoStage|null>(null);
  const [elapsed,setElapsed]=useState(0);
  const progressRef=useRef<HTMLElement>(null),resultRef=useRef<HTMLElement>(null);
  const scroll=useNarrativeScroll(reduced);
  useEffect(()=>{if(reduced){setBeat(2);return;}const a=setTimeout(()=>setBeat(1),800),b=setTimeout(()=>setBeat(2),1700);return()=>{clearTimeout(a);clearTimeout(b);};},[reduced]);
  useEffect(()=>{if(snapshot.status!=="running"||!snapshot.startedAt)return;const update=()=>setElapsed(Math.max(0,Math.floor((Date.now()-Date.parse(snapshot.startedAt!))/1000)));update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[snapshot.status,snapshot.startedAt]);
  useEffect(()=>{if(snapshot.status==="running")void scroll(progressRef.current,false,250);if(snapshot.status==="complete")void scroll(resultRef.current,false,500);},[snapshot.status,scroll]);
  const context=snapshot.input??input;
  const interestShoes=snapshot.interests??shoes;
  const prompt=snapshot.prompt??(input?demoPrompt(input,shoes.map(s=>s.name)):"");
  const latest=snapshot.events.at(-1)?.stage??"catalog",active=history??latest;
  const observed=stages.filter(stage=>snapshot.events.some(e=>e.stage===stage));
  const events=snapshot.events.filter(e=>e.stage===active);
  const candidates=snapshot.events.findLast(e=>e.candidates?.length)?.candidates??[];
  const sourceCount=new Set(snapshot.events.flatMap(e=>e.sources??[]).map(s=>s.url)).size;
  const began=snapshot.status!=="idle"||posting;
  const duration=reduced?0:.85;
  return <div className={styles.picker} data-picker-narrative data-explained="true" data-demo-status={snapshot.status}>
    <motion.div className={styles.introduction} initial={false} animate={{opacity:beat>=1?1:0,y:beat>=1?0:8}} transition={{duration}}><span><Sparkles size={16}/>Smart Picker</span><h3>{zh?"从你的打法，找到下一双。":"Your game becomes the brief."}</h3><p>{zh?"把你刚才的选择交给 AI：查找球鞋、核对资料，再解释为什么适合你。":"Your choices guide the AI: find shoes, check the evidence, then explain the fit."}</p></motion.div>
    <motion.section className={styles.request} layout transition={{duration,ease:EASE}} data-picker-request>
      {context&&<ProfileSelections positions={context.positions} picks={context.priorities} zh={zh} reduced={reduced}/>}
      <motion.div initial={false} animate={{opacity:beat>=1?1:0,height:beat>=1?"auto":0}} transition={{duration,ease:EASE}}>
        <div className={styles.interests}><small>{zh?"从这两双开始了解你":"YOUR STARTING POINT"}</small><div>{interestShoes.map(s=><span key={s.slug}>
          <motion.div layoutId={reduced?undefined:`sf-shoe-${s.slug}`} transition={{duration:1.15,ease:EASE}}>{s.image&&/* eslint-disable-next-line @next/next/no-img-element */<img src={s.image} alt=""/>}</motion.div>{s.name}</span>)}</div></div>
        <p className={styles.prompt}>{prompt|| (zh?"先回到上一屏，选择两个位置和三个重点，就能用你的偏好做这次演示。":"Choose two positions and three priorities on the previous screen to try this with your game.")}</p>
      </motion.div>
      <motion.div initial={false} animate={{opacity:beat>=2?1:0}} transition={{duration}} inert={beat<2}>
        {!began&&<button className={styles.primary} disabled={posting||connection==="loading"} type="button" onClick={()=>input?void run(input):onBack()}>{input?(zh?"用我的选择，推荐两双":"Find two for my game"):(zh?"回到球员档案":"Back to my profile")}<ArrowRight size={16}/></button>}
        <small className={styles.disclosure}>{snapshot.status==="complete"?(zh?"保留本次结果 · 重看不会重复请求 AI":"Your result is saved · revisiting does not call AI again"):(zh?"一次真实 AI 演示 · 仅发送这里的选择与公开鞋库资料":"One real AI demo · uses these choices and the public shoe catalog")}</small>
      </motion.div>
    </motion.section>
    {began&&<section ref={progressRef} className={styles.progress} data-picker-progress aria-label={zh?"真实处理进度":"Live activity"}>
      <div className={styles.progressHeader}><span>{snapshot.status==="running"||posting?<><i/>{zh?"正在进行":"IN PROGRESS"}</>:snapshot.status==="complete"?<><Check size={13}/>{zh?"本次查询记录":"RESEARCH RECORD"}</>:<>{zh?"本次未完成":"NOT COMPLETED"}</>}</span><time>{elapsed}s</time></div>
      <div className={styles.workbench}>
        <nav aria-label={zh?"已发生的工作阶段":"Activity history"}>{observed.map((stage,i)=><button type="button" key={stage} aria-pressed={active===stage} onClick={()=>setHistory(stage)}><span>{String(i+1).padStart(2,"0")}</span>{labels[stage][zh?0:1]}{stage!==latest||snapshot.status==="complete"?<Check size={12}/>:null}</button>)}{history&&history!==latest&&<button type="button" onClick={()=>setHistory(null)}>{zh?"跟随实时进度":"Follow live"}<ArrowRight size={12}/></button>}</nav>
        <div className={styles.stageWindow}><AnimatePresence initial={false} mode="wait"><motion.div key={active} className={styles.stage} initial={reduced?{opacity:0}:{opacity:0,x:35}} animate={{opacity:1,x:0}} exit={reduced?{opacity:0}:{opacity:0,x:-35}} transition={{duration:reduced?.1:.55,ease:EASE}}>
          <span className={styles.stageLabel}>{labels[active][zh?0:1]}</span>
          {active==="catalog"?<><strong className={styles.figure}>{events[0]?.catalogCount??"—"}</strong><p>{zh?"双已读取的目录球鞋。以你的位置和有序偏好作为筛选条件。":"catalog shoes loaded, with your positions and ordered priorities as context."}</p></>:active==="shortlist"?<>{candidates.length?<div className={styles.candidates}>{candidates.map(c=><span key={c.slug}><Check size={13}/>{c.name}</span>)}</div>:<p>{zh?"模型正在读取目录，选择值得进一步核对的球鞋。候选返回后会显示在这里。":"The model is reading the catalog. Its actual candidates will appear here when returned."}</p>}</>:active==="research"?<SourceList events={events} zh={zh}/>:<><div className={styles.evidenceCounts}><strong>{candidates.length}<small>{zh?"双候选":"candidates"}</small></strong><strong>{sourceCount}<small>{zh?"个找到的来源":"sources found"}</small></strong></div><p>{zh?"模型正在结合这些资料整理推荐、匹配理由和取舍。":"The model is using this evidence to prepare the recommendations, fit and trade-offs."}</p>{!sourceCount&&<p>{zh?"没有可用的外部搜索结果；如能完成，将明确仅依据站内目录。":"No external results are available; any completed answer will be identified as catalog-based."}</p>}</>}
        </motion.div></AnimatePresence></div>
      </div>
      <p className={styles.liveNote} role="status">{connection==="offline"?(zh?"连接暂时中断，正在恢复真实进度。已完成的资料不会清空。":"Connection interrupted. Reconnecting without clearing completed research."):snapshot.status==="running"&&elapsed>25?(zh?"这次仍在处理中。你可以继续注册，完成后在首页接着看。":"Still working. You can continue signing up and find the result on the homepage."):(zh?"展示实际操作和查询结果；阶段只在服务器返回时更新。":"Actual activity and search results, updated when the server reports them.")}</p>
    </section>}
    {snapshot.status==="failed"&&<div className={styles.failure} role="alert"><strong>{zh?"这次没能完成，原因是：":"This run could not finish:"}</strong><p>{failure(snapshot.error,zh)}</p>{snapshot.retryable&&input&&<button type="button" className={styles.secondary} disabled={posting} onClick={()=>void run(input)}><RotateCcw size={14}/>{zh?"重试这次演示":"Retry this demo"}</button>}<small>{zh?"也可以继续创建账号，进入网站自由浏览。":"You can also create your account and explore the site."}</small></div>}
    {snapshot.status==="complete"&&snapshot.shoes?.length===2&&<section ref={resultRef} className={styles.results} data-picker-results><div className={styles.resultHeading}><span><Check size={14}/>{zh?"为你的打法找到两双":"TWO PICKS FOR YOUR GAME"}</span><h3>{zh?"推荐有理由，也有取舍。":"The fit. And the trade-offs."}</h3><p>{zh?"根据上方这组选择生成。进入网站后，还可以继续查看详情和对比。":"Generated from the choices above. Continue with details and comparison after entering the site."}</p></div>
      {!sourceCount&&<p className={styles.liveNote}>{zh?"本次外部查询没有可用结果，推荐仅依据站内目录；未进行实物测试。":"External research was unavailable. These picks use the site catalog only, not hands-on testing."}</p>}
      <div className={styles.resultGrid}>{snapshot.shoes.map((shoe,i)=><motion.article key={shoe.id} initial={reduced?false:{opacity:0,y:28}} animate={{opacity:1,y:0}} transition={{duration:1,delay:reduced?0:i*.25,ease:EASE}}>
        <motion.div className={styles.resultImage} layoutId={reduced?undefined:`sf-intro-rec-${shoe.id}`}>{shoe.image&&/* eslint-disable-next-line @next/next/no-img-element */<img src={shoe.image} alt={shoe.name}/>}</motion.div><small>{shoe.brand}</small><h4>{shoe.name}</h4><h5>{zh?"为什么适合你":"Why it fits your game"}</h5><p>{shoe.reason}</p><h5>{zh?"适合之处":"What works"}</h5><ul>{shoe.pros.map((p,n)=><li key={n}>{p}</li>)}</ul><h5>{zh?"需要权衡":"The trade-offs"}</h5><ul>{shoe.cons.map((p,n)=><li key={n}>{p}</li>)}</ul><details><summary>{zh?"核对资料依据":"Check the evidence"} · {shoe.references.length}</summary>{shoe.references.length?shoe.references.map(ref=><a href={ref.url} key={ref.url} target="_blank" rel="noopener noreferrer">{ref.title}<ExternalLink size={11}/></a>):<p>{zh?"这双没有引用外部网页，请以站内目录和实际试穿为参考。":"No external page was cited for this shoe. Refer to the catalog and try-on fit."}</p>}</details>
      </motion.article>)}</div><p className={styles.nextHint}><ArrowRight size={14}/>{zh?"继续完成账号设置，我们会把这两双带到首页。":"Finish setting up your account. These two will come with you."}</p>
    </section>}
  </div>;
}
