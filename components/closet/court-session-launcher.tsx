"use client";

// The 开场 entry on /closet — deliberately the loudest thing on the page.
//
// This is the button that lights up the Dynamic Island, so it can't be a menu
// item three taps deep: it sits above the rotation as a full-width Liquid Glass
// slab with the pair you last hooped in already loaded, so the common case
// ("same shoes, another run") is exactly one tap. Changing the pair is a chip
// on the same slab, not a separate flow.
//
// While a run is going this collapses to a quiet "计时中" line — the live
// controls live in the global CourtSessionBar, which is on screen everywhere,
// so having both would be two competing clocks on the same page.

import { useMemo, useState } from "react";
import { ChevronDown, Play, Timer } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { useLocale } from "@/components/i18n/locale-provider";
import { haptics } from "@/lib/native/haptics";
import { useCourtSession } from "@/components/closet/court-session-provider";
import type { ClosetEntry } from "@/components/closet/closet-view";

export function CourtSessionLauncher({ entries }: { entries: ClosetEntry[] }) {
  const { translate } = useLocale();
  const { session, start } = useCourtSession();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);

  const active = useMemo(() => entries.filter((e) => !e.item.retired), [entries]);

  // Default to the pair with the most court time — the one in the bag. Falls
  // back to the first registered pair for a closet nobody has logged yet.
  const target = useMemo(() => {
    if (active.length === 0) return null;
    if (chosenId) {
      const picked = active.find((e) => e.item.shoe_id === chosenId);
      if (picked) return picked;
    }
    return [...active].sort((a, b) => Number(b.item.play_hours) - Number(a.item.play_hours))[0];
  }, [active, chosenId]);

  if (active.length === 0) return null;

  if (session) {
    return (
      <div className="glass glass-rim glass-clip relative mb-6 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm">
        <Timer className="h-4 w-4 shrink-0 text-[rgb(var(--accent))]" aria-hidden />
        <span className="soft-text">
          {translate("A run is in progress")}
          {session.shoeName ? ` · ${session.shoeName}` : ""}
        </span>
      </div>
    );
  }

  if (!target) return null;

  const shoe = target.shoe;

  return (
    <>
      <section className="glass-strong glass-rim glass-clip relative mb-6 overflow-hidden rounded-3xl p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 sm:h-20 sm:w-20">
            <ShoeImage
              src={shoe.image_url ?? undefined}
              alt={`${shoe.brand} ${shoe.shoe_name}`}
              fallbackLabel={shoe.shoe_name}
              variant="closet"
              stage={false}
              className="h-full w-full"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="t-eyebrow mb-1">{translate("Court timer")}</p>
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                setPickerOpen(true);
              }}
              className="tap-44 -ml-1 flex max-w-full items-center gap-1 rounded-lg px-1 py-0.5 text-left transition hover:bg-[rgb(var(--text)/0.06)]"
              aria-label={translate("Change the pair")}
            >
              <span className="truncate text-[0.95rem] font-semibold">{shoe.shoe_name}</span>
              {active.length > 1 ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 soft-text" aria-hidden />
              ) : null}
            </button>
            <p className="mt-0.5 text-xs soft-text">
              <span className="num-display">{Math.round(Number(target.item.play_hours) * 10) / 10}h</span>
              {" · "}
              <span className="num-display">{target.item.sessions}</span> {translate("runs")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void start({
                shoeId: target.item.shoe_id,
                shoeName: shoe.shoe_name,
                shoeBrand: shoe.brand,
                imageUrl: shoe.image_url ?? null,
                totalHours: Number(target.item.play_hours) || 0,
                totalSessions: target.item.sessions
              });
            }}
            className="glass-interactive tap-44 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[rgb(var(--text))] px-4 py-2.5 text-[0.85rem] font-semibold text-[rgb(var(--bg))] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.35)] sm:px-5"
          >
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
            {translate("Start")}
          </button>
        </div>

        <p className="mt-3 text-[0.72rem] leading-relaxed soft-text">
          {translate("Runs in the Dynamic Island and on your Lock Screen — the hours land in your closet when you stop.")}
        </p>
      </section>

      <BottomSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={translate("Which pair?")}
      >
        <ul className="flex max-h-[55svh] flex-col gap-1.5 overflow-y-auto pb-2">
          {active.map((entry) => (
            <li key={entry.item.shoe_id}>
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setChosenId(entry.item.shoe_id);
                  setPickerOpen(false);
                }}
                className={`tap-44 flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                  entry.item.shoe_id === target.item.shoe_id
                    ? "border-[rgb(var(--brand)/0.6)] bg-[rgb(var(--brand)/0.1)]"
                    : "border-[rgb(var(--muted)/0.5)] hover:border-[rgb(var(--text)/0.35)]"
                }`}
              >
                <div className="h-11 w-11 shrink-0">
                  <ShoeImage
                    src={entry.shoe.image_url ?? undefined}
                    alt={entry.shoe.shoe_name}
                    fallbackLabel={entry.shoe.shoe_name}
                    variant="thumbnail"
                    stage={false}
                    className="h-full w-full"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{entry.shoe.shoe_name}</p>
                  <p className="text-xs soft-text">
                    <span className="num-display">
                      {Math.round(Number(entry.item.play_hours) * 10) / 10}h
                    </span>
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}
