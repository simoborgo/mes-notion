"use client";

import { useMemo, useState } from "react";
import type { Articolo } from "@/lib/articoliRepository";

interface Props {
  articoli: Articolo[];
  value: string | null;
  onChange: (codiceArticolo: string | null) => void;
  placeholder?: string;
}

export default function CodiceArticoloAutocomplete({ articoli, value, onChange, placeholder }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const selected = value ? articoli.find(a => a.codiceArticolo === value) : null;

  const filtrati = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return articoli.slice(0, 30);
    return articoli.filter(a => `${a.codiceArticolo} ${a.descrizione}`.toLowerCase().includes(q)).slice(0, 30);
  }, [articoli, search]);

  if (selected) {
    return (
      <div
        className="flex items-center gap-2 px-3 rounded-lg border text-sm font-medium"
        style={{ height: 48, borderColor: "var(--color-primary)", background: "rgba(240,143,37,0.06)" }}
      >
        <span className="flex-1 min-w-0 truncate">
          <span className="font-semibold">{selected.codiceArticolo}</span> — {selected.descrizione}
        </span>
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
        placeholder={placeholder ?? "Cerca codice o descrizione articolo…"}
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
              key={a.codiceArticolo}
              className="px-3 py-2.5 text-sm cursor-pointer hover:bg-orange-50"
              onMouseDown={e => { e.preventDefault(); onChange(a.codiceArticolo); setSearch(""); setOpen(false); }}
            >
              <span className="font-semibold">{a.codiceArticolo}</span>
              <span className="ml-1.5" style={{ color: "#9ca3af" }}>{a.descrizione}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
