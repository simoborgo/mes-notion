"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommessaSpecifica, CommessaAllegato, CategoriaAllegato, StatoSpecifica, TipoSpecifica } from "@/lib/types";
import { TIPI_SPECIFICA, STATI_SPECIFICA } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import AllegatiUpload from "./AllegatiUpload";

const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";
const STATO_BADGE: Record<StatoSpecifica, string> = { "Da confermare": "Bozza", Confermata: "Approvato", Nota: "In attesa" };

interface Bozza { id?: string; tipo: TipoSpecifica; titolo: string; descrizione: string; stato: StatoSpecifica }
// Categoria di default del file caricato da una voce, in base al tipo.
const CATEGORIA_PER_TIPO: Record<TipoSpecifica, CategoriaAllegato> = { Finitura: "Scheda tecnica", Materiale: "Scheda tecnica", Ignifugo: "Certificato", Altro: "Altro" };
const VUOTA: Bozza = { tipo: "Finitura", titolo: "", descrizione: "", stato: "Da confermare" };

export default function CommessaSpecifiche({ commessaId, specifiche, allegati, canEdit }: { commessaId: string; specifiche: CommessaSpecifica[]; allegati: CommessaAllegato[]; canEdit: boolean }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<TipoSpecifica | "">("");
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState("");

  const visibili = useMemo(() => specifiche.filter((s) => !filtro || s.tipo === filtro), [specifiche, filtro]);

  async function salva() {
    if (!bozza) return;
    if (!bozza.titolo.trim()) { setErrore("Il titolo è obbligatorio"); return; }
    setSaving(true); setErrore("");
    try {
      const base = `/api/commesse/${commessaId}/specifiche`;
      const res = await fetch(bozza.id ? `${base}/${bozza.id}` : base, {
        method: bozza.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: bozza.tipo, titolo: bozza.titolo, descrizione: bozza.descrizione, stato: bozza.stato }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Errore nel salvataggio");
      setBozza(null);
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function elimina(s: CommessaSpecifica) {
    if (!window.confirm(`Eliminare "${s.titolo}"?`)) return;
    const res = await fetch(`/api/commesse/${commessaId}/specifiche/${s.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else setErrore("Errore nell'eliminazione");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {(["", ...TIPI_SPECIFICA] as const).map((t) => (
            <button
              key={t || "tutte"}
              type="button"
              onClick={() => setFiltro(t)}
              className="text-xs rounded-full border px-3 py-1"
              style={filtro === t ? { background: "var(--color-black)", color: "#fff", borderColor: "var(--color-black)" } : { background: "#fff", color: "var(--color-grey-mid)", borderColor: "#E4E0DA" }}
            >
              {t || "Tutte"}
            </button>
          ))}
        </div>
        {canEdit && !bozza && (
          <button type="button" onClick={() => setBozza(VUOTA)} className="text-sm font-semibold rounded px-3 py-1.5" style={{ background: "var(--color-primary)", color: "var(--color-black)" }}>
            + Aggiungi voce
          </button>
        )}
      </div>

      {bozza && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs space-y-1 block">
              <span style={{ color: "var(--color-grey-mid)" }}>Tipo</span>
              <select className={`${inputCls} w-full`} value={bozza.tipo} onChange={(e) => setBozza({ ...bozza, tipo: e.target.value as TipoSpecifica })}>
                {TIPI_SPECIFICA.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-xs space-y-1 block sm:col-span-2">
              <span style={{ color: "var(--color-grey-mid)" }}>Titolo</span>
              <input className={`${inputCls} w-full`} value={bozza.titolo} onChange={(e) => setBozza({ ...bozza, titolo: e.target.value })} placeholder="Es. Rovere spazzolato, verniciato naturale opaco" />
            </label>
          </div>
          <label className="text-xs space-y-1 block">
            <span style={{ color: "var(--color-grey-mid)" }}>Descrizione</span>
            <textarea className={`${inputCls} w-full`} rows={2} value={bozza.descrizione} onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })} />
          </label>
          <label className="text-xs space-y-1 block max-w-xs">
            <span style={{ color: "var(--color-grey-mid)" }}>Stato</span>
            <select className={`${inputCls} w-full`} value={bozza.stato} onChange={(e) => setBozza({ ...bozza, stato: e.target.value as StatoSpecifica })}>
              {STATI_SPECIFICA.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          {errore && <p className="text-xs" style={{ color: "#991B1B" }}>{errore}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={salva} disabled={saving} className="text-sm font-semibold rounded px-3 py-1.5 disabled:opacity-50" style={{ background: "var(--color-primary)", color: "var(--color-black)" }}>
              {saving ? "Salvo…" : "Salva"}
            </button>
            <button type="button" onClick={() => { setBozza(null); setErrore(""); }} className="text-sm rounded border px-3 py-1.5" style={{ borderColor: "#E4E0DA" }}>Annulla</button>
          </div>
        </div>
      )}

      {visibili.length === 0 && !bozza ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm" style={{ color: "var(--color-grey-mid)" }}>
          {specifiche.length === 0
            ? "Nessuna specifica. Aggiungi finiture, materiali e requisiti ignifughi concordati per questa commessa."
            : "Nessuna voce di questo tipo."}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          {visibili.map((s) => (
            <div key={s.id} className="flex items-start gap-3 p-4">
              <span className="text-xs font-semibold uppercase tracking-wide w-20 shrink-0 pt-0.5" style={{ color: "var(--color-grey-mid)" }}>{s.tipo}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{s.titolo}</p>
                {s.descrizione && <p className="text-sm mt-0.5 whitespace-pre-line" style={{ color: "var(--color-grey-mid)" }}>{s.descrizione}</p>}
                {allegati.some((a) => a.specificaId === s.id) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {allegati.filter((a) => a.specificaId === s.id).map((a) => (
                      <a key={a.id} href={`/api/drive-file/${a.driveFileId}`} target="_blank" rel="noreferrer" className="text-xs rounded border px-2 py-0.5 underline" style={{ borderColor: "#E4E0DA", background: "#F5F2EE" }}>{a.nomeFile}</a>
                    ))}
                  </div>
                )}
                {canEdit && (
                  <div className="flex gap-3 mt-1.5 text-xs items-center">
                    <AllegatiUpload commessaId={commessaId} specificaId={s.id} categoria={CATEGORIA_PER_TIPO[s.tipo]} label="+ Allega file" />
                    <button type="button" className="underline" style={{ color: "var(--color-primary)" }} onClick={() => setBozza({ id: s.id, tipo: s.tipo, titolo: s.titolo, descrizione: s.descrizione, stato: s.stato })}>Modifica</button>
                    <button type="button" className="underline" style={{ color: "#991B1B" }} onClick={() => elimina(s)}>Elimina</button>
                  </div>
                )}
              </div>
              <BadgeStato stato={STATO_BADGE[s.stato]} />
            </div>
          ))}
        </div>
      )}
      {!bozza && errore && <p className="text-xs" style={{ color: "#991B1B" }}>{errore}</p>}
    </div>
  );
}
