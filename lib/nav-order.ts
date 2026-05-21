export const NAV_ORDER = ["/", "/compare", "/smart-picker", "/submit", "/dashboard", "/admin"] as const;

export function navIndex(pathname: string): number {
  const exact = (NAV_ORDER as readonly string[]).indexOf(pathname);
  if (exact !== -1) return exact;
  let best = -1;
  for (let i = 0; i < NAV_ORDER.length; i++) {
    const item = NAV_ORDER[i];
    if (item !== "/" && pathname.startsWith(item + "/")) best = i;
  }
  return best;
}
