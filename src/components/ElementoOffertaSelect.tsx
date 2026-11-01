"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { OffertaRiga } from "@/lib/offerteRepository";

// Menu "Riga dell'offerta": le righe articolo dell'offerta Confermata della commessa.
// Se la commessa non ne ha, non mostra nulla (nessun obbligo di compilare la lista).
export default function ElementoOffertaSelect({ commessaId, value, onChange, className, style, labelClassName, labelStyle }: {
  commessaId: string | null;
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
  style?: CSSProperties;
  labelClassName?: string;
  labelStyle?: CSSProperties;
}) {
  const [elementi, setElementi] = useState<OffertaRiga[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!commessaId) return;
    fetch(`/api/offerte-righe?commessaId=${commessaId}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setElementi(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setElementi([]); });
    return () => { cancelled = true; };
  }, [commessaId]);

  // Gli elementi caricati restano in stato anche dopo un cambio commessa: senza commessa non si mostra nulla.
  if (!commessaId || elementi.length === 0) return null;

  return (
    <div>
      <label className={labelClassName} style={labelStyle}>Riga dell&apos;offerta</label>
      <select className={className} style={style} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— nessuno —</option>
        {elementi.map((el) => (
          <option key={el.id} value={el.id}>{el.codiceArticolo} — {el.articoloDescrizione} (× {el.quantita})</option>
        ))}
      </select>
    </div>
  );
}
