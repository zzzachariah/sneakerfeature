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
  children?: NativeMenuNode[];
};

export type NativeNavButton = { key: string; symbol: string; menu?: NativeMenuNode[] };

// Flat item for an action-sheet style menu (presentMenu).
export type NativeMenuItem = { key: string; label: string; destructive?: boolean };

export interface NativeChromePlugin {
  // Bottom tab bar
  configureTabBar(options: { tabs: NativeTab[]; active?: string }): Promise<void>;
  setActiveTab(options: { key: string }): Promise<void>;
  setVisible(options: { visible: boolean }): Promise<void>;
  // Top navigation bar
  configureNavBar(options: { title?: string; buttons: NativeNavButton[] }): Promise<void>;
  setNavBarVisible(options: { visible: boolean }): Promise<void>;
  // Ad-hoc native menus / confirms (presentable from any web trigger)
  presentMenu(options: {
    title?: string;
    message?: string;
    items: NativeMenuItem[];
    cancelLabel?: string;
  }): Promise<{ key: string | null }>;
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
  removeAllListeners(): Promise<void>;
}

export const NativeChrome = registerPlugin<NativeChromePlugin>("NativeChrome");
