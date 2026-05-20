export type TutorialStep = {
  id: string;
  selector?: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  padding?: number;
  radius?: number;
  shape?: "rect" | "circle";
  requiresSlide?: 0 | 1;
  requiresPath?: string;
  scrollIntoView?: boolean;
  action?: { type: "open-modal"; modalId: "persona" | "rating-focus" };
  // When true, the tour hands control to the user: the overlay drops its dimmer,
  // click blocker, and input interception so the opened UI is fully usable.
  // The tour advances when the user completes the action (saves), or stops if
  // they dismiss it.
  awaitUserAction?: boolean;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to snkrfeature",
    body: "Personalized basketball sneaker recommendations. Let me show you around in under a minute.",
    placement: "center"
  },
  {
    id: "nav-links",
    selector: "[data-tutorial='nav-links']",
    title: "Primary navigation",
    body: "Jump to Home, Compare, Submit, and your Account from here.",
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
    id: "nav-theme",
    selector: "[data-tutorial='nav-theme']",
    title: "Theme",
    body: "Cycle light, dark, and system. Your choice is remembered.",
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
    id: "hero",
    selector: "[data-tutorial='hero']",
    title: "Sneaker Database — built around you",
    body: "Live counts and what we cover. Below the fold you'll see shoes ranked for your player profile.",
    placement: "right",
    padding: 14,
    requiresSlide: 0,
    requiresPath: "/",
    scrollIntoView: false
  },
  {
    id: "persona-avatar",
    selector: "[data-tutorial='hero-avatar']",
    title: "Your player avatar",
    body: "This little figure represents you. Tap it to set your position, skill level, height and weight so we can score every shoe for you.",
    placement: "left",
    requiresSlide: 0,
    requiresPath: "/",
    padding: 12,
    radius: 16,
    scrollIntoView: true
  },
  {
    id: "persona-setup",
    selector: "[data-tutorial='hero-avatar']",
    title: "Set up your player profile",
    body: "Pick your position(s), skill level, whether you have flat feet, and your height & weight. Save to continue the tour, or cancel to exit.",
    placement: "center",
    requiresSlide: 0,
    requiresPath: "/",
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
    requiresSlide: 1,
    requiresPath: "/",
    scrollIntoView: false
  },
  {
    id: "mode-toggle",
    selector: "[data-tutorial='home-mode-toggle']",
    title: "Browse all or Personalized",
    body: "Flip between personalized recommendations and the unfiltered database any time.",
    placement: "bottom",
    requiresSlide: 1,
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
    requiresSlide: 1,
    requiresPath: "/",
    scrollIntoView: false
  },
  {
    id: "trigger",
    selector: "[data-tutorial='nav-tutorial']",
    title: "Want a refresher?",
    body: "Re-open this tour anytime from this icon in the navbar. Enjoy snkrfeature.",
    placement: "bottom",
    shape: "circle",
    padding: 6
  }
];
