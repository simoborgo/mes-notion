"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatoApprovvigionamentoKit } from "@/lib/types";

export const STATO_APPROVVIGIONAMENTO_LABEL: Record<StatoApprovvigionamentoKit, string> = {
  ordinato: "Ordinato",
  consegna_parziale: "Consegna parziale",
  attesa_fornitore: "In attesa risposta fornitore",
};

// Azioni del magazziniere su una riga del Kit Ferramenta ODP, nel Foglio di Scarico: segnalare lo
// stato di approvvigionamento, marcare "non serve", correggere quantità/descrizione, eliminare.
// Scarica/Preparato restano nei componenti esistenti: qui solo ciò che non è movimento di magazzino.
export default function RigaKitAzioni({ schedaId, rigaId, quantita, descrizione, testoLibero, stato, inArrivoIl, nonNecessaria, preparato, scaricato }: {
  schedaId: string;
  rigaId: string;
  quantita: number;
  descrizione: string;
  testoLibero: boolean;
  stato: StatoApprovvigionamentoKit | null;
  inArrivoIl: string | null;
  nonNecessaria: boolean;
  preparato: boolean; // già preparato: restano solo le azioni di annullamento ("Non serve")
  scaricato: number; // pezzi già scaricati per questo ODP (da ricaricare se "Non serve")
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [modifica, setModifica] = useState(false);
  const [qta, setQta] = useState(String(quantita));
  const [desc, setDesc] = useState(descrizione);
  const [data, setData] = useState(inArrivoIl ?? "");
  const [statoSel, setStatoSel] = useState<string>(stato ?? "");

  const base = `/api/ferramenta/kit/${schedaId}/righe/${rigaId}`;

  async function chiama(url: string, method: string, body?: unknown) {
    setSaving(true);
    setErrore(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Errore ${res.status}`);
      router.refresh();
      return true;
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore salvataggio");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function salvaStato(nuovo: string, dataArrivo: string) {
    if (nuovo === "ordinato" && !dataArrivo) return; // attende la data prima di salvare
    void chiama(`${base}/stato`, "PATCH", { stato: nuovo || null, inArrivoIl: nuovo === "ordinato" ? dataArrivo : null });
  }

  async function salvaModifica() {
    const q = Number(qta);
    if (!(q > 0)) { setErrore("Quantità non valida"); return; }
    const body: { quantita: number; descrizione?: string } = { quantita: q };
    if (testoLibero) {
      if (!desc.trim()) { setErrore("Descrizione obbligatoria"); return; }
      body.descrizione = desc.trim();
    }
    if (await chiama(base, "PATCH", body)) setModifica(false);
  }

  function elimina() {
    if (!confirm(`Eliminare "${descrizione}" dalla distinta del kit?`)) return;
    void chiama(base, "DELETE");
  }

  const btn = "text-xs px-2.5 py-1 rounded-lg font-semibold border whitespace-nowrap disabled:opacity-60";
  const grigio = { color: "var(--color-grey-mid)", borderColor: "#d1d5db", background: "white" };
  const inputCls = "border rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="flex flex-col items-end gap-1.5">
      {!nonNecessaria && !preparato && (
        <div className="flex items-center gap-1 flex-wrap justify-end">
          <select
            className={inputCls}
            value={statoSel}
            disabled={saving}
            onChange={(e) => { setStatoSel(e.target.value); salvaStato(e.target.value, data); }}
          >
            <option value="">Stato: nessuno</option>
            {(Object.keys(STATO_APPROVVIGIONAMENTO_LABEL) as StatoApprovvigionamentoKit[]).map(k => (
              <option key={k} value={k}>{STATO_APPROVVIGIONAMENTO_LABEL[k]}</option>
            ))}
          </select>
          {statoSel === "ordinato" && (
            <input
              type="date"
              className={inputCls}
              value={data}
              disabled={saving}
              onChange={(e) => { setData(e.target.value); salvaStato("ordinato", e.target.value); }}
            />
          )}
        </div>
      )}

      {modifica && !preparato ? (
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {testoLibero && (
            <input className={inputCls + " w-44"} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrizione" />
          )}
          <input type="number" min="0" step="any" className={inputCls + " w-20"} value={qta} onChange={(e) => setQta(e.target.value)} />
          <button type="button" onClick={salvaModifica} disabled={saving} className={btn} style={{ color: "white", background: "var(--color-primary)", borderColor: "var(--color-primary)" }}>
            {saving ? "…" : "Salva"}
          </button>
          <button type="button" onClick={() => { setModifica(false); setQta(String(quantita)); setDesc(descrizione); setErrore(null); }} className={btn} style={grigio}>Annulla</button>
        </div>
      ) : (
        <div className="flex items-center gap-1 flex-wrap justify-end">
          <button
            type="button"
            disabled={saving}
            title={nonNecessaria ? undefined : "Ricarica a magazzino"}
            onClick={() => {
              if (!nonNecessaria && scaricato > 0 && !confirm(`Segnare "${descrizione}" come non necessario? ${scaricato} pz già scaricati verranno ricaricati a magazzino.`)) return;
              void chiama(`${base}/non-necessaria`, "PATCH", { nonNecessaria: !nonNecessaria });
            }}
            className={btn}
            style={nonNecessaria ? { color: "#374151", background: "#F3F4F6", borderColor: "#9CA3AF" } : grigio}
          >
            {nonNecessaria ? "↺ Serve" : "Non serve più"}
          </button>
          {!preparato && (
            <>
              <button type="button" disabled={saving} onClick={() => setModifica(true)} className={btn} style={grigio}>Modifica</button>
              <button type="button" disabled={saving} onClick={elimina} className={btn} style={{ color: "#991B1B", borderColor: "#FCA5A5", background: "white" }}>Elimina</button>
            </>
          )}
        </div>
      )}
      {errore && <p className="text-xs" style={{ color: "#991B1B" }}>{errore}</p>}
    </div>
  );
}
