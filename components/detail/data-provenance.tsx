"use client";
import { useLocale } from "@/components/i18n/locale-provider";
import { safeSourceUrl } from "@/lib/data/catalog-quality";
import type { Shoe } from "@/lib/types";

export type CatalogSource = { source_label: string | null; source_url: string | null; created_at: string | null };
export function DataProvenance({ shoe, sources }: { shoe: Shoe; sources: CatalogSource[] }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const issues = shoe.dataQuality?.issues ?? [];
  const date = shoe.dataQuality?.updatedAt?.slice(0, 10);
  const linked = sources.filter(source => safeSourceUrl(source.source_url));
  return <aside className="container-shell py-6">
    <div className="surface-card rounded-2xl p-5 text-sm leading-6">
      <h2 className="font-semibold">{zh ? "资料与来源" : "Data and sources"}</h2>
      <p className="soft-text">{zh ? "评分来自资料描述与社区评价，属于参考估算。" : "Scores estimate catalog descriptions and community ratings."}</p>
      <p className="soft-text">{date ? `${zh ? "资料更新" : "Record updated"}: ${date}` : (zh ? "更新时间未记录" : "Update date not recorded")}</p>
      {issues.includes("ventilation_conflict") && <p>{zh ? "鞋面透气性描述存在冲突，相关选购结论暂不展示，等待核实。" : "Ventilation descriptions conflict. The related buying verdict is withheld pending review."}</p>}
      {issues.includes("conflicting_versions") && <p>{zh ? "存在内容不同的规格记录，目前展示最近更新的版本，仍需审核。" : "Spec versions differ. The most recently updated version is shown and needs review."}</p>}
      {linked.length ? <ul className="mt-2 space-y-1">{linked.map((source, i) => <li key={i}><a href={safeSourceUrl(source.source_url)!} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{source.source_label || new URL(source.source_url!).hostname}</a></li>)}</ul> : <p>{zh ? "尚无可追溯的规格来源；博主观点见下方点评，不等同于规格验证。" : "No traceable spec source recorded. Blogger opinions are separate from spec verification."}</p>}
    </div>
  </aside>;
}
