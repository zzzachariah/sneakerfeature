"use client";

import { useEffect, useRef, useState } from "react";
import { useNarrativeScroll } from "./use-narrative-scroll";

/** A single moving overlay follows the final destination while the panel scrolls. */
export function useProfilePairJourney(ready: boolean, reduced: boolean) {
  const origin = useRef<HTMLDivElement>(null), target = useRef<HTMLDivElement>(null);
  const [atEvidence, setAtEvidence] = useState(false), [landed, setLanded] = useState(false);
  const scroll = useNarrativeScroll(reduced);
  useEffect(() => {
    if (!ready) { setAtEvidence(false); setLanded(false); return; }
    if (reduced) { setAtEvidence(true); setLanded(true); return; }
    let stopped = false, overlay: HTMLDivElement | null = null;
    const animations: Animation[] = [];
    const cleanup = () => { animations.forEach(a => a.cancel()); overlay?.remove(); overlay = null; };
    const settle = () => {
      if(stopped)return;
      stopped=true; setAtEvidence(true); setLanded(true);
      // Keep the final image until React has painted the real destination.
      requestAnimationFrame(() => requestAnimationFrame(cleanup));
    };
    const hidden = () => { if(document.hidden)settle(); };
    const pause = () => settle();
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    window.addEventListener("resize", settle);
    window.visualViewport?.addEventListener("resize", settle);
    document.addEventListener("visibilitychange", hidden);
    const panel=origin.current?.closest<HTMLElement>("[data-onboarding-story-scroll]");
    panel?.addEventListener("wheel",pause,{passive:true});
    panel?.addEventListener("touchstart",pause,{passive:true});
    void (async () => {
      // Bring the actual pair back into view. Do not fly in from offscreen.
      if(!await scroll(origin.current,true,650,1500)||stopped){settle();return;}
      const sources=Array.from(origin.current?.querySelectorAll<HTMLImageElement>("[data-comparison-target] img")??[]);
      if(sources.length!==2||!panel){settle();return;}
      const bounds=panel.getBoundingClientRect();
      overlay=document.createElement("div");
      overlay.dataset.profilePairFlight="true";
      overlay.setAttribute("aria-hidden","true");
      Object.assign(overlay.style,{position:"fixed",left:`${bounds.left}px`,top:`${bounds.top}px`,width:`${bounds.width}px`,height:`${bounds.height}px`,overflow:"hidden",pointerEvents:"none",zIndex:"151"});
      const copies=sources.map(source=>{
        const from=source.getBoundingClientRect();
        const copy=source.cloneNode(false) as HTMLImageElement;
        copy.removeAttribute("class"); copy.alt="";
        Object.assign(copy.style,{position:"absolute",left:`${from.left-bounds.left}px`,top:`${from.top-bounds.top}px`,width:`${from.width}px`,height:`${from.height}px`,maxWidth:"none",objectFit:"contain",transformOrigin:"0 0",filter:"none",opacity:"1",willChange:"transform"});
        overlay!.appendChild(copy);
        return {copy,from};
      });
      document.body.appendChild(overlay);
      setAtEvidence(true);
      await frame(); await frame();
      if(stopped)return;
      // Measure the final viewport destination before scrolling. Images and panel
      // now move together, with no stationary hold between the two animations.
      const targetTop=target.current!.getBoundingClientRect().top;
      const finalScroll=Math.max(0,Math.min(panel.scrollHeight-panel.clientHeight,panel.scrollTop+targetTop-panel.getBoundingClientRect().top-12));
      const scrollDelta=finalScroll-panel.scrollTop;
      const movement=scroll(target.current,false,0,1900).then(ok=>{if(!ok)settle();});
      const destinations=Array.from(target.current?.querySelectorAll<HTMLImageElement>("[data-comparison-target] img")??[]);
      if(destinations.length!==2){settle();return;}
      await Promise.all([movement,...copies.map(({copy,from},i)=>{
        const to=destinations[i].getBoundingClientRect();
        const animation=copy.animate([{transform:"translate(0,0) scale(1,1)"},{transform:`translate(${to.left-from.left}px,${to.top-from.top-scrollDelta}px) scale(${to.width/from.width},${to.height/from.height})`}],{duration:1900,easing:"cubic-bezier(.45,0,.2,1)",fill:"forwards"});
        animations.push(animation);return animation.finished;
      })]);
      settle();
    })().catch(settle);
    return()=>{
      stopped=true;cleanup();window.removeEventListener("resize",settle);window.visualViewport?.removeEventListener("resize",settle);document.removeEventListener("visibilitychange",hidden);
      panel?.removeEventListener("wheel",pause);panel?.removeEventListener("touchstart",pause);
    };
  },[ready,reduced,scroll]);
  return {origin,target,atEvidence,landed};
}
