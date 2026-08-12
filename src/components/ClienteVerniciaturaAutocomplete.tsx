"use client";

import { useMemo, useState } from "react";

interface Props {
  clienti: string[];
  value: string;
  onChange: (cliente: string) => void;
  placeholder?: string;
}

// clienti_verniciatura non è un elenco chiuso — un cliente nuovo va potuto aggiungere al volo
// dal form (stesso spirito di CodiceArticoloAutocomplete per gli articoli), con l'univocità
// case-insensitive garantita lato DB per evitare varianti di scrittura dello stesso cliente.
export default function ClienteVerniciaturaAutocomplete({ clienti, value, onChange, placeholder }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtrati = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return clienti.slice(0, 30);
    return clienti.filter((c) => c.toLowerCase().includes(q)).slice(0, 30);
  }, [clienti, search]);

  const nuovo = search.trim();
  const giaEsistente = nuovo !== "" && clienti.some((c) => c.toLowerCase() === nuovo.toLowerCase());

  if (value) {
    const esistente = clienti.some((c) => c.toLowerCase() === value.toLowerCase());
    return (
      <div
        className="flex items-center gap-2 px-3 rounded-lg border text-sm font-medium"
        style={{ height: 48, borderColor: "var(--color-primary)", background: "rgba(240,143,37,0.06)" }}
      >
        <span className="flex-1 min-w-0 truncate">
          <span className="font-semibold">{value}</span>
          {!esistente && <span style={{ color: "#92400E" }}> — nuovo cliente, verrà creato</span>}
        </span>
        <button type="button" onClick={() => onChange("")} className="text-gray-400 hover:text-gray-600 text-base leading-none">×</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        className="w-full rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
        style={{ height: 48, borderColor: "#d1d5db" }}
        placeholder={placeholder ?? "Cerca o aggiungi cliente…"}
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (filtrati.length > 0 || (nuovo && !giaEsistente)) && (
        <ul
          className="absolute z-50 w-full mt-1 rounded-lg border bg-white shadow-lg overflow-y-auto"
          style={{ borderColor: "#d1d5db", maxHeight: 260 }}
        >
          {filtrati.map((c) => (
            <li
              key={c}
              className="px-3 py-2.5 text-sm cursor-pointer hover:bg-orange-50"
              onMouseDown={(e) => { e.preventDefault(); onChange(c); setSearch(""); setOpen(false); }}
            >
              {c}
            </li>
          ))}
          {nuovo && !giaEsistente && (
            <li
              className="px-3 py-2.5 text-sm cursor-pointer hover:bg-orange-50 border-t"
              style={{ borderColor: "#f0ece5", color: "var(--color-primary)" }}
              onMouseDown={(e) => { e.preventDefault(); onChange(nuovo); setSearch(""); setOpen(false); }}
            >
              <span className="font-semibold">+ Nuovo cliente:</span> {nuovo}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
