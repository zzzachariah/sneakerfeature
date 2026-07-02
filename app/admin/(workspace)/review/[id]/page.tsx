/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { haptics } from "@/lib/native/haptics";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

type SubmissionDetails = {
  submission: any;
  normalized: any;
  draft: any;
  history: Array<{
    id: string;
    action: string;
    note: string | null;
    created_at: string;
    profiles: { username: string } | { username: string }[] | null;
  }>;
};

const fieldDefs: Array<{
  key: string;
  label: string;
  type?: "text" | "number" | "textarea";
}> = [
  { key: "shoe_name", label: "Shoe name" },
  { key: "brand", label: "Brand" },
  { key: "model_line", label: "Model line" },
  { key: "version_name", label: "Version" },
  { key: "release_year", label: "Release year", type: "number" },
  { key: "category", label: "Category / position" },
  { key: "player", label: "Player" },
  { key: "forefoot_midsole_tech", label: "Forefoot midsole tech" },
  { key: "heel_midsole_tech", label: "Heel midsole tech" },
  { key: "outsole_tech", label: "Outsole tech" },
  { key: "upper_tech", label: "Upper tech" },
  { key: "cushioning_feel", label: "Cushioning feel" },
  { key: "court_feel", label: "Court feel" },
  { key: "bounce", label: "Bounce" },
  { key: "stability", label: "Stability" },
  { key: "traction", label: "Traction" },
  { key: "fit", label: "Fit" },
  { key: "playstyle_summary", label: "Playstyle summary", type: "textarea" },
  { key: "story_title", label: "Story title" },
  { key: "story_summary", label: "Story/background notes", type: "textarea" },
  { key: "raw_text", label: "Raw notes / free text", type: "textarea" },
  { key: "reviewer_notes", label: "Reviewer notes", type: "textarea" }
];

/** The 3-pane comparison only fits side-by-side at xl. Below that the page
 * shows one pane at a time, switched by a sticky segmented control. */
const PANES = [
  { key: "original", label: "Original" },
  { key: "normalized", label: "Normalized" },
  { key: "edit", label: "Edit" }
] as const;

type PaneKey = (typeof PANES)[number]["key"];

function pick(obj: Record<string, any>, key: string) {
  if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  if (obj.raw_payload && obj.raw_payload[key] !== undefined && obj.raw_payload[key] !== null) {
    return obj.raw_payload[key];
  }
  return "";
}

