"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronDown, Megaphone, ShieldCheck } from "lucide-react";
import { CONTACT_EMAIL } from "@/lib/legal/content";
import styles from "./nav-info-sections.module.css";

type Props = { zh: boolean; onNavigate: () => void; onCookieSettings: () => void };

/** Secondary destinations stay available without filling the main menu. */
export function NavInfoSections({ zh, onNavigate, onCookieSettings }: Props) {
  const id = useId();
  const [expanded, setExpanded] = useState<"news" | "policies" | null>(null);
  const groups = [
    { key: "news", label: zh ? "资讯与支持" : "News & support", icon: Megaphone },
    { key: "policies", label: zh ? "政策与隐私" : "Policies & privacy", icon: ShieldCheck }
  ] as const;

  return <div className={styles.sections}>
    {groups.map(({ key, label, icon: Icon }) => {
      const open = expanded === key;
      const panelId = `${id}-${key}`;
      return <div key={key} className={styles.group} data-open={open}>
        <button type="button" className={styles.trigger} aria-expanded={open} aria-controls={panelId}
          onClick={() => setExpanded(open ? null : key)}>
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
          <ChevronDown size={14} className={styles.chevron} aria-hidden="true" />
        </button>
        <div id={panelId} className={styles.disclosure} aria-hidden={!open} inert={!open}>
          <div className={styles.clip}>
            <div className={styles.links}>
              {key === "news" ? <>
                <Link href="/announcements" onClick={onNavigate}>{zh ? "公告" : "Announcements"}</Link>
                <Link href="/updates" onClick={onNavigate}>{zh ? "资料更新" : "Catalogue updates"}</Link>
                <a href={`mailto:${CONTACT_EMAIL}`} onClick={onNavigate}>{zh ? "联系" : "Contact"}</a>
              </> : <>
                <Link href="/terms" onClick={onNavigate}>{zh ? "服务条款" : "Terms of Use"}</Link>
                <Link href="/privacy" onClick={onNavigate}>{zh ? "隐私政策" : "Privacy Policy"}</Link>
                <Link href="/disclaimer" onClick={onNavigate}>{zh ? "品牌免责声明" : "Brand Disclaimer"}</Link>
                <button type="button" onClick={() => { onCookieSettings(); onNavigate(); }}>
                  {zh ? "Cookie 设置" : "Cookie settings"}
                </button>
              </>}
            </div>
          </div>
        </div>
      </div>;
    })}
  </div>;
}
