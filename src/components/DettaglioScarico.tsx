"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SCARICO_ATTIVO_KEY } from "./ScaricoGate";
import type { Scarico, ScaricoRiga } from "@/lib/scaricoRepository";

export default function DettaglioScarico({
  scarico, righeIniziali,
}: {
  scarico: Scarico;
  righeIniziali: ScaricoRiga[];
}) {
  const router = useRouter();
  const [righe, setRighe] = useState(righeIniziali);
  const [raccogliendo, setRaccogliendo] = useState(false);
  const [chiudendo, setChiudendo] = useState(false);
  const [annullando, setAnnullando] = useState(false);
  const [errore, setErrore] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [chiusa, setChiusa] = useState(scarico.stato !== "aperta");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SCARICO_ATTIVO_KEY);
      if (raw) {
        const attivo = JSON.parse(raw);
        setRaccogliendo(attivo?.id === scarico.id);
      }
    } catch { /* ignora storage corrotto */ }
  }, [scarico.id]);

  function iniziaRaccolta() {
    localStorage.setItem(SCARICO_ATTIVO_KEY, JSON.stringify({ id: scarico.id, odpLabel: scarico.odpLabel }));
    setRaccogliendo(true);
  }

  function terminaRaccolta() {
    localStorage.removeItem(SCARICO_ATTIVO_KEY);
    setRaccogliendo(false);
    router.refresh();
  }

  async function rimuoviRiga(rigaId: string) {
    setRighe(prev => prev.filter(r => r.id !== rigaId));
    try {
      await fetch(`/api/ferramenta/scarichi/${scarico.id}/righe/${rigaId}`, { method: "DELETE" });
    } catch {
      // riallineamento silenzioso non critico: la riga tornerà al prossimo refresh se la DELETE fosse fallita
    }
  }

  async function chiudi() {
    if (righe.length === 0) { setErrore("Aggiungi almeno una riga prima di chiudere"); return; }
    if (!confirm(`Chiudere lo scarico e scaricare ${righe.length} articol${righe.length === 1 ? "o" : "i"} dal magazzino?`)) return;
    setChiudendo(true);
    setErrore("");
    try {
      const res = await fetch(`/api/ferramenta/scarichi/${scarico.id}/chiudi`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(data?.error ?? `Errore ${res.status}`);
      if (data.warnings?.length) setWarnings(data.warnings);
      localStorage.removeItem(SCARICO_ATTIVO_KEY);
      setRaccogliendo(false);
      setChiusa(true);
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore chiusura scarico");
    } finally {
      setChiudendo(false);
    }
  }

  async function annulla() {
    // Testo dell'alert calibrato sulla gravità reale: con righe già raccolte si perde lavoro di
    // raccolta fatto sul campo (le righe restano in DB ma diventano irraggiungibili dall'app, vedi
    // annullaScarico) — merita un avviso più forte di quando lo scarico è ancora vuoto.
    const messaggio = righe.length > 0
      ? `⚠ Annullare questo scarico con già ${righe.length} articol${righe.length === 1 ? "o" : "i"} raccolt${righe.length === 1 ? "o" : "i"}? Il lavoro di raccolta andrà perso e non sarà più visibile nell'app. Nessuna giacenza è stata toccata.`
      : "Annullare questo scarico vuoto? Nessuna giacenza verrà toccata.";
    if (!confirm(messaggio)) return;
    setAnnullando(true);
    setErrore("");
    try {
      const res = await fetch(`/api/ferramenta/scarichi/${scarico.id}/annulla`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      localStorage.removeItem(SCARICO_ATTIVO_KEY);
      router.push("/ferramenta/scarichi");
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore annullamento scarico");
      setAnnullando(false);
    }
  }

  const totale = righe.reduce((s, r) => s + r.quantita, 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="font-bold text-lg" style={{ color: "var(--color-black)" }}>
          {scarico.odpLabel || "Scarico libero"}
        </p>
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
          Aperto da {scarico.apertaDa} · {chiusa ? "Chiuso" : "Aperto"}
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
            style={{ background: "#DC2626" }}
          >
            Inizia a raccogliere
          </button>
        )
      )}

      <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "#e5e4e0", background: "white" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>Articoli raccolti</h3>
          <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{righe.length} righe · {totale} pz totali</span>
        </div>
        {righe.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--color-grey-mid)" }}>Nessun articolo ancora raccolto</p>
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

      {chiusa ? (
        <div className="rounded-xl border-2 p-4 flex items-center gap-3" style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}>
          <span className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: "#D1FAE5" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-sm" style={{ color: "#14532D" }}>Scarico chiuso</p>
            <p className="text-xs mt-0.5" style={{ color: "#166534" }}>Magazzino scaricato per tutti gli articoli</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={chiudi}
            disabled={chiudendo || righe.length === 0}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "#DC2626" }}
          >
            {chiudendo ? "Chiusura in corso…" : "Chiudi e scarica dal magazzino"}
          </button>
          <button
            onClick={annulla}
            disabled={annullando}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-60"
            style={{ borderColor: "#d1d5db", color: "var(--color-grey-mid)", background: "white" }}
          >
            {annullando ? "Annullamento…" : righe.length > 0 ? `Annulla scarico (${righe.length} già raccolt${righe.length === 1 ? "o" : "i"})` : "Annulla scarico vuoto"}
          </button>
        </div>
      )}
    </div>
  );
}
