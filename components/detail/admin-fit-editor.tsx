"use client";

import { useState } from "react";
import { Ruler, Sparkles, Save, Loader2 } from "lucide-react";
import type { ShoeFit, LengthBias, WidthFit, Volume, FitConfidence } from "@/lib/foot-scan/fit-advisor";

type FitForm = {
  length_bias: LengthBias;
  adjust_half_sizes: number;
  width_fit: WidthFit;
  volume: Volume;
  confidence: FitConfidence;
  notes_zh: string;
};

function toForm(fit: ShoeFit | null): FitForm {
  return {
    length_bias: fit?.length_bias ?? "true_to_size",
    adjust_half_sizes: fit?.adjust_half_sizes ?? 0,
    width_fit: fit?.width_fit ?? "standard",
    volume: fit?.volume ?? "medium",
    confidence: fit?.confidence ?? "medium",
    notes_zh: fit?.notes_zh ?? ""
  };
}

const selectCls = "rounded-lg border border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev))] px-2 py-1.5 text-sm";
const fieldWrap = "flex flex-col gap-1";
const labelCls = "text-[0.7rem] uppercase tracking-wide soft-text";

// Admin-only inline editor for a shoe's fit data, shown on the shoe detail page.
// Includes an AI-prefill button (review-then-save) per the chosen data flow.
export function AdminFitEditor({
  shoeId,
  initialFit
}: {
  shoeId: string;
  initialFit: ShoeFit | null;
}) {
  const [form, setForm] = useState<FitForm>(toForm(initialFit));
  const [source, setSource] = useState<ShoeFit["source"] | null>(initialFit?.source ?? null);
  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [msg, setMsg] = useState("");

  function set<K extends keyof FitForm>(key: K, value: FitForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function aiPrefill() {
    setPrefilling(true);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/shoes/${shoeId}/fit/ai`, { method: "POST" });
      const json = await res.json();
      if (json?.ok && json.suggestion) {
        const s = json.suggestion;
        setForm({
          length_bias: s.length_bias,
          adjust_half_sizes: s.adjust_half_sizes,
          width_fit: s.width_fit,
          volume: s.volume,
          confidence: s.confidence,
          notes_zh: s.notes_zh ?? ""
        });
        setSource("ai");
        setMsg("AI 已预填，请审核后保存。");
      } else {
        setMsg(json?.message ?? "AI 预填失败。");
      }
    } catch {
      setMsg("网络错误，请重试。");
    } finally {
      setPrefilling(false);
    }
  }

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/shoes/${shoeId}/fit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, notes_zh: form.notes_zh || null, source: source === "ai" ? "ai" : "admin" })
      });
      const json = await res.json();
      if (json?.ok) {
        setSource(source === "ai" ? "ai" : "admin");
        setMsg("已保存。刷新页面即可看到更新后的尺码建议。");
      } else {
        setMsg(json?.message ?? "保存失败。");
      }
    } catch {
      setMsg("网络错误，请重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto mt-6 w-full max-w-3xl px-4 sm:px-6">
      <div className="rounded-2xl border border-dashed border-[rgb(var(--accent)/0.5)] bg-[rgb(var(--surface))] p-5">
        <div className="mb-4 flex items-center gap-2">
          <Ruler className="h-4 w-4 text-[rgb(var(--accent))]" />
          <h2 className="text-sm font-semibold tracking-tight">尺码数据 · 管理员</h2>
          {source && (
            <span className="rounded-full bg-[rgb(var(--muted)/0.45)] px-2 py-0.5 text-[0.6rem] uppercase tracking-wide">
              来源：{source}
            </span>
          )}
          <button
            type="button"
            onClick={aiPrefill}
            disabled={prefilling}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--accent)/0.6)] px-3 py-1.5 text-xs text-[rgb(var(--accent))] transition hover:bg-[rgb(var(--accent)/0.1)] disabled:opacity-50"
          >
            {prefilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            AI 预填
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className={fieldWrap}>
            <span className={labelCls}>长度偏向</span>
            <select className={selectCls} value={form.length_bias} onChange={(e) => set("length_bias", e.target.value as LengthBias)}>
              <option value="runs_small">偏小 runs small</option>
              <option value="true_to_size">标准 true to size</option>
              <option value="runs_large">偏大 runs large</option>
            </select>
          </label>
          <label className={fieldWrap}>
            <span className={labelCls}>调整半码数</span>
            <select
              className={selectCls}
              value={form.adjust_half_sizes}
              onChange={(e) => set("adjust_half_sizes", Number(e.target.value))}
            >
              <option value={0}>0 · 无</option>
              <option value={1}>1 · 半码</option>
              <option value={2}>2 · 一码</option>
              <option value={3}>3 · 一码半</option>
            </select>
          </label>
          <label className={fieldWrap}>
            <span className={labelCls}>楦型宽窄</span>
            <select className={selectCls} value={form.width_fit} onChange={(e) => set("width_fit", e.target.value as WidthFit)}>
              <option value="narrow">窄 narrow</option>
              <option value="standard">标准 standard</option>
              <option value="wide">宽 wide</option>
            </select>
          </label>
          <label className={fieldWrap}>
            <span className={labelCls}>内部容积</span>
            <select className={selectCls} value={form.volume} onChange={(e) => set("volume", e.target.value as Volume)}>
              <option value="low">浅 low</option>
              <option value="medium">中 medium</option>
              <option value="high">深 high</option>
            </select>
          </label>
          <label className={fieldWrap}>
            <span className={labelCls}>置信度</span>
            <select className={selectCls} value={form.confidence} onChange={(e) => set("confidence", e.target.value as FitConfidence)}>
              <option value="low">低 low</option>
              <option value="medium">中 medium</option>
              <option value="high">高 high</option>
            </select>
          </label>
        </div>

        <label className={`${fieldWrap} mt-3`}>
          <span className={labelCls}>中文尺码提示（可选）</span>
          <textarea
            className="min-h-[52px] rounded-lg border border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev))] px-3 py-2 text-sm"
            value={form.notes_zh}
            maxLength={120}
            placeholder="例如：偏小半码，楦型偏窄，宽脚建议大半码。"
            onChange={(e) => set("notes_zh", e.target.value)}
          />
        </label>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--accent))] px-4 py-2 text-sm font-medium text-[rgb(var(--bg-elev))] transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </button>
          {msg && <span className="text-xs soft-text">{msg}</span>}
        </div>
      </div>
    </section>
  );
}
