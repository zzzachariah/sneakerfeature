import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";

const voteSchema = z.object({
  commentId: z.string().uuid("Invalid comment identifier."),
  voteType: z.enum(["like", "dislike"]),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { commentId, voteType } = parsed.data;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // no-op in route handler
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });

  const { data: existing, error: existingError } = await supabase
    .from("comment_votes")
    .select("id, vote_type")
    .eq("comment_id", commentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) return NextResponse.json({ ok: false, message: existingError.message }, { status: 400 });

  if (existing && existing.vote_type === voteType) {
    const { error: deleteError } = await supabase.from("comment_votes").delete().eq("id", existing.id);
    if (deleteError) return NextResponse.json({ ok: false, message: deleteError.message }, { status: 400 });
    return NextResponse.json({ ok: true, message: "Vote removed." });
  }

  if (existing) {
    const { error: updateError } = await supabase.from("comment_votes").update({ vote_type: voteType }).eq("id", existing.id);
    if (updateError) return NextResponse.json({ ok: false, message: updateError.message }, { status: 400 });
    return NextResponse.json({ ok: true, message: "Vote updated." });
  }

  const { error: insertError } = await supabase.from("comment_votes").insert({
    comment_id: commentId,
    user_id: user.id,
    vote_type: voteType
  });

  if (insertError) return NextResponse.json({ ok: false, message: insertError.message }, { status: 400 });

  return NextResponse.json({ ok: true, message: "Vote recorded." });
}
