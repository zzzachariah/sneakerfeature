import { cache } from "react";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type CurrentProfile = {
  id: string;
  username: string | null;
  role: "user" | "admin";
  rating_focus: unknown;
};

export const hasAuthCookie = cache(async function hasAuthCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
});

export const getCurrentUser = cache(async function getCurrentUser(): Promise<User | null> {
  if (!(await hasAuthCookie())) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user;
});

export const getCurrentProfile = cache(async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("profiles")
    .select("username, role, rating_focus")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) return { id: user.id, username: null, role: "user", rating_focus: null };
  return {
    id: user.id,
    username: data.username ?? null,
    role: data.role === "admin" ? "admin" : "user",
    rating_focus: data.rating_focus
  };
});
