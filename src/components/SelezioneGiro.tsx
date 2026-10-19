"use client";

import { useEffect, useState } from "react";
import type { Giro } from "@/lib/types";

// Scelta del giro esterno a cui appartiene un movimento di Ritiri e Consegne. Con `autoAttivo` (form
// di creazione) preseleziona il giro ancora aperto della scheda; se sono tutti rientrati lascia
// "nessuno", perché un nuovo movimento non deve riaprire un giro concluso: il nuovo giro si crea
// prima dalla scheda.
export default function SelezioneGiro({ schedaId, value, onChange, autoAttivo = false, inputCls, labelCls }: {
  schedaId: string;
  value: string | null;
  onChange: (giroId: string | null) => void;
  autoAttivo?: boolean;
  inputCls: string;
  labelCls: string;
}) {
  const [giri, setGiri] = useState<Giro[] | null>(null);

  useEffect(() => {
    let annullato = false;
    setGiri(null);
    fetch(`/api/schede/${schedaId}/giri`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Giro[]) => {
        if (annullato) return;
        setGiri(data);
        if (autoAttivo) {
          const aperto = [...data].reverse().find((g) => g.stato !== "Rientrato");
          onChange(aperto?.id ?? null);
        }
      })
      .catch(() => { if (!annullato) setGiri([]); });
    return () => { annullato = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedaId]);

  if (giri === null || giri.length === 0) return null;
  const tuttiRientrati = giri.every((g) => g.stato === "Rientrato");

  return (
    <div className="col-span-2">
      <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Giro esterno</label>
      <select className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— nessun giro —</option>
        {giri.map((g) => (
          <option key={g.id} value={g.id}>
            Giro {g.ordine} · {g.fornitore || "fornitore da definire"}{g.lavorazione ? ` · ${g.lavorazione}` : ""} · {g.stato || "—"}
          </option>
        ))}
      </select>
      {autoAttivo && tuttiRientrati && (
        <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Tutti i giri di questa scheda sono rientrati: per un nuovo viaggio crea prima il giro dalla scheda (tab Fornitore Esterno).
        </p>
      )}
    </div>
  );
}
