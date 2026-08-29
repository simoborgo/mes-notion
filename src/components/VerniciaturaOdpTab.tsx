"use client";

import { useEffect, useState } from "react";
import type { Scheda, SchedaVerniciatura, StatoSchedaVerniciatura, Vernice } from "@/lib/types";
import { MODIFICA_SCHEDA_ROLES, type Role } from "@/lib/roles";
import BadgeStato from "./BadgeStato";
import SchedaVerniciaturaAutocomplete from "./SchedaVerniciaturaAutocomplete";

const STATO_LABEL: Record<StatoSchedaVerniciatura, string> = { bozza: "Bozza", in_revisione: "In revisione", approvato: "Approvato", rifiutato: "Rifiutato" };

interface Props {
  scheda: Scheda;
  userRole?: Role;
  onSchedaAggiornata?: (updated: Scheda) => void;
}

function verniceLabel(v: Vernice | undefined, verniceId: string): string {
  if (!v) return verniceId;
  const parti = [v.coloreCodice, v.descrizioneColore, v.tipologia, v.codiceInventario ? `#${v.codiceInventario}` : null];
  return parti.filter(Boolean).join(" · ");
}

function Riepilogo({ s, vernici }: { s: SchedaVerniciatura; vernici: Vernice[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-sm">{s.nome || s.codicePubblico || `Scheda v${s.versione}`}</span>
        <BadgeStato stato={STATO_LABEL[s.stato]} />
        <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>v{s.versione}</span>
      </div>
      <div className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
        {s.cliente || "— nessun cliente —"}{s.codicePubblico && ` · ${s.codicePubblico}`}
        {s.essenza && ` · ${s.essenza}`}
      </div>
      {s.fasi && s.fasi.length > 0 && (
        <div className="space-y-1">
          {s.fasi.map((f) => {
            const principale = f.prodotti.find((p) => p.ruoloInFase === "vernice");
            const v = principale ? vernici.find((x) => x.id === principale.verniceId) : undefined;
            return (
              <div key={f.id} className="text-xs">
                <span style={{ color: "var(--color-grey-mid)" }}>#{f.ordine} {f.nomeFase || ""}: </span>
                {principale ? verniceLabel(v, principale.verniceId) : "—"}
              </div>
            );
          })}
        </div>
      )}
      {s.foto && s.foto.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {s.foto.map((f) => (
            <a key={f.id} href={`/api/drive-file/${f.driveFileId}`} target="_blank" rel="noreferrer">
              <img src={`/api/drive-file/${f.driveFileId}`} alt={f.nomeFile ?? "foto campione"} className="rounded border object-cover" style={{ width: 64, height: 64, borderColor: "#E4E0DA" }} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// Collega (1:N) l'ODP a una Scheda di Verniciatura esistente — "quale ricetta è stata usata per
// questo ODP". Sola presenza informativa lato Verniciatura: la sezione "Usata in questi ODP" nella
// SchedaVerniciaturaModal legge questo stesso legame in sola lettura.
export default function VerniciaturaOdpTab({ scheda, userRole, onSchedaAggiornata }: Props) {
  const canEdit = !!userRole && MODIFICA_SCHEDA_ROLES.includes(userRole);
  const [collegata, setCollegata] = useState<SchedaVerniciatura | null>(null);
  const [loading, setLoading] = useState(!!scheda.schedaVerniciaturaId);
  const [schedeList, setSchedeList] = useState<SchedaVerniciatura[]>([]);
  const [vernici, setVernici] = useState<Vernice[]>([]);
  const [candidata, setCandidata] = useState<SchedaVerniciatura | null>(null);
  const [caricandoCandidata, setCaricandoCandidata] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!scheda.schedaVerniciaturaId) { setCollegata(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/verniciatura/schede/${scheda.schedaVerniciaturaId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setCollegata(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scheda.schedaVerniciaturaId]);

  // Solo le schede APPROVATE dello stesso cliente dell'ODP (via Commessa) — riusare una ricetta
  // ancora in bozza/in revisione o rifiutata non ha senso in produzione. Se l'ODP non ha una
  // commessa collegata (o la commessa non ha un cliente), si ripiega su tutte le approvate.
  useEffect(() => {
    if (!canEdit || scheda.schedaVerniciaturaId) return;
    let cancelled = false;
    async function carica() {
      let cliente: string | null = null;
      if (scheda.commessaId) {
        try {
          const res = await fetch(`/api/commesse/${scheda.commessaId}`);
          if (res.ok) {
            const data = await res.json();
            cliente = data?.commessa?.cliente || null;
          }
        } catch {
          // ignora: si ripiega su nessun filtro cliente
        }
      }
      try {
        const res = await fetch("/api/verniciatura/schede?stato=approvato");
        const tutte: SchedaVerniciatura[] = res.ok ? await res.json() : [];
        const filtrate = cliente
          ? tutte.filter((s) => s.cliente && s.cliente.toLowerCase() === cliente!.toLowerCase())
          : tutte;
        if (!cancelled) setSchedeList(filtrate);
      } catch {
        // lista vuota, l'utente vede "nessuna scheda trovata" nell'autocomplete
      }
    }
    carica();
    return () => { cancelled = true; };
  }, [canEdit, scheda.schedaVerniciaturaId, scheda.commessaId]);

  useEffect(() => {
    if (!canEdit || scheda.schedaVerniciaturaId) return;
    fetch("/api/verniciatura/vernici?includeInattivi=true").then((r) => r.json()).then((v) => Array.isArray(v) && setVernici(v)).catch(() => {});
  }, [canEdit, scheda.schedaVerniciaturaId]);

  async function selezionaCandidata(id: string | null) {
    if (!id) { setCandidata(null); return; }
    setCaricandoCandidata(true);
    setError("");
    try {
      const res = await fetch(`/api/verniciatura/schede/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setCandidata(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento scheda");
    } finally {
      setCaricandoCandidata(false);
    }
  }

  async function collega(schedaVerniciaturaId: string | null) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/schede/${scheda.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedaVerniciaturaId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setCandidata(null);
      onSchedaAggiornata?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore aggiornamento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
        Ricetta di verniciatura (fasi/vernici/colore) usata per questo ODP.
      </p>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>
      ) : collegata ? (
        <div className="rounded-lg px-3 py-2.5 space-y-3" style={{ background: "#f8f7f5", border: "1px solid #ebe9e5" }}>
          <Riepilogo s={collegata} vernici={vernici} />
          {canEdit && (
            <button
              onClick={() => collega(null)}
              disabled={saving}
              className="text-xs px-2.5 py-1.5 rounded border disabled:opacity-50"
              style={{ color: "#991B1B", borderColor: "#FCA5A5" }}
            >
              {saving ? "…" : "Scollega"}
            </button>
          )}
        </div>
      ) : canEdit ? (
        candidata ? (
          <div className="rounded-lg px-3 py-2.5 space-y-3" style={{ background: "#faf9f7", border: "1px solid var(--color-primary)" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Confermi questa scheda?</p>
            <Riepilogo s={candidata} vernici={vernici} />
            <div className="flex gap-2">
              <button
                onClick={() => collega(candidata.id)}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded font-semibold text-white disabled:opacity-50"
                style={{ background: "#166534" }}
              >
                {saving ? "Collego…" : "Conferma collegamento"}
              </button>
              <button
                onClick={() => setCandidata(null)}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded border disabled:opacity-50"
                style={{ color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
              >
                Annulla
              </button>
            </div>
          </div>
        ) : caricandoCandidata ? (
          <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>
        ) : (
          <SchedaVerniciaturaAutocomplete schedeList={schedeList} value={null} onChange={selezionaCandidata} placeholder="Cerca tra le schede approvate…" />
        )
      ) : (
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessuna scheda di verniciatura collegata.</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
