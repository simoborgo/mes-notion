"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SchedaVerniciatura } from "@/lib/types";

interface Props {
  schedeList: SchedaVerniciatura[];
  value: string | null; // id Scheda di Verniciatura
  onChange: (schedaVerniciaturaId: string | null) => void;
  placeholder?: string;
}

function label(s: SchedaVerniciatura): string {
  const parti = [s.nome || s.codicePubblico || `v${s.versione}`, s.cliente].filter(Boolean);
  return parti.join(" — ");
}

// Stesso pattern di CommessaAutocomplete.tsx, ma con dropdown position:fixed (coordinate da
// getBoundingClientRect) invece di absolute — questa autocomplete vive dentro la tab
// "Verniciatura" di DettaglioSchedaModal, un contenitore con overflow-y-auto: con absolute la
// lista veniva tagliata/nascosta, stesso problema già risolto in VerniceSelect.tsx.
export default function SchedaVerniciaturaAutocomplete({ schedeList, value, onChange, placeholder }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = value ? schedeList.find((s) => s.id === value) : null;

  const filtrate = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return schedeList.slice(0, 30);
    return schedeList
      .filter((s) => `${s.nome ?? ""} ${s.cliente ?? ""} ${s.codicePubblico ?? ""}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [schedeList, search]);

  function apri() {
    const rect = (wrapperRef.current ?? inputRef.current)?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function riposiziona() {
      const rect = (wrapperRef.current ?? inputRef.current)?.getBoundingClientRect();
      if (rect) setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    window.addEventListener("scroll", riposiziona, true);
    window.addEventListener("resize", riposiziona);
    return () => {
      window.removeEventListener("scroll", riposiziona, true);
      window.removeEventListener("resize", riposiziona);
    };
  }, [open]);

  if (selected) {
    return (
      <div
        ref={wrapperRef}
        className="flex items-center gap-2 px-3 rounded-lg border text-sm font-medium"
        style={{ height: 48, borderColor: "var(--color-primary)", background: "rgba(240,143,37,0.06)" }}
      >
        <span className="flex-1 min-w-0 truncate">{label(selected)}</span>
        <button type="button" onClick={() => onChange(null)} className="text-gray-400 hover:text-gray-600 text-base leading-none">×</button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        className="w-full rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
        style={{ height: 48, borderColor: "#d1d5db" }}
        placeholder={placeholder ?? "Cerca Scheda di Verniciatura…"}
        value={search}
        onChange={(e) => { setSearch(e.target.value); apri(); }}
        onFocus={apri}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && coords && filtrate.length > 0 && (
        <ul
          className="fixed z-[100] rounded-lg border bg-white shadow-lg overflow-y-auto"
          style={{ top: coords.top, left: coords.left, width: coords.width, borderColor: "#d1d5db", maxHeight: 260 }}
        >
          {filtrate.map((s) => (
            <li
              key={s.id}
              className="px-3 py-2.5 text-sm cursor-pointer hover:bg-orange-50"
              onMouseDown={(e) => { e.preventDefault(); onChange(s.id); setSearch(""); setOpen(false); }}
            >
              {label(s)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
