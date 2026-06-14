// A template re-mounts on every navigation, so this wrapper replays its enter
// animation each time — giving a gentle screen-switch transition. Opacity only
// (no transform) so it never breaks sticky/fixed descendants on the page.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
