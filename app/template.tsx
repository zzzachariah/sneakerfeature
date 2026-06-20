import { PageTransition } from "@/components/motion/page-transition";

// A template re-mounts on every navigation, so <PageTransition> replays its enter
// animation each time — an iOS-style directional slide on phones / the app, a
// restrained fade on desktop. The slide is driven by a CSS animation (not an inline
// transform) so it leaves no residual transform at rest, keeping sticky/fixed
// descendants intact.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
