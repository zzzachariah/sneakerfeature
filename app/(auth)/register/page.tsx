import { redirect } from "next/navigation";

// The old register form (weaker validation, no AuthShell, no auto-login, and a
// full-screen reading wall) is consolidated into /signup. Keep the route as a
// redirect so existing links and bookmarks still resolve.
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  redirect(next ? `/signup?next=${encodeURIComponent(next)}` : "/signup");
}
