/** Clause-local, word-bounded signals. Unrecognized text is missing evidence. */
function escape(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function normalized(text: string) { return text.toLowerCase().replace(/[’‘]/g, "'"); }
function negated(text: string, index: number) {
  const before = text.slice(Math.max(0, index - 40), index);
  return /(?:\b(?:not|no|never|without|isn't|isnt|wasn't|wasnt|aren't|arent|lacks|lacking)\b|不|没|无|缺乏)(?:[\s-]*(?:very|especially|really|particularly|太|够|很|是|特别|非常))*[\s-]*$/i.test(before);
}
export function hasAffirmedSignal(raw: string, phrases: readonly string[]): boolean {
  const text = normalized(raw);
  return phrases.some(phrase => {
    const pattern = new RegExp(`(?<![a-z0-9])${escape(phrase)}(?![a-z0-9])`, "g");
    return [...text.matchAll(pattern)].some(match => !negated(text, match.index!));
  });
}
const SIGNALS: [string, number][] = [
  ["very high", 1], ["very good", 0.9], ["excellent", 1], ["elite", 1], ["outstanding", 1],
  ["good", 0.8], ["great", 0.85], ["high", 0.85], ["strong", 0.8], ["stable", 0.8],
  ["supportive", 0.8], ["secure", 0.8], ["stiff", 0.8],
  ["decent", 0.6], ["moderate", 0.5], ["balanced", 0.5], ["solid", 0.7], ["adequate", 0.5],
  ["low", 0.2], ["poor", 0.15], ["minimal", 0.2], ["weak", 0.15], ["unstable", 0.1],
  ["非常好", 0.9], ["优秀", 1], ["出色", 0.9], ["顶级", 1], ["良好", 0.8], ["好", 0.8],
  ["稳定", 0.8], ["扎实", 0.75], ["一般", 0.5], ["适中", 0.5], ["较差", 0.15], ["差", 0.15], ["不足", 0.2]
];
export function keywordScore(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const text = normalized(raw);
  const consumed: {start: number; end: number}[] = [];
  const scores: number[] = [];
  for (const [phrase, value] of [...SIGNALS].sort((a,b) => b[0].length-a[0].length)) {
    const pattern = new RegExp(`(?<![a-z0-9])${escape(phrase)}(?![a-z0-9])`, "g");
    for (const match of text.matchAll(pattern)) {
      const start=match.index!, end=start+phrase.length;
      if (consumed.some(r => start<r.end && end>r.start)) continue;
      consumed.push({start,end});
      // "Not excellent" is not proof of terrible performance; cap it at neutral.
      scores.push(negated(text,start) ? value>=0.5 ? Math.min(0.45,1-value) : 0.55 : value);
    }
  }
  return scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : null;
}
