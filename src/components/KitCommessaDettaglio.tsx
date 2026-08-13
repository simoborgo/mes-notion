"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KitCommessa, KitCommessaRiga } from "@/lib/kitCommessaRepository";
import type { ArticoloFerramenta } from "@/lib/types";
import ArticoloAutocomplete from "./ArticoloAutocomplete";

function fmt(d: string) {
  return new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function KitCommessaDettaglio({
  kit, righeIniziali, articoli, puoSpuntare,
}: {
  kit: KitCommessa;
  righeIniziali: KitCommessaRiga[];
  articoli: ArticoloFerramenta[];
  puoSpuntare: boolean;
}) {
  const router = useRouter();
  const [righe, setRighe] = useState(righeIniziali);
  const [chiuso, setChiuso] = useState(kit.stato === "chiuso");
  const [confermatoIl, setConfermatoIl] = useState(kit.confermatoIl);
  // true solo se la conferma è appena avvenuta in QUESTA sessione (non al caricamento pagina):
  // chi ha appena confermato/notificato resta sulla stessa schermata, ma non deve poter anche
  // spuntare/scaricare o chiudere nella stessa interazione — quello spetta al magazziniere in
  // una visita separata (che vedrà normalmente i controlli, perché qui parte sempre da false).
  const [appenaConfermato, setAppenaConfermato] = useState(false);
  const [pdfNome, setPdfNome] = useState(kit.pdfRiferimentoNome);
  const [pdfDriveId, setPdfDriveId] = useState(kit.pdfRiferimentoDriveFileId);

  const [modalitaLibera, setModalitaLibera] = useState(false);
  const [articoloId, setArticoloId] = useState<string | null>(null);
  const [descrizioneLibera, setDescrizioneLibera] = useState("");
  const [quantita, setQuantita] = useState("");
  const [aggiungendo, setAggiungendo] = useState(false);
  const [erroreRiga, setErroreRiga] = useState("");

  const [collegamenti, setCollegamenti] = useState<Record<string, string | null>>({});
  const [spuntando, setSpuntando] = useState<Record<string, boolean>>({});
  const [erroreSpunta, setErroreSpunta] = useState<Record<string, string>>({});
  const [warningsSpunta, setWarningsSpunta] = useState<string[]>([]);

  const [confermaStato, setConfermaStato] = useState<"idle" | "loading" | "error">("idle");
  const [confermaErrore, setConfermaErrore] = useState("");
  const [chiudendo, setChiudendo] = useState(false);
  const [erroreChiudi, setErroreChiudi] = useState("");
  const [annullando, setAnnullando] = useState(false);
  const [erroreAnnulla, setErroreAnnulla] = useState("");
  const [caricandoPdf, setCaricandoPdf] = useState(false);
  const [errorePdf, setErrorePdf] = useState("");

  async function aggiungiRiga() {
    const q = Number(quantita);
    if (modalitaLibera ? !descrizioneLibera.trim() : !articoloId) {
      setErroreRiga(modalitaLibera ? "Scrivi una descrizione" : "Seleziona un articolo");
      return;
    }
    if (!(q > 0)) { setErroreRiga("Quantità non valida"); return; }
    setAggiungendo(true);
    setErroreRiga("");
    try {
      const res = await fetch(`/api/ferramenta/kit-commessa/${kit.id}/righe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modalitaLibera ? { descrizione: descrizioneLibera, quantita: q } : { articoloId, quantita: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setRighe(prev => [...prev, data]);
      setArticoloId(null);
      setDescrizioneLibera("");
      setQuantita("");
    } catch (e) {
      setErroreRiga(e instanceof Error ? e.message : "Errore aggiunta riga");
    } finally {
      setAggiungendo(false);
    }
  }

  async function rimuoviRiga(rigaId: string) {
    setRighe(prev => prev.filter(r => r.id !== rigaId));
    try {
      await fetch(`/api/ferramenta/kit-commessa/${kit.id}/righe/${rigaId}`, { method: "DELETE" });
    } catch {
      // riallineamento silenzioso non critico
    }
  }

  async function spunta(rigaId: string, senzaCollegare: boolean) {
    setSpuntando(prev => ({ ...prev, [rigaId]: true }));
    setErroreSpunta(prev => ({ ...prev, [rigaId]: "" }));
    try {
      const articoloIdScelto = senzaCollegare ? null : (collegamenti[rigaId] ?? null);
      const res = await fetch(`/api/ferramenta/kit-commessa/${kit.id}/righe/${rigaId}/spunta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articoloId: articoloIdScelto }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(data?.error ?? `Errore ${res.status}`);
      setRighe(prev => prev.map(r => r.id === rigaId ? data.riga : r));
      if (data.warnings?.length) setWarningsSpunta(prev => [...prev, ...data.warnings]);
    } catch (e) {
      setErroreSpunta(prev => ({ ...prev, [rigaId]: e instanceof Error ? e.message : "Errore spunta" }));
    } finally {
      setSpuntando(prev => ({ ...prev, [rigaId]: false }));
    }
  }

  async function conferma() {
    if (righe.length === 0) { setConfermaErrore("Aggiungi almeno una riga prima di confermare"); return; }
    setConfermaStato("loading");
    setConfermaErrore("");
    try {
      const res = await fetch(`/api/ferramenta/kit-commessa/${kit.id}/conferma`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(data?.error ?? `Errore ${res.status}`);
      setConfermatoIl(new Date().toISOString());
      setAppenaConfermato(true);
      setConfermaStato("idle");
    } catch (e) {
      setConfermaStato("error");
      setConfermaErrore(e instanceof Error ? e.message : "Errore conferma");
    }
  }

  async function annullaBozza() {
    // A differenza dell'Annulla di uno Scarico, questo è sempre sicuro: il bottone compare solo
    // quando righe.length === 0, quindi non c'è mai lavoro da perdere (vedi eliminaKitCommessaVuoto).
    if (!confirm("Eliminare questa bozza vuota? Non contiene ancora righe, l'azione è sicura.")) return;
    setAnnullando(true);
    setErroreAnnulla("");
    try {
      const res = await fetch(`/api/ferramenta/kit-commessa/${kit.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      router.push("/ferramenta/kit-commessa");
    } catch (e) {
      setErroreAnnulla(e instanceof Error ? e.message : "Errore annullamento");
      setAnnullando(false);
    }
  }

  async function chiudi() {
    if (!confirm("Chiudere questo Kit Commessa?")) return;
    setChiudendo(true);
    setErroreChiudi("");
    try {
      const res = await fetch(`/api/ferramenta/kit-commessa/${kit.id}/chiudi`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setChiuso(true);
      router.refresh();
    } catch (e) {
      setErroreChiudi(e instanceof Error ? e.message : "Errore chiusura");
    } finally {
      setChiudendo(false);
    }
  }

  async function caricaPdf(file: File) {
    setCaricandoPdf(true);
    setErrorePdf("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/ferramenta/kit-commessa/${kit.id}/pdf-riferimento`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setPdfDriveId(data.driveFileId);
      setPdfNome(file.name);
    } catch (e) {
      setErrorePdf(e instanceof Error ? e.message : "Errore upload PDF");
    } finally {
      setCaricandoPdf(false);
    }
  }

  const daSpuntare = righe.filter(r => !r.spuntataIl).length;
  const totale = righe.reduce((s, r) => s + r.quantita, 0);
  // Due fasi mutuamente esclusive: mentre si inserisce (bozza) nessuna riga è spuntabile/
  // scaricabile, anche da chi avrebbe il permesso — evita che uno scarico parta prima che
  // l'Ufficio Tecnico abbia finito e confermato/notificato. Dopo la conferma la lista si
  // "congela" (niente più aggiunte/rimozioni) ed è il magazziniere a operare spuntando.
  const bozza = !confermatoIl && !chiuso;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-lg" style={{ color: "var(--color-black)" }}>{kit.commessaLabel || kit.commessaId}</p>
          <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
            Aperto da {kit.apertoDa} il {fmt(kit.apertoIl)} · {chiuso ? "Chiuso" : "Aperto"}
            {confermatoIl && " · Confermato"}
          </p>
        </div>
        {puoSpuntare && !!confermatoIl && righe.length > 0 && (
          <a
            href={`/api/ferramenta/kit-commessa/${kit.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            title="Stampa lista"
            className="flex items-center gap-1.5 rounded-lg border flex-shrink-0 text-xs font-semibold"
            style={{ height: 40, padding: "0 12px", borderColor: "#d1d5db", color: "var(--color-grey-mid)", background: "white" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Stampa Lista
          </a>
        )}
      </div>

      {/* PDF di riferimento */}
      <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "#e5e4e0", background: "white" }}>
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>PDF di riferimento</h3>
        <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Solo consultazione — nessuna riga viene estratta automaticamente da qui.</p>
        {pdfDriveId ? (
          <a
            href={`https://drive.google.com/file/d/${pdfDriveId}/view`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium"
            style={{ borderColor: "#FCA5A5", color: "#DC2626", background: "#FFF5F5" }}
          >
            📄 {pdfNome || "Apri PDF"}
          </a>
        ) : bozza && (
          <input type="file" accept="application/pdf" disabled={caricandoPdf} onChange={(e) => { const f = e.target.files?.[0]; if (f) caricaPdf(f); }} className="text-sm" />
        )}
        {errorePdf && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{errorePdf}</p>}
      </div>

      {/* Aggiungi riga — solo in fase di preparazione, prima della conferma */}
      {bozza && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>Aggiungi articolo</h3>

          <div className="flex gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={!modalitaLibera} onChange={() => setModalitaLibera(false)} className="accent-orange-500" />
              Articolo da anagrafica
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={modalitaLibera} onChange={() => setModalitaLibera(true)} className="accent-orange-500" />
              Testo libero
            </label>
          </div>
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              {modalitaLibera ? (
                <input
                  type="text"
                  className="w-full rounded-lg border px-3 text-sm"
                  style={{ height: 48, borderColor: "#d1d5db" }}
                  placeholder="Descrizione libera…"
                  value={descrizioneLibera}
                  onChange={(e) => setDescrizioneLibera(e.target.value)}
                />
              ) : (
                <ArticoloAutocomplete articoli={articoli} value={articoloId} onChange={setArticoloId} placeholder="Cerca articolo…" />
              )}
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

      {/* Righe */}
      <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "#e5e4e0", background: "white" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>Lista</h3>
          <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
            {righe.length - daSpuntare} / {righe.length} spuntate · {totale} pz totali
          </span>
        </div>
        {bozza && righe.length > 0 && (
          <p className="text-xs px-2 py-1 rounded" style={{ background: "#FEF9C3", color: "#92400E" }}>
            In preparazione — spuntabile dal magazziniere solo dopo la conferma
          </p>
        )}
        {righe.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--color-grey-mid)" }}>Nessun articolo ancora nella lista</p>
        ) : (
          <div className="space-y-2">
            {righe.map(r => (
              <div key={r.id} className="rounded-lg px-3 py-2 space-y-2" style={{ background: r.spuntataIl ? "#F0FDF4" : "#F5F2EE" }}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{r.descrizione}</span>
                    {r.codiceOs1 && <span className="text-xs ml-2 font-mono" style={{ color: "var(--color-grey-mid)" }}>{r.codiceOs1}</span>}
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{r.quantita}</span>
                  {r.spuntataIl ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#D1FAE5", color: "#065F46" }}>
                      ✓ {r.movimentoId ? "Scaricata" : "Spuntata"}
                    </span>
                  ) : bozza && (
                    <button onClick={() => rimuoviRiga(r.id)} className="text-gray-400 hover:text-gray-600 text-base leading-none px-1">×</button>
                  )}
                </div>

                {!r.spuntataIl && !!confermatoIl && !chiuso && puoSpuntare && !appenaConfermato && (
                  <div className="flex items-center gap-2 flex-wrap pl-1">
                    {r.articoloId ? (
                      <button
                        onClick={() => spunta(r.id, false)}
                        disabled={spuntando[r.id]}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold border disabled:opacity-60"
                        style={{ color: "#166534", background: "#F0FDF4", borderColor: "#86EFAC" }}
                      >
                        {spuntando[r.id] ? "…" : "✓ Spunta e scarica"}
                      </button>
                    ) : (
                      <>
                        <div className="min-w-[180px]">
                          <ArticoloAutocomplete
                            articoli={articoli}
                            value={collegamenti[r.id] ?? null}
                            onChange={(id) => setCollegamenti(prev => ({ ...prev, [r.id]: id }))}
                            placeholder="Collega articolo (opzionale)…"
                          />
                        </div>
                        <button
                          onClick={() => spunta(r.id, false)}
                          disabled={spuntando[r.id] || !collegamenti[r.id]}
                          className="text-xs px-3 py-1.5 rounded-lg font-semibold border disabled:opacity-60"
                          style={{ color: "#166534", background: "#F0FDF4", borderColor: "#86EFAC" }}
                        >
                          Spunta e scarica
                        </button>
                        <button
                          onClick={() => spunta(r.id, true)}
                          disabled={spuntando[r.id]}
                          className="text-xs px-3 py-1.5 rounded-lg font-semibold border disabled:opacity-60"
                          style={{ color: "var(--color-grey-mid)", background: "white", borderColor: "#d1d5db" }}
                        >
                          Spunta senza collegare
                        </button>
                      </>
                    )}
                    {erroreSpunta[r.id] && <p className="text-xs font-medium w-full" style={{ color: "#991B1B" }}>{erroreSpunta[r.id]}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {warningsSpunta.length > 0 && (
        <div className="rounded-lg px-4 py-3 space-y-1" style={{ background: "#FFFBEB", border: "1px solid #FCD34D" }}>
          <p className="text-xs font-semibold" style={{ color: "#92400E" }}>⚠</p>
          {warningsSpunta.map((w, i) => <p key={i} className="text-xs" style={{ color: "#92400E" }}>{w}</p>)}
        </div>
      )}

      {/* Conferma e notifica */}
      {confermatoIl ? (
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
      ) : !chiuso && (
        <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
          {confermaErrore && (
            <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
              <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{confermaErrore}</p>
            </div>
          )}
          <button
            onClick={conferma}
            disabled={confermaStato === "loading" || righe.length === 0}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-60"
            style={{ background: "#166534" }}
          >
            {confermaStato === "loading" ? "Conferma in corso…" : "✓ Conferma e notifica magazziniere"}
          </button>
        </div>
      )}

      {/* Chiudi */}
      {chiuso ? (
        <div className="rounded-xl border-2 p-4 flex items-center gap-3" style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}>
          <span className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: "#D1FAE5" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-sm" style={{ color: "#14532D" }}>Kit chiuso</p>
          </div>
        </div>
      ) : bozza ? (
        // In preparazione non ha senso "chiudere il Kit" (non è mai stato confermato) — solo
        // annullare la bozza (se vuota) o semplicemente uscire senza toccare nulla.
        <div className="space-y-2">
          {erroreAnnulla && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{erroreAnnulla}</p>}
          <div className="flex gap-2">
            {righe.length === 0 && (
              <button
                onClick={annullaBozza}
                disabled={annullando}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border disabled:opacity-60"
                style={{ borderColor: "#FCA5A5", color: "#DC2626", background: "white" }}
              >
                {annullando ? "Annullamento…" : "Annulla"}
              </button>
            )}
            <button
              onClick={() => router.push("/ferramenta/kit-commessa")}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold border"
              style={{ borderColor: "#d1d5db", color: "var(--color-grey-mid)", background: "white" }}
            >
              Chiudi
            </button>
          </div>
        </div>
      ) : appenaConfermato ? (
        <button
          onClick={() => router.push("/ferramenta/kit-commessa")}
          className="w-full py-2.5 rounded-lg text-sm font-semibold border"
          style={{ borderColor: "#d1d5db", color: "var(--color-grey-mid)", background: "white" }}
        >
          Torna ai Kit Commessa
        </button>
      ) : puoSpuntare && (
        <div className="space-y-2">
          {erroreChiudi && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{erroreChiudi}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/ferramenta/kit-commessa")}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold border"
              style={{ borderColor: "#d1d5db", color: "var(--color-grey-mid)", background: "white" }}
            >
              ← Indietro
            </button>
            <button
              onClick={chiudi}
              disabled={chiudendo}
              className="flex-[2] py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
              style={{ background: "#374151" }}
            >
              {chiudendo ? "Chiusura…" : daSpuntare > 0 ? `Chiudi kit (${daSpuntare} non spuntate)` : "Chiudi kit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
