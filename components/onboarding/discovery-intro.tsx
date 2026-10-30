"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { Check, Plus, X } from "lucide-react";
import { EASE } from "@/lib/motion/constants";
import { BrandLogo, type StoryCatalog, type StoryShoe } from "./site-stories";
import styles from "./discovery-intro.module.css";
import { ScrollHint } from "./scroll-hint";

type ShoeTransfer = { shoe: StoryShoe; from: DOMRect; to: DOMRect; returning: boolean };

function FlyingShoe({ transfer, resolveTarget, onComplete }: {
  transfer: ShoeTransfer; resolveTarget: (shoe: StoryShoe) => DOMRect | null; onComplete: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(1);
  const latest = useRef({ resolveTarget, onComplete });
  latest.current = { resolveTarget, onComplete };
  useEffect(() => {
    const { from } = transfer;
    const playback = animate(0, 1, {
      duration: .65,
      ease: EASE,
      onUpdate: (progress) => {
        // The wall keeps moving during a return. Follow its current tile (or
        // nearest edge) instead of flying to an outdated click-time snapshot.
        const to = transfer.returning ? latest.current.resolveTarget(transfer.shoe) || transfer.to : transfer.to;
        x.set((to.left + to.width / 2 - from.left - from.width / 2) * progress);
        y.set((to.top + to.height / 2 - from.top - from.height / 2) * progress);
        scale.set(1 + (Math.min(to.width / from.width, to.height / from.height) - 1) * progress);
        opacity.set(progress < .98 ? 1 : (1 - progress) / .02);
      },
      onComplete: () => latest.current.onComplete(),
    });
    return () => playback.stop();
  }, [transfer, x, y, scale, opacity]);
  return <motion.img className={styles.transferringShoe} src={transfer.shoe.image || ""} alt="" aria-hidden="true"
    style={{ left: transfer.from.left, top: transfer.from.top, width: transfer.from.width, height: transfer.from.height, transformOrigin: "center", x, y, scale, opacity }}/>;
}

export function DiscoveryIntro({ catalog, selected, onSelect, stats, zh, expanded, onExpand }: {
  catalog: StoryCatalog | null; selected: StoryShoe[]; onSelect: (shoe: StoryShoe) => void;
  stats: ReactNode; zh: boolean; expanded: boolean; onExpand: () => void;
}) {
  const reduced = useReducedMotion();
  const [heroReady, setHeroReady] = useState(false);
  const [hero, setHero] = useState<StoryShoe | null>(null);
  const [visible, setVisible] = useState(true);
  const [transfer, setTransfer] = useState<ShoeTransfer | null>(null);
  const slots = useRef<(HTMLButtonElement | HTMLDivElement | null)[]>([]);
  const wall = useRef<HTMLDivElement>(null);
  const wallImages = useRef(new Map<string, Map<number, HTMLImageElement>>());
  const finishTransfer = useRef<(() => void) | null>(null);
  const elapsed = useRef(0);
  const surface = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const copyPanel = useRef<HTMLElement>(null);
  const [panelBottom, setPanelBottom] = useState(282);
  const [viewport, setViewport] = useState({ width: 1000, height: 600 });
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
    if (!panel.current || !surface.current) return;
    const measure = () => {
      // Local layout coordinates stay stable during the hero-to-wall transform.
      if (panel.current) setPanelBottom(panel.current.offsetTop + panel.current.offsetHeight + 12);
      if (surface.current) {
        const width = surface.current.clientWidth;
        const height = surface.current.clientHeight;
        setViewport(current => current.width === width && current.height === height ? current : { width, height });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel.current); observer.observe(surface.current); window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [expanded]);
  const shoes = hero ? [...remaining.slice(0, 6), hero, ...remaining.slice(6)] : remaining;
  const wallHeight = Math.max(0, viewport.height - panelBottom - 8);
  const rowGap = 10;
  const minTileHeight = viewport.width <= 620 ? 94 : 108;
  const rowCount = Math.max(1, Math.min(3, Math.floor((wallHeight + rowGap) / (minTileHeight + rowGap))));
  const tileHeight = Math.max(72, Math.min(160, Math.floor((wallHeight - (rowCount - 1) * rowGap) / rowCount)));
  const tileWidth = Math.max(130, Math.min(185, Math.round(tileHeight * 1.3)));
  // Every shoe remains reachable when a short viewport needs fewer rows.
  const rows = Array.from({ length: rowCount }, (_, row) => shoes.filter((_, index) => index % rowCount === row));
  const transition = { duration: reduced ? .15 : .65, ease: EASE };
  function completeTransfer() {
    const finish = finishTransfer.current;
    finishTransfer.current = null;
    finish?.();
    setTransfer(null);
  }
  function returnTarget(shoe: StoryShoe) {
    if (!wall.current) return null;
    const bounds = wall.current.getBoundingClientRect();
    // Only measure the returning shoe's two copies, never scan the full wall.
    const images = Array.from(wallImages.current.get(shoe.slug)?.values() || [])
      .map((image) => image.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    // Prefer the copy with the most visible area, including a partial edge
    // tile. The repeated wall can move the original DOM copy offscreen.
    const visibleImages = images.map((rect) => ({
      rect,
      overlap: Math.max(0, Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left)),
      distance: Math.max(bounds.left - rect.right, rect.left - bounds.right, 0),
    })).sort((a, b) => b.overlap - a.overlap || a.distance - b.distance);
    const target = visibleImages[0]?.rect;
    if (!target || !target.width) return null;
    // Offscreen shoes return through the nearest edge until their real tile
    // reaches the viewport again. No interaction pauses the wall.
    return new DOMRect(Math.max(bounds.left - target.width / 2, Math.min(target.left, bounds.right - target.width / 2)), target.top, target.width, target.height);
  }
  function select(shoe: StoryShoe, source?: HTMLButtonElement) {
    if (transfer) return;
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
  return <div ref={surface} style={{ "--intro-panel-bottom": `${panelBottom}px`, "--wall-tile-height": `${tileHeight}px`, "--wall-tile-width": `${tileWidth}px`, "--wall-row-gap": `${rowGap}px` } as CSSProperties} className={`${styles.discovery} ${expanded ? styles.expanded : ""}`} data-testid="onboarding-scene-0" data-expanded={expanded} data-wall-rows={rowCount}>
    <div className={styles.wallTexture} aria-hidden="true"/>
    <AnimatePresence initial={false}>
      {expanded && <motion.div ref={wall} key="wall" data-shoe-wall className={styles.wall} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? .15 : .75, delay: reduced ? 0 : .12 }} data-motion-idle={reduced}>
        {rows.map((row, ri) => <div className={styles.rail} key={ri}>
          <div className={styles.track} style={{ animationDuration: `${Math.max(45, row.length * (tileWidth + (viewport.width <= 850 ? 12 : 18)) / (18 - ri * 1.5))}s` }}>
            {[0, 1].map((copy) => <div className={styles.group} key={copy} aria-hidden={copy ? true : undefined}>
              {row.map((shoe) => {
                const index = selected.findIndex((item) => item.slug === shoe.slug);
                return <motion.button key={shoe.slug} layoutId={!copy && !reduced && index < 0 ? `sf-shoe-${shoe.slug}` : undefined} transition={transition}
                  type="button" tabIndex={copy ? -1 : 0} className={styles.shoeTile} data-wall-shoe={shoe.slug} data-selected={index >= 0} data-transferring={transfer?.shoe.slug === shoe.slug}
                  aria-label={`${zh ? "选择" : "Select"} ${shoe.name}`} aria-pressed={index >= 0}
                  onClick={(event) => select(shoe, event.currentTarget)}>
                  {/* Existing approved catalogue imagery, kept at its original proportions. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img ref={(image) => {
                    let copies = wallImages.current.get(shoe.slug);
                    if (image) {
                      if (!copies) { copies = new Map(); wallImages.current.set(shoe.slug, copies); }
                      copies.set(copy, image);
                    } else {
                      copies?.delete(copy);
                      if (!copies?.size) wallImages.current.delete(shoe.slug);
                    }
                  }} src={shoe.image || ""} alt="" loading={ri === 0 ? "eager" : "lazy"} decoding="async" draggable={false}/>
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
    <motion.aside ref={copyPanel} layout transition={transition} className={expanded ? styles.plaque : styles.heroCopy}>
      <motion.div layout className={styles.brandLine} transition={transition}><BrandLogo compact={expanded || viewport.width <= 620 || viewport.height < 420}/>{expanded ? <span>MEET SNKRFEATURE</span> : null}</motion.div>
      <motion.h1 tabIndex={-1} layout transition={transition} className={styles.title}>{expanded ? (zh ? "从心动的一双，开始。" : "Start with a pair you love.") : <>{zh ? "找到更适合" : "A better pair."}<br/><em>{zh ? "你打法的篮球鞋。" : "For your game."}</em></>}</motion.h1>
      <motion.p layout transition={transition} className={styles.description}>{expanded ? (zh ? "在这面鞋墙上选两双，下一屏一起看它们的差异。" : "Pick any two from the wall. Compare their details next.") : (zh ? "浏览、比较、了解。把关于篮球鞋的信息，变成对你有用的选择。" : "Explore, compare and understand. Find a pair that makes sense for your game.")}</motion.p>
      <motion.div layout transition={transition} className={styles.plaqueStats}>{stats}</motion.div>
      {!expanded ? <button type="button" className={styles.openWall} onClick={onExpand}>{zh ? "展开球鞋墙" : "Open the shoe wall"}<Plus size={15}/></button> : <span className={styles.plaquePin} aria-hidden="true"/>}
      <ScrollHint targetRef={copyPanel} zh={zh}/>
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
      <span className={styles.selectionHelp} role="status">{selected.length === 2 ? (zh ? "选好了，看看这两双。想换鞋？先取消一双。" : "Ready to compare. Remove a pair to choose another.") : (zh ? "选中一双，它就会来到这里。" : "Choose a pair and bring it up here.")}</span>
    </div> : null}
    </motion.div>
    <AnimatePresence initial={false}>
      {!expanded && hero ? <motion.div key="hero" className={styles.heroShoe} layoutId={reduced ? undefined : `sf-shoe-${hero.slug}`} transition={transition} initial={reduced ? { opacity: 0 } : { opacity: 0, y: 25, rotate: -6 }} animate={{ opacity: 1, y: 0, rotate: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hero.image || ""} alt={hero.name} draggable={false} onLoad={() => setHeroReady(true)} onError={() => setHeroReady(true)}/><span>{hero.name}</span>
      </motion.div> : null}
    </AnimatePresence>
    {!catalog ? <p className={styles.loading} role="status">{zh ? "正在打开鞋库，你也可以先跳过介绍。" : "Opening the catalogue. You can also skip the introduction."}</p> : null}
    {transfer ? createPortal(<FlyingShoe transfer={transfer} resolveTarget={returnTarget} onComplete={completeTransfer}/>, document.body) : null}
  </div>;
}
