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
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to snkrfeature",
    body: "A living index of basketball sneakers. Let me show you around in under a minute.",
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
    body: "Filter by tech, keywords, and structured fields when the homepage table isn't enough.",
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
    id: "nav-focus",
    selector: "[data-tutorial='nav-focus']",
    title: "Rating focus",
    body: "Pick your playstyle and ratings reweight to what matters to you on court.",
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
    title: "Home — the index at a glance",
    body: "Live counts, what we cover, and quick links to Compare and Submit.",
    placement: "right",
    padding: 14,
    requiresSlide: 0,
    requiresPath: "/"
  },
  {
    id: "database",
    selector: "[data-tutorial='home-table']",
    title: "The database",
    body: "Every indexed pair, sortable and searchable. Tap a row to open the full spec sheet.",
    placement: "top",
    padding: 12,
    requiresSlide: 1,
    requiresPath: "/"
  },
  {
    id: "database-search",
    selector: "[data-tutorial='home-table-search']",
    title: "Quick search",
    body: "Type a model, player, or tech keyword. Filter by brand on the left.",
    placement: "bottom",
    padding: 8,
    requiresSlide: 1,
    requiresPath: "/"
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
