"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Pause, Play, Plus, X } from "lucide-react";
import { EASE } from "@/lib/motion/constants";
import { BrandLogo, type StoryCatalog, type StoryShoe } from "./site-stories";
import styles from "./discovery-intro.module.css";

export function DiscoveryIntro({ catalog, selected, onSelect, stats, zh, expanded, onExpand }: {
  catalog: StoryCatalog | null; selected: StoryShoe[]; onSelect: (shoe: StoryShoe) => void;
  stats: ReactNode; zh: boolean; expanded: boolean; onExpand: () => void;
}) {
  const reduced = useReducedMotion();
  const [heroReady, setHeroReady] = useState(false);
  const [hero, setHero] = useState<StoryShoe | null>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [transfer, setTransfer] = useState<{ shoe: StoryShoe; from: DOMRect; to: DOMRect; returning: boolean } | null>(null);
  const slots = useRef<(HTMLButtonElement | HTMLDivElement | null)[]>([]);
  const wallOrigins = useRef(new Map<string, HTMLButtonElement>());
  const finishTransfer = useRef<(() => void) | null>(null);
  const elapsed = useRef(0);
  const surface = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [panelBottom, setPanelBottom] = useState(282);
  const expandRef = useRef(onExpand);
  expandRef.current = onExpand;
  useEffect(() => {
    if (!hero && catalog?.shoes.length) {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      setHero(catalog.shoes[random[0] % catalog.shoes.length]);
    }
  }, [catalog, hero]);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (expanded || !hero || !heroReady || !visible) return;
    if (reduced) { expandRef.current(); return; }
    const start = performance.now();
    const timer = window.setTimeout(() => expandRef.current(), Math.max(0, 1900 - elapsed.current));
    return () => { elapsed.current += performance.now() - start; window.clearTimeout(timer); };
  }, [expanded, hero, heroReady, visible, reduced]);
  const remaining = (catalog?.shoes || []).filter((shoe) => shoe.slug !== hero?.slug);
  useLayoutEffect(() => {
    if (!expanded || !panel.current || !surface.current) return;
    const measure = () => {
      // Local layout coordinates stay stable during the hero-to-wall transform.
      if (panel.current) setPanelBottom(panel.current.offsetTop + panel.current.offsetHeight + 18);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel.current); window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [expanded]);
  const shoes = hero ? [...remaining.slice(0, 6), hero, ...remaining.slice(6)] : remaining;
  const rows = [0, 1, 2].map((row) => shoes.filter((_, index) => index % 3 === row));
  const transition = { duration: reduced ? .15 : .65, ease: EASE };
  function completeTransfer() {
    const finish = finishTransfer.current;
    finishTransfer.current = null;
    finish?.();
    setTransfer(null);
  }
  function returnTarget(shoe: StoryShoe) {
    const wall = surface.current?.querySelector<HTMLElement>(`[data-shoe-wall]`);
    if (!wall) return null;
    const bounds = wall.getBoundingClientRect();
    const candidates = Array.from(wall.querySelectorAll<HTMLButtonElement>("[data-wall-shoe]"))
      .filter((tile) => tile.dataset.wallShoe === shoe.slug);
    const origin = wallOrigins.current.get(shoe.slug);
    const visibleTile = candidates.find((tile) => {
      const rect = tile.getBoundingClientRect();
      return rect.width > 0 && rect.left >= bounds.left && rect.right <= bounds.right;
    });
    const target = (visibleTile || origin || candidates[0])?.querySelector("img")?.getBoundingClientRect();
    if (!target || !target.width) return null;
    // If the user resumed the moving wall, return through its nearest edge.
    // The real tile is revealed when it reaches the viewport again.
    return new DOMRect(Math.max(bounds.left - target.width / 2, Math.min(target.left, bounds.right - target.width / 2)), target.top, target.width, target.height);
  }
  function select(shoe: StoryShoe, source?: HTMLButtonElement) {
    if (transfer) return;
    setPaused(true);
    const existing = selected.some((item) => item.slug === shoe.slug);
    if (!existing && selected.length >= 2) return;
    if (existing && !reduced) {
      const index = selected.findIndex((item) => item.slug === shoe.slug);
      const from = slots.current[index]?.querySelector("img")?.getBoundingClientRect();
      const to = returnTarget(shoe);
      if (from && to) {
        finishTransfer.current = () => onSelect(shoe);
        setTransfer({ shoe, from, to, returning: true });
        return;
      }
    } else if (source && !reduced) {
      const from = source.querySelector("img")?.getBoundingClientRect();
      const slot = slots.current[selected.length];
      const to = slot?.querySelector("[data-shoe-landing]")?.getBoundingClientRect();
      wallOrigins.current.set(shoe.slug, source);
      if (from && to) setTransfer({ shoe, from, to, returning: false });
    }
    onSelect(shoe);
  }
  useEffect(() => {
    const finish = () => {
      const callback = finishTransfer.current;
      finishTransfer.current = null;
      callback?.();
      setTransfer(null);
    };
    window.addEventListener("resize", finish);
    return () => window.removeEventListener("resize", finish);
  }, []);
  return <div ref={surface} style={{ "--intro-panel-bottom": `${panelBottom}px` } as CSSProperties} className={`${styles.discovery} ${expanded ? styles.expanded : ""}`} data-testid="onboarding-scene-0" data-expanded={expanded}>
    <div className={styles.wallTexture} aria-hidden="true"/>
    <AnimatePresence initial={false}>
      {expanded && <motion.div key="wall" data-shoe-wall className={styles.wall} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? .15 : .75, delay: reduced ? 0 : .12 }} data-paused={paused || !visible || reduced}>
        {rows.map((row, ri) => <div className={styles.rail} key={ri}>
          <div className={styles.track} style={{ animationDuration: `${95 + ri * 14}s` }}>
            {[0, 1].map((copy) => <div className={styles.group} key={copy} aria-hidden={copy ? true : undefined}>
              {row.map((shoe) => {
                const index = selected.findIndex((item) => item.slug === shoe.slug);
                return <motion.button key={shoe.slug} layoutId={!copy && !reduced && index < 0 ? `sf-shoe-${shoe.slug}` : undefined} transition={transition}
                  type="button" tabIndex={copy ? -1 : 0} className={styles.shoeTile} data-wall-shoe={shoe.slug} data-selected={index >= 0}
                  aria-label={`${zh ? "选择" : "Select"} ${shoe.name}`} aria-pressed={index >= 0}
                  onPointerDown={() => setPaused(true)} onFocus={() => setPaused(true)} onClick={(event) => select(shoe, event.currentTarget)}>
                  {/* Existing approved catalogue imagery, kept at its original proportions. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img style={index >= 0 ? { opacity: .12 } : undefined} src={shoe.image || ""} alt="" loading={ri === 0 ? "eager" : "lazy"} decoding="async" draggable={false}/>
                  <span>{shoe.name}</span>
                  {index >= 0 ? <i className={styles.selectedMark}><Check size={12}/><span>{index + 1}</span></i> : null}
                </motion.button>;
              })}
            </div>)}
          </div>
        </div>)}
      </motion.div>}
    </AnimatePresence>
    <motion.div ref={panel} layout transition={transition} className={expanded ? styles.topPanel : styles.heroPanel}>
    <motion.aside layout transition={transition} className={expanded ? styles.plaque : styles.heroCopy}>
      <motion.div layout className={styles.brandLine} transition={transition}><BrandLogo compact={expanded}/>{expanded ? <span>MEET SNKRFEATURE</span> : null}</motion.div>
      <motion.h1 tabIndex={-1} layout transition={transition} className={styles.title}>{expanded ? (zh ? "从心动的一双，开始。" : "Start with a pair you love.") : <>{zh ? "找到更适合" : "A better pair."}<br/><em>{zh ? "你打法的篮球鞋。" : "For your game."}</em></>}</motion.h1>
      <motion.p layout transition={transition} className={styles.description}>{expanded ? (zh ? "在这面鞋墙上选两双，下一屏一起看它们的差异。" : "Pick any two from the wall. Compare their details next.") : (zh ? "浏览、比较、了解。把关于篮球鞋的信息，变成对你有用的选择。" : "Explore, compare and understand. Find a pair that makes sense for your game.")}</motion.p>
      <motion.div layout transition={transition} className={styles.plaqueStats}>{stats}</motion.div>
      {!expanded ? <button type="button" className={styles.openWall} onClick={onExpand}>{zh ? "展开球鞋墙" : "Open the shoe wall"}<Plus size={15}/></button> : <span className={styles.plaquePin} aria-hidden="true"/>}
    </motion.aside>
    {expanded ? <div className={styles.selectionDock}>
      <div className={styles.selectionIntro}><span>{zh ? "为你的下一场" : "FOR YOUR NEXT GAME"}</span><span className={styles.selectionCount} aria-label={`${selected.length} / 2`}>{[0, 1].map((index) => <i key={index} data-filled={index < selected.length}/>)}</span></div>
      <div className={styles.selectedList}>{[0, 1].map((index) => {
        const shoe = selected[index];
        return <div key={index} ref={(node) => { slots.current[index] = node; }} className={styles.displaySlot}><AnimatePresence initial={false} mode="popLayout">{shoe ? <motion.button layout="position" layoutId={reduced ? undefined : `sf-selected-${shoe.slug}`} transition={transition} initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: .16 } }} type="button" key={shoe.slug} className={styles.selectedShoe} data-transferring={transfer?.shoe.slug === shoe.slug} data-returning={transfer?.returning && transfer.shoe.slug === shoe.slug} onClick={() => select(shoe)} aria-label={`${zh ? "取消选择" : "Remove"} ${shoe.name}`}>
          <span className={styles.landingPlane} aria-hidden="true"/>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img data-shoe-landing src={shoe.image || ""} alt=""/><span className={styles.selectedName}>{shoe.name}</span><span className={styles.removeShoe}><X size={12}/></span>
        </motion.button> : <motion.div layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .3 }} key={`empty-${index}`} className={styles.emptySelection}>
          <span className={styles.landingPlane} aria-hidden="true"/><span data-shoe-landing className={styles.emptyLanding} aria-hidden="true"><Plus size={19} strokeWidth={1}/></span><span className={styles.emptyLabel}>{zh ? "留给心动的一双" : "A place for your pair"}</span>
        </motion.div>}</AnimatePresence></div>;
      })}</div>
      {!reduced ? <button className={styles.playControl} type="button" disabled={!!transfer} onClick={() => setPaused((value) => !value)} aria-label={paused ? (zh ? "继续移动鞋墙" : "Resume shoe wall") : (zh ? "暂停鞋墙" : "Pause shoe wall")}>{paused ? <Play size={14}/> : <Pause size={14}/>}</button> : null}
      <span className={styles.selectionHelp} role="status">{selected.length === 2 ? (zh ? "选好了，看看这两双。想换鞋？先取消一双。" : "Ready to compare. Remove a pair to choose another.") : (zh ? "选中一双，它就会来到这里。" : "Tap an image to select. The wall pauses for you.")}</span>
    </div> : null}
    </motion.div>
    <AnimatePresence initial={false}>
      {!expanded && hero ? <motion.div key="hero" className={styles.heroShoe} layoutId={reduced ? undefined : `sf-shoe-${hero.slug}`} transition={transition} initial={reduced ? { opacity: 0 } : { opacity: 0, y: 25, rotate: -6 }} animate={{ opacity: 1, y: 0, rotate: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hero.image || ""} alt={hero.name} draggable={false} onLoad={() => setHeroReady(true)} onError={() => setHeroReady(true)}/><span>{hero.name}</span>
      </motion.div> : null}
    </AnimatePresence>
    {!catalog ? <p className={styles.loading} role="status">{zh ? "正在打开鞋库，你也可以先跳过介绍。" : "Opening the catalogue. You can also skip the introduction."}</p> : null}
    {transfer ? createPortal(<motion.img className={styles.transferringShoe} src={transfer.shoe.image || ""} alt="" aria-hidden="true"
      style={{ left: transfer.from.left, top: transfer.from.top, width: transfer.from.width, height: transfer.from.height, transformOrigin: "center" }}
      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      animate={{ x: transfer.to.left + transfer.to.width / 2 - transfer.from.left - transfer.from.width / 2, y: transfer.to.top + transfer.to.height / 2 - transfer.from.top - transfer.from.height / 2, scale: Math.min(transfer.to.width / transfer.from.width, transfer.to.height / transfer.from.height), opacity: [1, 1, 0] }}
      transition={{ duration: .65, ease: EASE, opacity: { times: [0, .96, 1], duration: .65 } }} onAnimationComplete={completeTransfer}/>, document.body) : null}
  </div>;
}
