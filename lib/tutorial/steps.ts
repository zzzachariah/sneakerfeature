export type TutorialStep = {
  id: string;
  selector?: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  padding?: number;
  radius?: number;
  shape?: "rect" | "circle";
  requiresPath?: string;
  scrollIntoView?: boolean;
  action?: { type: "open-modal"; modalId: "persona" | "rating-focus" };
  // When true, the tour hands control to the user: the overlay drops its dimmer,
  // click blocker, and input interception so the opened UI is fully usable. The
  // tour advances when the user completes the action (saves), or stops if they
  // dismiss it.
  awaitUserAction?: boolean;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to sneakerfeature",
    body: "Personalized basketball sneaker recommendations. Let me show you around in under a minute.",
    placement: "center"
  },
  {
    id: "nav-links",
    selector: "[data-tutorial='nav-links']",
    title: "Primary navigation",
    body: "Jump to Home, Compare, Smart Picker, Submit, and your Account from here.",
    placement: "bottom",
    padding: 10
  },
  {
    id: "nav-search",
    selector: "[data-tutorial='nav-search']",
    title: "Advanced search",
    body: "Filter by tech, keywords, and structured fields when the homepage feed isn't enough.",
    placement: "bottom",
    shape: "circle",
    padding: 6
  },
  {
    id: "nav-language",
    selector: "[data-tutorial='nav-language']",
    title: "Language",
    body: "Switch between English and Chinese. Machine-translated content is marked.",
    placement: "bottom",
    shape: "circle",
    padding: 6
  },
  {
    id: "nav-persona",
    selector: "[data-tutorial='nav-persona']",
    title: "Player profile",
    body: "Set your position, skill, height, weight, and playstyle here. We use these to recommend shoes.",
    placement: "bottom",
    shape: "circle",
    padding: 6
  },
  {
    id: "nav-account",
    selector: "[data-tutorial='nav-account']",
    title: "Account",
    body: "Sign in to save comparisons, rate shoes, and join discussions.",
    placement: "bottom",
    shape: "circle",
    padding: 6
  },
  {
    id: "persona-setup",
    title: "Set up your player profile",
    body: "Tell us your position(s), skill level, flat-feet, and height & weight so we can score every shoe for you. Tap below to open it — the tour pauses while you fill it in, then continues after you save.",
    placement: "center",
    action: { type: "open-modal", modalId: "persona" },
    awaitUserAction: true
  },
  {
    id: "feed",
    selector: "[data-tutorial='home-feed']",
    title: "Your personalized feed",
    body: "Every shoe scored against your player profile. Tap a card to open the full spec sheet.",
    placement: "top",
    padding: 12,
    requiresPath: "/",
    scrollIntoView: false
  },
  {
    id: "mode-toggle",
    selector: "[data-tutorial='home-mode-toggle']",
    title: "Browse all or Personalized",
    body: "Flip between personalized recommendations and the unfiltered database any time.",
    placement: "bottom",
    requiresPath: "/",
    padding: 8
  },
  {
    id: "feed-search",
    selector: "[data-tutorial='home-feed-search']",
    title: "Quick search",
    body: "Type a model, player, or tech keyword. Filter by brand from the toolbar.",
    placement: "bottom",
    padding: 8,
    requiresPath: "/",
    scrollIntoView: false
  },
  {
    id: "trigger",
    selector: "[data-tutorial='nav-tutorial']",
    title: "Want a refresher?",
    body: "Re-open this tour anytime from this icon in the navbar. Enjoy sneakerfeature.",
    placement: "bottom",
    shape: "circle",
    padding: 6
  }
];

/**
 * Whether a step can be shown right now on this device/page. Center, no-selector,
 * and action (modal) steps are always shown. Selector steps require a target
 * that exists AND is laid out (nonzero box) — this transparently skips controls
 * that are `display:none` on the current breakpoint (e.g. desktop-only navbar
 * icons hidden on phones), so the tour never lands on a dead target.
 */
export function isStepAvailable(step: TutorialStep): boolean {
  if (typeof document === "undefined") return true;
  if (!step.selector || step.placement === "center" || step.action) return true;
  if (step.requiresPath && window.location.pathname !== step.requiresPath) return false;
  const el = document.querySelector(step.selector) as HTMLElement | null;
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
