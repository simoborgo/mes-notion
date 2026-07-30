"use client";

import { useState } from "react";
import type { ArticoloFerramenta, OdpAttivo } from "@/lib/types";
import type { InventarioAmbito } from "@/lib/inventarioFerramentaRepository";
import ScaricoKanbanCard from "./ScaricoKanbanCard";
import ScaricoAPezzoCard from "./ScaricoAPezzoCard";

const AMBITO_LABEL: Record<InventarioAmbito, string> = {
  tutto: "Tutto il catalogo",
  kanban: "Solo Kanban",
  ubicazione: "Ubicazione",
  sotto_scorta: "Sotto scorta",
};

function isSottoSoglia(a: ArticoloFerramenta): boolean {
  return a.sogliaMinima != null && a.giacenzaAttuale < a.sogliaMinima;
}

export default function ScaricoGate({
  articolo, odpList, inventarioAperto, initialOdp, ritorno,
}: {
  articolo: ArticoloFerramenta;
  odpList: OdpAttivo[];
  inventarioAperto: { ambito: InventarioAmbito; ambitoValore: string | null } | null;
  initialOdp?: string | null;
  ritorno?: string | null;
}) {
  const [mostraForm, setMostraForm] = useState(false);

  if (mostraForm) {
    return articolo.metodoGestione === "Kanban"
      ? <ScaricoKanbanCard articolo={articolo} odpList={odpList} initialOdp={initialOdp} ritorno={ritorno} />
      : <ScaricoAPezzoCard articolo={articolo} odpList={odpList} initialOdp={initialOdp} ritorno={ritorno} />;
  }

  const sotto = isSottoSoglia(articolo);

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
      <div>
        <p className="font-bold text-lg" style={{ color: "var(--color-black)" }}>{articolo.descrizione}</p>
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>{articolo.codiceOs1}</p>
      </div>

      <p className="text-sm" style={{ color: "var(--color-black)" }}>
        Giacenza attuale:{" "}
        {sotto ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold" style={{ background: "#FEE2E2", color: "#991B1B" }}>
            ⚠ {articolo.giacenzaAttuale} {articolo.unitaMisura}
          </span>
        ) : (
          <strong>{articolo.giacenzaAttuale} {articolo.unitaMisura}</strong>
        )}
        {articolo.sogliaMinima != null && (
          <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}> — soglia minima {articolo.sogliaMinima}</span>
        )}
      </p>

      {inventarioAperto && (
        <div className="rounded-lg px-3 py-2 text-xs font-medium" style={{ background: "#FEF3C7", color: "#92400E" }}>
          ⚠ Inventario in corso ({AMBITO_LABEL[inventarioAperto.ambito]}
          {inventarioAperto.ambitoValore ? `: ${inventarioAperto.ambitoValore}` : ""}) — verifica prima di scaricare
          se questo articolo ne fa parte.
        </div>
      )}

      <button
        onClick={() => setMostraForm(true)}
        className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
        style={{ background: "var(--color-primary)" }}
      >
        Scarico
      </button>
    </div>
  );
}
