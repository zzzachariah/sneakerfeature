"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DashboardSlides,
  type DashboardComment,
  type DashboardSavedCompare,
  type DashboardSubmission
} from "@/components/dashboard/dashboard-slides";

type CommentWithShoeRow = {
  id: string;
  content: string;
  created_at: string;
  shoe_id: string;
  shoes: { slug: string; shoe_name: string } | { slug: string; shoe_name: string }[] | null;
};

type VoteRow = {
  comment_id: string;
  vote_type: "like" | "dislike";
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [comments, setComments] = useState<DashboardComment[]>([]);
  const [likedComments, setLikedComments] = useState<DashboardComment[]>([]);
  const [dislikedComments, setDislikedComments] = useState<DashboardComment[]>([]);
  const [submissions, setSubmissions] = useState<DashboardSubmission[]>([]);
  const [savedCompares, setSavedCompares] = useState<DashboardSavedCompare[]>([]);
  const [deletingCompareId, setDeletingCompareId] = useState<string | null>(null);
  const [initialUsername, setInitialUsername] = useState<string>("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    const sb = supabase;

    async function load() {
      try {
        const { data } = await sb.auth.getSession();
        const session = data.session;
        if (!session?.user?.id) {
          setLoading(false);
          return;
        }

        setSignedIn(true);
        setUserId(session.user.id);
        setEmail(session.user.email ?? "");

        const [profileRes, commentsRes, submissionsRes, compareRes, votesRes] = await Promise.all([
          sb.from("profiles").select("username, role").eq("id", session.user.id).maybeSingle(),
          sb
            .from("comments")
            .select("id, content, created_at, shoe_id, shoes(slug, shoe_name)")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false })
            .limit(50),
          sb
            .from("user_submissions")
            .select("id, status, created_at")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false })
            .limit(20),
          sb
            .from("saved_comparisons")
            .select("id, title, shoe_ids, created_at")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false })
            .limit(20),
          sb.from("comment_votes").select("comment_id, vote_type").eq("user_id", session.user.id)
        ]);

        const loadedUsername = profileRes.data?.username ?? "";
        setUsername(loadedUsername);
        setInitialUsername(loadedUsername);
        setRole(profileRes.data?.role === "admin" ? "admin" : "user");

        const myComments = (commentsRes.data ?? []) as CommentWithShoeRow[];
        const myCommentIds = myComments.map((c) => c.id);

        const userVotes = (votesRes.data ?? []) as VoteRow[];
        const likedIds = userVotes.filter((v) => v.vote_type === "like").map((v) => v.comment_id);
        const dislikedIds = userVotes.filter((v) => v.vote_type === "dislike").map((v) => v.comment_id);
        const votedOnlyIds = Array.from(new Set([...likedIds, ...dislikedIds])).filter(
          (id) => !myCommentIds.includes(id)
        );
        const allCommentIds = Array.from(new Set([...myCommentIds, ...likedIds, ...dislikedIds]));

        const [votedCommentsRes, voteCountersRes] = await Promise.all([
          votedOnlyIds.length > 0
            ? sb
                .from("comments")
                .select("id, content, created_at, shoe_id, shoes(slug, shoe_name)")
                .in("id", votedOnlyIds)
            : Promise.resolve({ data: [] as CommentWithShoeRow[] }),
          allCommentIds.length > 0
            ? sb
                .from("comment_votes")
                .select("comment_id, vote_type")
                .in("comment_id", allCommentIds)
            : Promise.resolve({ data: [] as VoteRow[] })
        ]);

        const voteCounts = new Map<string, { likes: number; dislikes: number }>();
        for (const vote of (voteCountersRes.data ?? []) as VoteRow[]) {
          const current = voteCounts.get(vote.comment_id) ?? { likes: 0, dislikes: 0 };
          if (vote.vote_type === "like") current.likes += 1;
          if (vote.vote_type === "dislike") current.dislikes += 1;
          voteCounts.set(vote.comment_id, current);
        }

        const toDashboardComment = (row: CommentWithShoeRow): DashboardComment => {
          const totals = voteCounts.get(row.id) ?? { likes: 0, dislikes: 0 };
          const shoe = Array.isArray(row.shoes) ? row.shoes[0] : row.shoes;
          return {
            id: row.id,
            content: row.content,
            created_at: row.created_at,
            shoe_id: row.shoe_id,
            shoe_slug: shoe?.slug ?? "",
            shoe_name: shoe?.shoe_name ?? "Unknown shoe",
            likes: totals.likes,
            dislikes: totals.dislikes
          };
        };

        const normalizedMyComments = myComments.map(toDashboardComment);
        const lookup = new Map<string, DashboardComment>();
        for (const c of normalizedMyComments) lookup.set(c.id, c);
        for (const row of (votedCommentsRes.data ?? []) as CommentWithShoeRow[]) {
          if (!lookup.has(row.id)) lookup.set(row.id, toDashboardComment(row));
        }

        const orderByCreated = (a: DashboardComment, b: DashboardComment) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

        const likedComments = likedIds
          .map((id) => lookup.get(id))
          .filter((c): c is DashboardComment => Boolean(c))
          .sort(orderByCreated);
        const dislikedComments = dislikedIds
          .map((id) => lookup.get(id))
          .filter((c): c is DashboardComment => Boolean(c))
          .sort(orderByCreated);

        setComments(normalizedMyComments);
        setLikedComments(likedComments);
        setDislikedComments(dislikedComments);
        setSubmissions((submissionsRes.data ?? []) as DashboardSubmission[]);
        const rawCompares = (compareRes.data ?? []) as Array<{
          id: string;
          title: string;
          shoe_ids: unknown;
          created_at: string;
        }>;
        setSavedCompares(
          rawCompares.map((row) => ({
            id: row.id,
            title: row.title,
            created_at: row.created_at,
            shoe_ids: Array.isArray(row.shoe_ids)
              ? (row.shoe_ids as unknown[]).filter((v): v is string => typeof v === "string")
              : []
          }))
        );
        setLoading(false);
      } catch {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function saveUsername() {
    if (savingProfile) return;

    setProfileError(false);
    setProfileMessage("");

    const trimmed = username.trim();
    if (trimmed.length < 3) {
      setProfileError(true);
      return setProfileMessage("Username must be at least 3 characters.");
    }
    if (trimmed.length > 20) {
      setProfileError(true);
      return setProfileMessage("Username must be 20 characters or fewer.");
    }
    if (trimmed === initialUsername) {
      setProfileError(false);
      return setProfileMessage("Your username is unchanged.");
    }

    setSavingProfile(true);
    try {
      const response = await fetch("/api/auth/update-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed })
      });
      const data = await response.json().catch(() => ({ ok: false }));

      setProfileError(!data.ok);
      setProfileMessage(
        data.message ?? (data.ok ? "Username updated successfully." : "Failed to update username.")
      );

      if (data.ok) {
        const nextUsername = (data.username as string) ?? trimmed;
        setUsername(nextUsername);
        setInitialUsername(nextUsername);
        if (userId) {
          try {
            window.sessionStorage.setItem(
              `sneaker-role:${userId}`,
              JSON.stringify({ username: nextUsername, isAdmin: role === "admin" })
            );
          } catch {
            /* ignore cache write failures */
          }
        }
      }
    } catch {
      setProfileError(true);
      setProfileMessage("Network error. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function deleteSavedCompare(id: string) {
    if (deletingCompareId) return;
    setDeletingCompareId(id);
    try {
      const response = await fetch("/api/comparisons", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await response.json().catch(() => ({ ok: false }));
      if (response.ok && data.ok) {
        setSavedCompares((prev) => prev.filter((row) => row.id !== id));
      }
    } finally {
      setDeletingCompareId(null);
    }
  }

  async function changePassword() {
    if (changingPassword) return;

    setPasswordError(false);
    setPasswordMessage("");

    if (!currentPassword) {
      setPasswordError(true);
      return setPasswordMessage("Enter your current password.");
    }
    if (newPassword.length < 8) {
      setPasswordError(true);
      return setPasswordMessage("New password must be at least 8 characters.");
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(true);
      return setPasswordMessage("The two password entries do not match.");
    }
    if (newPassword === currentPassword) {
      setPasswordError(true);
      return setPasswordMessage("New password must be different from your current password.");
    }

    setChangingPassword(true);
    try {
      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      });
      const data = await response.json().catch(() => ({ ok: false }));

      setPasswordError(!data.ok);
      setPasswordMessage(
        data.message ?? (data.ok ? "Password updated successfully." : "Failed to update password.")
      );

      if (data.ok) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
      }
    } catch {
      setPasswordError(true);
      setPasswordMessage("Network error. Please try again.");
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <DashboardSlides
      loading={loading}
      signedIn={signedIn}
      username={username}
      email={email}
      role={role}
      comments={comments}
      likedComments={likedComments}
      dislikedComments={dislikedComments}
      submissions={submissions}
      savedCompares={savedCompares}
      deletingCompareId={deletingCompareId}
      onDeleteCompare={deleteSavedCompare}
      onUsernameChange={setUsername}
      onSaveUsername={saveUsername}
      savingProfile={savingProfile}
      profileMessage={profileMessage}
      profileError={profileError}
      currentPassword={currentPassword}
      newPassword={newPassword}
      confirmPassword={confirmPassword}
      showCurrentPassword={showCurrentPassword}
      showNewPassword={showNewPassword}
      showConfirmPassword={showConfirmPassword}
      onCurrentPasswordChange={setCurrentPassword}
      onNewPasswordChange={setNewPassword}
      onConfirmPasswordChange={setConfirmPassword}
      onToggleShowCurrentPassword={() => setShowCurrentPassword((v) => !v)}
      onToggleShowNewPassword={() => setShowNewPassword((v) => !v)}
      onToggleShowConfirmPassword={() => setShowConfirmPassword((v) => !v)}
      changingPassword={changingPassword}
      passwordMessage={passwordMessage}
      passwordError={passwordError}
      onChangePassword={changePassword}
    />
  );
}
