"use client";

import { useMemo, useState } from "react";
import type { OdpAttivo } from "@/lib/types";
import { OdpLabel } from "./OdpAutocomplete";

interface Props {
  odpList: OdpAttivo[];
  value: string[];
  onChange: (odp: string[]) => void;
  placeholder?: string;
}

// Selezione multipla — un operatore può lavorare su più ODP contemporaneamente (lotto):
// checkbox nella lista, chip rimovibili per ogni ODP già scelto.
export default function OdpMultiAutocomplete({ odpList, value, onChange, placeholder }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const selezionati = useMemo(
    () => value.map(odp => odpList.find(o => o.odp === odp)).filter((o): o is OdpAttivo => !!o),
    [odpList, value]
  );

  const filtrati = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return odpList.slice(0, 30);
    return odpList
      .filter(o => `${o.label} ${o.numeroScheda ?? ""}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [odpList, search]);

  function toggle(odp: string) {
    onChange(value.includes(odp) ? value.filter(o => o !== odp) : [...value, odp]);
  }

  return (
    <div className="space-y-1.5">
      {selezionati.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selezionati.map(o => (
            <span
              key={o.odp}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ background: "rgba(240,143,37,0.1)", color: "var(--color-black)" }}
            >
              <OdpLabel o={o} />
              <button
                type="button"
                onClick={() => toggle(o.odp)}
                aria-label={`Rimuovi ${o.odp}`}
                className="text-gray-400 hover:text-gray-600 leading-none flex-shrink-0"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          className="w-full rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
          style={{ height: 48, borderColor: "#d1d5db" }}
          placeholder={placeholder ?? "Cerca ODP…"}
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
            {filtrati.map(o => (
              <li
                key={o.odp}
                className="flex items-center gap-2.5 px-3 py-2.5 text-sm cursor-pointer hover:bg-orange-50"
                onMouseDown={e => { e.preventDefault(); toggle(o.odp); }}
              >
                <input
                  type="checkbox"
                  checked={value.includes(o.odp)}
                  readOnly
                  className="w-4 h-4 accent-orange-500 flex-shrink-0"
                />
                <OdpLabel o={o} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
