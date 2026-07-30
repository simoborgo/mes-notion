"use client";

import { useState, useMemo } from "react";
import type { Scheda, Ritiro, Commessa } from "@/lib/types";
import RientroQualitaCard from "./RientroQualitaCard";
import FormNuovoRitiro from "./FormNuovoRitiro";

interface Props {
  rilavorazioni: Scheda[];
  ritiri: Ritiro[];
  fornitori: { id: string; nome: string }[];
  commesse: Commessa[];
}

export default function RientroQualitaList({ rilavorazioni, ritiri: ritiriIniziali, fornitori, commesse }: Props) {
  const [search, setSearch] = useState("");
  const [ritiri, setRitiri] = useState(ritiriIniziali);
  const [schedaPerNuovoRitiro, setSchedaPerNuovoRitiro] = useState<Scheda | null>(null);

  const ritiriByRilavorazione = useMemo(() => {
    const m = new Map<string, Ritiro[]>();
    for (const r of ritiri) {
      if (!r.rilavorazioneId) continue;
      const arr = m.get(r.rilavorazioneId) ?? [];
      arr.push(r);
      m.set(r.rilavorazioneId, arr);
    }
    return m;
  }, [ritiri]);

  // Le rilavorazioni senza alcun ritiro concordato sono le più urgenti — vengono a galla per prime.
  const ordinate = useMemo(() => {
    return [...rilavorazioni].sort((a, b) => {
      const aSenza = (ritiriByRilavorazione.get(a.id)?.length ?? 0) === 0;
      const bSenza = (ritiriByRilavorazione.get(b.id)?.length ?? 0) === 0;
      if (aSenza === bSenza) return 0;
      return aSenza ? -1 : 1;
    });
  }, [rilavorazioni, ritiriByRilavorazione]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return ordinate;
    return ordinate.filter(s =>
      `${s.odp} ${s.numeroScheda} ${s.fornitore} ${s.clienteInfo}`.toLowerCase().includes(q)
    );
  }, [ordinate, search]);

  function handleRitiroCreato(ritiro: Ritiro) {
    setRitiri(prev => [...prev, ritiro]);
    setSchedaPerNuovoRitiro(null);
  }

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
          {filtered.map(s => (
            <RientroQualitaCard
              key={s.id}
              scheda={s}
              ritiriCollegati={ritiriByRilavorazione.get(s.id) ?? []}
              onInserisciRitiro={() => setSchedaPerNuovoRitiro(s)}
            />
          ))}
        </div>
      )}

      {schedaPerNuovoRitiro && (
        <FormNuovoRitiro
          schede={[schedaPerNuovoRitiro]}
          fornitori={fornitori}
          commesse={commesse}
          initialScheda={schedaPerNuovoRitiro}
          onClose={() => setSchedaPerNuovoRitiro(null)}
          onCreated={handleRitiroCreato}
        />
      )}
    </div>
  );
}
