"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/locale-provider";
import { haptics } from "@/lib/native/haptics";

// ---------------------------------------------------------------------------
// Prompt questionnaire — a lightweight, all-optional form that helps users who
// don't know how to describe what they want. Every field is free-text and
// skippable; on "generate" the answered fields are stitched into a single
// natural-language request that we drop into the composer (via the existing
// prefill mechanism), so it flows through the normal billed picker pipeline —
// the user reviews/edits and hits send themselves. No new backend.
//
// Content is inlined per-locale (zh/en) rather than routed through the shared
// translate() dictionary: these are feature-specific, heavily domain (hoops)
// strings, and keeping both languages side-by-side here mirrors how the empty
// state's suggestion chips are localized two files over.
// ---------------------------------------------------------------------------

type Bi = { zh: string; en: string };

type Field = {
  id: string;
  label: Bi; // shown above the input
  placeholder: Bi; // example answer
  promptLabel: Bi; // short label used in the generated request
  multiline?: boolean;
  // Factors the shoe catalog doesn't store (price/budget). When one of these is
  // filled we append a line asking the model to verify it online.
  webFactor?: boolean;
};

type Section = { id: string; title: Bi; fields: Field[] };

const SECTIONS: Section[] = [
  {
    id: "play",
    title: { zh: "打法与身体", en: "Play & body" },
    fields: [
      {
        id: "position",
        label: { zh: "场上位置", en: "Position" },
        placeholder: { zh: "例如：控卫、得分后卫、大前锋", en: "e.g. point guard, wing, big" },
        promptLabel: { zh: "位置", en: "Position" }
      },
      {
        id: "playstyle",
        label: { zh: "打法风格", en: "Playstyle" },
        placeholder: { zh: "例如：突破为主、外线投射、组织串联、内线强攻", en: "e.g. slasher, shooter, playmaker, post" },
        promptLabel: { zh: "打法", en: "Playstyle" }
      },
      {
        id: "body",
        label: { zh: "身高 / 体重", en: "Height / weight" },
        placeholder: { zh: "例如：180cm / 75kg（填了球员档案可跳过）", en: "e.g. 180cm / 75kg (skip if profile set)" },
        promptLabel: { zh: "身高体重", en: "Height & weight" }
      },
      {
        id: "level",
        label: { zh: "水平 / 打球频率", en: "Skill / frequency" },
        placeholder: { zh: "例如：业余，每周打 2-3 次", en: "e.g. amateur, 2-3× a week" },
        promptLabel: { zh: "水平·频率", en: "Level & frequency" }
      }
    ]
  },
  {
    id: "needs",
    title: { zh: "需求重点", en: "Key needs" },
    fields: [
      {
        id: "priority",
        label: { zh: "最看重的性能", en: "What matters most" },
        placeholder: { zh: "例如：抓地、缓震、稳定、贴地、包裹（可多写几项）", en: "e.g. traction, cushioning, stability, court feel" },
        promptLabel: { zh: "最看重", en: "Priorities" }
      },
      {
        id: "court",
        label: { zh: "主要场地", en: "Main court" },
        placeholder: { zh: "例如：室内木地板 / 室外水泥地", en: "e.g. indoor hardwood / outdoor concrete" },
        promptLabel: { zh: "场地", en: "Court" }
      },
      {
        id: "foot",
        label: { zh: "脚型 / 伤病顾虑", en: "Feet / injuries" },
        placeholder: { zh: "例如：宽脚、扁平足、有崴脚史", en: "e.g. wide feet, flat arch, ankle history" },
        promptLabel: { zh: "脚型·伤病", en: "Feet & injuries" }
      },
      {
        id: "weightPref",
        label: { zh: "鞋重偏好", en: "Weight preference" },
        placeholder: { zh: "例如：越轻越好 / 不在意", en: "e.g. as light as possible / don't mind" },
        promptLabel: { zh: "鞋重", en: "Shoe weight" }
      }
    ]
  },
  {
    id: "buy",
    title: { zh: "购买偏好", en: "Buying preferences" },
    fields: [
      {
        id: "budget",
        label: { zh: "预算范围", en: "Budget" },
        placeholder: { zh: "例如：500 元以内 / 800-1200", en: "e.g. under $120 / $150-200" },
        promptLabel: { zh: "预算", en: "Budget" },
        webFactor: true
      },
      {
        id: "brand",
        label: { zh: "品牌倾向", en: "Brand" },
        placeholder: { zh: "例如：偏好耐克/阿迪，想避开某某", en: "e.g. prefer Nike/Adidas, avoid X" },
        promptLabel: { zh: "品牌", en: "Brand" }
      },
      {
        id: "signature",
        label: { zh: "球星 / 签名鞋", en: "Player / signature" },
        placeholder: { zh: "例如：喜欢欧文、科比系列", en: "e.g. like the Kyrie / Kobe lines" },
        promptLabel: { zh: "球星·签名鞋", en: "Player/signature" }
      },
      {
        id: "looks",
        label: { zh: "外观 / 配色", en: "Looks / colorway" },
        placeholder: { zh: "例如：低帮、素色百搭", en: "e.g. low-top, clean colorway" },
        promptLabel: { zh: "外观", en: "Looks" }
      }
    ]
  },
  {
    id: "extra",
    title: { zh: "场景与补充", en: "Context & extras" },
    fields: [
      {
        id: "usage",
        label: { zh: "使用场景", en: "Use case" },
        placeholder: { zh: "例如：实战为主 / 训练 / 日常穿搭", en: "e.g. games / training / casual wear" },
        promptLabel: { zh: "用途", en: "Use" }
      },
      {
        id: "current",
        label: { zh: "现役球鞋 + 痛点", en: "Current shoes + issues" },
        placeholder: { zh: "例如：现在穿 XX，觉得前掌太硬、容易崴脚", en: "e.g. now wearing X, forefoot too stiff" },
        promptLabel: { zh: "现役球鞋", en: "Current shoes" },
        multiline: true
      },
      {
        id: "sizing",
        label: { zh: "尺码 / 宽度困扰", en: "Sizing / width" },
        placeholder: { zh: "例如：平时 US9，常觉得挤脚", en: "e.g. usually US9, often too tight" },
        promptLabel: { zh: "尺码·宽度", en: "Sizing" }
      },
      {
        id: "notes",
        label: { zh: "补充说明", en: "Anything else" },
        placeholder: { zh: "任何其它想告诉 AI 的需求", en: "anything else you'd tell the AI" },
        promptLabel: { zh: "补充", en: "Notes" },
        multiline: true
      }
    ]
  }
];

