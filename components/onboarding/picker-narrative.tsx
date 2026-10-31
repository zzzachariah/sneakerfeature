/* eslint-disable @next/next/no-img-element -- Approved catalog cutouts retain their original aspect ratio. */
"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ExternalLink, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { EASE } from "@/lib/motion/constants";
import { type DemoInput, type DemoStage, type DemoEvent, type DemoSnapshot } from "@/lib/onboarding/picker-demo-contract";
import { ProfileSelections } from "./profile-selections";
import { usePickerDemo } from "./use-picker-demo";
import { useNarrativeScroll } from "./use-narrative-scroll";
import { usePickerPlayback } from "./use-picker-playback";
import { ScrollHint } from "./scroll-hint";
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
  return <div className={styles.queries}>{queries.map(event=><article key={event.query} data-progress-item>
    <p><span className={styles.queryState}>{event.state==="start"?<LoaderCircle size={13} className={styles.spinner}/>:event.state==="ok"?<Check size={13}/>:"—"}</span>{event.query}</p>
    {event.state==="ok"?<small>{event.resultCount} {zh?"条真实搜索结果":"search results"}{event.cached?(zh?" · 已有查询缓存":" · cached search"):""}</small>:event.state==="fail"?<small>{zh?"这次查询未完成，继续参考其他资料。":"This search failed; other evidence remains available."}</small>:null}

  </article>)}</div>;
}
const recapLabels: Record<DemoStage, [string, string]> = {
  catalog: ["读取偏好", "Your preferences"],
  shortlist: ["筛选球鞋", "Find candidates"],
  research: ["搜集资料", "Gather evidence"],
  writing: ["生成推荐", "Your two picks"],
};
function ProcessRecap({snapshot, zh, reduced, detailId, active, onSelect}: {
  snapshot: DemoSnapshot; zh: boolean; reduced: boolean; detailId: string;
  active: DemoStage | null; onSelect: (stage: DemoStage) => void;
}) {
  // Only show stages the server actually reported, including catalog-only runs.
  const completed = stages.filter(stage => snapshot.events.some(event => event.stage === stage));
  const catalogCount = snapshot.events.find(event => event.catalogCount !== undefined)?.catalogCount;
  const candidateCount = snapshot.events.findLast(event => event.candidates?.length)?.candidates?.length;
  const sourceCount = new Set(snapshot.events.flatMap(event => event.sources ?? []).map(source => source.url)).size;
  const count = (value: number | undefined, cn: string, en: string) => value === undefined ? (zh ? "已完成" : "Complete") : `${value} ${zh ? cn : en}`;
  const details: Record<DemoStage, string> = {
    catalog: count(catalogCount, "双目录球鞋", "catalog shoes"),
    shortlist: count(candidateCount, "双候选", "candidates"),
    research: sourceCount ? count(sourceCount, "个资料来源", "sources found") : (zh ? "未取得外部资料" : "No external evidence"),
    writing: count(snapshot.shoes?.length, "双推荐", "recommendations"),
  };
  if (!completed.length) return null;
  return <motion.section className={styles.processRecap} data-picker-process-recap aria-label={zh ? "这次推荐如何得出" : "How these picks came together"}
    initial={reduced ? false : {opacity: 0, y: 10}} animate={{opacity: 1, y: 0}} transition={{duration: reduced ? 0 : .7, ease: EASE}}>
    <div className={styles.recapHeading}><span>{zh ? "这两双，是这样找到的。" : "How we found your two."}</span><small>{zh ? "点击步骤回看" : "Select a step to revisit"}</small></div>
    <ol role="list" className={styles.recapSteps} style={{gridTemplateColumns: `repeat(${completed.length}, minmax(0, 1fr))`}}>
      {completed.map((stage, index) => <motion.li key={stage} initial={reduced ? false : {opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{duration: reduced ? 0 : .55, delay: reduced ? 0 : index * .12, ease: EASE}}>
        <button type="button" data-recap-stage={stage} aria-expanded={active === stage} aria-controls={detailId} onClick={() => onSelect(stage)}>
          <span className={styles.recapNumber}>{String(index + 1).padStart(2, "0")}</span>
          <strong>{recapLabels[stage][zh ? 0 : 1]}</strong><small>{details[stage]}</small>
        </button>
        {index < completed.length - 1 && <ArrowRight className={styles.recapArrow} size={14} aria-hidden="true"/>}
      </motion.li>)}
    </ol>
  </motion.section>;
}
export function PickerNarrative({zh,reduced,input,shoes,onBack}:{zh:boolean;reduced:boolean;input:DemoInput|null;shoes:StoryShoe[];onBack:()=>void}) {
  const {snapshot,connection,posting,run}=usePickerDemo();
  const progressId=useId();
  const [beat,setBeat]=useState(reduced?2:0);
  const [history,setHistory]=useState<DemoStage|null>(null);
  const [elapsed,setElapsed]=useState(0);
  const [folded,setFolded]=useState(false),[resultReady,setResultReady]=useState(false);
  const progressRef=useRef<HTMLElement>(null),resultRef=useRef<HTMLElement>(null),sourcesRef=useRef<HTMLElement>(null),failureRef=useRef<HTMLDivElement>(null);
  const [showHistory,setShowHistory]=useState(false);
  const [following,setFollowing]=useState(true);
  const followingRef=useRef(following);
  followingRef.current=following;
  const stageRef=useRef<HTMLDivElement>(null),stageWindowRef=useRef<HTMLDivElement>(null),sourceViewportRef=useRef<HTMLDivElement>(null),navRef=useRef<HTMLElement>(null);
  const scroll=useNarrativeScroll(reduced);
  const scrollDetail=useNarrativeScroll(reduced);
  const playback=usePickerPlayback(snapshot,posting,following&&!history);
  const requestRef=useRef<HTMLElement>(null);
  const playbackDone=playback.phase==="done";
  useEffect(()=>{
    if(snapshot.status!=="complete"||!playbackDone){setFolded(false);setResultReady(false);return;}
    if(reduced){setFolded(true);setResultReady(true);return;}
    let stopped=false;let timer:ReturnType<typeof setTimeout>;
    void (followingRef.current ? scroll(sourcesRef.current,false,100) : Promise.resolve(false)).then(()=>{
      if(stopped)return;
      setFolded(true);
      timer=setTimeout(()=>{if(!stopped)setResultReady(true);},1250);
    });
    return()=>{stopped=true;clearTimeout(timer);};
  },[snapshot.status,playbackDone,reduced,scroll]);
  useEffect(()=>{if(reduced){setBeat(2);return;}const a=setTimeout(()=>setBeat(1),800),b=setTimeout(()=>setBeat(2),1700);return()=>{clearTimeout(a);clearTimeout(b);};},[reduced]);
  useEffect(()=>{if(!snapshot.startedAt)return;if(snapshot.status!=="running"){setElapsed(Math.max(0,Math.floor((Date.parse(snapshot.finishedAt??snapshot.events.at(-1)?.at??snapshot.startedAt)-Date.parse(snapshot.startedAt))/1000)));return;}const update=()=>setElapsed(Math.max(0,Math.floor((Date.now()-Date.parse(snapshot.startedAt!))/1000)));update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[snapshot.status,snapshot.startedAt,snapshot.finishedAt,snapshot.events]);
  useEffect(()=>{if(snapshot.status==="failed")void scroll(failureRef.current,false,350);},[snapshot.status,scroll]);
  useEffect(()=>{if(resultReady&&followingRef.current)void scroll(resultRef.current,false,900);},[resultReady,scroll]);
  const context=snapshot.input??input;
  const interestShoes=snapshot.interests??shoes;
  const prompt=context?(zh?"请根据这些选择，为我推荐两双篮球鞋，告诉我理由和需要权衡的地方。":"Find two basketball shoes for these choices, with the reasons and trade-offs."):"";
  const latest=snapshot.events.at(-1)?.stage??"catalog";
  const presented=stages.includes(playback.phase as DemoStage)?playback.phase as DemoStage:latest;
  const active=history??presented;
  const observed=stages.filter(stage=>snapshot.events.some(e=>e.stage===stage));
  const events=snapshot.events.filter(e=>e.stage===active);
  const candidates=snapshot.events.findLast(e=>e.candidates?.length)?.candidates??[];
  const allSources=Array.from(new Map(snapshot.events.flatMap(e=>e.sources??[]).map(s=>[s.url,s])).values());
  const cited=new Set((snapshot.shoes??[]).flatMap(s=>s.references).map(s=>s.url));
  const displayedSources=folded?allSources.filter(s=>cited.has(s.url)):allSources;
  const sourceCount=new Set(snapshot.events.flatMap(e=>e.sources??[]).map(s=>s.url)).size;
  const began=snapshot.status!=="idle"||posting;
  const duration=reduced?0:.85;
  const presenting=began&&!playbackDone&&snapshot.status!=="failed";
  useEffect(()=>{
    if(!presenting)return;
    const panel=progressRef.current?.closest("[data-onboarding-story-scroll], [data-onboarding-content]");
    const pause=()=>{setFollowing(false);};
    const key=(event:Event)=>{if(["ArrowUp","ArrowDown","PageUp","PageDown","Home","End"," "].includes((event as KeyboardEvent).key))pause();};
    panel?.addEventListener("wheel",pause,{passive:true}); panel?.addEventListener("touchstart",pause,{passive:true}); panel?.addEventListener("keydown",key);
    return()=>{panel?.removeEventListener("wheel",pause);panel?.removeEventListener("touchstart",pause);panel?.removeEventListener("keydown",key);};
  },[presenting]);
  useEffect(()=>{
    if(!following||history||!presenting)return;
    let stopped=false;
    const timer=window.setTimeout(()=>{
      const compact=(progressRef.current?.closest<HTMLElement>("[data-onboarding-story-scroll]")?.clientHeight??0)<380;
      const target=playback.phase==="request"?requestRef.current:playback.phase==="sources"?sourcesRef.current:compact?stageWindowRef.current:progressRef.current;
      void scroll(target,false,0,1600).then(()=>{
        if(stopped)return;
        const inner=playback.phase==="sources"?sourceViewportRef.current:stageRef.current;
        if(inner)inner.scrollTo({top:0,behavior:"instant"});
      });
    },750);
    // Read the first part before gently panning long content to its end.
    const pan=window.setTimeout(()=>{
      const inner=playback.phase==="sources"?sourceViewportRef.current:stageRef.current;
      if(inner&&playback.phase!=="request")void scrollDetail(inner,"end",0,4500);
    },3800);
    return()=>{stopped=true;window.clearTimeout(timer);window.clearTimeout(pan);};
  },[playback.phase,following,history,presenting,scroll,scrollDetail]);
  useEffect(()=>{
    const nav=navRef.current,button=nav?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if(nav&&button&&nav.scrollWidth>nav.clientWidth)nav.scrollTo({left:button.offsetLeft-nav.offsetLeft-(nav.clientWidth-button.clientWidth)/2,behavior:reduced?"instant":"smooth"});
  },[active,reduced]);
  const followLive=()=>{setHistory(null);setFollowing(true);};
  const progress=began?<motion.section ref={progressRef} data-playback-phase={playback.phase} id={progressId} inert={resultReady&&!showHistory} aria-hidden={resultReady&&!showHistory} initial={false} animate={{height:resultReady&&!showHistory?0:"auto",opacity:resultReady&&!showHistory?0:1,paddingTop:resultReady&&!showHistory?0:22}} transition={{duration:reduced?0:.8,ease:EASE}} style={{overflow:resultReady&&!showHistory?"hidden":undefined}} className={styles.progress} data-picker-progress aria-label={zh?"真实处理进度":"Live activity"}>
      <div className={styles.progressHeader}><span>{snapshot.status==="running"||posting?<><i/>{zh?"正在展示：":"VIEWING: "}{labels[active][zh?0:1]}</>:snapshot.status==="complete"?<><Check size={13}/>{zh?"本次查询记录":"RESEARCH RECORD"}</>:<>{zh?"本次未完成":"NOT COMPLETED"}</>}</span><div className={styles.progressActions}><time>{elapsed}s</time>{resultReady&&<button type="button" onClick={()=>{setShowHistory(false);void scroll(resultRef.current,false,850);}}>{zh?"收起过程":"Close details"}</button>}</div></div>
      <div className={styles.workbench}>
        <nav ref={navRef} aria-label={zh?"工作阶段":"Activity stages"}>{stages.map((stage,i)=><button type="button" key={stage} disabled={!observed.includes(stage)} aria-pressed={active===stage} aria-current={stage===latest?"step":undefined} onClick={()=>{setHistory(stage);setFollowing(false);}}><span>{String(i+1).padStart(2,"0")}</span>{labels[stage][zh?0:1]}{observed.includes(stage)&&(stage!==latest||snapshot.status==="complete")?<Check size={12}/>:null}</button>)}</nav>
        <div ref={stageWindowRef} className={styles.stageWindow} data-activity-window><AnimatePresence initial={false} mode="wait"><motion.div ref={stageRef} key={active} className={styles.stage} data-narrative-scroll data-current-stage={active} tabIndex={0} role="region" aria-label={labels[active][zh?0:1]} initial={reduced?{opacity:0}:{opacity:0,x:35}} animate={{opacity:1,x:0}} exit={reduced?{opacity:0}:{opacity:0,x:-35}} transition={{duration:reduced?.1:.55,ease:EASE}}>
          <span className={styles.stageLabel}>{labels[active][zh?0:1]}</span>
          {active==="catalog"?<><strong className={styles.figure}>{events[0]?.catalogCount??"—"}</strong><p>{zh?"双已读取的目录球鞋。以你的位置和有序偏好作为筛选条件。":"catalog shoes loaded, with your positions and ordered priorities as context."}</p></>:active==="shortlist"?<>{candidates.length?<div className={styles.candidates}>{candidates.map(c=><span key={c.slug}><Check size={13}/>{c.name}</span>)}</div>:<p>{zh?"模型正在读取目录，选择值得进一步核对的球鞋。候选返回后会显示在这里。":"The model is reading the catalog. Its actual candidates will appear here when returned."}</p>}</>:active==="research"?<SourceList events={events} zh={zh}/>:<><div className={styles.evidenceCounts}><strong>{candidates.length}<small>{zh?"双候选":"candidates"}</small></strong><strong>{sourceCount}<small>{zh?"个找到的来源":"sources found"}</small></strong></div><p>{snapshot.status==="complete"?(zh?"推荐已根据这些资料生成，理由和取舍在下方。":"The recommendations are ready below, with fit and trade-offs based on this evidence."):snapshot.status==="failed"?null:(zh?"模型正在结合这些资料整理推荐、匹配理由和取舍。":"The model is using this evidence to prepare the recommendations, fit and trade-offs.")}</p>{!sourceCount&&<p>{zh?"没有可用的外部搜索结果；如能完成，将明确仅依据站内目录。":"No external results are available; any completed answer will be identified as catalog-based."}</p>}</>}
          <ScrollHint targetRef={stageRef} zh={zh} compact/>
        </motion.div></AnimatePresence></div>
      </div>
      {presenting&&<div className={styles.followBar} data-live-follow={following&&!history}><button type="button" onClick={()=>following&&!history?setFollowing(false):followLive()}>{following&&!history?(zh?"暂停自动浏览":"Pause walkthrough"):(zh?"继续自动浏览":"Resume walkthrough")}<ArrowRight size={12}/></button>{snapshot.status==="complete"&&<button type="button" onClick={()=>{setHistory(null);setFollowing(true);playback.finish();}}>{zh?"直接看推荐":"View picks now"}<ArrowRight size={12}/></button>}</div>}
      <p className={styles.liveNote} role="status">{connection==="offline"?(zh?"连接暂时中断，正在恢复真实进度。已完成的资料不会清空。":"Connection interrupted. Reconnecting without clearing completed research."):snapshot.status==="running"&&elapsed>25?(zh?"这次仍在处理中。你可以继续注册，完成后在首页接着看。":"Still working. You can continue signing up and find the result on the homepage."):null}</p>
    </motion.section>:null;
  const selectHistory=(stage:DemoStage)=>{setHistory(stage);setFollowing(false);setShowHistory(true);void scroll(progressRef.current,false,850);};
  return <div className={styles.picker} data-picker-narrative data-explained="true" data-demo-status={snapshot.status} data-playback-phase={playback.phase}>
    <motion.div className={styles.introduction} initial={false} animate={{opacity:beat>=1?1:0,y:beat>=1?0:8}} transition={{duration}}><span><Sparkles size={16}/>Smart Picker</span><h3>{zh?"从你的打法，找到下一双。":"Your game becomes the brief."}</h3></motion.div>
    <motion.section ref={requestRef} className={styles.request} layout transition={{duration,ease:EASE}} data-picker-request>
      {context&&<ProfileSelections positions={context.positions} picks={context.priorities} zh={zh} reduced={reduced} part={began?"positions":"all"}/>}
      <motion.div initial={false} animate={{opacity:beat>=1?1:0,height:beat>=1?"auto":0}} transition={{duration,ease:EASE}}>
        <div className={styles.interests}><small>{zh?"从这两双开始了解你":"YOUR STARTING POINT"}</small><div>{interestShoes.map(s=><span key={s.slug}>
          <motion.div layoutId={reduced?undefined:`sf-shoe-${s.slug}`} transition={{duration:1.15,ease:EASE}}>{s.image&&/* eslint-disable-next-line @next/next/no-img-element */<img src={s.image} alt=""/>}</motion.div>{s.name}</span>)}</div></div>
        <p className={styles.prompt}>{prompt|| (zh?"先回到上一屏，选择两个位置和三个重点，就能用你的偏好做这次演示。":"Choose two positions and three priorities on the previous screen to try this with your game.")}</p>
      </motion.div>
      <motion.div initial={false} animate={{opacity:beat>=2?1:0}} transition={{duration}} inert={beat<2}>
        {!began&&<button className={styles.primary} disabled={posting||connection==="loading"} type="button" onClick={()=>input?void run(input):onBack()}>{input?(zh?"用我的选择，推荐两双":"Find two for my game"):(zh?"回到球员档案":"Back to my profile")}<ArrowRight size={16}/></button>}
        <small className={styles.disclosure}>{snapshot.status==="complete"?(zh?"你的两双，已经准备好":"Your picks are ready"):(zh?"仅使用这些选择与公开球鞋资料":"AI uses only these choices and public shoe information")}</small>
      </motion.div>
    </motion.section>
    <motion.section layout="position" className={styles.answer} data-picker-answer transition={{duration:reduced?0:1.15,ease:EASE}}>
    {began&&!resultReady&&context&&<motion.div layout className={styles.answerPriorities} data-answer-priorities transition={{duration:reduced?0:1.15,ease:EASE}}><ProfileSelections positions={context.positions} picks={context.priorities} zh={zh} reduced={reduced} part="priorities"/></motion.div>}
    {!resultReady&&progress}
    {(allSources.length>0 || snapshot.status==="complete")&&<motion.section ref={sourcesRef} layout className={styles.sources} data-source-fold={folded} transition={{duration:reduced?0:1,ease:EASE}} aria-label={zh?"资料来源":"Sources"}>
      <span>{zh?"资料来源":"SOURCES"}</span><div ref={sourceViewportRef} className={styles.sourceViewport} data-narrative-scroll data-folded={folded} tabIndex={0} role="region" aria-label={zh?"找到的资料":"Retrieved evidence"}><motion.div layout className={styles.sourceCards} transition={{duration:reduced?0:1,ease:EASE}}><AnimatePresence initial={false} mode="popLayout">{displayedSources.map(source=><motion.a layout data-source-item key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" initial={reduced?false:{opacity:0,y:14,scale:.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:reduced?0:-10,scale:reduced?1:.96}} transition={{duration:reduced?.1:.75,ease:EASE}}><span>{new URL(source.url).hostname.replace(/^www\./,"")}</span><strong>{source.title}</strong><ExternalLink size={12}/></motion.a>)}</AnimatePresence></motion.div><ScrollHint targetRef={sourceViewportRef} zh={zh} compact/></div>
      {folded&&!displayedSources.length&&<motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{duration}}><p>{zh?"本次推荐依据站内球鞋资料。":"These recommendations draw on the site’s shoe records."}</p><div className={styles.catalogSources}>{snapshot.shoes?.map(s=><a key={s.id} href={`/shoes/${s.slug}`} target="_blank" rel="noopener noreferrer">{s.name}<ExternalLink size={11}/></a>)}</div></motion.div>}
    </motion.section>}
    {snapshot.status==="failed"&&<div ref={failureRef} className={styles.failure} role="alert"><strong>{zh?"这次没能完成，原因是：":"This run could not finish:"}</strong><p>{failure(snapshot.error,zh)}</p>{snapshot.retryable&&input&&<button type="button" className={styles.secondary} disabled={posting} onClick={()=>void run(input)}><RotateCcw size={14}/>{zh?"重试这次演示":"Retry this demo"}</button>}<small>{zh?"也可以继续创建账号，进入网站自由浏览。":"You can also create your account and explore the site."}</small></div>}
    {resultReady&&snapshot.status==="complete"&&snapshot.shoes?.length===2&&<section ref={resultRef} className={styles.results} data-picker-results><ProcessRecap snapshot={snapshot} zh={zh} reduced={reduced} detailId={progressId} active={showHistory?active:null} onSelect={selectHistory}/>{progress}{context&&<motion.div layout className={styles.answerPriorities} data-answer-priorities transition={{duration:reduced?0:1.15,ease:EASE}}><ProfileSelections positions={context.positions} picks={context.priorities} zh={zh} reduced={reduced} part="priorities"/></motion.div>}<motion.div className={styles.resultHeading} initial={reduced?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:reduced?0:.7,delay:reduced?0:.65,ease:EASE}}><span><Check size={14}/>{zh?"为你的打法找到两双":"TWO PICKS FOR YOUR GAME"}</span><h3>{zh?"推荐有理由，也有取舍。":"The fit. And the trade-offs."}</h3></motion.div>
      {!sourceCount&&<p className={styles.liveNote}>{zh?"本次外部查询没有可用结果，推荐仅依据站内目录；未进行实物测试。":"External research was unavailable. These picks use the site catalog only, not hands-on testing."}</p>}
      <div className={styles.resultGrid}>{snapshot.shoes.map((shoe,i)=><motion.article key={shoe.id} initial={reduced?false:{opacity:0,y:28}} animate={{opacity:1,y:0}} transition={{duration:reduced?0:1,delay:reduced?0:1.15+i*.25,ease:EASE}}>
        <motion.div className={styles.resultImage} layoutId={reduced?undefined:`sf-intro-rec-${shoe.id}`}>{shoe.image&&/* eslint-disable-next-line @next/next/no-img-element */<img src={shoe.image} alt={shoe.name}/>}</motion.div><small>{shoe.brand}</small><h4>{shoe.name}</h4><h5>{zh?"为什么适合你":"Why it fits your game"}</h5><p>{shoe.reason}</p><h5>{zh?"适合之处":"What works"}</h5><ul>{shoe.pros.map((p,n)=><li key={n}>{p}</li>)}</ul><h5>{zh?"需要权衡":"The trade-offs"}</h5><ul>{shoe.cons.map((p,n)=><li key={n}>{p}</li>)}</ul><details><summary>{zh?"核对资料依据":"Check the evidence"} · {shoe.references.length}</summary>{shoe.references.length?shoe.references.map(ref=><a href={ref.url} key={ref.url} target="_blank" rel="noopener noreferrer">{ref.title}<ExternalLink size={11}/></a>):<p>{zh?"这双没有引用外部网页，请以站内目录和实际试穿为参考。":"No external page was cited for this shoe. Refer to the catalog and try-on fit."}</p>}</details>
      </motion.article>)}</div><p className={styles.nextHint}><ArrowRight size={14}/>{zh?"下一步，带上这两双。":"Next, take these two with you."}</p>
    </section>}
    </motion.section>
  </div>;
}
