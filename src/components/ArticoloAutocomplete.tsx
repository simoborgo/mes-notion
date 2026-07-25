"use client";

import { useMemo, useState } from "react";
import type { ArticoloFerramenta } from "@/lib/types";

interface Props {
  articoli: ArticoloFerramenta[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}

export default function ArticoloAutocomplete({ articoli, value, onChange, placeholder }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const selected = value ? articoli.find(a => a.id === value) : null;

  const filtrati = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return articoli.slice(0, 30);
    return articoli.filter(a => `${a.descrizione} ${a.codiceOs1}`.toLowerCase().includes(q)).slice(0, 30);
  }, [articoli, search]);

  if (selected) {
    return (
      <div
        className="flex items-center gap-2 px-3 rounded-lg border text-sm font-medium"
        style={{ height: 48, borderColor: "var(--color-primary)", background: "rgba(240,143,37,0.06)" }}
      >
        <span className="flex-1 truncate">{selected.descrizione} — {selected.codiceOs1}</span>
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
        placeholder={placeholder ?? "Cerca articolo…"}
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtrati.length > 0 && (
        <ul
          className="absolute z-50 w-full mt-1 rounded-lg border bg-white shadow-lg overflow-y-auto"
          style={{ borderColor: "#d1d5db", maxHeight: 260 }}
        >
          {filtrati.map(a => (
            <li
              key={a.id}
              className="px-3 py-2.5 text-sm cursor-pointer hover:bg-orange-50"
              onMouseDown={e => { e.preventDefault(); onChange(a.id); setSearch(""); setOpen(false); }}
            >
              <span className="font-semibold">{a.descrizione}</span>
              <span className="text-xs ml-2" style={{ color: "var(--color-grey-mid)" }}>{a.codiceOs1}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
