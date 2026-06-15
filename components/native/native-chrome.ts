import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

// JS interface for the local `native-chrome` Capacitor plugin (iOS Swift lives
// in /native-chrome). Only the iOS app provides an implementation; on web /
// Android the proxy is never called (callers guard with isNativeIOS()).

export type NativeTab = { key: string; label: string; symbol: string };

export interface NativeChromePlugin {
  configureTabBar(options: { tabs: NativeTab[]; active?: string }): Promise<void>;
  setActiveTab(options: { key: string }): Promise<void>;
  setVisible(options: { visible: boolean }): Promise<void>;
  addListener(
    eventName: "tabSelected",
    listener: (data: { key: string }) => void
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const NativeChrome = registerPlugin<NativeChromePlugin>("NativeChrome");
