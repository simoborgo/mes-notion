"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommessaAllegato, CommessaSpecifica, CategoriaAllegato } from "@/lib/types";
import { CATEGORIE_ALLEGATO } from "@/lib/types";
import AllegatiUpload from "./AllegatiUpload";

const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
}

export default function CommessaDocumenti({ commessaId, allegati, specifiche, canEdit }: {
  commessaId: string; allegati: CommessaAllegato[]; specifiche: CommessaSpecifica[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<CategoriaAllegato | "">("");
  const [categoria, setCategoria] = useState<CategoriaAllegato>("Altro");
  const [errore, setErrore] = useState("");
  const titoli = useMemo(() => new Map(specifiche.map((s) => [s.id, s.titolo])), [specifiche]);
  const visibili = allegati.filter((a) => !filtro || a.categoria === filtro);

  async function elimina(a: CommessaAllegato) {
    if (!window.confirm(`Eliminare "${a.nomeFile}"? Il file viene rimosso anche da Drive.`)) return;
    const res = await fetch(`/api/commesse/${commessaId}/allegati/${a.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else setErrore("Errore nell'eliminazione");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {(["", ...CATEGORIE_ALLEGATO] as const).map((c) => (
            <button
              key={c || "tutti"}
              type="button"
              onClick={() => setFiltro(c)}
              className="text-xs rounded-full border px-3 py-1"
              style={filtro === c ? { background: "var(--color-black)", color: "#fff", borderColor: "var(--color-black)" } : { background: "#fff", color: "var(--color-grey-mid)", borderColor: "#E4E0DA" }}
            >
              {c || "Tutti"}
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <select className={inputCls} value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaAllegato)} aria-label="Categoria del nuovo file">
              {CATEGORIE_ALLEGATO.map((c) => <option key={c}>{c}</option>)}
            </select>
            <AllegatiUpload commessaId={commessaId} categoria={categoria} />
          </div>
        )}
      </div>

      {visibili.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm" style={{ color: "var(--color-grey-mid)" }}>
          {allegati.length === 0 ? "Nessun documento. Carica conferme d'ordine, schede tecniche e certificati di questa commessa." : "Nessun documento in questa categoria."}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          {visibili.map((a) => (
            <div key={a.id} className="flex items-start gap-3 p-4">
              <span className="text-xs font-semibold uppercase tracking-wide w-24 shrink-0 pt-0.5" style={{ color: "var(--color-grey-mid)" }}>{a.categoria}</span>
              <div className="flex-1 min-w-0">
                <a href={`/api/drive-file/${a.driveFileId}`} target="_blank" rel="noreferrer" className="text-sm font-medium underline break-all">{a.nomeFile}</a>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
                  {[a.caricatoDa, fmt(a.creatoIl), a.specificaId && titoli.get(a.specificaId) && `Voce: ${titoli.get(a.specificaId)}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              {canEdit && <button type="button" className="text-xs underline" style={{ color: "#991B1B" }} onClick={() => elimina(a)}>Elimina</button>}
            </div>
          ))}
        </div>
      )}
      {errore && <p className="text-xs" style={{ color: "#991B1B" }}>{errore}</p>}
    </div>
  );
}
