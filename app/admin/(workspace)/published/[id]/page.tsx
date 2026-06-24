/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Library } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

const shoeFields = [
  ["shoe_name", "Shoe name"],
  ["brand", "Brand"],
  ["slug", "Slug"],
  ["model_line", "Model line"],
  ["version_name", "Version"],
  ["category", "Category"],
  ["player", "Player"],
  ["weight", "Weight"]
] as const;

const specTextFields = [
  ["forefoot_midsole_tech", "Forefoot tech"],
  ["heel_midsole_tech", "Heel tech"],
  ["outsole_tech", "Outsole tech"],
  ["upper_tech", "Upper tech"],
  ["cushioning_feel", "Cushioning"],
  ["court_feel", "Court feel"],
  ["bounce", "Bounce"],
  ["stability", "Stability"],
  ["traction", "Traction"],
  ["fit", "Fit"],
  ["containment", "Containment"],
  ["support", "Support"],
  ["torsional_rigidity", "Torsional rigidity"]
] as const;

export default function AdminPublishedDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [note, setNote] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const [shoe, setShoe] = useState<any>({});
  const [spec, setSpec] = useState<any>({});
  const [story, setStory] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/shoes/${id}`, { cache: "no-store" });
    const json = await res.json();

    if (!res.ok || !json.ok) {
      setError(true);
      setMessage(json.message ?? "Could not load record.");
      setLoading(false);
      return;
    }

    setData(json);
    setShoe(json.shoe ?? {});
    setSpec(json.spec ?? {});
    setStory(json.story ?? {});
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: "update" | "publish" | "unpublish") {
    setMessage("");
    setError(false);

    const res = await fetch(`/api/admin/shoes/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note, shoe, spec, story })
    });

    const json = await res.json();
    setError(!res.ok || !json.ok);
    setMessage(json.message ?? (json.ok ? "Done." : "Action failed."));
    if (res.ok && json.ok) {
      setShowConfirm(false);
      await load();
    }
  }

  if (loading) return <Card className="p-5">Loading published record...</Card>;
  if (!data) return <Card className="p-5">Record unavailable.</Card>;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Live record editing workspace"
        description="Edit full published data across shoes, specs, and story tables."
        icon={Library}
      />

      <Card className="space-y-4 p-4">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Core shoe fields</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {shoeFields.map(([key, label]) => (
              <div key={key}>
                <label className="mb-1 block text-xs soft-text">{label}</label>
                <Input
                  value={shoe[key] ?? ""}
                  onChange={(e) =>
                    setShoe((p: any) => ({ ...p, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div>
              <label className="mb-1 block text-xs soft-text">Release year</label>
              <Input
                type="number"
                value={shoe.release_year ?? ""}
                onChange={(e) =>
                  setShoe((p: any) => ({
                    ...p,
                    release_year: Number(e.target.value) || null
                  }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs soft-text">Price</label>
              <Input
                type="number"
                value={shoe.price ?? ""}
                onChange={(e) =>
                  setShoe((p: any) => ({
                    ...p,
                    price: Number(e.target.value) || null
                  }))
                }
              />
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Technical/spec fields</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {specTextFields.map(([key, label]) => (
              <div key={key}>
                <label className="mb-1 block text-xs soft-text">{label}</label>
                <Input
                  value={spec[key] ?? ""}
                  onChange={(e) =>
                    setSpec((p: any) => ({ ...p, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-1">
            <div>
              <label className="mb-1 block text-xs soft-text">Playstyle summary</label>
              <Textarea
                rows={3}
                value={spec.playstyle_summary ?? ""}
                onChange={(e) =>
                  setSpec((p: any) => ({ ...p, playstyle_summary: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs soft-text">Story summary (spec)</label>
              <Textarea
                rows={3}
                value={spec.story_summary ?? ""}
                onChange={(e) =>
                  setSpec((p: any) => ({ ...p, story_summary: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs soft-text">Tags (comma separated)</label>
              <Input
                value={Array.isArray(spec.tags) ? spec.tags.join(", ") : ""}
                onChange={(e) =>
                  setSpec((p: any) => ({
                    ...p,
                    tags: e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean)
                  }))
                }
              />
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Story/background fields</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs soft-text">Story title</label>
              <Input
                value={story.title ?? ""}
                onChange={(e) =>
                  setStory((p: any) => ({ ...p, title: e.target.value }))
                }
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs soft-text">Story content</label>
              <Textarea
                rows={5}
                value={story.content ?? ""}
                onChange={(e) =>
                  setStory((p: any) => ({ ...p, content: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs soft-text">Story source label</label>
              <Input
                value={story.source_label ?? ""}
                onChange={(e) =>
                  setStory((p: any) => ({ ...p, source_label: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs soft-text">Story source URL</label>
              <Input
                value={story.source_url ?? ""}
                onChange={(e) =>
                  setStory((p: any) => ({ ...p, source_url: e.target.value }))
                }
              />
            </div>
          </div>
        </section>

        <div>
          <label className="mb-1 block text-xs soft-text">Audit note</label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for live record change"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => act("update")}>Update published record</Button>
          {data.shoe.is_published ? (
            <Button
              variant="ghost"
              className="border border-red-500/35 text-red-500 hover:bg-red-500/10"
              onClick={() => setShowConfirm(true)}
            >
              Unpublish
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => act("publish")}>
              Republish
            </Button>
          )}
        </div>

        {showConfirm && (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-sm">
            <p>Unpublish this live record? It will be hidden from public listing until republished.</p>
            <div className="mt-2 flex gap-2">
              <Button
                className="bg-red-500 hover:bg-red-500/80"
                onClick={() => act("unpublish")}
              >
                Confirm unpublish
              </Button>
              <Button variant="secondary" onClick={() => setShowConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {message && (
          <p className={`text-sm ${error ? "text-red-500" : "text-emerald-500"}`}>
            {message}
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold">Audit history</h3>
        <div className="mt-3 space-y-2">
          {(data.history ?? []).map((row: any) => (
            <div key={row.id} className="rounded-lg border border-[rgb(var(--muted)/0.35)] p-3">
              <div className="text-xs soft-text">
                <span className="num-display">{new Date(row.created_at).toLocaleString()}</span> • {row.action} • by{" "}
                {Array.isArray(row.profiles)
                  ? row.profiles[0]?.username
                  : row.profiles?.username ?? "unknown"}
              </div>
              {row.note && <p className="mt-1 text-sm">{row.note}</p>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
