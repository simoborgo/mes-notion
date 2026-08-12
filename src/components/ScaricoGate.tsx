"use client";

import { useEffect, useState } from "react";
import type { ArticoloFerramenta, OdpAttivo } from "@/lib/types";
import type { InventarioAmbito } from "@/lib/inventarioFerramentaRepository";
import ScaricoKanbanCard from "./ScaricoKanbanCard";
import ScaricoAPezzoCard from "./ScaricoAPezzoCard";

// Chiave localStorage per lo scarico "a giro" in corso (raccolta multipla via QR) — i QR fisici
// sono etichette statiche, non sanno nulla di una sessione di prelievo attiva: la continuità
// tra una scansione e l'altra la teniamo qui, sullo stesso dispositivo usato per scansionare.
// Stringa non rinominata insieme alla costante: cambiarla avrebbe fatto perdere la sessione
// di raccolta a chiunque l'avesse già attiva sul telefono al momento del deploy.
export const SCARICO_ATTIVO_KEY = "mes_distinta_scarico_attiva";

interface ScaricoAttivo {
  id: string;
  odpLabel: string | null;
}

const AMBITO_LABEL: Record<InventarioAmbito, string> = {
  tutto: "Tutto il catalogo",
  kanban: "Solo Kanban",
  ubicazione: "Ubicazione",
  sotto_scorta: "Sotto scorta",
  inventariato: "Solo voci Inventariati",
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
  const [scaricoAttivo, setScaricoAttivo] = useState<ScaricoAttivo | null | undefined>(undefined);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SCARICO_ATTIVO_KEY);
      setScaricoAttivo(raw ? JSON.parse(raw) : null);
    } catch {
      setScaricoAttivo(null);
    }
  }, []);

  // undefined = non ancora letto localStorage (evita un flash della schermata normale)
  if (scaricoAttivo === undefined) return null;

  if (mostraForm || scaricoAttivo) {
    return (
      <div className="space-y-3">
        {scaricoAttivo && (
          <div className="rounded-lg px-3 py-2 flex items-center justify-between gap-2" style={{ background: "#FFF7ED", border: "1px solid #FDE8D0" }}>
            <p className="text-xs font-semibold" style={{ color: "var(--color-primary-dark)" }}>
              📋 Aggiungendo allo scarico{scaricoAttivo.odpLabel ? ` — ${scaricoAttivo.odpLabel}` : ""}
            </p>
            <button
              onClick={() => { localStorage.removeItem(SCARICO_ATTIVO_KEY); setScaricoAttivo(null); }}
              className="text-xs font-semibold underline flex-shrink-0"
              style={{ color: "var(--color-primary-dark)" }}
            >
              Esci
            </button>
          </div>
        )}
        {articolo.metodoGestione === "Kanban"
          ? <ScaricoKanbanCard articolo={articolo} odpList={odpList} initialOdp={initialOdp} ritorno={ritorno} scaricoId={scaricoAttivo?.id} />
          : <ScaricoAPezzoCard articolo={articolo} odpList={odpList} initialOdp={initialOdp} ritorno={ritorno} scaricoId={scaricoAttivo?.id} />}
      </div>
    );
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
