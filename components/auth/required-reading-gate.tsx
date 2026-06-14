"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/locale-provider";

export function RequiredReadingGate({ onContinue }: { onContinue: () => void }) {
  const { translate } = useLocale();
  const [completed, setCompleted] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-[rgb(var(--glass-overlay)/0.72)] backdrop-blur-sm" />
      <div className="absolute inset-0 overflow-y-auto">
        <div className="flex min-h-full items-start justify-center p-4 pb-8 pt-24 md:pt-28">
          <div className="glass-strong glass-rim relative w-full max-w-2xl rounded-3xl p-5 md:p-6">
            <div className="border-b border-[rgb(var(--muted)/0.35)] pb-4">
              <h2 className="text-2xl font-semibold tracking-[0.015em] md:text-3xl">{translate("Welcome!")}</h2>
              <p className="mt-1 text-sm soft-text">{translate("Story behind sneakerfeature")}</p>
              <p className="mt-2 text-xs soft-text">By zzz</p>
            </div>

            <div className="mt-4 max-h-[46vh] space-y-3 overflow-y-auto pr-1 text-sm leading-relaxed soft-text md:max-h-[50vh]">
              <p>
                The idea of a platform with information on sneakers has been with me for a year. Back then, AI coding was not yet a well-developed field. Therefore, since I know absolutely nothing about coding (a bit now, I suppose), I quit. The development of technology enabled me to turn the initial idea into reality.
              </p>
              <p>
                I always spend tons of time choosing which sneaker to purchase. YouTube channels and blogs tend to have biased opinions on a shoe. Moreover, the technologies each brand presents vary in their names, function, and appeal to players. sneakerfeature is designed to show unbiased information in the hope of saving you some time when deciding which shoe to purchase, and to make a purchase that fits best with your preference and taste.
              </p>
              <p>
                As a high school student, I am new to both building a website from scratch and maintaining a community. If you have any advice or would like to join as an admin (review shoe uploads) or developer, please feel free to go to the bottom of any page and press &quot;contact&quot;. At the same time, please do not attack or post offensive comments that attack others(you can say a sneaker is shit, though)
              </p>
              <p>
                By the way, if this turned out to be liked by many, perhaps I will charge a one-time fee of a dollar per account in order to cover the fees of databases and domains, etc. I hate ads myself, so there will maybe be 1 or 2, but definitely not scattered around the page. I&apos;ll decide it later.
              </p>
              <p>
                {translate("In the meantime, enjoy!")}
              </p>
            </div>

            <div className="mt-5 border-t border-[rgb(var(--muted)/0.35)] pt-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={completed}
                  onChange={(e) => setCompleted(e.target.checked)}
                  className="h-4 w-4 accent-[rgb(var(--accent))]"
                />
                <span>{translate("Completed reading")}</span>
              </label>
              <Button className="mt-4 w-full sm:w-auto" disabled={!completed} onClick={onContinue}>
                {translate("Continue to Sign Up")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
