"use client";

import { useMemo, useState } from "react";
import type { Commessa } from "@/lib/types";

interface Props {
  commesseList: Commessa[];
  value: string | null; // id Commessa
  onChange: (commessaId: string | null) => void;
  placeholder?: string;
}

function label(c: Commessa): string {
  return `${c.numeroCommessa}${c.cliente ? ` — ${c.cliente}` : ""}`;
}

export default function CommessaAutocomplete({ commesseList, value, onChange, placeholder }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const selected = value ? commesseList.find(c => c.id === value) : null;

  const filtrate = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return commesseList.slice(0, 30);
    return commesseList
      .filter(c => `${c.numeroCommessa} ${c.cliente}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [commesseList, search]);

  if (selected) {
    return (
      <div
        className="flex items-center gap-2 px-3 rounded-lg border text-sm font-medium"
        style={{ height: 48, borderColor: "var(--color-primary)", background: "rgba(240,143,37,0.06)" }}
      >
        <span className="flex-1 min-w-0 truncate">{label(selected)}</span>
        <button type="button" onClick={() => onChange(null)} className="text-gray-400 hover:text-gray-600 text-base leading-none">×</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        className="w-full rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
        style={{ height: 48, borderColor: "#d1d5db" }}
        placeholder={placeholder ?? "Cerca Commessa…"}
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtrate.length > 0 && (
        <ul
          className="absolute z-50 w-full mt-1 rounded-lg border bg-white shadow-lg overflow-y-auto"
          style={{ borderColor: "#d1d5db", maxHeight: 260 }}
        >
          {filtrate.map(c => (
            <li
              key={c.id}
              className="px-3 py-2.5 text-sm cursor-pointer hover:bg-orange-50"
              onMouseDown={e => { e.preventDefault(); onChange(c.id); setSearch(""); setOpen(false); }}
            >
              {label(c)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
