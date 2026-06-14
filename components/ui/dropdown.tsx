"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function Dropdown({ label, options, onSelect }: { label: string; options: string[]; onSelect: (value: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button type="button" className="liquid-interactive interactive-soft inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--bg-elev)/0.96)] px-3 py-2 text-sm premium-border" onClick={() => setOpen((o) => !o)}>
        {label} <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="glass glass-rim liquid-interactive absolute right-0 z-20 mt-2 w-44 rounded-xl p-1">
          {options.map((option) => (
            <button key={option} className="w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[rgb(var(--accent)/0.08)]" onClick={() => { onSelect(option); setOpen(false); }}>
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
