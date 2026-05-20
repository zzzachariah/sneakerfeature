"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isValidPersona, type Persona } from "@/lib/persona/types";
import { PersonaModal } from "@/components/preferences/persona-modal";

type PersonaContextValue = {
  persona: Persona | null;
  isLoggedIn: boolean;
  loaded: boolean;
  saving: boolean;
  isRefreshing: boolean;
  message: string | null;
  isError: boolean;
  savePersona: (p: Persona) => Promise<boolean>;
  clearPersona: () => Promise<boolean>;
  openModal: () => void;
  closeModal: () => void;
};

const PersonaContext = createContext<PersonaContextValue | null>(null);

export function PersonaProvider({
  children,
  initialPersona = null,
  initialIsLoggedIn = false
}: {
  children: React.ReactNode;
  initialPersona?: Persona | null;
  initialIsLoggedIn?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [persona, setPersona] = useState<Persona | null>(initialPersona);
  const [isLoggedIn, setIsLoggedIn] = useState(initialIsLoggedIn);
  const [loaded, setLoaded] = useState(initialPersona !== null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const forcePromptedRef = useRef(false);
  // Tracks whether the current modal session ended in a successful save, so the
  // tutorial can tell "saved → continue" apart from "dismissed → exit".
  const savedThisSessionRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const fetchPersona = () => {
      fetch("/api/preferences/persona", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (isValidPersona(data?.persona)) setPersona(data.persona);
          else setPersona(null);
          setLoaded(true);
        })
        .catch(() => {
          if (!cancelled) setLoaded(true);
        });
    };

    if (!supabase) {
      fetchPersona();
      return () => {
        cancelled = true;
      };
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setIsLoggedIn(Boolean(data.session?.user?.id));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const signedIn = Boolean(session?.user?.id);
      setIsLoggedIn(signedIn);
      forcePromptedRef.current = false;
      if (signedIn) {
        fetchPersona();
      } else {
        setPersona(null);
      }
    });

    fetchPersona();

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const openModal = useCallback(() => {
    setMessage(null);
    setIsError(false);
    savedThisSessionRef.current = false;
    setModalOpen(true);
  }, []);
  const closeModal = useCallback(() => {
    setModalOpen(false);
    const eventName = savedThisSessionRef.current
      ? "tutorial:user-action-complete"
      : "tutorial:user-action-cancelled";
    savedThisSessionRef.current = false;
    window.dispatchEvent(new CustomEvent(eventName, { detail: { modalId: "persona" } }));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (!isLoggedIn) return;
    if (persona) return;
    if (pathname !== "/") return;
    if (forcePromptedRef.current) return;
    forcePromptedRef.current = true;
    const t = window.setTimeout(() => setModalOpen(true), 600);
    return () => window.clearTimeout(t);
  }, [loaded, isLoggedIn, persona, pathname]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const ce = e as CustomEvent<{ modalId?: string }>;
      if (ce.detail?.modalId === "persona") openModal();
    };
    window.addEventListener("tutorial:open-modal", onOpen as EventListener);
    return () => window.removeEventListener("tutorial:open-modal", onOpen as EventListener);
  }, [openModal]);

  const savePersona = useCallback(
    async (next: Persona) => {
      setSaving(true);
      setMessage(null);
      const res = await fetch("/api/preferences/persona", {
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
      setPersona(next);
      savedThisSessionRef.current = true;
      startRefresh(() => {
        router.refresh();
      });
      return true;
    },
    [router]
  );

  const clearPersona = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/preferences/persona", {
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
    setPersona(null);
    startRefresh(() => {
      router.refresh();
    });
    return true;
  }, [router]);

  const value = useMemo<PersonaContextValue>(
    () => ({
      persona,
      isLoggedIn,
      loaded,
      saving,
      isRefreshing,
      message,
      isError,
      savePersona,
      clearPersona,
      openModal,
      closeModal
    }),
    [persona, isLoggedIn, loaded, saving, isRefreshing, message, isError, savePersona, clearPersona, openModal, closeModal]
  );

  return (
    <PersonaContext.Provider value={value}>
      {children}
      <PersonaModal open={modalOpen} onClose={closeModal} />
    </PersonaContext.Provider>
  );
}

export function usePersona() {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error("usePersona must be used inside PersonaProvider");
  return ctx;
}
