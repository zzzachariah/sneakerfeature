"use client";

// The AI's "one thing I still need to know", rendered as its own answerable
// composer instead of the last sentence of a wall of prose.
//
// Why a separate box: the question used to be buried at the end of the reply,
// where it read as commentary rather than a prompt, and answering it meant
// scrolling to the bottom composer and retyping context. Here the question IS
// the label of the input that answers it — one tap, one line, conversation
// continues. Quick chips cover the common answers so the most frequent replies
// don't need typing at all.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CornerDownLeft, MessageCircleQuestion } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { isCjkInput } from "@/lib/i18n/detect-cjk";
import { haptics } from "@/lib/native/haptics";

type Props = {
  question: string;
  /** Disabled while a turn is streaming — one in-flight request at a time. */
  sending: boolean;
  onSend: (message: string) => void;
};

// Recognizable question shapes get tappable answers. Matched on the question
// text in whichever language it was asked, and deliberately conservative: an
// unrecognized question just gets the free-text field, never a wrong chip.
function quickAnswers(question: string, zh: boolean): string[] {
  const q = question.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => q.includes(n));

  if (has("室内", "室外", "水泥", "木地板", "indoor", "outdoor", "blacktop", "hardwood", "court surface"))
    return zh ? ["主要室内木地板", "主要室外水泥场", "两边都打"] : ["Mostly indoor hardwood", "Mostly outdoor blacktop", "Both about equally"];
  if (has("预算", "价位", "budget", "spend", "price range"))
    return zh ? ["500 元以内", "500-800 元", "800-1200 元", "预算不是问题"] : ["Under $80", "$80-150", "$150-220", "Budget isn't the issue"];
  if (has("位置", "打法", "position", "playstyle", "play as"))
    return zh ? ["后卫", "锋线", "内线"] : ["Guard", "Wing / forward", "Big man"];
  if (has("脚宽", "脚型", "宽楦", "foot width", "wide feet", "narrow feet"))
    return zh ? ["脚偏宽", "标准脚型", "脚偏窄"] : ["Wide feet", "Standard width", "Narrow feet"];
  if (has("频率", "每周", "how often", "per week"))
    return zh ? ["每周 1-2 次", "每周 3-4 次", "几乎每天"] : ["1-2× a week", "3-4× a week", "Almost daily"];
  return [];
}

export function FollowUpBox({ question, sending, onSend }: Props) {
  const { translate } = useLocale();
  // The question is written in the language the user typed in, so the chips and
  // placeholder answering it follow the QUESTION — not the UI locale. Chinese
  // quick replies under an English question would be unusable.
  const zh = isCjkInput(question);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // A new question means a new answer — clear anything typed against the old one.
  useEffect(() => {
    setText("");
  }, [question]);

  const chips = quickAnswers(question, zh);
  const canSend = text.trim().length > 0 && !sending;

  const submit = (value?: string) => {
    const payload = (value ?? text).trim();
    if (!payload || sending) return;
    haptics.selection();
    onSend(payload);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="sp-followup max-w-[90%] rounded-2xl border p-3">
      <div className="mb-2.5 flex items-start gap-2">
        <MessageCircleQuestion className="sp-followup-icon mt-[0.1rem] h-4 w-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 text-[0.86rem] font-medium leading-snug">{question}</p>
      </div>

      {chips.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              disabled={sending}
              onClick={() => submit(c)}
              className="sp-followup-chip tap-44 rounded-full px-3 py-1.5 text-[0.76rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.3)]"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="sp-followup-field flex items-center gap-2 rounded-xl px-2.5 py-1">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
          placeholder={zh ? "在这里回答，继续聊…" : "Answer here to keep going…"}
          aria-label={question}
          // 16px prevents iOS from zooming the viewport on focus.
          style={{ fontSize: "16px" }}
          className="min-w-0 flex-1 bg-transparent py-1.5 outline-none placeholder:text-[rgb(var(--subtext)/0.5)] disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => submit()}
          disabled={!canSend}
          aria-label={translate("Send")}
          className="sp-followup-send inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.3)]"
        >
          <CornerDownLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
