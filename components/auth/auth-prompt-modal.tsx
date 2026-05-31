"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/locale-provider";

export function AuthPromptModal({
  open,
  reason,
  next,
  onClose,
}: {
  open: boolean;
  reason: string | null;
  next: string | null;
  onClose: () => void;
}) {
  const { translate } = useLocale();
  const router = useRouter();

  function go(path: "/login" | "/signup") {
    const target =
      next ??
      (typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/");
    onClose();
    router.push(`${path}?next=${encodeURIComponent(target)}` as Route);
  }

  return (
    <Modal open={open} onClose={onClose} title="Sign in to continue" zIndexClass="z-[80]">
      <div className="space-y-5">
        <p className="text-sm soft-text">
          {translate(reason ?? "Log in or create an account to use this feature.")}
        </p>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button
            type="button"
            onClick={() => go("/login")}
            className="h-11 w-full text-[0.95rem]"
          >
            <span className="inline-flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              {translate("Log in")}
            </span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => go("/signup")}
            className="h-11 w-full text-[0.95rem]"
          >
            <span className="inline-flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              {translate("Sign up")}
            </span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
