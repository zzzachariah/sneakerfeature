import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

// JS interface for the local `native-chrome` Capacitor plugin (iOS Swift lives
// in /native-chrome). Only the iOS app provides an implementation; on web /
// Android the proxy is never called (callers guard with the helpers in
// native-menu.ts / the nativeBarAvailable checks).

export type NativeTab = { key: string; label: string; symbol: string };

// Recursive menu node for native UIMenu pull-downs (top nav bar).
export type NativeMenuNode = {
  key: string;
  label: string;
  symbol?: string;
  checked?: boolean;
  destructive?: boolean;
  /** Grayed out and untappable (UIMenuElement.Attributes.disabled). */
  disabled?: boolean;
  children?: NativeMenuNode[];
};

export type NativeNavButton = { key: string; symbol: string; menu?: NativeMenuNode[] };

// Flat item for an action-sheet style menu (presentMenu).
export type NativeMenuItem = { key: string; label: string; destructive?: boolean };

// Rich row for the native options sheet (presentOptions) — a Liquid Glass sheet
// with icon + title + subtitle rows that supports a checkmark on the current
// choice and grayed-out (locked) rows, e.g. the Smart Picker's model list.
export type NativeOptionItem = {
  key: string;
  label: string;
  subtitle?: string;
  /** SF Symbol name for the leading icon. */
  symbol?: string;
  checked?: boolean;
  /** Grayed out and untappable (e.g. a model the plan doesn't include). */
  disabled?: boolean;
  /** Small trailing tag shown on locked rows (e.g. "Pro"). */
  tag?: string;
};

export interface NativeChromePlugin {
  // Bottom tab bar
  configureTabBar(options: { tabs: NativeTab[]; active?: string }): Promise<void>;
  setActiveTab(options: { key: string }): Promise<void>;
  setVisible(options: { visible: boolean }): Promise<void>;
  // Top navigation bar
  configureNavBar(options: { title?: string; logoUrl?: string; buttons: NativeNavButton[] }): Promise<void>;
  setNavBarVisible(options: { visible: boolean }): Promise<void>;
  // Native search bar (under the nav bar; drives the web list)
  configureSearch(options: { placeholder?: string }): Promise<void>;
  setSearchVisible(options: { visible: boolean }): Promise<void>;
  // Push text INTO the native field (web → native), e.g. on a programmatic clear.
  setSearchText(options: { text: string }): Promise<void>;
  // Native floating action button (home feed speed-dial trigger). The web drives
  // visibility; on tap the `fabTap` event fires and the web presents the expanded
  // actions via presentMenu (itself a system Liquid Glass action sheet).
  configureFab(options: { symbol?: string; label?: string }): Promise<void>;
  setFabVisible(options: { visible: boolean }): Promise<void>;
  // Native floating back button (shoe-detail page, top-left). The web drives
  // visibility per route; on tap the `backTap` event fires and the web navigates
  // back (router.back(), falling back to home). A real Liquid Glass surface, like
  // the FAB above.
  configureBack(options: { symbol?: string; label?: string }): Promise<void>;
  setBackVisible(options: { visible: boolean }): Promise<void>;
  // Native pull-to-refresh (UIRefreshControl on the web scroll view). Toggle per
  // route; fires the `pullRefresh` event when the user pulls down at the top.
  setPullToRefreshEnabled(options: { enabled: boolean }): Promise<void>;
  // Ad-hoc native menus / confirms (presentable from any web trigger)
  presentMenu(options: {
    title?: string;
    message?: string;
    items: NativeMenuItem[];
    cancelLabel?: string;
  }): Promise<{ key: string | null }>;
  // Native Liquid Glass options sheet with checkable / disableable rich rows.
  // Resolves with the chosen key, or null when dismissed.
  presentOptions(options: { title?: string; items: NativeOptionItem[] }): Promise<{ key: string | null }>;
  confirm(options: {
    title?: string;
    message?: string;
    okLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  }): Promise<{ confirmed: boolean }>;
  addListener(
    eventName: "tabSelected" | "navAction",
    listener: (data: { key: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "searchChanged",
    // `submit` is true only when the user hits the keyboard Search key (or
    // Cancel) — mirrors the web's "filter on submit, not on every keystroke".
    listener: (data: { text: string; submit?: boolean }) => void
  ): Promise<PluginListenerHandle>;
  addListener(eventName: "pullRefresh", listener: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: "fabTap", listener: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: "backTap", listener: () => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const NativeChrome = registerPlugin<NativeChromePlugin>("NativeChrome");

// Window event the native search bar dispatches with { text }; the home feed
// listens for it to drive its query. Keeps the two decoupled (no prop drilling).
export const NATIVE_HOME_SEARCH_EVENT = "native-home-search";
