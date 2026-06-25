"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Shoe } from "@/lib/types";
import { useLocale } from "@/components/i18n/locale-provider";
import { CompareSlides } from "@/components/compare/compare-slides";
import { AddShoeDialog } from "@/components/compare/add-shoe-dialog";
import { CardPreviewModal } from "@/components/card/card-preview-modal";
import { CompareShoePicker } from "@/components/card/compare-shoe-picker";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { SignInValue } from "@/components/auth/sign-in-value";
import { useAuthState } from "@/components/auth/auth-state-provider";

const MAX_SHOES = 5;
const MAX_CARD_SHOES = 4;
const COMPARE_STORAGE_KEY = "sneaker:compare:ids";

type Props = {
  selected: Shoe[];
  allShoes: Shoe[];
};

function defaultSaveTitle(shoes: Shoe[]) {
  if (shoes.length === 0) return "";
  const names = shoes.map((s) => s.shoe_name).join(" vs ");
  return names.length > 70 ? `${names.slice(0, 67)}…` : names;
}

export function ComparePageClient({ selected, allShoes }: Props) {
  const { translate } = useLocale();
  const { signedIn, loaded: authLoaded } = useAuthState();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [localShoes, setLocalShoes] = useState<Shoe[]>(selected);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareShoes, setShareShoes] = useState<Shoe[] | null>(null);
  const hydratedFromStorageRef = useRef(false);

  useEffect(() => {
    setLocalShoes(selected);
  }, [selected]);

  const setCompareIds = useCallback(
    (nextShoes: Shoe[]) => {
      setLocalShoes(nextShoes);
      const params = new URLSearchParams(searchParams.toString());
      const ids = nextShoes.map((s) => s.id);
      if (ids.length) {
        params.set("ids", ids.join(","));
      } else {
        params.delete("ids");
      }
      const next = (params.toString() ? `${pathname}?${params.toString()}` : pathname) as Route;
      router.push(next, { scroll: false });
      router.refresh();

      if (typeof window !== "undefined") {
        if (ids.length) {
          window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(ids));
        } else {
          window.localStorage.removeItem(COMPARE_STORAGE_KEY);
        }
      }
    },
    [pathname, router, searchParams]
  );

  // Hydrate from localStorage on first mount when neither URL nor server selection is present.
  useEffect(() => {
    if (hydratedFromStorageRef.current) return;
    hydratedFromStorageRef.current = true;
    if (typeof window === "undefined") return;
    if (selected.length > 0) return;
    if (searchParams.get("ids")) return;

    try {
      const raw = window.localStorage.getItem(COMPARE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const lookup = new Map(allShoes.map((s) => [s.id, s]));
      const restored = parsed
        .filter((id): id is string => typeof id === "string")
        .map((id) => lookup.get(id))
        .filter((s): s is Shoe => Boolean(s))
        .slice(0, MAX_SHOES);
      if (restored.length === 0) return;
      setCompareIds(restored);
    } catch {
      // Ignore malformed localStorage payloads.
    }
  }, [allShoes, searchParams, selected.length, setCompareIds]);

  const selectedIds = useMemo(() => new Set(localShoes.map((s) => s.id)), [localShoes]);
  const remainingSlots = MAX_SHOES - localShoes.length;
  const canAdd = remainingSlots > 0;

  const onRemove = (id: string) => {
    setCompareIds(localShoes.filter((s) => s.id !== id));
  };

  const onConfirm = (ids: string[]) => {
    const lookup = new Map(allShoes.map((s) => [s.id, s]));
    const picked: Shoe[] = [];
    for (const id of ids) {
      const shoe = lookup.get(id);
      if (!shoe || selectedIds.has(shoe.id)) continue;
      picked.push(shoe);
      if (picked.length >= remainingSlots) break;
    }
    if (picked.length === 0) {
      setDialogOpen(false);
      return;
    }
    setCompareIds([...localShoes, ...picked]);
    setDialogOpen(false);
  };

  const onClearAll = () => setCompareIds([]);

  const canSave = localShoes.length >= 2;
  const canShare = localShoes.length >= 1;

  function onShareClick() {
    if (localShoes.length === 0) return;
    if (localShoes.length <= MAX_CARD_SHOES) {
      setShareShoes(localShoes);
      return;
    }
    setPickerOpen(true);
  }

  function onPickerConfirm(picked: Shoe[]) {
    setPickerOpen(false);
    setShareShoes(picked);
  }

  function openSaveModal() {
    setSaveTitle(defaultSaveTitle(localShoes));
    setSaveMessage("");
    setSaveError(false);
    setSaveOpen(true);
  }

  async function handleSave() {
    const trimmed = saveTitle.trim();
    if (!trimmed) {
      setSaveError(true);
      setSaveMessage("Please add a title.");
      return;
    }
    setSaveBusy(true);
    setSaveError(false);
    setSaveMessage("");
    try {
      const response = await fetch("/api/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, shoeIds: localShoes.map((s) => s.id) })
      });

      if (response.status === 401) {
        const ids = localShoes.map((s) => s.id).join(",");
        const next = ids ? `/compare?ids=${ids}` : "/compare";
        router.push(`/login?next=${encodeURIComponent(next)}` as Route);
        return;
      }

      const data = await response.json().catch(() => ({ ok: false, message: "Unexpected response." }));
      if (!response.ok || !data.ok) {
        setSaveError(true);
        setSaveMessage(data.message ?? "Failed to save.");
        return;
      }

      setSaveError(false);
      setSaveMessage("Saved to your dashboard.");
      setTimeout(() => {
        setSaveOpen(false);
        setSaveMessage("");
      }, 1600);
    } catch (error) {
      setSaveError(true);
      setSaveMessage(error instanceof Error ? error.message : "Failed to save.");
    } finally {
      setSaveBusy(false);
    }
  }

  function goLoginToSave() {
    const ids = localShoes.map((s) => s.id).join(",");
    const next = ids ? `/compare?ids=${ids}` : "/compare";
    router.push(`/login?next=${encodeURIComponent(next)}` as Route);
  }

  return (
    <main>
      {localShoes.length === 0 ? (
        <div className="container-shell pb-24">
          <section className="py-16 text-center md:py-20">
            <p className="t-eyebrow mb-3">{translate("Head to Head")}</p>
            <h1
              className="font-extrabold leading-[1] tracking-[-0.04em]"
              style={{ fontSize: "clamp(2.8rem, 5.5vw, 5rem)" }}
            >
              {translate("Compare")}
            </h1>
            <p className="mt-4 text-[0.88rem] tracking-[-0.005em] soft-text">
              {translate("Pick up to 5 shoes to compare.")}
            </p>
          </section>
          <EmptyState onOpenAdd={() => setDialogOpen(true)} translate={translate} />
        </div>
      ) : (
        <CompareSlides
          shoes={localShoes}
          canAdd={canAdd}
          canSave={canSave}
          canShare={canShare}
          onAdd={() => setDialogOpen(true)}
          onSave={openSaveModal}
          onShare={onShareClick}
          onRemove={onRemove}
          onClear={onClearAll}
        />
      )}

      <AddShoeDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        shoes={allShoes}
        selectedIds={selectedIds}
        remainingSlots={remainingSlots}
        onConfirm={onConfirm}
      />

      <CompareShoePicker
        open={pickerOpen}
        shoes={localShoes}
        max={MAX_CARD_SHOES}
        onCancel={() => setPickerOpen(false)}
        onConfirm={onPickerConfirm}
      />

      <CardPreviewModal
        open={shareShoes !== null}
        onClose={() => setShareShoes(null)}
        mode={shareShoes ? { kind: "compare", shoes: shareShoes } : null}
      />

      <Modal open={saveOpen} onClose={() => (saveBusy ? null : setSaveOpen(false))} title="Save this compare">
        {authLoaded && !signedIn ? (
          <div className="space-y-4">
            <p className="text-sm text-[rgb(var(--text)/0.82)]">
              {translate("Sign in to save this compare to your account.")}
            </p>
            <SignInValue />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setSaveOpen(false)}>
                {translate("Cancel")}
              </Button>
              <Button type="button" onClick={goLoginToSave}>
                {translate("Log in to save")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] soft-text">
                {translate("Title")}
              </label>
              <Input
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                maxLength={80}
                placeholder={translate("e.g. Guards 2024")}
                autoFocus
              />
            </div>
            <p className="text-xs soft-text">
              {translate("Saving")}: {localShoes.map((s) => s.shoe_name).join(", ")}
            </p>
            {saveMessage ? <FeedbackMessage message={saveMessage} isError={saveError} /> : null}
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setSaveOpen(false)} disabled={saveBusy}>
                {translate("Cancel")}
              </Button>
              <Button type="button" onClick={handleSave} disabled={saveBusy}>
                {saveBusy ? translate("Saving...") : saveError ? translate("Try again") : translate("Save")}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}

function EmptyState({ onOpenAdd, translate }: { onOpenAdd: () => void; translate: (value: string) => string }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-[rgb(var(--muted)/0.6)] bg-[rgb(var(--bg-elev)/0.36)] px-8 py-12 text-center">
      <p className="t-eyebrow mb-2">{translate("Nothing to compare yet")}</p>
      <h2 className="mb-3 text-2xl font-semibold tracking-[-0.02em]">
        {translate("Build your head-to-head")}
      </h2>
      <p className="mb-6 text-sm soft-text">
        {translate("Add up to five shoes and see their radar, diff, and full spec sheet side by side.")}
      </p>
      <Button onClick={onOpenAdd} className="gap-2">
        <Plus className="h-4 w-4" /> {translate("Add shoe")}
      </Button>
    </div>
  );
}
