"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DISTINTA_ATTIVA_KEY } from "./ScaricoGate";
import type { DistintaScarico, DistintaScaricoRiga } from "@/lib/distinteScaricoRepository";
import type { ArticoloFerramenta } from "@/lib/types";
import ArticoloAutocomplete from "./ArticoloAutocomplete";

export default function DettaglioDistintaScarico({
  distinta, righeIniziali, puoChiudere = true, articoli = [],
}: {
  distinta: DistintaScarico;
  righeIniziali: DistintaScaricoRiga[];
  // false per ufficio_tecnico: può creare/modificare righe ma non chiudere/scaricare —
  // quell'azione resta esclusiva di chi ha davvero accesso a Ferramenta.
  puoChiudere?: boolean;
  // Per inserire la lista a mano (es. da un Excel dell'Ufficio Tecnico) invece di doverla
  // scoprire scansionando i QR in magazzino — le due modalità convivono, non si escludono.
  articoli?: ArticoloFerramenta[];
}) {
  const router = useRouter();
  const [righe, setRighe] = useState(righeIniziali);
  const [raccogliendo, setRaccogliendo] = useState(false);
  const [chiudendo, setChiudendo] = useState(false);
  const [errore, setErrore] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [chiusa, setChiusa] = useState(distinta.stato !== "aperta");
  const [articoloId, setArticoloId] = useState<string | null>(null);
  const [quantita, setQuantita] = useState("");
  const [aggiungendo, setAggiungendo] = useState(false);
  const [erroreRiga, setErroreRiga] = useState("");
  const [confermaStato, setConfermaStato] = useState<"idle" | "loading" | "done" | "error">(distinta.confermataIl ? "done" : "idle");
  const [confermaErrore, setConfermaErrore] = useState("");

  async function conferma() {
    if (righe.length === 0) { setConfermaErrore("Aggiungi almeno una riga prima di confermare"); return; }
    setConfermaStato("loading");
    setConfermaErrore("");
    try {
      const res = await fetch(`/api/ferramenta/distinte-scarico/${distinta.id}/conferma`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(data?.error ?? `Errore ${res.status}`);
      setConfermaStato("done");
    } catch (e) {
      setConfermaStato("error");
      setConfermaErrore(e instanceof Error ? e.message : "Errore conferma");
    }
  }

  async function aggiungiRiga() {
    const q = Number(quantita);
    if (!articoloId) { setErroreRiga("Seleziona un articolo"); return; }
    if (!(q > 0)) { setErroreRiga("Quantità non valida"); return; }
    setAggiungendo(true);
    setErroreRiga("");
    try {
      const res = await fetch(`/api/ferramenta/distinte-scarico/${distinta.id}/righe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articoloId, quantita: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setRighe(prev => [...prev, data]);
      setArticoloId(null);
      setQuantita("");
    } catch (e) {
      setErroreRiga(e instanceof Error ? e.message : "Errore aggiunta riga");
    } finally {
      setAggiungendo(false);
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISTINTA_ATTIVA_KEY);
      if (raw) {
        const attiva = JSON.parse(raw);
        setRaccogliendo(attiva?.id === distinta.id);
      }
    } catch { /* ignora storage corrotto */ }
  }, [distinta.id]);

  function iniziaRaccolta() {
    localStorage.setItem(DISTINTA_ATTIVA_KEY, JSON.stringify({ id: distinta.id, odpLabel: distinta.odpLabel }));
    setRaccogliendo(true);
  }

  function terminaRaccolta() {
    localStorage.removeItem(DISTINTA_ATTIVA_KEY);
    setRaccogliendo(false);
    router.refresh();
  }

  async function rimuoviRiga(rigaId: string) {
    setRighe(prev => prev.filter(r => r.id !== rigaId));
    try {
      await fetch(`/api/ferramenta/distinte-scarico/${distinta.id}/righe/${rigaId}`, { method: "DELETE" });
    } catch {
      // riallineamento silenzioso non critico: la riga tornerà al prossimo refresh se la DELETE fosse fallita
    }
  }

  async function chiudi() {
    if (righe.length === 0) { setErrore("Aggiungi almeno una riga prima di chiudere"); return; }
    if (!confirm(`Chiudere la distinta e scaricare ${righe.length} articol${righe.length === 1 ? "o" : "i"} dal magazzino?`)) return;
    setChiudendo(true);
    setErrore("");
    try {
      const res = await fetch(`/api/ferramenta/distinte-scarico/${distinta.id}/chiudi`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(data?.error ?? `Errore ${res.status}`);
      if (data.warnings?.length) setWarnings(data.warnings);
      localStorage.removeItem(DISTINTA_ATTIVA_KEY);
      setRaccogliendo(false);
      setChiusa(true);
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore chiusura distinta");
    } finally {
      setChiudendo(false);
    }
  }

  const totale = righe.reduce((s, r) => s + r.quantita, 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="font-bold text-lg" style={{ color: "var(--color-black)" }}>
          {distinta.odpLabel || distinta.commessaLabel || "Distinta libera"}
        </p>
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
          Aperta da {distinta.apertaDa} · {chiusa ? "Chiusa" : "Aperta"}
        </p>
      </div>

      {!chiusa && (
        raccogliendo ? (
          <div className="rounded-xl border-2 p-4 space-y-2" style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}>
            <p className="text-sm font-semibold" style={{ color: "#14532D" }}>📋 Modalità raccolta attiva</p>
            <p className="text-xs" style={{ color: "#166534" }}>
              Scansiona i QR degli articoli con questo stesso dispositivo — torneranno automaticamente in questa lista.
            </p>
            <button
              onClick={terminaRaccolta}
              className="w-full py-2.5 rounded-lg text-sm font-semibold border"
              style={{ borderColor: "#86EFAC", color: "#166534", background: "white" }}
            >
              Termina raccolta
            </button>
          </div>
        ) : (
          <button
            onClick={iniziaRaccolta}
            className="w-full py-3 rounded-xl text-sm font-bold text-white"
            style={{ background: "var(--color-primary)" }}
          >
            Inizia a raccogliere
          </button>
        )
      )}

      {!chiusa && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>Aggiungi articolo alla lista</h3>
          <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
            Per inserire direttamente una lista già nota (es. da un file dell&apos;Ufficio Tecnico), invece di scansionare i QR in magazzino.
          </p>
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <ArticoloAutocomplete articoli={articoli} value={articoloId} onChange={setArticoloId} placeholder="Cerca articolo…" />
            </div>
            <input
              type="number" min="0" step="any"
              className="rounded-lg border px-3 text-sm"
              style={{ width: 90, height: 48, borderColor: "#d1d5db" }}
              placeholder="Q.tà"
              value={quantita}
              onChange={(e) => setQuantita(e.target.value)}
            />
            <button
              onClick={aggiungiRiga}
              disabled={aggiungendo}
              className="px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ height: 48, background: "var(--color-primary)" }}
            >
              {aggiungendo ? "…" : "+ Aggiungi"}
            </button>
          </div>
          {erroreRiga && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{erroreRiga}</p>}
        </div>
      )}

      <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "#e5e4e0", background: "white" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>Articoli nella lista</h3>
          <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{righe.length} righe · {totale} pz totali</span>
        </div>
        {righe.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--color-grey-mid)" }}>Nessun articolo ancora nella lista</p>
        ) : (
          <div className="space-y-2">
            {righe.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "#F5F2EE" }}>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm">{r.articoloDescrizione}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--color-grey-mid)" }}>{r.articoloCodiceOs1}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums">{r.quantita}</span>
                {!chiusa && (
                  <button onClick={() => rimuoviRiga(r.id)} className="text-gray-400 hover:text-gray-600 text-base leading-none px-1">×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {errore && (
        <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
          <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{errore}</p>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-lg px-4 py-3 space-y-1" style={{ background: "#FFFBEB", border: "1px solid #FCD34D" }}>
          <p className="text-xs font-semibold" style={{ color: "#92400E" }}>⚠ Scaricata, ma:</p>
          {warnings.map((w, i) => <p key={i} className="text-xs" style={{ color: "#92400E" }}>{w}</p>)}
        </div>
      )}

      {confermaStato === "done" ? (
        <div className="rounded-xl border-2 p-4 flex items-center gap-3" style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}>
          <span className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: "#D1FAE5" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-sm" style={{ color: "#14532D" }}>Lista confermata</p>
            <p className="text-xs mt-0.5" style={{ color: "#166534" }}>Il magazziniere è stato notificato</p>
          </div>
        </div>
      ) : !chiusa && (
        <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
          {confermaErrore && (
            <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
              <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{confermaErrore}</p>
            </div>
          )}
          <button
            onClick={conferma}
            disabled={confermaStato === "loading" || righe.length === 0}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: "#166534" }}
          >
            {confermaStato === "loading" && (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {confermaStato === "loading" ? "Conferma in corso…" : "✓ Conferma e notifica magazziniere"}
          </button>
        </div>
      )}

      {chiusa ? (
        <div className="rounded-xl border-2 p-4 flex items-center gap-3" style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}>
          <span className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: "#D1FAE5" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-sm" style={{ color: "#14532D" }}>Distinta chiusa</p>
            <p className="text-xs mt-0.5" style={{ color: "#166534" }}>Magazzino scaricato per tutti gli articoli</p>
          </div>
        </div>
      ) : puoChiudere ? (
        <button
          onClick={chiudi}
          disabled={chiudendo || righe.length === 0}
          className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
          style={{ background: "#166534" }}
        >
          {chiudendo ? "Chiusura in corso…" : "Chiudi distinta e scarica dal magazzino"}
        </button>
      ) : (
        <p className="text-xs text-center" style={{ color: "var(--color-grey-mid)" }}>
          La chiusura (scarico dal magazzino) è riservata al magazziniere.
        </p>
      )}
    </div>
  );
}
