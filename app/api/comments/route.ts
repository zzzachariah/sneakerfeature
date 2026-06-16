import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { commentSchema } from "@/lib/validation/schemas";
import { verifyHumanToken } from "@/lib/human-verify";

async function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // no-op in route handler
      }
    }
  });
}

export async function GET(request: Request) {
  const supabase = await getSupabase();
  if (!supabase) return NextResponse.json({ ok: true, comments: [] });

  const { searchParams } = new URL(request.url);
  const shoeId = searchParams.get("shoeId");
  if (!shoeId) {
    return NextResponse.json({ ok: false, message: "shoeId query param is required." }, { status: 400 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: comments, error } = await supabase
    .from("comments")
    .select("id, content, created_at, user_id, profiles(username)")
    .eq("shoe_id", shoeId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  type CommentRow = {
    id: string;
    content: string;
    created_at: string;
    user_id: string;
    profiles: { username: string }[] | { username: string } | null;
  };

  let typedComments = (comments ?? []) as CommentRow[];

  // Hide comments from users the requester has blocked (App Store Guideline 1.2).
  if (user?.id) {
    const { data: blocks } = await supabase
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id);
    const blocked = new Set((blocks ?? []).map((b) => b.blocked_id));
    if (blocked.size > 0) {
      typedComments = typedComments.filter((c) => !blocked.has(c.user_id));
    }
  }

  const commentIds = typedComments.map((c) => c.id);
  const votesByComment = new Map<string, { likes: number; dislikes: number }>();
  const myVotes = new Map<string, "like" | "dislike">();

  if (commentIds.length > 0) {
    const { data: votes, error: voteError } = await supabase
      .from("comment_votes")
      .select("comment_id, vote_type, user_id")
      .in("comment_id", commentIds);

    if (voteError) return NextResponse.json({ ok: false, message: voteError.message }, { status: 400 });

    for (const vote of votes ?? []) {
      const current = votesByComment.get(vote.comment_id) ?? { likes: 0, dislikes: 0 };
      if (vote.vote_type === "like") current.likes += 1;
      if (vote.vote_type === "dislike") current.dislikes += 1;
      votesByComment.set(vote.comment_id, current);

      if (user?.id && vote.user_id === user.id) {
        myVotes.set(vote.comment_id, vote.vote_type);
      }
    }
  }

  const normalized = typedComments.map((comment) => {
    const totals = votesByComment.get(comment.id) ?? { likes: 0, dislikes: 0 };
    return {
      id: comment.id,
      userId: comment.user_id,
      content: comment.content,
      createdAt: comment.created_at,
      username: (Array.isArray(comment.profiles) ? comment.profiles[0]?.username : comment.profiles?.username) ?? "unknown",
      likes: totals.likes,
      dislikes: totals.dislikes,
      myVote: myVotes.get(comment.id) ?? null
    };
  });

  return NextResponse.json({ ok: true, comments: normalized });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });

  const verified = verifyHumanToken(parsed.data.verificationToken, "comment");
  if (!verified.success) return NextResponse.json({ ok: false, message: verified.message }, { status: 400 });

  const supabase = await getSupabase();
  if (!supabase) return NextResponse.json({ ok: true, message: "Demo mode: comment accepted." });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, message: "Authentication required for comments." }, { status: 401 });

  const { data: shoe } = await supabase.from("shoes").select("id").eq("id", parsed.data.shoeId).maybeSingle();
  if (!shoe) return NextResponse.json({ ok: false, message: "Shoe record not found for comment submission." }, { status: 404 });

  const { error } = await supabase.from("comments").insert({
    shoe_id: parsed.data.shoeId,
    content: parsed.data.content,
    user_id: user.id
  });

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, message: "Comment posted." });
}

export async function DELETE(request: Request) {
  const supabase = await getSupabase();
  if (!supabase) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });

  const body = await request.json();
  const commentId = body?.commentId;

  if (!commentId || typeof commentId !== "string") {
    return NextResponse.json({ ok: false, message: "commentId is required." }, { status: 400 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });

  const { error } = await supabase.from("comments").delete().eq("id", commentId).eq("user_id", user.id);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, message: "Comment deleted." });
}