export default function AdminSubmissionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubmissionDetails | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState<null | "save_draft" | "approve_publish" | "reject">(null);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const [note, setNote] = useState("");
  // Editing is the primary mobile job, so it's the default pane.
  const [pane, setPane] = useState<PaneKey>("edit");
  const [form, setForm] = useState<Record<string, any>>({
    tags: [],
    source_links: []
  });

  const load = useCallback(async () => {
    setLoading(true);

    const res = await fetch(`/api/admin/submissions/${id}`, { cache: "no-store" });
    const json = await res.json();

    if (!res.ok || !json.ok) {
      setError(true);
      setMessage(json.message ?? "Failed to load submission workspace.");
      setLoading(false);
      return;
    }

    const submission = json.submission;
    const normalizedPayload = json.normalized?.normalized_payload ?? {};
    const draftPayload = json.draft?.final_payload ?? {};

    const initial: Record<string, any> = {};
    fieldDefs.forEach((field) => {
      initial[field.key] =
        draftPayload[field.key] ??
        normalizedPayload[field.key] ??
        pick(submission, field.key) ??
        "";
    });

    initial.tags =
      draftPayload.tags ??
      normalizedPayload.tags ??
      submission.raw_payload?.tags?.split?.(",") ??
      [];

    initial.source_links =
      draftPayload.source_links ??
      normalizedPayload.source_links ??
      submission.source_links ??
      [];

    setForm(initial);
    setData(json);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const normalizedPayload = useMemo(() => data?.normalized?.normalized_payload ?? {}, [data]);
  const rawPayload = useMemo(() => data?.submission?.raw_payload ?? {}, [data]);
  const submissionType = data?.submission?.submission_type ?? "new_shoe";
  const targetShoe = data?.submission?.target_shoe ?? null;

  const targetSnapshot = useMemo<Record<string, unknown> | null>(() => {
    if (!targetShoe) return null;
    const spec = targetShoe.shoe_specs?.[0] ?? {};
    return {
      shoe_name: targetShoe.shoe_name ?? "",
      brand: targetShoe.brand ?? "",
      model_line: targetShoe.model_line ?? "",
      version_name: targetShoe.version_name ?? "",
      release_year: targetShoe.release_year ?? "",
      category: targetShoe.category ?? "",
      player: targetShoe.player ?? "",
      forefoot_midsole_tech: spec.forefoot_midsole_tech ?? "",
      heel_midsole_tech: spec.heel_midsole_tech ?? "",
      outsole_tech: spec.outsole_tech ?? "",
      upper_tech: spec.upper_tech ?? "",
      cushioning_feel: spec.cushioning_feel ?? "",
      court_feel: spec.court_feel ?? "",
      bounce: spec.bounce ?? "",
      stability: spec.stability ?? "",
      traction: spec.traction ?? "",
      fit: spec.fit ?? "",
      playstyle_summary: spec.playstyle_summary ?? "",
      story_title: targetShoe.shoe_stories?.[0]?.title ?? "",
      story_summary: targetShoe.shoe_stories?.[0]?.content ?? spec.story_summary ?? ""
    };
  }, [targetShoe]);

  async function submitAction(action: "save_draft" | "approve_publish" | "reject") {
    setSaving(action);
    setError(false);
    setMessage("");

    const finalPayload = {
      ...form,
      tags: Array.isArray(form.tags)
        ? form.tags
        : String(form.tags ?? "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
      source_links: Array.isArray(form.source_links)
        ? form.source_links
        : String(form.source_links ?? "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
    };

    const res = await fetch(`/api/admin/submissions/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note, finalPayload })
    });

    const json = await res.json();
    setError(!res.ok || !json.ok);
    setMessage(json.message ?? (json.ok ? "Saved." : "Action failed."));
    setSaving(null);

    if (res.ok && json.ok) {
      if (action === "reject") {
        setConfirmRejectOpen(false);
        if (pathname !== "/admin/review") {
          router.push("/admin/review?status=queue");
          router.refresh();
        }
        return;
      }
      await load();
    }
  }

  if (loading) return <Card className="p-4 sm:p-5">Loading review workspace...</Card>;
  if (!data) return <Card className="p-4 sm:p-5">Submission unavailable.</Card>;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Submission review workspace"
        description="Compare the original submission with the OpenAI normalized output, then edit and publish the final payload."
        icon={ClipboardCheck}
      />
      <div className="surface-card premium-border space-y-1 rounded-2xl p-4 text-xs soft-text">
        <div>
          Submitted by{" "}
          {Array.isArray(data.submission.profiles)
            ? data.submission.profiles[0]?.username
            : data.submission.profiles?.username ?? "unknown"}{" "}
          • {new Date(data.submission.created_at).toLocaleString()} • status:{" "}
          {data.submission.status}
        </div>
        <div>
          Type: {submissionType === "correction" ? "Correction submission" : "New shoe submission"}
          {submissionType === "correction" && (
            <>
              {" "}
              • Target: {targetShoe?.brand} {targetShoe?.shoe_name} ({targetShoe?.id}) • Approval
              updates the existing published record.
            </>
          )}
        </div>
      </div>

      {submissionType === "correction" && targetSnapshot && (
        <Card className="p-4">
          <h3 className="font-semibold">Current published record vs proposed correction</h3>
          <p className="mt-1 text-sm soft-text">Highlighted rows are fields where the proposed correction differs from the current published values.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {fieldDefs.map((field) => {
              const currentValue = String(targetSnapshot[field.key] ?? "—");
              const proposedValue = String(form[field.key] ?? "—");
              const changed = currentValue !== proposedValue;
              return (
                <div key={field.key} className={`rounded-lg border p-2 ${changed ? "border-[rgb(var(--accent)/0.4)] bg-[rgb(var(--accent)/0.08)]" : "border-[rgb(var(--muted)/0.35)]"}`}>
                  <p className="text-xs soft-text">{field.label}</p>
                  <p className="text-xs soft-text">Current: {currentValue || "—"}</p>
                  <p>Proposed: {proposedValue || "—"}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Pane switcher (hidden at xl where all three panes are visible).
          Sticky offsets track the AdminMobileShell bar: 68px tall below md
          (44px hamburger + py-3), 64px at md–lg, gone at lg+ where only the
          workspace's 1.5rem top padding remains. */}
      <div className="sticky z-20 [top:calc(var(--safe-top,0px)+68px)] md:[top:calc(var(--safe-top,0px)+64px)] lg:[top:1.5rem] xl:hidden">
        <div className="glass-strong premium-border grid grid-cols-3 gap-1 rounded-2xl p-1">
          {PANES.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={pane === p.key}
              onClick={() => {
                haptics.selection();
                setPane(p.key);
              }}
              className={
                pane === p.key
                  ? "min-h-[44px] rounded-xl border border-[rgb(var(--accent)/0.45)] bg-[rgb(var(--accent)/0.12)] text-sm font-medium text-[rgb(var(--accent))]"
                  : "min-h-[44px] rounded-xl border border-transparent text-sm soft-text transition active:bg-[rgb(var(--muted)/0.3)]"
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className={`p-4 ${pane === "original" ? "" : "hidden xl:block"}`}>
          <h3 className="font-semibold">Original user submission</h3>
          <div className="mt-3 space-y-2 text-sm">
            {fieldDefs.map((field) => (
              <div key={field.key} className="rounded-lg border border-[rgb(var(--muted)/0.35)] p-2">
                <p className="text-xs soft-text">{field.label}</p>
                <p>{String(rawPayload[field.key] ?? data.submission[field.key] ?? "—")}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className={`p-4 ${pane === "normalized" ? "" : "hidden xl:block"}`}>
          <h3 className="font-semibold">OpenAI normalized output</h3>
          <div className="mt-3 space-y-2 text-sm">
            {fieldDefs.map((field) => {
              const normalizedValue = normalizedPayload[field.key] ?? "";
              const rawValue = rawPayload[field.key] ?? data.submission[field.key] ?? "";
              const changed = String(normalizedValue ?? "") !== String(rawValue ?? "");

              return (
                <div
                  key={field.key}
                  className={`rounded-lg border p-2 ${
                    changed
                      ? "border-[rgb(var(--accent)/0.4)] bg-[rgb(var(--accent)/0.08)]"
                      : "border-[rgb(var(--muted)/0.35)]"
                  }`}
                >
                  <p className="text-xs soft-text">{field.label}</p>
                  <p>{String(normalizedValue || "—")}</p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className={`p-4 ${pane === "edit" ? "" : "hidden xl:block"}`}>
          <h3 className="font-semibold">Admin final editable version</h3>
          <div className="mt-3 space-y-2 text-sm">
            {fieldDefs.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-xs soft-text">{field.label}</label>
                {field.type === "textarea" ? (
                  <Textarea
                    value={String(form[field.key] ?? "")}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="min-h-20"
                  />
                ) : (
                  <Input
                    type={field.type === "number" ? "number" : "text"}
                    value={String(form[field.key] ?? "")}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}

            <div>
              <label className="mb-1 block text-xs soft-text">Tags (comma separated)</label>
              <Input
                value={Array.isArray(form.tags) ? form.tags.join(", ") : String(form.tags ?? "")}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    tags: e.target.value
                  }))
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-xs soft-text">Source links (comma separated)</label>
              <Input
                value={
                  Array.isArray(form.source_links)
                    ? form.source_links.join(", ")
                    : String(form.source_links ?? "")
                }
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    source_links: e.target.value
                  }))
                }
              />
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold">Publishing controls</h3>
        <p className="text-sm soft-text">Save draft for later, delete the submission via reject, or approve and publish the admin-corrected final version.</p>
        <div className="mt-3">
          <label className="mb-1 block text-xs soft-text">Audit note (recommended)</label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain what changed and why"
          />
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button disabled={saving !== null} onClick={() => submitAction("save_draft")}>{saving === "save_draft" ? "Saving..." : "Save draft"}</Button>
          <Button disabled={saving !== null} variant="secondary" onClick={() => submitAction("approve_publish")}>{saving === "approve_publish" ? "Publishing..." : "Approve & publish"}</Button>
          <Button disabled={saving !== null} variant="ghost" className="border border-red-500/35 text-red-500 hover:bg-red-500/10" onClick={() => setConfirmRejectOpen(true)}>{saving === "reject" ? "Deleting..." : "Reject"}</Button>
        </div>
        {message && (
          <p className={`mt-2 text-sm ${error ? "text-red-500" : "text-emerald-500"}`}>
            {message}
          </p>
        )}
      </Card>
      <Modal
        open={confirmRejectOpen}
        onClose={() => {
          if (saving !== "reject") setConfirmRejectOpen(false);
        }}
        title="Delete this submission?"
      >
        <p className="text-sm soft-text">
          Reject will permanently delete this submission and remove it from the pending review queue.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" disabled={saving === "reject"} onClick={() => setConfirmRejectOpen(false)}>
            Cancel
          </Button>
          <Button className="border border-red-500/35 bg-red-500/10 text-red-500 hover:bg-red-500/20" disabled={saving === "reject"} onClick={() => submitAction("reject")}>
            {saving === "reject" ? "Deleting..." : "Confirm delete"}
          </Button>
        </div>
      </Modal>

      <Card className="p-4">
        <h3 className="font-semibold">Audit history</h3>
        <div className="mt-3 space-y-2">
          {data.history.map((event) => (
            <div key={event.id} className="rounded-lg border border-[rgb(var(--muted)/0.35)] p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs soft-text">
                <span>{new Date(event.created_at).toLocaleString()}</span>
                <span>•</span>
                <span>{event.action}</span>
                <span>•</span>
                <span>
                  by{" "}
                  {Array.isArray(event.profiles)
                    ? event.profiles[0]?.username
                    : event.profiles?.username ?? "unknown"}
                </span>
              </div>
              {event.note && <p className="mt-1 text-sm">{event.note}</p>}
            </div>
          ))}
          {data.history.length === 0 && (
            <p className="text-sm soft-text">No moderation events yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
