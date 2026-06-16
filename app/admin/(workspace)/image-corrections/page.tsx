import { requireAdminPageContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ImageCorrectionsClient, type CorrectionRow } from "./image-corrections-client";

export const dynamic = "force-dynamic";

export default async function ImageCorrectionsPage() {
  await requireAdminPageContext();
  const db = createAdminClient();

  let corrections: CorrectionRow[] = [];

  if (db) {
    const { data: rawCorrections } = await db
      .from("image_corrections")
      .select("id, shoe_id, user_id, public_url, note, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const list = rawCorrections ?? [];
    const shoeIds = [...new Set(list.map((r) => r.shoe_id))];
    const userIds = [...new Set(list.map((r) => r.user_id))];

    const shoeById = new Map<string, { shoe_name: string; brand: string; slug: string }>();
    const usernameById = new Map<string, string>();
    const currentImageByShoe = new Map<string, string>();

    if (shoeIds.length) {
      const { data: shoes } = await db
        .from("shoes")
        .select("id, shoe_name, brand, slug")
        .in("id", shoeIds);
      for (const s of shoes ?? []) {
        shoeById.set(s.id, { shoe_name: s.shoe_name, brand: s.brand, slug: s.slug });
      }

      // Current live image per shoe (most recent approved), for a before/after view.
      const { data: images } = await db
        .from("shoe_images")
        .select("shoe_id, public_url, approved_at, created_at")
        .in("shoe_id", shoeIds)
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      for (const img of images ?? []) {
        if (!currentImageByShoe.has(img.shoe_id)) currentImageByShoe.set(img.shoe_id, img.public_url);
      }
    }

    if (userIds.length) {
      const { data: profiles } = await db.from("profiles").select("id, username").in("id", userIds);
      for (const p of profiles ?? []) usernameById.set(p.id, p.username);
    }

    corrections = list.map((r) => {
      const shoe = shoeById.get(r.shoe_id);
      return {
        id: r.id,
        shoeId: r.shoe_id,
        shoeName: shoe ? `${shoe.brand} ${shoe.shoe_name}` : "Unknown shoe",
        shoeSlug: shoe?.slug ?? null,
        submittedImageUrl: r.public_url,
        currentImageUrl: currentImageByShoe.get(r.shoe_id) ?? null,
        note: r.note ?? "",
        submitterUsername: usernameById.get(r.user_id) ?? "unknown",
        createdAt: r.created_at
      };
    });
  }

  return <ImageCorrectionsClient initialCorrections={corrections} />;
}
