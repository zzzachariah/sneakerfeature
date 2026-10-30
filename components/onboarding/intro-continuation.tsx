/* eslint-disable @next/next/no-img-element -- Approved catalog cutouts retain their original aspect ratio. */
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, GitCompareArrows, X } from "lucide-react";
import type { DemoShoe } from "@/lib/onboarding/picker-demo-contract";
import type { StoryShoe } from "./site-stories";
import { PICKER_PENDING, usePickerDemo } from "./use-picker-demo";
import { ScrollHint } from "./scroll-hint";
import styles from "./picker-narrative.module.css";
type Interest=Pick<DemoShoe,"id"|"slug"|"name"|"image">;
const KEY="sf-intro-shoe-interests-v1";
export function rememberIntroShoes(shoes:StoryShoe[]) {
  if(shoes.length!==2)return;
  try{localStorage.setItem(KEY,JSON.stringify(shoes.map(s=>({id:s.shoe.id,slug:s.slug,name:s.name,image:s.image}))));localStorage.setItem(PICKER_PENDING,"1");}catch{}
}
function interests():Interest[] {
  try{const data=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(data)?data.filter(s=>typeof s.id==="string"&&typeof s.slug==="string"&&/^[\w-]+$/.test(s.slug)&&typeof s.name==="string"&&(s.image===null||typeof s.image==="string")).slice(0,2):[];}catch{return [];}
}
function ShoeThumbnail({shoe,rec,reduced}:{shoe:Interest;rec:boolean;reduced:boolean}) {
  return <motion.div layoutId={reduced?undefined:rec?`sf-intro-rec-${shoe.id}`:`sf-shoe-${shoe.slug}`} transition={{duration:1}}>{shoe.image&&/* eslint-disable-next-line @next/next/no-img-element */<img src={shoe.image} alt=""/>}</motion.div>;
}
export function IntroTrail({shoes,zh,reduced}:{shoes:StoryShoe[];zh:boolean;reduced:boolean}) {
  const {snapshot}=usePickerDemo();
  const recommended=snapshot.status==="complete"&&snapshot.shoes?.length===2;
  const items:Interest[]=recommended?snapshot.shoes!:shoes.map(s=>({id:s.shoe.id,slug:s.slug,name:s.name,image:s.image}));
  if(!items.length)return null;
  return <motion.aside className={styles.trail} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:reduced?0:1,delay:reduced?0:.5}} aria-label={zh?"继续你的探索":"Continue your picks"}>
    <small>{recommended?(zh?"刚才的 AI 推荐，会和你一起进入首页。":"Your AI picks will be waiting on the homepage."):(zh?"你选过的球鞋，会保留到首页。":"Your selected shoes will be waiting on the homepage.")}</small><div>{items.map(s=><a key={s.id} href={`/shoes/${s.slug}`} target="_blank" rel="noopener noreferrer"><ShoeThumbnail shoe={s} rec={Boolean(recommended)} reduced={reduced}/>{s.name}</a>)}</div>
  </motion.aside>;
}
export function IntroContinuation({enabled,zh,reduced}:{enabled:boolean;zh:boolean;reduced:boolean}) {
  const [pending,setPending]=useState(false),[selected,setSelected]=useState<Interest[]>([]),[shown,setShown]=useState(false);
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{const read=()=>{try{setPending(localStorage.getItem(PICKER_PENDING)==="1");}catch{}setSelected(interests());};read();window.addEventListener("sf:picker-demo-started",read);return()=>window.removeEventListener("sf:picker-demo-started",read);},[enabled]);
  const {snapshot}=usePickerDemo(enabled&&pending);
  useEffect(()=>{if(!enabled||!pending){setShown(false);return;}const timer=setTimeout(()=>setShown(true),reduced?0:1300);return()=>clearTimeout(timer);},[enabled,pending,reduced]);
  const recommended=snapshot.status==="complete"?snapshot.shoes??[]:[];
  function dismiss(){setPending(false);setShown(false);try{localStorage.removeItem(PICKER_PENDING);}catch{}}
  return <AnimatePresence>{shown&&(selected.length||recommended.length)?<motion.aside ref={panel} className={styles.homeCard} role="region" aria-label={zh?"继续刚才的选鞋":"Continue your shoe exploration"} initial={reduced?{opacity:0}:{opacity:0,y:25,scale:.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:reduced?0:12}} transition={{duration:reduced?.1:.75}} onKeyDown={e=>{if(e.key==="Escape")dismiss();}}>
    <button type="button" onClick={dismiss} aria-label={zh?"关闭继续浏览提示":"Dismiss continuation"}><X size={18}/></button><h2>{zh?"接着，看看你的下一双。":"Pick up where you left off."}</h2><p>{zh?"刚才的选择还在。现在可以打开完整资料，或放在一起比较。":"Your choices are here. Open the full details or compare them side by side."}</p>
    {[{title:zh?"Smart Picker 为你推荐":"YOUR AI RECOMMENDATIONS",items:recommended,rec:true},{title:zh?"你在鞋墙选过的":"YOUR WALL PICKS",items:selected,rec:false}].filter(group=>group.items.length===2).map(group=><section key={group.title}><small>{group.title}</small><div className={styles.homeShoes}>{group.items.map(shoe=><Link key={shoe.id} href={`/shoes/${shoe.slug}`} onClick={dismiss}><ShoeThumbnail shoe={shoe} rec={group.rec} reduced={reduced}/><strong>{shoe.name}</strong><span>{zh?"查看详情":"View details"}<ArrowRight size={11}/></span></Link>)}</div><Link href={`/compare?ids=${group.items.map(s=>s.id).join(",")}`} onClick={dismiss} className={styles.secondary}><GitCompareArrows size={14}/>{zh?"对比这两双":"Compare these two"}</Link></section>)}
    {snapshot.status==="running"&&<p role="status">{zh?"AI 推荐仍在生成，完成后会显示在这里。":"Your AI recommendations are still being prepared and will appear here."}</p>}
    {snapshot.status==="failed"&&<p>{zh?"刚才的 AI 演示未完成。已选球鞋仍然可看，之后可在 Smart Picker 再试。":"The AI demo did not finish. Your selected shoes are still available; try Smart Picker later."}</p>}
    <ScrollHint targetRef={panel} zh={zh}/>
  </motion.aside>:null}</AnimatePresence>;
}
