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

// Onboarding tour, written from a first-time visitor's point of view.
//
// Deliberately short — four stops, one screen each, and any visitor always sees
// exactly four because the two nav variants are mutually exclusive:
//   1. What is this?              → welcome
//   2. How does it get personal?  → avatar (the player profile — our #1 feature)
//   3. How do I choose a shoe?    → nav (Compare + Smart Picker, the decision tools)
//   4. Let's actually do it       → persona-setup (interactive finale)
//
// Everything else a newcomer can find on their own — the catalog, sign-in,
// advanced search, the language / download / legal menu — is intentionally NOT
// its own step. A tour that ends before it outstays its welcome gets finished.
//
// Every selector points at an element that exists in the live DOM, and each step
// is breakpoint-aware: `isStepAvailable` (bottom of file) drops any step whose
// target is missing or laid out with a zero box, so the desktop nav cluster and
// the mobile bottom tab bar each contribute their own variant without the
// other's dead target ever showing. Anchors:
//   navbar.tsx        — nav-links (md+)
//   mobile-bottom-nav — mobile-nav (phone tab bar)
//   for-you-view.tsx  — home-avatar (the player figure on the homepage)
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to sneakerfeature",
    body: "Basketball sneakers, scored to how you actually play. Four quick stops — about thirty seconds.",
    placement: "center"
  },
  {
    id: "avatar",
    selector: "[data-tutorial='home-avatar']",
    title: "This little baller is you",
    body: "This figure is your player profile. Once it's set, every shoe gets a match score tuned to how you actually play. Tap it whenever you're ready to fill it in.",
    placement: "bottom",
    padding: 10,
    requiresPath: "/"
  },
  {
    // Desktop: the centered primary nav (Home / Compare / Smart Picker / Submit /
    // Account). Hidden on phones, so this is filtered out there and the
    // mobile-nav variant below takes over.
    id: "nav-desktop",
    selector: "[data-tutorial='nav-links']",
    title: "Compare & Smart Picker",
    body: "Line up to 5 shoes side by side with Compare, or let Smart Picker's AI recommend a pair — plus Home and Submit, all from here.",
    placement: "bottom",
    padding: 10,
    scrollIntoView: false
  },
  {
    // Phones only: the floating bottom tab bar.
    id: "nav-mobile",
    selector: "[data-tutorial='mobile-nav']",
    title: "Compare & Smart Picker",
    body: "These tabs are your map: Compare lines shoes up side by side, Smart Picker's AI recommends a pair, and Home, Submit and Account are a thumb away.",
    placement: "top",
    padding: 8,
    radius: 30,
    scrollIntoView: false
  },
  {
    // Interactive finale: hand control to the real player-profile modal. Kept
    // last so a visitor who dismisses it (which ends the tour) has still seen the
    // whole walkthrough, and saving both finishes the tour and unlocks
    // personalized scoring. Also where we point them back to re-open the tour.
    id: "persona-setup",
    title: "Set up your player profile",
    body: "Ready? Set your position, skill, height, weight and playstyle so every shoe gets scored for you. You can reopen this tour anytime from the menu.",
    placement: "center",
    action: { type: "open-modal", modalId: "persona" },
    awaitUserAction: true
  }
];

/**
 * Whether a step can be shown right now on this device/page. Center, no-selector,
 * and action (modal) steps are always shown. Selector steps require a target
 * that exists AND is laid out (nonzero box) — this transparently skips controls
 * that are `display:none` on the current breakpoint (e.g. the desktop-only nav
 * cluster on phones, or the phone-only bottom tab bar on desktop), so the tour
 * never lands on a dead target. Path-scoped steps also require the matching
 * route, so homepage-only anchors never show when the tour is opened elsewhere.
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
