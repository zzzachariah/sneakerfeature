import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data/auth";
import { getMemberContext } from "@/lib/subscription/entitlements";
import { DEFAULT_SKIN } from "@/lib/subscription/skins";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import { SubscribeClient, type SubscribeCurrent } from "@/components/subscribe/subscribe-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "会员 · sneakerfeature",
  description: "Pro 与 Max 会员：更强的 AI 选鞋模型、逐款精准尺码，以及可自由切换的奢侈皮肤与个性化。"
};

export default async function SubscribePage() {
  const profile = await getCurrentProfile();

  // Hidden from the public while payments are being finished. Admins can still
  // reach /subscribe directly to test the live checkout end-to-end. Flip
  // NEXT_PUBLIC_SUBSCRIBE_LIVE=true to open it to everyone.
  if (!SUBSCRIBE_LIVE && profile?.role !== "admin") {
    redirect("/");
  }

  let current: SubscribeCurrent = {
    signedIn: false,
    isAdmin: false,
    tier: "free",
    isPermanent: false,
    isGift: false,
    expiresAt: null,
    skin: DEFAULT_SKIN,
    customAccent: null,
    homeOrder: []
  };

  if (profile) {
    const member = await getMemberContext(profile.id);
    current = {
      signedIn: true,
      isAdmin: profile.role === "admin",
      tier: member.tier,
      isPermanent: member.isPermanent,
      isGift: member.isGift,
      expiresAt: member.expiresAt,
      skin: member.prefs.skin,
      customAccent: member.prefs.customAccent,
      homeOrder: member.prefs.homeOrder
    };
  }

  return <SubscribeClient current={current} />;
}
