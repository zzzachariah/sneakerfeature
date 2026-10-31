import type { DemoShoe } from './picker-demo-contract';
export type PickerLanguage = 'zh' | 'en';
export function recommendationText(shoes: DemoShoe[]) {
  return shoes.flatMap(shoe => [shoe.reason, ...shoe.pros, ...shoe.cons]);
}
export function matchesPickerLanguage(text: string, lang: PickerLanguage) {
  const chinese = /[\u3400-\u9fff]/.test(text);
  return !!text.trim() && (lang === 'zh' ? chinese : !chinese);
}
export function applyRecommendationTranslation(shoes: DemoShoe[], values: unknown, lang: PickerLanguage): DemoShoe[] {
  const original = recommendationText(shoes);
  if (!Array.isArray(values) || values.length !== original.length || !values.every(v => typeof v === 'string' && v.length <= 5000 && matchesPickerLanguage(v, lang))) throw new Error('translation_incomplete');
  let i = 0;
  return shoes.map(shoe => ({...shoe, reason: values[i++], pros: shoe.pros.map(() => values[i++]), cons: shoe.cons.map(() => values[i++])}));
}
