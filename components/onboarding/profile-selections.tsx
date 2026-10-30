"use client";
import { motion } from "framer-motion";
import type { Position } from "@/lib/persona/types";
import type { DimKey } from "@/lib/star-rating";
import { priorityName } from "@/lib/onboarding/picker-demo-contract";
import { EASE } from "@/lib/motion/constants";
import styles from "./picker-narrative.module.css";
export function ProfileSelections({positions,picks,zh,reduced}:{positions:Position[];picks:DimKey[];zh:boolean;reduced:boolean}) {
  const transition={duration:reduced?0:1.15,ease:EASE};
  return <div className={styles.selections} data-picker-selections>
    <div><small>{zh?"场上位置":"ON COURT"}</small><div>{positions.map(p=><motion.strong key={p} layoutId={reduced?undefined:`sf-intro-role-${p}`} transition={transition}>{p}</motion.strong>)}</div></div>
    <div><small>{zh?"我的优先顺序":"MY PRIORITIES"}</small><div>{picks.map((p,i)=><motion.span key={p} layoutId={reduced?undefined:`sf-intro-priority-${p}`} transition={transition}><b>{i+1}</b>{priorityName(p,zh)}</motion.span>)}</div></div>
  </div>;
}
