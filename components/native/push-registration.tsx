"use client";

import { useEffect } from "react";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { nativePlatform } from "@/lib/native/native";

// When the web app runs inside the native shell and the user is signed in, this
// requests notification permission, registers for push, and stores the device
// token. It also deep-links into the app when a notification is tapped (the
// weekly digest sends a `url` in the payload). No-ops on the web.
export function PushRegistration() {
  const { signedIn } = useAuthState();

  useEffect(() => {
    // iOS only. On Android the @capacitor/push-notifications plugin uses Firebase
    // Cloud Messaging, which requires Google Play Services — absent on many
    // mainland-China devices (Huawei/HarmonyOS and GMS-stripped ROMs), where
    // calling register() crashed the app a beat after the page loaded (the
    // device-specific "loads, then crashes" reports). FCM is also blocked in
    // mainland China, so it can't deliver there anyway. Skip Android until a
    // China-capable push channel (e.g. a vendor/JPush integration) is wired up.
    if (!signedIn || nativePlatform() !== "ios") return;

    let disposed = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive !== "granted") return;

        await PushNotifications.register();

        const registration = await PushNotifications.addListener("registration", (token) => {
          void fetch("/api/push/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token.value, platform: nativePlatform() })
          }).catch(() => {});
        });

        // Tapping a notification deep-links to the URL in its payload.
        const tap = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const url = action.notification.data?.url as string | undefined;
          if (url) window.location.assign(url);
        });

        if (disposed) {
          registration.remove();
          tap.remove();
        } else {
          cleanups.push(() => registration.remove(), () => tap.remove());
        }
      } catch {
        /* push plugin unavailable */
      }
    })();

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, [signedIn]);

  return null;
}
