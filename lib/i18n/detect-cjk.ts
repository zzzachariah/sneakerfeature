// Client-safe language sniff for AI conversation surfaces.
//
// The Smart Picker's answer language follows what the USER typed, not the app's
// UI locale — so the chrome wrapped around that answer (the thinking panel's
// header, the follow-up box's placeholder and quick replies) has to follow the
// same signal, or a zh-UI user who types English gets English steps under a
// Chinese heading.
//
// Deliberately a standalone module rather than a re-export of
// lib/ai/derive-proscons: that file drags the shoe types and the star-rating
// scorer along with it, none of which belong in a client bundle. The rule is
// identical — any CJK ideograph present means Chinese.

const CJK = /[㐀-鿿]/;

export function isCjkInput(text: string): boolean {
  return CJK.test(text);
}
