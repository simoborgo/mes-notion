"use client";

import { useEffect, useState } from "react";
import type { ArticoloFerramenta, DistintaKitRiga, Scheda } from "@/lib/types";
import GestioneKitOdp from "./GestioneKitOdp";

// Wrapper client per riusare GestioneKitOdp (pensato per la pagina admin/ferramenta/kit/[schedaId],
// dove righe/articoli arrivano già pronti da un server component) dentro il modal Scheda, che è
// tutto client-side: qui li carichiamo on-demand quando la tab viene aperta, la scheda invece è
// già disponibile come prop (nessuna fetch aggiuntiva necessaria per quella).
export default function KitFerramentaTab({ scheda }: { scheda: Scheda }) {
  const [righe, setRighe] = useState<DistintaKitRiga[] | null>(null);
  const [articoli, setArticoli] = useState<ArticoloFerramenta[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let annullato = false;
    Promise.all([
      fetch(`/api/ferramenta/kit/${scheda.id}`).then(r => r.json()),
      fetch(`/api/ferramenta/articoli?metodoGestione=A Pezzo`).then(r => r.json()),
    ])
      .then(([righeData, articoliData]) => {
        if (annullato) return;
        if (!Array.isArray(righeData) || !Array.isArray(articoliData)) throw new Error("Risposta inattesa");
        setRighe(righeData);
        setArticoli(articoliData);
      })
      .catch((e) => { if (!annullato) setErrore(e instanceof Error ? e.message : "Errore caricamento Kit Ferramenta"); });
    return () => { annullato = true; };
  }, [scheda.id]);

  if (errore) {
    return <p className="text-sm" style={{ color: "#991B1B" }}>{errore}</p>;
  }
  if (!righe || !articoli) {
    return <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>;
  }
  return <GestioneKitOdp scheda={scheda} righeIniziali={righe} articoliAPezzo={articoli} />;
}