// Stitch the answered fields into one natural-language request. Empty fields are
// skipped entirely, so the output only reflects what the user chose to share.
function buildPrompt(values: Record<string, string>, zh: boolean): string {
  const sep = zh ? "：" : ": ";
  const lines: string[] = [];
  let hasWebFactor = false;
  for (const section of SECTIONS) {
    for (const field of section.fields) {
      const v = (values[field.id] ?? "").trim();
      if (!v) continue;
      lines.push(`· ${zh ? field.promptLabel.zh : field.promptLabel.en}${sep}${v}`);
      if (field.webFactor) hasWebFactor = true;
    }
  }
  if (lines.length === 0) return "";
  const intro = zh ? "帮我挑一双篮球鞋，我的情况：" : "Help me pick a basketball shoe. Here's my situation:";
  let out = `${intro}\n${lines.join("\n")}`;
  if (hasWebFactor) {
    out += `\n${
      zh
        ? "（预算/价格这类鞋库里可能没有的信息，麻烦联网查证后再推荐。）"
        : "(For price/budget and anything not in the catalog, please look it up online before recommending.)"
    }`;
  }
  return out;
}

export function PromptQuestionnaire({
  open,
  onClose,
  onGenerate
}: {
  open: boolean;
  onClose: () => void;
  onGenerate: (text: string) => void;
}) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const [values, setValues] = useState<Record<string, string>>({});

  const preview = useMemo(() => buildPrompt(values, zh), [values, zh]);
  const answered = useMemo(() => Object.values(values).filter((v) => v.trim().length > 0).length, [values]);

  const setValue = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }));
  const clearAll = () => {
    haptics.selection();
    setValues({});
  };

  const handleGenerate = () => {
    if (!preview) return;
    haptics.selection();
    onGenerate(preview);
  };

  const inputClass =
    "w-full rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] px-3 py-2 text-sm outline-none transition focus:border-[rgb(var(--text)/0.5)] placeholder:text-[rgb(var(--subtext)/0.5)]";

  return (
    <Modal open={open} onClose={onClose} title="" maxWidthClass="max-w-2xl">
      {/* Own header (Modal's title prop routes through translate(); we inline
          both languages instead for these feature-specific strings). */}
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgb(var(--brand)/0.14)] text-[rgb(var(--brand))]">
          <Sparkles className="h-[1.05rem] w-[1.05rem]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-[0.01em]">
            {zh ? "帮你生成选鞋描述" : "Build your shoe request"}
          </h2>
          <p className="mt-1 text-[0.82rem] leading-relaxed soft-text">
            {zh
              ? "随便填几项就行，不确定的留空或跳过。填完点「生成」，我会拼成一句话填进输入框，你可以再改后发送。"
              : "Fill in what you can — leave anything you're unsure about blank. Hit Generate and I'll stitch it into one request in the composer, ready for you to tweak and send."}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {SECTIONS.map((section, si) => (
          <div key={section.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[rgb(var(--text)/0.08)] text-[0.66rem] font-bold soft-text">
                {si + 1}
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] soft-text">
                {zh ? section.title.zh : section.title.en}
              </span>
              <span className="h-px flex-1 bg-[rgb(var(--glass-stroke-soft)/0.4)]" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {section.fields.map((field) => {
                const id = `q-${field.id}`;
                const value = values[field.id] ?? "";
                return (
                  <div key={field.id} className={field.multiline ? "space-y-1 sm:col-span-2" : "space-y-1"}>
                    <label htmlFor={id} className="block text-[0.8rem] font-medium text-[rgb(var(--text)/0.85)]">
                      {zh ? field.label.zh : field.label.en}
                    </label>
                    {field.multiline ? (
                      <textarea
                        id={id}
                        value={value}
                        onChange={(e) => setValue(field.id, e.target.value)}
                        rows={2}
                        placeholder={zh ? field.placeholder.zh : field.placeholder.en}
                        style={{ fontSize: "16px" }}
                        className={`${inputClass} resize-none`}
                      />
                    ) : (
                      <input
                        id={id}
                        type="text"
                        value={value}
                        onChange={(e) => setValue(field.id, e.target.value)}
                        placeholder={zh ? field.placeholder.zh : field.placeholder.en}
                        style={{ fontSize: "16px" }}
                        className={inputClass}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Live preview of the request we'll drop into the composer. */}
      {preview && (
        <div className="mt-5 space-y-1.5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] soft-text">
            {zh ? "将填入输入框的内容" : "This will go into the composer"}
          </p>
          <div className="whitespace-pre-wrap rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--bg-elev)/0.5)] px-3.5 py-3 text-[0.82rem] leading-relaxed text-[rgb(var(--text)/0.9)]">
            {preview}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[rgb(var(--glass-stroke-soft)/0.35)] pt-4">
        <button
          type="button"
          onClick={clearAll}
          disabled={answered === 0}
          className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--muted)/0.5)] px-2.5 py-1.5 text-xs soft-text transition hover:border-[rgb(var(--text)/0.4)] disabled:opacity-40"
        >
          {zh ? "清空" : "Clear"}
        </button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            {zh ? "取消" : "Cancel"}
          </Button>
          <Button variant="primary" type="button" onClick={handleGenerate} disabled={!preview}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            {zh ? "生成并填入" : "Generate"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
