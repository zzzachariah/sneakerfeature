// Supabase SSR may split a large session across .0, .1, ... cookies.
export function isAuthCookieName(name: string): boolean {
  return /^sb-.+-auth-token(?:\.\d+)?$/.test(name);
}
