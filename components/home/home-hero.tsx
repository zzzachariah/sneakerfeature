"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
import { PersonaAvatar } from "@/components/home/persona-avatar";

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
  const { persona, isLoggedIn, openModal } = usePersona();
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

  function handleAvatarClick() {
    if (!isLoggedIn) {
      window.location.href = "/login";
      return;
    }
    openModal();
  }

  return (
    <section
      className="relative flex h-full w-full flex-col justify-center overflow-hidden px-0 py-10 sm:py-12 md:py-16"
      data-tutorial="hero"
    >
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
      <div className="relative z-10 grid w-full grid-cols-1 items-center gap-6 md:grid-cols-[1fr_minmax(300px,360px)] md:gap-10">
        <div className="order-2 md:order-1">
          <p
            className="t-eyebrow"
            style={{ fontSize: "clamp(0.72rem, 1vw, 0.88rem)", marginBottom: 18, ...reveal(0) }}
          >
            {translate("The Decision Layer for Basketball Sneakers")}
          </p>

          <div style={{ marginBottom: 18 }}>
            <div
              style={{
                display: "block",
                overflow: "hidden",
                paddingBottom: "0.08em"
              }}
            >
              <h1
                className="t-display-sm"
                style={{
                  color: "rgb(var(--text))",
                  display: "block",
                  fontSize: "clamp(1.75rem, 3.6vw, 2.85rem)",
                  lineHeight: 1.05,
                  letterSpacing: "-0.02em",
                  transform: up ? "translate3d(0,0,0)" : "translate3d(0,110%,0)",
                  transition: "transform 760ms cubic-bezier(0.22,1,0.36,1)",
                  transitionDelay: "80ms",
                  willChange: "transform"
                }}
              >
                {translate("Sneaker Database")}
              </h1>
            </div>
          </div>

          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:gap-x-4"
            style={{ marginBottom: 24, ...reveal(220) }}
          >
            <Stat value={shoes.value.toString()} label={translate("shoes indexed")} done={shoes.done} />
            <Dot />
            <Stat value={brands.value.toString()} label={translate("brands represented")} done={brands.done} />
            <Dot />
            <Stat value={translate("Live")} label={translate("submission pipeline")} done={up} />
          </div>

          <p
            className="max-w-[460px] leading-[1.5] tracking-[-0.01em]"
            style={{ color: "rgb(var(--subtext))", fontSize: "clamp(0.85rem, 1.2vw, 1.05rem)", ...reveal(320) }}
          >
            {translate(
              "Cushion, traction, court feel — structured and comparable. Because choosing a shoe shouldn't take 10 tabs."
            )}
          </p>

          {!persona && (
            <p
              className="mt-3 soft-text"
              style={{ fontSize: "clamp(0.78rem, 1.05vw, 0.95rem)", ...reveal(380) }}
            >
              {isLoggedIn
                ? translate("Tap the avatar to set up your player profile.")
                : translate("Log in to personalize your feed.")}
            </p>
          )}
        </div>

        <div
          className="order-1 flex justify-center md:order-2 md:justify-end"
          style={reveal(180)}
          data-tutorial="hero-avatar"
        >
          <PersonaAvatar
            persona={persona}
            dimmed={!isLoggedIn || !persona}
            onClick={handleAvatarClick}
            size="md"
            loggedIn={isLoggedIn}
          />
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label, done }: { value: string; label: string; done: boolean }) {
  return (
    <span
      className="text-[rgb(var(--subtext))]"
      style={{ fontSize: "clamp(0.85rem, 1.15vw, 1.05rem)" }}
    >
      <span
        className={`num-display stat-underline font-bold tracking-[-0.02em] text-[rgb(var(--text))] ${
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
    <span aria-hidden className="select-none text-[1rem] leading-none text-[rgb(var(--muted)/0.9)]">
      ·
    </span>
  );
}
