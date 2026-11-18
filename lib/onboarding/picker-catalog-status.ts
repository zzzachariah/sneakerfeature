import type { DemoSnapshot } from "./picker-demo-contract";

/** A saved run describes the catalog it actually read, never today's total. */
export function pickerCatalogStatus(snapshot: DemoSnapshot, zh: boolean) {
  const historical = snapshot.status === "complete" || snapshot.status === "failed";
  const event = snapshot.events.find(event => event.stage === "catalog"
    && typeof event.catalogCount === "number" && Number.isSafeInteger(event.catalogCount)
    && event.catalogCount >= 0 && Number.isFinite(Date.parse(event.at)));
  if (!event) return {
    count: null,
    description: historical
      ? (zh ? "这次选鞋没有留下已读取目录的记录。" : "No catalog load was recorded for this run.")
      : (zh ? "正在读取球鞋目录…" : "Loading the shoe catalog…"),
    recap: historical ? (zh ? "无读取记录" : "No load recorded") : (zh ? "正在读取" : "Loading catalog"),
    recordedAt: null,
    recordedLabel: null,
  };

  const full = event.catalogScope === "full";
  const timestamp = new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(event.at));
  return {
    count: event.catalogCount!,
    description: full
      ? (zh ? "双球鞋已从完整目录载入本次选鞋，以你的位置和有序偏好作为筛选依据。" : "shoes loaded from the full catalog for this run, with your positions and ordered priorities as context.")
      : (zh ? "双球鞋为当次选鞋读取的记录，不代表当前目录总数。" : "shoes recorded for this earlier run; this is not the current catalog total."),
    recap: full
      ? (zh ? `${event.catalogCount} 双 · 本次读取` : `${event.catalogCount} shoes · this run`)
      : (zh ? `${event.catalogCount} 双 · 历史读取` : `${event.catalogCount} shoes · saved run`),
    recordedAt: event.at,
    recordedLabel: `${historical ? (zh ? "本次读取记录" : "Recorded for this run") : (zh ? "本次读取" : "Loaded for this run")} · ${timestamp}`,
  };
}
