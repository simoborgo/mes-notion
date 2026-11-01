"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommessaPianta } from "@/lib/types";
import PdfAnnotabile, { type Annotazioni } from "./PdfAnnotabile";

// Pianta annotabile con salvataggio automatico (2s dopo l'ultima modifica), come le verifiche
// di spedizione. Chi non può modificare il contenuto della commessa la vede in sola lettura.
export default function PiantaAnnotatore({ pianta, iniziali, canEdit }: { pianta: CommessaPianta; iniziali: Partial<Annotazioni>; canEdit: boolean }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoRef = useRef<Annotazioni | null>(null);
  const [stato, setStato] = useState<"" | "salvo" | "salvato" | "errore">("");

  const salva = useCallback(async () => {
    const a = ultimoRef.current;
    if (!a) return;
    setStato("salvo");
    try {
      const res = await fetch(`/api/commesse/${pianta.commessaId}/piante/${pianta.id}/annotazioni`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strokes: a.strokes, stamps: a.stamps }),
      });
      setStato(res.ok ? "salvato" : "errore");
    } catch {
      setStato("errore");
    }
  }, [pianta.commessaId, pianta.id]);

  const onChange = useCallback((a: Annotazioni) => {
    ultimoRef.current = a;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(salva, 2000);
  }, [salva]);

  // Chiudendo la pagina con una modifica non ancora salvata, la salva subito.
  useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); void salva(); }
  }, [salva]);

  return (
    <div className="space-y-1.5">
      <PdfAnnotabile url={`/api/drive-file/${pianta.driveFileId}`} mimeType={pianta.mimeType} iniziali={iniziali} onChange={canEdit ? onChange : undefined} readOnly={!canEdit} />
      {canEdit && (
        <p className="text-[11px] h-4" style={{ color: stato === "errore" ? "#991B1B" : "var(--color-grey-mid)" }}>
          {stato === "salvo" && "Salvataggio…"}{stato === "salvato" && "Segni salvati"}{stato === "errore" && "Errore nel salvataggio dei segni: riprova a modificare"}
        </p>
      )}
    </div>
  );
}
