"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

function useCountUp(target: number, duration: number, trigger: boolean) {
  const [value, setValue] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!trigger) {
      setDone(false);
      return;
    }
    let start: number | null = null;
    let frame: number;
    const step = (now: number) => {
      if (start === null) start = now;
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        setDone(true);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [trigger, target, duration]);
  return { value, done };
}

function BrowseButton({ label, href }: { label: string; href: Route }) {
  const [hover, setHover] = useState(false);

  return (
    <Link
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="shimmer-on-hover relative inline-flex h-11 w-full max-w-[220px] flex-shrink-0 items-center justify-center overflow-hidden border border-[rgb(var(--text))] bg-[rgb(var(--text))] text-[rgb(var(--bg))] transition-[border-radius,box-shadow,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] sm:w-[188px]"
      style={{
        borderRadius: hover ? 50 : 9,
        boxShadow: hover ? "0 8px 28px rgb(var(--shadow)/0.4)" : "none"
      }}
    >
      <span
        className="absolute inset-0 z-10 flex items-center justify-center whitespace-nowrap text-[0.875rem] font-bold tracking-[-0.01em] transition-opacity duration-[110ms]"
        style={{ opacity: hover ? 0 : 1 }}
      >
        {label} <ArrowRight className="ml-1.5 h-4 w-4" />
      </span>
      <span
        className="absolute inset-0 z-10 flex items-center justify-center text-[1.25rem] font-bold transition-opacity duration-[160ms]"
        style={{ opacity: hover ? 1 : 0, transitionDelay: hover ? "80ms" : "0ms" }}
      >
        →
      </span>
    </Link>
  );
}

export function HomeHero({
  shoesCount,
  brandsCount,
  active = true
}: {
  shoesCount: number;
  brandsCount: number;
  active?: boolean;
}) {
  const { translate } = useLocale();
  const [up, setUp] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setUp(false);
      return;
    }
    timerRef.current = window.setTimeout(() => setUp(true), 80);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active]);

  const shoes = useCountUp(shoesCount, 900, up);
  const brands = useCountUp(brandsCount, 700, up);

  const reveal = (delay: number): React.CSSProperties => ({
    opacity: up ? 1 : 0,
    transform: up ? "none" : "translateY(20px)",
    transition: "opacity 500ms cubic-bezier(0.22,1,0.36,1),transform 500ms cubic-bezier(0.22,1,0.36,1)",
    transitionDelay: `${delay}ms`
  });

  const headlineLines = [
    translate("A LIVING INDEX"),
    translate("OF EVERY PAIR"),
    translate("WORTH PLAYING IN.")
  ];

  return (
    <section className="relative flex h-full w-full flex-col justify-center overflow-hidden px-0 py-10 sm:py-12 md:py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute overflow-hidden"
        style={{ inset: "-32px" }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right,rgb(var(--text)/0.02) 1px,transparent 1px),linear-gradient(to bottom,rgb(var(--text)/0.02) 1px,transparent 1px)",
            backgroundSize: "48px 48px"
          }}
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-[40%]"
        style={{ background: "linear-gradient(to top,rgb(var(--bg)),transparent)" }}
      />
      <div className="relative z-10 w-full">
        <p className="t-eyebrow" style={{ fontSize: "0.85rem", marginBottom: 28, ...reveal(0) }}>
          {translate("The Decision Layer for Basketball Sneakers")}
        </p>

        <div style={{ marginBottom: 22 }}>
          {headlineLines.map((line, i) => (
            <div
              key={i}
              style={{
                display: "block",
                overflow: "hidden",
                paddingBottom: "0.08em"
              }}
            >
              <div
                className="t-display"
                style={{
                  color: "rgb(var(--text))",
                  display: "block",
                  transform: up ? "translate3d(0,0,0)" : "translate3d(0,110%,0)",
                  transition:
                    "transform 760ms cubic-bezier(0.22,1,0.36,1)",
                  transitionDelay: `${80 + i * 90}ms`,
                  willChange: "transform"
                }}
              >
                {line}
              </div>
            </div>
          ))}
        </div>

        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-[22px]"
          style={{ marginBottom: 40, ...reveal(320) }}
        >
          <Stat value={shoes.value.toString()} label={translate("shoes indexed")} done={shoes.done} />
          <Dot />
          <Stat value={brands.value.toString()} label={translate("brands represented")} done={brands.done} />
          <Dot />
          <Stat value={translate("Live")} label={translate("submission pipeline")} done={up} />
        </div>

        <p
          className="max-w-[460px] text-[0.95rem] leading-[1.55] tracking-[-0.01em] sm:text-[1rem]"
          style={{ color: "rgb(var(--subtext))", marginBottom: 44, ...reveal(380) }}
        >
          {translate(
            "Cushion, traction, court feel — structured and comparable. Because choosing a shoe shouldn't take 10 tabs."
          )}
        </p>

        <div className="flex flex-wrap gap-3" style={reveal(440)}>
          <BrowseButton label={translate("Go to compare")} href="/compare" />
          <Link
            href="/submit"
            className="inline-flex h-11 items-center justify-center rounded-[9px] border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-transparent px-5 text-[0.875rem] font-medium tracking-[-0.01em] text-[rgb(var(--subtext))] transition-[border-color,color,transform] duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[1px] hover:border-[rgb(var(--text)/0.4)] hover:text-[rgb(var(--text))]"
          >
            {translate("Submit a shoe")}
          </Link>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label, done }: { value: string; label: string; done: boolean }) {
  return (
    <span className="text-[0.95rem] text-[rgb(var(--subtext))]">
      <span
        className={`stat-underline font-bold tracking-[-0.02em] text-[rgb(var(--text))] tabular-nums ${
          done ? "is-complete" : ""
        }`}
      >
        {value}
      </span>{" "}
      {label}
    </span>
  );
}

function Dot() {
  return (
    <span aria-hidden className="select-none text-[1.05rem] leading-none text-[rgb(var(--muted)/0.9)]">
      ·
    </span>
  );
}
