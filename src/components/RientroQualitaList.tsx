"use client";

import { useState, useMemo } from "react";
import type { Scheda } from "@/lib/types";
import RientroQualitaCard from "./RientroQualitaCard";

export default function RientroQualitaList({ rilavorazioni }: { rilavorazioni: Scheda[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rilavorazioni;
    return rilavorazioni.filter(s =>
      `${s.odp} ${s.numeroScheda} ${s.fornitore} ${s.clienteInfo}`.toLowerCase().includes(q)
    );
  }, [rilavorazioni, search]);

  if (rilavorazioni.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
        Nessuna rilavorazione in attesa di rientro.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <input
        type="search"
        inputMode="search"
        placeholder="Cerca per fornitore, ODP, cliente…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full rounded-xl border px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
        style={{ borderColor: "#d1d5db", height: 52 }}
      />
      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
          Nessun risultato per &quot;{search}&quot;
        </p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {filtered.map(s => <RientroQualitaCard key={s.id} scheda={s} />)}
        </div>
      )}
    </div>
  );
}
