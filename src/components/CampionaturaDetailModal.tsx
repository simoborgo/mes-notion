"use client";

import { useRef, useState } from "react";
import type { Campionatura, EsitoCampionatura } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import CicloModal from "./CicloModal";

const ESITO_LABEL: Record<EsitoCampionatura, string> = { approvato: "Approvato", rifiutato: "Rifiutato", in_revisione: "In revisione" };

export default function CampionaturaDetailModal({
  campionatura: initial,
  onClose,
  onAggiornata,
}: {
  campionatura: Campionatura;
  onClose: () => void;
  onAggiornata: (c: Campionatura) => void;
}) {
  const [campionatura, setCampionatura] = useState(initial);
  const [cambiandoEsito, setCambiandoEsito] = useState(false);
  const [warningsCiclo, setWarningsCiclo] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [cicloModaleAperto, setCicloModaleAperto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function impostaEsito(esito: EsitoCampionatura) {
    if (esito === "approvato" && !confirm("Approvare questa campionatura? Il ciclo collegato verrà validato automaticamente (immutabile da qui in poi).")) return;
    setCambiandoEsito(true);
    setError("");
    setWarningsCiclo([]);
    try {
      const res = await fetch(`/api/verniciatura/campionature/${campionatura.id}/esito`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ esito }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setCampionatura(data.campionatura);
      setWarningsCiclo(data.warningsCiclo ?? []);
      onAggiornata(data.campionatura);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore aggiornamento esito");
    } finally {
      setCambiandoEsito(false);
    }
  }

  async function caricaFoto(file: File) {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("foto", file);
      const res = await fetch(`/api/verniciatura/campionature/${campionatura.id}/foto`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setCampionatura(data);
      onAggiornata(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore upload foto");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]" style={{ borderRadius: "var(--radius-modal)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-start justify-between" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(219,39,119,0.06))" }}>
          <div>
            <h2 className="font-semibold text-base font-mono">{campionatura.codicePubblico}</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{campionatura.cliente} · {new Date(campionatura.dataCampionatura).toLocaleDateString("it-IT")}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Esito:</span>
            <BadgeStato stato={ESITO_LABEL[campionatura.esito]} />
          </div>

          <div className="flex flex-wrap gap-2">
            {(["approvato", "rifiutato", "in_revisione"] as EsitoCampionatura[]).map((e) => (
              <button
                key={e}
                onClick={() => impostaEsito(e)}
                disabled={cambiandoEsito || campionatura.esito === e}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-40 transition-colors"
                style={campionatura.esito === e ? { background: "var(--color-primary)", color: "white", borderColor: "var(--color-primary)" } : { background: "white", color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
              >
                {ESITO_LABEL[e]}
              </button>
            ))}
          </div>

          {warningsCiclo.length > 0 && (
            <div className="rounded-lg border p-3 space-y-1" style={{ background: "#FEF3C7", borderColor: "#FCD34D" }}>
              <p className="text-xs font-semibold" style={{ color: "#92400E" }}>Ciclo validato con avvisi (non bloccanti):</p>
              {warningsCiclo.map((w, i) => <p key={i} className="text-xs" style={{ color: "#92400E" }}>· {w}</p>)}
            </div>
          )}

          {campionatura.esito === "approvato" && (
            <button
              onClick={() => setCicloModaleAperto(true)}
              className="w-full px-4 py-2 text-sm rounded font-medium text-white"
              style={{ background: "linear-gradient(135deg, #7C3AED, #DB2777)", borderRadius: "var(--radius-button)" }}
            >
              Modifica scheda di verniciatura collegata
            </button>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Foto ({campionatura.foto?.length ?? 0})</p>
            <div className="flex flex-wrap gap-2">
              {(campionatura.foto ?? []).map((f) => (
                <a key={f.id} href={`https://drive.google.com/file/d/${f.driveFileId}/view`} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 rounded border underline" style={{ borderColor: "#E4E0DA", color: "var(--color-primary)" }}>
                  {f.nomeFile || "foto"}
                </a>
              ))}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) caricaFoto(f); }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="text-xs underline disabled:opacity-50" style={{ color: "var(--color-primary)" }}>
              {uploading ? "Carico…" : "+ Carica foto"}
            </button>
          </div>

          {campionatura.codiceCampioneMaterialista && (
            <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Cod. campione materialista: {campionatura.codiceCampioneMaterialista}</p>
          )}
          {campionatura.note && <p className="text-sm">{campionatura.note}</p>}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end pt-2 border-t" style={{ borderColor: "#E4E0DA" }}>
            <button onClick={onClose} className="px-4 py-2 text-sm rounded border font-medium hover:bg-gray-50 transition-colors">Chiudi</button>
          </div>
        </div>
      </div>

      {cicloModaleAperto && (
        <CicloModal cicloId={campionatura.cicloId} onClose={() => setCicloModaleAperto(false)} onSaved={() => {}} />
      )}
    </div>
  );
}
