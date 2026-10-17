"use client";

import { useState } from "react";
import type { Scheda } from "@/lib/types";
import BadgeStato from "./BadgeStato";

// Stesso criterio di OdpSelettore: sfondo deterministico per le schede senza copertina
export function coloreDaTesto(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return { bg: `hsl(${hue}, 45%, 92%)`, fg: `hsl(${hue}, 45%, 30%)` };
}

// selected: modalità selezione (griglia del modal Carico): bordo evidenziato e spunta
export default function SchedaCard({ s, onClick, selected, sottoscheda }: { s: Scheda; onClick: () => void; selected?: boolean; sottoscheda?: boolean }) {
  const [caricata, setCaricata] = useState(false);
  const { bg, fg } = coloreDaTesto(s.clienteInfo || s.odp);
  const label = `${s.odp}${s.numeroScheda ? ` - ${s.numeroScheda}` : ""}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative rounded-xl border overflow-hidden text-left bg-white hover:shadow-md transition-shadow"
      style={selected ? { borderColor: "var(--color-primary)", boxShadow: "0 0 0 2px var(--color-primary)" } : { borderColor: "#e5e4e0" }}
      aria-pressed={selected}
    >
      {sottoscheda && (
        <span className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ background: "#FEF9C3", color: "#92400E" }}>↳ Sottoscheda</span>
      )}
      {selected && (
        <span className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: "var(--color-primary)" }}>✓</span>
      )}
      <div className="relative w-full flex items-center justify-center" style={{ aspectRatio: "4 / 3", background: s.copertina ? "#f3f3f1" : bg }}>
        {s.copertina && (
          // eslint-disable-next-line @next/next/no-img-element -- copertine da Drive/Notion, dominio esterno non gestito da next/image
          <img
            src={s.copertina}
            alt=""
            loading="lazy"
            onLoad={() => setCaricata(true)}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: caricata ? 1 : 0, transition: "opacity 200ms" }}
          />
        )}
        <span
          className="relative px-2 py-1 rounded-md text-sm font-bold text-center"
          style={s.copertina ? { background: "rgba(0,0,0,0.55)", color: "white" } : { color: fg }}
        >
          {label}
        </span>
      </div>
      <div className="px-3 py-2 space-y-1">
        <p className="text-sm font-semibold truncate">{s.clienteInfo || s.descrizioneFasi || "—"}</p>
        <p className="text-xs truncate" style={{ color: "var(--color-grey-mid)" }}>
          {[s.codiceArticolo, s.posizione, s.quantita != null ? `×${s.quantita}` : ""].filter(Boolean).join(" · ") || "—"}
        </p>
        <div className="flex flex-wrap gap-1 items-center pt-0.5">
          {s.statoProduzione && <BadgeStato stato={s.statoProduzione} />}
          {s.faseCorrente && <span className="text-[11px]" style={{ color: "var(--color-grey-mid)" }}>{s.faseCorrente}</span>}
        </div>
      </div>
    </button>
  );
}
