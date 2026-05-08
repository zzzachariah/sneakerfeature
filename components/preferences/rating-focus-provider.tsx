"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isValidFocus, type RatingFocus } from "@/lib/star-rating";
import { RatingFocusModal } from "@/components/preferences/rating-focus-modal";

type RatingFocusContextValue = {
  focus: RatingFocus | null;
  isLoggedIn: boolean;
  loaded: boolean;
  saving: boolean;
  isRefreshing: boolean;
  message: string | null;
  isError: boolean;
  saveFocus: (focus: RatingFocus) => Promise<boolean>;
  clearFocus: () => Promise<boolean>;
  openModal: () => void;
  closeModal: () => void;
};

const RatingFocusContext = createContext<RatingFocusContextValue | null>(null);

export function RatingFocusProvider({
  children,
  initialFocus = null,
  initialIsLoggedIn = false
}: {
  children: React.ReactNode;
  initialFocus?: RatingFocus | null;
  initialIsLoggedIn?: boolean;
}) {
  const router = useRouter();
  const [focus, setFocus] = useState<RatingFocus | null>(initialFocus);
  const [isLoggedIn, setIsLoggedIn] = useState(initialIsLoggedIn);
  const [loaded, setLoaded] = useState(initialFocus !== null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        setIsLoggedIn(Boolean(data.session?.user?.id));
      });
    }
    fetch("/api/preferences/rating-focus", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (isValidFocus(data?.focus)) setFocus(data.focus);
        else setFocus(null);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openModal = useCallback(() => {
    setMessage(null);
    setIsError(false);
    setModalOpen(true);
  }, []);
  const closeModal = useCallback(() => setModalOpen(false), []);

  const saveFocus = useCallback(
    async (next: RatingFocus) => {
      setSaving(true);
      setMessage(null);
      const res = await fetch("/api/preferences/rating-focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next)
      });
      const data = await res.json();
      setSaving(false);
      if (!data?.ok) {
        setIsError(true);
        setMessage(data?.message ?? "Save failed");
        return false;
      }
      setIsError(false);
      setMessage(data?.message ?? null);
      setFocus(next);
      startRefresh(() => {
        router.refresh();
      });
      return true;
    },
    [router]
  );

  const clearFocus = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/preferences/rating-focus", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const data = await res.json();
    setSaving(false);
    if (!data?.ok) {
      setIsError(true);
      setMessage(data?.message ?? "Clear failed");
      return false;
    }
    setIsError(false);
    setMessage(data?.message ?? null);
    setFocus(null);
    startRefresh(() => {
      router.refresh();
    });
    return true;
  }, [router]);

  const value = useMemo<RatingFocusContextValue>(
    () => ({
      focus,
      isLoggedIn,
      loaded,
      saving,
      isRefreshing,
      message,
      isError,
      saveFocus,
      clearFocus,
      openModal,
      closeModal
    }),
    [focus, isLoggedIn, loaded, saving, isRefreshing, message, isError, saveFocus, clearFocus, openModal, closeModal]
  );

  return (
    <RatingFocusContext.Provider value={value}>
      {children}
      <RatingFocusModal open={modalOpen} onClose={closeModal} />
    </RatingFocusContext.Provider>
  );
}

export function useRatingFocus() {
  const ctx = useContext(RatingFocusContext);
  if (!ctx) throw new Error("useRatingFocus must be used inside RatingFocusProvider");
  return ctx;
}
