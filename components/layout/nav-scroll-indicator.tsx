"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";

export type NavScrollSection = { id: string; label: string };

type NavScrollConfig = { sections: NavScrollSection[] } | null;

type Ctx = {
  config: NavScrollConfig;
  setConfig: (c: NavScrollConfig) => void;
};

const NavScrollContext = createContext<Ctx | null>(null);

export function NavScrollIndicatorProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<NavScrollConfig>(null);
  return (
    <NavScrollContext.Provider value={{ config, setConfig }}>
      {children}
    </NavScrollContext.Provider>
  );
}

function useNavScrollCtx() {
  const ctx = useContext(NavScrollContext);
  if (!ctx) {
    throw new Error("Nav scroll hooks must be used within <NavScrollIndicatorProvider>");
  }
  return ctx;
}

/**
 * A continuous-scroll page calls this to publish its in-page sections to the
 * navbar indicator. Each section's `id` must match an element rendered on the
 * page. The list is cleared automatically on unmount/navigation.
 */
export function useNavScrollSections(sections: NavScrollSection[]) {
  const { setConfig } = useNavScrollCtx();
  // Serialize so the effect only re-runs when the sections actually change
  // (the caller passes a fresh array literal on every render).
  const key = sections.map((s) => `${s.id}::${s.label}`).join("|");
  useEffect(() => {
    setConfig({ sections });
    return () => setConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setConfig]);
}

function readNavHeight() {
  if (typeof document === "undefined") return 64;
  const header = document.querySelector("header");
  return (header?.getBoundingClientRect().height ?? 64) + 8;
}

/**
 * The visual indicator that lives in the (otherwise empty on phones) center of
 * the navbar: a row of dots + the very short title of the section currently in
 * view. Dots are tappable to jump. Renders nothing when no page has registered
 * sections.
 */
export function NavScrollIndicator() {
  const { config } = useNavScrollCtx();
  const sections = config?.sections ?? null;
  const [activeId, setActiveId] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sections || sections.length === 0) {
      setActiveId(null);
      return;
    }

    const compute = () => {
      rafRef.current = null;
      const navH = readNavHeight();
      let current = sections[0].id;
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - navH <= 0) current = s.id;
      }
      setActiveId(current);
    };
    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [sections]);

  if (!sections || sections.length === 0) return null;

  const activeIndex = Math.max(
    0,
    sections.findIndex((s) => s.id === activeId)
  );
  const activeLabel = sections[activeIndex]?.label ?? "";

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="glass glass-refract glass-rim relative pointer-events-auto inline-flex max-w-[52vw] items-center gap-2.5 rounded-full px-3 py-1.5">
      <div className="flex shrink-0 items-center gap-2">
        {sections.map((s, i) => {
          const active = i === activeIndex;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => jump(s.id)}
              aria-label={s.label}
              aria-current={active ? "true" : undefined}
              className="inline-flex items-center justify-center p-0.5 outline-none"
            >
              {/* Animate transform (GPU) not width, so the surrounding glass
                  backdrop isn't re-rasterized every frame — keeps it smooth. */}
              <span
                aria-hidden
                className="block h-[6px] w-[6px] rounded-full transition-[transform,background-color] duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  transform: active ? "scale(1.5)" : "scale(0.85)",
                  background: active ? "rgb(var(--text))" : "rgb(var(--muted)/0.55)"
                }}
              />
            </button>
          );
        })}
      </div>
      <span
        key={activeLabel}
        className="truncate text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--text)/0.9)]"
        style={{ animation: "navIndicatorLabelIn 280ms cubic-bezier(0.22,1,0.36,1)" }}
      >
        {activeLabel}
      </span>
    </div>
  );
}
