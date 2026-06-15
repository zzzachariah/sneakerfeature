"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { AnimatedBackground } from "@/components/ui/animated-background";
import { SneakerLoader } from "@/components/ui/sneaker-loader";
import { useLocale } from "@/components/i18n/locale-provider";

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function AuthShell({
  eyebrow,
  heading,
  subheading,
  accentWord,
  children
}: {
  eyebrow: string;
  heading: string;
  subheading: string;
  accentWord?: string;
  children: ReactNode;
}) {
  const { translate } = useLocale();

  return (
    <main className="relative min-h-[calc(100dvh-var(--top-nav-h,64px)-var(--mobile-nav-h,0px))] overflow-x-clip has-mobile-nav-pad">
      <AnimatedBackground />

      <div className="container-shell relative z-10 grid grid-cols-1 items-center gap-10 py-8 md:py-16 lg:grid-cols-[1.05fr,0.95fr] lg:gap-16 lg:py-24">
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease }}
          className="hidden flex-col justify-center gap-8 lg:flex"
        >
          <p className="auth-eyebrow">{translate(eyebrow)}</p>
          <h1 className="t-display-sm max-w-[520px]">
            {accentWord ? (
              <>
                {translate(heading).split(accentWord).map((chunk, idx, arr) => (
                  <span key={idx}>
                    {chunk}
                    {idx < arr.length - 1 && (
                      <span className="brand-shimmer">{translate(accentWord)}</span>
                    )}
                  </span>
                ))}
              </>
            ) : (
              translate(heading)
            )}
          </h1>
          <p className="max-w-[440px] text-[15px] leading-relaxed soft-text">
            {translate(subheading)}
          </p>

          <div className="mt-4 flex items-center gap-5">
            <div className="glass glass-rim relative rounded-2xl p-5">
              <SneakerLoader label="sneakerfeature" />
            </div>
            <div className="space-y-1">
              <p className="auth-eyebrow">{translate("live")}</p>
              <p className="text-sm soft-text">{translate("Sneakers scored to your game. Sign in to get started.")}</p>
            </div>
          </div>
        </motion.section>

        <div className="relative">
          {children}
        </div>
      </div>
    </main>
  );
}
